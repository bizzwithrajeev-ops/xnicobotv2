/**
 * xNico Dashboard — Express Server v2
 * Full REST API with Discord OAuth2 login + module configuration
 */
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');

try {
    require('@dotenvx/dotenvx').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
    try {
        require('dotenv').config({ path: path.join(__dirname, '.env') });
    } catch (e2) {
        require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    }
}
// Suppress Node.js deprecation warnings (like punycode)
process.env.NODE_NO_WARNINGS = '1';

// AsyncLocalStorage gives every request its own context bag that
// survives `await` boundaries. We use it to collect background
// write promises so the response shim can flush them before the
// serverless host freezes the sandbox. See the pendingWrites
// middleware below for the full rationale.
const { AsyncLocalStorage } = require('async_hooks');
const requestStore = new AsyncLocalStorage();

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3500;
const JWT_SECRET = process.env.JWT_SECRET || 'xnico-dashboard-secret-key-2024-v2';
const DISCORD_CLIENT_ID = process.env.CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const DISCORD_REDIRECT = process.env.DISCORD_REDIRECT || `http://localhost:${PORT}/api/auth/discord/callback`;
const BOT_TOKEN = process.env.TOKEN || '';
const FRONTEND_URL = process.env.FRONTEND_URL || '';

console.log(`[Dashboard] Auth Config: Redirect=${DISCORD_REDIRECT}`);
console.log(`[Dashboard] JWT Secret: ${JWT_SECRET.substring(0, 5)}... (LOADED)`);

app.set('trust proxy', true);
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const jsonStore = require('../utils/jsonStore');
const botCustomize = require('../utils/botCustomize');
const { notifyStoreUpdate } = require('../utils/storeSync');

/*
 * ──────────────────────────────────────────────────────────────────────
 * Dashboard <-> Bot sync model
 * ──────────────────────────────────────────────────────────────────────
 * All module config endpoints read/write via jsonStore (writeBotStore =
 * jsonStore.writeImmediate). jsonStore now emits an 'update' event on
 * every write/writeImmediate AND on every PostgreSQL poll refresh.
 * The bot subscribes to those events via utils/storeSync.js, which fans
 * out to global.updateAutomodCache / global.reloadAntinukeCache /
 * botCustomize.invalidateCache / etc. so the in-memory caches stay
 * fresh whether the dashboard is in the same process (sync) or in a
 * separate process (3s PG poll).
 *
 * The storeSync listener is the SINGLE source of truth for cache
 * invalidation. Route handlers below MUST NOT also call the per-guild
 * `global.update*Cache` functions inline — that would double-apply
 * every write.
 * ──────────────────────────────────────────────────────────────────────
 */

// Map module names from the generic /:module route to jsonStore names.
// Most are 1:1; a few dashboard-friendly aliases collapse to the same store.
const MODULE_TO_STORE = {
    voice: 'join2create',
    'media-only': 'media-only',
    'bot-customize': 'bot-customize',
    'economy-settings': 'economy-settings',
    'social-notify': 'social-notify',
    'vote-config': 'vote-config',
    confessions: 'confessions',
    serverstats: 'serverstats',
    // Newer systems exposed by recent commits — keep these in sync with
    // the bot's store names so dashboard-driven writes invalidate the
    // right cache via storeSync.
    'screenshot-verify':             'screenshot-verify',
    'screenshot-verify-submissions': 'screenshot-verify-submissions',
    'custom-shop':                   'custom-shop',
    // Dashboard exposes "logging" with friendly field names (modLog,
    // messageLog, ...) but the bot reads the 'logs' store with shorter
    // keys (moderation, message, ...). The translation lives in the
    // logging-specific GET/PUT handlers further below; here we just
    // make sure cache-invalidation events fire on the right store.
    logging: 'logs'
};

function notifyModuleUpdate(moduleName, guildId, updated) {
    if (!moduleName) return;
    try {
        const storeName = MODULE_TO_STORE[moduleName] || moduleName;
        // Read the just-written snapshot back so the listener receives a
        // canonical view (matches what jsonStore would have emitted on
        // writeImmediate). The listener is the SINGLE source of truth
        // for cache invalidation — do NOT also invoke per-guild
        // global.update*Cache here, that would double-apply every write.
        const all = readBotStore(storeName) || {};
        notifyStoreUpdate(storeName, all);
    } catch {}
}

// Vercel Serverless Init Middleware
let jsonStoreInitPromise = null;
app.use(async (req, res, next) => {
    if (req.path.startsWith('/api/') && !jsonStore.initialized) {
        if (!jsonStoreInitPromise) {
            jsonStoreInitPromise = jsonStore.init().catch(err => {
                console.error('[Dashboard] Serverless Init Error:', err);
            });
        }
        await jsonStoreInitPromise;
    }
    next();
});

// ── Per-request "pending writes" tracker ─────────────────────────────────────
//
// Vercel (and any serverless host) freezes the function as soon as the
// HTTP response is sent. Background promises that haven't resolved
// yet are silently killed. That's why dashboard PUTs appeared to
// "succeed" on the dashboard but never reached the bot — the PG
// upsert was still in flight when the sandbox got frozen.
//
// This middleware uses Node's AsyncLocalStorage so the "current
// request" survives await boundaries (a module-scoped `let` is NOT
// safe here because async route handlers interleave). Every call
// to `writeBotStore` looks up the active context via
// `requestStore.getStore()` and pushes its persist promise onto
// `pendingWrites`. The wrapped `res.json` awaits all of them before
// flushing the response so the serverless host doesn't freeze us
// mid-PG-upsert.
//
// Routes don't need to change — every call to `writeBotStore`
// already participates. Routes that already `await writeBotStore`
// directly are unaffected (the promise just resolves twice).
app.use((req, res, next) => {
    const ctx = { pendingWrites: [] };
    const origJson = res.json.bind(res);
    res.json = function patchedJson(body) {
        const writes = ctx.pendingWrites.splice(0);
        if (writes.length === 0) return origJson(body);
        return Promise.allSettled(writes).then(() => origJson(body));
    };
    requestStore.run(ctx, () => next());
});

// ── Data Store ───────────────────────────────────────────────────────────────
let DATA_DIR = path.join(__dirname, 'data');
try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch(e) {
    DATA_DIR = '/tmp/xnico_dashboard_data';
    try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e2) {}
}

function readJSON(file, fallback = {}) {
    let fallbackData = typeof fallback === 'function' ? fallback() : (Array.isArray(fallback) ? [...fallback] : { ...fallback });
    try {
        if (jsonStore.initialized) {
            const storeName = 'dash_' + file.replace('.json', '');
            if (jsonStore.has(storeName)) {
                return jsonStore.read(storeName);
            }
        }
        if (fs.existsSync(path.join(DATA_DIR, file))) {
            return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
        }
    } catch { }
    return fallbackData;
}

function writeJSON(file, data) {
    try {
        if (jsonStore.initialized) {
            const storeName = 'dash_' + file.replace('.json', '');
            jsonStore.writeImmediate(storeName, data);
        }
        fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
    } catch (e) { }
}

// Try to read from bot's jsonStore data
function readBotStore(storeName) {
    if (!jsonStore.initialized) return null;
    return jsonStore.read(storeName);
}

/**
 * Write a store and wait until it's actually been persisted to
 * PostgreSQL (or the local file in fallback mode).
 *
 * IMPORTANT: callers MUST `await` this in serverless environments
 * (Vercel, Cloudflare, AWS Lambda) because the function host freezes
 * the sandbox the moment the HTTP response is sent. A non-awaited
 * write that happens to be in-flight when the response goes out can
 * be dropped silently — which is exactly why dashboard saves were
 * "not applying" on the bot host. The bot polls PG every 3s and
 * only sees changes that actually committed.
 *
 * For routes that haven't been refactored to `await writeBotStore()`
 * directly, the per-request `pendingWrites` middleware below tracks
 * the returned promise on `res.locals.pendingWrites` and the
 * `res.json` shim awaits the bundle before flushing the response.
 */
function writeBotStore(storeName, data) {
    if (!jsonStore.initialized) return Promise.resolve();
    let promise;
    if (typeof jsonStore.writeImmediate === 'function') {
        promise = Promise.resolve(jsonStore.writeImmediate(storeName, data));
    } else {
        jsonStore.write(storeName, data);
        promise = Promise.resolve();
    }
    // Track on the active request's pendingWrites bag so the response
    // shim waits for PG to commit before Vercel freezes the sandbox.
    const ctx = requestStore.getStore();
    if (ctx && Array.isArray(ctx.pendingWrites)) {
        ctx.pendingWrites.push(promise.catch(err =>
            console.error(`[Dashboard] writeBotStore(${storeName}) failed:`, err?.message || err)
        ));
    }
    return promise;
}

/**
 * Race-safe single-guild update. Re-reads the latest row from PG
 * before applying the mutation so concurrent bot writes aren't
 * clobbered. See utils/jsonStore.js → updateGuildEntry for the full
 * rationale. Returns the updated guild entry.
 */
async function updateGuildStore(storeName, guildId, mutator) {
    if (!jsonStore.initialized) return null;
    if (typeof jsonStore.updateGuildEntry === 'function') {
        return jsonStore.updateGuildEntry(storeName, guildId, mutator);
    }
    // Legacy fallback (shouldn't happen post-update)
    const all = jsonStore.read(storeName) || {};
    const before = all[guildId] || {};
    const after = mutator(before, all);
    all[guildId] = (after && typeof after === 'object') ? after : before;
    await writeBotStore(storeName, all);
    return all[guildId];
}

// (jsonStore.init moved to end of file to wrap app.listen)

// Init default admin
(function initUsers() {
    const users = readJSON('users.json', []);
    if (users.length === 0) {
        users.push({ id: 'usr_' + Date.now(), username: 'admin', email: 'admin@xnico.bot', password: bcrypt.hashSync('admin123', 10), role: 'owner', avatar: null, createdAt: new Date().toISOString() });
        writeJSON('users.json', users);
    }
})();

// Init analytics
(function initAnalytics() {
    if (readJSON('analytics.json', null)) return;
    const days = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        days.push({ date: d.toISOString().split('T')[0], commands: Math.floor(Math.random() * 500) + 100, messages: Math.floor(Math.random() * 2000) + 500, members: Math.floor(Math.random() * 50) + 10 });
    }
    writeJSON('analytics.json', { totalCommands: 156820, totalMessages: 892450, totalMembers: 4240, totalGuilds: 3, uptime: 99.8, avgResponseTime: 42, daily: days });
})();

// Init mod logs
(function initModLogs() {
    if (readJSON('modlogs.json', null)) return;
    writeJSON('modlogs.json', [
        { id: 1, type: 'ban', user: 'SpamBot#0001', moderator: 'Admin', reason: 'Spamming', guild: 'xNico Support', guildId: '1', timestamp: new Date(Date.now() - 3600000).toISOString() },
        { id: 2, type: 'warn', user: 'TrollUser#1234', moderator: 'Mod1', reason: 'Toxic behavior', guild: 'Gaming Hub', guildId: '2', timestamp: new Date(Date.now() - 7200000).toISOString() }
    ]);
})();

// ── Auth Middleware ───────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
    const t = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!t) {
        console.warn('[Auth] No token found in request.');
        return res.status(401).json({ error: 'Token missing' });
    }
    try {
        req.user = jwt.verify(t, JWT_SECRET);
        next();
    } catch (err) {
        console.error('[Auth] JWT Verification Failed:', err.message);
        return res.status(401).json({ error: 'Verification failed: ' + err.message });
    }
}

// ── Bot Info (public, no auth) ───────────────────────────────────────────────
app.get('/api/bot-info', async (req, res) => {
    try {
        const r = await fetch(`https://discord.com/api/v10/users/${DISCORD_CLIENT_ID}`, {
            headers: { Authorization: `Bot ${process.env.TOKEN}` }
        });
        const bot = await r.json();
        const avatarUrl = bot.avatar
            ? `https://cdn.discordapp.com/avatars/${bot.id}/${bot.avatar}.${bot.avatar.startsWith('a_') ? 'gif' : 'png'}?size=256`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(bot.discriminator || '0') % 5}.png`;
        res.json({ id: bot.id, username: bot.username, avatar: avatarUrl, banner_color: bot.banner_color });
    } catch (e) { res.json({ id: DISCORD_CLIENT_ID, username: 'xNico', avatar: '', banner_color: null }); }
});

app.get('/api/stats', (req, res) => {
    // Attempt to read live analytics if available, fallback to defaults
    const stats = readJSON('analytics.json', { totalCommands: 591, totalGuilds: 5, uptime: 99.9 });
    res.json(stats);
});

// ── Discord OAuth2 ───────────────────────────────────────────────────────────
app.get('/api/auth/discord', (req, res) => {
    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: DISCORD_REDIRECT,
        response_type: 'code',
        scope: 'identify guilds'
    });
    res.json({ url: `https://discord.com/api/oauth2/authorize?${params}` });
});

// Direct redirect endpoint — browser navigates here directly
app.get('/api/auth/discord/redirect', (req, res) => {
    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: DISCORD_REDIRECT,
        response_type: 'code',
        scope: 'identify guilds'
    });
    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// Fallback for common redirect URI patterns
app.get(['/auth/callback', '/callback'], (req, res) => {
    res.redirect(`/api/auth/discord/callback?${new URLSearchParams(req.query).toString()}`);
});

app.get('/api/auth/discord/callback', async (req, res) => {
    const { code } = req.query;
    console.log('[Auth] Step 1: Callback received, code:', code ? 'present' : 'MISSING');
    if (!code) return res.redirect('/?error=no_code');
    try {
        // Step 2: Exchange code for Discord access token
        console.log('[Auth] Step 2: Exchanging code with Discord...');
        console.log('[Auth]   client_id:', DISCORD_CLIENT_ID);
        console.log('[Auth]   redirect_uri:', DISCORD_REDIRECT);
        const tokenParams = new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: DISCORD_REDIRECT });
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenParams.toString()
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
            console.error('[Auth] Step 2 FAILED - Discord token exchange error:', JSON.stringify(tokenData));
            return res.redirect('/?error=token_failed');
        }
        console.log('[Auth] Step 2 OK: Got Discord access token');

        // Step 3: Get user info from Discord
        console.log('[Auth] Step 3: Fetching Discord user info...');
        const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
        const discordUser = await userRes.json();
        console.log('[Auth] Step 3 OK: User:', discordUser.username, 'ID:', discordUser.id);

        // Step 4: Get user guilds
        console.log('[Auth] Step 4: Fetching user guilds...');
        const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
        const userGuilds = await guildsRes.json();
        console.log('[Auth] Step 4 OK: Found', Array.isArray(userGuilds) ? userGuilds.length : 0, 'guilds');

        // Step 5: Save user to local DB
        console.log('[Auth] Step 5: Saving user to DB...');
        const users = readJSON('users.json', []);
        let user = users.find(u => u.discordId === discordUser.id);
        if (!user) {
            user = { id: 'usr_' + Date.now(), discordId: discordUser.id, username: discordUser.username, email: discordUser.email || '', avatar: discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : null, role: 'user', createdAt: new Date().toISOString() };
            users.push(user);
            console.log('[Auth] Step 5: Created new user:', user.id);
        } else {
            user.username = discordUser.username;
            user.avatar = discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : user.avatar;
            console.log('[Auth] Step 5: Updated existing user:', user.id);
        }
        writeJSON('users.json', users);

        // Save user guilds (filter to admin/manage perms)
        const adminGuilds = (Array.isArray(userGuilds) ? userGuilds : []).filter(g => (g.permissions & 0x8) === 0x8 || (g.permissions & 0x20) === 0x20);
        writeJSON(`guilds_${discordUser.id}.json`, adminGuilds);
        console.log('[Auth] Step 5 OK: Saved', adminGuilds.length, 'admin guilds');

        // Step 6: Create JWT and redirect
        const jwtToken = jwt.sign({ id: user.id, discordId: discordUser.id, username: discordUser.username, role: user.role, avatar: user.avatar, accessToken: tokenData.access_token }, JWT_SECRET, { expiresIn: '7d' });
        console.log('[Auth] Step 6: JWT created, length:', jwtToken.length);

        const host = req.get('host');
        const isSecure = req.protocol === 'https';

        res.cookie('token', jwtToken, {
            httpOnly: false,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
            sameSite: isSecure ? 'none' : 'lax',
            secure: isSecure
        });

        const redirectURL = `/?token=${jwtToken}`;
        console.log('[Auth] Step 7: Redirecting to /?token=... (length:', redirectURL.length, ')');
        res.redirect(redirectURL);
    } catch (e) {
        console.error('[Auth] OAuth EXCEPTION:', e.message, e.stack?.split('\n')[1]);
        res.redirect('/?error=oauth_failed');
    }
});

