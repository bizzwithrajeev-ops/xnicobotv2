
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');

module.exports = {
    prefix: 'lyrics',
    description: 'Get lyrics for the current song',
    usage: 'lyrics [song]',
    category: 'music',
    aliases: ['ly', 'words', 'lyricssearch'],
    
    data: new SlashCommandBuilder()
        .setName('lyrics')
        .setDescription('Get lyrics for the current song or search')
        .addStringOption(option =>
            option.setName('song')
                .setDescription('Song name to search (optional, uses current song if not provided)')
                .setRequired(false)),
    
    async execute(interaction, lavalinkManager) {
        const player = lavalinkManager.getPlayer(interaction.guild.id);
        const songQuery = interaction.options.getString('song');

        if (!songQuery && (!player || !player.queue.current)) {
            return interaction.reply({ components: [buildErrorResponse('Error', 'No song playing and no search query provided!')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const searchSong = songQuery || player.queue.current.info.title;

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# <:Edit:1473037903625191580> Lyrics Search\n\n**Song:** ${searchSong}\n\n**Note:** Lyrics feature requires external API integration. This is a placeholder that can be connected to services like Genius API or Lyrics.ovh for full functionality.\n\n**Suggested API:** https://lyricsovh.docs.apiary.io/`)
            );

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        const songQuery = args.join(' ');

        if (!songQuery && (!player || !player.queue.current)) {
            return message.reply({ components: [buildErrorResponse('Error', 'No song playing and no search query provided!')], flags: MessageFlags.IsComponentsV2 });
        }

        const searchSong = songQuery || player.queue.current.info.title;

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# <:Edit:1473037903625191580> Lyrics Search\n\n**Song:** ${searchSong}\n\n**Note:** Lyrics feature requires external API integration. This is a placeholder that can be connected to services like Genius API or Lyrics.ovh for full functionality.\n\n**Suggested API:** https://lyricsovh.docs.apiary.io/`)
            );

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
