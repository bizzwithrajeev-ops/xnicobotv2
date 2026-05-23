'use strict';

/**
 * slashRegistrar.js — Smart slash command auto-registration.
 *
 * Detects when registration is required (new TOKEN, new CLIENT_ID, or a
 * change to the slash command set) and pushes the latest payloads to
 * Discord exactly once per change. On every other boot the registrar
 * does nothing — fast startup, no rate-limit risk.
 *
 * State lives at `data/.slash-cache.json` (gitignored). It stores the
 * SHA-256 hash of TOKEN+CLIENT_ID+command-payloads. When any of those
 * change, the hash changes and we re-register.
 *
 * © Rajeev (Rexzy) — xNico
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REST, Routes } = require('discord.js');

const log = require('./logger-styled');

const CACHE_DIR  = path.join(__dirname, '..', 'data');
const CACHE_FILE = path.join(CACHE_DIR, '.slash-cache.json');

// Discord's hard limits
const DISCORD_GLOBAL_LIMIT = 100;
const DISCORD_GUILD_LIMIT  = 100;

// Priority list — these go global so they're available everywhere instantly.
const GLOBAL_PRIORITY = new Set([
    'help', 'botinfo', 'ping', 'userinfo', 'avatar', 'serverinfo',
    'ban', 'kick', 'mute', 'unmute', 'timeout', 'untimeout', 'warn', 'clear', 'unban',
    'antispam', 'antinuke', 'antiraid', 'antialt', 'config', 'logging', 'setprefix',
    'lock', 'unlock', 'hide', 'unhide', 'addrole', 'removerole', 'slowmode',
    'play', 'pause', 'resume', 'stop', 'skip', 'queue', 'nowplaying', 'volume',
    'seek', 'loop', 'shuffle', 'autoplay', 'filters', 'lyrics', 'musicpanel',
    'welcomer', 'autorole', 'ticket-setup', 'ticket-add', 'ticket-remove', 'ticket-close', 'ticket-categories', 'giveaway', 'reactionroles', 'autoresponder',
    'autoreact', 'starboard-setup', 'poll', 'sticky-message', 'youtube-notify', 'social-notify',
    'snipe', 'editsnipe', 'afk', 'reminder', 'announce', 'automod', 'invite-setup',
    'button-maker', 'select-menu-maker', 'embed-quick', 'translate', 'calculate',
    'premium', 'customcmd', 'github', 'serverstats', 'suggestion',
    'balance', 'daily', 'weekly', 'shop', 'profile', 'pay', 'deposit', 'withdraw',
    'slots', 'betflip', 'gamble', 'rob', 'lottery', 'highlow', 'scratch', 'dice',
    'blackjack', 'roulette', 'rps',
    'tictactoe', 'connect4', 'hangman', 'numguess', 'memory', '2048', 'battleship',
    'work', 'beg', 'crime', 'fish', 'hunt', 'adventure', 'mine', 'mines', 'farm', 'heist',
    'buy', 'sell', 'inventory', 'trade', 'craft', 'gift', 'loan', 'economy-leaderboard',
    'battle', 'pets',
    'rank', 'levels', 'leveling-setup', 'levelroles',
    'socialprofile', 'badges',
    'trivia', 'wordle', 'akinator', 'scramble', 'mathgame', 'fasttype',
    'meme', 'joke', 'gif', 'fact', 'riddle', 'ship', 'rate', '8ball',
    'howgay', 'howlesbian', 'howstraight', 'howcute', 'howsmart', 'howsus', 'iq',
    'backup-create', 'backup-load', 'backup-list', 'server-backup-create',
    'botpanel', 'eval', 'shutdown',
]);

// ─── Cache helpers ─────────────────────────────────────────────────────────────

function readCache() {
    try {
        if (!fs.existsSync(CACHE_FILE)) return null;
        return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch {
        return null;
    }
}

function writeCache(data) {
    try {
        if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        log.warning(`[Slash] Failed to persist cache: ${e.message}`);
    }
}

/**
 * SHA-256 hash of a serialisable value. Used as the change-detection signal.
 */