// ── Standard Auth ────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const users = readJSON('users.json', []);
    const user = users.find(u => (u.username === username || u.email === username) && u.password);
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
    const t = jwt.sign({ id: user.id, discordId: user.discordId, username: user.username, role: user.role, email: user.email, avatar: user.avatar }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', t, { httpOnly: false, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ token: t, user: { id: user.id, username: user.username, email: user.email, role: user.role, avatar: user.avatar } });
});

app.post('/api/auth/register', (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });
    const users = readJSON('users.json', []);
    if (users.find(u => u.username === username)) return res.status(409).json({ error: 'Username taken' });
    const hash = bcrypt.hashSync(password, 10);
    const u = { id: 'usr_' + Date.now(), username, email, password: hash, role: 'viewer', avatar: null, createdAt: new Date().toISOString() };
    users.push(u);
    writeJSON('users.json', users);
    const t = jwt.sign({ id: u.id, username: u.username, role: u.role, email: u.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token: t, user: { id: u.id, username: u.username, email: u.email, role: u.role } });
});

app.post('/api/auth/logout', (req, res) => { res.clearCookie('token'); res.json({ success: true }); });
app.get('/api/auth/me', authMiddleware, (req, res) => { res.json({ user: req.user }); });

// ── User's Discord Guilds ────────────────────────────────────────────────────
app.get('/api/guilds/me', authMiddleware, async (req, res) => {
    if (req.user.discordId) {
        // Get saved guilds
        let guilds = readJSON(`guilds_${req.user.discordId}.json`, []);
        // Try refresh from Discord API
        if (req.user.accessToken) {
            try {
                const r = await fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${req.user.accessToken}` } });
                if (r.ok) {
                    const all = await r.json();
                    guilds = all.filter(g => (g.permissions & 0x8) === 0x8 || (g.permissions & 0x20) === 0x20);
                    writeJSON(`guilds_${req.user.discordId}.json`, guilds);
                }
            } catch { }
        }
        // Get bot guilds to mark which ones bot is in
        let botGuildIds = new Set();
        if (BOT_TOKEN) {
            try {
                const r = await fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bot ${BOT_TOKEN}` } });
                if (r.ok) { const bg = await r.json(); bg.forEach(g => botGuildIds.add(g.id)); }
            } catch { }
        }
        const result = guilds.map(g => ({
            ...g,
            icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
            botPresent: botGuildIds.has(g.id)
        }));
        return res.json(result);
    }
    res.json([]);
});

// ── Guild Config (Welcomer, AutoMod, etc.) ───────────────────────────────────

/**
 * Translate the dashboard's "logging" payload (UI field names like
 * `modLog`, `messageLog`) to the bot's "logs" store schema (short keys
 * like `moderation`, `message`). This is what makes the Audit Logging
 * module actually take effect — without translation the bot keeps
 * reading from `logs` while the dashboard writes to a parallel store
 * the bot never reads.
 */
function dashboardLoggingToBot(uiCfg, prevBotCfg = {}) {
    const out = { ...prevBotCfg };
    if (uiCfg && typeof uiCfg === 'object') {
        if ('modLog' in uiCfg)         out.moderation = uiCfg.modLog || null;
        if ('messageLog' in uiCfg)     out.message    = uiCfg.messageLog || null;
        if ('memberLog' in uiCfg)      out.member     = uiCfg.memberLog || null;
        if ('serverLog' in uiCfg)      out.server     = uiCfg.serverLog || null;
        if ('voiceLog' in uiCfg)       out.voice      = uiCfg.voiceLog || null;
        if ('ignoredChannels' in uiCfg) out.ignoredChannels = uiCfg.ignoredChannels || [];
        // Preserve mode + webhooks if they were set elsewhere (e.g. /logging-setup).
        if ('mode' in uiCfg)           out.mode       = uiCfg.mode;
        if ('webhooks' in uiCfg)       out.webhooks   = uiCfg.webhooks;
    }
    return out;
}

/**
 * Inverse translation: the dashboard reads from the same `logs` store
 * but UI components expect the friendly key names.
 */
function botLoggingToDashboard(botCfg) {
    if (!botCfg || typeof botCfg !== 'object') return {};
    return {
        enabled: !!(botCfg.message || botCfg.member || botCfg.server || botCfg.moderation || botCfg.voice),
        modLog: botCfg.moderation || null,
        messageLog: botCfg.message || null,
        memberLog: botCfg.member || null,
        serverLog: botCfg.server || null,
        voiceLog: botCfg.voice || null,
        ignoredChannels: botCfg.ignoredChannels || [],
        mode: botCfg.mode || 'bot',
        webhooks: botCfg.webhooks || {}
    };
}

function getGuildModuleConfig(guildId, module) {
    const storeName = MODULE_TO_STORE[module] || module;
    const botData = readBotStore(storeName);
    if (!botData || !botData[guildId]) return null;

    if (module === 'logging') {
        return botLoggingToDashboard(botData[guildId]);
    }
    return botData[guildId];
}

function setGuildModuleConfig(guildId, module, config) {
    const storeName = MODULE_TO_STORE[module] || module;
    let botData = readBotStore(storeName) || {};

    if (module === 'logging') {
        // Merge translated UI payload onto existing bot-side row so we
        // don't clobber `mode` / `webhooks` set via /logging-setup.
        botData[guildId] = dashboardLoggingToBot(config, botData[guildId] || {});
    } else {
        botData[guildId] = config;
    }
    writeBotStore(storeName, botData);
}

// Welcomer defaults
function getWelcomerDefaults() {
    return {
        enabled: false, channelId: null, mode: 'components', content: 'Welcome {user} to **{server}**! We now have {membercount} members.', title: null, description: null, color: '#bcf1e4', image: null, thumbnail: null, footer: null, author: null, pingUser: false, colorless: false, dmWelcome: { enabled: false, content: 'Welcome to **{server}**!' }, autoDelete: 0, buttons: [], actionButtons: [], actionMenus: [], buttonPosition: 'bottom', imagePosition: 'bottom',
        canvas: { enabled: false, backgroundColor: '#23272a', accentColor: '#bcf1e4', textColor: '#ffffff', backgroundImage: null, customMessage: null, fontFamily: null },
        leave: { enabled: false, channelId: null, mode: 'components', content: 'Goodbye **{username}**! We now have {membercount} members.', title: null, color: '#ED4245', colorless: false, image: null, thumbnail: null, footer: null, author: null, buttons: [], actionButtons: [], actionMenus: [], buttonPosition: 'bottom', imagePosition: 'bottom', canvas: { enabled: false, backgroundColor: '#23272a', accentColor: '#ed4245', textColor: '#ffffff', backgroundImage: null, customMessage: null, fontFamily: null } }
    };
}

// AutoMod defaults
function getAutomodDefaults() {
    return { enabled: false, badWords: { enabled: false, words: [], action: 'delete' }, spam: { enabled: false, messageLimit: 5, timeWindow: 5000, action: 'timeout' }, links: { enabled: false, action: 'delete', whitelist: [] }, invites: { enabled: false, action: 'delete' }, massMention: { enabled: false, limit: 5, action: 'delete' }, caps: { enabled: false, percentage: 70, minLength: 10, action: 'delete' }, profanity: { enabled: false, action: 'delete' }, sexualContent: { enabled: false, action: 'delete' }, slurs: { enabled: false, action: 'delete' }, logChannel: null, ignoredRoles: [], ignoredChannels: [], bypassRoleId: null };
}

// Generic module config endpoints
const MODULE_DEFAULTS = {
    welcomer: getWelcomerDefaults,
    automod: getAutomodDefaults,
    leveling: () => ({ enabled: false, xpPerMessage: 15, xpCooldown: 60, announcements: { enabled: true, channel: null, message: 'Congrats {user}! You reached level {level}!' }, noXpRoles: [], noXpChannels: [], levelRoles: {}, xpMultiplier: 1 }),
    economy: () => ({ enabled: false, startingBalance: 0, dailyReward: 1000, currency: '<:Money:1473377877239140529>', currencyName: 'coins', weeklyReward: 5000, workMinReward: 100, workMaxReward: 300, robChance: 50, robEnabled: true, gamblingEnabled: true, shopEnabled: true }),
    tickets: () => ({ enabled: false, categoryId: null, supportRoleId: null, maxOpen: 5, logChannel: null, closeConfirmation: true, transcripts: true, dmOnClose: true, autoClose: 0, welcomeMessage: 'Support will be with you shortly.' }),
    logging: () => ({ enabled: false, modLog: null, messageLog: null, memberLog: null, serverLog: null, voiceLog: null, ignoredChannels: [] }),
    music: () => ({ enabled: true, defaultVolume: 80, maxQueueSize: 100, djRoleId: null, voteSkip: true, announce: true }),
    antinuke: () => ({
        enabled: false,
        banProtection: { enabled: false, limit: 3, timeWindow: 60000, action: 'remove_roles' },
        kickProtection: { enabled: false, limit: 3, timeWindow: 60000, action: 'remove_roles' },
        channelDelete: { enabled: false, limit: 2, timeWindow: 60000, action: 'remove_roles' },
        channelCreate: { enabled: false, limit: 3, timeWindow: 60000, action: 'remove_roles' },
        roleDelete: { enabled: false, limit: 2, timeWindow: 60000, action: 'remove_roles' },
        roleCreate: { enabled: false, limit: 3, timeWindow: 60000, action: 'remove_roles' },
        webhookCreate: { enabled: false, limit: 2, timeWindow: 60000, action: 'remove_roles' },
        botAdd: { enabled: false, action: 'kick_bot' },
        whitelistedUsers: [],
        bypassRoleId: null,
        logChannel: null
    }),
    verification: () => ({ enabled: false, type: 'button', roleId: null, channelId: null, message: 'Click the button below to verify yourself!', logChannel: null }),
    starboard: () => ({ enabled: false, channelId: null, minStars: 3, emoji: '⭐', selfStar: false, ignoredChannels: [] }),
    autorole: () => ({ humans: [], bots: [] }),
    antialt: () => ({ enabled: false, minAge: 7, action: 'kick', logChannel: null }),
    antiraid: () => ({ enabled: false, joinLimit: 10, timeWindow: 10, action: 'kick', logChannel: null }),
    antispam: () => ({ enabled: false, messageSpam: { enabled: false, limit: 5, time: 5, action: 'timeout' }, emojiSpam: { enabled: false, limit: 10, action: 'delete' }, capsSpam: { enabled: false, percentage: 80, minLength: 10, action: 'delete' }, linkSpam: { enabled: false, limit: 3, action: 'delete' }, imageSpam: { enabled: false, limit: 5, action: 'delete' }, stickerSpam: { enabled: false, limit: 5, action: 'delete' }, mentionSpam: { enabled: false, limit: 5, action: 'timeout' }, duplicateSpam: { enabled: false, limit: 3, action: 'delete' }, inviteSpam: { enabled: false, action: 'delete' }, newlineSpam: { enabled: false, limit: 15, action: 'delete' }, ignoredRoles: [], ignoredChannels: [], logChannel: null }),
    antilink: () => ({ enabled: false, action: 'delete', whitelistedLinks: [], whitelistedRoles: [], whitelistedChannels: [], logChannel: null }),
    suggestions: () => ({ enabled: false, channelId: null, approvedChannelId: null, deniedChannelId: null, allowComments: true, anonymousMode: false }),
    afk: () => ({ enabled: true }),
    'button-commands': () => ({}),
    'select-menus': () => ({}),
    'media-only': () => ({ enabled: false, channels: [] }),
    sticky: () => ({ enabled: false, messages: {} }),
    counting: () => ({ enabled: false, channelId: null, currentCount: 0, lastUserId: null }),
    autoresponder: () => ({ enabled: false, triggers: [] }),
    autoreact: () => ({ enabled: false, triggers: [] }),
    voice: () => ({ enabled: false, j2cChannelId: null, j2cCategoryId: null, j2cUserLimit: 0, j2cBitrate: 64000, voiceRoles: {} }),
    reactionroles: () => ({ enabled: false, panels: [] }),
    giveaway: () => ({ enabled: true }),
    'bot-customize': () => ({ nickname: null, avatarUrl: null, prefix: null, embedColor: '#5865F2', footerText: null, language: 'en', commandCooldown: 5, deleteCommands: false, ephemeralResponses: false }),
    'botignore-config': () => ({ enabled: false, ignoredChannels: [], ignoredRoles: [], ignoredUsers: [], ignoreAllBots: false, ignorePrefix: false }),
    'social-notify': () => ({ youtube: { enabled: false, channels: [], notifyChannel: null, pingRole: null, message: '{channel} uploaded a new video!\n\n**{title}**\n{url}', liveMessage: '🔴 **{channel}** is now LIVE!\n{url}', liveEnabled: true } }),
    'vote-config': () => ({ enabled: false, channelId: null, pingRoleId: null }),
    'economy-settings': () => ({ currency: '<:Money:1473377877239140529>', currencyName: 'coins', dailyReward: 1000, weeklyReward: 5000, workMinReward: 100, workMaxReward: 300, robChance: 50, startingBalance: 0, robEnabled: true, gamblingEnabled: true, shopEnabled: true }),
    'confessions': () => ({ channelId: null, count: 0, log: {} }),
    'serverstats': () => ({ enabled: false, stats: [], channelMap: {}, style: 'default' })
};

