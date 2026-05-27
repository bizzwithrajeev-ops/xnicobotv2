'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { waitForLavalink } = require('../../utils/helpers');
const {
    buildNowPlayingContainer,
    buildTrackAddedContainer,
    buildPlaylistAddedContainer,
} = require('../../utils/musicPanel');
const {
    preflightVoiceOnly, musicError, replyMusic,
} = require('../../utils/musicResponse');

const SEARCH_TIMEOUT_MS = 20_000;

async function ensurePlayer(target, lavalinkManager, member) {
    let player = lavalinkManager.getPlayer(target.guild.id);
    if (!player) {
        player = await lavalinkManager.createPlayer({
            guildId: target.guild.id,
            voiceChannelId: member.voice.channel.id,
            textChannelId: target.channel.id,
            selfDeaf: true,
            selfMute: false,
            volume: 100,
        });
        await player.connect();
        // Brief settle so subsequent operations have a connected websocket.
        await new Promise(r => setTimeout(r, 1000));
    }
    return player;
}

async function searchWithFallback(player, query, requester) {
    const isUrl = /^https?:\/\//i.test(query);
    const primary = isUrl ? query : `ytsearch:${query}`;
    const doSearch = (q) => Promise.race([
        player.search({ query: q }, requester),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Search timeout')), SEARCH_TIMEOUT_MS)),
    ]);

    let res = await doSearch(primary);
    if (!isUrl && (res.loadType === 'empty' || res.loadType === 'error' || !res.tracks?.length)) {
        res = await doSearch(`scsearch:${query}`);
    }
    return { res, isUrl };
}

async function run(target, lavalinkManager, query) {
    const isSlash = typeof target.isRepliable === 'function';
    const member  = target.member;
    const requester = isSlash ? target.user : target.author;

    const voiceErr = preflightVoiceOnly(member);
    if (voiceErr) return replyMusic(target, voiceErr.container, { ephemeral: isSlash });

    if (!query || !query.trim()) {
        return replyMusic(target, musicError(
            'Missing Query',
            'Provide a song name or URL.',
            isSlash ? 'Example: `/play Never Gonna Give You Up`' : 'Example: `-play Never Gonna Give You Up`'
        ), { ephemeral: isSlash });
    }

    if (isSlash) await target.deferReply().catch(() => {});

    if (!(await waitForLavalink(lavalinkManager))) {
        return replyMusic(target, musicError(
            'Music Unavailable',
            'No music servers are connected right now.',
            'Please try again in a moment.'
        ), { ephemeral: isSlash });
    }

    let player;
    try {
        player = await ensurePlayer(target, lavalinkManager, member);
    } catch (err) {
        return replyMusic(target, musicError(
            'Connection Failed',
            'Could not join your voice channel.',
            err?.message || 'Check that I have permission to join and speak.'
        ), { ephemeral: isSlash });
    }

    let res;
    try {
        ({ res } = await searchWithFallback(player, query.trim(), requester));
    } catch (err) {
        const msg = err.message === 'Search timeout'
            ? 'Search timed out. The music server may be slow.'
            : (err.message || 'Failed to search for tracks.');
        return replyMusic(target, musicError('Search Failed', msg, 'Please try again.'), { ephemeral: isSlash });
    }

    if (res.loadType === 'error') {
        return replyMusic(target, musicError(
            'Load Failed',
            res.exception?.message || 'Failed to load track.',
            'Please try a different query or URL.'
        ), { ephemeral: isSlash });
    }
    if (res.loadType === 'empty' || !res.tracks?.length) {
        return replyMusic(target, musicError(
            'No Results',
            'Could not find any tracks matching your query.',
            'Try a different search term or check the URL.'
        ), { ephemeral: isSlash });
    }

    if (res.loadType === 'playlist') {
        let added = 0;
        for (const track of res.tracks) {
            track.requester = requester;
            try { await player.queue.add(track); added++; } catch {}
        }
        if (added === 0) {
            return replyMusic(target, musicError('Empty Playlist', 'Could not add any tracks from the playlist.'), { ephemeral: isSlash });
        }

        const totalDuration = res.tracks.reduce((acc, t) => acc + (t.info.duration || 0), 0);
        const thumbnail = res.tracks[0]?.info?.artworkUrl || res.tracks[0]?.info?.thumbnail;
        const container = buildPlaylistAddedContainer(
            res.playlistInfo?.name || 'Unknown Playlist',
            added,
            totalDuration,
            thumbnail
        );
        await replyMusic(target, container);
        if (!player.playing && !player.paused) await player.play();
        return;
    }

    // Single track
    const track = res.tracks[0];
    track.requester = requester;
    const wasPlaying = player.playing || player.paused;
    try { await player.queue.add(track); }
    catch (err) {
        return replyMusic(target, musicError('Failed to Add', err.message || 'Could not add the track to the queue.'), { ephemeral: isSlash });
    }

    if (!wasPlaying) {
        await player.play();
        // Tiny settle so `queue.current` is set when we render the panel.
        await new Promise(r => setTimeout(r, 500));
        const container = buildNowPlayingContainer(player, target.client.autoplayStatus);
        if (container) return replyMusic(target, container);
    }

    const container = buildTrackAddedContainer(track, player.queue.tracks.length, player.queue.tracks.length);
    return replyMusic(target, container);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song or add to the queue')
        .addStringOption(o => o.setName('query').setDescription('Song name or URL').setRequired(true)),

    prefix: 'play',
    description: 'Play a song or add to the queue',
    usage: 'play <song name or URL>',
    category: 'music',
    aliases: ['p'],

    async execute(interaction, lavalinkManager) {
        return run(interaction, lavalinkManager, interaction.options.getString('query'));
    },
    async executePrefix(message, args, lavalinkManager) {
        return run(message, lavalinkManager, args.join(' '));
    },
};
