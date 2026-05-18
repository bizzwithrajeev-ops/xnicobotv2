const { loadImage } = require('@napi-rs/canvas');

class ImageCache {
    constructor() {
        this.cache = new Map();
        this.failedAttempts = new Map();
        this.maxCacheSize = 500;
        this.failedRetryDelay = 30000;
        this.cacheStats = { hits: 0, misses: 0, failures: 0 };
    }

    normalizeUrl(url) {
        if (!url) return null;
        try {
            const urlObj = new URL(url);
            if (urlObj.hostname.includes('discord')) {
                urlObj.searchParams.delete('size');
            }
            return urlObj.toString();
        } catch {
            return url;
        }
    }

    async loadWithCache(url, timeout = 5000) {
        if (!url) return null;

        const normalizedUrl = this.normalizeUrl(url);

        if (this.cache.has(normalizedUrl)) {
            this.cacheStats.hits++;
            return this.cache.get(normalizedUrl);
        }

        const failedAt = this.failedAttempts.get(normalizedUrl);
        if (failedAt && (Date.now() - failedAt) < this.failedRetryDelay) {
            this.cacheStats.failures++;
            return null;
        }

        this.cacheStats.misses++;

        try {
            const image = await Promise.race([
                loadImage(url),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Image load timeout')), timeout)
                )
            ]);

            if (this.cache.size >= this.maxCacheSize) {
                this.evictOldest();
            }

            this.cache.set(normalizedUrl, image);
            this.failedAttempts.delete(normalizedUrl);
            return image;
        } catch (error) {
            this.failedAttempts.set(normalizedUrl, Date.now());
            this.cacheStats.failures++;
            return null;
        }
    }

    evictOldest() {
        const entriesToRemove = Math.floor(this.maxCacheSize * 0.2);
        const keys = Array.from(this.cache.keys());
        for (let i = 0; i < entriesToRemove && i < keys.length; i++) {
            this.cache.delete(keys[i]);
        }
    }

    clear() {
        this.cache.clear();
        this.failedAttempts.clear();
        this.cacheStats = { hits: 0, misses: 0, failures: 0 };
    }

    getStats() {
        const total = this.cacheStats.hits + this.cacheStats.misses;
        const hitRate = total > 0 ? (this.cacheStats.hits / total * 100).toFixed(2) : 0;
        return {
            ...this.cacheStats,
            cacheSize: this.cache.size,
            hitRate: `${hitRate}%`
        };
    }

    clearOldEntries() {
        if (this.cache.size > this.maxCacheSize * 0.8) {
            this.evictOldest();
        }

        const now = Date.now();
        for (const [url, timestamp] of this.failedAttempts.entries()) {
            if (now - timestamp > this.failedRetryDelay) {
                this.failedAttempts.delete(url);
            }
        }
    }
}

const globalImageCache = new ImageCache();

module.exports = globalImageCache;
