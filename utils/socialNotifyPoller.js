const https = require('https');
const http = require('http');
const { EmbedBuilder } = require('discord.js');

const jsonStore = require('./jsonStore');
const log = require('./logger-styled');

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const YOUTUBE_RSS_BASE = 'https://www.youtube.com/feeds/videos.xml';

let pollTimer = null;

function loadConfig() {
    try {
        if (!jsonStore.has('social-notify')) return {};
        return jsonStore.read('social-notify');
    } catch { return {}; }
}

function loadCache() {
    try {
        if (!jsonStore.has('social-notify-cache')) return {};
        return jsonStore.read('social-notify-cache');
    } catch { return {}; }
}

function saveCache(cache) {
    try {
        jsonStore.write('social-notify-cache', cache);
    } catch (e) {
        log.error('[Social Notify] Failed to save cache:', e.message);
    }
}

/**
 * Fetch a URL and return the response body as a string.
 * Follows up to 5 redirects. Uses built-in http/https modules.
 */
function fetchUrl(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));

        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DiscordBot/1.0)' }, timeout: 15000 }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(fetchUrl(res.headers.location, maxRedirects - 1));
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    });
}

/**
 * Resolve a YouTube @handle or username to a channel ID by scraping the page.
 */
async function resolveYouTubeChannelId(handle) {
    // Already a channel ID
    if (handle.startsWith('UC') && handle.length >= 20) return handle;

    const cleanHandle = handle.startsWith('@') ? handle : `@${handle}`;
    try {
        const html = await fetchUrl(`https://www.youtube.com/${encodeURIComponent(cleanHandle)}`);
        // Look for channel ID in meta tags or canonical links
        const channelIdMatch = html.match(/(?:"channelId"|"externalId"|channel_id=|\/channel\/)(UC[\w-]{22})/);
        if (channelIdMatch) return channelIdMatch[1];
    } catch { /* ignore */ }
    return null;
}

/**
 * Parse YouTube RSS XML and extract video entries.
 * Returns array of { videoId, title, channelName, published, url }
 */
function parseYouTubeRSS(xml) {
    const entries = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;

    while ((match = entryRegex.exec(xml)) !== null) {
        const entry = match[1];

        const videoIdMatch = entry.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/);
        const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
        const publishedMatch = entry.match(/<published>([\s\S]*?)<\/published>/);
        const authorMatch = entry.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/);
        const linkMatch = entry.match(/<link[^>]*href="([^"]*)"[^>]*\/>/);

        if (videoIdMatch) {
            entries.push({
                videoId: videoIdMatch[1].trim(),
                title: titleMatch ? decodeXMLEntities(titleMatch[1].trim()) : 'Untitled',
                channelName: authorMatch ? decodeXMLEntities(authorMatch[1].trim()) : 'Unknown',
                published: publishedMatch ? new Date(publishedMatch[1].trim()) : new Date(),
                url: linkMatch ? linkMatch[1] : `https://www.youtube.com/watch?v=${videoIdMatch[1].trim()}`
            });
        }
    }

    return entries;
}

function decodeXMLEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
}

/**
 * Build a YouTube notification embed.
 */
function buildYouTubeEmbed(video, isLive = false) {
    const embed = new EmbedBuilder()
        .setColor(isLive ? 0xFF0000 : 0xFF0000)
        .setAuthor({ name: video.channelName, iconURL: 'https://i.imgur.com/3pGrCPv.png' })
        .setTitle(`${isLive ? '🔴 LIVE: ' : ''}${video.title}`)
        .setURL(video.url)
        .setImage(`https://img.youtube.com/vi/${video.videoId}/maxresdefault.jpg`)
        .setTimestamp(video.published)
        .setFooter({ text: isLive ? 'YouTube • Live' : 'YouTube' });
    return embed;
}

/**
 * Check if a YouTube video is a livestream by checking page metadata.
 * Returns true if the video is currently live.
 *
 * Note: We only flag genuinely *live-now* streams. Past broadcasts
 * (`isLiveContent: true` once a stream ends) used to wrongly trip
 * the check and re-fire the live message every poll.
 */
async function checkIfLive(videoId) {
    try {
        const html = await fetchUrl(`https://www.youtube.com/watch?v=${videoId}`);
        // Currently live: hlsManifestUrl present + isLiveBroadcast=true,
        // or "isLiveNow":true. Past broadcast pages still contain
        // "isLiveContent":true so we don't rely on that one alone.
        if (html.includes('"isLiveNow":true')) return true;
        if (html.includes('"isLive":true') && html.includes('"isLiveBroadcast":true')) return true;
        return false;
    } catch {
        return false;
    }
}

/**
 * Format a notification message with video variables.
 */
function formatMessage(message, video) {
    return message
        .replace(/{channel}/g, video.channelName)
        .replace(/{title}/g, video.title)
        .replace(/{url}/g, video.url)
        .replace(/{videoId}/g, video.videoId);
}

/**
 * Main polling function — checks YouTube RSS feeds for all guilds.
 */
