/**
 * /vcstatus — Set or clear the Voice Channel Status line.
 *
 * Supports two modes:
 *   - Temporary: status is set once, Discord clears it when VC empties
 *   - Permanent: bot re-applies the status automatically whenever
 *     Discord clears it (voiceStateUpdate listener in index.js)
 *
 * Permanent statuses are stored in jsonStore('vcstatus-persist') as:
 *   { [channelId]: { status, setBy, guildId } }
 */

'use strict';

const {
    SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType,
    ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder,
    ButtonStyle, SeparatorBuilder, SeparatorSpacingSize
} = require('discord.js');
const {
    buildErrorResponse, buildSuccessResponse, buildInvalidUsage
} = require('../../utils/responseBuilder');
const jsonStore = require('../../utils/jsonStore');

const MAX_STATUS_LENGTH = 500;
const STORE_NAME = 'vcstatus-persist';

// Permission check
const SET_VOICE_CHANNEL_STATUS_BIT =
    PermissionFlagsBits.SetVoiceChannelStatus ?? (1n << 48n);

function hasPermission(member) {
    if (!member?.permissions) return false;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    try { if (member.permissions.has(SET_VOICE_CHANNEL_STATUS_BIT)) return true; } catch {}
    return member.permissions.has(PermissionFlagsBits.ManageChannels);
}

function isVoiceLike(channel) {
    return channel && (
        channel.type === ChannelType.GuildVoice ||
        channel.type === ChannelType.GuildStageVoice
    );
}

// ── Persistence helpers ──────────────────────────────────────────────────

function loadPersist() {
    return jsonStore.peek(STORE_NAME) || {};
}

function savePersistEntry(channelId, entry) {
    const data = jsonStore.read(STORE_NAME) || {};
    if (entry === null) {
        delete data[channelId];
    } else {
        data[channelId] = entry;
    }
    jsonStore.write(STORE_NAME, data);
}

/**
 * Apply the status via Discord REST API.
 */
async function applyStatus(client, channelId, status) {
    await client.rest.put(`/channels/${channelId}/voice-status`, {
        body: { status: status === null ? null : String(status).slice(0, MAX_STATUS_LENGTH) }
    });
}

/**
 * Re-apply all permanent statuses. Called from voiceStateUpdate
 * when a channel becomes empty and Discord clears the status.
 */
async function reapplyPersistentStatus(client, channelId) {
    const persist = loadPersist();
    const entry = persist[channelId];
    if (!entry?.status) return;
    try {
        await applyStatus(client, channelId, entry.status);
    } catch {
        // Channel deleted or bot lost permissions — clean up
        savePersistEntry(channelId, null);
    }
}

// ── Command logic ────────────────────────────────────────────────────────

