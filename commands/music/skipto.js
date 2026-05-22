const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { voiceErrorMessage } = require('../../utils/musicHelpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skipto')
        .setDescription('Skip to a specific track in the queue')
        .addIntegerOption(option =>
            option.setName('position')
                .setDescription('Position of the track to skip to')
                .setRequired(true)
                .setMinValue(1)),
    
    async execute(interaction, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(interaction.guild.id);
            if (!player) return interaction.reply({ components: [buildErrorResponse('No Player', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            { const __ve = voiceErrorMessage(interaction.member, lavalinkManager?.getPlayer?.(interaction.guild.id)); if (__ve) return interaction.reply({ components: [buildErrorResponse('Voice Required', __ve)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }); }

            const position = interaction.options.getInteger('position');

            if (position > player.queue.tracks.length) {
                return interaction.reply({ components: [buildErrorResponse('Invalid Position', `Queue has ${player.queue.tracks.length} tracks.`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const track = player.queue.tracks[position - 1];
            
            for (let i = 0; i < position - 1; i++) {
                player.queue.remove(0);
            }
            
            await player.skip();

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Skipnext:1473039269726785737> Skipped To Track\n\n**Now Playing:** ${track.info.title}\n**Position:** ${position}`)
                );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Skipto Error:', error);
            const msg = error.message || 'An unknown error occurred';
            if (interaction.replied || interaction.deferred) await interaction.followUp({ components: [buildErrorResponse('Error', msg)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
            else await interaction.reply({ components: [buildErrorResponse('Error', msg)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(message.guild.id);
            if (!player) return message.reply({ components: [buildErrorResponse('No Player', 'Nothing is playing!')], flags: MessageFlags.IsComponentsV2 });
            { const __ve = voiceErrorMessage(message.member, lavalinkManager?.getPlayer?.(message.guild.id)); if (__ve) return message.reply({ components: [buildErrorResponse('Voice Required', __ve)], flags: MessageFlags.IsComponentsV2 }); }

            const position = parseInt(args[0]);
            if (!position || position < 1) {
                return message.reply({ components: [buildErrorResponse('Missing Input', 'Please provide a valid position number!')], flags: MessageFlags.IsComponentsV2 });
            }

            if (position > player.queue.tracks.length) {
                return message.reply({ components: [buildErrorResponse('Invalid Input', `Invalid position! Queue has ${player.queue.tracks.length} tracks.`)], flags: MessageFlags.IsComponentsV2 });
            }

            const track = player.queue.tracks[position - 1];
            
            for (let i = 0; i < position - 1; i++) {
                player.queue.remove(0);
            }
            
            await player.skip();

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Skipnext:1473039269726785737> Skipped To Track\n\n**Now Playing:** ${track.info.title}\n**Position:** ${position}`)
                );

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Skipto Error:', error);
            message.reply({ components: [buildErrorResponse('Error', `An error occurred: ${error.message || 'Unknown error'}`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }
};
