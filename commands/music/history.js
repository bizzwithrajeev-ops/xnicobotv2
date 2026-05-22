const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { formatTime } = require('../../utils/musicHelpers');
const { getPlatformInfo, truncateText } = require('../../utils/musicPanel');

function buildHistoryContainer(history) {
    // queue.previous is appended on each track end — most-recent is the LAST element.
    const recent = history.slice().reverse().slice(0, 10);
    const lines = recent.map((track, i) => {
        const platform = getPlatformInfo(track.info?.sourceName);
        const title = truncateText(track.info?.title || 'Unknown', 45);
        return `\`${(i + 1).toString().padStart(2, ' ')}.\` ${platform.icon} **${title}**\n-# by ${truncateText(track.info?.author || 'Unknown', 30)} • \`${formatTime(track.info?.duration || 0)}\``;
    }).join('\n\n');

    return new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# <:History:1473037847568318605> Recent Plays\n\n${lines}\n\n-# Showing ${recent.length} most recent of ${history.length} played`
        )
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription('Show recently played tracks (newest first)'),

    prefix: 'history',
    description: 'Show recently played tracks',
    usage: 'history',
    category: 'music',
    aliases: ['hist', 'recent'],

    async execute(interaction, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(interaction.guild.id);
            if (!player) return interaction.reply({ components: [buildErrorResponse('No Player', 'No active music player.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

            const history = player.queue.previous || [];
            if (!history.length) {
                return interaction.reply({ components: [buildErrorResponse('No History', 'No tracks have been played yet.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            return interaction.reply({ components: [buildHistoryContainer(history)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('History Error:', error);
            const reply = { components: [buildErrorResponse('History Error', error.message || 'Unknown error')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
            if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
            else await interaction.reply(reply).catch(() => {});
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(message.guild.id);
            if (!player) return message.reply({ components: [buildErrorResponse('No Player', 'No active music player.')], flags: MessageFlags.IsComponentsV2 });

            const history = player.queue.previous || [];
            if (!history.length) {
                return message.reply({ components: [buildErrorResponse('No History', 'No tracks have been played yet.')], flags: MessageFlags.IsComponentsV2 });
            }
            return message.reply({ components: [buildHistoryContainer(history)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('History Error:', error);
            return message.reply({ components: [buildErrorResponse('History Error', error.message || 'Unknown error')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }
};
