'use strict';

/**
 * Join-to-Create Manager
 * ───────────────────────────────────────────────────────────────────
 * Storage, schema migration, premium gating, and concurrency control
 * for the J2C system. Lives in `jsonStore` under the `'join2create'`
 * key — same store the legacy v1 implementation used so we get a
 * zero-downtime upgrade.
 *
 * SCHEMA  (per-guild)
 *
 *   v1 (legacy, preserved by `migrateGuildConfig`):
 *   {
 *     enabled, triggerChannelId, interfaceChannelId, controlPanelMessageId,
 *     activeChannels: { [ownerUserId]: tempChannelId, ... }
 *   }
 *
 *   v2 (this file):
 *   {
 *     schemaVersion: 2,
 *     tier: 'free' | 'premium',         // computed lazily, cached
 *     interfaces: {
 *       [interfaceId]: {
 *         id, name, slug, emoji,
 *         triggerChannelId,             // VC users join to spawn
 *         categoryId,                   // Parent category for spawned VCs
 *         interfaceChannelId,           // Text channel hosting controls
 *         controlPanelMessageId,
 *         maxUsers,                     // 0 = unlimited
 *         bitrate,                      // kbps
 *         namingTemplate,               // e.g. '{user}'s {kind} Room'
 *         allowedRoles: [],             // empty = everyone
 *         deniedRoles:  [],
 *         visibility: 'public'|'private',
 *         autoDelete: true,
 *         enabled: true,
 *         createdAt, updatedAt
 *       }
 *     },
 *     activeChannels: {                  // flat global lookup
 *       [ownerUserId]: {
 *          channelId, interfaceId, createdAt,
 *          trustedUsers: [userId, ...],   // co-owners
 *          bannedUsers:  [userId, ...]
 *       }
 *     },
 *     analytics: { totalCreated, lastCreatedAt }
 *   }
 *
 * PREMIUM RULES
 *   - Free guilds : exactly 1 enabled interface.
 *   - Premium     : up to MAX_INTERFACES_PREMIUM enabled interfaces.
 *
 * The runtime calls `assertPremiumGate(guildId)` before allowing a
 * second interface to be created or the system to spawn extras.
 */

const jsonStore       = require('./jsonStore');
const log             = require('./logger-styled');
const premiumManager  = require('./premiumManager');

const STORE = 'join2create';

const SCHEMA_VERSION         = 2;
const MAX_INTERFACES_FREE    = 1;
const MAX_INTERFACES_PREMIUM = 10;
const DEFAULT_BITRATE_KBPS   = 96;

/* ═══════════════════════════════════════════════════════════════════
   STORE I/O
   ═══════════════════════════════════════════════════════════════════ */

function loadAll() {
    if (!jsonStore.has(STORE)) {
        jsonStore.write(STORE, {});
        return {};
    }
    return jsonStore.read(STORE) || {};
}

function saveAll(data) { jsonStore.write(STORE, data); }

/* ═══════════════════════════════════════════════════════════════════
   SCHEMA MIGRATION
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Migrate a v1 (legacy) guild config object to v2 in-place. Returns
 * the migrated object. Idempotent — running twice is a no-op.
 */
function migrateGuildConfig(legacy, guildId) {
    if (!legacy || typeof legacy !== 'object') {
        return defaultGuildConfig();
    }
    if (legacy.schemaVersion === SCHEMA_VERSION && legacy.interfaces) {
        return legacy;
    }

    const migrated = defaultGuildConfig();

    // If a v1 trigger channel is already configured, lift it into a
    // single "default" interface so the user keeps exactly the same
    // behaviour they had before this rebuild.
    if (legacy.triggerChannelId) {
        const id = makeInterfaceId();
        migrated.interfaces[id] = {
            id,
            name: 'Default Room',
            slug: 'default',
            emoji: '<:Volumeup:1473039290136002844>',
            triggerChannelId:      legacy.triggerChannelId,
            categoryId:            null,
            interfaceChannelId:    legacy.interfaceChannelId    || null,
            controlPanelMessageId: legacy.controlPanelMessageId || null,
            maxUsers:              0,
            bitrate:               DEFAULT_BITRATE_KBPS,
            namingTemplate:        "{user}'s Channel",
            allowedRoles:          [],
            deniedRoles:           [],
            visibility:            'public',
            autoDelete:            true,
            enabled:               legacy.enabled !== false,
            createdAt:             Date.now(),
            updatedAt:             Date.now()
        };
    }

    // Migrate the flat activeChannels map.
    const ifaceList = Object.values(migrated.interfaces);
    const fallbackIface = ifaceList[0]?.id || null;
    if (legacy.activeChannels && typeof legacy.activeChannels === 'object') {
        for (const [ownerUserId, channelId] of Object.entries(legacy.activeChannels)) {
            if (!channelId) continue;
            // v1 stored `channelId` directly; expand it.
            migrated.activeChannels[ownerUserId] = (typeof channelId === 'string')
                ? { channelId, interfaceId: fallbackIface, createdAt: Date.now(), trustedUsers: [], bannedUsers: [] }
                : { ...channelId, interfaceId: channelId.interfaceId || fallbackIface, trustedUsers: channelId.trustedUsers || [], bannedUsers: channelId.bannedUsers || [] };
        }
    }

    log.info(`[J2C] Migrated guild ${guildId} from v${legacy.schemaVersion || 1} → v${SCHEMA_VERSION}`);
    return migrated;
}