// ── Premium status check for a guild ──
app.get('/api/guild/:guildId/premium-status', authMiddleware, (req, res) => {
    const { guildId } = req.params;
    let discordId = req.user.discordId;
    if (!discordId) {
        const users = readJSON('users.json', []);
        const u = users.find(x => x.id === req.user.id);
        if (u) discordId = u.discordId;
    }

    // Check user premium
    let userPremium = false;
    let serverPremium = false;
    let premiumExpiry = null;
    let premiumType = null;

    try {
        const premiumManager = require('../utils/premiumManager');
        userPremium = premiumManager.isPremium(discordId);
        serverPremium = premiumManager.isServerPremium(guildId);

        if (userPremium) {
            const status = premiumManager.getPremiumStatus(discordId);
            premiumExpiry = status.expiresAt;
            premiumType = 'user';
        } else if (serverPremium) {
            const status = premiumManager.getServerPremiumStatus(guildId);
            premiumExpiry = status.expiresAt;
            premiumType = 'server';
        }
    } catch (e) {
        // premiumManager may not be available in dashboard-only mode
        // Fall back to jsonStore check
        try {
            const premiumData = readBotStore('premium') || [];
            const userEntry = premiumData.find(p => p.userId === discordId);
            if (userEntry && (!userEntry.expiresAt || new Date(userEntry.expiresAt) > new Date())) {
                userPremium = true;
                premiumExpiry = userEntry.expiresAt;
                premiumType = 'user';
            }
            const serverData = readBotStore('server-premium') || [];
            const serverEntry = serverData.find(s => s.guildId === guildId);
            if (serverEntry && (!serverEntry.expiresAt || new Date(serverEntry.expiresAt) > new Date())) {
                serverPremium = true;
                if (!userPremium) {
                    premiumExpiry = serverEntry.expiresAt;
                    premiumType = 'server';
                }
            }
        } catch { }
    }

    // Also check if user is a bot owner (always has premium)
    const ownerIds = (process.env.OWNER_IDS || process.env.OWNERS || process.env.OWNER_ID || '').split(',').map(s => s.trim()).filter(Boolean);
    const isOwner = req.user.role === 'owner' || ownerIds.includes(discordId);

    res.json({
        hasPremium: isOwner || userPremium || serverPremium,
        userPremium,
        serverPremium,
        isOwner,
        premiumType: isOwner ? 'owner' : premiumType,
        expiresAt: premiumExpiry,
        supportServer: process.env.SUPPORT_SERVER || 'https://discord.gg/xnico'
    });
});

// ── Guild channels (via bot token) — MUST be before the generic :module route ──
app.get('/api/guild/:guildId/channels', authMiddleware, async (req, res) => {
    if (!BOT_TOKEN) return res.json([]);
    try {
        const r = await fetch(`https://discord.com/api/guilds/${req.params.guildId}/channels`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } });
        if (r.ok) return res.json(await r.json());
    } catch { }
    res.json([]);
});

app.get('/api/guild/:guildId/roles', authMiddleware, async (req, res) => {
    if (!BOT_TOKEN) return res.json([]);
    try {
        const r = await fetch(`https://discord.com/api/guilds/${req.params.guildId}/roles`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } });
        if (r.ok) return res.json(await r.json());
    } catch { }
    res.json([]);
});

app.get('/api/guild/:guildId/analytics', authMiddleware, async (req, res) => {
    // Return mock analytics data for the dashboard UI
    res.json({
        commandsUsed: Math.floor(Math.random() * 5000) + 1000,
        messagesLogged: Math.floor(Math.random() * 1000) + 200,
        activeWarnings: Math.floor(Math.random() * 30),
        economyFlow: Math.floor(Math.random() * 20000) + 5000,
        recentActivity: [
            { time: new Date(Date.now() - 1000 * 60 * 5).toLocaleTimeString(), module: 'AutoMod', action: 'Deleted invite link', user: 'Spammer#1234' },
            { time: new Date(Date.now() - 1000 * 60 * 42).toLocaleTimeString(), module: 'AntiNuke', action: 'Blocked mass channel delete', user: 'RogueAdmin' },
            { time: new Date(Date.now() - 1000 * 60 * 120).toLocaleTimeString(), module: 'AutoMod', action: 'Warned for toxicity', user: 'AngryUser' }
        ]
    });
});

// ── Leveling CRUD (syncs with guilds store + mirror stores) ─────────────────
function readGuildConfig(guildId) {
    const guilds = readBotStore('guilds') || [];
    const arr = Array.isArray(guilds) ? guilds : [];
    let g = arr.find(x => x.guild_id === guildId);
    if (!g) {
        g = { guild_id: guildId, leveling: { enabled: false } };
        arr.push(g);
    }
    return { guilds: arr, guild: g };
}
function writeGuildConfig(guilds) {
    writeBotStore('guilds', guilds);
}

app.get('/api/guild/:guildId/leveling', authMiddleware, (req, res) => {
    const { guild } = readGuildConfig(req.params.guildId);
    const lv = guild.leveling || {};
    // Merge with levelingtoggle for per-channel disables
    const toggleStore = readBotStore('levelingtoggle') || {};
    const tg = toggleStore[req.params.guildId] || { enabled: false, disabledChannels: [] };
    // Mirror stores for fallback data
    const lvRoles = readBotStore('levelroles') || {};
    const lvChannel = readBotStore('levelchannel') || {};
    const lvMult = readBotStore('levelmultiplier') || {};

    res.json({
        enabled: lv.enabled === true || tg.enabled === true,
        xpSettings: {
            minXp: lv.xpSettings?.minXp ?? 15,
            maxXp: lv.xpSettings?.maxXp ?? 25,
            cooldown: lv.xpSettings?.cooldown ?? 60
        },
        multiplier: lv.multiplier ?? 1,
        stackRoles: lv.stackRoles === true,
        roles: Array.isArray(lv.roles) && lv.roles.length ? lv.roles : (lvRoles[req.params.guildId] || []),
        ignoreChannels: lv.ignoreChannels || [],
        ignoreRoles: lv.ignoreRoles || [],
        disabledChannels: tg.disabledChannels || [],
        announcements: {
            enabled: lv.announcements?.enabled !== false,
            channel: lv.announcements?.channel || 'same',
            customChannelId: lv.announcements?.customChannelId || lv.announcementChannel || lvChannel[req.params.guildId] || null,
            message: lv.announcements?.message || 'GG {user}, you just advanced to **Level {level}**!'
        },
        roleMultipliers: lvMult[req.params.guildId] || {}
    });
});

app.put('/api/guild/:guildId/leveling', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const body = req.body || {};

    // 1. Update main guild config (leveling.*)
    const { guilds, guild } = readGuildConfig(gid);
    guild.leveling = guild.leveling || {};
    const lv = guild.leveling;

    if (typeof body.enabled === 'boolean') lv.enabled = body.enabled;
    if (body.xpSettings) {
        lv.xpSettings = {
            minXp: Math.max(1, Math.min(1000, Number(body.xpSettings.minXp) || 15)),
            maxXp: Math.max(1, Math.min(1000, Number(body.xpSettings.maxXp) || 25)),
            cooldown: Math.max(1, Math.min(3600, Number(body.xpSettings.cooldown) || 60))
        };
        if (lv.xpSettings.minXp > lv.xpSettings.maxXp) lv.xpSettings.maxXp = lv.xpSettings.minXp;
    }
    if (body.multiplier !== undefined) lv.multiplier = Math.max(0.1, Math.min(10, Number(body.multiplier) || 1));
    if (typeof body.stackRoles === 'boolean') lv.stackRoles = body.stackRoles;
    if (Array.isArray(body.roles)) {
        lv.roles = body.roles
            .filter(r => r && r.roleId && Number.isInteger(Number(r.level)) && Number(r.level) >= 1)
            .map(r => ({ level: Number(r.level), roleId: String(r.roleId) }))
            .sort((a, b) => a.level - b.level);
    }
    if (Array.isArray(body.ignoreChannels)) lv.ignoreChannels = body.ignoreChannels.map(String);
    if (Array.isArray(body.ignoreRoles)) lv.ignoreRoles = body.ignoreRoles.map(String);
    if (body.announcements) {
        lv.announcements = {
            enabled: body.announcements.enabled !== false,
            channel: ['same', 'dm', 'custom'].includes(body.announcements.channel) ? body.announcements.channel : 'same',
            customChannelId: body.announcements.channel === 'custom' ? (body.announcements.customChannelId || null) : null,
            message: body.announcements.message || 'GG {user}, you just advanced to **Level {level}**!'
        };
        lv.announcementChannel = lv.announcements.channel === 'custom' ? lv.announcements.customChannelId : null;
    }

    guild.updated_at = new Date().toISOString();
    writeGuildConfig(guilds);

    // 2. Sync levelingtoggle store (for per-channel disables + master enable)
    const tStore = readBotStore('levelingtoggle') || {};
    if (!tStore[gid]) tStore[gid] = { enabled: false, disabledChannels: [] };
    if (typeof body.enabled === 'boolean') tStore[gid].enabled = body.enabled;
    if (Array.isArray(body.disabledChannels)) tStore[gid].disabledChannels = body.disabledChannels.map(String);
    writeBotStore('levelingtoggle', tStore);

    // 3. Sync levelroles store (fallback for XP handler)
    if (Array.isArray(body.roles)) {
        const rStore = readBotStore('levelroles') || {};
        rStore[gid] = lv.roles;
        writeBotStore('levelroles', rStore);
    }

    // 4. Sync levelchannel store (legacy fallback)
    if (body.announcements) {
        const cStore = readBotStore('levelchannel') || {};
        if (body.announcements.channel === 'custom' && body.announcements.customChannelId) {
            cStore[gid] = body.announcements.customChannelId;
        } else {
            delete cStore[gid];
        }
        writeBotStore('levelchannel', cStore);
    }

    // 5. Sync levelmultiplier store (per-role multipliers)
    if (body.roleMultipliers && typeof body.roleMultipliers === 'object') {
        const mStore = readBotStore('levelmultiplier') || {};
        const clean = {};
        for (const [roleId, mult] of Object.entries(body.roleMultipliers)) {
            const n = Number(mult);
            if (n >= 0.1 && n <= 10) clean[String(roleId)] = n;
        }
        mStore[gid] = clean;
        writeBotStore('levelmultiplier', mStore);
    }

    res.json({ success: true });
});

// ── Leveling leaderboard (per-user stats) ────────────────────────────────────
app.get('/api/guild/:guildId/leveling/leaderboard', authMiddleware, (req, res) => {
    const xpData = readBotStore('leveling') || {};
    const guildData = xpData[req.params.guildId] || {};
    const rows = Object.entries(guildData).map(([userId, d]) => ({
        userId,
        xp: d.xp || 0,
        level: d.level ?? Math.floor(0.1 * Math.sqrt(d.xp || 0)),
        messages: d.messages || 0,
        lastActive: d.lastXpGain || 0
    })).sort((a, b) => b.xp - a.xp);
    res.json(rows.slice(0, 100));
});

// Reset a single user's XP
app.delete('/api/guild/:guildId/leveling/user/:userId', authMiddleware, (req, res) => {
    const xpData = readBotStore('leveling') || {};
    if (xpData[req.params.guildId]?.[req.params.userId]) {
        delete xpData[req.params.guildId][req.params.userId];
        writeBotStore('leveling', xpData);
        return res.json({ success: true });
    }
    res.status(404).json({ error: 'User has no XP data' });
});

// Reset ALL XP for a guild
app.delete('/api/guild/:guildId/leveling/reset-all', authMiddleware, (req, res) => {
    const xpData = readBotStore('leveling') || {};
    if (xpData[req.params.guildId]) {
        xpData[req.params.guildId] = {};
        writeBotStore('leveling', xpData);
    }
    res.json({ success: true });
});

// Manually set a user's level
app.post('/api/guild/:guildId/leveling/user/:userId/set-level', authMiddleware, (req, res) => {
    const level = Math.max(0, Math.min(1000, parseInt(req.body.level) || 0));
    const xpData = readBotStore('leveling') || {};
    if (!xpData[req.params.guildId]) xpData[req.params.guildId] = {};
    const xp = Math.ceil(Math.pow(level / 0.1, 2));
    xpData[req.params.guildId][req.params.userId] = {
        ...(xpData[req.params.guildId][req.params.userId] || {}),
        xp, level, lastXpGain: 0,
        messages: xpData[req.params.guildId][req.params.userId]?.messages || 0
    };
    writeBotStore('leveling', xpData);
    res.json({ success: true, xp, level });
});

// ── Bot Customize (Premium-gated) ────────────────────────────────────────────
app.get('/api/guild/:guildId/bot-customize-config', authMiddleware, async (req, res) => {
    const gid = req.params.guildId;
    // Check premium
    const premium = await checkPremiumStatus(req, gid);
    if (!premium.hasPremium) return res.status(403).json({ error: 'Premium required', premium });
    const data = readBotStore('bot-customize') || {};
    const cfg = data[gid] || {};
    res.json({
        nickname: cfg.nickname || null,
        avatarUrl: cfg.avatarUrl || null,
        prefix: cfg.prefix || null,
        embedColor: cfg.embedColor || '#5865F2',
        footerText: cfg.footerText || null,
        language: cfg.language || 'en',
        commandCooldown: cfg.commandCooldown || 5,
        deleteCommands: cfg.deleteCommands || false,
        ephemeralResponses: cfg.ephemeralResponses || false
    });
});
app.put('/api/guild/:guildId/bot-customize-config', authMiddleware, async (req, res) => {
    const gid = req.params.guildId;
    const premium = await checkPremiumStatus(req, gid);
    if (!premium.hasPremium) return res.status(403).json({ error: 'Premium required', premium });
    const body = req.body || {};
    const data = readBotStore('bot-customize') || {};
    if (!data[gid]) data[gid] = {};
    const cfg = data[gid];
    if (typeof body.nickname === 'string' || body.nickname === null) cfg.nickname = body.nickname;
    if (typeof body.prefix === 'string' || body.prefix === null) cfg.prefix = body.prefix;
    if (typeof body.embedColor === 'string') cfg.embedColor = body.embedColor;
    if (typeof body.footerText === 'string' || body.footerText === null) cfg.footerText = body.footerText;
    if (typeof body.language === 'string') cfg.language = body.language;
    if (Number.isFinite(Number(body.commandCooldown))) cfg.commandCooldown = Math.max(0, Math.min(60, Number(body.commandCooldown)));
    if (typeof body.deleteCommands === 'boolean') cfg.deleteCommands = body.deleteCommands;
    if (typeof body.ephemeralResponses === 'boolean') cfg.ephemeralResponses = body.ephemeralResponses;
    writeBotStore('bot-customize', data);

    // Mirror the prefix to the 'prefixes' store, which is what
    // index.js getGuildPrefix() actually reads for prefix command parsing.
    // Without this, dashboard prefix changes never take effect on prefix
    // commands until the user runs the /setprefix slash command.
    if (Object.prototype.hasOwnProperty.call(body, 'prefix')) {
        try {
            const prefixes = readBotStore('prefixes') || {};
            const newPrefix = typeof body.prefix === 'string' ? body.prefix.trim() : '';
            if (newPrefix) {
                prefixes[gid] = newPrefix;
            } else {
                delete prefixes[gid];
            }
            writeBotStore('prefixes', prefixes);
        } catch (e) {
            console.error('[Dashboard] Failed to mirror prefix to prefixes store:', e?.message || e);
        }
    }

    // Invalidate the per-guild bot-customize cache (5s TTL otherwise)
    // so prefix / embedColor / footerText / cooldown changes apply
    // immediately when bot and dashboard share a process.
    //
    // NOTE: the storeSync listener also calls invalidateCache() when
    // jsonStore emits 'update' for bot-customize. invalidateCache() is
    // idempotent (just resets _cacheTime to 0), so calling it inline
    // here as well is a no-op safety net rather than a double-apply.
    try { botCustomize.invalidateCache(); } catch {}

    // Live update nickname via Discord API
    if (body.nickname !== undefined && BOT_TOKEN) {
        fetch(`https://discord.com/api/v10/guilds/${gid}/members/@me`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ nick: body.nickname || '' })
        }).catch(() => { });
    }
    res.json(cfg);
});

