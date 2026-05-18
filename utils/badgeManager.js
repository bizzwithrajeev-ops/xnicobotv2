/**
 * BadgeManager — single source of truth for the bot's badge catalog.
 *
 * ──────────────────────────────────────────────────────────────────
 * Architecture (post v2)
 * ──────────────────────────────────────────────────────────────────
 *  - The badge catalog is hardcoded in `DEFAULT_BADGES` below. There
 *    is no longer a `custom-badges` store; users cannot create new
 *    badges. This keeps the catalog consistent across restarts and
 *    avoids the "I edited the badge but it didn't update" bug — the
 *    old code seeded defaults into a JSON store, then never
 *    overwrote them on subsequent boots.
 *  - Each default has a `position` integer. `getUserBadges` returns
 *    badges sorted by `position` ascending so the display order is
 *    deterministic for both `/badges` and the profile panel.
 *  - User-to-badge assignments live in `jsonStore`'s `user-badges`
 *    store: `{ [userId]: badgeId[] }`. We sweep orphaned ids
 *    (badges that no longer exist in DEFAULT_BADGES) on startup so
 *    the user view never shows ghosts.
 *
 * ──────────────────────────────────────────────────────────────────
 * Migration on startup
 * ──────────────────────────────────────────────────────────────────
 * `initializeDefaultBadges()` is the one-shot called by index.js and
 * by the top.gg vote webhook. It:
 *   1. Deletes the legacy `custom-badges` store if it exists. The
 *      data was never the source of truth post-refactor — the new
 *      catalog lives in code.
 *   2. Walks `user-badges` and removes any badge ID no longer in
 *      DEFAULT_BADGES. This silently cleans up after badges that
 *      used to exist (e.g. user-created ones from the old system).
 *
 * ──────────────────────────────────────────────────────────────────
 * Adding / editing badges
 * ──────────────────────────────────────────────────────────────────
 * Edit DEFAULT_BADGES below. Restart the bot. That's it. No JSON
 * stores to clear, no migrations to run.
 */

'use strict';

const jsonStore = require('./jsonStore');
const fs = require('fs');
const path = require('path');
const log = require('./logger-styled');

/**
 * The badge catalog. Order in this array is the display order — but
 * we also stamp explicit `position` numbers (10, 20, 30…) so
 * `getUserBadges` can sort even if the array gets reordered later.
 *
 * To add a badge: insert it at the desired position and update the
 * surrounding positions. The 10-spaced layout leaves room to slot
 * new entries without renumbering everything.
 */
const DEFAULT_BADGES = Object.freeze([
    {
        position:    10,
        badgeId:     'owner',
        name:        'Owner',
        emoji:       '<:Crown:1506010837368963142>',
        description: 'Bot owner',
        color:       '#bcf1e4',
        imageUrl:    null
    },
    {
        position:    20,
        badgeId:     'dev',
        name:        'Developer',
        emoji:       '<:developer:1485248261492178995>',
        description: 'Development team',
        color:       '#bcf1e4',
        imageUrl:    null
    },
    {
        position:    30,
        badgeId:     'staff',
        name:        'Staff',
        emoji:       '<:gmod:1485249732258566156>',
        description: 'Staff team',
        color:       '#bcf1e4',
        imageUrl:    null
    },
    {
        position:    40,
        badgeId:     'partner',
        name:        'Partnership',
        emoji:       '<:PartnerServer:1506010259909771356>',
        description: 'Partnered member',
        color:       '#bcf1e4',
        imageUrl:    null
    },
    {
        position:    50,
        badgeId:     'premium',
        name:        'Premium',
        emoji:       '<:Sketch:1473038248493453352>',
        description: 'Premium supporter',
        color:       '#00ffff',
        imageUrl:    null
    },
    {
        position:    60,
        badgeId:     'verifieduser',
        name:        'Verified',
        emoji:       '<:Checkedbox:1473038547165384804>',
        description: 'Verified member',
        color:       '#bcf1e4',
        imageUrl:    null
    },
    {
        position:    70,
        badgeId:     'contributor',
        name:        'Contributor',
        emoji:       '<:Bookmark:1473038643492028517>',
        description: 'Contributed to the community',
        color:       '#06ffa5',
        imageUrl:    null
    },
    {
        position:    80,
        badgeId:     'goldenbug',
        name:        'Golden Bug Hunter',
        emoji:       '<:bug2_golden:1485248257071513610>',
        description: 'Found a critical bug',
        color:       '#bcf1e4',
        imageUrl:    null
    },
    {
        position:    90,
        badgeId:     'bug',
        name:        'Bug Hunter',
        emoji:       '<:bug1_rookie:1485248255305453598>',
        description: 'Reported a bug',
        color:       '#bcf1e4',
        imageUrl:    null
    },
    {
        position:    100,
        badgeId:     'nico',
        name:        'OG xNico User',
        emoji:       '<:xnico:1486755083390550036>',
        description: 'An OG regular user',
        color:       '#bcf1e4',
        imageUrl:    null
    },
    {
        position:    110,
        badgeId:     'voter',
        name:        'Voter',
        emoji:       '<:Award:1473038391632203887>',
        description: 'Voted for the bot on top.gg',
        color:       '#3ba55d',
        imageUrl:    null
    }
]);

