const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');
const { EMOJIS, getPlatformInfo, truncateText } = require('../../utils/musicPanel');
const { formatTime, voiceErrorMessage } = require('../../utils/musicHelpers');
const jsonStore = require('../../utils/jsonStore');

const MAX_SKIP = 25;

async function performSkip(player, count = 1, guildId) {
    // Drop the next (count - 1) tracks before calling player.skip(),
    // which advances by 1.  count = 1 → skip current only.
    if (count > 1 && player.queue.tracks.length > 0) {
        const drop = Math.min(count - 1, player.queue.tracks.length);
        // Use the queue API where available so persistence hooks fire.
        if (typeof player.queue.splice === 'function') {
            player.queue.splice(0, drop);
        } else {
            player.queue.tracks.splice(0, drop);
        }
    }

    if (!player.queue || !player.queue.tracks?.length) {
        const shouldStay = readStay247(guildId);
        if (shouldStay && player.queue?.current) {
            try { await player.stopPlaying(); } catch {}
            return { kind: 'stay-247' };
        }
        try { await player.destroy(); } catch {}
        return { kind: 'left' };
    }

    const nextTrack = player.queue.tracks[0];
    await player.skip();
    return { kind: 'next', nextTrack };
}

function readStay247(guildId) {
    try {
        if (!jsonStore.has('musicpanel-247')) return false;
        const cfg = jsonStore.read('musicpanel-247');
        return !!cfg?.[guildId]?.enabled;
    } catch { return false; }
}

function buildResultContainer(result, count) {
    if (result.kind === 'stay-247') {
        return new ContainerBuilder()
            .setAccentColor(COLORS.SUCCESS)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# ${EMOJIS.next} Skipped\n\nNo more songs in queue.\n> <:Refresh:1473037911581528165> Bot staying in **24/7 mode**`
            ));
    }
    if (result.kind === 'left') {
        return new ContainerBuilder()
            .setAccentColor(COLORS.SUCCESS)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# ${EMOJIS.next} Skipped\n\nNo more songs in queue.\n> Left the voice channel`
            ));
    }
    const t = result.nextTrack;
    const platform = getPlatformInfo(t?.info?.sourceName);
    let content = `# ${EMOJIS.next} Skipped`;
    if (count > 1) content += ` ${count} tracks`;
    content += `\n\n### Now Playing\n${platform.icon} **${truncateText(t?.info?.title, 45)}**\n`;
    content += `-# by ${truncateText(t?.info?.author, 35)} • \`${formatTime(t?.info?.duration || 0)}\``;
    return new ContainerBuilder()
        .setAccentColor(COLORS.SUCCESS)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current song (or multiple)')
        .addIntegerOption(o => o.setName('count')
            .setDescription(`How many tracks to skip (1-${MAX_SKIP})`)
            .setMinValue(1).setMaxValue(MAX_SKIP).setRequired(false)),

    prefix: 'skip',
    description: 'Skip the current song or multiple',
    usage: 'skip [count]',
    category: 'music',
    aliases: ['s', 'next'],

    async execute(interaction, lavalinkManager) {
        const player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player) {
            return interaction.reply({ components: [buildErrorResponse('No Music Playing', 'There is no music currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        const voiceErr = voiceErrorMessage(interaction.member, player);
        if (voiceErr) {
            return interaction.reply({ components: [buildErrorResponse('Voice Required', voiceErr)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        try {
            const count = interaction.options.getInteger('count') || 1;
            const result = await performSkip(player, count, interaction.guild.id);
            return interaction.reply({ components: [buildResultContainer(result, count)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Skip command error:', error);
            const container = buildErrorResponse('Skip Failed', 'An error occurred while skipping.', error.message);
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
            }
            return interaction.followUp({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        if (!player) {
            return message.reply({ components: [buildErrorResponse('No Music Playing', 'There is no music currently playing.')], flags: MessageFlags.IsComponentsV2 });
        }
        const voiceErr = voiceErrorMessage(message.member, player);
        if (voiceErr) {
            return message.reply({ components: [buildErrorResponse('Voice Required', voiceErr)], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            let count = parseInt(args[0]);
            if (!Number.isFinite(count) || count < 1) count = 1;
            count = Math.min(count, MAX_SKIP);
            const result = await performSkip(player, count, message.guild.id);
            return message.reply({ components: [buildResultContainer(result, count)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Skip command error:', error);
            return message.reply({ components: [buildErrorResponse('Skip Failed', 'An error occurred while skipping.', error.message)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }
};
