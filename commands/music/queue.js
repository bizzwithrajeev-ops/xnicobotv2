const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { buildQueueContainer } = require('../../utils/musicPanel');
const { buildErrorResponse } = require('../../utils/responseBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Display the current music queue')
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('Page number')
                .setRequired(false)
                .setMinValue(1)),
    
    prefix: 'queue',
    description: 'Display the current music queue',
    usage: 'queue [page]',
    category: 'music',
    aliases: ['q'],
    
    async execute(interaction, lavalinkManager) {
        const player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player || !player.queue || !player.queue.current) {
            const container = buildErrorResponse('No Music Playing', 'There is no music currently playing.');
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const page = (interaction.options?.getInteger('page') || 1) - 1;
        const container = buildQueueContainer(player, page);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        if (!player || !player.queue || !player.queue.current) {
            const container = buildErrorResponse('No Music Playing', 'There is no music currently playing.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const page = (parseInt(args[0]) || 1) - 1;
        const container = buildQueueContainer(player, page);
        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
