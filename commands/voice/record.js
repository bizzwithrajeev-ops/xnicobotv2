const {
    ChannelType,
    PermissionFlagsBits,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SlashCommandBuilder
} = require('discord.js');
const {
    DEFAULT_MAX_MINUTES,
    RECORDING_MODES,
    formatRecordingStatus,
    getRecording,
    recordingAudioPayload,
    recordingSummaryPayload,
    startRecording,
    stopRecording,
} = require('../../utils/recordings');
const {
    componentPayload,
    getUser,
    sendError,
} = require('../../utils/hybrid');
const {
    parsePositiveInt,
    requireGuild,
    requireUserPermission,
} = require('../../utils/moderationChecks');
const { buildErrorResponse, buildSuccessResponse, BRANDING } = require('../../utils/responseBuilder');

const MAX_RECORDING_MINUTES = 180;

module.exports = {
    name: 'record',
    prefix: 'record',
    description: 'Record a voice channel',
    usage: 'record <start|stop|status> [options]',
    category: 'voice',
    aliases: ['rec', 'voicerecord'],
    permissions: ['ManageGuild'],
    data: new SlashCommandBuilder()
        .setName('record')
        .setDescription('Record a voice channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('start')
                .setDescription('Start recording your current voice channel')
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('Voice channel to record. Defaults to your current channel.')
                        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
                )
                .addIntegerOption((option) =>
                    option
                        .setName('minutes')
                        .setDescription('Auto-stop after this many minutes.')
                        .setMinValue(1)
                        .setMaxValue(MAX_RECORDING_MINUTES)
                )
                .addStringOption((option) =>
                    option
                        .setName('mode')
                        .setDescription('Choose one mixed file or separate speaker tracks.')
                        .addChoices(
                            { name: 'Global mix', value: RECORDING_MODES.GLOBAL },
                            { name: 'Separate tracks', value: RECORDING_MODES.SEPARATE }
                        )
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('stop')
                .setDescription('Stop the active recording and upload tracks')
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('status')
                .setDescription('Show the active recording status')
        ),

    async executePrefix(message, args) {
        await runRecord(message, message.client, (args[0] || 'status').toLowerCase(), true);
    },

    async execute(interaction) {
        await runRecord(interaction, interaction.client, interaction.options.getSubcommand(), false);
    }
};