const BADGE_BY_ID = new Map(DEFAULT_BADGES.map(b => [b.badgeId, b]));

class BadgeManager {
    constructor() {
        this.badgesPath = path.join(__dirname, '../assets/badges');
        this.ensureFiles();
    }

    ensureFiles() {
        if (!fs.existsSync(this.badgesPath)) {
            fs.mkdirSync(this.badgesPath, { recursive: true });
        }
    }

    // ── Catalog access ──────────────────────────────────────────────

    /**
     * Whole catalog, sorted by position ascending.
     */
    getCatalog() {
        return DEFAULT_BADGES.map(b => ({ ...b }));
    }

    /**
     * Look up a single badge definition by ID. Returns a clone so
     * callers can't accidentally mutate the frozen catalog.
     */
    getBadge(badgeId) {
        if (typeof badgeId !== 'string') return null;
        const b = BADGE_BY_ID.get(badgeId.toLowerCase());
        return b ? { ...b } : null;
    }

    /**
     * Returns true if the given badgeId exists in the catalog. The
     * legacy `isDefaultBadge` name is kept as an alias because
     * a few command files still call it.
     */
    isDefaultBadge(badgeId) {
        if (typeof badgeId !== 'string') return false;
        return BADGE_BY_ID.has(badgeId.toLowerCase());
    }

    // ── User-badge store ────────────────────────────────────────────

    readUserBadges() {
        const data = jsonStore.read('user-badges');
        if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
        return data;
    }

    writeUserBadges(userBadges) {
        jsonStore.write('user-badges', userBadges);
    }

    /**
     * Boot-time housekeeping:
     *   1. Drop the legacy `custom-badges` store entirely (no longer
     *      consulted post-refactor; previously caused stale badge
     *      data to override the in-code catalog).
     *   2. Sweep `user-badges` for orphan ids that aren't in the
     *      current catalog and persist the cleanup if anything
     *      changed.
     */
    async initializeDefaultBadges() {
        try {
            // 1. Retire legacy custom badges store.
            if (jsonStore.has('custom-badges')) {
                try {
                    jsonStore.delete('custom-badges');
                    log.info('[Badges] Removed legacy custom-badges store (catalog now lives in code).');
                } catch (e) {
                    // Non-fatal — fall back to overwriting with an empty array.
                    try { jsonStore.write('custom-badges', []); } catch {}
                }
            }

            // 2. Sweep orphan user-badge entries.
            const userBadges = this.readUserBadges();
            let dirty = false;
            let orphaned = 0;
            for (const userId of Object.keys(userBadges)) {
                const list = Array.isArray(userBadges[userId]) ? userBadges[userId] : [];
                const filtered = list.filter(id => BADGE_BY_ID.has(id));
                // Also dedupe — a few users had the same badge listed twice.
                const deduped = [...new Set(filtered)];
                if (deduped.length !== list.length) {
                    orphaned += list.length - deduped.length;
                    userBadges[userId] = deduped;
                    dirty = true;
                }
            }
            if (dirty) {
                this.writeUserBadges(userBadges);
                log.info(`[Badges] Cleaned ${orphaned} orphan/duplicate badge id(s) from user-badges store.`);
            }
            return true;
        } catch (error) {
            log.error('Error initializing badges:', error);
            return false;
        }
    }

