/**
 * emojiGuard.js — Runtime safety for Discord custom emojis.
 *
 * Discord rejects components that reference custom emojis the bot cannot use.
 * (COMPONENT_INVALID_EMOJI). Older versions of this codebase referenced emojis
 * from servers the bot is no longer in.  This guard installs a single source
 * of truth for valid IDs and patches ButtonBuilder.setEmoji + similar setters
 * so any invalid ID is silently replaced with a safe Unicode fallback before
 * the payload reaches Discord.
 *
 * Two behaviours:
 *   1. Static fallback map (BAD_EMOJI_FALLBACKS) — replaces known-bad IDs
 *      with Unicode emojis chosen to match the original meaning.
 *   2. Runtime client check — once Client is logged in, any custom emoji
 *      whose ID is NOT present in client.emojis.cache is replaced with the
 *      fallback in DEFAULT_FALLBACK.
 */

const DEFAULT_FALLBACK = '✨';

// Specific bad-id → semantic fallback map.
// IDs sourced from cross-server emojis the bot lost access to.
const BAD_EMOJI_FALLBACKS = {
    // music / streaming
    '1435331502710722592': '📺',   // YoutubeLive
    '1435332317341159424': '🟠',   // soundCloud
    '1435332305919938680': '🍎',   // applemusic
    '1473663456182800446': '🟢',   // spotify
    '1435331508989636642': '🔴',   // live
    '1479681956273852607': '⏳',   // Load (animated)
    '1479349681049043096': '📜',   // queue
    '1479349855217516544': '⏹',   // qended
    // hearts / likes / dislikes
    '1473038488893526016': '❤️',  // Heartalt
    '1473038965111259307': '👍',   // Like
    '1473038962762317834': '👎',   // Dislike
    // generic ui (older server emojis)
    '1417485105437478943': '◀️',   // back
    '1417485139595890728': '▶️',   // next
    '1415659106735599646': '✅',   // correct
    '1473038659514007616': '❤️',  // Heart
    '1417581304299741184': '👤',   // user
    '1430999565011648512': '⚪',   // offline
    '1415659283017707640': '⚙️',  // settings
    '1415658900384096346': '❓',   // help
    '1415659000846159903': '⚠️',  // warning
    '1415659155809280161': 'ℹ️',  // info
    '1417583659531243612': '·',    // Dot
    '1506015728871149770': '⏳',   // loading (deprecated)
    // misc external-server crowns / staff / boost / nitro
    '1386229254403919903': '👑',   // wcrown
    '1476259690315780229': '🛡️',  // staff
    '1388164213988192370': '🚀',   // nitro_boost
    '1386229251895857304': '📷',   // wcamera
    '1386229297827545089': '🚀',   // nitroboost
    '1435683544302223420': '📣',   // announce
    // discord brand emojis (not always available)
    '1415659385635737734': '▶️',   // play
    '1415659399703171183': '⏸',   // pause
    '1415659247017922642': '⏹',   // stop
    '1415659339334811698': '⏮',   // rewind
    '1415659354895683626': '⏭',   // forward
    '1417522689375207476': '🔚',   // end
    '1417523546099548292': '🔁',   // loop1
    '1415659428954505226': '🔊',   // volume
    '1415659415243325484': '🔇',   // mute
    '1415659151794634849': '📜',   // read
    '1415659276923437096': '🛡️',  // shield1
    '1415659902168207432': '⚙️',  // setting
    '1415659478103232562': '🔨',   // moderate
    '1415659108249374830': '⚠️',  // error
    '1415658909066067978': '🤖',   // discord
    '1415659003194904586': '🎮',   // games
    '1415659874729201735': '📁',   // folder
    '1415658776488448080': '🎉',   // giveaway
    '1415659457760854026': '📈',   // up
    '1415659121927262258': '❌',   // wrong
    '1423904534928953426': '💬',   // messages
    '1426523323646345309': '📌',   // pin
    '1426523275206332426': '✉️',   // mail
    '1454871326144725066': '🎨',   // war/palette
    '1455551935716393080': '✨',   // shine
    '1455550639584186439': '✅',   // verify
    '1388078753481101353': '🔗',   // glazewhite_link
    '1388078703724204142': '💎',   // 2_boost_blue
    '1386229088141967390': '🎙️',  // wvoice
    '1386229066104836126': '·',    // wdot
};

// Trusted prefix ranges. Anything matching one of these ID prefixes is
// considered valid UNLESS it appears in BAD_EMOJI_FALLBACKS (specific
// known-bad IDs even within trusted servers, e.g. emojis the bot lost
// access to).
const KNOWN_GOOD_PREFIXES = [
    '147303',                             // bot's main server (147303xxx — Settings, Cancel, Music, etc.)
    '14733',                              // 1473370101…, 1473377877… (dnd, Money, …)
    '14735',                              // 1473546762… (topgg)
    '147336',                             // 1473367388…, 1473368718…, 1473369837… (banhammer, bots, online)
    '14555',                              // partner emoji server (xnico)
    '14867',                              // 1486755… (xnico extra)
    '14852',                              // badge server
    '14797',                              // animated rockets
    '15060',                              // Crown
];

