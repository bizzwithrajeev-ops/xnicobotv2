const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { buildNowPlayingContainer } = require('../../utils/musicPanel');
const { buildErrorResponse } = require('../../utils/responseBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show the currently playing song with full music controls'),

    prefix: 'nowplaying',
    description: 'Show the currently playing song with controls',
    usage: 'nowplaying',
    category: 'music',
    aliases: ['np', 'current', 'playing'],

    async execute(interaction, lavalinkManager) {
        const player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player || !player.queue.current) {
            const container = buildErrorResponse('No Music Playing', 'There is no music currently playing.');
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const container = buildNowPlayingContainer(player, interaction.client.autoplayStatus || new Map());
        
        if (!container) {
            const errorContainer = buildErrorResponse('Load Failed', 'Failed to load now playing information.');
            return interaction.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        if (!player || !player.queue.current) {
            const container = buildErrorResponse('No Music Playing', 'There is no music currently playing.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const container = buildNowPlayingContainer(player, message.client.autoplayStatus || new Map());
        
        if (!container) {
            const errorContainer = buildErrorResponse('Load Failed', 'Failed to load now playing information.');
            return message.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
