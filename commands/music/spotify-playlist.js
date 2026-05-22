const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { voiceErrorMessage } = require('../../utils/musicHelpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('spotify-playlist')
        .setDescription('Play a Spotify playlist by URL or search')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Spotify playlist URL or search query')
                .setRequired(true)),

    async execute(interaction, lavalinkManager) {
        {
            const __ve = voiceErrorMessage(interaction.member, lavalinkManager?.getPlayer?.(interaction.guild.id));
            if (__ve) return interaction.reply({ components: [buildErrorResponse('Voice Required', __ve)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        if (!lavalinkManager.useable) {
            return interaction.reply({ components: [buildErrorResponse('Music Unavailable', 'No music servers are connected right now. Please try again in a moment.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        await interaction.deferReply();

        const query = interaction.options.getString('query');
        const isSpotifyUrl = query.includes('spotify.com') || query.includes('spotify:');

        let player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player) {
            player = await lavalinkManager.createPlayer({
                guildId: interaction.guild.id,
                voiceChannelId: interaction.member.voice.channel.id,
                textChannelId: interaction.channel.id,
                selfDeaf: true,
                volume: 100
            });
        }

        if (!player.connected) {
            await player.connect();
        }

        try {
            let searchQuery = query;
            if (!isSpotifyUrl) {
                searchQuery = `ytsearch:${query} playlist`;
            }

            const result = await Promise.race([
                player.search({ query: searchQuery }, interaction.user),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Search timed out')), 20000))
            ]);

            if (!result || result.loadType === 'empty' || result.loadType === 'error') {
                return interaction.editReply({ components: [buildErrorResponse('Not Found', 'Could not find that Spotify playlist.')], flags: MessageFlags.IsComponentsV2 });
            }

            let tracks = [];
            let playlistName = 'Spotify Playlist';

            if (result.loadType === 'playlist') {
                tracks = result.tracks;
                playlistName = result.playlist?.name || 'Spotify Playlist';
            } else if (result.tracks && result.tracks.length > 0) {
                tracks = result.tracks.slice(0, 50);
                playlistName = query.substring(0, 30);
            }

            if (tracks.length === 0) {
                return interaction.editReply({ components: [buildErrorResponse('Empty Playlist', 'No tracks found in that playlist.')], flags: MessageFlags.IsComponentsV2 });
            }

            const wasPlaying = player.playing || player.paused;

            for (const track of tracks) {
                player.queue.add(track);
            }

            if (!wasPlaying) {
                await player.play();
            }

            const content = `# <:spotify:1473663456182800446> Spotify Playlist\n\n` +
                `**${playlistName}**\n\n` +
                `<:Checkedbox:1473038547165384804> Added **${tracks.length}** tracks to queue\n\n` +
                `-# Requested by ${interaction.user.username}`;

            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        } catch (error) {
            console.error('Spotify playlist error:', error);
            return interaction.editReply({ components: [buildErrorResponse('Load Failed', `Failed: ${error.message}`)], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        {
            const __ve = voiceErrorMessage(message.member, lavalinkManager?.getPlayer?.(message.guild.id));
            if (__ve) return message.reply({ components: [buildErrorResponse('Voice Required', __ve)], flags: MessageFlags.IsComponentsV2 });
        }

        if (!args.length) {
            return message.reply({ components: [buildErrorResponse('Missing Input', 'Please provide a Spotify playlist URL or search query!')], flags: MessageFlags.IsComponentsV2 });
        }

        const query = args.join(' ');
        const isSpotifyUrl = query.includes('spotify.com') || query.includes('spotify:');

        if (!lavalinkManager.useable) {
            return message.reply({ components: [buildErrorResponse('Music Unavailable', 'No music servers are connected right now. Please try again in a moment.')], flags: MessageFlags.IsComponentsV2 });
        }

        let player = lavalinkManager.getPlayer(message.guild.id);
        if (!player) {
            player = await lavalinkManager.createPlayer({
                guildId: message.guild.id,
                voiceChannelId: message.member.voice.channel.id,
                textChannelId: message.channel.id,
                selfDeaf: true,
                volume: 100
            });
        }

        if (!player.connected) {
            await player.connect();
        }

        try {
            let searchQuery = query;
            if (!isSpotifyUrl) {
                searchQuery = `ytsearch:${query} playlist`;
            }

            const result = await Promise.race([
                player.search({ query: searchQuery }, message.author),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Search timed out')), 20000))
            ]);

            if (!result || result.loadType === 'empty' || result.loadType === 'error') {
                return message.reply({ components: [buildErrorResponse('Playlist Error', 'Could not find that Spotify playlist!')], flags: MessageFlags.IsComponentsV2 });
            }

            let tracks = [];
            let playlistName = 'Spotify Playlist';

            if (result.loadType === 'playlist') {
                tracks = result.tracks;
                playlistName = result.playlist?.name || 'Spotify Playlist';
            } else if (result.tracks && result.tracks.length > 0) {
                tracks = result.tracks.slice(0, 50);
            }

            if (tracks.length === 0) {
                return message.reply({ components: [buildErrorResponse('No Results', 'No tracks found in that playlist!')], flags: MessageFlags.IsComponentsV2 });
            }

            const wasPlaying = player.playing || player.paused;

            for (const track of tracks) {
                player.queue.add(track);
            }

            if (!wasPlaying) {
                await player.play();
            }

            const content = `# <:spotify:1473663456182800446> Spotify Playlist\n\n` +
                `**${playlistName}**\n\n` +
                `<:Checkedbox:1473038547165384804> Added **${tracks.length}** tracks to queue`;

            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        } catch (error) {
            console.error('Spotify playlist error:', error);
            return message.reply({ components: [buildErrorResponse('Playlist Error', `Failed to load playlist: ${error.message}`)], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
