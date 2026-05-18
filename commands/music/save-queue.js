const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { db } = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('save-queue')
        .setDescription('Save the current queue as a playlist')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Name for the playlist')
                .setRequired(true)
                .setMaxLength(50)),

    async execute(interaction, lavalinkManager) {
        const player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player || (!player.queue.current && player.queue.tracks.length === 0)) {
            return interaction.reply({ components: [buildErrorResponse('Error', 'Nothing in the queue to save!')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        
        const playlistName = interaction.options.getString('name').trim();
        const playlistKey = `playlist_${interaction.user.id}_${playlistName.toLowerCase().replace(/\s+/g, '_')}`;
        
        const existing = await db.get(playlistKey);
        if (existing) {
            return interaction.reply({ components: [buildErrorResponse('Error', 'A playlist with that name already exists! Choose a different name.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        
        const songs = [];
        if (player.queue.current) {
            songs.push({
                url: player.queue.current.info.uri,
                title: player.queue.current.info.title,
                author: player.queue.current.info.author,
                duration: player.queue.current.info.duration
            });
        }
        
        for (const track of player.queue.tracks) {
            songs.push({
                url: track.info.uri,
                title: track.info.title,
                author: track.info.author,
                duration: track.info.duration
            });
        }
        
        await db.set(playlistKey, {
            name: playlistName,
            userId: interaction.user.id,
            songs: songs,
            createdAt: new Date().toISOString()
        });
        
        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Save:1473038120030306386> Playlist Saved\n\n` +
                    `**${playlistName}**\n` +
                    `${songs.length} songs saved\n\n` +
                    `-# Use \`/load-playlist ${playlistName}\` to play it`
                )
            );
        
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        if (!player || (!player.queue.current && player.queue.tracks.length === 0)) {
            return message.reply({ components: [buildErrorResponse('Error', 'Nothing in the queue to save!')], flags: MessageFlags.IsComponentsV2 });
        }
        
        const playlistName = args.join(' ').trim();
        if (!playlistName) {
            return message.reply({ components: [buildErrorResponse('Missing Input', 'Please provide a name for the playlist!')], flags: MessageFlags.IsComponentsV2 });
        }
        
        if (playlistName.length > 50) {
            return message.reply({ components: [buildErrorResponse('Playlist Error', 'Playlist name is too long! Max 50 characters.')], flags: MessageFlags.IsComponentsV2 });
        }
        
        const playlistKey = `playlist_${message.author.id}_${playlistName.toLowerCase().replace(/\s+/g, '_')}`;
        
        const existing = await db.get(playlistKey);
        if (existing) {
            return message.reply({ components: [buildErrorResponse('Already Set', 'A playlist with that name already exists!')], flags: MessageFlags.IsComponentsV2 });
        }
        
        const songs = [];
        if (player.queue.current) {
            songs.push({
                url: player.queue.current.info.uri,
                title: player.queue.current.info.title,
                author: player.queue.current.info.author,
                duration: player.queue.current.info.duration
            });
        }
        
        for (const track of player.queue.tracks) {
            songs.push({
                url: track.info.uri,
                title: track.info.title,
                author: track.info.author,
                duration: track.info.duration
            });
        }
        
        await db.set(playlistKey, {
            name: playlistName,
            userId: message.author.id,
            songs: songs,
            createdAt: new Date().toISOString()
        });
        
        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Save:1473038120030306386> Playlist Saved\n\n` +
                    `**${playlistName}**\n` +
                    `${songs.length} songs saved\n\n` +
                    `-# Use \`load-playlist ${playlistName}\` to play it`
                )
            );
        
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