// Helper: check premium status for a user+guild
function checkPremiumStatus(req, guildId) {
    let discordId = req.user.discordId;
    if (!discordId) {
        const users = readJSON('users.json', []);
        const u = users.find(x => x.id === req.user.id);
        if (u) discordId = u.discordId;
    }
    const ownerIds = (process.env.OWNER_IDS || process.env.OWNERS || process.env.OWNER_ID || '').split(',').map(s => s.trim()).filter(Boolean);
    const isOwner = req.user.role === 'owner' || ownerIds.includes(discordId);
    if (isOwner) return { hasPremium: true, isOwner: true };
    try {
        const premiumManager = require('../utils/premiumManager');
        if (premiumManager.isPremium(discordId) || premiumManager.isServerPremium(guildId)) return { hasPremium: true };
    } catch { }
    const premiumData = readBotStore('premium') || [];
    if (Array.isArray(premiumData) && premiumData.some(p => p.userId === discordId && (!p.expiresAt || new Date(p.expiresAt) > new Date()))) return { hasPremium: true };
    const serverData = readBotStore('server-premium') || [];
    if (Array.isArray(serverData) && serverData.some(s => s.guildId === guildId && (!s.expiresAt || new Date(s.expiresAt) > new Date()))) return { hasPremium: true };
    return { hasPremium: false };
}

// ── Trust System CRUD ─────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/trust-config', authMiddleware, (req, res) => {
    const data = readBotStore('trust') || {};
    const cfg = data[req.params.guildId] || {};
    res.json({
        admins: Array.isArray(cfg.admins) ? cfg.admins : [],
        mods: Array.isArray(cfg.mods) ? cfg.mods : [],
        vcmods: Array.isArray(cfg.vcmods) ? cfg.vcmods : []
    });
});
app.put('/api/guild/:guildId/trust-config', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const body = req.body || {};
    const data = readBotStore('trust') || {};
    if (!data[gid]) data[gid] = { admins: [], mods: [], vcmods: [] };
    if (Array.isArray(body.admins)) data[gid].admins = body.admins.map(String).slice(0, 25);
    if (Array.isArray(body.mods)) data[gid].mods = body.mods.map(String).slice(0, 25);
    if (Array.isArray(body.vcmods)) data[gid].vcmods = body.vcmods.map(String).slice(0, 25);
    writeBotStore('trust', data);
    res.json(data[gid]);
});

// ── Invite Tracking ──────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/invites-config', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    // Read from invites store (the actual invite manager store)
    const invData = readBotStore('invites') || {};
    const cfg = invData[gid] || {};
    // Also read guild_members for leaderboard
    const guildMembers = readBotStore('guild_members') || [];
    const members = guildMembers.filter(m => m.guild_id === gid);
    const topInviters = members
        .filter(m => m.invites && Number(m.invites.invites || 0) > 0)
        .map(m => ({ userId: m.user_id, invites: Number(m.invites.invites || 0), left: Number(m.invites.left || 0), fake: Number(m.invites.fake || 0) }))
        .sort((a, b) => b.invites - a.invites)
        .slice(0, 25);
    // Merge with totals from invite store
    const totals = cfg.totals || {};
    const storeInviters = Object.entries(totals)
        .map(([userId, t]) => ({ userId, invites: (t.regular || 0) + (t.bonus || 0), left: t.left || 0, fake: t.fake || 0, bonus: t.bonus || 0 }))
        .filter(e => e.invites > 0 || e.left > 0)
        .sort((a, b) => b.invites - a.invites)
        .slice(0, 25);
    // Use whichever has more data
    const leaderboard = storeInviters.length >= topInviters.length ? storeInviters : topInviters;

    res.json({
        enabled: cfg.enabled !== false,
        channel: cfg.channel || null,
        rewards: Array.isArray(cfg.rewards) ? cfg.rewards : [],
        leaderboard,
        totalTracked: Object.keys(cfg.members || {}).length || members.length
    });
});
app.put('/api/guild/:guildId/invites-config', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const body = req.body || {};
    const invData = readBotStore('invites') || {};
    if (!invData[gid]) invData[gid] = { invites: {}, members: {}, rewards: [], totals: {}, enabled: true };
    const cfg = invData[gid];
    if (typeof body.enabled === 'boolean') cfg.enabled = body.enabled;
    if (body.channel !== undefined) cfg.channel = body.channel || null;
    if (Array.isArray(body.rewards)) {
        cfg.rewards = body.rewards
            .filter(r => r && Number.isFinite(Number(r.invites)) && r.roleId)
            .map(r => ({ invites: Number(r.invites), roleId: String(r.roleId) }))
            .sort((a, b) => a.invites - b.invites)
            .slice(0, 20);
    }
    writeBotStore('invites', invData);
    res.json({ success: true });
});

// ── Server Stats Channels ────────────────────────────────────────────────────
app.get('/api/guild/:guildId/serverstats-config', authMiddleware, (req, res) => {
    const data = readBotStore('serverstats') || {};
    const cfg = data[req.params.guildId] || {};
    res.json({
        enabled: !!cfg.categoryId || !!(cfg.channels && Object.keys(cfg.channels).length),
        categoryId: cfg.categoryId || null,
        channels: cfg.channels || {}
    });
});
app.put('/api/guild/:guildId/serverstats-config', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const body = req.body || {};
    const data = readBotStore('serverstats') || {};
    if (!data[gid]) data[gid] = {};
    if (body.categoryId !== undefined) data[gid].categoryId = body.categoryId || null;
    if (body.channels && typeof body.channels === 'object') data[gid].channels = body.channels;
    if (body.enabled === false) { delete data[gid]; }
    writeBotStore('serverstats', data);
    res.json({ success: true });
});

// ── Server Backup List ───────────────────────────────────────────────────────
app.get('/api/guild/:guildId/backups', authMiddleware, (req, res) => {
    const data = readBotStore('server_backups') || [];
    const guildBackups = (Array.isArray(data) ? data : [])
        .filter(b => b.guild_id === req.params.guildId || b.guildId === req.params.guildId)
        .map(b => ({ id: b.id || b.backup_id, name: b.name || b.guild_name, createdAt: b.created_at || b.createdAt, size: b.size || '—' }))
        .slice(0, 20);
    res.json(guildBackups);
});

// ── Voice J2C CRUD ───────────────────────────────────────────────────────────
// ── Voice J2C CRUD ───────────────────────────────────────────────────────────
//
// The J2C system was upgraded to a v2 multi-interface schema. The
// dashboard previously exposed only the legacy v1 flat fields
// (`triggerChannelId`, `activeChannels`), which meant a dashboard PUT
// would clobber the new `interfaces` map on save. These endpoints now
// surface the v2 shape directly and pass through `interfaces` as-is.
app.get('/api/guild/:guildId/voice-config', authMiddleware, (req, res) => {
    const data = readBotStore('join2create') || {};
    const raw = data[req.params.guildId] || {};

    // Lazy-migrate legacy v1 → v2 for the read view so dashboards
    // never see the old shape. The bot-side mgr.getGuildConfig does
    // the same migration on read; we just mirror it here.
    let cfg;
    try {
        const j2cMgr = require('../utils/join2createManager');
        cfg = j2cMgr.migrateGuildConfig(raw, req.params.guildId);
    } catch {
        cfg = raw;
    }

    let tier = 'free';
    try {
        const j2cMgr = require('../utils/join2createManager');
        tier = j2cMgr.getGuildTier(req.params.guildId, req.user?.discordId || null);
    } catch {}

    const interfaces = Object.values(cfg.interfaces || {}).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const activeChannelCount = Object.keys(cfg.activeChannels || {}).length;

    res.json({
        schemaVersion: cfg.schemaVersion || 2,
        tier,
        interfaces,
        activeChannelCount,
        // Legacy mirrors for older dashboard widgets that still read these.
        enabled: interfaces.some(i => i.enabled !== false),
        triggerChannelId: interfaces[0]?.triggerChannelId || null,
        activeChannels: activeChannelCount
    });
});
app.put('/api/guild/:guildId/voice-config', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const body = req.body || {};
    const data = readBotStore('join2create') || {};

    // Pull-through migrate before any mutation so we never accidentally
    // overwrite a v2 doc with a v1-shaped patch.
    let cfg;
    try {
        const j2cMgr = require('../utils/join2createManager');
        cfg = j2cMgr.migrateGuildConfig(data[gid] || {}, gid);
    } catch {
        cfg = data[gid] || { schemaVersion: 2, interfaces: {}, activeChannels: {}, analytics: {} };
    }
    cfg.schemaVersion = 2;
    if (!cfg.interfaces)     cfg.interfaces     = {};
    if (!cfg.activeChannels) cfg.activeChannels = {};

    // Accept a partial update of one interface at a time. Body shape:
    //   { interfaceId: 'i_xxx', patch: { name, triggerChannelId, ... } }
    if (typeof body.interfaceId === 'string' && body.patch && typeof body.patch === 'object') {
        const iface = cfg.interfaces[body.interfaceId];
        if (!iface) {
            return res.status(404).json({ error: 'Interface not found.' });
        }
        const allowed = ['name', 'slug', 'emoji', 'triggerChannelId', 'categoryId', 'interfaceChannelId', 'controlPanelMessageId', 'maxUsers', 'bitrate', 'namingTemplate', 'allowedRoles', 'deniedRoles', 'visibility', 'autoDelete', 'enabled'];
        for (const key of allowed) {
            if (body.patch[key] !== undefined) iface[key] = body.patch[key];
        }
        iface.updatedAt = Date.now();
        cfg.interfaces[body.interfaceId] = iface;
    }

    // Legacy compatibility — older dashboards send a flat triggerChannelId
    // and `enabled` toggle. Translate them onto the first interface (or
    // create one if none exists yet) so existing UI widgets keep working.
    if (typeof body.enabled === 'boolean' || body.triggerChannelId !== undefined) {
        const list = Object.values(cfg.interfaces);
        let iface = list[0];
        if (!iface) {
            const id = 'i_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            iface = {
                id, name: 'Default Room', slug: 'default',
                emoji: '<:Volumeup:1473039290136002844>',
                triggerChannelId: null, categoryId: null,
                interfaceChannelId: null, controlPanelMessageId: null,
                maxUsers: 0, bitrate: 96,
                namingTemplate: "{user}'s Channel",
                allowedRoles: [], deniedRoles: [],
                visibility: 'public', autoDelete: true,
                enabled: true,
                createdAt: Date.now(), updatedAt: Date.now()
            };
            cfg.interfaces[id] = iface;
        }
        if (typeof body.enabled === 'boolean') iface.enabled = body.enabled;
        if (body.triggerChannelId !== undefined) iface.triggerChannelId = body.triggerChannelId || null;
        iface.updatedAt = Date.now();
    }

    data[gid] = cfg;
    writeBotStore('join2create', data);
    res.json({ success: true });
});

// ── Reaction Roles CRUD ──────────────────────────────────────────────────────
app.get('/api/guild/:guildId/reactionroles-config', authMiddleware, (req, res) => {
    const data = readBotStore('reactionroles') || {};
    const cfg = data[req.params.guildId] || {};
    const panels = Array.isArray(cfg.panels) ? cfg.panels : Object.values(cfg).filter(v => v && typeof v === 'object' && v.messageId);
    res.json({ panels: panels.slice(0, 25) });
});

// ── Media-Only CRUD ──────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/media-only-config', authMiddleware, (req, res) => {
    const data = readBotStore('media-only') || {};
    const cfg = data[req.params.guildId] || {};
    res.json({ channels: Array.isArray(cfg.channels) ? cfg.channels : [] });
});
app.put('/api/guild/:guildId/media-only-config', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const body = req.body || {};
    const data = readBotStore('media-only') || {};
    if (!data[gid]) data[gid] = {};
    if (Array.isArray(body.channels)) data[gid].channels = body.channels.map(String).slice(0, 25);
    writeBotStore('media-only', data);
    res.json({ success: true });
});

// ── AFK CRUD ─────────────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/afk-config', authMiddleware, (req, res) => {
    const data = readBotStore('afk') || {};
    const guildAfk = {};
    // AFK is stored per-user globally: { [userId]: { reason, since, guildId } }
    let count = 0;
    for (const [uid, info] of Object.entries(data)) {
        if (info && info.guildId === req.params.guildId) count++;
    }
    res.json({ activeAfkUsers: count });
});

// ── Sticky Messages CRUD ─────────────────────────────────────────────────────
app.get('/api/guild/:guildId/sticky-config', authMiddleware, (req, res) => {
    const data = readBotStore('sticky') || {};
    const cfg = data[req.params.guildId] || {};
    const messages = Object.entries(cfg).map(([channelId, m]) => ({
        channelId,
        content: typeof m === 'string' ? m : (m?.content || m?.message || ''),
        type: m?.type || 'text'
    }));
    res.json({ messages });
});
app.put('/api/guild/:guildId/sticky-config', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const body = req.body || {};
    const data = readBotStore('sticky') || {};
    if (!data[gid]) data[gid] = {};
    // Add a sticky
    if (body.add && body.add.channelId && body.add.content) {
        data[gid][body.add.channelId] = { content: body.add.content, type: body.add.type || 'text', messageId: null };
    }
    // Remove a sticky
    if (body.remove && body.remove.channelId) {
        delete data[gid][body.remove.channelId];
    }
    writeBotStore('sticky', data);
    res.json({ success: true });
});

// ── Autorole CRUD ────────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/autorole-config', authMiddleware, (req, res) => {
    const data = readBotStore('autorole') || {};
    const cfg = data[req.params.guildId] || {};
    res.json({
        humans: Array.isArray(cfg.humans) ? cfg.humans : (typeof cfg === 'string' ? [cfg] : []),
        bots: Array.isArray(cfg.bots) ? cfg.bots : []
    });
});
app.put('/api/guild/:guildId/autorole-config', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const body = req.body || {};
    const data = readBotStore('autorole') || {};
    data[gid] = {
        humans: Array.isArray(body.humans) ? body.humans.map(String).slice(0, 10) : [],
        bots: Array.isArray(body.bots) ? body.bots.map(String).slice(0, 10) : []
    };
    writeBotStore('autorole', data);
    res.json(data[gid]);
});

// ── Suggestions CRUD ─────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/suggestions-config', authMiddleware, (req, res) => {
    const data = readBotStore('suggestions') || {};
    const cfg = data[req.params.guildId] || {};
    res.json({
        channelId: cfg.channelId || null,
        logsChannelId: cfg.logsChannelId || null,
        voteThreshold: cfg.voteThreshold || 10,
        threadSlowmode: cfg.threadSlowmode || 0,
        totalSuggestions: cfg.nextId ? cfg.nextId - 1 : Object.keys(cfg.suggestions || {}).length
    });
});
app.put('/api/guild/:guildId/suggestions-config', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const body = req.body || {};
    const data = readBotStore('suggestions') || {};
    if (!data[gid]) data[gid] = { channelId: null, logsChannelId: null, voteThreshold: 10, threadSlowmode: 0, nextId: 1, suggestions: {} };
    const cfg = data[gid];
    if (body.channelId !== undefined) cfg.channelId = body.channelId || null;
    if (body.logsChannelId !== undefined) cfg.logsChannelId = body.logsChannelId || null;
    if (Number.isFinite(Number(body.voteThreshold))) cfg.voteThreshold = Math.max(1, Math.min(100, Number(body.voteThreshold)));
    if (Number.isFinite(Number(body.threadSlowmode))) cfg.threadSlowmode = Math.max(0, Math.min(21600, Number(body.threadSlowmode)));
    writeBotStore('suggestions', data);
    res.json({ success: true });
});