// Whitelist: emoji IDs that we KNOW are valid.
const KNOWN_GOOD_IDS = new Set([
    '1473038797540298792', // Lightning
    '1473039575302803629', // Copy
    '1473038624172937287', // Inforect
]);

let runtimeClient = null;

function isWhitelistedId(id) {
    if (!id) return false;
    if (BAD_EMOJI_FALLBACKS[id]) return false; // explicit bad list always wins
    if (KNOWN_GOOD_IDS.has(id)) return true;
    return KNOWN_GOOD_PREFIXES.some(p => id.startsWith(p));
}

function clientHasEmoji(id) {
    if (!runtimeClient || !runtimeClient.emojis?.cache) return null;
    return runtimeClient.emojis.cache.has(id);
}

/**
 * Sanitize a single emoji string.
 * Accepts:
 *   - Unicode emoji (returned unchanged)
 *   - <a?:name:id> string
 *   - { id, name, animated } object
 *   - bare numeric id
 * Returns: the same shape as input, or a safe Unicode fallback.
 */
function sanitizeEmoji(input) {
    if (input == null) return input;

    // Object form
    if (typeof input === 'object') {
        const id = input.id ? String(input.id) : null;
        if (!id) return input; // unicode in .name only
        if (isWhitelistedId(id)) return input;
        if (BAD_EMOJI_FALLBACKS[id]) return BAD_EMOJI_FALLBACKS[id];
        const has = clientHasEmoji(id);
        if (has === false) return DEFAULT_FALLBACK;
        return input; // unknown — leave as-is, runtime will validate
    }

    if (typeof input !== 'string') return input;

    // Plain numeric id (used wrongly in a few places)
    if (/^\d{15,22}$/.test(input)) {
        if (isWhitelistedId(input)) return `<:emoji:${input}>`;
        if (BAD_EMOJI_FALLBACKS[input]) return BAD_EMOJI_FALLBACKS[input];
        const has = clientHasEmoji(input);
        if (has) return `<:emoji:${input}>`;
        return DEFAULT_FALLBACK;
    }

    // <a?:name:id>
    const m = input.match(/^<(a?):([^:]+):(\d{15,22})>$/);
    if (m) {
        const id = m[3];
        if (isWhitelistedId(id)) return input;
        if (BAD_EMOJI_FALLBACKS[id]) return BAD_EMOJI_FALLBACKS[id];
        const has = clientHasEmoji(id);
        if (has === false) return DEFAULT_FALLBACK;
        return input; // pass through if we can't tell yet
    }

    return input; // unicode or unknown text — pass through
}

function attachClient(client) {
    runtimeClient = client;
}

/**
 * Patch discord.js builders so any setEmoji call routes through sanitizeEmoji.
 * Idempotent — safe to call multiple times.
 */
function installPatches() {
    let djs;
    try { djs = require('discord.js'); }
    catch { return; }

    const targets = [
        djs.ButtonBuilder,
        djs.SelectMenuOptionBuilder,
        djs.StringSelectMenuOptionBuilder,
    ].filter(Boolean);

    for (const T of targets) {
        const proto = T.prototype;
        if (!proto || proto.__emojiGuardPatched) continue;
        const original = proto.setEmoji;
        if (typeof original !== 'function') continue;
        proto.setEmoji = function patchedSetEmoji(emoji) {
            return original.call(this, sanitizeEmoji(emoji));
        };
        proto.__emojiGuardPatched = true;
    }

    // Also patch addOptions / addComponents on string select to catch options
    // built as plain objects (toJSON path).
    if (djs.StringSelectMenuBuilder?.prototype) {
        const sm = djs.StringSelectMenuBuilder.prototype;
        if (!sm.__emojiGuardPatched && typeof sm.addOptions === 'function') {
            const orig = sm.addOptions;
            sm.addOptions = function patchedAddOptions(...args) {
                const fixed = args.map(a => Array.isArray(a) ? a.map(fixOpt) : fixOpt(a));
                return orig.apply(this, fixed);
            };
            sm.__emojiGuardPatched = true;
        }
    }
}

function fixOpt(opt) {
    if (!opt || typeof opt !== 'object') return opt;
    if ('emoji' in opt) {
        opt.emoji = sanitizeEmoji(opt.emoji);
    }
    return opt;
}

module.exports = {
    sanitizeEmoji,
    attachClient,
    installPatches,
    BAD_EMOJI_FALLBACKS,
    DEFAULT_FALLBACK,
};
