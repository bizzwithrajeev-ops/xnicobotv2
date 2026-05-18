const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { models } = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlike')
        .setDescription('Remove the current song from your favorites'),

    async execute(interaction, lavalinkManager) {
        const player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player || !player.queue.current) {
            return interaction.reply({ components: [buildErrorResponse('No Player', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const track = player.queue.current;
        
        const existing = await models.FavoriteSong.findOne({ 
            userId: interaction.user.id, 
            url: track.info.uri 
        });
        
        if (!existing) {
            return interaction.reply({ components: [buildErrorResponse('Error', 'This song is not in your favorites!')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        
        await models.FavoriteSong.deleteOne({ 
            userId: interaction.user.id, 
            url: track.info.uri 
        });
        
        const container = new ContainerBuilder()
            .setAccentColor(0xED4245)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Dislike:1473038962762317834> Removed from Favorites\n\n` +
                    `**${track.info.title}**\n` +
                    `-# by ${track.info.author}`
                )
            );
        
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        if (!player || !player.queue.current) {
            return message.reply({ components: [buildErrorResponse('No Player', 'Nothing is playing!')], flags: MessageFlags.IsComponentsV2 });
        }

        const track = player.queue.current;
        
        const existing = await models.FavoriteSong.findOne({ 
            userId: message.author.id, 
            url: track.info.uri 
        });
        
        if (!existing) {
            return message.reply({ components: [buildErrorResponse('Error', 'This song is not in your favorites!')], flags: MessageFlags.IsComponentsV2 });
        }
        
        await models.FavoriteSong.deleteOne({ 
            userId: message.author.id, 
            url: track.info.uri 
        });
        
        const container = new ContainerBuilder()
            .setAccentColor(0xED4245)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Dislike:1473038962762317834> Removed from Favorites\n\n` +
                    `**${track.info.title}**\n` +
                    `-# by ${track.info.author}`
                )
            );
        
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
