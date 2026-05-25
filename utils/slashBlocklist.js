'use strict';

/**
 * slashBlocklist.js — Single source of truth for commands that should
 * NEVER be registered as Discord slash commands.
 *
 * These commands stay loaded in `client.commands` (so prefix invocation
 * still works through their `executePrefix` handler), but they are
 * filtered out before any payload is pushed to Discord's API.
 *
 * Use it from:
 *   • index.js                       — startup slash registration
 *   • commands/owner/deploycommands  — manual redeploy
 *   • utils/slashRegistrar.js        — auto-registration cache
 *
 * © xNico
 */

const SLASH_BLOCKLIST = new Set([
    // ── basic / info APIs (kept as prefix-only) ──
    'covid',
    'crypto',
    'emoji-info',
    'channelinfo',
    'manga',

    // ── fun text/utility ──
    'ascii',
    'clap',
    'fasttype',
    'fortune',

    // ── image filters & generators ──
    'blur',
    'border',
    'brighten',
    'charcoal',
    'deepfry',
    'greyscale',
    'imagine',
    'invertcolors',
    'jpeg',
    'mirror',
    'oilpaint',
    'pixelate',
    'rotate',
    'sepia',
    'sketch',
    'trigger',

    // ── owner-only commands ──
    'apikeys',
    'badge-create',
    'badge-edit',
    'badge-give',
    'badge-list',
    'badge-remove',
    'blacklist',
    'botinvite',
    'command-stats',
    'deploycommands',
    'dmuser',
    'eval',
    'fetchmsg',
    'force-sync',
    'getinvite',
    'guild-search',
    'lavalinkinfo',
    'leaveguild',
    'ownerbadges',
    'reload',
    'restart',
    'serverinfo-owner',
    'serverlist',
    'shard-status',
    'shutdown',
    'system',
    'topgg-sync',
    'userlookup',
    'vote-notify',

    // ── utility text/encoding ──
    'zalgo',
    'morse',
    'octal',
    'password',
    'rot13',
    'upside-down',
    'urbanrandom',
    'uuid',
]);

/**
 * @param {string} name Slash command name to test.
 * @returns {boolean}   True if the command must be excluded from slash registration.
 */
function isSlashBlocked(name) {
    return typeof name === 'string' && SLASH_BLOCKLIST.has(name);
}

module.exports = {
    SLASH_BLOCKLIST,
    isSlashBlocked,
};
