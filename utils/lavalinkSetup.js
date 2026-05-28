const fs = require('fs');
const path = require('path');
const { LavalinkManager } = require('lavalink-client');
const { ContainerBuilder, TextDisplayBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { formatTime } = require('./helpers');
const { updateMusicPanel, updateVoiceChannelStatus } = require('./musicPanel');
const log = require('./logger-styled');
const jsonStore = require('./jsonStore');
const { getMusicSettings } = require('./musicSettings');

// Shared state maps for music features
const autoplayStatus = new Map();
const lastPlayedTracks = new Map();
const autoplayHistory = new Map();
const panelUpdateIntervals = new Map();
const panelUpdateInProgress = new Map();
const previousVolume = new Map();
const nowPlayingMessages = new Map();
const musicPanelCache = new Map();
const musicPanelChannelCache = new Map();
const inactivityTimers = new Map();

global.musicPanelCache = musicPanelCache;
global.musicPanelChannelCache = musicPanelChannelCache;

// Throttle tracking — prevent log spam from repeated disconnect/reconnect cycles
const nodeDisconnectThrottle = new Map();

/**
 * Load Lavalink nodes from config/lavalink-nodes.json and create the manager.
 * @returns {LavalinkManager}
 */
function createLavalinkManager(client) {
    const lavalinkConfigPath = path.join(__dirname, '../config/lavalink-nodes.json');
    let lavalinkNodes = [];
    try {
        const config = JSON.parse(fs.readFileSync(lavalinkConfigPath, 'utf8'));
        if (config.nodes && Array.isArray(config.nodes) && config.nodes.length > 0) {
            lavalinkNodes = config.nodes.map(node => ({
                retryAmount: 10,
                retryDelay: 5000,
                ...node
            }));
            log.info(`Loaded ${config.nodes.length} Lavalink node(s) from config`);
        } else {
            log.warning('No Lavalink nodes found in config/lavalink-nodes.json');
        }
    } catch (error) {
        log.error('Failed to load config/lavalink-nodes.json:', error.message);
    }

    const lavalinkManager = new LavalinkManager({
        nodes: lavalinkNodes,
        sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
        client: {
            id: process.env.CLIENT_ID || client.user?.id,
            username: 'Nico'
        },
        autoSkip: true,
        autoSkipOnResolveError: true,
        emitNewSongsOnly: true,
        playerOptions: {
            applyVolumeAsFilter: false,
            clientBasedPositionUpdateInterval: 250,
            defaultSearchPlatform: "ytsearch",
            volumeDecrementer: 0.75,
            requesterTransformer: (requester) => {
                return {
                    id: requester.id,
                    username: requester.username,
                    avatar: requester.displayAvatarURL()
                };
            },
            onDisconnect: {
                autoReconnect: true,
                destroyPlayer: false
            }
        },
        advancedOptions: {
            debugOptions: {
                noAudio: false,
                playerDestroy: {
                    dontThrowError: true,
                    debugLog: false
                }
            }
        }
    });

    client.lavalinkManager = lavalinkManager;

    // Patch all existing and future nodes to prevent unhandled rejections from fetchInfo failures.
    // The library's open() method is async and bound to a WebSocket 'open' event — if fetchInfo
    // returns a non-JSON response (e.g. proxy error), the thrown error becomes an unhandled rejection.
    // We wrap each node's connect() to safely catch open() errors.
    function patchNodeConnect(node) {
        const origConnect = node.connect.bind(node);
        node.connect = function(sessionId) {
            origConnect(sessionId);
            // After connect() creates the socket, replace the 'open' listener with a safe wrapper
            if (this.socket) {
                const listeners = this.socket.listeners('open');
                if (listeners.length > 0) {
                    const origOpenHandler = listeners[0];
                    this.socket.removeAllListeners('open');
                    this.socket.on('open', async () => {
                        // The library internally does: console.error(e, "ON-OPEN-FETCH") for fetchInfo failures.
                        // Intercept console.error during open() to suppress raw SyntaxError stack traces
                        // from proxy errors and log them cleanly instead.
                        const origConsoleError = console.error;
                        const nodeId = this.id || this.options?.host;
                        console.error = (...args) => {
                            const msg = args.map(a => String(a?.message || a || '')).join(' ');
                            if (msg.includes('ON-OPEN-FETCH') || msg.includes('is not valid JSON') || msg.includes('Proxy erro')) {
                                log.warning(`Lavalink node ${nodeId} failed to fetch /v4/info — will retry`);
                                return;
                            }
                            origConsoleError.apply(console, args);
                        };
                        try {
                            await origOpenHandler.call(this);
                        } catch (err) {
                            log.warning(`Lavalink node ${nodeId} connection error: ${(err.message || '').substring(0, 100)} — will retry`);
                            this.NodeManager.emit('error', this, err);
                            try { this.socket?.close(1000, 'Open-Failed'); } catch(e) {}
                        } finally {
                            console.error = origConsoleError;
                        }
                    });
                }
            }
        };
    }

    // Patch all nodes already created by the constructor
    for (const node of lavalinkManager.nodeManager.nodes.values()) {
        patchNodeConnect(node);
    }

    // Patch future nodes created via createNode
    const origCreateNode = lavalinkManager.nodeManager.createNode.bind(lavalinkManager.nodeManager);
    lavalinkManager.nodeManager.createNode = function(options) {
        const node = origCreateNode(options);
        patchNodeConnect(node);
        return node;
    };

    return lavalinkManager;
}

/**
 * Register all Lavalink event handlers.
 */
function setupLavalinkEvents(client, lavalinkManager) {
    // ── trackStart ──
    lavalinkManager.on('trackStart', async (player, track) => {
        if (!track.isSpeakCmd) {
            log.music(`Playing: ${track.info.title.substring(0, 40)}...`);
        }

        // Clear inactivity disconnect timer since music is playing again
        if (inactivityTimers.has(player.guildId)) {
            clearTimeout(inactivityTimers.get(player.guildId));
            inactivityTimers.delete(player.guildId);
        }

        await updateMusicPanel(client, player, autoplayStatus).catch(err => log.error(`Panel update: ${err.message}`, err));
        await updateVoiceChannelStatus(client, player, 'auto', track);

        if (track.isSpeakCmd) return;

        // Check if there's a music panel for this guild (use cache for performance)
        let hasMusicPanel = musicPanelCache.get(player.guildId);
        if (hasMusicPanel === undefined) {
            hasMusicPanel = false;
            if (jsonStore.has('musicpanel')) {
                try {
                    const panelConfig = jsonStore.read('musicpanel');
                    hasMusicPanel = !!(panelConfig[player.guildId]?.channelId && panelConfig[player.guildId]?.messageId);
                } catch (e) {}
            }
            musicPanelCache.set(player.guildId, hasMusicPanel);
        }

        // Only send separate "Now Playing" message if there's no music panel
        // AND the per-guild "announce" toggle from the dashboard is on.
        const announceEnabled = getMusicSettings(player.guildId).announce;
        if (!hasMusicPanel && announceEnabled) {
            const channel = client.channels.cache.get(player.textChannelId);
            if (channel) {
                const oldData = nowPlayingMessages.get(player.guildId);
                if (oldData) {
                    try {
                        const oldChannel = client.channels.cache.get(oldData.channelId);
                        if (oldChannel) {
                            const oldMessage = await oldChannel.messages.fetch(oldData.messageId).catch(() => null);
                            if (oldMessage && oldMessage.deletable) {
                                await oldMessage.delete().catch(() => {});
                            }
                        }
                    } catch (e) {}
                    nowPlayingMessages.delete(player.guildId);
                }

                const container = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder()
                            .setContent(`# <:Music:1473039311057190972> Now Playing\n\n**[${track.info.title}](${track.info.uri})**\n\n> <:User:1473038971398520977> **Requester:** <@${track.requester.id}>\n> <:Timer:1473039056710406204> **Duration:** ${formatTime(track.info.duration)}`)
                    );
                
                const sentMessage = await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
                if (sentMessage) {
                    nowPlayingMessages.set(player.guildId, { channelId: channel.id, messageId: sentMessage.id });
                }
            }
        }

        // Clear any existing interval for this guild
        if (panelUpdateIntervals.has(player.guildId)) {
            clearInterval(panelUpdateIntervals.get(player.guildId));
            panelUpdateIntervals.delete(player.guildId);
        }

        // Set up auto-update interval (every 5 seconds for panel progress bar)
        const updateInterval = setInterval(async () => {
            if (panelUpdateInProgress.get(player.guildId)) return;
            try {
                panelUpdateInProgress.set(player.guildId, true);
                await updateMusicPanel(client, player, autoplayStatus);
            } catch (err) {
                log.error(`Panel auto-update: ${err.message}`, err);
            } finally {
                panelUpdateInProgress.set(player.guildId, false);
            }
        }, 5000);

        panelUpdateIntervals.set(player.guildId, updateInterval);
    });

    // ── trackEnd ──
    lavalinkManager.on('trackEnd', async (player, track, payload) => {
        if (track) {
            lastPlayedTracks.set(player.guildId, track);

            if (!autoplayHistory.has(player.guildId)) {
                autoplayHistory.set(player.guildId, []);
            }
            const history = autoplayHistory.get(player.guildId);
            history.push({
                identifier: track.info.identifier,
                uri: track.info.uri,
                title: track.info.title,
                timestamp: Date.now()
            });
            if (history.length > 50) {
                history.shift();
            }
        }

        setTimeout(async () => {
            try {
                if (player && !player.destroyed) {
                    await updateMusicPanel(client, player, autoplayStatus);
                }
            } catch (err) {
                log.error(`Panel update in trackEnd: ${err.message}`, err);
            }
        }, 500);
    });

    // ── playerCreate ──
    lavalinkManager.on('playerCreate', (player) => {
        // Apply per-guild "Default Volume" from the dashboard music
        // module. Without this, every freshly-created player ignored
        // the saved volume and started at the lavalink-client default.
        try {
            const settings = getMusicSettings(player.guildId);
            if (typeof player.setVolume === 'function') {
                player.setVolume(settings.defaultVolume).catch(() => {});
            } else {
                player.volume = settings.defaultVolume;
            }
        } catch {}
    });

    // ── playerDestroy ──
    lavalinkManager.on('playerDestroy', async (player) => {
        const guildId = player.guildId;
        const voiceChannelId = player.voiceChannelId;
        
        if (inactivityTimers.has(guildId)) {
            clearTimeout(inactivityTimers.get(guildId));
            inactivityTimers.delete(guildId);
        }

        if (panelUpdateIntervals.has(guildId)) {
            clearInterval(panelUpdateIntervals.get(guildId));
            panelUpdateIntervals.delete(guildId);
            panelUpdateInProgress.delete(guildId);
        }

        await updateVoiceChannelStatus(client, { guildId, voiceChannelId }, 'clear');

        try {
            await updateMusicPanel(client, null, autoplayStatus, guildId);
        } catch (err) {
            log.error(`Panel update on playerDestroy: ${err.message}`, err);
        }

        previousVolume.delete(player.guildId);
        lastPlayedTracks.delete(player.guildId);
        autoplayHistory.delete(player.guildId);
        nowPlayingMessages.delete(player.guildId);
    });

    // ── trackError ──
    lavalinkManager.on('trackError', async (player, track, error) => {
        let errorMsg = 'Unknown error';
        if (error) {
            if (typeof error === 'string') errorMsg = error;
            else if (error.message) errorMsg = error.message;
            else if (error.reason) errorMsg = error.reason;
            else if (error.type) errorMsg = `${error.type}: ${error.message || 'Unknown'}`;
            else errorMsg = String(error);
        }
        log.error(`Track error: ${errorMsg}`);

        const channel = client.channels.cache.get(player.textChannelId);
        const trackTitle = track?.info?.title || 'Unknown Track';

        // Try SoundCloud fallback for YouTube failures (only once)
        if (track?.info?.title && !track.retried) {
            try {
                const scSearch = await player.search({ query: `scsearch:${track.info.title}` }, track.requester);
                if (scSearch.tracks?.length > 0) {
                    const newTrack = scSearch.tracks[0];
                    newTrack.retried = true;
                    newTrack.requester = track.requester;
                    await player.queue.add(newTrack, 0);
                    if (channel) channel.send(`<:Music:1473039311057190972> Retrying with alternative source...`).catch(() => {});
                    await player.skip().catch(() => {});
                    return;
                }
            } catch {}
        }

        // Skip to next track or stop
        try {
            if (player.queue?.tracks?.length > 0) {
                await player.skip().catch(() => player.stopPlaying().catch(() => {}));
                if (channel) channel.send(`<:Inforect:1473038624172937287> \`${trackTitle.slice(0, 40)}\` failed — skipping.`).catch(() => {});
            } else {
                await player.stopPlaying().catch(() => {});
                if (channel) channel.send(`<:Inforect:1473038624172937287> \`${trackTitle.slice(0, 40)}\` failed — no more tracks in queue.`).catch(() => {});
            }
        } catch (err) {
            log.error(`Track error handler failed: ${err.message}`);
            // Last resort — force destroy the player to prevent stuck state
            try { await player.destroy(); } catch {}
        }
    });

    // ── trackStuck ──
    //
    // We see this fire when the Lavalink node receives no audio
    // packets for `thresholdMs` ms.  Common causes:
    //   1. Source CDN throttling (YouTube's most-frequent failure mode)
    //   2. Voice WS hiccup that didn't propagate `playerSocketClosed`
    //   3. Track URL expired mid-playback (Spotify resolved -> YT)
    //
    // Recovery strategy (each step short-circuits on success):
    //   A. If we've consumed > 3 s of audio, seek back to position 0
    //      and wait — Lavalink usually recovers without skipping.
    //   B. Re-resolve the track from the current source so a stale
    //      streaming URL is replaced.  Try SoundCloud as a fallback
    //      for YouTube failures (most common in production).
    //   C. As a last resort, reconnect the voice socket and skip.
    //
    // We rate-limit the chat notification so the user isn't spammed
    // with "Track got stuck — skipping" on every poll cycle.
    const STUCK_NOTIFY_COOLDOWN = 30_000;
    const stuckNotifyAt = new Map(); // guildId → ms timestamp

    function notifyStuckOnce(channel, guildId, body) {
        if (!channel) return;
        const now = Date.now();
        const last = stuckNotifyAt.get(guildId) || 0;
        if (now - last < STUCK_NOTIFY_COOLDOWN) return;
        stuckNotifyAt.set(guildId, now);
        channel.send(body).catch(() => {});
    }

    lavalinkManager.on('trackStuck', async (player, track, thresholdMs) => {
        const title = (track?.info?.title || 'Unknown').substring(0, 35);
        log.warning(`Track stuck: "${title}" (threshold ${thresholdMs}ms)`);

        if (!player || player.destroyed) return;
        const channel = client.channels.cache.get(player.textChannelId);
        const guildId = player.guildId;

        // Step A: seek-restart. Only if we've actually played some audio.
        try {
            const pos = player.position || 0;
            if (pos > 3000 && !track?._stuckSeekAttempted) {
                if (track) track._stuckSeekAttempted = true;
                log.info(`trackStuck: seek-restart attempt for "${title}"`);
                await player.seek(0);
                // Lavalink takes a beat to resume; if still stuck the
                // event will fire again and we'll fall through.
                return;
            }
        } catch (seekErr) {
            log.warning(`trackStuck: seek-restart failed (${seekErr.message})`);
        }

        // Step B: try to re-resolve the same track from a fallback source.
        try {
            if (track?.info?.title && !track._stuckResolveAttempted) {
                track._stuckResolveAttempted = true;
                const sourceName = (track.info.sourceName || '').toLowerCase();
                // YouTube → SoundCloud is the most common rescue path.
                const fallbackPrefix = sourceName.includes('youtube') ? 'scsearch' : 'ytsearch';
                const query = `${fallbackPrefix}:${track.info.title}${track.info.author ? ' ' + track.info.author : ''}`;
                const result = await player.search({ query }, track.requester).catch(() => null);
                const replacement = result?.tracks?.[0];
                if (replacement) {
                    replacement._stuckResolveAttempted = true; // never re-attempt
                    replacement.requester = track.requester;
                    await player.queue.add(replacement, 0);
                    notifyStuckOnce(channel, guildId,
                        `<:Inforect:1473038624172937287> Stream stalled — retrying with an alternative source.`);
                    await player.skip().catch(() => {});
                    return;
                }
            }
        } catch (resolveErr) {
            log.warning(`trackStuck: re-resolve failed (${resolveErr.message})`);
        }

        // Step C: voice-socket nudge then skip.
        try {
            if (player.voiceChannelId) await player.connect().catch(() => {});
        } catch {}

        notifyStuckOnce(channel, guildId,
            `<:Inforect:1473038624172937287> Couldn't recover playback — skipping to the next track.`);

        try {
            if (player.queue?.tracks?.length > 0) {
                await player.skip();
            } else {
                await player.stopPlaying();
            }
        } catch (skipErr) {
            log.error(`trackStuck: skip failed (${skipErr.message}), forcing stop`);
            try { await player.stopPlaying(); } catch (_) {}
        }
    });

    // ── playerSocketClosed ──
    // Fired when the Lavalink ↔ Discord voice WebSocket drops mid-playback.
    // This is the most common cause of silent "stuck" audio that never triggers trackStuck.
    lavalinkManager.on('playerSocketClosed', async (player, payload) => {
        if (!player || player.destroyed) return;

        const code = payload?.code ?? '?';
        const reason = payload?.reason ?? 'unknown';
        log.warning(`Voice socket closed for guild ${player.guildId} — code ${code} (${reason})`);

        // Give Discord a moment to propagate the new voice state before reconnecting
        await new Promise(r => setTimeout(r, 1500));

        if (player.destroyed) return;

        try {
            if (player.voiceChannelId) {
                await player.connect();
                log.info(`Voice socket: reconnected in guild ${player.guildId}`);

                // If a track was playing, resume from current position
                if (player.queue?.current && !player.playing) {
                    const resumePos = Math.max(0, (player.position || 0) - 500);
                    await player.play({ position: resumePos, noReplace: false });
                    log.success(`Voice socket: resumed "${player.queue.current.info?.title?.substring(0, 30)}..."`);
                }
            }
        } catch (err) {
            log.error(`Voice socket reconnect failed (${player.guildId}): ${err.message}`);

            // Last resort: skip the problematic track
            try {
                const channel = client.channels.cache.get(player.textChannelId);
                if (channel) {
                    channel.send(`<:Inforect:1473038624172937287> Lost voice connection, skipping to next track...`).catch(() => {});
                }
                if (player.queue?.tracks?.length > 0) {
                    await player.skip().catch(() => {});
                } else {
                    await player.stopPlaying().catch(() => {});
                }
            } catch (_) {}
        }
    });

    // ── Client-side position watchdog ──
    // Catches the case where Lavalink believes it's still playing (so trackStuck never fires)
    // but the client-side position has completely frozen — e.g. after a silent node hiccup.
    const stuckWatchdog = new Map(); // guildId → { lastPos, lastPosTime, warnedAt }

    lavalinkManager.on('playerUpdate', (player, payload) => {
        if (!player || player.destroyed || !player.playing || player.paused) {
            stuckWatchdog.delete(player?.guildId);
            return;
        }

        const guildId = player.guildId;
        const now     = Date.now();
        const pos     = player.position || 0;
        const entry   = stuckWatchdog.get(guildId);

        if (!entry) {
            stuckWatchdog.set(guildId, { lastPos: pos, lastPosTime: now, warnedAt: 0 });
            return;
        }

        if (pos !== entry.lastPos) {
            // Position is advancing — healthy
            entry.lastPos     = pos;
            entry.lastPosTime = now;
            entry.warnedAt    = 0;
            return;
        }

        const frozenMs = now - entry.lastPosTime;

        // If frozen for >30 s and we haven't tried to recover in the last 60 s
        if (frozenMs > 30_000 && now - entry.warnedAt > 60_000) {
            entry.warnedAt = now;
            log.warning(`Watchdog: player frozen for ${Math.round(frozenMs/1000)}s in guild ${guildId} — attempting recovery`);

            // Async recovery (don't block the event)
            (async () => {
                if (player.destroyed) return;
                try {
                    // Attempt seek to current position to kick Lavalink back into action
                    await player.seek(Math.max(0, pos - 1000));
                    log.info(`Watchdog: seek recovery sent for guild ${guildId}`);
                } catch (seekErr) {
                    // Seek failed — try reconnecting the voice socket
                    try {
                        if (player.voiceChannelId) await player.connect();
                        if (!player.playing && player.queue?.current) {
                            await player.play({ position: Math.max(0, pos - 500), noReplace: false });
                        }
                        log.info(`Watchdog: reconnect recovery sent for guild ${guildId}`);
                    } catch (connErr) {
                        log.error(`Watchdog: recovery failed for guild ${guildId}: ${connErr.message}`);
                    }
                }
                // Reset timer so we don't spam recovery attempts
                const updated = stuckWatchdog.get(guildId);
                if (updated) { updated.lastPosTime = Date.now(); updated.lastPos = pos; }
            })();
        }
    });

    lavalinkManager.on('playerDestroy', async (player) => {
        stuckWatchdog.delete(player?.guildId);
    });

    // ── queueEnd ──
    lavalinkManager.on('queueEnd', async (player) => {
        log.info(`Queue ended in guild ${player.guildId}`);

        if (panelUpdateIntervals.has(player.guildId)) {
            clearInterval(panelUpdateIntervals.get(player.guildId));
            panelUpdateIntervals.delete(player.guildId);
            panelUpdateInProgress.delete(player.guildId);
        }

        let is247Enabled = false;
        if (jsonStore.has('musicpanel-247')) {
            try {
                const config247 = jsonStore.read('musicpanel-247');
                is247Enabled = config247[player.guildId]?.enabled || false;
            } catch (e) {
                log.error(`Error reading 24/7 config: ${e.message}`);
            }
        }

        const isAutoplayEnabled = autoplayStatus.get(player.guildId) || false;
        const lastTrack = lastPlayedTracks.get(player.guildId);

        if (isAutoplayEnabled && lastTrack) {
            try {
                log.info(`Autoplay (queueEnd): Searching for related songs to "${lastTrack.info.title}"`);

                const history = autoplayHistory.get(player.guildId) || [];
                const recentIdentifiers = new Set(history.map(h => h.identifier));
                const recentUris = new Set(history.map(h => h.uri).filter(Boolean));
                const recentTitleKeys = new Set(history.map(h => {
                    return (h.title || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/).slice(0, 4).join(' ');
                }).filter(k => k.length > 3));

                recentIdentifiers.add(lastTrack.info.identifier);
                if (lastTrack.info.uri) recentUris.add(lastTrack.info.uri);
                const lastTitleKey = (lastTrack.info.title || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/).slice(0, 4).join(' ');
                if (lastTitleKey.length > 3) recentTitleKeys.add(lastTitleKey);

                const cleanAuthor = (lastTrack.info.author || 'Unknown')
                    .replace(/VEVO$/i, '')
                    .replace(/ - Topic$/i, '')
                    .replace(/Official$/i, '')
                    .replace(/Music$/i, '')
                    .trim();
                
                const cleanTitle = (lastTrack.info.title || '')
                    .replace(/\(Official.*?\)/gi, '')
                    .replace(/\[Official.*?\]/gi, '')
                    .replace(/\(Lyrics.*?\)/gi, '')
                    .replace(/\[Lyrics.*?\]/gi, '')
                    .replace(/\(Audio.*?\)/gi, '')
                    .replace(/\(Music Video\)/gi, '')
                    .replace(/\[MV\]/gi, '')
                    .replace(/\|.*$/g, '')
                    .replace(/ft\..*$/gi, '')
                    .replace(/feat\..*$/gi, '')
                    .trim();
                
                const titleWords = cleanTitle.split(/\s+/).filter(w => w.length > 2);
                
                const searchStrategies = [
                    `${cleanAuthor} ${titleWords.slice(0, 2).join(' ')}`,
                    `${cleanAuthor} top songs`,
                    `${cleanAuthor} popular`,
                    `songs like ${titleWords.slice(0, 3).join(' ')}`,
                    `${titleWords.slice(0, 2).join(' ')} mix`,
                    `${cleanAuthor} best hits`,
                    `${cleanAuthor} ${titleWords[titleWords.length - 1] || ''} similar`,
                ];
                
                for (let i = searchStrategies.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [searchStrategies[i], searchStrategies[j]] = [searchStrategies[j], searchStrategies[i]];
                }

                let relatedTrack = null;

                for (const searchQuery of searchStrategies) {
                    if (relatedTrack) break;

                    try {
                        log.info(`Autoplay: Trying search "${searchQuery}"`);
                        
                        const result = await player.search(
                            { query: searchQuery },
                            lastTrack.requester
                        );

                        if (!result?.tracks || result.tracks.length === 0) {
                            log.info(`Autoplay: No results for "${searchQuery}"`);
                            continue;
                        }
                        
                        log.info(`Autoplay: Found ${result.tracks.length} tracks for "${searchQuery}"`);

                        const availableTracks = result.tracks.filter(t => {
                            if (t.info.identifier === lastTrack.info.identifier) return false;
                            if (recentIdentifiers.has(t.info.identifier)) return false;
                            if (t.info.uri && recentUris.has(t.info.uri)) return false;
                            const candidateTitleKey = (t.info.title || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/).slice(0, 4).join(' ');
                            if (candidateTitleKey.length > 3 && recentTitleKeys.has(candidateTitleKey)) return false;
                            if (t.info.duration > 0 && (t.info.duration < 30000 || t.info.duration > 900000)) return false;
                            return true;
                        });

                        if (availableTracks.length > 0) {
                            const selectionPool = availableTracks.slice(0, 15);
                            const randomIndex = Math.floor(Math.random() * selectionPool.length);
                            relatedTrack = selectionPool[randomIndex];
                            log.success(`Autoplay: Found track "${relatedTrack.info.title}" using strategy "${searchQuery}"`);
                            break;
                        } else {
                            log.info(`Autoplay: All ${result.tracks.length} tracks filtered out (already played)`);
                        }
                    } catch (searchError) {
                        log.error(`Autoplay search error: ${searchError.message}`);
                        continue;
                    }
                }

                if (relatedTrack) {
                    relatedTrack.requester = lastTrack.requester;

                    try {
                        await player.queue.add(relatedTrack);
                        log.info(`Autoplay: Added to queue, queue size: ${player.queue.tracks.length}`);
                        
                        if (!player.playing && !player.paused) {
                            await player.play();
                            log.success(`Autoplay: Now playing "${relatedTrack.info.title}"`);
                        } else {
                            log.info(`Autoplay: Track queued (player already active)`);
                        }
                    } catch (playError) {
                        log.error(`Autoplay play error: ${playError.message}`, playError);
                    }

                    return;
                } else {
                    log.info(`Autoplay: Could not find any new tracks after trying all strategies`);
                }
            } catch (error) {
                log.error(`Autoplay (queueEnd) error: ${error.message}`, error);
            }
        }

        try {
            await updateMusicPanel(client, player, autoplayStatus);
        } catch (err) {
            log.error(`Panel update failed in queueEnd: ${err.message}`, err);
        }

        await updateVoiceChannelStatus(client, player, is247Enabled ? 'waiting' : 'clear');

        if (!is247Enabled) {
            if (inactivityTimers.has(player.guildId)) {
                clearTimeout(inactivityTimers.get(player.guildId));
            }
            
            const guildIdForTimer = player.guildId;
            const disconnectTimer = setTimeout(async () => {
                inactivityTimers.delete(guildIdForTimer);
                try {
                    const currentPlayer = client.lavalinkManager?.getPlayer(guildIdForTimer);
                    if (currentPlayer && !currentPlayer.queue.current && !currentPlayer.playing) {
                        log.info(`Inactivity disconnect: Destroying player in guild ${guildIdForTimer} after 10 minutes of idle`);
                        await currentPlayer.destroy();
                    }
                } catch (err) {
                    log.error(`Inactivity disconnect error: ${err.message}`);
                }
            }, 10 * 60 * 1000);
            
            inactivityTimers.set(player.guildId, disconnectTimer);
            log.info(`Inactivity timer started for guild ${player.guildId} (10 minutes)`);
        }
    });

    // ── Node: disconnect (with failover) ──
    lavalinkManager.nodeManager.on('disconnect', async (node, reason) => {
        const now = Date.now();
        const lastLog = nodeDisconnectThrottle.get(node.id) || 0;
        const shouldLog = now - lastLog > 30000;

        if (shouldLog) {
            nodeDisconnectThrottle.set(node.id, now);
            log.warning(`Lavalink disconnected: ${node.id} — code ${reason?.code || 'unknown'}`);
        }

        const availableNodes = [...lavalinkManager.nodeManager.nodes.values()].filter(
            n => n.connected && n.id !== node.id
        );

        if (availableNodes.length === 0) {
            if (shouldLog) log.warning('No healthy Lavalink nodes available — waiting for reconnect...');
            return;
        }

        const fallbackNode = availableNodes[0];

        const playersToMigrate = [...lavalinkManager.players.values()].filter(
            p => p.node?.id === node.id
        );

        if (playersToMigrate.length === 0) return;

        if (shouldLog) log.info(`Failing over ${playersToMigrate.length} player(s) → ${fallbackNode.id}`);

        for (const player of playersToMigrate) {
            try {
                player.node = fallbackNode;
                if (player.voiceChannelId) {
                    await player.connect();
                    if (player.queue.current && !player.playing) {
                        await player.play({ noReplace: false });
                    }
                }
            } catch (err) {
                log.error(`Failed to migrate player ${player.guildId}: ${err.message}`);
            }
        }

        if (shouldLog) log.success(`Failover complete: ${playersToMigrate.length} player(s) moved to ${fallbackNode.id}`);
    });

    // ── Node: reconnecting ──
    lavalinkManager.nodeManager.on('reconnecting', (node) => {
        const now = Date.now();
        const lastLog = nodeDisconnectThrottle.get(`reconn_${node.id}`) || 0;
        if (now - lastLog > 30000) {
            nodeDisconnectThrottle.set(`reconn_${node.id}`, now);
            log.info(`Reconnecting to ${node.id}...`);
        }
    });

    // ── Node: connect ──
    lavalinkManager.nodeManager.on('connect', (node) => {
        nodeDisconnectThrottle.delete(node.id);
        nodeDisconnectThrottle.delete(`reconn_${node.id}`);
        nodeDisconnectThrottle.delete(`err_${node.id}`);

        const totalNodes = lavalinkManager.nodeManager.nodes.size;
        const connectedNodes = [...lavalinkManager.nodeManager.nodes.values()].filter(n => n.connected).length;
        log.success(`Lavalink: ${node.id} (${connectedNodes}/${totalNodes} nodes online)`);
    });

    // ── Node: error ──
    lavalinkManager.nodeManager.on('error', (node, error) => {
        const now = Date.now();
        const lastLog = nodeDisconnectThrottle.get(`err_${node.id}`) || 0;
        if (now - lastLog > 30000) {
            nodeDisconnectThrottle.set(`err_${node.id}`, now);
            const errMsg = error?.message || 'Connection failed';
            // Detect proxy/non-JSON response errors from fetchInfo
            if (errMsg.includes('does not provide any /v4/info') || errMsg.includes('is not valid JSON')) {
                log.warning(`Lavalink node ${node.id} unreachable (proxy/API error) — will retry automatically`);
            } else {
                log.error(`Lavalink node error (${node.id}): ${errMsg}`);
            }
        }

        const availableNodes = [...lavalinkManager.nodeManager.nodes.values()].filter(
            n => n.connected && n.id !== node.id
        );

        if (availableNodes.length > 0) {
            const affectedPlayers = [...lavalinkManager.players.values()].filter(
                p => p.node?.id === node.id
            );
            for (const player of affectedPlayers) {
                try { player.node = availableNodes[0]; } catch (e) {}
            }
        }
    });

    // ── Raw event forwarding ──
    client.on('raw', (d) => lavalinkManager.sendRawData(d));
}

