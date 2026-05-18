const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags, MediaGalleryBuilder } = require('discord.js');
const { formatTime, waitForLavalink } = require('../../utils/helpers');
const { buildNowPlayingContainer, buildTrackAddedContainer, buildPlaylistAddedContainer, buildMusicError, buildMusicLoading, EMOJIS, getPlatformInfo, truncateText } = require('../../utils/musicPanel');
const { buildErrorResponse, buildInvalidUsage, COLORS } = require('../../utils/responseBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song or add to queue')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Song name or URL')
                .setRequired(true)),

    prefix: 'play',
    description: 'Play a song or add to queue',
    usage: 'play <song name or URL>',
    category: 'music',
    aliases: ['p'],

    async execute(interaction, lavalinkManager) {
        if (!interaction.member.voice.channel) {
            const container = buildErrorResponse(
                'Not in Voice Channel',
                'You need to be in a voice channel to use this command.',
                'Join a voice channel and try again.'
            );
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const query = interaction.options.getString('query');

        try {
            await interaction.deferReply();

            if (!(await waitForLavalink(lavalinkManager))) {
                const container = buildErrorResponse('Music Unavailable', 'No music servers are connected right now.', 'Please try again in a moment.');
                return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            let player = lavalinkManager.getPlayer(interaction.guild.id);
            
            if (!player) {
                player = await lavalinkManager.createPlayer({
                    guildId: interaction.guild.id,
                    voiceChannelId: interaction.member.voice.channel.id,
                    textChannelId: interaction.channel.id,
                    selfDeaf: true,
                    selfMute: false,
                    volume: 100
                });
                
                await player.connect();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            let searchQuery = query;
            const isUrl = /^https?:\/\//.test(query);
            
            if (!isUrl) {
                searchQuery = `ytsearch:${query}`;
            }
            
            const searchWithFallback = async (sq, requester) => {
                const doSearch = (q) => Promise.race([
                    player.search({ query: q }, requester),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Search timeout')), 20000))
                ]);
                let res = await doSearch(sq);
                if (!isUrl && (res.loadType === 'empty' || res.loadType === 'error' || !res.tracks || res.tracks.length === 0)) {
                    res = await doSearch(`scsearch:${query}`);
                }
                return res;
            };

            const res = await searchWithFallback(searchQuery, interaction.user).catch(error => {
                console.error('Search error:', error);
                if (error.message === 'Search timeout') {
                    throw new Error('Search timed out! The music server may be slow. Please try again.');
                }
                throw new Error(error.message || 'Failed to search for tracks');
            });

            if (res.loadType === 'error') {
                console.error('Lavalink load error:', res.exception);
                throw new Error(res.exception?.message || 'Failed to load track. Please try again.');
            }

            if (res.loadType === 'empty' || !res.tracks || res.tracks.length === 0) {
                const container = buildErrorResponse(
                    'No Results Found',
                    'Could not find any tracks matching your query.',
                    'Try a different search term or check the URL.'
                );
                return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (res.loadType === 'playlist') {
                if (!res.tracks || res.tracks.length === 0) {
                    const container = buildErrorResponse(
                        'Empty Playlist',
                        'This playlist is empty or could not be loaded.'
                    );
                    return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                }
                
                let addedCount = 0;
                for (const track of res.tracks) {
                    track.requester = interaction.user;
                    try {
                        await player.queue.add(track);
                        addedCount++;
                    } catch (err) {
                        console.warn(`Failed to add track: ${track.info.title}`, err.message);
                    }
                }
                
                if (addedCount === 0) {
                    const container = buildErrorResponse(
                        'Failed to Add Tracks',
                        'Could not add any tracks from the playlist.'
                    );
                    return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                }
                
                const totalDuration = res.tracks.reduce((acc, t) => acc + (t.info.duration || 0), 0);
                const thumbnail = res.tracks[0]?.info?.artworkUrl || res.tracks[0]?.info?.thumbnail;
                const container = buildPlaylistAddedContainer(
                    res.playlistInfo?.name || 'Unknown Playlist',
                    addedCount,
                    totalDuration,
                    thumbnail
                );

                await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                
                if (!player.playing && !player.paused) {
                    await player.play();
                }
            } else {
                const track = res.tracks[0];
                track.requester = interaction.user;
                
                const wasPlaying = player.playing || player.paused;
                try {
                    await player.queue.add(track);
                } catch (err) {
                    throw new Error(`Failed to add track: ${err.message}`);
                }
                
                if (!wasPlaying) {
                    await player.play();
                    
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    const nowPlayingContainer = buildNowPlayingContainer(player, interaction.client.autoplayStatus);
                    if (nowPlayingContainer) {
                        await interaction.editReply({ components: [nowPlayingContainer], flags: MessageFlags.IsComponentsV2 });
                    } else {
                        let content = `# <:Music:1473039311057190972> Now Playing\n\n`;
                        content += `**${track.info.title}**\n`;
                        content += `by ${track.info.author || 'Unknown Artist'}\n`;
                        content += `Duration: ${formatTime(track.info.duration)}`;
                        
                        const container = new ContainerBuilder()
                            .setAccentColor(COLORS.SUCCESS)
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
                        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                    }
                } else {
                    const container = buildTrackAddedContainer(track, player.queue.tracks.length, player.queue.tracks.length);
                    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                }
            }
        } catch (error) {
            console.error('Play Error:', error);
            const errorMsg = error.message || 'An unknown error occurred';
            const container = buildErrorResponse(
                'Play Failed',
                'An error occurred while playing.',
                errorMsg
            );
            if (interaction.deferred) {
                await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(console.error);
            } else {
                await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(console.error);
            }
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        if (!message.member.voice.channel) {
            const container = buildErrorResponse(
                'Not in Voice Channel',
                'You need to be in a voice channel to use this command.',
                'Join a voice channel and try again.'
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const query = args.join(' ');
        if (!query) {
            const container = buildInvalidUsage(
                'play',
                '-play <song name or URL>',
                ['-play Never Gonna Give You Up', '-play https://youtube.com/watch?v=...']
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            if (!(await waitForLavalink(lavalinkManager))) {
                const container = buildErrorResponse('Music Unavailable', 'No music servers are connected right now.', 'Please try again in a moment.');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            let player = lavalinkManager.getPlayer(message.guild.id);
            
            if (!player) {
                player = await lavalinkManager.createPlayer({
                    guildId: message.guild.id,
                    voiceChannelId: message.member.voice.channel.id,
                    textChannelId: message.channel.id,
                    selfDeaf: true,
                    selfMute: false,
                    volume: 100
                });
                
                await player.connect();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            let searchQuery = query;
            const isUrl = /^https?:\/\//.test(query);
            
            if (!isUrl) {
                searchQuery = `ytsearch:${query}`;
            }
            
            const searchWithFallback = async (sq, requester) => {
                const doSearch = (q) => Promise.race([
                    player.search({ query: q }, requester),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Search timeout')), 20000))
                ]);
                let res = await doSearch(sq);
                if (!isUrl && (res.loadType === 'empty' || res.loadType === 'error' || !res.tracks || res.tracks.length === 0)) {
                    res = await doSearch(`scsearch:${query}`);
                }
                return res;
            };

            const res = await searchWithFallback(searchQuery, message.author).catch(error => {
                if (error.message === 'Search timeout') {
                    throw new Error('Search timed out! The music server may be slow. Please try again.');
                }
                throw error;
            });

            if (res.loadType === 'error') {
                console.error('Lavalink load error:', res.exception);
                throw new Error(res.exception?.message || 'Failed to load track. Please try again.');
            }

            if (res.loadType === 'empty' || !res.tracks || res.tracks.length === 0) {
                const container = buildErrorResponse(
                    'No Results Found',
                    'Could not find any tracks matching your query.',
                    'Try a different search term.'
                );
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (res.loadType === 'playlist') {
                for (const track of res.tracks) {
                    track.requester = message.author;
                    await player.queue.add(track);
                }

                let content = `# <:Document:1473039496995143731> Playlist Added\n\n`;
                content += `**${res.playlistInfo?.name || 'Unknown Playlist'}**\n`;
                content += `Added ${res.tracks.length} song${res.tracks.length !== 1 ? 's' : ''} to the queue`;

                const container = new ContainerBuilder()
                    .setAccentColor(COLORS.SUCCESS)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

                await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                
                if (!player.playing && !player.paused) {
                    await player.play();
                }
            } else {
                const track = res.tracks[0];
                track.requester = message.author;
                
                const wasPlaying = player.playing || player.paused;
                await player.queue.add(track);
                
                if (!wasPlaying) {
                    await player.play();
                    
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    const nowPlayingContainer = buildNowPlayingContainer(player, message.client.autoplayStatus);
                    if (nowPlayingContainer) {
                        await message.reply({ components: [nowPlayingContainer], flags: MessageFlags.IsComponentsV2 });
                    } else {
                        let content = `# <:Music:1473039311057190972> Now Playing\n\n`;
                        content += `**${track.info.title}**\n`;
                        content += `by ${track.info.author || 'Unknown Artist'}\n`;
                        content += `Duration: ${formatTime(track.info.duration)}`;
                        
                        const container = new ContainerBuilder()
                            .setAccentColor(COLORS.SUCCESS)
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
                        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                    }
                } else {
                    let content = `# <:Music:1473039311057190972> Added to Queue\n\n`;
                    content += `**${track.info.title}**\n`;
                    content += `by ${track.info.author || 'Unknown Artist'}\n`;
                    content += `Duration: ${formatTime(track.info.duration)} | Position: ${player.queue.tracks.length}`;
                    
                    const container = new ContainerBuilder()
                        .setAccentColor(COLORS.INFO)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
                    await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                }
            }
        } catch (error) {
            console.error('Play Error:', error);
            const errorMsg = error.message || 'An unknown error occurred';
            const container = buildErrorResponse(
                'Play Failed',
                'An error occurred while playing.',
                errorMsg
            );
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(console.error);
        }
    }
};
