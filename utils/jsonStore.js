/**
 * JsonStore — In-memory cache backed by PostgreSQL.
 *
 * All JSON data files are loaded into memory at startup from the
 * `json_store` PostgreSQL table. Reads are synchronous (from cache).
 * Writes update the cache immediately and are debounced before
 * persisting to PostgreSQL — reducing network transfer dramatically.
 *
 * ═══ LOCAL FALLBACK MODE ═══
 * If PostgreSQL is unreachable at startup, the store falls back to
 * reading/writing JSON files in the `json_stores/` directory.
 * The public API stays identical — callers don't need to change.
 *
 * Write strategy:
 *   - Cache updated immediately (synchronous)
 *   - DB write is debounced: waits DEBOUNCE_MS after last write to that store
 *   - Safety flush every PERIODIC_FLUSH_MS writes all dirty stores
 *   - On process exit, all dirty stores are flushed before shutdown
 */

const path = require('path');
const fs = require('fs');
const log = require('./logger-styled');

const DEBOUNCE_MS      = 30_000;   // write to DB 30s after last change
const PERIODIC_FLUSH_MS = 5 * 60_000; // force-flush dirty stores every 5 min
const LOCAL_POLL_MS     = 1_500;   // poll local file mtimes every 1.5s for cross-process sync
const LOCAL_STORE_DIR  = path.join(__dirname, '..', 'json_stores');

const EventEmitter = require('events');

class JsonStore extends EventEmitter {
    constructor() {
        super();
        this.cache        = new Map();
        this.dirty        = new Set();       // stores with unsaved changes
        this.timers       = new Map();       // debounce timers per store
        this._timestamps  = new Map();       // tracks last known DB updated_at
        this._fileMtimes  = new Map();       // tracks last known local file mtimes (local mode)
        this.initialized  = false;
        this._flushTimer  = null;
        this._localMode   = false;           // true when PostgreSQL is unavailable
    }

    async init() {
        // Make init idempotent + concurrent-safe. Several call sites
        // can race here: utils/database.js triggers it from the main
        // bot process during connectDatabase, and dashboard/server.js
        // triggers it both at cold-start (require.main === module
        // branch) and from the per-request middleware. Without a
        // guard each call set up its own poll/flush intervals and
        // re-printed the "Loaded 105 stores" line.
        if (this.initialized) return;
        if (this._initPromise) return this._initPromise;
        this._initPromise = this._doInit();
        try {
            await this._initPromise;
        } finally {
            // Keep the resolved promise around so a second concurrent
            // caller still gets a stable "already done" result.
            // (No-op when initialized === true on next call.)
        }
    }

    async _doInit() {
        // Ensure local store directory exists (needed for fallback)
        if (!fs.existsSync(LOCAL_STORE_DIR)) {
            fs.mkdirSync(LOCAL_STORE_DIR, { recursive: true });
        }

        try {
            const { getPool } = require('./pgPool');
            const pool = getPool();
            // Pull updated_at too so smartRefresh doesn't treat every
            // already-loaded row as a fresh change on its first poll.
            // Without seeding _timestamps here, the very next 3s poll
            // saw dbTs > undefined for every row and emitted 'update'
            // for the entire database — which fed back into the bot's
            // cache invalidators (e.g. automod -> syncToDiscord, antinuke
            // reload, etc.) on every restart and on every bot-side write
            // (since _persistToPg also doesn't seed _timestamps, see below).
            const { rows } = await pool.query('SELECT store_name, data, updated_at FROM json_store');
            for (const row of rows) {
                this.cache.set(row.store_name, row.data);
                if (row.updated_at) {
                    this._timestamps.set(row.store_name, new Date(row.updated_at).getTime());
                }
            }
            this.initialized = true;
            this._localMode = false;
            log.success(`[JsonStore] Loaded ${rows.length} stores from PostgreSQL`);

            // Periodic safety flush
            this._flushTimer = setInterval(() => this._flushDirty(), PERIODIC_FLUSH_MS);
            if (this._flushTimer.unref) this._flushTimer.unref();

            // High-speed, lightweight polling for instant dashboard sync
            this._pollTimer = setInterval(() => this.smartRefresh(), 3000);
            if (this._pollTimer.unref) this._pollTimer.unref();

            // Flush on shutdown
            const onExit = () => this._flushDirtySync();
            process.once('SIGTERM', onExit);
            process.once('SIGINT',  onExit);
            process.once('exit',    onExit);
        } catch (err) {
            // ═══ FALLBACK: Load from local JSON files ═══
            log.warning(`[JsonStore] PostgreSQL unavailable (${err.message?.slice(0, 80)})`);
            log.info('[JsonStore] Falling back to local file storage in json_stores/');
            this._localMode = true;
            this._loadLocalFiles();
            this.initialized = true;

            // Periodic flush to local files
            this._flushTimer = setInterval(() => this._flushDirtyLocal(), PERIODIC_FLUSH_MS);
            if (this._flushTimer.unref) this._flushTimer.unref();

            // ── Cross-process sync via mtime polling ─────────────────────
            // The dashboard runs as a forked child process and writes to the
            // same json_stores/ directory. Without this poll the bot process
            // never sees those writes — its in-memory cache stays frozen
            // forever. We poll every LOCAL_POLL_MS, compare mtimes, re-read
            // changed files, and emit('update') so storeSync can rebuild
            // the per-guild caches.
            this._pollTimer = setInterval(() => this._pollLocalFiles(), LOCAL_POLL_MS);
            if (this._pollTimer.unref) this._pollTimer.unref();

            // Flush on shutdown
            const onExit = () => this._flushDirtyLocalSync();
            process.once('SIGTERM', onExit);
            process.once('SIGINT',  onExit);
            process.once('exit',    onExit);

            log.success(`[JsonStore] Loaded ${this.cache.size} stores from local files`);
        }
    }