/**
 * Initialize Lavalink (call in client ready event) and reconnect 24/7 channels.
 */
async function initLavalink(client, lavalinkManager) {
    try {
        await lavalinkManager.init({ id: client.user.id, username: client.user.username });
        
        // Wait for nodes to attempt connection, tolerating individual node failures
        await new Promise(resolve => setTimeout(resolve, 5000));
        const connectedNodes = [...lavalinkManager.nodeManager.nodes.values()].filter(n => n.connected);
        const totalNodes = lavalinkManager.nodeManager.nodes.size;
        
        if (connectedNodes.length > 0) {
            log.success(`Lavalink • ${connectedNodes.length}/${totalNodes} nodes online • YouTube, Spotify, SoundCloud`);
            if (connectedNodes.length < totalNodes) {
                const offlineNodes = [...lavalinkManager.nodeManager.nodes.values()]
                    .filter(n => !n.connected)
                    .map(n => n.id);
                log.warning(`Offline nodes (will auto-reconnect): ${offlineNodes.join(', ')}`);
            }
        } else {
            log.warning('Lavalink • No nodes connected yet — will retry automatically');
        }

        // Auto-reconnect to 24/7 voice channels (premium-only)
        if (jsonStore.has('musicpanel-247')) {
            let config247;
            try {
                config247 = jsonStore.read('musicpanel-247');
            } catch (error) {
                log.error(`24/7 config parse failed: ${error.message}`, error);
                config247 = {};
            }

            // Lazy-load to avoid a circular require with this util.
            const premiumManager = require('./premiumManager');

            let reconnected = 0;
            let configChanged = false;

            for (const [guildId, data] of Object.entries(config247)) {
                if (data.enabled && data.voiceChannelId) {
                    // 24/7 is premium-only — skip non-premium servers
                    // even if their saved config still says enabled.
                    if (!premiumManager.isServerPremium(guildId)) continue;
                    try {
                        const guild = client.guilds.cache.get(guildId);
                        if (!guild) {
                            delete config247[guildId];
                            configChanged = true;
                            continue;
                        }

                        const voiceChannel = guild.channels.cache.get(data.voiceChannelId);
                        if (!voiceChannel) {
                            delete config247[guildId];
                            configChanged = true;
                            continue;
                        }

                        let textChannelId = data.textChannelId;

                        if (!textChannelId) {
                            if (jsonStore.has('musicpanel')) {
                                const panelConfig = jsonStore.read('musicpanel');
                                textChannelId = panelConfig[guildId]?.channelId;
                            }
                        }

                        if (!textChannelId) {
                            const firstTextChannel = guild.channels.cache.find(ch => ch.type === 0);
                            textChannelId = firstTextChannel?.id;
                        }

                        if (!textChannelId) continue;

                        const availableNodes = lavalinkManager.nodeManager.leastUsedNodes();
                        if (!availableNodes || availableNodes.length === 0) continue;

                        const player = await lavalinkManager.createPlayer({
                            guildId: guildId,
                            voiceChannelId: data.voiceChannelId,
                            textChannelId: textChannelId,
                            selfDeaf: true,
                            selfMute: false,
                            volume: 100
                        });

                        await player.connect();
                        reconnected++;
                        log.debug(`24/7: ${guild.name}`);
                    } catch (error) {
                        log.error(`24/7 reconnect failed: ${guildId}`, error);
                    }
                }
            }

            if (configChanged) {
                jsonStore.write('musicpanel-247', config247);
            }

            if (reconnected > 0) {
                log.success(`${reconnected} 24/7 channels reconnected`);
            }
        }
    } catch (error) {
        const errMsg = error?.message || String(error);
        // Suppress noisy proxy/JSON parse errors from unhealthy nodes
        if (errMsg.includes('does not provide any /v4/info') || errMsg.includes('is not valid JSON') || errMsg.includes('Proxy erro')) {
            log.warning(`Lavalink init: some nodes unreachable (${errMsg.substring(0, 80)}) — retrying...`);
        } else {
            log.error(`Lavalink init failed: ${errMsg}`, error);
        }
        log.warning('Music limited - retrying...');

        setTimeout(async () => {
            try {
                await lavalinkManager.init({ id: client.user.id, username: client.user.username });
            } catch (retryError) {
                const retryMsg = retryError?.message || String(retryError);
                if (retryMsg.includes('does not provide any /v4/info') || retryMsg.includes('is not valid JSON')) {
                    log.warning(`Lavalink retry: nodes still unreachable — will keep retrying automatically`);
                } else {
                    log.error(`Retry failed: ${retryMsg}`, retryError);
                }
            }
        }, 5000);
    }
}

module.exports = {
    createLavalinkManager,
    setupLavalinkEvents,
    initLavalink,
    // Expose shared state so index.js and commands can still access them
    autoplayStatus,
    lastPlayedTracks,
    autoplayHistory,
    panelUpdateIntervals,
    panelUpdateInProgress,
    previousVolume,
    nowPlayingMessages,
    musicPanelCache,
    musicPanelChannelCache,
    inactivityTimers,
};
