const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { db } = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete-playlist')
        .setDescription('Delete a saved playlist')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Name of the playlist to delete')
                .setRequired(true)
                .setAutocomplete(true)),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const allKeys = await db.list(`playlist_${interaction.user.id}_`);
        
        const playlists = [];
        for (const key of allKeys) {
            const playlist = await db.get(key);
            if (playlist && playlist.name.toLowerCase().includes(focusedValue)) {
                playlists.push({ name: playlist.name, value: playlist.name });
            }
        }
        
        await interaction.respond(playlists.slice(0, 25));
    },

    async execute(interaction) {
        const playlistName = interaction.options.getString('name').trim();
        const playlistKey = `playlist_${interaction.user.id}_${playlistName.toLowerCase().replace(/\s+/g, '_')}`;
        
        const playlist = await db.get(playlistKey);
        if (!playlist) {
            return interaction.reply({ components: [buildErrorResponse('Error', 'Playlist not found!')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        
        await db.delete(playlistKey);
        
        const container = new ContainerBuilder()
            .setAccentColor(0xED4245)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Trash:1473038090074591293> Playlist Deleted\n\n` +
                    `**${playlist.name}** has been deleted.\n` +
                    `-# ${playlist.songs.length} songs removed`
                )
            );
        
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        const playlistName = args.join(' ').trim();
        if (!playlistName) {
            return message.reply({ components: [buildErrorResponse('Missing Input', 'Please provide the playlist name to delete!')], flags: MessageFlags.IsComponentsV2 });
        }
        
        const playlistKey = `playlist_${message.author.id}_${playlistName.toLowerCase().replace(/\s+/g, '_')}`;
        
        const playlist = await db.get(playlistKey);
        if (!playlist) {
            return message.reply({ components: [buildErrorResponse('Not Found', 'Playlist not found!')], flags: MessageFlags.IsComponentsV2 });
        }
        
        await db.delete(playlistKey);
        
        const container = new ContainerBuilder()
            .setAccentColor(0xED4245)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Trash:1473038090074591293> Playlist Deleted\n\n` +
                    `**${playlist.name}** has been deleted.\n` +
                    `-# ${playlist.songs.length} songs removed`
                )
            );
        
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