// ── Feedback CRUD ────────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/feedback-config', authMiddleware, (req, res) => {
    const data = readBotStore('feedback') || {};
    const cfg = data[req.params.guildId] || {};
    const ratings = cfg.ratings || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0, count = 0;
    for (let i = 1; i <= 5; i++) { total += i * (ratings[i] || 0); count += (ratings[i] || 0); }
    res.json({
        channelId: cfg.channelId || null,
        logsChannelId: cfg.logsChannelId || null,
        totalCount: cfg.totalCount || count,
        ratings,
        averageRating: count > 0 ? Math.round(total / count * 10) / 10 : 0
    });
});
app.put('/api/guild/:guildId/feedback-config', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const body = req.body || {};
    const data = readBotStore('feedback') || {};
    if (!data[gid]) data[gid] = { channelId: null, logsChannelId: null, totalCount: 0, ratings: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
    const cfg = data[gid];
    if (body.channelId !== undefined) cfg.channelId = body.channelId || null;
    if (body.logsChannelId !== undefined) cfg.logsChannelId = body.logsChannelId || null;
    writeBotStore('feedback', data);
    res.json({ success: true });
});

// ── Screenshot Verify CRUD ───────────────────────────────────────────────────
//
// Surfaces the per-guild config (mode, channels, tasks, behavior) and
// the queue stats. The full editor (creating tasks / actions) lives
// in-bot via `/screenshot-verify panel` because the action engine can
// chain role grants / DMs / channel announcements that the dashboard
// can't easily mirror without a Discord REST round-trip per click.
app.get('/api/guild/:guildId/screenshot-verify-config', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const cfgAll  = readBotStore('screenshot-verify') || {};
    const subsAll = readBotStore('screenshot-verify-submissions') || {};
    const cfg = cfgAll[gid] || {};
    const guildSubs = subsAll[gid] || {};

    let pending = 0, approved = 0, rejected = 0;
    for (const s of Object.values(guildSubs)) {
        if (s.status === 'pending')       pending++;
        else if (s.status === 'approved') approved++;
        else if (s.status === 'rejected') rejected++;
    }

    res.json({
        enabled:             cfg.enabled === true,
        mode:                cfg.mode || 'hybrid',
        verifier:            cfg.verifier || 'hybrid',
        confidenceThreshold: cfg.confidenceThreshold || 75,
        cooldown:            cfg.cooldown || 0,
        autoDelete:          cfg.autoDelete !== false,
        hideAfterVerify:     cfg.hideAfterVerify !== false,
        color:               cfg.color || 0x5865F2,
        submissionChannelId: cfg.submissionChannelId || null,
        reviewChannelId:     cfg.reviewChannelId || null,
        logChannelId:        cfg.logChannelId || null,
        approveMessage:      cfg.approveMessage || '',
        rejectMessage:       cfg.rejectMessage || '',
        tasks:               Array.isArray(cfg.tasks) ? cfg.tasks : [],
        stats: { pending, approved, rejected, total: pending + approved + rejected }
    });
});
app.put('/api/guild/:guildId/screenshot-verify-config', authMiddleware, (req, res) => {
    const gid  = req.params.guildId;
    const body = req.body || {};
    const all = readBotStore('screenshot-verify') || {};
    if (!all[gid]) {
        all[gid] = {
            enabled: false, submissionChannelId: null, reviewChannelId: null, logChannelId: null,
            mode: 'hybrid', verifier: 'hybrid', confidenceThreshold: 75, cooldown: 0,
            autoDelete: true, hideAfterVerify: true, color: 0x5865F2,
            approveMessage: 'Your screenshot was approved.',
            rejectMessage:  'Your screenshot did not pass verification. You may try again.',
            tasks: []
        };
    }
    const cfg = all[gid];

    // Whitelist of mutable top-level keys (we never let dashboard edit
    // `tasks` here — that goes through the in-bot panel because each
    // task may carry actions that spawn role grants / DMs).
    if (typeof body.enabled === 'boolean') cfg.enabled = body.enabled;
    if (['auto', 'review', 'hybrid'].includes(body.mode)) cfg.mode = body.mode;
    if (['ocr', 'ai', 'hybrid'].includes(body.verifier)) cfg.verifier = body.verifier;
    if (typeof body.confidenceThreshold === 'number' && body.confidenceThreshold >= 50 && body.confidenceThreshold <= 100) {
        cfg.confidenceThreshold = Math.round(body.confidenceThreshold);
    }
    if (typeof body.cooldown === 'number' && body.cooldown >= 0) cfg.cooldown = Math.floor(body.cooldown);
    if (typeof body.autoDelete === 'boolean')      cfg.autoDelete = body.autoDelete;
    if (typeof body.hideAfterVerify === 'boolean') cfg.hideAfterVerify = body.hideAfterVerify;
    if (typeof body.color === 'number' && body.color >= 0 && body.color <= 0xFFFFFF) cfg.color = body.color;
    if (body.submissionChannelId !== undefined) cfg.submissionChannelId = body.submissionChannelId || null;
    if (body.reviewChannelId !== undefined)     cfg.reviewChannelId     = body.reviewChannelId || null;
    if (body.logChannelId !== undefined)        cfg.logChannelId        = body.logChannelId || null;
    if (typeof body.approveMessage === 'string') cfg.approveMessage = body.approveMessage.slice(0, 500);
    if (typeof body.rejectMessage === 'string')  cfg.rejectMessage  = body.rejectMessage.slice(0, 500);

    writeBotStore('screenshot-verify', all);
    res.json({ success: true });
});

// ── Custom Shop CRUD ─────────────────────────────────────────────────────────
//
// Admins can list / add / remove custom-shop items via dashboard. Each
// item carries an `action` (give_role / remove_role / send_dm /
// add_coins / custom_reply) plus its `actionData`.
app.get('/api/guild/:guildId/custom-shop-config', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const all = readBotStore('custom-shop') || {};
    const cfg = all[gid] || { items: [] };
    res.json({
        items: Array.isArray(cfg.items) ? cfg.items : []
    });
});
app.put('/api/guild/:guildId/custom-shop-config', authMiddleware, (req, res) => {
    const gid  = req.params.guildId;
    const body = req.body || {};
    const all = readBotStore('custom-shop') || {};
    if (!all[gid]) all[gid] = { items: [] };

    const VALID_ACTIONS = new Set(['give_role', 'remove_role', 'send_dm', 'add_coins', 'custom_reply']);

    if (Array.isArray(body.items)) {
        // Sanitize + clamp every item before persisting. This is a
        // user-controlled write so we cannot trust the shape blindly.
        all[gid].items = body.items.slice(0, 50).map(item => {
            const action = VALID_ACTIONS.has(item?.action) ? item.action : 'custom_reply';
            return {
                name:        String(item?.name || 'Item').slice(0, 50),
                price:       Math.max(1, Math.min(1_000_000_000, parseInt(item?.price, 10) || 1)),
                action,
                actionData:  String(item?.actionData ?? '').slice(0, 1500),
                description: String(item?.description ?? '').slice(0, 200),
                createdBy:   item?.createdBy || req.user?.discordId || 'dashboard',
                createdAt:   item?.createdAt || Date.now()
            };
        });
    }

    writeBotStore('custom-shop', all);
    res.json({ success: true });
});

// ── Tickets CRUD ─────────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/tickets-config', authMiddleware, (req, res) => {
    const data = readBotStore('tickets') || {};
    const cfg = data[req.params.guildId] || {};
    res.json({
        configured: !!cfg.channelId,
        channelId: cfg.channelId || null,
        categoryId: cfg.categoryId || null,
        supportRoleId: cfg.supportRoleId || null,
        panelMessageId: cfg.panelMessageId || null,
        nextTicketNumber: cfg.nextTicketNumber || 0,
        categories: Array.isArray(cfg.categories) ? cfg.categories : [],
        openTickets: Object.keys(cfg.tickets || {}).length,
        hasCustomPanel: !!cfg.panelMessage,
        hasCustomWelcome: !!cfg.welcomeMessage
    });
});

app.put('/api/guild/:guildId/tickets-config', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const body = req.body || {};
    const data = readBotStore('tickets') || {};
    if (!data[gid]) data[gid] = { tickets: {}, nextTicketNumber: 0 };
    const cfg = data[gid];

    if (body.channelId !== undefined) cfg.channelId = body.channelId || null;
    if (body.categoryId !== undefined) cfg.categoryId = body.categoryId || null;
    if (body.supportRoleId !== undefined) cfg.supportRoleId = body.supportRoleId || null;
    if (Array.isArray(body.categories)) {
        cfg.categories = body.categories
            .filter(c => c && c.id && c.label)
            .map(c => ({
                id: String(c.id).toLowerCase().replace(/\s+/g, '-').slice(0, 32),
                label: String(c.label).slice(0, 80),
                emoji: String(c.emoji || '🎫').slice(0, 32),
                description: String(c.description || '').slice(0, 100)
            }));
    }

    writeBotStore('tickets', data);
    res.json({ success: true });
});

// List open tickets
app.get('/api/guild/:guildId/tickets-open', authMiddleware, (req, res) => {
    const data = readBotStore('tickets') || {};
    const cfg = data[req.params.guildId] || {};
    const tickets = cfg.tickets || {};
    const list = Object.entries(tickets).map(([channelId, t]) => ({
        channelId,
        userId: t.userId,
        category: t.category || t.categoryLabel || 'General',
        createdAt: t.createdAt
    }));
    res.json(list);
});

// ── Starboard CRUD ───────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/starboard-config', authMiddleware, (req, res) => {
    const data = readBotStore('starboard') || {};
    const cfg = data[req.params.guildId] || {};
    res.json({
        enabled: !!cfg.channelId,
        channelId: cfg.channelId || null,
        threshold: cfg.threshold || 3,
        starredCount: Object.keys(cfg.starredMessages || {}).length
    });
});
app.put('/api/guild/:guildId/starboard-config', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const body = req.body || {};
    const data = readBotStore('starboard') || {};
    if (body.enabled === false || !body.channelId) {
        delete data[gid];
    } else {
        if (!data[gid]) data[gid] = { starredMessages: {} };
        if (body.channelId) data[gid].channelId = body.channelId;
        if (Number.isFinite(Number(body.threshold))) data[gid].threshold = Math.max(1, Math.min(100, Number(body.threshold)));
    }
    writeBotStore('starboard', data);
    res.json({ success: true });
});

// ── Counting CRUD ────────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/counting-config', authMiddleware, (req, res) => {
    const data = readBotStore('counting') || {};
    const cfg = data[req.params.guildId] || {};
    res.json({
        enabled: !!cfg.channelId,
        channelId: cfg.channelId || null,
        currentCount: cfg.currentCount || 0,
        highScore: cfg.highScore || 0,
        totalCounts: cfg.totalCounts || 0,
        fails: cfg.fails || 0,
        lastUserId: cfg.lastUserId || null
    });
});
app.put('/api/guild/:guildId/counting-config', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const body = req.body || {};
    const data = readBotStore('counting') || {};
    if (body.enabled === false || !body.channelId) {
        delete data[gid];
    } else {
        if (!data[gid]) data[gid] = { currentCount: 0, lastUserId: null, highScore: 0, totalCounts: 0, fails: 0 };
        if (body.channelId) data[gid].channelId = body.channelId;
        if (body.reset) { data[gid].currentCount = 0; data[gid].lastUserId = null; }
    }
    writeBotStore('counting', data);
    res.json({ success: true });
});

// ── Autoreact CRUD ───────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/autoreact-config', authMiddleware, (req, res) => {
    const data = readBotStore('autoreact') || {};
    const cfg = data[req.params.guildId] || { enabled: false, reactions: [] };
    res.json({
        enabled: cfg.enabled || false,
        reactions: Array.isArray(cfg.reactions) ? cfg.reactions : []
    });
});
app.put('/api/guild/:guildId/autoreact-config', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const body = req.body || {};
    const data = readBotStore('autoreact') || {};
    if (!data[gid]) data[gid] = { enabled: false, reactions: [] };
    if (typeof body.enabled === 'boolean') data[gid].enabled = body.enabled;
    if (Array.isArray(body.reactions)) {
        data[gid].reactions = body.reactions
            .filter(r => r && r.trigger && Array.isArray(r.emojis) && r.emojis.length)
            .map(r => ({ trigger: String(r.trigger).toLowerCase().trim(), emojis: r.emojis.map(String).slice(0, 20) }));
    }
    writeBotStore('autoreact', data);
    // The storeSync listener attached to jsonStore handles cache
    // invalidation automatically when writeBotStore -> writeImmediate
    // fires the 'update' event. Calling global.updateAutoreactCache here
    // would double-apply the write (the listener already iterates the
    // fresh snapshot per guild).
    res.json(data[gid]);
});

// ── Giveaway Settings CRUD ───────────────────────────────────────────────────
app.get('/api/guild/:guildId/giveaway-settings', authMiddleware, (req, res) => {
    const data = readBotStore('giveaway-settings') || {};
    const cfg = data[req.params.guildId] || {};
    res.json({
        defaultDuration: cfg.defaultDuration || 60,
        defaultWinners: cfg.defaultWinners || 1,
        pingRole: cfg.pingRole || null,
        dmWinners: cfg.dmWinners !== false,
        showParticipants: cfg.showParticipants !== false,
        requireRole: cfg.requireRole || null,
        bypassRole: cfg.bypassRole || null
    });
});
app.put('/api/guild/:guildId/giveaway-settings', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const body = req.body || {};
    const data = readBotStore('giveaway-settings') || {};
    if (!data[gid]) data[gid] = {};
    const s = data[gid];
    if (Number.isFinite(Number(body.defaultDuration))) s.defaultDuration = Math.max(1, Math.min(43200, Number(body.defaultDuration)));
    if (Number.isFinite(Number(body.defaultWinners))) s.defaultWinners = Math.max(1, Math.min(20, Number(body.defaultWinners)));
    if (body.pingRole !== undefined) s.pingRole = body.pingRole || null;
    if (body.requireRole !== undefined) s.requireRole = body.requireRole || null;
    if (body.bypassRole !== undefined) s.bypassRole = body.bypassRole || null;
    if (typeof body.dmWinners === 'boolean') s.dmWinners = body.dmWinners;
    if (typeof body.showParticipants === 'boolean') s.showParticipants = body.showParticipants;
    writeBotStore('giveaway-settings', data);
    res.json(data[gid]);
});

// Active giveaways list
app.get('/api/guild/:guildId/giveaways', authMiddleware, (req, res) => {
    const data = readBotStore('giveaways') || {};
    const guildGiveaways = data[req.params.guildId] || {};
    const list = Object.entries(guildGiveaways).map(([msgId, g]) => ({
        messageId: msgId,
        prize: g.prize,
        winners: g.winners,
        channelId: g.channelId,
        hostId: g.hostId,
        endTime: g.endTime,
        ended: g.ended || false,
        participants: (g.participants || []).length
    }));
    res.json(list);
});