    /**
     * Returns the user's owned badge definitions, sorted by `position`
     * ascending. Unknown ids in storage are silently dropped so the UI
     * never renders ghost badges.
     */
    async getUserBadges(userId) {
        try {
            if (!userId) return [];
            const userBadges = this.readUserBadges();
            const ids = Array.isArray(userBadges[userId]) ? userBadges[userId] : [];
            if (ids.length === 0) return [];

            const badges = [];
            for (const id of ids) {
                const def = BADGE_BY_ID.get(id);
                if (def) badges.push({ ...def });
            }
            badges.sort((a, b) => a.position - b.position);
            return badges;
        } catch (error) {
            log.error('Error getting user badges:', error);
            return [];
        }
    }

    async addBadgeToUser(userId, badgeId) {
        try {
            if (!userId || typeof userId !== 'string') {
                return { success: false, message: 'A valid user ID is required.' };
            }
            if (!badgeId || typeof badgeId !== 'string') {
                return { success: false, message: 'A valid badge ID is required.' };
            }

            const badge = BADGE_BY_ID.get(badgeId);
            if (!badge) {
                return { success: false, message: 'Badge not found' };
            }

            const userBadges = this.readUserBadges();
            if (!userBadges[userId]) userBadges[userId] = [];

            if (userBadges[userId].includes(badgeId)) {
                return { success: false, message: 'User already has this badge' };
            }

            userBadges[userId].push(badgeId);
            this.writeUserBadges(userBadges);

            return { success: true, badge: { ...badge }, totalBadges: userBadges[userId].length };
        } catch (error) {
            log.error('Error adding badge to user:', error);
            return { success: false, message: 'Error adding badge' };
        }
    }

    async removeBadgeFromUser(userId, badgeId) {
        try {
            if (!userId || typeof userId !== 'string') {
                return { success: false, message: 'A valid user ID is required.' };
            }
            const userBadges = this.readUserBadges();
            if (!userBadges[userId] || !userBadges[userId].includes(badgeId)) {
                return { success: false, message: 'User does not have this badge' };
            }

            userBadges[userId] = userBadges[userId].filter(b => b !== badgeId);
            this.writeUserBadges(userBadges);

            const badge = BADGE_BY_ID.get(badgeId);
            return { success: true, badge: badge ? { ...badge } : null, totalBadges: userBadges[userId].length };
        } catch (error) {
            log.error('Error removing badge from user:', error);
            return { success: false, message: 'Error removing badge' };
        }
    }

    /**
     * Whole catalog accessor for callers that previously walked
     * `custom-badges`. Returns the same shape (clones, sorted by
     * position).
     */
    async getAllBadges() {
        return this.getCatalog();
    }

    // ── Removed APIs ────────────────────────────────────────────────
    //
    // The following methods used to let owners create / edit /
    // delete badges at runtime. They are now hard no-ops because the
    // catalog is code-managed. The legacy command files have been
    // disabled (their data field is set to null and their handlers
    // return a "removed" notice).
    //
    // Keep these stubs around so any third-party code that still
    // imports them doesn't crash — they just refuse the operation.

    async createCustomBadge() {
        return { success: false, message: 'Custom badges have been removed. Edit `utils/badgeManager.js` and restart the bot to update the catalog.' };
    }

    async editBadge() {
        return { success: false, message: 'Badge editing is now code-managed. Edit `utils/badgeManager.js` and restart the bot to update the catalog.' };
    }

    async deleteBadge() {
        return { success: false, message: 'Badge deletion is now code-managed. Edit `utils/badgeManager.js` and restart the bot to update the catalog.' };
    }

    async purgeBadgeFromAllUsers(badgeId) {
        // Still useful as an admin tool — strips a badge id from every
        // user without touching the catalog. Used by the badge-remove
        // command for a "remove from everyone" flag.
        try {
            if (!badgeId || typeof badgeId !== 'string') {
                return { success: false, usersAffected: 0, message: 'A valid badge ID is required.' };
            }
            const userBadges = this.readUserBadges();
            let affected = 0;
            for (const userId of Object.keys(userBadges)) {
                const list = Array.isArray(userBadges[userId]) ? userBadges[userId] : [];
                if (list.includes(badgeId)) {
                    userBadges[userId] = list.filter(b => b !== badgeId);
                    affected++;
                }
            }
            if (affected > 0) {
                this.writeUserBadges(userBadges);
            }
            return { success: true, usersAffected: affected };
        } catch (error) {
            log.error('Error purging badge from users:', error);
            return { success: false, usersAffected: 0, message: 'Error purging badge.' };
        }
    }
}

module.exports = new BadgeManager();