function defaultGuildConfig() {
    return {
        schemaVersion: SCHEMA_VERSION,
        tier: 'free',
        interfaces: {},
        activeChannels: {},
        analytics: { totalCreated: 0, lastCreatedAt: 0 }
    };
}

/**
 * Get a guild's config, migrating if necessary. Returns a deep copy
 * so callers can mutate freely; saves go through `saveGuildConfig`.
 */
function getGuildConfig(guildId) {
    const all = loadAll();
    const raw = all[guildId];
    if (!raw) return defaultGuildConfig();
    return migrateGuildConfig(raw, guildId);
}

function saveGuildConfig(guildId, cfg) {
    const all = loadAll();
    cfg.schemaVersion = SCHEMA_VERSION;
    all[guildId] = cfg;
    saveAll(all);
}

/* ═══════════════════════════════════════════════════════════════════
   PREMIUM GATING
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Synchronous tier lookup. Owner → premium, server-premium → premium,
 * everyone else → free. Cheap; safe to call on every voice event.
 */
function getGuildTier(guildId, requesterUserId = null) {
    if (requesterUserId && premiumManager.hasPremiumAccess(requesterUserId, guildId)) return 'premium';
    if (premiumManager.isServerPremium(guildId)) return 'premium';
    return 'free';
}

function maxInterfacesFor(tier) {
    return tier === 'premium' ? MAX_INTERFACES_PREMIUM : MAX_INTERFACES_FREE;
}

/**
 * Returns { ok, reason, tier, currentCount, maxAllowed } describing
 * whether the guild may add another interface right now.
 */
function canAddInterface(guildId, requesterUserId = null) {
    const cfg  = getGuildConfig(guildId);
    const tier = getGuildTier(guildId, requesterUserId);
    const max  = maxInterfacesFor(tier);
    const currentCount = Object.values(cfg.interfaces).filter(i => i.enabled !== false).length;

    if (currentCount < max) {
        return { ok: true, tier, currentCount, maxAllowed: max };
    }
    return {
        ok:        false,
        reason:    tier === 'premium'
            ? `You've reached the premium cap of ${max} interfaces.`
            : `Free servers may run only ${max} Join-to-Create interface. Upgrade to premium to unlock up to ${MAX_INTERFACES_PREMIUM}.`,
        tier,
        currentCount,
        maxAllowed: max
    };
}

/* ═══════════════════════════════════════════════════════════════════
   INTERFACE CRUD
   ═══════════════════════════════════════════════════════════════════ */

function makeInterfaceId() {
    return 'i_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function createInterface(guildId, requesterUserId, partial) {
    const gate = canAddInterface(guildId, requesterUserId);
    if (!gate.ok) return { ok: false, error: gate.reason, tier: gate.tier };

    const cfg = getGuildConfig(guildId);
    const id  = makeInterfaceId();
    const iface = {
        id,
        name:                  (partial?.name  || 'Voice Room').slice(0, 50),
        slug:                  (partial?.slug  || 'room').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'room',
        emoji:                 partial?.emoji  || '<:Volumeup:1473039290136002844>',
        triggerChannelId:      partial?.triggerChannelId || null,
        categoryId:            partial?.categoryId       || null,
        interfaceChannelId:    partial?.interfaceChannelId    || null,
        controlPanelMessageId: partial?.controlPanelMessageId || null,
        maxUsers:              clampInt(partial?.maxUsers, 0, 99,    0),
        bitrate:               clampInt(partial?.bitrate,  8, 384, DEFAULT_BITRATE_KBPS),
        namingTemplate:        (partial?.namingTemplate || "{user}'s {kind} Room").slice(0, 80),
        allowedRoles:          Array.isArray(partial?.allowedRoles) ? partial.allowedRoles.slice(0, 25) : [],
        deniedRoles:           Array.isArray(partial?.deniedRoles)  ? partial.deniedRoles.slice(0, 25)  : [],
        visibility:            partial?.visibility === 'private' ? 'private' : 'public',
        autoDelete:            partial?.autoDelete !== false,
        enabled:               true,
        createdAt:             Date.now(),
        updatedAt:             Date.now()
    };

    cfg.interfaces[id] = iface;
    saveGuildConfig(guildId, cfg);
    return { ok: true, iface };
}