function hashOf(value) {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Hash just the identity portion (clientId + first 16 chars of token).
 * Token is partially hashed only to detect *changes* — we never log the token.
 */
function identityHash(token, clientId) {
    return hashOf({ c: clientId, t: token.slice(0, 16) + ':' + token.length });
}

// ─── Command split (priority → global, rest → guild-specific) ──────────────────

function splitCommands(commands) {
    const priorityCmds = [];
    const overflowCmds = [];
    for (const cmd of commands) {
        if (GLOBAL_PRIORITY.has(cmd.name)) priorityCmds.push(cmd);
        else overflowCmds.push(cmd);
    }
    const globalCmds = priorityCmds.slice(0, DISCORD_GLOBAL_LIMIT);
    if (globalCmds.length < DISCORD_GLOBAL_LIMIT) {
        globalCmds.push(...overflowCmds.splice(0, DISCORD_GLOBAL_LIMIT - globalCmds.length));
    }
    const globalNames = new Set(globalCmds.map(c => c.name));
    const guildCmds = commands
        .filter(c => !globalNames.has(c.name))
        .slice(0, DISCORD_GUILD_LIMIT);

    return { globalCmds, guildCmds };
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Auto-register slash commands on bot startup IF the registration state has
 * changed since the last successful registration.
 *
 * @param {object} args
 * @param {import('discord.js').Client} args.client    Logged-in Discord client.
 * @param {string} args.token        Bot token (kept in memory only).
 * @param {string} args.clientId     Application ID.
 * @param {Array<object>} args.commands  Slash payloads (toJSON output).
 * @param {boolean} [args.force=false]   Force re-register even if unchanged.
 * @returns {Promise<{registered: boolean, reason: string, global: number, guild: number}>}
 */
async function autoRegister({ client, token, clientId, commands, force = false }) {
    if (!token || !clientId) {
        return { registered: false, reason: 'missing-token-or-client-id', global: 0, guild: 0 };
    }
    if (!Array.isArray(commands) || commands.length === 0) {
        return { registered: false, reason: 'no-commands', global: 0, guild: 0 };
    }

    const id = identityHash(token, clientId);
    const payload = hashOf(commands.map(c => ({ name: c.name, ...c })));
    const cache = readCache();

    // Decide whether registration is required.
    let reason = null;
    if (force) reason = 'force';
    else if (!cache) reason = 'first-run';
    else if (cache.identity !== id) reason = 'token-or-client-changed';
    else if (cache.payload !== payload) reason = 'commands-changed';

    if (!reason) {
        log.info(`[Slash] Already up to date (${commands.length} commands, hash ${payload.slice(0, 8)}). Skipping registration.`);
        return { registered: false, reason: 'cache-match', global: 0, guild: 0 };
    }

    log.warning(`[Slash] Registration required → ${reason}. Pushing to Discord...`);

    const rest = new REST({ version: '10' }).setToken(token);
    const { globalCmds, guildCmds } = splitCommands(commands);

    // ── Global commands (preserve any entry-point command type=4) ──
    let entryPoints = [];
    try {
        const existing = await rest.get(Routes.applicationCommands(clientId));
        if (Array.isArray(existing)) entryPoints = existing.filter(c => c.type === 4);
    } catch (e) {
        log.warning(`[Slash] Could not fetch existing global commands: ${e.message}`);
    }

    try {
        await rest.put(Routes.applicationCommands(clientId), {
            body: [...globalCmds, ...entryPoints],
        });
        log.success(`[Slash] ${globalCmds.length} global commands registered.`);
    } catch (e) {
        log.error(`[Slash] Global registration failed: ${e.message}`);
        return { registered: false, reason: 'global-failed', global: 0, guild: 0 };
    }

    // ── Guild-specific commands (push to every guild the bot is in) ──
    let guildSuccess = 0;
    if (guildCmds.length > 0) {
        const guilds = [...client.guilds.cache.values()];
        log.info(`[Slash] Registering ${guildCmds.length} guild-specific commands across ${guilds.length} guild(s)...`);

        const BATCH = 5;
        const DELAY_MS = 1500;

        for (let i = 0; i < guilds.length; i += BATCH) {
            const batch = guilds.slice(i, i + BATCH);
            const results = await Promise.allSettled(
                batch.map(g => rest.put(Routes.applicationGuildCommands(clientId, g.id), { body: guildCmds }))
            );
            for (const r of results) {
                if (r.status === 'fulfilled') guildSuccess++;
                else log.debug(`[Slash] Guild push failed: ${r.reason?.message || r.reason}`);
            }
            if (i + BATCH < guilds.length) await new Promise(r => setTimeout(r, DELAY_MS));
        }

        log.success(`[Slash] ${guildSuccess}/${guilds.length} guild registrations complete.`);
    }

    // ── Persist cache so the next boot is a no-op ──
    writeCache({
        identity: id,
        payload,
        lastRegistered: new Date().toISOString(),
        clientId,
        global: globalCmds.length,
        guild: guildCmds.length,
        guildSuccess,
        commandCount: commands.length,
    });

    return {
        registered: true,
        reason,
        global: globalCmds.length,
        guild: guildCmds.length,
    };
}

/**
 * Wipe the registration cache. Forces a re-register on next boot.
 */
function invalidateCache() {
    try { fs.unlinkSync(CACHE_FILE); } catch {}
}

module.exports = {
    autoRegister,
    invalidateCache,
    GLOBAL_PRIORITY,
};