    // ── Local file helpers ──────────────────────────────────────────────────

    _loadLocalFiles() {
        try {
            const files = fs.readdirSync(LOCAL_STORE_DIR).filter(f => f.endsWith('.json'));
            for (const file of files) {
                const storeName = path.basename(file, '.json');
                const filePath = path.join(LOCAL_STORE_DIR, file);
                try {
                    const raw = fs.readFileSync(filePath, 'utf8');
                    this.cache.set(storeName, JSON.parse(raw));
                    try {
                        const stat = fs.statSync(filePath);
                        this._fileMtimes.set(storeName, stat.mtimeMs);
                    } catch {}
                } catch (e) {
                    log.warning(`[JsonStore] Skipping corrupt file: ${file}`);
                }
            }
        } catch (e) {
            log.error('[JsonStore] Failed to read local store directory:', e.message);
        }
    }

    /**
     * Poll local-store file mtimes for changes made by other processes
     * (e.g. dashboard forked child). Emits 'update' for any store whose
     * file has been modified since the last poll. Skips stores we have
     * locally-dirty writes for so we never clobber unsynced data.
     */
    _pollLocalFiles() {
        if (!this._localMode) return;
        let files;
        try {
            files = fs.readdirSync(LOCAL_STORE_DIR).filter(f => f.endsWith('.json'));
        } catch {
            return;
        }

        const seen = new Set();
        for (const file of files) {
            const storeName = path.basename(file, '.json');
            seen.add(storeName);
            if (this.dirty.has(storeName)) continue;

            const filePath = path.join(LOCAL_STORE_DIR, file);
            let stat;
            try { stat = fs.statSync(filePath); } catch { continue; }

            const lastMtime = this._fileMtimes.get(storeName) || 0;
            if (stat.mtimeMs <= lastMtime) continue;

            // File changed externally — re-read and emit
            let parsed;
            try {
                const raw = fs.readFileSync(filePath, 'utf8');
                parsed = JSON.parse(raw);
            } catch {
                continue;
            }
            this.cache.set(storeName, parsed);
            this._fileMtimes.set(storeName, stat.mtimeMs);
            try { this.emit('update', storeName, parsed); } catch {}
        }

        // Detect deleted files (store removed from disk by another process)
        for (const storeName of [...this._fileMtimes.keys()]) {
            if (!seen.has(storeName) && !this.dirty.has(storeName)) {
                this.cache.delete(storeName);
                this._fileMtimes.delete(storeName);
                try { this.emit('update', storeName, {}); } catch {}
            }
        }
    }

    _persistToLocal(storeName, data) {
        try {
            const filePath = path.join(LOCAL_STORE_DIR, `${storeName}.json`);
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            // Refresh tracked mtime so the polling loop doesn't treat this
            // self-write as an external change and re-emit 'update'.
            try {
                const stat = fs.statSync(filePath);
                this._fileMtimes.set(storeName, stat.mtimeMs);
            } catch {}
            this.dirty.delete(storeName);
        } catch (e) {
            log.error(`[JsonStore] Error writing local file ${storeName}:`, e.message);
        }
    }

