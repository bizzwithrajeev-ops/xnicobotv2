'use strict';

/**
 * globalAssetBrowser — shared helpers for the `globalemoji` and
 * `globalsticker` commands.
 *
 * Walks every guild the bot is in, flattens the requested asset type,
 * applies optional filters (name search, animated/static, specific guild)
 * and caches the result against the panel message so paging through pages
 * does not re-scan every guild.
 *
 * Bot-internal emoji/sticker servers are hidden from these browsers via
 * the BLACKLISTED_GUILDS set below. Anything stored there is considered
 * private bot infrastructure (e.g. branded emojis used by responses).
 */

const TIMEOUT_MS = 5 * 60 * 1000;
const SCAN_CACHE = new Map();

/**
 * Hard-coded list of guilds whose emojis/stickers must NEVER be exposed
 * by the global browsers, even when the bot is a member. These are the
 * private servers used to host the bot's own UI emojis (Checkedbox,
 * Cancel, Document, etc.) — leaking them as stealable content would
 * pollute every server with our internal asset library.
 */
const BLACKLISTED_GUILDS = new Set([
    '1473039435041079612',
    '1473037697000935454',
    '1473038756981375188',
]);

const SNOWFLAKE_RE = /^\d{17,20}$/;

function setScan(messageId, payload) {
    SCAN_CACHE.set(messageId, payload);
    setTimeout(() => SCAN_CACHE.delete(messageId), TIMEOUT_MS + 30_000).unref?.();
}

function getScan(messageId) {
    return SCAN_CACHE.get(messageId) || null;
}

function clearScan(messageId) {
    SCAN_CACHE.delete(messageId);
}

function isBlacklistedGuild(guildId) {
    return BLACKLISTED_GUILDS.has(String(guildId));
}

/* ─────────────────────────── Emoji ─────────────────────────── */

function flattenEmojis(client, opts = {}) {
    const search = (opts.search || '').toLowerCase().trim();
    const animatedOnly = !!opts.animatedOnly;
    const staticOnly = !!opts.staticOnly;
    const guildFilter = opts.guildFilter ? String(opts.guildFilter).toLowerCase() : null;

    const out = [];
    let guildsScanned = 0;
    for (const guild of client.guilds.cache.values()) {
        if (BLACKLISTED_GUILDS.has(guild.id)) continue;
        if (guildFilter
            && !guild.id.includes(guildFilter)
            && !guild.name.toLowerCase().includes(guildFilter)) continue;
        guildsScanned++;
        for (const emoji of guild.emojis.cache.values()) {
            if (animatedOnly && !emoji.animated) continue;
            if (staticOnly && emoji.animated) continue;
            if (search && !emoji.name.toLowerCase().includes(search)) continue;
            out.push({
                id: emoji.id,
                name: emoji.name,
                animated: !!emoji.animated,
                guildId: guild.id,
                guildName: guild.name,
                url: emoji.imageURL({ size: 128 }) || `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}`,
                tag: emoji.toString(),
            });
        }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return { items: out, guildsScanned };
}

/**
 * Resolve an emoji from a raw snowflake ID by probing the CDN.
 * Tries animated (.gif) first since gifs ALSO render as static frames in
 * .png form on Discord, and a static emoji served from .gif simply looks
 * unanimated. We then HEAD-check `.png` as a fallback for stricter cases.
 *
 * Returns `null` if no asset is found at that ID.
 */
async function fetchEmojiById(rawId, fallbackName) {
    const id = String(rawId || '').trim();
    if (!SNOWFLAKE_RE.test(id)) return null;

    const probe = async (ext) => {
        try {
            const res = await fetch(`https://cdn.discordapp.com/emojis/${id}.${ext}`, { method: 'HEAD' });
            return res.ok;
        } catch { return false; }
    };

    const isGif = await probe('gif');
    const isPng = !isGif && await probe('png');
    if (!isGif && !isPng) return null;

    const ext = isGif ? 'gif' : 'png';
    return {
        id,
        name: sanitizeName(fallbackName, 'stolen_emoji'),
        animated: isGif,
        url: `https://cdn.discordapp.com/emojis/${id}.${ext}?size=128`,
        guildId: null,
        guildName: 'Direct ID',
        tag: isGif ? `<a:${fallbackName || 'emoji'}:${id}>` : `<:${fallbackName || 'emoji'}:${id}>`,
    };
}

/**
 * Parse a raw user input string and pull out one or more emoji IDs.
 * Accepts:
 *   - Bare snowflakes:                 "123456789012345678"
 *   - Custom emoji tags:               "<:name:1234>", "<a:name:1234>"
 *   - Multiple values, separated by:   commas, spaces, newlines
 * Returns an array of `{ id, name }` (name from the tag when available).
 */
function parseEmojiIdInput(raw) {
    if (!raw || typeof raw !== 'string') return [];
    const found = [];
    const seen = new Set();

    // Custom emoji tags first — they give us a hint at the original name.
    const tagRe = /<a?:([\w~]{1,32}):(\d{17,20})>/g;
    let m;
    while ((m = tagRe.exec(raw)) !== null) {
        if (seen.has(m[2])) continue;
        seen.add(m[2]);
        found.push({ id: m[2], name: m[1] });
    }

    // Bare IDs that aren't already part of a tag.
    const bareRe = /\b(\d{17,20})\b/g;
    while ((m = bareRe.exec(raw)) !== null) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        found.push({ id: m[1], name: null });
    }

    return found;
}

/* ────────────────────────── Stickers ────────────────────────── */

const STICKER_FORMAT_LABEL = { 1: 'PNG', 2: 'APNG', 3: 'Lottie', 4: 'GIF' };
const STICKER_EXT = { 1: 'png', 2: 'png', 3: 'json', 4: 'gif' };