function updateInterface(guildId, interfaceId, partial) {
    const cfg = getGuildConfig(guildId);
    const iface = cfg.interfaces[interfaceId];
    if (!iface) return { ok: false, error: 'Interface not found.' };

    const cloneable = ['name', 'slug', 'emoji', 'triggerChannelId', 'categoryId', 'interfaceChannelId', 'controlPanelMessageId', 'namingTemplate', 'allowedRoles', 'deniedRoles', 'visibility', 'autoDelete', 'enabled'];
    for (const key of cloneable) {
        if (partial?.[key] !== undefined) iface[key] = partial[key];
    }
    if (partial?.maxUsers !== undefined) iface.maxUsers = clampInt(partial.maxUsers, 0, 99,  iface.maxUsers);
    if (partial?.bitrate  !== undefined) iface.bitrate  = clampInt(partial.bitrate,  8, 384, iface.bitrate);
    iface.updatedAt = Date.now();

    saveGuildConfig(guildId, cfg);
    return { ok: true, iface };
}

function deleteInterface(guildId, interfaceId) {
    const cfg = getGuildConfig(guildId);
    if (!cfg.interfaces[interfaceId]) return { ok: false, error: 'Interface not found.' };
    delete cfg.interfaces[interfaceId];
    // Also evict any active channels created under this interface.
    for (const [uid, entry] of Object.entries(cfg.activeChannels)) {
        if (entry.interfaceId === interfaceId) delete cfg.activeChannels[uid];
    }
    saveGuildConfig(guildId, cfg);
    return { ok: true };
}

function findInterfaceByTrigger(guildId, triggerChannelId) {
    const cfg = getGuildConfig(guildId);
    return Object.values(cfg.interfaces).find(i => i.enabled !== false && i.triggerChannelId === triggerChannelId) || null;
}

