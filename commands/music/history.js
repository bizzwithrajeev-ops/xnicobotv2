const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { formatTime } = require('../../utils/helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription('Show recently played tracks'),
    
    async execute(interaction, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(interaction.guild.id);
            
            if (!player) {
                return interaction.reply({ components: [buildErrorResponse('No Player', 'No music player active.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const history = player.queue.previous;

            if (!history || history.length === 0) {
                return interaction.reply({ components: [buildErrorResponse('No History', 'No track history available.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const historyList = history.slice(0, 10).map((track, index) => 
                `**${index + 1}.** ${track.info.title}\n` +
                `     Artist: ${track.info.author} | Duration: ${formatTime(track.info.duration)}`
            ).join('\n\n');

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:queue:1479349681049043096> Track History\n\n${historyList}\n\n**Total:** ${history.length} track(s) played`)
                );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('History Error:', error);
            const msg = error.message || 'An unknown error occurred';
            if (interaction.replied || interaction.deferred) await interaction.followUp({ components: [buildErrorResponse('Error', msg)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
            else await interaction.reply({ components: [buildErrorResponse('Error', msg)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(message.guild.id);
            
            if (!player) {
                return message.reply({ components: [buildErrorResponse('Error', 'No music player active!')], flags: MessageFlags.IsComponentsV2 });
            }

            const history = player.queue.previous;

            if (!history || history.length === 0) {
                return message.reply({ components: [buildErrorResponse('Error', 'No track history available!')], flags: MessageFlags.IsComponentsV2 });
            }

            const historyList = history.slice(0, 10).map((track, index) => 
                `**${index + 1}.** ${track.info.title}\n` +
                `     Artist: ${track.info.author} | Duration: ${formatTime(track.info.duration)}`
            ).join('\n\n');

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:queue:1479349681049043096> Track History\n\n${historyList}\n\n**Total:** ${history.length} track(s) played`)
                );

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('History Error:', error);
            message.reply({ components: [buildErrorResponse('Error', `An error occurred: ${error.message || 'Unknown error'}`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }
};
