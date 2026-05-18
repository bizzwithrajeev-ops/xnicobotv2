const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');

module.exports = {
    prefix: 'clearqueue',
    description: 'Clear all songs from the queue',
    usage: 'clearqueue',
    category: 'music',
    aliases: ['cq', 'clearq', 'emptyqueue'],
    
    data: new SlashCommandBuilder()
        .setName('clearqueue')
        .setDescription('Clear all songs from the queue (keeps current song playing)'),
    
    async execute(interaction, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(interaction.guild.id);
            if (!player) return interaction.reply({ components: [buildErrorResponse('No Player', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            if (!interaction.member.voice.channel) return interaction.reply({ components: [buildErrorResponse('Voice Required', 'You need to be in a voice channel.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

            if (player.queue.tracks.length === 0) {
                return interaction.reply({ components: [buildErrorResponse('Empty Queue', 'The queue is already empty.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const trackCount = player.queue.tracks.length;
            player.queue.tracks.splice(0, trackCount);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Trash:1473038090074591293> Queue Cleared\n\n**Removed:** ${trackCount} track${trackCount !== 1 ? 's' : ''}\n**Status:** Current song still playing`)
                );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Clearqueue Error:', error);
            const msg = error.message || 'An unknown error occurred';
            if (interaction.replied || interaction.deferred) await interaction.followUp({ components: [buildErrorResponse('Error', msg)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
            else await interaction.reply({ components: [buildErrorResponse('Error', msg)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(message.guild.id);
            if (!player) return message.reply({ components: [buildErrorResponse('No Player', 'Nothing is playing!')], flags: MessageFlags.IsComponentsV2 });
            if (!message.member.voice.channel) return message.reply({ components: [buildErrorResponse('Voice Required', 'You need to be in a voice channel!')], flags: MessageFlags.IsComponentsV2 });

            if (player.queue.tracks.length === 0) {
                return message.reply({ components: [buildErrorResponse('Empty Queue', 'Queue is already empty!')], flags: MessageFlags.IsComponentsV2 });
            }

            const trackCount = player.queue.tracks.length;
            player.queue.tracks.splice(0, trackCount);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Trash:1473038090074591293> Queue Cleared\n\n**Removed:** ${trackCount} track${trackCount !== 1 ? 's' : ''}\n**Status:** Current song still playing`)
                );

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Clearqueue Error:', error);
            message.reply({ components: [buildErrorResponse('Error', `An error occurred: ${error.message || 'Unknown error'}`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }
};