function flattenStickers(client, opts = {}) {
    const search = (opts.search || '').toLowerCase().trim();
    const guildFilter = opts.guildFilter ? String(opts.guildFilter).toLowerCase() : null;
    const skipLottie = opts.skipLottie !== false;

    const out = [];
    let guildsScanned = 0;
    for (const guild of client.guilds.cache.values()) {
        if (BLACKLISTED_GUILDS.has(guild.id)) continue;
        if (guildFilter
            && !guild.id.includes(guildFilter)
            && !guild.name.toLowerCase().includes(guildFilter)) continue;
        guildsScanned++;
        for (const sticker of guild.stickers.cache.values()) {
            if (skipLottie && sticker.format === 3) continue;
            if (search) {
                const haystack = `${sticker.name} ${sticker.tags || ''} ${sticker.description || ''}`.toLowerCase();
                if (!haystack.includes(search)) continue;
            }
            const ext = STICKER_EXT[sticker.format] || 'png';
            out.push({
                id: sticker.id,
                name: sticker.name,
                tags: sticker.tags || '',
                description: sticker.description || '',
                format: sticker.format,
                formatLabel: STICKER_FORMAT_LABEL[sticker.format] || 'Unknown',
                guildId: guild.id,
                guildName: guild.name,
                url: `https://media.discordapp.net/stickers/${sticker.id}.${ext}?size=320`,
                cdnUrl: `https://cdn.discordapp.com/stickers/${sticker.id}.${ext}`,
            });
        }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return { items: out, guildsScanned };
}

/**
 * Resolve a sticker from a raw snowflake ID using Discord's REST API.
 * The /stickers/{id} endpoint works for any sticker the bot can see,
 * including stickers from servers the bot is NOT in.
 *
 * Returns `null` if the sticker doesn't exist or is Lottie (un-cloneable).
 */
async function fetchStickerById(client, rawId) {
    const id = String(rawId || '').trim();
    if (!SNOWFLAKE_RE.test(id)) return null;

    let raw;
    try {
        raw = await client.rest.get(`/stickers/${id}`);
    } catch {
        return null;
    }
    if (!raw || raw.format_type === 3) return null;

    const ext = STICKER_EXT[raw.format_type] || 'png';
    return {
        id,
        name: raw.name || 'sticker',
        tags: raw.tags || '',
        description: raw.description || '',
        format: raw.format_type || 1,
        formatLabel: STICKER_FORMAT_LABEL[raw.format_type] || 'Unknown',
        guildId: null,
        guildName: 'Direct ID',
        url: `https://media.discordapp.net/stickers/${id}.${ext}?size=320`,
        cdnUrl: `https://cdn.discordapp.com/stickers/${id}.${ext}`,
    };
}

/**
 * Parse one or more sticker IDs out of a raw user input.
 * Accepts bare snowflakes and sticker URLs (cdn/media .discordapp).
 */
function parseStickerIdInput(raw) {
    if (!raw || typeof raw !== 'string') return [];
    const found = [];
    const seen = new Set();

    const urlRe = /stickers\/(\d{17,20})/g;
    let m;
    while ((m = urlRe.exec(raw)) !== null) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        found.push({ id: m[1] });
    }
    const bareRe = /\b(\d{17,20})\b/g;
    while ((m = bareRe.exec(raw)) !== null) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        found.push({ id: m[1] });
    }

    return found;
}

/* ─────────────────────── Steal helpers ────────────────────── */

function explainEmojiError(err) {
    if (!err) return 'Unknown error';
    if (err.code === 30008) return 'Server emoji slots are full';
    if (err.code === 50013) return 'Bot is missing Manage Expressions';
    if (err.code === 50035) return 'Invalid emoji name or file';
    if (err.code === 50045) return 'Asset too large (max 256 KB)';
    return err.message?.slice(0, 120) || 'Unknown error';
}

function explainStickerError(err) {
    if (!err) return 'Unknown error';
    if (err.code === 30039) return 'Server sticker slots are full (boost level)';
    if (err.code === 50013) return 'Bot is missing Manage Expressions';
    if (err.code === 50035) return 'Invalid sticker name or tags';
    if (err.code === 50046) return 'File too large (max 512 KB)';
    if (err.code === 50006) return 'Invalid source URL';
    return err.message?.slice(0, 120) || 'Unknown error';
}

const UNICODE_EMOJI_RE = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})(\uFE0F|\u200D|\p{Emoji_Presentation}|\p{Extended_Pictographic})*/u;

function pickStickerTag(sticker) {
    if (!sticker?.tags) return '😀';
    const m = sticker.tags.match(UNICODE_EMOJI_RE);
    return m ? m[0] : '😀';
}

function sanitizeName(raw, fallback) {
    const cleaned = String(raw || '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32);
    return cleaned.length >= 2 ? cleaned : fallback;
}

function sanitizeStickerName(raw, fallback) {
    const cleaned = String(raw || '').replace(/[^a-zA-Z0-9_ ]/g, '').trim().slice(0, 30);
    return cleaned.length >= 2 ? cleaned : fallback;
}

module.exports = {
    TIMEOUT_MS,
    BLACKLISTED_GUILDS,
    isBlacklistedGuild,
    setScan,
    getScan,
    clearScan,
    flattenEmojis,
    flattenStickers,
    fetchEmojiById,
    fetchStickerById,
    parseEmojiIdInput,
    parseStickerIdInput,
    explainEmojiError,
    explainStickerError,
    pickStickerTag,
    sanitizeName,
    sanitizeStickerName,
    STICKER_FORMAT_LABEL,
    STICKER_EXT,
};
