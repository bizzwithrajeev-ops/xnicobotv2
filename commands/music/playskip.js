const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { formatTime } = require('../../utils/helpers');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { voiceErrorMessage } = require('../../utils/musicHelpers');

module.exports = {
    async executePrefix(message, args, lavalinkManager) {
        {
            const __ve = voiceErrorMessage(message.member, lavalinkManager?.getPlayer?.(message.guild.id));
            if (__ve) return message.reply({ components: [buildErrorResponse('Voice Required', __ve)], flags: MessageFlags.IsComponentsV2 });
        }

        const query = args.join(' ');
        if (!query) {
            return message.reply({ components: [buildErrorResponse('Missing Input', 'Please provide a song name or URL!')], flags: MessageFlags.IsComponentsV2 });
        }

        if (!lavalinkManager.useable) {
            return message.reply({ components: [buildErrorResponse('Music Unavailable', 'No music servers are connected right now. Please try again in a moment.')], flags: MessageFlags.IsComponentsV2 });
        }

        try {
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
            }

            const isUrl = /^https?:\/\//i.test(query);
            const searchQuery = isUrl ? query : `ytsearch:${query}`;
            const searchPromise = player.search({ query: searchQuery }, message.author);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Search timeout')), 10000)
            );

            const res = await Promise.race([searchPromise, timeoutPromise]).catch(error => {
                if (error.message === 'Search timeout') {
                    throw new Error('Search timed out! The Lavalink server may be slow. Please try again.');
                }
                throw error;
            });

            if (res.loadType === 'empty' || !res.tracks || res.tracks.length === 0) {
                return message.reply({ components: [buildErrorResponse('No Results', 'No results found! Please try a different query.')], flags: MessageFlags.IsComponentsV2 });
            }

            const track = res.tracks[0];
            await player.queue.add(track, 0);
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Skipnext:1473039269726785737> Playing Now\n**${track.info.title}**\nDuration: ${formatTime(track.info.duration)}`)
                );

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

            if (player.playing || player.paused) {
                await player.skip();
            } else {
                await player.play();
            }
        } catch (error) {
            console.error('PlaySkip Error:', error);
            const errorMsg = error.message || 'An unknown error occurred';
            message.reply({ components: [buildErrorResponse('Error', `An error occurred: ${errorMsg}`)], flags: MessageFlags.IsComponentsV2 }).catch(console.error);
        }
    }
};
