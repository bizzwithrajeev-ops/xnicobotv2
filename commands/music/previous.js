const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { formatTime } = require('../../utils/helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('previous')
        .setDescription('Play the previous track'),
    
    async execute(interaction, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(interaction.guild.id);
            if (!player) return interaction.reply({ components: [buildErrorResponse('No Player', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            if (!interaction.member.voice.channel) return interaction.reply({ components: [buildErrorResponse('Voice Required', 'You need to be in a voice channel.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

            const previousTrack = player.queue.previous[0];
            
            if (!previousTrack) {
                return interaction.reply({ components: [buildErrorResponse('No History', 'No previous track available.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            await player.queue.add(previousTrack, 0);
            await player.skip();

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Skipprev:1473039272193032402> Playing Previous\n\n**${previousTrack.info.title}**\nDuration: ${formatTime(previousTrack.info.duration)}`)
                );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Previous Error:', error);
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

            const previousTrack = player.queue.previous[0];
            
            if (!previousTrack) {
                return message.reply({ components: [buildErrorResponse('No History', 'No previous track available!')], flags: MessageFlags.IsComponentsV2 });
            }

            await player.queue.add(previousTrack, 0);
            await player.skip();

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Skipprev:1473039272193032402> Playing Previous\n\n**${previousTrack.info.title}**\nDuration: ${formatTime(previousTrack.info.duration)}`)
                );

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Previous Error:', error);
            message.reply({ components: [buildErrorResponse('Error', `An error occurred: ${error.message || 'Unknown error'}`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }
};