async function runStatusUpdate(ctx) {
    const { member, channel, statusText, permanent, username, reply, client } = ctx;

    if (!hasPermission(member)) {
        return reply({
            components: [buildErrorResponse(
                'Missing Permission',
                'You need **Set Voice Channel Status** or **Manage Channels** permission.'
            )],
            flags: MessageFlags.IsComponentsV2
        });
    }

    if (!isVoiceLike(channel)) {
        return reply({
            components: [buildErrorResponse(
                'No Voice Channel',
                'Mention a voice channel or join one before running this command.'
            )],
            flags: MessageFlags.IsComponentsV2
        });
    }

    const clearing = statusText === null
        || statusText === ''
        || /^clear$/i.test(String(statusText).trim());

    try {
        await applyStatus(client, channel.id, clearing ? null : statusText);

        // Handle persistence
        if (clearing) {
            savePersistEntry(channel.id, null);
        } else if (permanent) {
            savePersistEntry(channel.id, {
                status: statusText.slice(0, MAX_STATUS_LENGTH),
                setBy: member.id,
                guildId: member.guild.id
            });
        } else {
            // Temporary — remove any existing persistence
            savePersistEntry(channel.id, null);
        }

        const modeText = clearing ? '' : (permanent ? '`Permanent` — stays even when VC is empty' : '`Temporary` — clears when VC empties');

        const container = buildSuccessResponse(
            clearing ? 'Status Cleared' : 'Status Updated',
            clearing
                ? `Cleared the status of **${channel.name}**.`
                : `Updated the status of **${channel.name}**.`,
            {
                'Channel': `<#${channel.id}>`,
                'Status': clearing ? 'None' : statusText.slice(0, 100),
                'Mode': modeText || 'Cleared',
                'Set By': username
            }
        );
        container.setAccentColor(clearing ? 0xCAD7E6 : 0x57F287);
        return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (err) {
        const reason = err?.rawError?.message || err?.message || 'Unknown error';
        return reply({
            components: [buildErrorResponse('Failed', `Could not update voice status: ${reason}`)],
            flags: MessageFlags.IsComponentsV2
        });
    }
}

module.exports = {
    name: 'vcstatus',
    prefix: 'vcstatus',
    description: 'Set or clear the status of a voice channel (permanent or temporary)',
    usage: 'vcstatus <status text|clear> [#channel]',
    category: 'voice',
    aliases: ['voicestatus', 'setstatus'],
    permissions: ['SetVoiceChannelStatus'],

    data: new SlashCommandBuilder()
        .setName('vcstatus')
        .setDescription('Set or clear the status of a voice channel')
        .addStringOption(o => o
            .setName('status')
            .setDescription('Status text (or "clear" to remove)')
            .setMaxLength(MAX_STATUS_LENGTH)
            .setRequired(true))
        .addStringOption(o => o
            .setName('mode')
            .setDescription('Permanent stays when VC empties, Temporary clears automatically')
            .addChoices(
                { name: '🔒 Permanent — stays always', value: 'permanent' },
                { name: '⏱️ Temporary — clears when empty', value: 'temporary' }
            )
            .setRequired(false))
        .addChannelOption(o => o
            .setName('channel')
            .setDescription('Voice channel (defaults to your current VC)')
            .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
            .setRequired(false)),

    async execute(interaction) {
        const status = interaction.options.getString('status');
        const mode = interaction.options.getString('mode') || 'permanent';
        const channel = interaction.options.getChannel('channel') || interaction.member?.voice?.channel || null;

        return runStatusUpdate({
            member: interaction.member,
            channel,
            statusText: status,
            permanent: mode === 'permanent',
            username: interaction.user.username,
            reply: (opts) => interaction.reply(opts),
            client: interaction.client
        });
    },

    async executePrefix(message, args) {
        if (!args.length) {
            // Show current persistent statuses for this guild
            const persist = loadPersist();
            const guildEntries = Object.entries(persist).filter(([, e]) => e.guildId === message.guild.id);

            if (guildEntries.length === 0) {
                return message.reply({
                    components: [buildInvalidUsage(
                        'vcstatus',
                        'vcstatus <status|clear> [--perm|--temp] [#channel]',
                        [
                            'vcstatus 🎵 Music Session',
                            'vcstatus 🎮 Gaming --perm',
                            'vcstatus clear #voice-chat',
                            'vcstatus Playing Games --temp'
                        ]
                    )],
                    flags: MessageFlags.IsComponentsV2
                });
            }

            let listText = `# <:Volumeup:1473039290136002844> Active Voice Statuses\n\n`;
            for (const [chId, entry] of guildEntries) {
                listText += `> <#${chId}> — \`${entry.status}\`\n`;
            }
            listText += `\n-# These are permanent statuses. Use \`vcstatus clear #channel\` to remove.`;

            const container = new ContainerBuilder()
                .setAccentColor(0x5865F2)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(listText));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // Parse --perm / --temp flags
        let permanent = true; // default to permanent
        const filteredArgs = args.filter(a => {
            if (a === '--temp' || a === '--temporary' || a === '-t') { permanent = false; return false; }
            if (a === '--perm' || a === '--permanent' || a === '-p') { permanent = true; return false; }
            return true;
        });

        // Resolve channel
        const mentioned = message.mentions.channels.first();
        let channel, statusText;

        if (mentioned && isVoiceLike(mentioned)) {
            channel = mentioned;
            statusText = filteredArgs.filter(a => !/^<#\d+>$/.test(a)).join(' ').trim();
        } else {
            channel = message.member?.voice?.channel || null;
            statusText = filteredArgs.join(' ').trim();
        }

        return runStatusUpdate({
            member: message.member,
            channel,
            statusText,
            permanent,
            username: message.author.username,
            reply: (opts) => message.reply(opts),
            client: message.client
        });
    },

    // Exported for use in voiceStateUpdate handler
    reapplyPersistentStatus,
    applyStatus
};