function listInterfaces(guildId) {
    const cfg = getGuildConfig(guildId);
    return Object.values(cfg.interfaces).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

/* ═══════════════════════════════════════════════════════════════════
   ACTIVE CHANNEL TRACKING
   ═══════════════════════════════════════════════════════════════════ */

function recordActiveChannel(guildId, ownerUserId, channelId, interfaceId) {
    const cfg = getGuildConfig(guildId);
    cfg.activeChannels[ownerUserId] = {
        channelId,
        interfaceId,
        createdAt: Date.now(),
        trustedUsers: [],
        bannedUsers:  []
    };
    cfg.analytics.totalCreated  = (cfg.analytics.totalCreated || 0) + 1;
    cfg.analytics.lastCreatedAt = Date.now();
    saveGuildConfig(guildId, cfg);
}

function dropActiveChannel(guildId, ownerUserId) {
    const cfg = getGuildConfig(guildId);
    if (cfg.activeChannels[ownerUserId]) {
        delete cfg.activeChannels[ownerUserId];
        saveGuildConfig(guildId, cfg);
    }
}

function getActiveChannel(guildId, ownerUserId) {
    const cfg = getGuildConfig(guildId);
    return cfg.activeChannels[ownerUserId] || null;
}

function findOwnerByChannel(guildId, channelId) {
    const cfg = getGuildConfig(guildId);
    for (const [uid, entry] of Object.entries(cfg.activeChannels)) {
        if (entry.channelId === channelId) return uid;
    }
    return null;
}

function transferOwnership(guildId, fromUserId, toUserId) {
    const cfg = getGuildConfig(guildId);
    const entry = cfg.activeChannels[fromUserId];
    if (!entry) return { ok: false, error: 'No active channel for this user.' };
    delete cfg.activeChannels[fromUserId];
    cfg.activeChannels[toUserId] = { ...entry, createdAt: entry.createdAt || Date.now() };
    saveGuildConfig(guildId, cfg);
    return { ok: true };
}

function addTrustedUser(guildId, ownerUserId, targetUserId) {
    const cfg = getGuildConfig(guildId);
    const entry = cfg.activeChannels[ownerUserId];
    if (!entry) return { ok: false, error: 'No active channel.' };
    if (entry.trustedUsers.includes(targetUserId)) return { ok: false, error: 'User is already trusted.' };
    entry.trustedUsers.push(targetUserId);
    saveGuildConfig(guildId, cfg);
    return { ok: true };
}

function removeTrustedUser(guildId, ownerUserId, targetUserId) {
    const cfg = getGuildConfig(guildId);
    const entry = cfg.activeChannels[ownerUserId];
    if (!entry) return { ok: false, error: 'No active channel.' };
    entry.trustedUsers = (entry.trustedUsers || []).filter(id => id !== targetUserId);
    saveGuildConfig(guildId, cfg);
    return { ok: true };
}

/* ═══════════════════════════════════════════════════════════════════
   CONCURRENCY CONTROL
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Per-guild lock — chained promise queue. Wraps `fn` so the next
 * caller awaits the previous task before running. Fixes the duplicate
 * channel bug when 10+ users join the trigger VC simultaneously.
 */
const guildLocks = new Map();

async function withGuildLock(guildId, fn) {
    const previous = guildLocks.get(guildId) || Promise.resolve();
    const next = previous.then(() => fn()).catch(err => {
        log.error(`[J2C] Guild lock error for ${guildId}: ${err.message}`);
        throw err;
    });
    guildLocks.set(guildId, next.then(() => {}, () => {})); // never reject the chain
    try {
        return await next;
    } finally {
        // Best-effort: if we are the tail, clear the entry to release memory.
        if (guildLocks.get(guildId) === next.then(() => {}, () => {})) {
            guildLocks.delete(guildId);
        }
    }
}

/**
 * Per-user create-debounce. Prevents one user from rapidly toggling
 * voice channels and spamming `channels.create` calls.
 */
const userCooldowns = new Map();
const USER_COOLDOWN_MS = 3000;

function isOnCooldown(guildId, userId) {
    const key = `${guildId}:${userId}`;
    const last = userCooldowns.get(key) || 0;
    return Date.now() - last < USER_COOLDOWN_MS;
}

function markCooldown(guildId, userId) {
    userCooldowns.set(`${guildId}:${userId}`, Date.now());
    // Sweep stale keys occasionally
    if (userCooldowns.size > 1000) {
        const cutoff = Date.now() - USER_COOLDOWN_MS * 4;
        for (const [k, ts] of userCooldowns.entries()) {
            if (ts < cutoff) userCooldowns.delete(k);
        }
    }
}

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

function clampInt(value, min, max, fallback) {
    const n = Number.parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

/**
 * Render an interface's `namingTemplate` against a runtime context.
 * Supported placeholders: {user}, {user.id}, {user.tag}, {kind},
 * {server}, {n} (current active count of this interface).
 */
function applyNamingTemplate(template, ctx) {
    return String(template || "{user}'s Channel")
        .replace(/{user(?:\.id)?}/g, ctx.user?.id || '')
        .replace(/{user\.tag}/g, ctx.user?.tag || ctx.user?.username || '')
        .replace(/{user}/g, ctx.user?.username || ctx.user?.globalName || 'User')
        .replace(/{kind}/g, ctx.iface?.name || 'Voice')
        .replace(/{slug}/g, ctx.iface?.slug || 'room')
        .replace(/{server}/g, ctx.guild?.name || '')
        .replace(/{n}/g, String(ctx.activeCount || 0))
        .slice(0, 100);
}

/* ═══════════════════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════════════════ */

module.exports = {
    // Constants
    STORE,
    SCHEMA_VERSION,
    MAX_INTERFACES_FREE,
    MAX_INTERFACES_PREMIUM,
    DEFAULT_BITRATE_KBPS,

    // Config
    defaultGuildConfig,
    getGuildConfig,
    saveGuildConfig,
    migrateGuildConfig,

    // Premium
    getGuildTier,
    maxInterfacesFor,
    canAddInterface,

    // Interfaces
    createInterface,
    updateInterface,
    deleteInterface,
    findInterfaceByTrigger,
    listInterfaces,

    // Active channels
    recordActiveChannel,
    dropActiveChannel,
    getActiveChannel,
    findOwnerByChannel,
    transferOwnership,
    addTrustedUser,
    removeTrustedUser,

    // Concurrency
    withGuildLock,
    isOnCooldown,
    markCooldown,

    // Utils
    clampInt,
    applyNamingTemplate
};
