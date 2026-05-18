const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');

module.exports = {
    prefix: 'shuffle',
    description: 'Shuffle the music queue',
    usage: 'shuffle',
    category: 'music',
    aliases: ['sh', 'mix'],
    
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Shuffle the music queue'),
    
    async execute(interaction, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(interaction.guild.id);
            if (!player) return interaction.reply({ components: [buildErrorResponse('No Player', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            if (!interaction.member.voice.channel) return interaction.reply({ components: [buildErrorResponse('Voice Required', 'You need to be in a voice channel.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

            if (player.queue.tracks.length < 2) {
                return interaction.reply({ components: [buildErrorResponse('Not Enough Tracks', 'Need at least 2 tracks to shuffle.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            player.queue.shuffle();

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Shuffle:1473039298751107213> Queue Shuffled\n\n**${player.queue.tracks.length}** tracks have been shuffled!`)
                );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Shuffle Error:', error);
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

            if (player.queue.tracks.length < 2) {
                return message.reply({ components: [buildErrorResponse('Error', 'Not enough tracks in queue to shuffle!')], flags: MessageFlags.IsComponentsV2 });
            }

            player.queue.shuffle();

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Shuffle:1473039298751107213> Queue Shuffled\n\n**${player.queue.tracks.length}** tracks have been shuffled!`)
                );

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Shuffle Error:', error);
            message.reply({ components: [buildErrorResponse('Error', `An error occurred: ${error.message || 'Unknown error'}`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }
};