    _flushDirtyLocal() {
        if (this.dirty.size === 0) return;
        for (const name of [...this.dirty]) {
            const data = this.cache.get(name);
            if (data === undefined) continue;
            this._clearTimer(name);
            this._persistToLocal(name, data);
        }
    }

    _flushDirtyLocalSync() {
        if (this.dirty.size === 0) return;
        for (const name of this.dirty) {
            const data = this.cache.get(name);
            if (data === undefined) continue;
            this._clearTimer(name);
            try {
                const filePath = path.join(LOCAL_STORE_DIR, `${name}.json`);
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
                try {
                    const stat = fs.statSync(filePath);
                    this._fileMtimes.set(name, stat.mtimeMs);
                } catch {}
            } catch { }
        }
        this.dirty.clear();
    }

    // ── Core API ────────────────────────────────────────────────────────────

    _pathToName(filePath) {
        return path.basename(filePath, '.json');
    }

    read(storeName) {
        const data = this.cache.get(storeName);
        if (data === undefined || data === null) return {};
        try {
            return JSON.parse(JSON.stringify(data));
        } catch {
            return {};
        }
    }

    readFile(filePath, defaultValue) {
        const name = this._pathToName(filePath);
        const data = this.cache.get(name);
        if (data === undefined || data === null) {
            return defaultValue !== undefined
                ? (typeof defaultValue === 'object' ? JSON.parse(JSON.stringify(defaultValue)) : defaultValue)
                : {};
        }
        try {
            return JSON.parse(JSON.stringify(data));
        } catch {
            return defaultValue !== undefined ? defaultValue : {};
        }
    }

    /**
     * Write — updates cache immediately, schedules debounced persist.
     */
    write(storeName, data) {
        this.cache.set(storeName, JSON.parse(JSON.stringify(data)));
        this.dirty.add(storeName);
        this._schedulePersist(storeName, data);
        this._emitUpdate(storeName, data);
    }

    /**
     * Write Immediately - updates cache and persists immediately (no debounce).
     * Used by Dashboard to ensure immediate consistency.
     *
     * Returns a Promise that resolves when the underlying write
     * (PostgreSQL upsert in production, file write in fallback mode)
     * has completed. Awaiting this is *required* in serverless
     * environments like Vercel — the function host freezes the
     * sandbox the moment the response is sent, so a write started
     * but not awaited can be dropped silently.
     */
    writeImmediate(storeName, data) {
        this.cache.set(storeName, JSON.parse(JSON.stringify(data)));
        this._clearTimer(storeName);
        let persistPromise;
        if (this._localMode) {
            this._persistToLocal(storeName, data);
            persistPromise = Promise.resolve();
        } else {
            persistPromise = this._persistToPg(storeName, data);
        }
        this._emitUpdate(storeName, data);
        return persistPromise || Promise.resolve();
    }

    /**
     * Read-modify-write helper for single-guild updates from the
     * dashboard. Solves a real race that bites cross-host setups:
     *
     *   1. Dashboard cold-start loads `automod` snapshot from PG.
     *   2. Bot updates the same `automod` row (e.g. user toggled via
     *      slash command) — PG row is now ahead of dashboard cache.
     *   3. Dashboard receives PUT for *another* guild, reads stale
     *      cache, merges, writes back — bot's change is now lost.
     *
     * `updateGuildEntry` re-fetches the freshest row from PG before
     * applying the mutation, then writes back. Cache and 'update'
     * event are still updated so the bot sees the result via the 3s
     * smartRefresh poll. Falls back to plain cached read in local
     * mode (single-host, no race).
     *
     * @param {string}   storeName  e.g. 'automod'
     * @param {string}   guildId    the guild whose entry is being changed
     * @param {Function} mutator    receives (guildEntry, allEntries) — return new entry, or modify in place
     * @returns {Promise<object>} the updated guild entry
     */
    async updateGuildEntry(storeName, guildId, mutator) {
        if (!storeName || !guildId || typeof mutator !== 'function') {
            throw new Error('updateGuildEntry requires (storeName, guildId, mutator)');
        }

        let all;
        if (this._localMode) {
            // Single host — file-based; the cache is authoritative.
            all = this.cache.get(storeName) || {};
            all = JSON.parse(JSON.stringify(all));
        } else {
            // Cross-host — re-fetch from PG so we don't clobber the
            // bot's writes that haven't been polled in yet.
            try {
                const { getPool } = require('./pgPool');
                const pool = getPool();
                const { rows } = await pool.query(
                    'SELECT data FROM json_store WHERE store_name = $1 LIMIT 1',
                    [storeName]
                );
                all = rows.length ? rows[0].data : {};
            } catch (err) {
                log.warning(`[JsonStore] updateGuildEntry: live PG read failed for ${storeName}, falling back to cache (${err.message?.slice(0, 60)})`);
                all = this.cache.get(storeName) || {};
                all = JSON.parse(JSON.stringify(all));
            }
        }
        if (!all || typeof all !== 'object') all = {};

        const before = all[guildId] || {};
        const after = mutator(before, all);
        // mutator may return a new object OR mutate `before` in place.
        all[guildId] = (after && typeof after === 'object') ? after : before;

        await this.writeImmediate(storeName, all);
        return all[guildId];
    }