// ── Economy Module CRUD (settings + leaderboard + user management) ───────────
app.get('/api/guild/:guildId/economy-settings', authMiddleware, (req, res) => {
    const allSettings = readBotStore('economy-settings') || {};
    const guildSettings = allSettings[req.params.guildId] || {};
    res.json({
        currency: guildSettings.currency || '💰',
        currencyName: guildSettings.currencyName || 'coins',
        dailyReward: guildSettings.dailyReward || 100,
        weeklyReward: guildSettings.weeklyReward || 500,
        workMinReward: guildSettings.workMinReward || 50,
        workMaxReward: guildSettings.workMaxReward || 200,
        robChance: guildSettings.robChance || 40,
        startingBalance: guildSettings.startingBalance || 0,
        robEnabled: guildSettings.robEnabled !== false,
        gamblingEnabled: guildSettings.gamblingEnabled !== false,
        shopEnabled: guildSettings.shopEnabled !== false,
    });
});

app.put('/api/guild/:guildId/economy-settings', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const body = req.body || {};
    const allSettings = readBotStore('economy-settings') || {};
    if (!allSettings[gid]) allSettings[gid] = {};
    const s = allSettings[gid];

    if (typeof body.currency === 'string') s.currency = body.currency.trim().slice(0, 32) || '💰';
    if (typeof body.currencyName === 'string') s.currencyName = body.currencyName.trim().slice(0, 32).toLowerCase() || 'coins';
    if (Number.isFinite(Number(body.dailyReward))) s.dailyReward = Math.max(0, Math.min(1000000, Number(body.dailyReward)));
    if (Number.isFinite(Number(body.weeklyReward))) s.weeklyReward = Math.max(0, Math.min(10000000, Number(body.weeklyReward)));
    if (Number.isFinite(Number(body.workMinReward))) s.workMinReward = Math.max(0, Math.min(1000000, Number(body.workMinReward)));
    if (Number.isFinite(Number(body.workMaxReward))) s.workMaxReward = Math.max(0, Math.min(1000000, Number(body.workMaxReward)));
    if (Number.isFinite(Number(body.robChance))) s.robChance = Math.max(0, Math.min(100, Number(body.robChance)));
    if (Number.isFinite(Number(body.startingBalance))) s.startingBalance = Math.max(0, Math.min(10000000, Number(body.startingBalance)));
    if (typeof body.robEnabled === 'boolean') s.robEnabled = body.robEnabled;
    if (typeof body.gamblingEnabled === 'boolean') s.gamblingEnabled = body.gamblingEnabled;
    if (typeof body.shopEnabled === 'boolean') s.shopEnabled = body.shopEnabled;

    writeBotStore('economy-settings', allSettings);
    res.json(allSettings[gid]);
});

// Economy leaderboard (top users by net worth)
app.get('/api/guild/:guildId/economy-leaderboard', authMiddleware, (req, res) => {
    const economy = readBotStore('economy') || {};
    const entries = Object.entries(economy)
        .map(([userId, data]) => ({
            userId,
            coins: Number(data.coins || 0),
            bank: Number(data.bank || 0),
            total: Number(data.coins || 0) + Number(data.bank || 0),
            level: Number(data.level || 1),
            streak: Number(data.dailyStreak || data.streak || 0)
        }))
        .filter(e => e.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 50);
    res.json(entries);
});

// Set a user's balance
app.post('/api/guild/:guildId/economy-user/:userId/set', authMiddleware, (req, res) => {
    const { coins, bank } = req.body || {};
    const economy = readBotStore('economy') || {};
    if (!economy[req.params.userId]) economy[req.params.userId] = { coins: 0, bank: 0 };
    if (Number.isFinite(Number(coins))) economy[req.params.userId].coins = Math.max(0, Number(coins));
    if (Number.isFinite(Number(bank))) economy[req.params.userId].bank = Math.max(0, Number(bank));
    writeBotStore('economy', economy);
    res.json({ success: true, coins: economy[req.params.userId].coins, bank: economy[req.params.userId].bank });
});

// Reset a user's economy
app.delete('/api/guild/:guildId/economy-user/:userId', authMiddleware, (req, res) => {
    const economy = readBotStore('economy') || {};
    if (economy[req.params.userId]) {
        delete economy[req.params.userId];
        writeBotStore('economy', economy);
    }
    res.json({ success: true });
});

// ── AntiNuke CRUD (protection modules, whitelist, bypass) ───────────────────
const ANTINUKE_KEYS = ['banProtection', 'kickProtection', 'channelDelete', 'channelCreate', 'roleDelete', 'roleCreate', 'webhookCreate', 'botAdd'];
const ANTINUKE_PUNISH = ['remove_roles', 'kick', 'ban', 'timeout', 'kick_bot', 'kick_both', 'ban_bot'];

function getAntinukeDefaults() {
    return {
        enabled: false,
        banProtection: { enabled: false, limit: 3, timeWindow: 60000, action: 'remove_roles' },
        kickProtection: { enabled: false, limit: 3, timeWindow: 60000, action: 'remove_roles' },
        channelDelete: { enabled: false, limit: 2, timeWindow: 60000, action: 'remove_roles' },
        channelCreate: { enabled: false, limit: 3, timeWindow: 60000, action: 'remove_roles' },
        roleDelete: { enabled: false, limit: 2, timeWindow: 60000, action: 'remove_roles' },
        roleCreate: { enabled: false, limit: 3, timeWindow: 60000, action: 'remove_roles' },
        webhookCreate: { enabled: false, limit: 2, timeWindow: 60000, action: 'remove_roles' },
        botAdd: { enabled: false, action: 'kick_bot' },
        whitelistedUsers: [],
        bypassRoleId: null,
        logChannel: null
    };
}

app.get('/api/guild/:guildId/antinuke', authMiddleware, (req, res) => {
    const data = readBotStore('antinuke') || {};
    const saved = data[req.params.guildId] || {};
    res.json(deepMerge(getAntinukeDefaults(), saved));
});

app.put('/api/guild/:guildId/antinuke', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const body = req.body || {};
    const data = readBotStore('antinuke') || {};
    const cur = deepMerge(getAntinukeDefaults(), data[gid] || {});

    // Master toggle
    if (typeof body.enabled === 'boolean') cur.enabled = body.enabled;

    // Each protection module
    for (const key of ANTINUKE_KEYS) {
        if (!body[key]) continue;
        const mod = body[key];
        if (!cur[key]) cur[key] = {};
        if (typeof mod.enabled === 'boolean') cur[key].enabled = mod.enabled;
        if (key !== 'botAdd') {
            if (Number.isFinite(Number(mod.limit))) cur[key].limit = Math.max(1, Math.min(50, Number(mod.limit)));
            if (Number.isFinite(Number(mod.timeWindow))) cur[key].timeWindow = Math.max(5000, Math.min(600000, Number(mod.timeWindow)));
        }
        if (mod.action && ANTINUKE_PUNISH.includes(mod.action)) cur[key].action = mod.action;
    }

    // Shared settings
    if (Array.isArray(body.whitelistedUsers)) cur.whitelistedUsers = body.whitelistedUsers.map(String);
    if (body.bypassRoleId !== undefined) cur.bypassRoleId = body.bypassRoleId || null;
    if (body.logChannel !== undefined) cur.logChannel = body.logChannel || null;

    data[gid] = cur;
    writeBotStore('antinuke', data);
    // The storeSync listener attached to jsonStore handles cache
    // invalidation automatically when writeBotStore -> writeImmediate
    // fires the 'update' event. Calling global.reloadAntinukeCache here
    // would double-apply the write.
    res.json(cur);
});

// ── AutoMod CRUD (filters, ignore lists, bad words) ─────────────────────────
const AUTOMOD_FILTERS = ['badWords', 'spam', 'links', 'invites', 'massMention', 'caps', 'profanity', 'sexualContent', 'slurs'];
const AUTOMOD_ACTIONS = ['warn', 'delete', 'timeout', 'kick', 'ban'];

function getAutomodDefaultsFull() {
    return {
        enabled: false,
        badWords: { enabled: false, words: [], action: 'delete' },
        spam: { enabled: false, messageLimit: 5, timeWindow: 5000, action: 'timeout' },
        links: { enabled: false, action: 'delete', whitelist: [] },
        invites: { enabled: false, action: 'delete' },
        massMention: { enabled: false, limit: 5, action: 'delete' },
        caps: { enabled: false, percentage: 70, minLength: 10, action: 'delete' },
        profanity: { enabled: false, action: 'delete' },
        sexualContent: { enabled: false, action: 'delete' },
        slurs: { enabled: false, action: 'delete' },
        logChannel: null,
        ignoredRoles: [],
        ignoredChannels: [],
        bypassRoleId: null
    };
}

app.get('/api/guild/:guildId/automod', authMiddleware, (req, res) => {
    const data = readBotStore('automod') || {};
    const saved = data[req.params.guildId] || {};
    res.json(deepMerge(getAutomodDefaultsFull(), saved));
});

app.put('/api/guild/:guildId/automod', authMiddleware, (req, res) => {
    const gid = req.params.guildId;
    const body = req.body || {};
    const data = readBotStore('automod') || {};
    const cur = deepMerge(getAutomodDefaultsFull(), data[gid] || {});

    // Master toggle
    if (typeof body.enabled === 'boolean') cur.enabled = body.enabled;

    // Each filter
    for (const key of AUTOMOD_FILTERS) {
        if (!body[key]) continue;
        const f = body[key];
        if (!cur[key]) cur[key] = {};
        if (typeof f.enabled === 'boolean') cur[key].enabled = f.enabled;
        if (f.action && AUTOMOD_ACTIONS.includes(f.action)) cur[key].action = f.action;

        if (key === 'badWords' && Array.isArray(f.words)) {
            cur[key].words = [...new Set(f.words.filter(w => w && typeof w === 'string').map(w => w.trim().toLowerCase()))];
        }
        if (key === 'spam') {
            if (Number.isFinite(Number(f.messageLimit))) cur[key].messageLimit = Math.max(2, Math.min(50, Number(f.messageLimit)));
            if (Number.isFinite(Number(f.timeWindow))) cur[key].timeWindow = Math.max(1000, Math.min(60000, Number(f.timeWindow)));
        }
        if (key === 'links' && Array.isArray(f.whitelist)) {
            cur[key].whitelist = [...new Set(f.whitelist.filter(w => w && typeof w === 'string').map(w => w.trim().toLowerCase()))];
        }
        if (key === 'massMention' && Number.isFinite(Number(f.limit))) {
            cur[key].limit = Math.max(1, Math.min(50, Number(f.limit)));
        }
        if (key === 'caps') {
            if (Number.isFinite(Number(f.percentage))) cur[key].percentage = Math.max(10, Math.min(100, Number(f.percentage)));
            if (Number.isFinite(Number(f.minLength))) cur[key].minLength = Math.max(3, Math.min(500, Number(f.minLength)));
        }
    }

    // Shared settings
    if (Array.isArray(body.ignoredRoles)) cur.ignoredRoles = body.ignoredRoles.map(String);
    if (Array.isArray(body.ignoredChannels)) cur.ignoredChannels = body.ignoredChannels.map(String);
    if (body.bypassRoleId !== undefined) cur.bypassRoleId = body.bypassRoleId || null;
    if (body.logChannel !== undefined) cur.logChannel = body.logChannel || null;

    data[gid] = cur;
    writeBotStore('automod', data);
    // The storeSync listener attached to jsonStore handles cache
    // invalidation automatically when writeBotStore -> writeImmediate
    // fires the 'update' event. Calling global.updateAutomodCache here
    // would double-apply the write (the listener already iterates the
    // fresh snapshot per guild).
    res.json(cur);
});

// ── Message Builder: Templates CRUD + Send API ──────────────────────────────
// Data layout:
//   user-templates jsonStore = { [templateName]: messageData }  (global, shared by users)
//   guild-message-templates  = { [guildId]: { [templateName]: messageData } }  (per-guild)

function getMsgBuilderDefaults() {
    return {
        mode: 'components',
        content: '',
        title: '',
        description: '',
        color: '#bcf1e4',
        images: [],
        thumbnail: '',
        footer: '',
        footerIcon: '',
        author: '',
        authorIcon: '',
        fields: [],
        colorless: false,
        imagePosition: 'bottom',
        buttonPosition: 'bottom',
        buttons: [],
        actionButtons: []
    };
}

// List templates for a guild
app.get('/api/guild/:guildId/message-templates', authMiddleware, (req, res) => {
    const data = readBotStore('guild-message-templates') || {};
    const guildTemplates = data[req.params.guildId] || {};
    res.json(guildTemplates);
});

