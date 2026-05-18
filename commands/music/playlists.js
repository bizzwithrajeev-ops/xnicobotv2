const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { db } = require('../../utils/database');
const { formatTime } = require('../../utils/helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('playlists')
        .setDescription('View your saved playlists'),

    async execute(interaction) {
        try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const allKeys = await db.list(`playlist_${interaction.user.id}_`);
        
        if (allKeys.length === 0) {
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Folderopen:1473039552783323348> Your Playlists\n\n` +
                        `You don't have any saved playlists!\n\n` +
                        `-# Use \`/save-queue <name>\` to save the current queue as a playlist`
                    )
                );
            return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        let content = `# <:Folderopen:1473039552783323348> Your Playlists\n\n`;
        
        for (let i = 0; i < allKeys.length; i++) {
            const playlist = await db.get(allKeys[i]);
            if (playlist) {
                const totalDuration = playlist.songs.reduce((acc, s) => acc + (s.duration || 0), 0);
                content += `**${i + 1}. ${playlist.name}**\n`;
                content += `-# ${playlist.songs.length} songs • ${formatTime(totalDuration)}\n\n`;
            }
        }
        
        content += `-# Use \`/load-playlist <name>\` to play a playlist`;
        
        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
        
        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[Playlists] Error:', error);
            const msg = '<:Cancel:1473037949187657818> An error occurred while loading playlists.';
            if (interaction.deferred || interaction.replied) await interaction.editReply(msg).catch(() => {});
            else await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    },

    async executePrefix(message) {
        const allKeys = await db.list(`playlist_${message.author.id}_`);
        
        if (allKeys.length === 0) {
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Folderopen:1473039552783323348> Your Playlists\n\n` +
                        `You don't have any saved playlists!\n\n` +
                        `-# Use \`save-queue <name>\` to save the current queue as a playlist`
                    )
                );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        let content = `# <:Folderopen:1473039552783323348> Your Playlists\n\n`;
        
        for (let i = 0; i < allKeys.length; i++) {
            const playlist = await db.get(allKeys[i]);
            if (playlist) {
                const totalDuration = playlist.songs.reduce((acc, s) => acc + (s.duration || 0), 0);
                content += `**${i + 1}. ${playlist.name}**\n`;
                content += `-# ${playlist.songs.length} songs • ${formatTime(totalDuration)}\n\n`;
            }
        }
        
        content += `-# Use \`load-playlist <name>\` to play a playlist`;
        
        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
        
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