    /**
     * Emit an 'update' event with a deep-cloned snapshot so listeners
     * cannot mutate the cache. Failures in any listener are isolated.
     */
    _emitUpdate(storeName, data) {
        let snapshot;
        try {
            snapshot = JSON.parse(JSON.stringify(data));
        } catch {
            snapshot = data;
        }
        try {
            this.emit('update', storeName, snapshot);
        } catch (e) {
            try { log.error(`[JsonStore] Listener error for ${storeName}:`, e?.message || e); } catch {}
        }
    }

    writeFile(filePath, data) {
        this.write(this._pathToName(filePath), data);
    }

    has(storeName) {
        return this.cache.has(storeName);
    }

    hasFile(filePath) {
        return this.cache.has(this._pathToName(filePath));
    }

    delete(storeName) {
        this.cache.delete(storeName);
        this.dirty.delete(storeName);
        this._clearTimer(storeName);

        if (this._localMode) {
            try {
                const filePath = path.join(LOCAL_STORE_DIR, `${storeName}.json`);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch { }
        } else {
            const { getPool } = require('./pgPool');
            const pool = getPool();
            pool.query('DELETE FROM json_store WHERE store_name = $1', [storeName])
                .catch(err => log.error(`[JsonStore] Error deleting ${storeName}:`, err));
        }
    }

    /**
     * Schedule a debounced persist for a store.
     * Resets the timer each time the store is written within the debounce window.
     */
    _schedulePersist(storeName, data) {
        this._clearTimer(storeName);
        const timer = setTimeout(() => {
            this.timers.delete(storeName);
            const current = this.cache.get(storeName) ?? data;
            if (this._localMode) {
                this._persistToLocal(storeName, current);
            } else {
                this._persistToPg(storeName, current);
            }
        }, DEBOUNCE_MS);
        if (timer.unref) timer.unref();
        this.timers.set(storeName, timer);
    }

    _clearTimer(storeName) {
        const existing = this.timers.get(storeName);
        if (existing) {
            clearTimeout(existing);
            this.timers.delete(storeName);
        }
    }

    // ── PostgreSQL persistence (only used when not in local mode) ────────

    /**
     * Flush all dirty stores to DB immediately (periodic safety net).
     */
    async _flushDirty() {
        if (this._localMode) return this._flushDirtyLocal();
        if (this.dirty.size === 0) return;
        const toFlush = [...this.dirty];
        await Promise.allSettled(toFlush.map(name => {
            const data = this.cache.get(name);
            if (data === undefined) return Promise.resolve();
            this._clearTimer(name);
            this.dirty.delete(name);
            return this._persistToPg(name, data);
        }));
    }

    /**
     * Synchronous-style flush called on exit — fires off promises but can't await.
     */
    _flushDirtySync() {
        if (this._localMode) return this._flushDirtyLocalSync();
        if (this.dirty.size === 0) return;
        const { getPool } = require('./pgPool');
        const pool = getPool();
        for (const name of this.dirty) {
            const data = this.cache.get(name);
            if (data === undefined) continue;
            this._clearTimer(name);
            pool.query(
                `INSERT INTO json_store (store_name, data, updated_at)
                 VALUES ($1, $2::jsonb, NOW())
                 ON CONFLICT (store_name) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
                [name, JSON.stringify(data)]
            ).catch(() => {});
        }
        this.dirty.clear();
    }

    _persistToPg(storeName, data) {
        const { getPool } = require('./pgPool');
        const pool = getPool();
        return pool.query(
            `INSERT INTO json_store (store_name, data, updated_at)
             VALUES ($1, $2::jsonb, NOW())
             ON CONFLICT (store_name) DO UPDATE SET data = $2::jsonb, updated_at = NOW()
             RETURNING updated_at`,
            [storeName, JSON.stringify(data)]
        ).then((res) => {
            this.dirty.delete(storeName);
            // Seed _timestamps so smartRefresh doesn't treat our own
            // write as an external change on the next 3s poll. Without
            // this, every bot-side write triggered a self-feeding loop:
            //   write -> updated_at = NOW() -> next poll sees newer ts
            //   -> emit('update') -> storeSync handler runs again
            //   -> for automod that meant Discord-API resync every 30s.
            const ts = res?.rows?.[0]?.updated_at;
            if (ts) this._timestamps.set(storeName, new Date(ts).getTime());
        }).catch(err => log.error(`[JsonStore] Error persisting ${storeName}:`, err));
    }

    async smartRefresh() {
        if (!this.initialized || this._localMode) return;
        const { getPool } = require('./pgPool');
        const pool = getPool();
        try {
            // Only fetch timestamps, extremely low compute usage
            const { rows } = await pool.query('SELECT store_name, updated_at FROM json_store');
            const changedStores = [];
            
            for (const row of rows) {
                const currentTs = this._timestamps.get(row.store_name);
                const dbTs = new Date(row.updated_at).getTime();
                
                // If timestamp changed (and we don't have local dirty changes)
                if ((!currentTs || dbTs > currentTs) && !this.dirty.has(row.store_name)) {
                    changedStores.push(row.store_name);
                    this._timestamps.set(row.store_name, dbTs);
                }
            }
            
            // Only fetch data for stores that actually changed
            if (changedStores.length > 0) {
                await this.refresh(...changedStores);
            }
        } catch (err) {
            // Ignore errors in background polling
        }
    }

    async refresh(...storeNames) {
        if (this._localMode) {
            // In local mode, re-read from files
            this._loadLocalFiles();
            return this.cache.size;
        }

        const { getPool } = require('./pgPool');
        const pool = getPool();
        if (storeNames.length === 0) {
            const { rows } = await pool.query('SELECT store_name, data, updated_at FROM json_store');
            for (const row of rows) {
                if (!this.dirty.has(row.store_name)) {
                    this.cache.set(row.store_name, row.data);
                    if (row.updated_at) this._timestamps.set(row.store_name, new Date(row.updated_at).getTime());
                    this.emit('update', row.store_name, row.data);
                }
            }
            return rows.length;
        }
        const { rows } = await pool.query(
            'SELECT store_name, data, updated_at FROM json_store WHERE store_name = ANY($1)',
            [storeNames]
        );
        for (const row of rows) {
            if (!this.dirty.has(row.store_name)) {
                this.cache.set(row.store_name, row.data);
                if (row.updated_at) this._timestamps.set(row.store_name, new Date(row.updated_at).getTime());
                this.emit('update', row.store_name, row.data);
            }
        }
        return rows.length;
    }

    async flush() {
        // Cancel all timers and flush everything immediately
        for (const [name, timer] of this.timers) {
            clearTimeout(timer);
        }
        this.timers.clear();

        if (this._localMode) {
            this._flushDirtyLocal();
            // Also persist all cached stores to local files
            for (const [storeName, data] of this.cache) {
                this._persistToLocal(storeName, data);
            }
            log.info(`[JsonStore] Flushed ${this.cache.size} stores to local files`);
            return;
        }

        await this._flushDirty();
        // Also persist remaining cache
        const { getPool } = require('./pgPool');
        const pool = getPool();
        const promises = [];
        for (const [storeName, data] of this.cache) {
            promises.push(
                pool.query(
                    `INSERT INTO json_store (store_name, data, updated_at)
                     VALUES ($1, $2::jsonb, NOW())
                     ON CONFLICT (store_name) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
                    [storeName, JSON.stringify(data)]
                ).catch(err => log.error(`[JsonStore] Error flushing ${storeName}:`, err))
            );
        }
        await Promise.all(promises);
        log.info(`[JsonStore] Flushed ${this.cache.size} stores to PostgreSQL`);
    }
}

const store = new JsonStore();
module.exports = store;
