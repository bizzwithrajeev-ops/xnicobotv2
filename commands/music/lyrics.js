'use strict';

const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const {
    musicError, replyMusic,
    buildMusicContainer, COLOR,
} = require('../../utils/musicResponse');

const LYRICS_TIMEOUT_MS = 10_000;

/**
 * Best-effort lyrics fetcher: split the title into "artist - song" first, fall
 * back to a single-string lookup. Lyrics.ovh has no API key requirement.
 *
 * Returns: { title, artist, lyrics } | null
 */
async function fetchLyrics(query) {
    const cleaned = query.replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim();
    const parts = cleaned.split(/\s*-\s*/);

    const tryUrl = async (url) => {
        try {
            const r = await axios.get(url, { timeout: LYRICS_TIMEOUT_MS, validateStatus: s => s < 500 });
            if (r.status === 200 && r.data?.lyrics) return r.data.lyrics;
        } catch {}
        return null;
    };

    if (parts.length >= 2) {
        const artist = parts[0].trim();
        const title  = parts.slice(1).join(' - ').trim();
        const lyrics = await tryUrl(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
        if (lyrics) return { artist, title, lyrics };
    }

    // One last attempt: assume "Song" only and try the cleaned name as both.
    const lyrics = await tryUrl(`https://api.lyrics.ovh/v1/${encodeURIComponent(cleaned)}/${encodeURIComponent(cleaned)}`);
    if (lyrics) return { artist: 'Unknown', title: cleaned, lyrics };
    return null;
}

function chunkLyrics(text, max = 1500) {
    const out = [];
    let buf = '';
    for (const line of String(text).split('\n')) {
        if ((buf + line + '\n').length > max) {
            out.push(buf.trimEnd());
            buf = '';
        }
        buf += line + '\n';
    }
    if (buf.trim()) out.push(buf.trimEnd());
    return out;
}

async function run(target, lavalinkManager, songQuery) {
    const isSlash = typeof target.isRepliable === 'function';
    const player  = lavalinkManager.getPlayer(target.guild.id);

    let query = (songQuery || '').trim();
    if (!query) {
        if (!player || !player.queue?.current) {
            return replyMusic(target, musicError(
                'Missing Query',
                'Provide a song name, or play one first.',
                'Example: `/lyrics Imagine Dragons - Believer`'
            ), { ephemeral: isSlash });
        }
        const t = player.queue.current.info;
        query = t.author ? `${t.author} - ${t.title}` : t.title;
    }

    if (isSlash) {
        await target.deferReply().catch(() => {});
    }

    const found = await fetchLyrics(query);
    if (!found || !found.lyrics?.trim()) {
        return replyMusic(target, musicError(
            'Lyrics Not Found',
            `Couldn't find lyrics for **${query}**.`,
            'Try formatting as `Artist - Song Title`.'
        ), { ephemeral: isSlash });
    }

    const chunks = chunkLyrics(found.lyrics, 1500);
    const head = `**${found.title}**\n-# by ${found.artist}\n\n${chunks[0]}`;
    const footer = chunks.length > 1
        ? `Showing first part of ${chunks.length}. Source: lyrics.ovh`
        : 'Source: lyrics.ovh';

    const first = buildMusicContainer({
        title: 'Lyrics',
        emoji: '<:Edit:1473037903625191580>',
        body: head,
        footer,
        color: COLOR.BRAND,
    });

    return replyMusic(target, first);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lyrics')
        .setDescription('Fetch lyrics for a track')
        .addStringOption(o => o.setName('song')
            .setDescription('Song name (omit to use the current track)')
            .setRequired(false)),

    prefix: 'lyrics',
    description: 'Fetch lyrics for a track',
    usage: 'lyrics [song]',
    category: 'music',
    aliases: ['ly', 'words'],

    async execute(interaction, lavalinkManager) {
        return run(interaction, lavalinkManager, interaction.options.getString('song'));
    },
    async executePrefix(message, args, lavalinkManager) {
        return run(message, lavalinkManager, args.join(' '));
    },
};