async function runRecord(target, client, subcommand, isPrefix) {
    const blocked = requireGuild(target)
        || requireUserPermission(target, PermissionFlagsBits.ManageGuild, 'Manage Server');

    if (blocked) {
        if (isPrefix) {
            const container = buildErrorResponse('Permission Required', blocked);
            return target.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        return sendError(target, blocked);
    }

    if (['start', 'join', 'begin'].includes(subcommand)) {
        return startRecordCommand(target, client, isPrefix);
    }

    if (['stop', 'leave', 'end'].includes(subcommand)) {
        return stopRecordCommand(target, isPrefix);
    }

    if (['status', 'info'].includes(subcommand)) {
        const guild = target.message?.guild || target.guild;
        const statusMessage = formatRecordingStatus(getRecording(guild.id));
        
        if (isPrefix) {
            const container = new ContainerBuilder()
                .setTitle('Recording Status')
                .setDescription(statusMessage)
                .setAccentColor(0xBCF1E4);
            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
            
            return target.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        return respond(target, componentPayload('Recording Status', statusMessage), isPrefix);
    }

    const errorMsg = 'Use `record start`, `record stop`, or `record status`.';
    if (isPrefix) {
        const container = buildErrorResponse('Invalid Subcommand', errorMsg);
        return target.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
    return sendError(target, errorMsg);
}

async function startRecordCommand(target, client, isPrefix) {
    const guild = target.message?.guild || target.guild;
    const actor = getUser(target);
    const voiceChannel = getVoiceChannelOption(target, isPrefix);
    const maxMinutes = getMinutesOption(target, isPrefix);
    const mode = getModeOption(target, isPrefix);

    const result = await startRecording({
        actor,
        client,
        guild,
        maxMinutes,
        mode,
        textChannel: getCurrentChannel(target),
        voiceChannel,
    });

    if (isPrefix) {
        const container = result.ok
            ? buildSuccessResponse('Recording Started', result.message)
            : buildErrorResponse('Recording Blocked', result.message);
        
        container.setAccentColor(result.ok ? 0x57F287 : 0xED4245);
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
        
        return target.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    return respond(target, componentPayload(
        result.ok ? 'Recording started' : 'Recording blocked',
        result.message,
        !result.ok && !target.message,
    ), isPrefix);
}

async function stopRecordCommand(target, isPrefix) {
    if (!isPrefix) {
        await deferIfNeeded(target);
    }

    const guild = target.message?.guild || target.guild;
    const result = await stopRecording(guild.id, { reason: 'manual stop' });

    if (!result.ok) {
        if (isPrefix) {
            const container = buildErrorResponse('Recording Status', result.message);
            return target.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        return respond(target, componentPayload('Recording status', result.message, !target.message), isPrefix);
    }

    return sendRecordingResult(target, result, isPrefix);
}

function getVoiceChannelOption(target, isPrefix) {
    if (!isPrefix) {
        return target.options?.getChannel('channel')
            || target.member?.voice?.channel
            || null;
    }

    // Prefix command parsing
    const args = target.content?.split(' ').slice(1) || [];
    const explicit = args
        .slice(1)
        .map((arg) => resolveVoiceChannel(target, arg))
        .find(Boolean);

    return explicit || target.member?.voice?.channel || null;
}

function getMinutesOption(target, isPrefix) {
    if (!isPrefix) {
        return target.options?.getInteger('minutes') || DEFAULT_MAX_MINUTES;
    }

    const args = target.content?.split(' ').slice(1) || [];
    const raw = args.slice(1).find((arg) => /^\d+$/.test(arg));
    return parsePositiveInt(raw, DEFAULT_MAX_MINUTES, 1, MAX_RECORDING_MINUTES);
}

function getModeOption(target, isPrefix) {
    if (!isPrefix) {
        return target.options?.getString('mode') || RECORDING_MODES.SEPARATE;
    }

    const args = target.content?.split(' ').slice(1) || [];
    const values = args.slice(1).map((arg) => arg.toLowerCase());
    if (values.some((value) => ['global', 'mix', 'mixed', 'single', 'one'].includes(value))) {
        return RECORDING_MODES.GLOBAL;
    }

    return RECORDING_MODES.SEPARATE;
}

function resolveVoiceChannel(target, input) {
    if (!input) return null;

    const id = input.match(/^<#(\d{17,20})>$/)?.[1] || (/^\d{17,20}$/.test(input) ? input : null);
    if (id) {
        const channel = target.guild.channels.cache.get(id);
        return channel?.isVoiceBased?.() ? channel : null;
    }

    const name = input.replace(/^#/, '').toLowerCase();
    return target.guild.channels.cache.find((channel) =>
        channel.isVoiceBased?.()
        && [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)
        && channel.name.toLowerCase() === name
    ) || null;
}

function getCurrentChannel(target) {
    return target.message?.channel || target.channel;
}

async function deferIfNeeded(target) {
    if (target.message || target.deferred || target.replied) return;
    await target.deferReply().catch(() => null);
}

async function respond(target, payload, isPrefix) {
    if (target.message) return target.reply(payload);
    if (target.deferred) return target.editReply(payload);
    if (target.replied) return target.followUp(payload);
    return target.reply(payload);
}

async function sendRecordingResult(target, result, isPrefix) {
    if (isPrefix) {
        // Send summary in bot's container format
        const { omitted, uploadable } = getUploadPlan(result);
        const lines = [
            result.session?.mode ? `Mode: **${result.session.mode === RECORDING_MODES.GLOBAL ? 'global mix' : 'separate tracks'}**` : null,
            `Reason: **${result.reason || 'manual stop'}**`,
            result.durationMs ? `Duration: **${formatDuration(result.durationMs)}**` : null,
            `Tracks recorded: **${result.files?.length || 0}**`,
            uploadable.length ? `Playable tracks: **${uploadable.length}** - posted below` : null,
            omitted.length ? `Not uploaded: **${omitted.length}** track(s) were too large or over the attachment limit.` : null,
            result.files?.length ? '' : 'No voice was captured. Someone needs to speak after recording starts.',
        ].filter((line) => line !== null);

        const container = buildSuccessResponse('Recording Stopped', lines.join('\n'));
        container.setAccentColor(0x57F287);
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

        await target.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        // Send audio files if available
        const audioPayload = recordingAudioPayload(result);
        if (audioPayload) {
            await target.channel.send(audioPayload).catch((error) => {
                console.warn('[Record] Could not send audio files:', error?.message || error);
            });
        }

        return;
    }

    await respond(target, recordingSummaryPayload(result), isPrefix);

    const audioPayload = recordingAudioPayload(result);
    if (!audioPayload) return null;

    if (target.message) return target.channel.send(audioPayload);
    return target.followUp(audioPayload);
}

function getUploadPlan(result) {
    const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
    const MAX_UPLOAD_FILES = 10;
    const uploadable = [];
    const omitted = [];
    let uploadBytes = 0;

    for (const file of result.files || []) {
        const nextBytes = uploadBytes + file.size;
        if (
            uploadable.length < MAX_UPLOAD_FILES
            && file.size <= MAX_UPLOAD_BYTES
            && nextBytes <= MAX_UPLOAD_BYTES
        ) {
            uploadable.push(file);
            uploadBytes = nextBytes;
        } else {
            omitted.push(file);
        }
    }

    return { omitted, uploadable };
}

function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