// Create/update a template
app.post('/api/guild/:guildId/message-templates', authMiddleware, (req, res) => {
    const { name, template } = req.body || {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Template name required' });
    const data = readBotStore('guild-message-templates') || {};
    if (!data[req.params.guildId]) data[req.params.guildId] = {};
    data[req.params.guildId][name] = deepMerge(getMsgBuilderDefaults(), template || {});
    writeBotStore('guild-message-templates', data);
    res.json({ success: true, name, template: data[req.params.guildId][name] });
});

app.put('/api/guild/:guildId/message-templates/:name', authMiddleware, (req, res) => {
    const data = readBotStore('guild-message-templates') || {};
    if (!data[req.params.guildId]?.[req.params.name]) return res.status(404).json({ error: 'Template not found' });
    data[req.params.guildId][req.params.name] = deepMerge(getMsgBuilderDefaults(), req.body || {});
    writeBotStore('guild-message-templates', data);
    res.json({ success: true, template: data[req.params.guildId][req.params.name] });
});

app.delete('/api/guild/:guildId/message-templates/:name', authMiddleware, (req, res) => {
    const data = readBotStore('guild-message-templates') || {};
    if (!data[req.params.guildId]?.[req.params.name]) return res.status(404).json({ error: 'Template not found' });
    delete data[req.params.guildId][req.params.name];
    writeBotStore('guild-message-templates', data);
    res.json({ success: true });
});

// Send a message to a Discord channel (via bot token)
app.post('/api/guild/:guildId/send-message', authMiddleware, async (req, res) => {
    if (!BOT_TOKEN) return res.status(500).json({ error: 'Bot token not configured' });
    const { channelId, template } = req.body || {};
    if (!channelId) return res.status(400).json({ error: 'channelId required' });
    const data = deepMerge(getMsgBuilderDefaults(), template || {});
    const gid = req.params.guildId;

    // Build payload based on mode
    try {
        if (data.mode === 'embed') {
            const color = parseInt((data.color || '#bcf1e4').replace('#', ''), 16);
            const embed = { color: isNaN(color) ? 0x5865F2 : color };
            if (data.title) embed.title = data.title;
            if (data.description) embed.description = data.description;
            const img = (data.images && data.images[0]) || data.image;
            if (img) embed.image = { url: img };
            if (data.thumbnail) embed.thumbnail = { url: data.thumbnail };
            if (data.author) embed.author = { name: data.author, ...(data.authorIcon ? { icon_url: data.authorIcon } : {}) };
            if (data.footer) embed.footer = { text: data.footer, ...(data.footerIcon ? { icon_url: data.footerIcon } : {}) };
            if (Array.isArray(data.fields) && data.fields.length) {
                embed.fields = data.fields.slice(0, 25).map(f => ({ name: String(f.name || ''), value: String(f.value || ''), inline: !!f.inline }));
            }

            // Build link-button action rows (max 5 per row, 5 rows total)
            const components = [];
            const btns = (data.buttons || []).filter(b => b.label && b.url && /^https?:\/\//i.test(b.url));
            if (btns.length) {
                for (let i = 0; i < btns.length; i += 5) {
                    components.push({
                        type: 1,
                        components: btns.slice(i, i + 5).map(b => ({
                            type: 2, style: 5, label: String(b.label).slice(0, 80), url: b.url,
                            ...(b.emoji ? { emoji: { name: b.emoji } } : {})
                        }))
                    });
                }
            }
            // Custom action buttons (from button-commands store)
            if (Array.isArray(data.actionButtons) && data.actionButtons.length) {
                const btnStore = readBotStore('button-commands') || {};
                const guildBtns = btnStore[gid] || {};
                const styleMap = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 };
                const abs = data.actionButtons.map(id => guildBtns[id]).filter(Boolean);
                for (let i = 0; i < abs.length; i += 5) {
                    components.push({
                        type: 1,
                        components: abs.slice(i, i + 5).map((b, idx) => {
                            const btnIdInList = data.actionButtons[i + idx];
                            const comp = {
                                type: 2, style: styleMap[b.style] || 1,
                                label: String(b.label || 'Button').slice(0, 80),
                                ...(b.emoji ? { emoji: { name: b.emoji } } : {})
                            };
                            if (b.style === 'link' && b.url) comp.url = b.url;
                            else comp.custom_id = `btn_cmd_${gid}_${btnIdInList}`;
                            return comp;
                        })
                    });
                }
            }

            const r = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
                method: 'POST',
                headers: { 'Authorization': `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ embeds: [embed], components })
            });
            const body = await r.json().catch(() => ({}));
            if (!r.ok) return res.status(r.status).json({ error: body?.message || 'Discord API error', details: body });
            return res.json({ success: true, messageId: body.id, channelId: body.channel_id });
        } else {
            // Components V2 path — simpler: just text display + fields + buttons. No media gallery (requires raw CDN URLs which work fine).
            const color = parseInt((data.color || '#bcf1e4').replace('#', ''), 16);
            const body = { type: 17 }; // Container
            if (!data.colorless && !isNaN(color)) body.accent_color = color;
            body.components = [];

            const mainText = data.content || (data.title ? `**${data.title}**\n${data.description || ''}` : 'No content');
            body.components.push({ type: 10, content: mainText });

            if (data.fields?.length) {
                body.components.push({ type: 14, spacing: 1, divider: true });
                for (const f of data.fields.slice(0, 25)) {
                    body.components.push({ type: 10, content: `**${f.name || ''}**\n${f.value || ''}` });
                }
            }
            if (data.footer) {
                body.components.push({ type: 14, spacing: 1, divider: true });
                body.components.push({ type: 10, content: `-# ${data.footer}` });
            }

            // Buttons
            const btns = (data.buttons || []).filter(b => b.label && b.url && /^https?:\/\//i.test(b.url));
            for (let i = 0; i < btns.length; i += 5) {
                body.components.push({
                    type: 1,
                    components: btns.slice(i, i + 5).map(b => ({
                        type: 2, style: 5, label: String(b.label).slice(0, 80), url: b.url,
                        ...(b.emoji ? { emoji: { name: b.emoji } } : {})
                    }))
                });
            }
            if (Array.isArray(data.actionButtons) && data.actionButtons.length) {
                const btnStore = readBotStore('button-commands') || {};
                const guildBtns = btnStore[gid] || {};
                const styleMap = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 };
                const abs = data.actionButtons.map(id => guildBtns[id]).filter(Boolean);
                for (let i = 0; i < abs.length; i += 5) {
                    body.components.push({
                        type: 1,
                        components: abs.slice(i, i + 5).map((b, idx) => {
                            const btnIdInList = data.actionButtons[i + idx];
                            const comp = {
                                type: 2, style: styleMap[b.style] || 1,
                                label: String(b.label || 'Button').slice(0, 80),
                                ...(b.emoji ? { emoji: { name: b.emoji } } : {})
                            };
                            if (b.style === 'link' && b.url) comp.url = b.url;
                            else comp.custom_id = `btn_cmd_${gid}_${btnIdInList}`;
                            return comp;
                        })
                    });
                }
            }

            const r = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
                method: 'POST',
                headers: { 'Authorization': `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ flags: 1 << 15, components: [body] })
            });
            const resBody = await r.json().catch(() => ({}));
            if (!r.ok) return res.status(r.status).json({ error: resBody?.message || 'Discord API error', details: resBody });
            return res.json({ success: true, messageId: resBody.id, channelId: resBody.channel_id });
        }
    } catch (e) {
        console.error('[send-message]', e);
        res.status(500).json({ error: e.message });
    }
});

// ── Button Commands CRUD (must be before generic :module route) ───────────────
app.get('/api/guild/:guildId/buttons', authMiddleware, (req, res) => {
    const data = readBotStore('button-commands') || {};
    const guildBtns = data[req.params.guildId] || {};
    res.json(guildBtns);
});
app.post('/api/guild/:guildId/buttons', authMiddleware, (req, res) => {
    const { id, label, style, emoji, url, ephemeral, actions } = req.body;
    if (!id || !label || !style) return res.status(400).json({ error: 'id, label, style required' });
    const data = readBotStore('button-commands') || {};
    if (!data[req.params.guildId]) data[req.params.guildId] = {};
    data[req.params.guildId][id] = { label, style, emoji: emoji || null, url: url || null, ephemeral: ephemeral !== false, actions: actions || [], createdAt: Date.now() };
    writeBotStore('button-commands', data);
    res.json(data[req.params.guildId][id]);
});
app.put('/api/guild/:guildId/buttons/:btnId', authMiddleware, (req, res) => {
    const data = readBotStore('button-commands') || {};
    if (!data[req.params.guildId]?.[req.params.btnId]) return res.status(404).json({ error: 'Button not found' });
    Object.assign(data[req.params.guildId][req.params.btnId], req.body);
    writeBotStore('button-commands', data);
    res.json(data[req.params.guildId][req.params.btnId]);
});
app.delete('/api/guild/:guildId/buttons/:btnId', authMiddleware, (req, res) => {
    const data = readBotStore('button-commands') || {};
    if (!data[req.params.guildId]?.[req.params.btnId]) return res.status(404).json({ error: 'Button not found' });
    delete data[req.params.guildId][req.params.btnId];
    writeBotStore('button-commands', data);
    res.json({ success: true });
});

// ── Select Menus CRUD (must be before generic :module route) ─────────────────
app.get('/api/guild/:guildId/menus', authMiddleware, (req, res) => {
    const data = readBotStore('select-menus') || {};
    const guildMenus = data[req.params.guildId] || {};
    res.json(guildMenus);
});
app.post('/api/guild/:guildId/menus', authMiddleware, (req, res) => {
    const { id, placeholder, minValues, maxValues, ephemeral, options } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    const data = readBotStore('select-menus') || {};
    if (!data[req.params.guildId]) data[req.params.guildId] = {};
    data[req.params.guildId][id] = { placeholder: placeholder || 'Select an option...', minValues: minValues || 1, maxValues: maxValues || 1, ephemeral: ephemeral !== false, options: options || [], createdAt: Date.now(), createdBy: req.user.discordId || req.user.id };
    writeBotStore('select-menus', data);
    res.json(data[req.params.guildId][id]);
});
app.put('/api/guild/:guildId/menus/:menuId', authMiddleware, (req, res) => {
    const data = readBotStore('select-menus') || {};
    if (!data[req.params.guildId]?.[req.params.menuId]) return res.status(404).json({ error: 'Menu not found' });
    Object.assign(data[req.params.guildId][req.params.menuId], req.body);
    writeBotStore('select-menus', data);
    res.json(data[req.params.guildId][req.params.menuId]);
});
app.delete('/api/guild/:guildId/menus/:menuId', authMiddleware, (req, res) => {
    const data = readBotStore('select-menus') || {};
    if (!data[req.params.guildId]?.[req.params.menuId]) return res.status(404).json({ error: 'Menu not found' });
    delete data[req.params.guildId][req.params.menuId];
    writeBotStore('select-menus', data);
    res.json({ success: true });
});

// ── Webhook Manager ─────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/webhook-config', authMiddleware, async (req, res) => {
    try {
        if (!BOT_TOKEN) return res.json({ webhooks: [], totalWebhooks: 0 });
        const r = await fetch(`https://discord.com/api/v10/guilds/${req.params.guildId}/webhooks`, {
            headers: { Authorization: `Bot ${BOT_TOKEN}` }
        });
        if (!r.ok) return res.json({ webhooks: [], totalWebhooks: 0 });
        const webhooks = await r.json();
        const formatted = webhooks.map(w => ({
            id: w.id,
            name: w.name,
            type: w.type === 1 ? 'Incoming' : 'Channel Follower',
            channelId: w.channel_id,
            avatar: w.avatar ? `https://cdn.discordapp.com/avatars/${w.id}/${w.avatar}.png` : null,
            user: w.user ? { username: w.user.username } : null
        }));
        res.json({ webhooks: formatted, totalWebhooks: formatted.length });
    } catch {
        res.json({ webhooks: [], totalWebhooks: 0 });
    }
});

app.post('/api/guild/:guildId/webhook-create', authMiddleware, async (req, res) => {
    try {
        if (!BOT_TOKEN) return res.status(400).json({ error: 'Bot token not configured' });
        const { channelId, name } = req.body;
        if (!channelId) return res.status(400).json({ error: 'Channel ID required' });
        
        const r = await fetch(`https://discord.com/api/v10/channels/${channelId}/webhooks`, {
            method: 'POST',
            headers: { 
                Authorization: `Bot ${BOT_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: name || 'xNico Webhook' })
        });
        
        if (!r.ok) {
            const err = await r.json();
            return res.status(400).json({ error: err.message || 'Failed to create webhook' });
        }
        
        res.json({ success: true, webhook: await r.json() });
    } catch (e) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/guild/:guildId/webhook/:webhookId', authMiddleware, async (req, res) => {
    try {
        if (!BOT_TOKEN) return res.status(400).json({ error: 'Bot token not configured' });
        const { webhookId } = req.params;
        
        const r = await fetch(`https://discord.com/api/v10/webhooks/${webhookId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bot ${BOT_TOKEN}` }
        });
        
        if (!r.ok && r.status !== 404) {
            return res.status(400).json({ error: 'Failed to delete webhook' });
        }
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Generic module config endpoints
app.get('/api/guild/:guildId/:module', authMiddleware, async (req, res) => {
    const { guildId, module } = req.params;
    const defaults = MODULE_DEFAULTS[module];
    if (!defaults) return res.status(404).json({ error: 'Unknown module' });

    // Live read from PG so the dashboard shows what the bot wrote
    // since the last cache load. Skips on local/single-host setups
    // (cache is authoritative there).
    try {
        if (jsonStore.initialized && !jsonStore._localMode) {
            const storeName = MODULE_TO_STORE[module] || module;
            await jsonStore.refresh(storeName).catch(() => {});
        }
    } catch {}

    const config = getGuildModuleConfig(guildId, module);
    res.json(deepMerge(defaults(), config || {}));
});

app.put('/api/guild/:guildId/:module', authMiddleware, async (req, res) => {
    const { guildId, module } = req.params;
    const defaults = MODULE_DEFAULTS[module];
    if (!defaults) return res.status(404).json({ error: 'Unknown module' });

    try {
        const storeName = MODULE_TO_STORE[module] || module;

        // Race-safe: pull the freshest row from PG, merge the
        // dashboard payload, write back. Without this two near-
        // simultaneous edits (or a bot-side change between cache
        // load and write) silently overwrite each other.
        const updated = await updateGuildStore(storeName, guildId, (current) => {
            const base = (current && Object.keys(current).length) ? current : defaults();
            // Logging schema is dashboard-specific, translate first.
            if (module === 'logging') {
                const merged = deepMerge(botLoggingToDashboard(base), req.body);
                return dashboardLoggingToBot(merged, base);
            }
            return deepMerge(base, req.body);
        });

        // Fire the matching cache-update global if this module has one.
        // Same-process reads (single-host setups) get the change instantly;
        // cross-host setups get it on the next 3s smartRefresh poll.
        notifyModuleUpdate(module, guildId, updated);

        // Return the dashboard-friendly view (translated back if logging).
        const view = module === 'logging' ? botLoggingToDashboard(updated) : updated;
        res.json(view);
    } catch (err) {
        console.error(`[Dashboard] PUT /api/guild/${guildId}/${module} failed:`, err?.message || err);
        res.status(500).json({ error: 'Failed to save settings', detail: err?.message });
    }
});

// (channels and roles routes moved above the generic :module route)

// ── Stats ────────────────────────────────────────────────────────────────────
app.get('/api/stats', authMiddleware, (req, res) => {
    const a = readJSON('analytics.json', {});
    res.json({ totalGuilds: a.totalGuilds || 0, totalMembers: a.totalMembers || 0, totalCommands: a.totalCommands || 0, uptime: a.uptime || 0, avgResponseTime: a.avgResponseTime || 0 });
});
app.get('/api/analytics', authMiddleware, (req, res) => res.json(readJSON('analytics.json', {})));

// ── Mod Logs ─────────────────────────────────────────────────────────────────
app.get('/api/modlogs', authMiddleware, (req, res) => res.json(readJSON('modlogs.json', [])));
app.post('/api/modlogs', authMiddleware, (req, res) => {
    const logs = readJSON('modlogs.json', []);
    const l = { id: logs.length + 1, ...req.body, moderator: req.user.username, timestamp: new Date().toISOString() };
    logs.unshift(l);
    writeJSON('modlogs.json', logs);
    res.json(l);
});

// ── Commands ─────────────────────────────────────────────────────────────────
app.get('/api/commands', authMiddleware, (req, res) => {
    res.json({
        categories: [
            { name: 'Admin', count: 102, icon: '🛡️', desc: 'Moderation, AutoMod, Anti-Nuke/Raid, verification, logging' },
            { name: 'Utility', count: 94, icon: '🔧', desc: 'Welcomer, tickets, giveaways, starboard, polls' },
            { name: 'Owner', count: 55, icon: '👑', desc: 'Bot management, eval, deploy, broadcasting' },
            { name: 'Fun', count: 52, icon: '🎮', desc: 'Games, trivia, Akinator, memes' },
            { name: 'Music', count: 47, icon: '<:Music:1473039311057190972>', desc: 'Lavalink player with filters, queue, favorites' },
            { name: 'Basic', count: 47, icon: '📋', desc: 'Server info, user info, roles, permissions' },
            { name: 'Economy', count: 29, icon: '💰', desc: 'Currency, shop, gambling, fishing, pets' },
            { name: 'Voice', count: 21, icon: '🔊', desc: 'Join-to-create, voice roles' },
            { name: 'Image', count: 15, icon: '🖼️', desc: 'Blur, greyscale, rotate, deepfry, sepia' },
            { name: 'Leveling', count: 12, icon: '📈', desc: 'XP, rank cards, level roles' },
            { name: 'Backup', count: 12, icon: '<:Save:1473038120030306386>', desc: 'Config & server structure backups' },
            { name: 'Action', count: 25, icon: '🎭', desc: 'Roleplay action commands' },
            { name: 'Social', count: 7, icon: '💬', desc: 'Profiles, badges, marriage' },
            { name: 'Webhook', count: 6, icon: '🔗', desc: 'Create, send, manage webhooks' },
            { name: 'Stats', count: 11, icon: '<:transfer:1479780506718437396>', desc: 'Server stats channels' }
        ], totalCommands: 535
    });
});

// ── Premium ──────────────────────────────────────────────────────────────────
app.get('/api/premium', authMiddleware, (req, res) => res.json(readJSON('premium.json', { keys: [] })));
app.post('/api/premium/generate', authMiddleware, (req, res) => {
    const p = readJSON('premium.json', { keys: [] });
    const key = 'XNICO-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    p.keys.push({ key, tier: req.body.tier || 'user', duration: req.body.duration || '30d', createdBy: req.user.username, createdAt: new Date().toISOString(), redeemed: false });
    writeJSON('premium.json', p);
    res.json({ key });
});

// ── Users ────────────────────────────────────────────────────────────────────
app.get('/api/users', authMiddleware, (req, res) => {
    const users = readJSON('users.json', []);
    res.json(users.map(u => ({ id: u.id, username: u.username, email: u.email, role: u.role, avatar: u.avatar, discordId: u.discordId, createdAt: u.createdAt })));
});

// ── User Profile (comprehensive, reads from bot's actual stores) ─────────────
app.get('/api/users/me/profile', authMiddleware, (req, res) => {
    const discordId = req.user.discordId;

    // For non-Discord users (like built-in admin), return minimal profile without bot data
    if (!discordId) {
        return res.json({
            user: {
                id: req.user.id, discordId: null, username: req.user.username,
                email: req.user.email || null, avatar: req.user.avatar || null,
                role: req.user.role || 'member', isOwner: req.user.role === 'owner',
                hasPremium: false, premiumExpires: null, memberSince: null
            },
            economy: { wallet: 0, bank: 0, total: 0, inventory: [], lastDaily: null, lastWeekly: null, lastWork: null },
            social: { reputation: 0, bio: '', badges: [], marriedTo: null },
            leveling: { totalXp: 0, highestLevel: 0, globalLevel: 0, totalMessages: 0, totalVoiceTime: 0, totalVoiceHours: 0 },
            stats: { commandsUsed: 0, botInteractions: 0, totalWarnings: 0, totalInvites: 0, serversWithData: 0 },
            rankCard: { cardStyle: 'default', backgroundColor: '#2f3136', progressBarColor: '#bcf1e4', textColor: '#ffffff', customBackground: null, fontFamily: 'Inter', backgroundOpacity: 0.35 },
            guilds: [],
            afk: { isAfk: false, reason: '', since: null },
            _noDiscordLink: true
        });
    }

    const users = readBotStore('users') || [];
    const guildMembers = readBotStore('guild_members') || [];
    const levelingStore = readBotStore('leveling') || {};
    const economyStore = readBotStore('economy') || {};
    const socialStore = readBotStore('social') || {};
    const premiumStore = readBotStore('premium') || [];

    const userRec = users.find(u => u.user_id === discordId) || {};
    const profile = userRec.profile || {};
    const economy = userRec.economy || economyStore[discordId] || { balance: 0, bank: 0, inventory: [] };
    const social = userRec.social || socialStore[discordId] || { reputation: 0 };
    const stats = userRec.stats || { commandsUsed: 0, botInteractions: 0 };
    const afk = userRec.afk || { isAfk: false };

    const memberEntries = guildMembers.filter(m => m.user_id === discordId);
    let totalMessages = 0, totalVoiceTime = 0, totalXp = 0, highestLevel = 0, totalWarnings = 0, totalInvites = 0;
    const guildStats = [];

    for (const m of memberEntries) {
        const xp = Number(m.leveling?.xp || 0);
        const level = Number(m.leveling?.level || Math.floor(0.1 * Math.sqrt(xp)));
        const msgs = Number(m.analytics?.totalMessages || m.leveling?.messageCount || 0);
        const voice = Number(m.analytics?.voiceTime || 0);
        const warnings = Array.isArray(m.warnings) ? m.warnings.length : 0;
        const invites = Number(m.invites?.invites || 0);
        totalMessages += msgs; totalVoiceTime += voice; totalXp += xp;
        if (level > highestLevel) highestLevel = level;
        totalWarnings += warnings; totalInvites += invites;
        guildStats.push({ guildId: m.guild_id, xp, level, messages: msgs, voiceTime: voice, warnings, invites });
    }

    for (const [guildId, guildUsers] of Object.entries(levelingStore)) {
        const userLv = guildUsers[discordId];
        if (!userLv) continue;
        const existing = guildStats.find(g => g.guildId === guildId);
        const xp = Number(userLv.xp || 0);
        const level = Number(userLv.level || Math.floor(0.1 * Math.sqrt(xp)));
        const msgs = Number(userLv.messages || 0);
        if (existing) {
            if (xp > existing.xp) { existing.xp = xp; existing.level = level; }
            if (msgs > existing.messages) existing.messages = msgs;
        } else {
            guildStats.push({ guildId, xp, level, messages: msgs, voiceTime: 0, warnings: 0, invites: 0 });
            totalXp += xp; totalMessages += msgs;
            if (level > highestLevel) highestLevel = level;
        }
    }

    guildStats.sort((a, b) => b.xp - a.xp);

    const now = new Date();
    const premiumEntry = Array.isArray(premiumStore) ? premiumStore.find(p => p.userId === discordId) : null;
    const hasPremium = !!(premiumEntry && (!premiumEntry.expiresAt || new Date(premiumEntry.expiresAt) > now));
    const ownerIds = (process.env.OWNER_IDS || process.env.OWNERS || process.env.OWNER_ID || '').split(',').map(s => s.trim()).filter(Boolean);
    const isOwner = req.user.role === 'owner' || ownerIds.includes(discordId);

    res.json({
        user: {
            id: req.user.id, discordId, username: req.user.username,
            email: req.user.email || null, avatar: req.user.avatar || null,
            role: req.user.role || 'member', isOwner, hasPremium,
            premiumExpires: premiumEntry?.expiresAt || null,
            memberSince: userRec.created_at || null
        },
        economy: {
            wallet: Number(economy.balance || economy.coins || 0),
            bank: Number(economy.bank || 0),
            total: Number(economy.balance || economy.coins || 0) + Number(economy.bank || 0),
            inventory: Array.isArray(economy.inventory) ? economy.inventory : [],
            lastDaily: economy.lastDaily || null,
            lastWeekly: economy.lastWeekly || null,
            lastWork: economy.lastWork || null
        },
        social: {
            reputation: Number(social.reputation || 0),
            bio: social.bio || '',
            badges: Array.isArray(social.badges) ? social.badges : [],
            marriedTo: social.marriedTo || null
        },
        leveling: {
            totalXp, highestLevel,
            globalLevel: Math.floor(0.1 * Math.sqrt(totalXp)),
            totalMessages, totalVoiceTime,
            totalVoiceHours: Math.round(totalVoiceTime / 3600 * 10) / 10
        },
        stats: {
            commandsUsed: Number(stats.commandsUsed || 0),
            botInteractions: Number(stats.botInteractions || 0),
            totalWarnings, totalInvites,
            serversWithData: guildStats.length
        },
        rankCard: {
            cardStyle: profile.rankCard?.cardStyle || profile.cardStyle || 'default',
            backgroundColor: profile.rankCard?.backgroundColor || profile.backgroundColor || '#2f3136',
            progressBarColor: profile.rankCard?.progressBarColor || profile.progressBarColor || '#bcf1e4',
            textColor: profile.rankCard?.textColor || profile.textColor || '#ffffff',
            customBackground: profile.rankCard?.customBackground || profile.customBackground || null,
            fontFamily: profile.rankCard?.fontFamily || 'Inter',
            backgroundOpacity: profile.rankCard?.backgroundOpacity ?? 0.35
        },
        guilds: guildStats.slice(0, 25),
        afk: { isAfk: !!afk.isAfk, reason: afk.reason || '', since: afk.since || null }
    });
});

// ── Update user profile (bio, rank card, afk) ────────────────────────────────
app.put('/api/users/me/profile', authMiddleware, (req, res) => {
    const discordId = req.user.discordId;
    if (!discordId) return res.status(400).json({ error: 'No Discord ID linked' });

    const users = readBotStore('users') || [];
    let userRec = users.find(u => u.user_id === discordId);
    if (!userRec) {
        userRec = {
            user_id: discordId,
            economy: { balance: 0, bank: 0, inventory: [] },
            social: { reputation: 0 },
            profile: {},
            stats: { commandsUsed: 0, botInteractions: 0 },
            afk: { isAfk: false },
            votes: { total: 0, platforms: [] },
            bot_banned: { banned: false },
            is_owner: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        users.push(userRec);
    }

    const body = req.body || {};
    userRec.profile = userRec.profile || {};
    userRec.profile.rankCard = userRec.profile.rankCard || {};
    userRec.social = userRec.social || {};

    if (body.rankCard) {
        const rc = body.rankCard;
        const allowedStyles = ['default', 'minimal', 'neon', 'classic', 'modern'];
        const allowedFonts = ['Inter', 'Poppins', 'Montserrat', 'Outfit', 'SpaceGrotesk', 'JetBrainsMono', 'Comfortaa', 'Orbitron', 'Rajdhani'];
        if (rc.cardStyle && allowedStyles.includes(String(rc.cardStyle).toLowerCase())) {
            userRec.profile.rankCard.cardStyle = String(rc.cardStyle).toLowerCase();
            userRec.profile.cardStyle = userRec.profile.rankCard.cardStyle;
        }
        if (typeof rc.backgroundColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(rc.backgroundColor)) {
            userRec.profile.rankCard.backgroundColor = rc.backgroundColor;
            userRec.profile.backgroundColor = rc.backgroundColor;
        }
        if (typeof rc.progressBarColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(rc.progressBarColor)) {
            userRec.profile.rankCard.progressBarColor = rc.progressBarColor;
            userRec.profile.progressBarColor = rc.progressBarColor;
        }
        if (typeof rc.textColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(rc.textColor)) {
            userRec.profile.rankCard.textColor = rc.textColor;
            userRec.profile.textColor = rc.textColor;
        }
        if (rc.customBackground !== undefined) {
            userRec.profile.rankCard.customBackground = rc.customBackground || null;
            userRec.profile.customBackground = rc.customBackground || null;
        }
        if (rc.fontFamily && allowedFonts.includes(rc.fontFamily)) {
            userRec.profile.rankCard.fontFamily = rc.fontFamily;
        }
        if (typeof rc.backgroundOpacity === 'number') {
            userRec.profile.rankCard.backgroundOpacity = Math.max(0, Math.min(1, rc.backgroundOpacity));
        }
    }

    if (typeof body.bio === 'string') userRec.social.bio = body.bio.slice(0, 500);

    if (body.afk) {
        userRec.afk = userRec.afk || {};
        if (typeof body.afk.isAfk === 'boolean') userRec.afk.isAfk = body.afk.isAfk;
        if (typeof body.afk.reason === 'string') userRec.afk.reason = body.afk.reason.slice(0, 200);
        if (body.afk.isAfk) userRec.afk.since = userRec.afk.since || new Date().toISOString();
        else userRec.afk.since = null;
    }

    userRec.updated_at = new Date().toISOString();
    writeBotStore('users', users);

    res.json({ success: true });
});

// ── User Activity Analytics ──────────────────────────────────────────────────
app.get('/api/users/me/analytics', authMiddleware, (req, res) => {
    const discordId = req.user.discordId;
    if (!discordId) return res.json({ summary: { totalMessages: 0, totalVoiceSeconds: 0, totalVoiceHours: 0, serversActive: 0, topGuildRank: null }, topGuilds: [], daily: [] });

    const guildMembers = readBotStore('guild_members') || [];
    const levelingStore = readBotStore('leveling') || {};
    const memberEntries = guildMembers.filter(m => m.user_id === discordId);

    const totalMsgs = memberEntries.reduce((s, m) => s + Number(m.analytics?.totalMessages || m.leveling?.messageCount || 0), 0);
    const totalVoice = memberEntries.reduce((s, m) => s + Number(m.analytics?.voiceTime || 0), 0);

    const topGuilds = memberEntries
        .map(m => ({
            guildId: m.guild_id,
            xp: Number(m.leveling?.xp || 0),
            level: Number(m.leveling?.level || 0),
            messages: Number(m.analytics?.totalMessages || m.leveling?.messageCount || 0)
        }))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 5);

    const guildRanks = topGuilds.map(g => {
        const xpData = levelingStore[g.guildId] || {};
        const sorted = Object.entries(xpData).map(([uid, d]) => ({ uid, xp: d.xp || 0 })).sort((a, b) => b.xp - a.xp);
        const rank = sorted.findIndex(u => u.uid === discordId) + 1;
        return { ...g, rank, totalRanked: sorted.length };
    });

    const daily = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        daily.push({
            date: d.toISOString().slice(0, 10),
            messages: Math.floor(totalMsgs / 30 * (0.8 + Math.random() * 0.4)),
            voiceMinutes: Math.floor(totalVoice / 60 / 30 * (0.8 + Math.random() * 0.4))
        });
    }

    res.json({
        summary: {
            totalMessages: totalMsgs,
            totalVoiceSeconds: totalVoice,
            totalVoiceHours: Math.round(totalVoice / 3600 * 10) / 10,
            serversActive: memberEntries.length,
            topGuildRank: guildRanks[0]?.rank || null
        },
        topGuilds: guildRanks,
        daily
    });
});

// ── Discord OAuth Config ─────────────────────────────────────────────────────
app.get('/api/discord-config', (req, res) => {
    res.json({ clientId: DISCORD_CLIENT_ID, redirectUri: DISCORD_REDIRECT, hasOAuth: !!(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET) });
});

// ── Catch-all SPA ────────────────────────────────────────────────────────────
app.get('/{*splat}', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

function deepMerge(target, source) {
    const r = { ...target };
    for (const k of Object.keys(source)) {
        if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) r[k] = deepMerge(r[k] || {}, source[k]);
        else r[k] = source[k];
    }
    return r;
}

// Initialize PostgreSQL store and THEN start the server
console.log('[Dashboard] Initializing data store...');

if (require.main === module) {
    // Local execution
    jsonStore.init().then(() => {
        app.listen(PORT, () => {
            console.log(`\n  ╔══════════════════════════════════════╗`);
            console.log(`  ║   xNico Dashboard running on :${PORT}   ║`);
            console.log(`  ╠══════════════════════════════════════╣`);
            console.log(`  ║   http://localhost:${PORT}             ║`);
            console.log(`  ║   Discord OAuth: ${DISCORD_CLIENT_ID ? 'Configured' : 'Not set'}        ║`);
            console.log(`  ╚══════════════════════════════════════╝\n`);
        });
    }).catch(err => {
        console.error('[Dashboard] Critical Failure: Could not initialize data store:', err);
        process.exit(1);
    });
} else {
    // Vercel Serverless environment
    jsonStore.init().catch(err => {
        console.error('[Dashboard] Serverless Init Error:', err);
    });
    module.exports = app;
}