async function pollYouTube(client, log) {
    const config = loadConfig();
    const cache = loadCache();

    // Collect all unique YouTube handles/IDs to check
    const channelMap = new Map(); // handle → channelId (resolved)

    for (const [guildId, guildConfig] of Object.entries(config)) {
        const ytConfig = guildConfig?.youtube;
        if (!ytConfig?.enabled || !ytConfig?.notifyChannel || !ytConfig?.channels?.length) continue;

        for (const handle of ytConfig.channels) {
            if (!channelMap.has(handle)) {
                channelMap.set(handle, null); // will resolve later
            }
        }
    }

    if (channelMap.size === 0) return;

    // Resolve handles to channel IDs (use cache to avoid re-resolving)
    if (!cache.channelIds) cache.channelIds = {};

    for (const handle of channelMap.keys()) {
        if (cache.channelIds[handle]) {
            channelMap.set(handle, cache.channelIds[handle]);
        } else {
            try {
                const channelId = await resolveYouTubeChannelId(handle);
                if (channelId) {
                    channelMap.set(handle, channelId);
                    cache.channelIds[handle] = channelId;
                }
            } catch { /* ignore */ }
        }
    }

    // Fetch RSS feeds for each resolved channel
    const videosByHandle = new Map(); // handle → latest video entries
    if (!cache.failedHandles) cache.failedHandles = {};

    for (const [handle, channelId] of channelMap.entries()) {
        if (!channelId) continue;

        try {
            const xml = await fetchUrl(`${YOUTUBE_RSS_BASE}?channel_id=${channelId}`);
            const entries = parseYouTubeRSS(xml);
            if (entries.length > 0) {
                videosByHandle.set(handle, entries);
            }
            // Clear failure state on success
            if (cache.failedHandles[handle]) delete cache.failedHandles[handle];
        } catch (e) {
            // Only log the first failure per handle, then suppress repeats
            if (!cache.failedHandles[handle]) {
                if (log) log.warning(`[Social Notify] YouTube RSS fetch failed for ${handle}: ${e.message} (suppressing future repeats)`);
                cache.failedHandles[handle] = Date.now();
            }
        }
    }

    // Initialize seen videos cache
    if (!cache.seenVideos) cache.seenVideos = {};

    // Check each guild's YouTube config for new videos
    for (const [guildId, guildConfig] of Object.entries(config)) {
        const ytConfig = guildConfig?.youtube;
        if (!ytConfig?.enabled || !ytConfig?.notifyChannel || !ytConfig?.channels?.length) continue;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        const notifyChannel = guild.channels.cache.get(ytConfig.notifyChannel);
        if (!notifyChannel) continue;

        for (const handle of ytConfig.channels) {
            const videos = videosByHandle.get(handle);
            if (!videos || videos.length === 0) continue;

            // Get seen video IDs for this guild+handle combo
            const cacheKey = `${guildId}:${handle}`;
            const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

            if (!cache.seenVideos[cacheKey]) {
                // First run: mark older videos as seen, but let
                // anything from the last 24h flow through so the user
                // gets the notification they expect right after
                // adding a channel. (Previously we marked every
                // current video as seen, so the channel had to upload
                // a *new* video before the integration ever fired —
                // which the user reads as "notifications don't work".)
                cache.seenVideos[cacheKey] = videos
                    .filter(v => v.published.getTime() <= oneDayAgo)
                    .map(v => v.videoId);
            }

            const seenIds = new Set(cache.seenVideos[cacheKey]);
            const newVideos = videos.filter(v => !seenIds.has(v.videoId));

            // Only notify for videos published within the last 24 hours
            const recentNewVideos = newVideos.filter(v => v.published.getTime() > oneDayAgo);

            for (const video of recentNewVideos) {
                try {
                    // Check if this video is a livestream
                    const isLive = await checkIfLive(video.videoId);

                    let messageTemplate;
                    if (isLive && ytConfig.liveEnabled !== false) {
                        messageTemplate = ytConfig.liveMessage || '🔴 **{channel}** is now **LIVE** on YouTube!\n\n**{title}**\n{url}';
                    } else if (isLive && ytConfig.liveEnabled === false) {
                        // Live alerts disabled, skip this
                        continue;
                    } else {
                        messageTemplate = ytConfig.message || '{channel} uploaded a new video!\n\n**{title}**\n{url}';
                    }

                    const messageText = formatMessage(messageTemplate, video);
                    // Build ping text — handle @everyone specially
                    let pingRole = '';
                    const allowedMentions = { parse: [] };
                    if (ytConfig.pingRole) {
                        if (ytConfig.pingRole === 'everyone') {
                            pingRole = '@everyone ';
                            allowedMentions.parse.push('everyone');
                        } else {
                            pingRole = `<@&${ytConfig.pingRole}> `;
                            allowedMentions.roles = [ytConfig.pingRole];
                        }
                    }
                    const embed = buildYouTubeEmbed(video, isLive);

                    await notifyChannel.send({
                        content: `${pingRole}${messageText}`,
                        embeds: [embed],
                        allowedMentions
                    });

                    if (log) log.info(`[Social Notify] YouTube: Notified ${guild.name} about ${video.title} by ${video.channelName}`);
                } catch (e) {
                    if (log) log.error(`[Social Notify] Failed to send notification in ${guild.name}: ${e.message}`);
                }
            }

            // Update seen videos (keep last 50 to prevent unbounded growth)
            const allIds = [...seenIds, ...newVideos.map(v => v.videoId)];
            cache.seenVideos[cacheKey] = allIds.slice(-50);
        }
    }

    saveCache(cache);
}

/**
 * Start the YouTube polling loop.
 */
function startPolling(client, log) {
    if (pollTimer) clearInterval(pollTimer);

    // Initial poll after 30 seconds (let bot fully start)
    setTimeout(() => {
        pollYouTube(client, log).catch(e => {
            if (log) log.error(`[Social Notify] Poll error: ${e.message}`);
        });
    }, 30000);

    // Then poll every 5 minutes
    pollTimer = setInterval(() => {
        pollYouTube(client, log).catch(e => {
            if (log) log.error(`[Social Notify] Poll error: ${e.message}`);
        });
    }, POLL_INTERVAL);

    if (log) log.success('YouTube notification polling started (every 5m)');
}

function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

module.exports = { startPolling, stopPolling, pollYouTube, resolveYouTubeChannelId, checkIfLive };
