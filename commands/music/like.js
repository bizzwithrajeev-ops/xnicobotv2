const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { models } = require('../../utils/database');
const { formatTime } = require('../../utils/helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('like')
        .setDescription('Add the current song to your favorites'),

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
        
        if (existing) {
            return interaction.reply({ components: [buildErrorResponse('Error', 'This song is already in your favorites!')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        
        await models.FavoriteSong.create({
            userId: interaction.user.id,
            url: track.info.uri,
            title: track.info.title,
            author: track.info.author,
            duration: track.info.duration,
            artworkUrl: track.info.artworkUrl || track.info.thumbnail,
            sourceName: track.info.sourceName,
            addedAt: new Date().toISOString()
        });
        
        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6);
        
        if (track.info.artworkUrl) {
            container.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Heartalt:1473038488893526016> Added to Favorites`))
                    .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: track.info.artworkUrl } }))
            );
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        }
        
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                (track.info.artworkUrl ? '' : `# <:Heartalt:1473038488893526016> Added to Favorites\n\n`) +
                `**${track.info.title}**\n` +
                `-# by ${track.info.author} • ${formatTime(track.info.duration)}\n\n` +
                `-# Use \`/favorites\` to view your saved songs`
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
        
        if (existing) {
            return message.reply({ components: [buildErrorResponse('Already Set', 'This song is already in your favorites!')], flags: MessageFlags.IsComponentsV2 });
        }
        
        await models.FavoriteSong.create({
            userId: message.author.id,
            url: track.info.uri,
            title: track.info.title,
            author: track.info.author,
            duration: track.info.duration,
            artworkUrl: track.info.artworkUrl || track.info.thumbnail,
            sourceName: track.info.sourceName,
            addedAt: new Date().toISOString()
        });
        
        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6);
        
        if (track.info.artworkUrl) {
            container.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Heartalt:1473038488893526016> Added to Favorites`))
                    .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: track.info.artworkUrl } }))
            );
            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        }
        
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                (track.info.artworkUrl ? '' : `# <:Heartalt:1473038488893526016> Added to Favorites\n\n`) +
                `**${track.info.title}**\n` +
                `-# by ${track.info.author} • ${formatTime(track.info.duration)}\n\n` +
                `-# Use \`favorites\` to view your saved songs`
            )
        );
        
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
