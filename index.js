require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { Client, GatewayIntentBits, Partials, Collection, REST, Routes, ActivityType, PresenceUpdateStatus, ContainerBuilder, TextDisplayBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, SectionBuilder, ThumbnailBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SeparatorBuilder, SeparatorSpacingSize, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { formatTime, isOwner } = require('./utils/helpers');
const { createLavalinkManager, setupLavalinkEvents, initLavalink, autoplayStatus, lastPlayedTracks, autoplayHistory, panelUpdateIntervals, panelUpdateInProgress, previousVolume, nowPlayingMessages, musicPanelCache, musicPanelChannelCache, inactivityTimers } = require('./utils/lavalinkSetup');
const premiumManager = require('./utils/premiumManager');
const { handleWelcomerButtons, handleAutoresponderButtons, handleAutoreactButtons, handleAutomodButtons, handleAutomodSelectMenus, handleStickyButtons, handleVerificationButtons, handleAntiNukeButtons, handleProfileButtons, handleEmbedButtons, handleComponentsButtons, handleModalSubmit, replacePlaceholders } = require('./utils/interactionHandlers');
const { preloadGuildInvites, refreshGuildInvite, handleMemberJoin, handleMemberLeave, isTrackingEnabled } = require('./utils/inviteManager');
const { logMessageDelete, logMessageUpdate, logMessageBulkDelete, logMemberJoin, logMemberLeave, logMemberUpdate, logUserUpdate, logVoiceStateUpdate, logChannelCreate, logChannelDelete, logChannelUpdate, logGuildUpdate, logRoleCreate, logRoleDelete, logRoleUpdate, logBan, logUnban, logMemberKick, logTimeout, logEmojiCreate, logEmojiDelete, logEmojiUpdate, logStickerCreate, logStickerDelete, logThreadCreate, logThreadDelete, logInviteCreate, logInviteDelete, logWebhookUpdate } = require('./utils/logger');
const { handleVoiceStateUpdate: handleJoin2Create, handleJ2CButtons, handleJ2CModals } = require('./utils/join2createHandler');
const { updateMusicPanel, buildIdlePanel, buildVoiceStatus, buildWaitingStatus, updateVoiceChannelStatus, EMOJIS: MUSIC_EMOJIS } = require('./utils/musicPanel');
const log = require('./utils/logger-styled');
const { connectDatabase, models, getGuildConfig: getGuildConfigDb } = require('./utils/database');
const jsonStore = require('./utils/jsonStore');

// Safe tickets config reader — migrates legacy [] to {} automatically
function readTicketsConfig() {
    if (!jsonStore.has('tickets')) {
        jsonStore.write('tickets', {});
        return {};
    }
    const data = jsonStore.read('tickets');
    if (Array.isArray(data)) {
        jsonStore.write('tickets', {});
        return {};
    }
    return data;
}

const { logError } = require('./utils/errorLogger');
const { buildErrorReply, buildErrorContainer, buildBugReportModal, handleBugReportSubmit, sendErrorReply, buildErrorActionRow, generateErrorId } = require('./utils/errorResponse');
const { checkBotPermissions, notifyMissingPermissions, notifyMissingPermissionsSlash, isPermissionError, inferPermissionsFromCommand } = require('./utils/permissionHandler');
const badgeManager = require('./utils/badgeManager');
const { updateStatsChannels: updateServerStats } = require('./utils/serverStatsManager');
const botCustomize = require('./utils/botCustomize');
const { generateAIResponse, clearHistory } = require('./utils/aiChatManager');
const { trackCommand } = require('./commands/owner/command-stats');

log.installConsoleInterceptors();

const DEFAULT_PREFIX = process.env.PREFIX || '-';

// Per-guild prefix resolver — reads from PostgreSQL via jsonStore
function getGuildPrefix(guildId) {
    if (!guildId) return DEFAULT_PREFIX;
    try {
        const prefixes = jsonStore.read('prefixes');
        if (prefixes[guildId]) return prefixes[guildId];
    } catch (e) { }
    return DEFAULT_PREFIX;
}

const autoresponderCache = new Map();
const autoreactCache = new Map();
const automodCache = new Map();
const antinukeCache = new Map();
const antinukeTracker = new Map();
const antialtCache = new Map();
const antiraidCache = new Map();
const spamTracker = new Map();
const voiceJoinTimes = new Map(); // Track when users join voice channels

// Activity rotation system
let activityRotationInterval = null;
let activityRotationIndex = 0;
let customStatusRotationInterval = null;
let customStatusRotationIndex = 0;

function startActivityRotation(client) {
    stopActivityRotation();
    const { getActivities, resolveVariables } = require('./commands/owner/botpanel');
    const activityData = getActivities();

    if (!activityData.activities || activityData.activities.length === 0) return;

    const intervalMs = (activityData.rotateInterval || 30) * 1000;

    activityRotationInterval = setInterval(() => {
        const data = getActivities();
        if (!data.rotating || data.activities.length === 0) {
            stopActivityRotation();
            return;
        }

        activityRotationIndex = (activityRotationIndex + 1) % data.activities.length;
        const activity = data.activities[activityRotationIndex];
        const typeMap = { 'Playing': ActivityType.Playing, 'Watching': ActivityType.Watching, 'Listening': ActivityType.Listening, 'Competing': ActivityType.Competing, 'Streaming': ActivityType.Streaming };

        const resolvedText = resolveVariables(activity.text, client);
        const presenceOpts = {
            status: data.savedStatus || 'online',
            activities: [{ name: resolvedText, type: typeMap[activity.type] || ActivityType.Playing }]
        };
        if (activity.type === 'Streaming') presenceOpts.activities[0].url = 'https://www.twitch.tv/discord';
        client.user.setPresence(presenceOpts);
    }, intervalMs);

    log.info(`Activity rotation started (${activityData.activities.length} activities, ${activityData.rotateInterval || 30}s interval)`);
}

function stopActivityRotation() {
    if (activityRotationInterval) {
        clearInterval(activityRotationInterval);
        activityRotationInterval = null;
        log.info('Activity rotation stopped');
    }
}

function startCustomStatusRotation(client) {
    stopCustomStatusRotation();
    const { getActivities, resolveVariables } = require('./commands/owner/botpanel');
    const activityData = getActivities();

    const statuses = activityData.customStatuses || [];
    if (statuses.length === 0) return;

    const intervalMs = (activityData.customRotateInterval || 30) * 1000;

    customStatusRotationInterval = setInterval(() => {
        const data = getActivities();
        const sts = data.customStatuses || [];
        if (!data.customRotating || sts.length === 0) {
            stopCustomStatusRotation();
            return;
        }

        customStatusRotationIndex = (customStatusRotationIndex + 1) % sts.length;
        const status = sts[customStatusRotationIndex];
        const resolvedText = resolveVariables(status.text, client);

        client.user.setPresence({
            status: data.savedStatus || 'online',
            activities: [{ name: 'Custom Status', type: ActivityType.Custom, state: resolvedText }]
        });
    }, intervalMs);

    log.info(`Custom status rotation started (${statuses.length} statuses, ${activityData.customRotateInterval || 30}s interval)`);
}

function stopCustomStatusRotation() {
    if (customStatusRotationInterval) {
        clearInterval(customStatusRotationInterval);
        customStatusRotationInterval = null;
        log.info('Custom status rotation stopped');
    }
}

async function loadAutoresponderConfig() {
    try {
        const config = jsonStore.read('autoresponder');
        let count = 0;
        for (const [guildId, data] of Object.entries(config)) {
            if (data && data.enabled) {
                autoresponderCache.set(guildId, data);
                count++;
            }
        }
        if (count > 0) log.success(`AutoResponder: Loaded ${count} guild configurations`);
    } catch (error) {
        log.error('Error loading autoresponder config:', error);
    }
}

async function loadAutoreactConfig() {
    try {
        const config = jsonStore.read('autoreact');
        let count = 0;
        for (const [guildId, data] of Object.entries(config)) {
            if (data && data.enabled) {
                autoreactCache.set(guildId, data);
                count++;
            }
        }
        if (count > 0) log.success(`AutoReact: Loaded ${count} guild configurations`);
    } catch (error) {
        log.error('Error loading autoreact config:', error);
    }
}

async function loadAutomodConfig() {
    try {
        const config = jsonStore.read('automod');
        Object.entries(config).forEach(([guildId, data]) => {
            if (data && data.enabled) {
                automodCache.set(guildId, data);
            }
        });
        log.success(`AutoMod: Loaded ${automodCache.size} guild configurations`);
    } catch (error) {
        log.error('Error loading automod config:', error);
    }
}

function updateAutoresponderCache(guildId, data) {
    if (data && data.enabled) {
        autoresponderCache.set(guildId, data);
    } else {
        autoresponderCache.delete(guildId);
    }
}

function updateAutoreactCache(guildId, data) {
    if (data && data.enabled) {
        autoreactCache.set(guildId, data);
    } else {
        autoreactCache.delete(guildId);
    }
}

function updateAutomodCache(guildId, data) {
    // Merge with defaults to ensure all sub-module fields exist for sync
    const { getGuildConfig } = require('./utils/panels/automodPanel');
    const mergedData = getGuildConfig(guildId);

    if (mergedData && mergedData.enabled) {
        automodCache.set(guildId, mergedData);
    } else {
        automodCache.delete(guildId);
    }

    // Sync to Discord's native AutoMod rules in the background
    try {
        const guild = client.guilds?.cache?.get(guildId);
        if (guild) {
            const { syncToDiscord, removeAllBotRules } = require('./utils/automodSync');
            if (mergedData && mergedData.enabled) {
                syncToDiscord(guild, mergedData).catch(e => log.error('[AutoMod Sync] Background sync error: ' + e.message));
            } else {
                removeAllBotRules(guild).catch(e => log.error('[AutoMod Sync] Background cleanup error: ' + e.message));
            }
        }
    } catch (e) { }
}

async function loadAntinukeConfig() {
    try {
        const config = jsonStore.read('antinuke');
        for (const [guildId, data] of Object.entries(config)) {
            if (data) antinukeCache.set(guildId, data);
        }
        const activeCount = [...antinukeCache.values()].filter(d => d.enabled).length;
        log.success(`AntiNuke: Loaded ${antinukeCache.size} configs (${activeCount} active)`);
    } catch (error) {
        log.error('Error loading antinuke config:', error);
    }
}

function updateAntinukeCache(guildId, data) {
    if (data) {
        antinukeCache.set(guildId, data);
    } else {
        antinukeCache.delete(guildId);
    }
}

function reloadAntinukeCache(config) {
    antinukeCache.clear();
    for (const [guildId, data] of Object.entries(config)) {
        if (data) antinukeCache.set(guildId, data);
    }
}

async function loadAntialtConfig() {
    try {
        const config = jsonStore.read('antialt');
        Object.entries(config).forEach(([guildId, data]) => {
            if (data && data.enabled) {
                antialtCache.set(guildId, data);
            }
        });
        log.success(`AntiAlt: Loaded ${antialtCache.size} guild configurations`);
    } catch (error) {
        log.error('Error loading antialt config:', error);
    }
}

function updateAntialtCache(guildId, data) {
    if (data && data.enabled) {
        antialtCache.set(guildId, data);
    } else {
        antialtCache.delete(guildId);
    }
}

async function loadAntiraidConfig() {
    try {
        const config = jsonStore.read('antiraid');
        Object.entries(config).forEach(([guildId, data]) => {
            if (data && data.enabled) {
                antiraidCache.set(guildId, data);
            }
        });
        log.success(`AntiRaid: Loaded ${antiraidCache.size} guild configurations`);
    } catch (error) {
        log.error('Error loading antiraid config:', error);
    }
}

function updateAntiraidCache(guildId, data) {
    if (data && data.enabled) {
        antiraidCache.set(guildId, data);
    } else {
        antiraidCache.delete(guildId);
    }
}

global.updateAutoresponderCache = updateAutoresponderCache;
global.updateAutoreactCache = updateAutoreactCache;
global.updateAutomodCache = updateAutomodCache;
global.updateAntinukeCache = updateAntinukeCache;
global.reloadAntinukeCache = reloadAntinukeCache;
global.updateAntialtCache = updateAntialtCache;
global.updateAntiraidCache = updateAntiraidCache;

// Expose the per-module cache Maps so utils/storeSync.js can clear()
// them before re-populating from a fresh snapshot. Without this, a
// guild row removed from the store entirely would stay cached.
global.automodCache        = automodCache;
global.antinukeCache       = antinukeCache;
global.antialtCache        = antialtCache;
global.antiraidCache       = antiraidCache;
global.autoreactCache      = autoreactCache;
global.autoresponderCache  = autoresponderCache;

// Install the shared dashboard <-> bot cache sync listener.
// Any jsonStore.write/writeImmediate (from this process or via PG poll
// from another process) will fan out to the matching global.update*Cache
// invalidator declared above. The listener `.clear()`s each per-guild
// Map before iterating the snapshot so stale rows are evicted.
//
// Historical note: a pre-existing inline `jsonStore.on('update', …)`
// switch block lived here and did the same per-guild cache rebuild.
// It was removed once installStoreSync became the single source of
// truth — keeping both caused every write to rebuild each cache twice.
try {
    const { installStoreSync } = require('./utils/storeSync');
    installStoreSync(jsonStore);
} catch (e) {
    log.error('Failed to install storeSync listener:', e?.message || e);
}

async function handleBotPanelButton(interaction, client) {
    if (!isOwner(interaction.user.id)) {
        await interaction.reply({ content: '<:Cancel:1473037949187657818> Only the bot owner can use this panel!', flags: MessageFlags.Ephemeral });
        return true;
    }

    const customId = interaction.customId;
    const { buildBotPanel, buildActivityModal, buildImageModal, buildUsernameModal, buildNicknameModal } = require('./commands/owner/botpanel');

    // Status changes
    if (customId.startsWith('botpanel_status_')) {
        const status = customId.replace('botpanel_status_', '');
        const statusMap = { online: 'online', idle: 'idle', dnd: 'dnd', invisible: 'invisible' };

        if (statusMap[status]) {
            // Save status persistently
            const { getActivities, saveActivities } = require('./commands/owner/botpanel');
            const activityData = getActivities();
            activityData.savedStatus = statusMap[status];
            saveActivities(activityData);

            // Preserve current activity when changing status
            const currentActivities = client.user.presence?.activities || [];
            const presenceOpts = { status: statusMap[status] };
            if (currentActivities.length > 0) {
                presenceOpts.activities = currentActivities.map(a => ({
                    name: a.name, type: a.type, state: a.state, url: a.url
                }));
            }
            await client.user.setPresence(presenceOpts);
            const panel = buildBotPanel(client);
            await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        }
        return true;
    }

    // Activity Manager button
    if (customId === 'botpanel_activity_manager') {
        const { buildActivityManagerPanel } = require('./commands/owner/botpanel');
        const panel = buildActivityManagerPanel(client, 0);
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Rotation Settings button
    if (customId === 'botpanel_rotation_settings') {
        const { buildRotationSettingsPanel } = require('./commands/owner/botpanel');
        const panel = buildRotationSettingsPanel(client);
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Rotation Delay button
    if (customId === 'botpanel_rotation_delay') {
        const { getActivities, buildRotationDelayModal } = require('./commands/owner/botpanel');
        const data = getActivities();
        const modal = buildRotationDelayModal(data.rotateInterval || 30);
        await interaction.showModal(modal);
        return true;
    }

    // Rotation Toggle All
    if (customId === 'botpanel_rotation_toggle_all') {
        const { getActivities, saveActivities, buildRotationSettingsPanel } = require('./commands/owner/botpanel');
        const data = getActivities();
        if (!data.rotationSettings) data.rotationSettings = {};

        const allOn = data.activities.every((_, i) => data.rotationSettings[i] !== false);
        data.activities.forEach((_, i) => {
            data.rotationSettings[i] = !allOn;
        });

        saveActivities(data);
        const panel = buildRotationSettingsPanel(client);
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Activity Rotation toggle
    if (customId === 'botpanel_activity_rotate') {
        const { getActivities, saveActivities } = require('./commands/owner/botpanel');
        const activityData = getActivities();
        activityData.rotating = !activityData.rotating;
        saveActivities(activityData);

        if (activityData.rotating && activityData.activities.length > 0) {
            startActivityRotation(client);
        } else {
            stopActivityRotation();
        }

        const panel = buildBotPanel(client);
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Activity clear
    if (customId === 'botpanel_activity_clear') {
        await client.user.setPresence({ activities: [] });
        const panel = buildBotPanel(client);
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Activity select (from manager)
    if (customId.startsWith('activity_select_')) {
        const { getActivities, buildActivityManagerPanel, resolveVariables } = require('./commands/owner/botpanel');
        const idx = parseInt(customId.replace('activity_select_', ''));
        const activityData = getActivities();
        const activity = activityData.activities[idx];

        if (activity) {
            const typeMap = {
                'Playing': ActivityType.Playing,
                'Watching': ActivityType.Watching,
                'Listening': ActivityType.Listening,
                'Competing': ActivityType.Competing,
                'Streaming': ActivityType.Streaming
            };

            const resolvedText = resolveVariables(activity.text, client);
            const presenceOptions = {
                status: activityData.savedStatus || 'online',
                activities: [{
                    name: resolvedText,
                    type: typeMap[activity.type] || ActivityType.Playing
                }]
            };

            if (activity.type === 'Streaming') {
                presenceOptions.activities[0].url = 'https://www.twitch.tv/discord';
            }

            await client.user.setPresence(presenceOptions);
        }

        const panel = buildActivityManagerPanel(client, Math.floor(idx / 3));
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Activity remove
    if (customId.startsWith('activity_remove_')) {
        const { getActivities, saveActivities, buildActivityManagerPanel } = require('./commands/owner/botpanel');
        const idx = parseInt(customId.replace('activity_remove_', ''));
        const activityData = getActivities();

        if (activityData.activities[idx]) {
            activityData.activities.splice(idx, 1);
            saveActivities(activityData);
        }

        const panel = buildActivityManagerPanel(client, Math.floor(idx / 3));
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Activity add buttons
    if (customId.startsWith('activity_add_')) {
        const activityType = customId.replace('activity_add_', '');
        const { buildAddActivityModal } = require('./commands/owner/botpanel');
        const modal = buildAddActivityModal(activityType.charAt(0).toUpperCase() + activityType.slice(1));
        await interaction.showModal(modal);
        return true;
    }

    // Activity pagination
    if (customId.startsWith('activity_page_')) {
        const page = parseInt(customId.replace('activity_page_', ''));
        const { buildActivityManagerPanel } = require('./commands/owner/botpanel');
        const panel = buildActivityManagerPanel(client, page);
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Back to main panel
    if (customId === 'activity_back' || customId === 'custom_back') {
        const panel = buildBotPanel(client);
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Custom Status Manager button
    if (customId === 'botpanel_custom_manager') {
        const { buildCustomStatusManagerPanel } = require('./commands/owner/botpanel');
        const panel = buildCustomStatusManagerPanel(client, 0);
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Custom Status Rotation toggle
    if (customId === 'botpanel_custom_rotate') {
        const { getActivities, saveActivities } = require('./commands/owner/botpanel');
        const activityData = getActivities();
        activityData.customRotating = !activityData.customRotating;
        saveActivities(activityData);

        if (activityData.customRotating && (activityData.customStatuses || []).length > 0) {
            startCustomStatusRotation(client);
        } else {
            stopCustomStatusRotation();
        }

        const panel = buildBotPanel(client);
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Custom Status clear
    if (customId === 'botpanel_custom_clear') {
        const currentActivities = client.user.presence?.activities || [];
        if (currentActivities.length > 0 && currentActivities[0].type === 4) {
            await client.user.setPresence({ activities: [] });
        }
        const panel = buildBotPanel(client);
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Custom Status select
    if (customId.startsWith('custom_select_')) {
        const { getActivities, buildCustomStatusManagerPanel, resolveVariables } = require('./commands/owner/botpanel');
        const idx = parseInt(customId.replace('custom_select_', ''));
        const activityData = getActivities();
        const status = (activityData.customStatuses || [])[idx];

        if (status) {
            const resolvedText = resolveVariables(status.text, client);
            await client.user.setPresence({
                status: activityData.savedStatus || 'online',
                activities: [{ name: 'Custom Status', type: ActivityType.Custom, state: resolvedText }]
            });
        }

        const panel = buildCustomStatusManagerPanel(client, Math.floor(idx / 3));
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Custom Status remove
    if (customId.startsWith('custom_remove_')) {
        const { getActivities, saveActivities, buildCustomStatusManagerPanel } = require('./commands/owner/botpanel');
        const idx = parseInt(customId.replace('custom_remove_', ''));
        const activityData = getActivities();

        if ((activityData.customStatuses || [])[idx]) {
            activityData.customStatuses.splice(idx, 1);
            saveActivities(activityData);
        }

        const panel = buildCustomStatusManagerPanel(client, Math.floor(idx / 3));
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Custom Status add button
    if (customId === 'custom_add') {
        const { buildAddCustomModal } = require('./commands/owner/botpanel');
        const modal = buildAddCustomModal();
        await interaction.showModal(modal);
        return true;
    }

    // Custom Status pagination
    if (customId.startsWith('custom_page_')) {
        const page = parseInt(customId.replace('custom_page_', ''));
        const { buildCustomStatusManagerPanel } = require('./commands/owner/botpanel');
        const panel = buildCustomStatusManagerPanel(client, page);
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Legacy activity modals (keep for compatibility)
    if (customId.startsWith('botpanel_activity_')) {
        const activityType = customId.replace('botpanel_activity_', '');

        if (['playing', 'watching', 'listening', 'competing'].includes(activityType)) {
            const modal = buildActivityModal(activityType);
            await interaction.showModal(modal);
            return true;
        }
    }

    // Image modals (avatar/banner)
    if (customId === 'botpanel_avatar' || customId === 'botpanel_banner') {
        const type = customId.replace('botpanel_', '');
        const modal = buildImageModal(type);
        await interaction.showModal(modal);
        return true;
    }

    // Username modal
    if (customId === 'botpanel_username') {
        const modal = buildUsernameModal();
        await interaction.showModal(modal);
        return true;
    }

    // Nickname modal
    if (customId === 'botpanel_nickname') {
        const modal = buildNicknameModal();
        await interaction.showModal(modal);
        return true;
    }

    // Refresh panel
    if (customId === 'botpanel_refresh') {
        const panel = buildBotPanel(client);
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Variables panel
    if (customId === 'botpanel_variables') {
        const { buildVariablesPanel } = require('./commands/owner/botpanel');
        const panel = buildVariablesPanel(client);
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Stats
    if (customId === 'botpanel_stats') {
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const memUsage = process.memoryUsage();
        const memMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);

        const statsContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# <:Invoice:1473039492217835550> Bot Statistics\n\n**Uptime:** ${hours}h ${minutes}m\n**Memory:** ${memMB} MB\n**Servers:** ${client.guilds.cache.size}\n**Users:** ${client.users.cache.size}\n**Channels:** ${client.channels.cache.size}\n**Commands:** ${client.commands.size}\n\n**Ping:** ${client.ws.ping}ms`)
            );

        await interaction.reply({ components: [statsContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        return true;
    }

    // Reset bot
    if (customId === 'botpanel_reset') {
        try {
            await interaction.reply({ content: '<a:Load:1479681956273852607> Resetting bot configuration to default stage...', flags: MessageFlags.Ephemeral });

            // Reset Avatar and Banner
            await client.user.setAvatar(null).catch(() => { });
            await client.rest.patch(Routes.user(), { body: { banner: null } }).catch(() => { });

            // Reset Status and Activity
            await client.user.setPresence({ status: 'dnd', activities: [] });

            // Reset Username (Warning: limited by Discord rate limits)
            // await client.user.setUsername('DefaultName').catch(() => {}); 

            await interaction.followUp({ content: '<:Checkedbox:1473038547165384804> Bot has been reset to default stage!', flags: MessageFlags.Ephemeral });

            const panel = buildBotPanel(client);
            await interaction.message.edit({ components: [panel] });
        } catch (error) {
            await interaction.followUp({ content: `<:Cancel:1473037949187657818> Failed to reset bot: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
        return true;
    }

    // Close panel
    if (customId === 'botpanel_close') {
        await interaction.message.delete().catch(() => { });
        return true;
    }

    return false;
}

async function handleBotPanelModal(interaction, client) {
    if (!isOwner(interaction.user.id)) {
        await interaction.reply({ content: '<:Cancel:1473037949187657818> Only the bot owner can use this!', flags: MessageFlags.Ephemeral });
        return true;
    }

    const customId = interaction.customId;
    const { buildBotPanel, buildActivityManagerPanel, buildCustomStatusManagerPanel, getActivities, saveActivities } = require('./commands/owner/botpanel');

    // Add activity modal (saves to list)
    if (customId.startsWith('activity_add_modal_')) {
        const activityType = customId.replace('activity_add_modal_', '');
        const text = interaction.fields.getTextInputValue('activity_text');

        const activityData = getActivities();
        activityData.activities.push({ type: activityType, text: text });
        saveActivities(activityData);

        // Also set it as current activity
        const typeMap = {
            'Playing': ActivityType.Playing,
            'Watching': ActivityType.Watching,
            'Listening': ActivityType.Listening,
            'Competing': ActivityType.Competing,
            'Streaming': ActivityType.Streaming
        };

        const { resolveVariables } = require('./commands/owner/botpanel');
        const resolvedText = resolveVariables(text, client);
        const presenceOptions = {
            status: activityData.savedStatus || 'online',
            activities: [{
                name: resolvedText,
                type: typeMap[activityType] || ActivityType.Playing
            }]
        };

        if (activityType === 'Streaming') {
            presenceOptions.activities[0].url = 'https://www.twitch.tv/discord';
        }

        await client.user.setPresence(presenceOptions);

        const panel = buildActivityManagerPanel(client, Math.floor((activityData.activities.length - 1) / 3));
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Custom status add modal
    if (customId === 'custom_add_modal') {
        const text = interaction.fields.getTextInputValue('custom_text');

        const activityData = getActivities();
        if (!activityData.customStatuses) activityData.customStatuses = [];
        activityData.customStatuses.push({ text: text });
        saveActivities(activityData);

        // Set it as current custom status
        const { resolveVariables } = require('./commands/owner/botpanel');
        const resolvedText = resolveVariables(text, client);
        await client.user.setPresence({
            status: activityData.savedStatus || 'online',
            activities: [{ name: 'Custom Status', type: ActivityType.Custom, state: resolvedText }]
        });

        const panel = buildCustomStatusManagerPanel(client, Math.floor((activityData.customStatuses.length - 1) / 3));
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Activity modals (legacy)
    if (customId.startsWith('botpanel_activity_modal_')) {
        const activityType = customId.replace('botpanel_activity_modal_', '');
        const text = interaction.fields.getTextInputValue('activity_text');

        const typeMap = {
            'playing': ActivityType.Playing,
            'watching': ActivityType.Watching,
            'listening': ActivityType.Listening,
            'competing': ActivityType.Competing
        };

        await client.user.setPresence({
            activities: [{ name: text, type: typeMap[activityType] }]
        });

        const panel = buildBotPanel(client);
        await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        return true;
    }

    // Avatar modal
    if (customId === 'botpanel_avatar_modal') {
        const url = interaction.fields.getTextInputValue('image_url');
        try {
            await client.user.setAvatar(url);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '<:Checkedbox:1473038547165384804> Avatar updated successfully!', flags: MessageFlags.Ephemeral });
            }
        } catch (error) {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: `<:Cancel:1473037949187657818> Failed to update avatar: ${error.message}`, flags: MessageFlags.Ephemeral });
            }
        }
        return true;
    }

    // Banner modal
    if (customId === 'botpanel_banner_modal') {
        await interaction.reply({ content: '# <:Cancel:1473037949187657818> Platform Limitation\n\nDiscord **does not allow bots to change their banner** through the API.\n\n### How to change it manually:\n1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)\n2. Select your bot: **' + client.user.username + '**\n3. Go to **"Bot"** settings\n4. Scroll down to **"Bot Banner"** and upload your image there.\n\n*Note: This is a restriction set by Discord, not the bot.*', flags: MessageFlags.Ephemeral });
        return true;
    }

    // Username modal
    if (customId === 'botpanel_username_modal') {
        const username = interaction.fields.getTextInputValue('username_text');
        try {
            await client.user.setUsername(username);
            await interaction.reply({ content: `<:Checkedbox:1473038547165384804> Username changed to **${username}**!`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            await interaction.reply({ content: `<:Cancel:1473037949187657818> Failed to change username: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
        return true;
    }

    // Nickname modal
    if (customId === 'botpanel_nickname_modal') {
        const nickname = interaction.fields.getTextInputValue('nickname_text') || null;
        try {
            await interaction.guild.members.me.setNickname(nickname);
            await interaction.reply({ content: nickname ? `<:Checkedbox:1473038547165384804> Nickname changed to **${nickname}**!` : '<:Checkedbox:1473038547165384804> Nickname reset!', flags: MessageFlags.Ephemeral });
        } catch (error) {
            await interaction.reply({ content: `<:Cancel:1473037949187657818> Failed to change nickname: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
        return true;
    }

    return false;
}

// Intent configuration
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.AutoModerationConfiguration,
        GatewayIntentBits.AutoModerationExecution,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.User, Partials.Channel, Partials.Message, Partials.Reaction, Partials.GuildMember],
    allowedMentions: { parse: [], repliedUser: false }
});

client.on('error', error => log.error('Client error: ' + error.message));

client.commands = new Collection();
client.autoplayStatus = autoplayStatus;
client.systemLogs = log.store;

const commandFolders = ['music', 'voice', 'basic', 'fun', 'action', 'admin', 'automation', 'utility', 'owner', 'economy', 'leveling', 'image', 'social', 'backup', 'webhook', 'dm', 'stats'];
const commands = [];

const categoryCount = {};
let prefixOnlyCount = 0;

for (const folder of commandFolders) {
    const commandsPath = path.join(__dirname, 'commands', folder);
    if (!fs.existsSync(commandsPath)) continue;
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    if (!categoryCount[folder]) categoryCount[folder] = 0;

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        if (command.data && command.data !== null) {
            const commandName = command.data.name;

            if (client.commands.has(commandName)) {
                log.warning(`Duplicate command detected: "${commandName}" in ${folder}/${file} (already exists)`);
                continue;
            }

            command.category = command.category || folder;
            client.commands.set(commandName, command);
            categoryCount[folder]++;

            // Register aliases for prefix commands
            if (command.aliases && Array.isArray(command.aliases)) {
                for (const alias of command.aliases) {
                    if (!client.commands.has(alias)) {
                        client.commands.set(alias, command);
                    }
                }
            }

            // Only register slash commands if not marked as prefix-only
            if (!command.prefixOnly && 'execute' in command) {
                const commandData = command.data.toJSON();
                commandData.category = folder; // Attach category for prioritization
                commands.push(commandData);
            } else if (command.prefixOnly) {
                prefixOnlyCount++;
            }
        } else if ('executePrefix' in command) {
            // Prefix-only commands without slash command data
            const commandName = file.replace('.js', '');

            if (client.commands.has(commandName)) {
                log.warning(`Duplicate command detected: "${commandName}" in ${folder}/${file} (already exists)`);
                continue;
            }

            command.category = command.category || folder;
            client.commands.set(commandName, command);
            categoryCount[folder]++;

            // Register aliases for prefix commands
            if (command.aliases && Array.isArray(command.aliases)) {
                for (const alias of command.aliases) {
                    if (!client.commands.has(alias)) {
                        client.commands.set(alias, command);
                    }
                }
            }

            prefixOnlyCount++;
        }
    }
}

// Display command loading summary
let totalLoaded = 0;
const commandItems = Object.entries(categoryCount).map(([cat, count]) => {
    totalLoaded += count;
    return [cat, count];
});

log.section('Commands', true);
log.compact(commandItems);
log.info(`Total commands: ${totalLoaded}`);

// Lavalink — all setup consolidated in utils/lavalinkSetup.js
const lavalinkManager = createLavalinkManager(client);
setupLavalinkEvents(client, lavalinkManager);

// Add catch-all error handler to prevent crashes
process.on('unhandledRejection', (error) => {
    const errMsg = error?.message || String(error);
    // Gracefully handle Lavalink node connection failures (proxy errors, non-JSON responses)
    if (errMsg.includes('does not provide any /v4/info') || errMsg.includes('is not valid JSON') || errMsg.includes('Proxy erro')) {
        log.warning(`Lavalink node connection failed: ${errMsg.substring(0, 100)} — will retry automatically`);
        return;
    }
    log.critical(`Unhandled rejection: ${errMsg}`, error);
    if (client.systemLogs) client.systemLogs.push({ type: 'error', message: `Unhandled rejection: ${errMsg}`, timestamp: new Date().toISOString() });
});

process.on('uncaughtException', (error) => {
    log.critical(`Uncaught exception: ${error.message}`, error);
    if (client.systemLogs) client.systemLogs.push({ type: 'error', message: `Uncaught exception: ${error.message}`, timestamp: new Date().toISOString() });
});

// Graceful shutdown — flush all in-memory data to PostgreSQL before exiting
let isShuttingDown = false;
async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    log.warning(`Received ${signal}, flushing database before exit...`);
    try {
        await jsonStore.flush();
        log.success('Database flushed successfully');
    } catch (err) {
        log.error('Error flushing database on shutdown:', err);
    }
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

const { Events } = require('discord.js');
client.on(Events.ClientReady, async () => {
    log.startup();
    log.bot(`${client.user.username}`);

    const totalMembers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
    log.info(`${client.guilds.cache.size} servers • ${totalMembers.toLocaleString()} users`);

    try {
        await connectDatabase();
        await loadAutoresponderConfig();
        await loadAutoreactConfig();
        await loadAutomodConfig();
        await loadAntinukeConfig();
        await loadAntialtConfig();
        await loadAntiraidConfig();
        await badgeManager.initializeDefaultBadges();
        log.success('Database & configs loaded');
    } catch (error) {
        log.error('Database offline', error);
        log.warning('Continuing without database');
    }

    // ── Top.gg stats auto-poster ──
    // Pushes the live server count to top.gg every 30 minutes (and on
    // every guildCreate/guildDelete with a 5s debounce) so the bot's
    // listing always shows the correct number of servers. Silently
    // skips if TOPGG_TOKEN is not set in .env.
    try {
        const topggPoster = require('./utils/topggPoster');
        topggPoster.start(client);
        topggPoster.bindGuildEvents(client);
    } catch (e) {
        log.warning('[Top.gg] Failed to start stats poster: ' + (e?.message || e));
    }

    // ── Periodic database flush (safety net — every 5 minutes) ──
    setInterval(() => {
        jsonStore.flush().catch(err => log.error('Periodic flush failed:', err));
    }, 5 * 60 * 1000);

    // ── Premium system cleanup (runs once on startup, then every 30 minutes) ──
    premiumManager.runCleanup(badgeManager);
    setInterval(() => premiumManager.runCleanup(badgeManager), 30 * 60 * 1000);

    // ── Premium badge sync (ensure all active premium users have their badges) ──
    premiumManager.syncPremiumBadges(badgeManager).catch(() => { });

    // ── Periodic premium data refresh from database (every 10 minutes) ──
    setInterval(() => {
        premiumManager.reloadPremiumData().catch(err => log.error('Premium reload failed:', err));
    }, 10 * 60 * 1000);

    // ── Restore giveaway timers ──
    try {
        const { restoreGiveawayTimers } = require('./commands/automation/giveaway');
        restoreGiveawayTimers(client);
    } catch (e) { }

    // ── Start panel expiration cleanup ──
    try {
        const { startCleanup } = require('./utils/panelExpiration');
        startCleanup(client);
    } catch (e) { }

    // ── Restore poll timers ──
    try {
        const { recoverPollTimers } = require('./commands/automation/poll');
        recoverPollTimers(client);
    } catch (e) { }

    // ── Guild Tag streak rewards checker (runs every hour) ──
    try {
        const { processStreakRewards } = require('./commands/admin/guildtag');
        setInterval(() => {
            processStreakRewards(client).catch(() => { });
        }, 60 * 60 * 1000); // Every hour
    } catch (e) { }

    // Periodic cleanup of antinukeTracker and spamTracker to prevent memory leaks
    setInterval(() => {
        const now = Date.now();
        // Clean antinukeTracker — remove entries older than 2 minutes
        for (const [key, actions] of antinukeTracker.entries()) {
            const recent = actions.filter(time => now - time < 120000);
            if (recent.length === 0) {
                antinukeTracker.delete(key);
            } else {
                antinukeTracker.set(key, recent);
            }
        }
        // Clean spamTracker — remove entries older than 30 seconds
        for (const [key, timestamps] of spamTracker.entries()) {
            if (!Array.isArray(timestamps)) { spamTracker.delete(key); continue; }
            const recent = timestamps.filter(entry => {
                const t = typeof entry === 'object' && entry !== null ? entry.time : entry;
                return typeof t === 'number' && now - t < 30000;
            });
            if (recent.length === 0) {
                spamTracker.delete(key);
            } else {
                spamTracker.set(key, recent);
            }
        }
    }, 60000); // Run every 60 seconds

    // Check for custom activity rotation first
    try {
        const { getActivities } = require('./commands/owner/botpanel');
        const activityData = getActivities();
        const savedStatus = activityData.savedStatus || 'online';

        if (activityData.rotating && activityData.activities && activityData.activities.length > 0) {
            startActivityRotation(client);
            log.info('Activity rotation enabled');
        } else if (activityData.activities && activityData.activities.length > 0) {
            const activity = activityData.activities[0];
            const typeMap = { 'Playing': ActivityType.Playing, 'Watching': ActivityType.Watching, 'Listening': ActivityType.Listening, 'Competing': ActivityType.Competing };
            client.user.setPresence({
                activities: [{ name: activity.text, type: typeMap[activity.type] || ActivityType.Playing }],
                status: savedStatus
            });
        } else {
            client.user.setPresence({
                activities: [{ name: '-help', type: ActivityType.Listening }],
                status: savedStatus
            });
        }

        if (activityData.customRotating && activityData.customStatuses && activityData.customStatuses.length > 0) {
            startCustomStatusRotation(client);
            log.info('Custom status rotation enabled');
        }
    } catch (e) {
        client.user.setPresence({
            activities: [{ name: '-help', type: ActivityType.Listening }],
            status: 'online'
        });
    }

    // ── Persistent Vote Reminder Scheduler ──────────────────────────────────
    // Runs every 5 minutes. Sends a DM to users who opted in and can vote again.
    const { SeparatorBuilder: _SepB, SeparatorSpacingSize: _SepSS } = require('discord.js');
    setInterval(async () => {
        try {
            const uv = jsonStore.has('user-votes') ? jsonStore.read('user-votes') : {};
            const nowTs = Date.now();
            let changed = false;
            for (const [uid, udata] of Object.entries(uv)) {
                if (!udata.remindersEnabled) continue;
                if (udata.reminderSent) continue;
                if (!udata.nextVoteAvailable || nowTs < udata.nextVoteAvailable) continue;
                try {
                    const ru = await client.users.fetch(uid).catch(() => null);
                    if (!ru) continue;
                    const streak = udata.streak || 0;
                    const clientId = process.env.CLIENT_ID || client.user.id;
                    let rc = `# <:Fire:1473038604812161218> Time to Vote Again!\n\n`;
                    rc += `Hey **${ru.globalName || ru.username}**, you can now vote for **${client.user.username}**!\n\n`;
                    if (streak >= 3) {
                        rc += `### <:Fire:1473038604812161218> Keep Your Streak Alive!\n`;
                        rc += `You're on a **${streak}-vote streak** — don't let it reset!\n\n`;
                    }
                    rc += `### 🎁 Rewards\n`;
                    rc += `• Voter badge on your profile\n`;
                    rc += `• Build your voting streak\n`;
                    rc += `• Help **xNico** grow and reach more servers\n\n`;
                    rc += `-# Use \`/myvotes\` to manage your reminder settings.`;
                    const remContainer = new ContainerBuilder()
                        .setAccentColor(0xCAD7E6)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(rc))
                        .addSeparatorComponents(new _SepB().setSpacing(_SepSS.Small).setDivider(true))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));
                    const remBtn = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setLabel('Vote on Top.gg')
                            .setURL(`https://top.gg/bot/${clientId}/vote`)
                            .setStyle(ButtonStyle.Link)
                            .setEmoji('<:topgg:1473546762248523839>'),
                        new ButtonBuilder()
                            .setLabel('Vote on DBL')
                            .setURL('https://discordbotlist.com/bots/xnico')
                            .setStyle(ButtonStyle.Link)
                            .setEmoji('<:Cursor:1473038064564834544>')
                    );
                    await ru.send({ components: [remContainer, remBtn], flags: MessageFlags.IsComponentsV2 });
                    udata.reminderSent = true;
                    changed = true;
                    log.debug(`[VoteReminder] Sent to ${ru.username}`);
                } catch {
                    // DMs closed or other error — mark sent to prevent loop
                    udata.reminderSent = true;
                    changed = true;
                }
            }
            if (changed) jsonStore.write('user-votes', uv);
        } catch (err) {
            log.error(`[VoteReminder] Scheduler error: ${err.message}`);
        }
    }, 5 * 60 * 1000);
    log.info('Vote reminder scheduler started (5-min interval)');
    // ─────────────────────────────────────────────────────────────────────────

    await initLavalink(client, lavalinkManager);

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    const applicationId = client.application?.id || process.env.CLIENT_ID;

    if (!applicationId) {
        log.error('No application ID available — cannot register slash commands');
    }

    try {
        // ── Step 1: Deduplicate commands array by name ──
        const seenNames = new Set();
        const uniqueCommands = [];
        for (const cmd of commands) {
            if (!seenNames.has(cmd.name)) {
                seenNames.add(cmd.name);
                uniqueCommands.push(cmd);
            } else {
                log.warning(`Duplicate slash command skipped: "${cmd.name}"`);
            }
        }

        const DISCORD_GLOBAL_LIMIT = 100;
        const DISCORD_GUILD_LIMIT = 100;

        // Priority list — always registered globally first
        const prioritySet = new Set([
            // Core
            'help', 'botinfo', 'ping', 'userinfo', 'avatar', 'serverinfo',
            // Moderation
            'ban', 'kick', 'mute', 'unmute', 'timeout', 'untimeout', 'warn', 'clear', 'unban',
            // Admin / security
            'antispam', 'antinuke', 'antiraid', 'antialt', 'config', 'logging', 'setprefix',
            'lock', 'unlock', 'hide', 'unhide', 'addrole', 'removerole', 'slowmode',
            // Music
            'play', 'pause', 'resume', 'stop', 'skip', 'queue', 'nowplaying', 'volume',
            'seek', 'loop', 'shuffle', 'autoplay', 'filters', 'lyrics', 'musicpanel',
            // Automation
            'welcomer', 'autorole', 'ticket-setup', 'giveaway', 'reactionroles', 'autoresponder',
            'autoreact', 'starboard-setup', 'poll', 'sticky-message',
            // Utility
            'snipe', 'editsnipe', 'afk', 'reminder', 'announce', 'automod', 'invite-setup',
            'button-maker', 'select-menu-maker', 'embed-quick', 'translate', 'calculate',
            'premium', 'customcmd', 'github',
            // Economy
            'balance', 'daily', 'weekly', 'shop', 'profile', 'pay', 'deposit', 'withdraw',
            'slots', 'betflip', 'gamble', 'rob', 'lottery', 'highlow', 'scratch', 'dice',
            'work', 'beg', 'crime', 'fish', 'hunt', 'adventure', 'mine', 'farm', 'heist',
            'buy', 'sell', 'inventory', 'trade', 'craft', 'gift', 'loan', 'economy-leaderboard',
            'battle', 'pets',
            // Leveling
            'rank', 'levels', 'leveling-setup', 'levelroles',
            // Social
            'socialprofile', 'badges',
            // Games
            'trivia', 'wordle', 'hangman', 'blackjack', 'connect4', 'tictactoe',
            'rps', 'akinator', 'coinflip', 'scramble', 'mathgame', 'fasttype',
            // Fun
            'meme', 'joke', 'gif', 'fact', 'riddle', 'ship', 'rate', '8ball',
            // Backup
            'backup-create', 'backup-load', 'backup-list', 'server-backup-create',
            // Owner
            'botpanel', 'eval', 'shutdown',
        ]);

        // Split into priority (global) and overflow (guild-specific)
        const priorityCmds = [];
        const overflowCmds = [];
        for (const cmd of uniqueCommands) {
            if (prioritySet.has(cmd.name)) priorityCmds.push(cmd);
            else overflowCmds.push(cmd);
        }

        // Trim to Discord's global limit
        const commandsToRegister = priorityCmds.slice(0, DISCORD_GLOBAL_LIMIT);

        // If priority list is under the global limit, fill from overflow
        if (commandsToRegister.length < DISCORD_GLOBAL_LIMIT) {
            const fill = overflowCmds.splice(0, DISCORD_GLOBAL_LIMIT - commandsToRegister.length);
            commandsToRegister.push(...fill);
        }

        // ── Step 2: Register global commands ──
        // ── Step 3: Fetch existing commands and preserve Entry Point commands ──
        let existingCommands = [];
        try {
            existingCommands = await rest.get(Routes.applicationCommands(applicationId));
        } catch { }
        const entryPointCommands = existingCommands.filter(cmd => cmd.type === 4);
        const finalCommands = [...commandsToRegister, ...entryPointCommands];

        const regStart = Date.now();
        await rest.put(
            Routes.applicationCommands(applicationId),
            { body: finalCommands }
        );

        // ── Step 4: Register remaining commands as guild-specific for extra coverage ──
        // Discord allows 100 global + 100 guild-specific per guild, giving 200 slash per guild max.
        const globalNames = new Set(commandsToRegister.map(c => c.name));
        const guildOnlyCommands = uniqueCommands.filter(c => !globalNames.has(c.name));
        const guildCmdsToRegister = guildOnlyCommands.slice(0, DISCORD_GUILD_LIMIT);

        let guildRegCount = 0;
        for (const guild of client.guilds.cache.values()) {
            try {
                await rest.put(
                    Routes.applicationGuildCommands(applicationId, guild.id),
                    { body: guildCmdsToRegister }
                );
                guildRegCount++;
            } catch (e) {
                // Permission denied or guild unavailable — skip
            }
        }

        // Save hash for reference
        const crypto = require('crypto');
        const commandHash = crypto.createHash('md5')
            .update(JSON.stringify(commandsToRegister.map(c => ({ name: c.name, options: c.options }))))
            .digest('hex');
        const hashFile = path.join(__dirname, 'datas', 'command-hash.txt');
        fs.writeFileSync(hashFile, commandHash);

        const regTime = ((Date.now() - regStart) / 1000).toFixed(1);
        const totalSlash = commandsToRegister.length + guildCmdsToRegister.length;
        log.success(`${commandsToRegister.length} global + ${guildCmdsToRegister.length} guild-specific = ${totalSlash} slash commands registered • ${prefixOnlyCount} prefix-only (${regTime}s)`);
    } catch (error) {
        log.error(`Slash command registration failed: ${error.message}`);
        if (error.code) log.error(`Discord API error code: ${error.code}`);
        if (error.status) log.error(`HTTP status: ${error.status}`);
        if (error.rawError) log.error(`Raw error: ${JSON.stringify(error.rawError).substring(0, 500)}`);
    }

    const guilds = Array.from(client.guilds.cache.values());
    const totalGuilds = guilds.length;
    let loadedCount = 0;

    for (const guild of guilds) {
        await preloadGuildInvites(guild);
        loadedCount++;
    }
    log.success(`Invite tracking ready (${loadedCount}/${totalGuilds} guilds)`);

    // Refresh all music panels to idle state on startup and preload cache
    try {
        if (jsonStore.has('musicpanel')) {
            const panelConfig = jsonStore.read('musicpanel');
            let refreshed = 0;
            let cleaned = 0;

            for (const guildId of Object.keys(panelConfig)) {
                const hasValidPanel = !!(panelConfig[guildId]?.channelId && panelConfig[guildId]?.messageId);
                musicPanelCache.set(guildId, hasValidPanel);

                if (hasValidPanel) {
                    const { channelId, messageId } = panelConfig[guildId];
                    musicPanelChannelCache.set(guildId, channelId);

                    try {
                        const guild = client.guilds.cache.get(guildId);
                        if (!guild) continue;

                        const channel = guild.channels.cache.get(channelId);
                        if (!channel || !channel.isTextBased()) continue;

                        // Clean up messages sent while bot was offline (keep only panel message)
                        try {
                            const messages = await channel.messages.fetch({ limit: 100 });
                            const messagesToDelete = messages.filter(msg =>
                                msg.id !== messageId &&
                                !msg.pinned &&
                                Date.now() - msg.createdTimestamp < 14 * 24 * 60 * 60 * 1000 // < 14 days old
                            );

                            if (messagesToDelete.size > 0) {
                                if (messagesToDelete.size === 1) {
                                    await messagesToDelete.first().delete().catch(() => { });
                                } else {
                                    await channel.bulkDelete(messagesToDelete, true).catch(() => { });
                                }
                                cleaned += messagesToDelete.size;
                            }
                        } catch (e) { }

                        await updateMusicPanel(client, null, autoplayStatus, guildId);
                        refreshed++;
                    } catch (e) { }
                }
            }

            if (cleaned > 0) {
                log.success(`${cleaned} old message(s) cleaned from music panel channels`);
            }
            if (refreshed > 0) {
                log.success(`${refreshed} music panel(s) refreshed`);
            }
        }
    } catch (e) {
        log.error(`Music panel refresh failed: ${e.message}`);
    }

    // Auto-reconnect to voice channels with 24/7 mode enabled
    if (jsonStore.has('musicpanel-247')) {
        try {
            const config247 = jsonStore.read('musicpanel-247');
            let reconnected = 0;

            for (const [guildId, config] of Object.entries(config247)) {
                if (!config.enabled) continue;

                try {
                    const guild = client.guilds.cache.get(guildId);
                    if (!guild) {
                        continue;
                    }

                    const voiceChannel = guild.channels.cache.get(config.voiceChannelId);
                    if (!voiceChannel) {
                        continue;
                    }

                    // Check if bot is already in this voice channel
                    const existingPlayer = lavalinkManager.getPlayer(guildId);
                    if (existingPlayer && existingPlayer.voiceChannelId === config.voiceChannelId) {
                        continue;
                    }

                    // Create or get player and join voice channel
                    const player = lavalinkManager.createPlayer({
                        guildId: guildId,
                        voiceChannelId: config.voiceChannelId,
                        textChannelId: config.textChannelId,
                        selfDeaf: true,
                        selfMute: false,
                        volume: 100
                    });

                    await player.connect();

                    // Set waiting status on 24/7 reconnect
                    await updateVoiceChannelStatus(client, { guildId, voiceChannelId: config.voiceChannelId }, 'waiting');

                    reconnected++;
                    log.debug(`24/7: Reconnected to ${guild.name} (${voiceChannel.name})`);
                } catch (error) {
                    log.error(`24/7 reconnect failed for ${guildId}:`, error.message);
                }
            }

            if (reconnected > 0) {
                log.success(`24/7 auto-reconnect: ${reconnected} server(s)`);
            }
        } catch (error) {
            log.error('24/7 auto-reconnect failed:', error);
        }
    }

    // Refresh music panels on startup using unified buildIdlePanel
    if (jsonStore.has('musicpanel')) {
        const panelConfig = jsonStore.read('musicpanel');
        let panelsRefreshed = 0;
        let configChanged = false;

        for (const [guildId, panelData] of Object.entries(panelConfig)) {
            try {
                const guild = client.guilds.cache.get(guildId);
                if (!guild) continue;

                const channel = guild.channels.cache.get(panelData.channelId);
                if (!channel) {
                    delete panelConfig[guildId];
                    configChanged = true;
                    continue;
                }

                // Try to edit the existing panel message instead of deleting it
                const idlePanel = buildIdlePanel(guildId);

                try {
                    const existingMessage = await channel.messages.fetch(panelData.messageId).catch(() => null);
                    if (existingMessage) {
                        // Edit in place - don't delete!
                        await existingMessage.edit({
                            components: [idlePanel],
                            flags: MessageFlags.IsComponentsV2
                        });
                        panelsRefreshed++;
                    } else {
                        // Only create new message if old one is missing
                        const newPanelMessage = await channel.send({
                            components: [idlePanel],
                            flags: MessageFlags.IsComponentsV2
                        });
                        panelConfig[guildId].messageId = newPanelMessage.id;
                        configChanged = true;
                        panelsRefreshed++;
                    }
                } catch (err) {
                    // If edit fails, create new message
                    const newPanelMessage = await channel.send({
                        components: [idlePanel],
                        flags: MessageFlags.IsComponentsV2
                    });
                    panelConfig[guildId].messageId = newPanelMessage.id;
                    configChanged = true;
                    panelsRefreshed++;
                }

            } catch (error) {
                log.error(`Panel refresh failed: ${guildId}`, error);
            }
        }

        if (configChanged) {
            jsonStore.write('musicpanel', panelConfig);
        }
        if (panelsRefreshed > 0) {
            log.success(`${panelsRefreshed} music panel(s) refreshed`);
        }
    }

    // ── Social Media Notification Polling (YouTube) ──
    try {
        const socialPoller = require('./utils/socialNotifyPoller');
        socialPoller.startPolling(client, log);
    } catch (e) {
        log.error(`Social notify poller failed to start: ${e.message}`);
    }
});

// Auto-nickname system
client.on('guildMemberAdd', async (member) => {
    // NOTE: Welcomer is handled in the main guildMemberAdd handler below (with anti-nuke, anti-raid, autorole, etc.)
    // Do NOT add welcomer logic here — it would cause duplicate welcome messages.

    // Auto-nickname feature
    try {
        if (jsonStore.has('autonick')) {
            const config = jsonStore.read('autonick');
            const guildConfig = config[member.guild.id];

            if (guildConfig && guildConfig.enabled && guildConfig.format) {
                const nickname = guildConfig.format.replace(/{user}/g, member.user.username);

                if (nickname && member.manageable) {
                    await member.setNickname(nickname, 'Auto-nickname system');
                }
            }
        }
    } catch (error) {
        log.error('AutoNick error', error);
    }

    // DM on Join feature from bot customization
    try {
        const guildCfg = botCustomize.getConfig(member.guild.id);
        if (guildCfg.dmOnJoin && guildCfg.dmMessage) {
            const dmContent = guildCfg.dmMessage
                .replace(/{user}/g, member.user.username)
                .replace(/{server}/g, member.guild.name)
                .replace(/{memberCount}/g, member.guild.memberCount.toString());
            await member.send(dmContent).catch(() => { });
        }
    } catch (error) {
        log.error('DM on Join error', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    // ═══════ Bot Ignore Module (Dashboard Integration) ═══════
    if (interaction.guild) {
        try {
            const biCfg = jsonStore.has('botignore-config') ? jsonStore.read('botignore-config')[interaction.guild.id] : null;
            if (biCfg && biCfg.enabled && !biCfg.ignorePrefix) {
                const isCh = (biCfg.ignoredChannels || []).includes(interaction.channelId);
                const isUser = (biCfg.ignoredUsers || []).includes(interaction.user.id);
                const isRole = interaction.member && (biCfg.ignoredRoles || []).some(r => interaction.member.roles.cache.has(r));
                
                // Allow admins/owner to bypass
                const isBypassed = interaction.member?.permissions.has(PermissionFlagsBits.Administrator) || interaction.user.id === process.env.OWNER_ID;
                
                if ((isCh || isUser || isRole) && !isBypassed) {
                    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: "❌ The bot is configured to ignore you or this channel.", flags: MessageFlags.Ephemeral }).catch(()=> { });
                    }
                    return; 
                }
            }
        } catch (e) {}
    }

    // Handle autocomplete interactions FIRST. They are not chat-input,
    // not buttons, and not modals; without this branch they fall into
    // the `!isChatInputCommand()` block, walk through every button
    // route (no customId match), and Discord shows the user the default
    // 3-second-deadline error. Several long-standing commands rely on
    // this path: badge-edit / badge-give / badge-remove (added in this
    // task) plus older autocomplete users in commands/utility/,
    // commands/backup/, and commands/music/.
    if (interaction.isAutocomplete()) {
        const cmd = client.commands.get(interaction.commandName);
        if (cmd && typeof cmd.autocomplete === 'function') {
            try {
                await cmd.autocomplete(interaction);
            } catch (e) {
                log.error('autocomplete error: ' + (e?.message || e));
            }
        }
        return;
    }

    // Handle modal submissions
    if (interaction.isModalSubmit()) {
        const customId = interaction.customId;

        // ── Bug Report modal handler ──
        if (customId.startsWith('bug_report_modal')) {
            try {
                await handleBugReportSubmit(interaction, client);
            } catch (error) {
                log.error('Bug report modal error:', error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '<:Cancel:1473037949187657818> Failed to process the bug report.', flags: MessageFlags.Ephemeral }).catch(() => { });
                }
            }
            return;
        }

        if (customId.startsWith('rrsetup_modal_')) {
            const rrCmd = client.commands.get('reactionroles');
            if (rrCmd && rrCmd.handleSetupModal) {
                try {
                    await rrCmd.handleSetupModal(interaction);
                } catch (error) {
                    log.error(`RR Setup Modal: ${error.message}`, error);
                }
            }
            return;
        }

        if (customId === 'botpanel_rotation_delay_modal') {
            const delayText = interaction.fields.getTextInputValue('delay_text');
            const delay = parseInt(delayText);

            if (isNaN(delay) || delay < 10) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> Invalid delay! Must be at least 10 seconds.', flags: MessageFlags.Ephemeral });
                return;
            }

            const { getActivities, saveActivities, buildRotationSettingsPanel } = require('./commands/owner/botpanel');
            const data = getActivities();
            data.rotateInterval = delay;
            saveActivities(data);

            if (data.rotating) {
                startActivityRotation(client);
            }

            const panel = buildRotationSettingsPanel(client);
            await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
            return;
        }

        const antinukeCmd = client.commands.get('antinuke');
        if (antinukeCmd && antinukeCmd.handleModal && interaction.customId.startsWith('antinuke_modal_')) {
            try {
                await antinukeCmd.handleModal(interaction);
            } catch (error) {
                log.error(`Anti-Nuke Modal: ${error.message}`, error);
            }
            return;
        }

        if (interaction.customId.startsWith('app_modal_')) {
            const appCmd = client.commands.get('application');
            if (appCmd && appCmd.handleModalSubmit) {
                try {
                    await appCmd.handleModalSubmit(interaction);
                } catch (error) {
                    log.error(`Application Modal: ${error.message}`, error);
                }
            }
            return;
        }

        // Handle quicksetup log channel modal
        if (interaction.customId.startsWith('quicksetup_modal_')) {
            const quicksetupCmd = client.commands.get('quicksetup');
            if (quicksetupCmd && quicksetupCmd.handleInteraction) {
                try {
                    const handled = await quicksetupCmd.handleInteraction(interaction);
                    if (handled) return;
                } catch (error) {
                    log.error(`Quick Setup Modal: ${error.message}`, error);
                }
            }
            return;
        }

        // Handle AI Chat modals
        if (interaction.customId.startsWith('aichat_')) {
            const aichatCmd = client.commands.get('aichat-setup');
            if (aichatCmd && aichatCmd.handleInteraction) {
                try {
                    const handled = await aichatCmd.handleInteraction(interaction);
                    if (handled) return;
                } catch (error) {
                    log.error(`AI Chat Modal: ${error.message}`, error);
                }
            }
            return;
        }

        // Handle antispam configure modals
        if (interaction.customId.startsWith('antispam_configure_modal_')) {
            const antispamCmd = client.commands.get('antispam');
            if (antispamCmd && antispamCmd.handleInteraction) {
                try {
                    await antispamCmd.handleInteraction(interaction);
                } catch (error) {
                    log.error(`AntiSpam Modal: ${error.message}`, error);
                }
            }
            return;
        }

        // Handle join2create modals
        if (interaction.customId.startsWith('j2c_')) {
            try {
                await handleJ2CModals(interaction);
            } catch (error) {
                log.error(`Join2Create Modal: ${error.message}`, error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '<:Cancel:1473037949187657818> There was an error!', flags: MessageFlags.Ephemeral }).catch(() => { });
                } else if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply({ content: '<:Cancel:1473037949187657818> There was an error!' }).catch(() => { });
                }
            }
            return;
        }

        // Handle botpanel modals
        if ((interaction.customId.startsWith('botpanel_') && interaction.customId.includes('_modal')) || interaction.customId.startsWith('activity_add_modal_') || interaction.customId === 'custom_add_modal') {
            try {
                const handled = await handleBotPanelModal(interaction, client);
                if (handled) return;
            } catch (error) {
                log.error(`Bot Panel Modal: ${error.message}`, error);
            }
        }

        const welcomerCmd = client.commands.get('welcomer');
        if (welcomerCmd && welcomerCmd.handleModalSubmit && (interaction.customId.startsWith('welcomer_modal_') || interaction.customId.startsWith('welcomer_template_') || interaction.customId.startsWith('leave_modal_') || interaction.customId.startsWith('leave_canvas_') || interaction.customId.startsWith('canvas_'))) {
            try {
                const handled = await welcomerCmd.handleModalSubmit(interaction);
                if (handled) return;
            } catch (error) {
                log.error(`Welcomer Modal: ${error.message}`, error);
            }
        }

        // Custom Font URL modal
        if (interaction.customId === 'custom_font_modal_rankcard' || interaction.customId === 'custom_font_modal_profile') {
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const { registerCustomFontFromUrl } = require('./utils/fontRegistry');
                const { updateUserData } = require('./utils/dataManager');
                const isRankCard = interaction.customId === 'custom_font_modal_rankcard';
                const url = interaction.fields.getTextInputValue('font_url').trim();

                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    return interaction.editReply({ content: '<:Cancel:1473037949187657818> Invalid URL — must start with `http://` or `https://`' });
                }

                await interaction.editReply({ content: '⏳ Downloading your font… this may take a moment.' });

                let entry;
                try {
                    entry = await registerCustomFontFromUrl(url);
                } catch (err) {
                    return interaction.editReply({ content: `<:Cancel:1473037949187657818> Failed to load font: **${err.message}**\n-# Make sure the URL points directly to a .ttf, .otf, .woff, or .woff2 file.` });
                }

                const dataPath = isRankCard ? 'profile.rankCard.fontFamily' : 'profile.profileCard.fontFamily';
                await updateUserData(interaction.user.id, { [dataPath]: entry.key });

                await interaction.editReply({
                    content: `<:Checkedbox:1473038547165384804> Custom font **${entry.name}** set successfully!\n-# Use **Preview** to see how it looks on your ${isRankCard ? 'rank card' : 'profile card'}.`
                });
            } catch (error) {
                log.error(`Custom Font Modal Error: ${error.message}`, error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '<:Cancel:1473037949187657818> Something went wrong loading the font.', flags: MessageFlags.Ephemeral }).catch(() => { });
                } else {
                    await interaction.editReply({ content: '<:Cancel:1473037949187657818> Something went wrong loading the font.' }).catch(() => { });
                }
            }
            return;
        }

        // Help search modal
        if (interaction.customId === 'help_search_modal') {
            const helpCmd = client.commands.get('help');
            if (helpCmd && helpCmd.handleModalSubmit) {
                try {
                    const handled = await helpCmd.handleModalSubmit(interaction);
                    if (handled) return;
                } catch (error) {
                    log.error(`Help Search Modal: ${error.message}`, error);
                }
            }
        }

        const myMusicCmd = client.commands.get('my-music');
        if (myMusicCmd && myMusicCmd.handleModalSubmit && interaction.customId.startsWith('mymusic_modal_')) {
            try {
                const handled = await myMusicCmd.handleModalSubmit(interaction, lavalinkManager);
                if (handled) return;
            } catch (error) {
                log.error(`My Music Modal: ${error.message}`, error);
            }
        }

        const msgBuilderCmd = client.commands.get('message-builder');
        if (msgBuilderCmd && msgBuilderCmd.handleModalSubmit && interaction.customId.startsWith('msgbuilder_modal_')) {
            try {
                const handled = await msgBuilderCmd.handleModalSubmit(interaction);
                if (handled) return;
            } catch (error) {
                log.error(`Message Builder Modal: ${error.message}`, error);
            }
        }

        const mediaGalleryCmd = client.commands.get('media-gallery');
        if (mediaGalleryCmd && mediaGalleryCmd.handleModalSubmit && interaction.customId.startsWith('mediagallery_modal_')) {
            try {
                const handled = await mediaGalleryCmd.handleModalSubmit(interaction);
                if (handled) return;
            } catch (error) {
                log.error(`Media Gallery Modal: ${error.message}`, error);
            }
        }

        // Suggestion edit modal
        if (interaction.customId.startsWith('sug_edit_modal_')) {
            try {
                const suggestionCmd = client.commands.get('suggestion');
                if (suggestionCmd?.handleInteraction) {
                    await suggestionCmd.handleInteraction(interaction);
                }
            } catch (error) {
                log.error(`Suggestion Edit Modal: ${error.message}`, error);
            }
            return;
        }
        // Route games modals (hangman letter, number guess)
        if (interaction.customId.startsWith('hgm_modal_') || interaction.customId.startsWith('ngr_modal_')) {
            const gamesCmd = client.commands.get('games');
            if (gamesCmd?.handleModal) {
                try {
                    await gamesCmd.handleModal(interaction);
                } catch (error) {
                    log.error(`Games Modal Error: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '❌ An error occurred. Please try again.', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                }
            }
            return;
        }

        // Feedback modal
        if (interaction.customId === 'fb_submit_modal') {
            const feedbackCmd = client.commands.get('feedback');
            if (feedbackCmd?.handleInteraction) {
                try {
                    await feedbackCmd.handleInteraction(interaction);
                } catch (error) {
                    log.error(`Feedback Modal Error: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred submitting your feedback.', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                }
            }
            return;
        }

        const inviteCmd = client.commands.get('invite-setup');
        if (inviteCmd && inviteCmd.handleInteraction && interaction.customId.startsWith('invite_modal_')) {
            try {
                const handled = await inviteCmd.handleInteraction(interaction);
                if (handled) return;
            } catch (error) {
                log.error(`Invite Setup Modal: ${error.message}`, error);
            }
        }

        const levelingCmd = client.commands.get('leveling-setup');
        if (levelingCmd && levelingCmd.handleInteraction && interaction.customId.startsWith('leveling_modal_')) {
            try {
                const handled = await levelingCmd.handleInteraction(interaction);
                if (handled) return;
            } catch (error) {
                log.error(`Leveling Setup Modal: ${error.message}`, error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred processing this action.', flags: MessageFlags.Ephemeral }).catch(() => { });
                }
                return;
            }
        }

        const antiraidCmd = client.commands.get('antiraid');
        if (antiraidCmd && antiraidCmd.handleInteraction && interaction.customId.startsWith('antiraid_modal_')) {
            try {
                const handled = await antiraidCmd.handleInteraction(interaction);
                if (handled) return;
            } catch (error) {
                log.error(`Antiraid Modal: ${error.message}`, error);
            }
        }

        // Handle anti limit modals
        if (interaction.customId.startsWith('anti_modal_')) {
            const antiCmd = client.commands.get('anti');
            if (antiCmd && antiCmd.handleInteraction) {
                try {
                    await antiCmd.handleInteraction(interaction);
                    return;
                } catch (error) {
                    log.error(`Anti Limit Modal: ${error.message}`, error);
                }
            }
        }

        if (interaction.customId.startsWith('spotlink_')) {
            const spotlinkCmd = client.commands.get('spotify-link');
            if (spotlinkCmd && spotlinkCmd.handleInteraction) {
                try {
                    const handled = await spotlinkCmd.handleInteraction(interaction);
                    if (handled) return;
                } catch (error) {
                    log.error(`Spotify Link Modal: ${error.message}`, error);
                }
            }
        }

        if (interaction.customId.startsWith('social_')) {
            const socialCmd = client.commands.get('social-notify');
            if (socialCmd && socialCmd.handleInteraction) {
                try {
                    const handled = await socialCmd.handleInteraction(interaction);
                    if (handled) return;
                } catch (error) {
                    log.error(`Social Notify Modal: ${error.message}`, error);
                }
            }
        }

        if (interaction.customId.startsWith('booster_')) {
            const boosterCmd = client.commands.get('booster-notify');
            if (boosterCmd && boosterCmd.handleInteraction) {
                try {
                    const handled = await boosterCmd.handleInteraction(interaction);
                    if (handled) return;
                } catch (error) {
                    log.error(`Booster Notify Modal: ${error.message}`, error);
                }
            }
        }

        // Handle select-menu-maker modals
        if (interaction.customId.startsWith('select_modal_')) {
            const selectMenuCmd = client.commands.get('select-menu-maker');
            if (selectMenuCmd && selectMenuCmd.handleModalSubmit) {
                try {
                    const handled = await selectMenuCmd.handleModalSubmit(interaction);
                    if (handled) return;
                } catch (error) {
                    log.error(`Select Menu Maker Modal: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> Error saving action!', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                }
                return;
            }
        }

        // Handle button-maker modals (including message builder)
        if (interaction.customId.startsWith('btn_modal_') || interaction.customId.startsWith('btnmsg:')) {
            const buttonMakerCmd = client.commands.get('button-maker');
            if (buttonMakerCmd && buttonMakerCmd.handleModalSubmit) {
                try {
                    const handled = await buttonMakerCmd.handleModalSubmit(interaction);
                    if (handled) return;
                } catch (error) {
                    log.error(`Button Maker Modal: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> Error saving action!', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                }
                return;
            }
        }

        // Handle select-menu-maker message builder modals
        if (interaction.customId.startsWith('selmsg:')) {
            const selectMenuCmd = client.commands.get('select-menu-maker');
            if (selectMenuCmd && selectMenuCmd.handleModalSubmit) {
                try {
                    const handled = await selectMenuCmd.handleModalSubmit(interaction);
                    if (handled) return;
                } catch (error) {
                    log.error(`Select Menu Message Builder Modal: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> Error saving action!', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                }
                return;
            }
        }

        // Handle ticket-setup message builder modals
        if (interaction.customId.startsWith('ticketmsg:') || interaction.customId.startsWith('ticketpanel:')) {
            const ticketSetupCmd = client.commands.get('ticket-setup');
            if (ticketSetupCmd && ticketSetupCmd.handleModalSubmit) {
                try {
                    const handled = await ticketSetupCmd.handleModalSubmit(interaction);
                    if (handled) return;
                } catch (error) {
                    log.error(`Ticket Message Builder Modal: ${error.message}`, error);
                }
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '<:Cancel:1473037949187657818> Could not process that action. Please try again.', flags: MessageFlags.Ephemeral }).catch(() => { });
                }
                return;
            }
        }

        // Handle verification panel builder modals
        if (interaction.customId.startsWith('verifypanel:')) {
            const verifySetupCmd = client.commands.get('verification-setup');
            if (verifySetupCmd && verifySetupCmd.handleModalSubmit) {
                try {
                    const handled = await verifySetupCmd.handleModalSubmit(interaction);
                    if (handled) return;
                } catch (error) {
                    log.error(`Verification Panel Builder Modal: ${error.message}`, error);
                }
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '<:Cancel:1473037949187657818> Could not process that action.', flags: MessageFlags.Ephemeral }).catch(() => { });
                }
                return;
            }
        }

        if (interaction.customId.startsWith('apikeys_')) {
            const apikeysCmd = client.commands.get('apikeys');
            if (apikeysCmd && apikeysCmd.handleInteraction) {
                try {
                    const handled = await apikeysCmd.handleInteraction(interaction);
                    if (handled) return;
                } catch (error) {
                    log.error(`API Keys Modal: ${error.message}`, error);
                }
            }
        }

        if (interaction.customId.startsWith('botcustom_')) {
            const botCustomCmd = client.commands.get('bot-customize');
            if (botCustomCmd && botCustomCmd.handleInteraction) {
                try {
                    const handled = await botCustomCmd.handleInteraction(interaction);
                    if (handled) return;
                } catch (error) {
                    log.error(`Bot Customize Modal: ${error.message}`, error);
                }
            }
        }

        // Handle webhook rename modals
        if (interaction.customId.startsWith('wh_modal_rename:')) {
            const whRenameCmd = client.commands.get('webhook-rename');
            if (whRenameCmd && whRenameCmd.handleModalSubmit) {
                try {
                    const handled = await whRenameCmd.handleModalSubmit(interaction);
                    if (handled) return;
                } catch (error) {
                    log.error(`Webhook Rename Modal: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> Error renaming webhook!', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                }
                return;
            }
        }

        // Handle webhook send modals
        if (interaction.customId.startsWith('wh_modal_send:')) {
            const whSendCmd = client.commands.get('webhook-send');
            if (whSendCmd && whSendCmd.handleModalSubmit) {
                try {
                    const handled = await whSendCmd.handleModalSubmit(interaction);
                    if (handled) return;
                } catch (error) {
                    log.error(`Webhook Send Modal: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> Error sending webhook message!', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                }
                return;
            }
        }

        if (interaction.customId.startsWith('giveaway_')) {
            const giveawayCmd = client.commands.get('giveaway');
            if (giveawayCmd && giveawayCmd.handleInteraction) {
                try {
                    const handled = await giveawayCmd.handleInteraction(interaction);
                    if (handled) return;
                } catch (error) {
                    log.error(`Giveaway Modal: ${error.message}`, error);
                }
            }
        }

        if (interaction.customId.startsWith('vote_')) {
            const voteCmd = client.commands.get('vote-notify');
            if (voteCmd && voteCmd.handleModalSubmit) {
                try {
                    const handled = await voteCmd.handleModalSubmit(interaction);
                    if (handled) return;
                } catch (error) {
                    log.error(`Vote Modal: ${error.message}`, error);
                }
            }
        }

        // Route badge-edit modal submissions
        if (interaction.customId.startsWith('badge_modal_')) {
            const badgeEditCmd = client.commands.get('badge-edit');
            if (badgeEditCmd && badgeEditCmd.handleInteraction) {
                try {
                    const handled = await badgeEditCmd.handleInteraction(interaction);
                    if (handled) return;
                } catch (error) {
                    log.error(`Badge Edit Modal Error: ${error.message}`, error);
                }
            }
        }

        try {
            await handleModalSubmit(interaction);
        } catch (error) {
            log.error(`Modal: ${error.message}`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> There was an error processing your submission!', flags: MessageFlags.Ephemeral }).catch(() => { });
            } else if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: '<:Cancel:1473037949187657818> There was an error processing your submission!' }).catch(() => { });
            }
        }
        return;
    }

    if (!interaction.isChatInputCommand()) {
        // Handle button interactions
        if (interaction.isButton()) {
            const { handleWelcomerButtons, handleAutoresponderButtons, handleAutoreactButtons, handleAutomodButtons, handleVerificationButtons, handleProfileButtons, handleEmbedButtons, handleComponentsButtons } = require('./utils/interactionHandlers');

            // ── Bug Report button handler ──
            if (interaction.customId.startsWith('bug_report')) {
                try {
                    const parts = interaction.customId.split(':');
                    const errorId = parts.length > 1 ? parts[1] : null;
                    const modal = buildBugReportModal(errorId);
                    await interaction.showModal(modal);
                } catch (error) {
                    log.error('Bug report button error:', error);
                    await interaction.reply({ content: '<:Cancel:1473037949187657818> Could not open the bug report form. Please use `/report` instead.', flags: MessageFlags.Ephemeral }).catch(() => { });
                }
                return;
            }

            if (interaction.customId.startsWith('rrsetup_')) {
                const rrCmd = client.commands.get('reactionroles');
                if (rrCmd && rrCmd.handleSetupInteraction) {
                    try {
                        await rrCmd.handleSetupInteraction(interaction);
                    } catch (error) {
                        log.error(`RR Setup Button: ${error.message}`, error);
                    }
                }
                return;
            }

            if (interaction.customId.startsWith('rr_role_')) {
                try {
                    const roleId = interaction.customId.replace('rr_role_', '');
                    if (!jsonStore.has('reactionroles')) return interaction.reply({ content: '<:Cancel:1473037949187657818> No reaction role config found.', flags: 64 });
                    const rrConfig = jsonStore.read('reactionroles');
                    const guildId = interaction.guild?.id;
                    if (!guildId || !rrConfig[guildId]) return interaction.reply({ content: '<:Cancel:1473037949187657818> No panels found for this server.', flags: 64 });

                    const msgId = interaction.message.id;
                    const panel = rrConfig[guildId][msgId];
                    if (!panel) return interaction.reply({ content: '<:Cancel:1473037949187657818> This panel no longer exists in config.', flags: 64 });

                    const matchedRole = panel.roles.find(r => r.roleId === roleId);
                    if (!matchedRole) return interaction.reply({ content: '<:Cancel:1473037949187657818> This role is no longer on this panel.', flags: 64 });

                    const role = interaction.guild.roles.cache.get(roleId);
                    if (!role) return interaction.reply({ content: '<:Cancel:1473037949187657818> Role not found.', flags: 64 });
                    if (role.managed || role.position >= interaction.guild.members.me.roles.highest.position) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> I cannot manage this role.', flags: 64 });
                    }

                    const member = interaction.member;
                    if (member.roles.cache.has(roleId)) {
                        await member.roles.remove(role);
                        return interaction.reply({ content: `<:Cancel:1473037949187657818> Removed **${role.name}**`, flags: 64 });
                    } else {
                        await member.roles.add(role);
                        return interaction.reply({ content: `<:Checkedbox:1473038547165384804> Added **${role.name}**`, flags: 64 });
                    }
                } catch (error) {
                    log.error(`RR Button Role: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Failed to toggle role.', flags: 64 });
                    }
                }
                return;
            }

            if (interaction.customId.startsWith('welcomer_') || interaction.customId.startsWith('leave_') || interaction.customId.startsWith('canvas_')) {
                const welcomerCmd = client.commands.get('welcomer');
                if (welcomerCmd && welcomerCmd.handleInteraction) {
                    try {
                        const handled = await welcomerCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Welcomer Button: ${error.message}`, error);
                        if (interaction.replied || interaction.deferred) return;
                    }
                }
                if (interaction.customId.startsWith('welcomer_') || interaction.customId.startsWith('leave_') || interaction.customId.startsWith('canvas_')) {
                    return handleWelcomerButtons(interaction);
                }
            }
            if (interaction.customId.startsWith('msgbuilder_')) {
                const msgBuilderCmd = client.commands.get('message-builder');
                if (msgBuilderCmd && msgBuilderCmd.handleInteraction) {
                    const handled = await msgBuilderCmd.handleInteraction(interaction);
                    if (handled) return;
                }
            }
            if (interaction.customId.startsWith('mediagallery_')) {
                const mediaGalleryCmd = client.commands.get('media-gallery');
                if (mediaGalleryCmd && mediaGalleryCmd.handleInteraction) {
                    try {
                        const handled = await mediaGalleryCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Media Gallery Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('spotlink_')) {
                const spotlinkCmd = client.commands.get('spotify-link');
                if (spotlinkCmd && spotlinkCmd.handleInteraction) {
                    try {
                        const handled = await spotlinkCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Spotify Link Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('social_')) {
                const socialCmd = client.commands.get('social-notify');
                if (socialCmd && socialCmd.handleInteraction) {
                    try {
                        const handled = await socialCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Social Notify Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('booster_')) {
                const boosterCmd = client.commands.get('booster-notify');
                if (boosterCmd && boosterCmd.handleInteraction) {
                    try {
                        const handled = await boosterCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Booster Notify Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('apikeys_')) {
                const apikeysCmd = client.commands.get('apikeys');
                if (apikeysCmd && apikeysCmd.handleInteraction) {
                    try {
                        const handled = await apikeysCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`API Keys Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('help_')) {
                const helpCmd = client.commands.get('help');
                if (helpCmd && helpCmd.handleButton) {
                    try {
                        const handled = await helpCmd.handleButton(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Help Button Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('var_')) {
                const varCmd = client.commands.get('variables');
                if (varCmd && varCmd.handleButton) {
                    try {
                        const handled = await varCmd.handleButton(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Variables Button Error: ${error.message}`, error);
                    }
                }
            }
            // Route avatar toggle buttons
            if (interaction.customId.startsWith('avatar_')) {
                const avatarCmd = client.commands.get('avatar');
                if (avatarCmd && avatarCmd.handleButton) {
                    try {
                        await avatarCmd.handleButton(interaction);
                        return;
                    } catch (error) {
                        log.error(`Avatar Button Error: ${error.message}`, error);
                    }
                }
            }
            // Route fun game buttons
            if (interaction.customId.startsWith('hangman_')) {
                const hangmanCmd = client.commands.get('hangman');
                if (hangmanCmd && hangmanCmd.handleButton) {
                    try {
                        const handled = await hangmanCmd.handleButton(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Hangman Button Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('bj_')) {
                const bjCmd = client.commands.get('blackjack');
                if (bjCmd && bjCmd.handleButton) {
                    try {
                        const handled = await bjCmd.handleButton(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Blackjack Button Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('ttt_')) {
                const tttCmd = client.commands.get('tictactoe');
                if (tttCmd && tttCmd.handleButton) {
                    try {
                        const handled = await tttCmd.handleButton(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`TicTacToe Button Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('wyr_')) {
                const wyrCmd = client.commands.get('wouldyourather');
                if (wyrCmd && wyrCmd.handleButton) {
                    try {
                        const handled = await wyrCmd.handleButton(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`WouldYouRather Button Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('akinator_')) {
                const akinatorCmd = client.commands.get('akinator');
                if (akinatorCmd && akinatorCmd.handleButton) {
                    try {
                        const handled = await akinatorCmd.handleButton(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Akinator Button Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('reaction_')) {
                const reactionCmd = client.commands.get('reactionspeed');
                if (reactionCmd && reactionCmd.handleButton) {
                    try {
                        const handled = await reactionCmd.handleButton(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`ReactionSpeed Button Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('botcustom_')) {
                const botCustomCmd = client.commands.get('bot-customize');
                if (botCustomCmd && botCustomCmd.handleInteraction) {
                    try {
                        const handled = await botCustomCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error('Bot Customize error', error);
                    }
                }
            }
            if (interaction.customId === 'check_ping' || interaction.customId === 'check_botinfo') {
                try {
                    if (interaction.customId === 'check_ping') {
                        const { buildPing } = require('./commands/basic/ping');
                        const { container, utilRow } = buildPing(client, null);
                        await interaction.reply({ components: [container, utilRow], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                    } else {
                        const { buildBotInfo } = require('./commands/basic/botinfo');
                        const { container, linkRow } = buildBotInfo(client, interaction.guild);
                        await interaction.reply({ components: [container, linkRow], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                    }
                    return;
                } catch (error) {
                    log.error(`Check Utility Error: ${error.message}`, error);
                }
            }
            if (interaction.customId.startsWith('botpanel_') || interaction.customId.startsWith('activity_') || interaction.customId.startsWith('custom_')) {
                try {
                    const handled = await handleBotPanelButton(interaction, client);
                    if (handled) return;
                } catch (error) {
                    log.error(`Bot Panel Error: ${error.message}`, error);
                }
            }
            if (interaction.customId.startsWith('mymusic_')) {
                const myMusicCmd = client.commands.get('my-music');
                if (myMusicCmd && myMusicCmd.handleButton) {
                    try {
                        const handled = await myMusicCmd.handleButton(interaction, lavalinkManager);
                        if (handled) return;
                    } catch (error) {
                        log.error(`My Music Button Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('clrhist_')) {
                const clearCmd = client.commands.get('clear');
                if (clearCmd && clearCmd.handleButton) {
                    try {
                        const handled = await clearCmd.handleButton(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Clear History Button Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('listkeys_')) {
                const listkeysCmd = client.commands.get('listkeys');
                if (listkeysCmd && listkeysCmd.handleButton) {
                    try {
                        const handled = await listkeysCmd.handleButton(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`List Keys Button Error: ${error.message}`, error);
                    }
                }
            }
            // Route premiums pagination & view switch buttons
            if (interaction.customId.startsWith('premiums_')) {
                const premiumsCmd = client.commands.get('premiums');
                if (premiumsCmd && premiumsCmd.handleButton) {
                    try {
                        const handled = await premiumsCmd.handleButton(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Premiums Button Error: ${error.message}`, error);
                    }
                }
            }
            // Shop category tabs are now a StringSelectMenu (routed in isStringSelectMenu block)
            // Route highlow game buttons (hl_high_ / hl_low_ / hl_equal_)
            if (interaction.customId.startsWith('hl_')) {
                const hlCmd = client.commands.get('highlow');
                if (hlCmd && hlCmd.handleButton) {
                    try {
                        const handled = await hlCmd.handleButton(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`High-Low Button Error: ${error.message}`, error);
                    }
                }
            }
            // Route mines game button clicks (tile reveals + cashout).
            // The select menus for grid/risk are handled in the
            // isStringSelectMenu block below — both paths share the
            // same handleMinesInteraction entry point.
            if (interaction.customId.startsWith('mines_')) {
                const minesCmd = client.commands.get('mines');
                if (minesCmd && minesCmd.handleMinesInteraction) {
                    try {
                        const handled = await minesCmd.handleMinesInteraction(interaction);
                        if (handled !== false) return;
                    } catch (error) {
                        log.error(`Mines Button Error: ${error.message}`, error);
                    }
                }
            }
            // Route inventory pagination buttons
            if (interaction.customId.startsWith('inv_page_')) {
                const invCmd = client.commands.get('inventory');
                if (invCmd && invCmd.handleInteraction) {
                    try {
                        const handled = await invCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Inventory Button Error: ${error.message}`, error);
                    }
                }
            }
            // Route economy leaderboard buttons (sort, scope, page)
            if (interaction.customId.startsWith('elb_')) {
                const lbCmd = client.commands.get('economy-leaderboard');
                if (lbCmd && lbCmd.handleButton) {
                    try {
                        const handled = await lbCmd.handleButton(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Leaderboard Button Error: ${error.message}`, error);
                    }
                }
            }
            // Route stats card buttons (server/global toggle)
            if (interaction.customId.startsWith('sc_')) {
                const statsCmd = client.commands.get('stats');
                if (statsCmd && statsCmd.handleButton) {
                    try {
                        const handled = await statsCmd.handleButton(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Stats Card Button Error: ${error.message}`, error);
                    }
                }
            }
            // Route stats leaderboard buttons (type, scope, page)
            if (interaction.customId.startsWith('slb_')) {
                const statboardCmd = client.commands.get('statboard');
                if (statboardCmd && statboardCmd.handleButton) {
                    try {
                        const handled = await statboardCmd.handleButton(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Stats Leaderboard Button Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('ulb_')) {
                const ulbCmd = client.commands.get('leaderboard');
                if (ulbCmd && ulbCmd.handleButton) {
                    try {
                        const handled = await ulbCmd.handleButton(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Unified Leaderboard Button Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('vote_')) {
                const voteCmd = client.commands.get('vote-notify');
                if (voteCmd && voteCmd.handleInteraction) {
                    try {
                        const handled = await voteCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Vote Button Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('voterem_')) {
                const myVotesCmd = client.commands.get('myvotes');
                if (myVotesCmd && myVotesCmd.handleInteraction) {
                    try {
                        const handled = await myVotesCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`VoteRem Button Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('ignorech_')) {
                const ignoreCmd = client.commands.get('ignore-channels');
                if (ignoreCmd && ignoreCmd.handleInteraction) {
                    try {
                        const handled = await ignoreCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Ignore Channels Button Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('botblock_')) {
                const bbCmd = client.commands.get('botblock');
                if (bbCmd && bbCmd.handleInteraction) {
                    try {
                        const handled = await bbCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Bot Block Button Error: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('invite_')) {
                const inviteCmd = client.commands.get('invite-setup');
                if (inviteCmd && inviteCmd.handleInteraction) {
                    try {
                        const handled = await inviteCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Invite Button Error: ${error.message}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred processing this action.', flags: MessageFlags.Ephemeral }).catch(() => { });
                        }
                        return;
                    }
                }
            }
            // Route pets interactions (select menus / buttons)
            if (interaction.customId.startsWith('pets:') || interaction.customId.startsWith('pets_')) {
                const petsCmd = client.commands.get('pets');
                if (petsCmd && petsCmd.handleInteraction) {
                    try {
                        const handled = await petsCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Pets Interaction Error: ${error.message}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred processing this pets action.', flags: MessageFlags.Ephemeral }).catch(() => { });
                        }
                        return;
                    }
                }
            }
            // Route suggestion system interactions (vote buttons + setup buttons)
            if (interaction.customId.startsWith('sug_')) {
                const suggestionCmd = client.commands.get('suggestion');
                if (suggestionCmd && suggestionCmd.handleInteraction) {
                    try {
                        const handled = await suggestionCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Suggestion Interaction Error: ${error.message}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred processing this action.', flags: MessageFlags.Ephemeral }).catch(() => { });
                        }
                        return;
                    }
                }
            }
            // Route feedback system buttons
            if (interaction.customId.startsWith('fb_')) {
                const feedbackCmd = client.commands.get('feedback');
                if (feedbackCmd && feedbackCmd.handleInteraction) {
                    try {
                        await feedbackCmd.handleInteraction(interaction);
                    } catch (error) {
                        log.error(`Feedback Interaction Error: ${error.message}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred. Please try again.', flags: MessageFlags.Ephemeral }).catch(() => { });
                        }
                    }
                }
                return;
            }
            // Route YouTube search pagination buttons
            if (interaction.customId.startsWith('yts_prev_') || interaction.customId.startsWith('yts_next_')) {
                const ytCmd = client.commands.get('yt');
                if (ytCmd && ytCmd.handlePageButton) {
                    try {
                        await ytCmd.handlePageButton(interaction);
                    } catch (error) {
                        log.error(`YouTube Search Pagination Error: ${error.message}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred. Try searching again.', flags: MessageFlags.Ephemeral }).catch(() => { });
                        }
                    }
                }
                return;
            }
            // Route games buttons (all 9 games)
            if (
                interaction.customId.startsWith('msw_') ||
                interaction.customId.startsWith('gm_ttt_') ||
                interaction.customId.startsWith('rps_') ||
                interaction.customId.startsWith('hgm_') ||
                interaction.customId.startsWith('ngr_') ||
                interaction.customId.startsWith('mem_') ||
                interaction.customId.startsWith('t28_') ||
                interaction.customId.startsWith('bsh_') ||
                interaction.customId.startsWith('gm_c4_')
            ) {
                const gamesCmd = client.commands.get('games');
                if (gamesCmd?.handleInteraction) {
                    try {
                        await gamesCmd.handleInteraction(interaction);
                    } catch (error) {
                        log.error(`Games Interaction Error: ${error.message}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: '❌ An error occurred. Please try again.', flags: MessageFlags.Ephemeral }).catch(() => { });
                        }
                    }
                }
                return;
            }
            // Route badge-edit interactions (buttons)
            if (interaction.customId.startsWith('badge_edit_') || interaction.customId.startsWith('badge_confirm_') || interaction.customId === 'badge_cancel_delete') {
                const badgeEditCmd = client.commands.get('badge-edit');
                if (badgeEditCmd && badgeEditCmd.handleInteraction) {
                    try {
                        const handled = await badgeEditCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Badge Edit Button Error: ${error.message}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred processing this action.', flags: MessageFlags.Ephemeral }).catch(() => { });
                        }
                        return;
                    }
                }
            }
            // Route owner-badges umbrella help buttons (badges.js)
            if (interaction.customId.startsWith('badge_help_')) {
                const ownerBadgesCmd = client.commands.get('ownerbadges');
                if (ownerBadgesCmd && ownerBadgesCmd.handleInteraction) {
                    try {
                        const handled = await ownerBadgesCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Badge Help Button Error: ${error.message}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred processing this action.', flags: MessageFlags.Ephemeral }).catch(() => { });
                        }
                        return;
                    }
                }
            }
            if (interaction.customId.startsWith('leveling_')) {
                const levelingCmd = client.commands.get('leveling-setup');
                if (levelingCmd && levelingCmd.handleInteraction) {
                    try {
                        const handled = await levelingCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Leveling Button Error: ${error.message}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred processing this action.', flags: MessageFlags.Ephemeral }).catch(() => { });
                        }
                        return;
                    }
                }
            }
            if (interaction.customId.startsWith('autoresponder_')) {
                try {
                    return await handleAutoresponderButtons(interaction);
                } catch (error) {
                    log.error(`Autoresponder Button Error: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred processing this action.', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                    return;
                }
            }
            if (interaction.customId.startsWith('autoreact_')) {
                try {
                    return await handleAutoreactButtons(interaction);
                } catch (error) {
                    log.error(`Autoreact Button Error: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred processing this action.', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                    return;
                }
            }
            if (interaction.customId.startsWith('automod_')) {
                try {
                    return await handleAutomodButtons(interaction);
                } catch (error) {
                    log.error(`Automod Button Error: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred processing this action.', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                    return;
                }
            }
            if (interaction.customId.startsWith('antiraid_')) {
                const antiraidCmd = client.commands.get('antiraid');
                if (antiraidCmd && antiraidCmd.handleInteraction) {
                    try {
                        const handled = await antiraidCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Antiraid Interaction: ${error.message}`, error);
                    }
                }
                return;
            }
            // Handle verification panel builder buttons
            if (interaction.customId.startsWith('verifypanel:')) {
                const verifySetupCmd = client.commands.get('verification-setup');
                if (verifySetupCmd && verifySetupCmd.handleInteraction) {
                    try {
                        const handled = await verifySetupCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Verification Panel Builder: ${error.message}`, error);
                    }
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> Could not process that action.', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                }
                return;
            }

            if (interaction.customId.startsWith('verification_') || interaction.customId.startsWith('captcha_')) {
                try {
                    return await handleVerificationButtons(interaction);
                } catch (error) {
                    log.error(`Verification: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> There was an error processing verification!', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                }
                return;
            }
            if (interaction.customId.startsWith('profile_') || interaction.customId.startsWith('rankcard_')) {
                return handleProfileButtons(interaction);
            }
            // Handle embed-quick builder buttons
            if (interaction.customId.startsWith('embed_setup_') || interaction.customId.startsWith('embed_preview') || interaction.customId.startsWith('embed_send_') || interaction.customId === 'embed_see_variables' || interaction.customId === 'embed_reset') {
                return handleEmbedButtons(interaction);
            }
            // Handle components-quick builder buttons
            if (interaction.customId.startsWith('components_setup_') || interaction.customId.startsWith('components_preview') || interaction.customId.startsWith('components_send_') || interaction.customId === 'components_see_variables' || interaction.customId === 'components_reset' || interaction.customId.startsWith('components_add_') || interaction.customId.startsWith('components_remove_')) {
                return handleComponentsButtons(interaction);
            }

            // Handle music filter buttons
            if (interaction.customId.startsWith('filter_')) {
                const player = client.lavalinkManager.getPlayer(interaction.guild.id);
                if (!player || !player.queue.current) return interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing!', flags: MessageFlags.Ephemeral });

                if (!interaction.member.voice.channel) {
                    return interaction.reply({ content: '<:Cancel:1473037949187657818> You need to be in a voice channel!', flags: MessageFlags.Ephemeral });
                }

                if (player.voiceChannelId && interaction.member.voice.channel.id !== player.voiceChannelId) {
                    return interaction.reply({ content: '<:Cancel:1473037949187657818> You need to be in the same voice channel as the bot!', flags: MessageFlags.Ephemeral });
                }

                const filter = interaction.customId.replace('filter_', '');
                let filterName = '';

                try {
                    if (filter === 'clear') {
                        await player.filterManager.resetFilters();
                        filterName = 'All filters cleared';
                    } else if (filter === 'bassboost') {
                        await player.filterManager.setEQ([{ band: 0, gain: 0.4 }, { band: 1, gain: 0.3 }, { band: 2, gain: 0.2 }]);
                        filterName = 'Bass Boost';
                    } else if (filter === 'nightcore') {
                        await player.filterManager.setTimescale({ speed: 1.2, pitch: 1.2 });
                        filterName = 'Nightcore';
                    } else if (filter === 'vaporwave') {
                        await player.filterManager.setTimescale({ speed: 0.8, pitch: 0.8 });
                        filterName = 'Vaporwave';
                    } else if (filter === '8d') {
                        player.filterManager.data.rotation = { rotationHz: 0.2 };
                        player.filterManager.filters.rotation = true;
                        await player.filterManager.applyPlayerFilters();
                        filterName = '8D Audio';
                    } else if (filter === 'karaoke') {
                        player.filterManager.data.karaoke = { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 };
                        player.filterManager.filters.karaoke = true;
                        await player.filterManager.applyPlayerFilters();
                        filterName = 'Karaoke';
                    } else if (filter === 'tremolo') {
                        player.filterManager.data.tremolo = { frequency: 4.0, depth: 0.75 };
                        player.filterManager.filters.tremolo = true;
                        await player.filterManager.applyPlayerFilters();
                        filterName = 'Tremolo';
                    } else if (filter === 'vibrato') {
                        player.filterManager.data.vibrato = { frequency: 10.0, depth: 0.9 };
                        player.filterManager.filters.vibrato = true;
                        await player.filterManager.applyPlayerFilters();
                        filterName = 'Vibrato';
                    } else if (filter === 'china') {
                        await player.filterManager.setTimescale({ speed: 0.7, pitch: 1.3 });
                        filterName = 'China';
                    } else if (filter === 'chipmunk') {
                        await player.filterManager.setTimescale({ speed: 1.3, pitch: 1.4 });
                        filterName = 'Chipmunk';
                    } else if (filter === 'daycore') {
                        await player.filterManager.setTimescale({ speed: 0.75, pitch: 0.75 });
                        filterName = 'Daycore';
                    } else if (filter === 'distortion') {
                        player.filterManager.data.distortion = { sinOffset: 0, sinScale: 1, cosOffset: 0, cosScale: 1, tanOffset: 0, tanScale: 1, offset: 0, scale: 1.2 };
                        player.filterManager.filters.distortion = true;
                        await player.filterManager.applyPlayerFilters();
                        filterName = 'Distortion';
                    } else if (filter === 'soft') {
                        await player.filterManager.setEQ([{ band: 4, gain: -0.15 }, { band: 5, gain: -0.15 }]);
                        filterName = 'Soft';
                    } else if (filter === 'pop') {
                        await player.filterManager.setEQ([{ band: 1, gain: 0.1 }, { band: 2, gain: 0.1 }, { band: 3, gain: 0.15 }]);
                        filterName = 'Pop';
                    } else if (filter === 'party') {
                        await player.filterManager.setEQ([{ band: 0, gain: 0.3 }, { band: 1, gain: 0.3 }, { band: 5, gain: 0.3 }]);
                        filterName = 'Party';
                    } else if (filter === 'electronic') {
                        await player.filterManager.setEQ([{ band: 0, gain: 0.375 }, { band: 1, gain: 0.35 }, { band: 6, gain: 0.25 }]);
                        filterName = 'Electronic';
                    }

                    const container = new ContainerBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder()
                                .setContent(`# <:Fire:1473038604812161218> Filter Applied\n\n**${filterName}** ${filter === 'clear' ? '<:Trash:1473038090074591293>' : 'applied! <:Music:1473039311057190972>'}`)
                        );

                    await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                } catch (error) {
                    log.error('Filter apply error', error);
                    await interaction.reply({ content: 'Failed to apply filter.', flags: MessageFlags.Ephemeral }).catch(() => { });
                }
                return;
            }

            // Handle join2create interactive buttons
            if (interaction.customId.startsWith('j2c_')) {
                try {
                    await handleJ2CButtons(interaction);
                } catch (error) {
                    log.error(`Join2Create: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> There was an error!', flags: MessageFlags.Ephemeral }).catch(() => { });
                    } else if (interaction.deferred && !interaction.replied) {
                        await interaction.editReply({ content: '<:Cancel:1473037949187657818> There was an error!' }).catch(() => { });
                    }
                }
                return;
            }

            if (interaction.customId.startsWith('quicksetup_')) {
                const quicksetupCmd = client.commands.get('quicksetup');
                if (quicksetupCmd && quicksetupCmd.handleInteraction) {
                    try {
                        const handled = await quicksetupCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Quick Setup Button: ${error.message}`, error);
                    }
                }
                return;
            }

            if (interaction.customId.startsWith('roletemplate_')) {
                const rtCmd = client.commands.get('roletemplate');
                if (rtCmd && rtCmd.handleInteraction) {
                    try {
                        const handled = await rtCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Role Template Button: ${error.message}`, error);
                    }
                }
                return;
            }
            if (interaction.customId.startsWith('aichat_')) {
                const aichatCmd = client.commands.get('aichat-setup');
                if (aichatCmd && aichatCmd.handleInteraction) {
                    try {
                        const handled = await aichatCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`AI Chat Button: ${error.message}`, error);
                    }
                }
                return;
            }
            if (interaction.customId.startsWith('antinuke_')) {
                const { handleAntiNukeButtons } = require('./utils/interactionHandlers');
                return handleAntiNukeButtons(interaction);
            }
            if (interaction.customId.startsWith('app_')) {
                const appCmd = client.commands.get('application');
                if (appCmd && appCmd.handleInteraction) {
                    try {
                        await appCmd.handleInteraction(interaction);
                    } catch (error) {
                        log.error(`Application Button: ${error.message}`, error);
                    }
                }
                return;
            }
            if (interaction.customId.startsWith('anti_')) {
                const antiCmd = client.commands.get('anti');
                if (antiCmd && antiCmd.handleInteraction) {
                    try {
                        await antiCmd.handleInteraction(interaction);
                    } catch (error) {
                        log.error(`Anti Limit Button: ${error.message}`, error);
                    }
                }
                return;
            }
            if (interaction.customId.startsWith('threat_')) {
                const threatCmd = client.commands.get('threatmode');
                if (threatCmd && threatCmd.handleInteraction) {
                    try {
                        await threatCmd.handleInteraction(interaction);
                    } catch (error) {
                        log.error(`Threat Mode Button: ${error.message}`, error);
                    }
                }
                return;
            }
            if (interaction.customId.startsWith('superthreat_')) {
                const superThreatCmd = client.commands.get('superthreatmode');
                if (superThreatCmd && superThreatCmd.handleInteraction) {
                    try {
                        await superThreatCmd.handleInteraction(interaction);
                    } catch (error) {
                        log.error(`Super Threat Mode Button: ${error.message}`, error);
                    }
                }
                return;
            }

            // Handle button maker action editor buttons
            if (interaction.customId.startsWith('btn_action_') || interaction.customId.startsWith('btnmsg:') || interaction.customId.startsWith('btn_edit_action:') || interaction.customId.startsWith('btn_del_action:')) {
                const buttonMakerCmd = client.commands.get('button-maker');
                if (buttonMakerCmd && buttonMakerCmd.handleInteraction) {
                    try {
                        const handled = await buttonMakerCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Button Maker: ${error.message}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: '<:Cancel:1473037949187657818> There was an error!', flags: MessageFlags.Ephemeral }).catch(() => { });
                        }
                    }
                }
                return;
            }

            // Handle select menu message builder buttons
            if (interaction.customId.startsWith('selmsg:')) {
                const selectMenuCmd = client.commands.get('select-menu-maker');
                if (selectMenuCmd && selectMenuCmd.handleInteraction) {
                    try {
                        const handled = await selectMenuCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Select Menu Message Builder: ${error.message}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: '<:Cancel:1473037949187657818> There was an error!', flags: MessageFlags.Ephemeral }).catch(() => { });
                        }
                    }
                }
                return;
            }

            // Handle ticket-setup message builder buttons
            if (interaction.customId.startsWith('ticketmsg:') || interaction.customId.startsWith('ticketpanel:')) {
                const ticketSetupCmd = client.commands.get('ticket-setup');
                if (ticketSetupCmd && ticketSetupCmd.handleInteraction) {
                    try {
                        const handled = await ticketSetupCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Ticket Message Builder: ${error.message}`, error);
                    }
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> Could not process that action. Please try again.', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                }
                return;
            }

            // Handle button command executions
            if (interaction.customId.startsWith('btn_cmd_')) {
                // Parse button data BEFORE try block so isEphemeral is in scope for catch
                let isEphemeral = true;
                try {
                    // Parse: btn_cmd_<guildId>_<buttonId>
                    // buttonId can contain underscores, so we can't use simple split
                    const prefixLength = 'btn_cmd_'.length;
                    const afterPrefix = interaction.customId.substring(prefixLength);
                    const firstUnderscorePos = afterPrefix.indexOf('_');

                    if (firstUnderscorePos === -1) {
                        const container = new ContainerBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder()
                                    .setContent('# <:Cancel:1473037949187657818> Invalid Button\n\nThis button has an invalid configuration.')
                            );
                        return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                    }

                    const guildId = afterPrefix.substring(0, firstUnderscorePos);
                    const buttonId = afterPrefix.substring(firstUnderscorePos + 1);

                    const buttonsConfig = jsonStore.read('button-commands');
                    const btnData = buttonsConfig[guildId]?.[buttonId];

                    if (!btnData || !btnData.actions || btnData.actions.length === 0) {
                        const container = new ContainerBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder()
                                    .setContent('# <:Cancel:1473037949187657818> No Actions\n\nThis button has no actions configured!\n\nAdministrators can add actions with `/button-maker edit-actions`.')
                            );
                        return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                    }

                    // Check ephemeral setting (default to true for backwards compatibility)
                    isEphemeral = btnData.ephemeral !== false;

                    // Build the ephemeral flags for editReply (must include Ephemeral to preserve it)
                    const replyFlags = MessageFlags.IsComponentsV2 | (isEphemeral ? MessageFlags.Ephemeral : 0);

                    // Defer reply for slow operations
                    await interaction.deferReply(isEphemeral ? { flags: MessageFlags.Ephemeral } : {});

                    // Execute all actions
                    let responseMsg = [];
                    let successCount = 0;
                    let errorCount = 0;

                    // Helper function to replace placeholders
                    const replacePlaceholders = (text) => {
                        if (!text) return text;
                        return text
                            .replace(/{user}/g, interaction.member?.displayName || interaction.user.username)
                            .replace(/{userId}/g, interaction.user.id)
                            .replace(/{userMention}/g, `<@${interaction.user.id}>`)
                            .replace(/{server}/g, interaction.guild.name)
                            .replace(/{membercount}/g, interaction.guild.memberCount.toString())
                            .replace(/{number}/g, Date.now().toString());
                    };

                    // Collect ephemeral message content (used when button is ephemeral)
                    let ephemeralContent = [];
                    let responseEmbeds = [];

                    for (const action of btnData.actions) {
                        try {
                            // Role actions
                            if (action.type === 'add_role') {
                                const role = interaction.guild.roles.cache.get(action.roleId);
                                if (!role) {
                                    responseMsg.push(`<:Cancel:1473037949187657818> Role not found (deleted?)`);
                                    errorCount++;
                                } else if (role.position >= interaction.guild.members.me.roles.highest.position) {
                                    responseMsg.push(`<:Cancel:1473037949187657818> Can't add ${role.name} - role is higher than bot's role`);
                                    errorCount++;
                                } else if (role.managed) {
                                    responseMsg.push(`<:Cancel:1473037949187657818> Can't add ${role.name} - managed by integration`);
                                    errorCount++;
                                } else {
                                    await interaction.member.roles.add(role);
                                    responseMsg.push(`<:Checkedbox:1473038547165384804> Added role **${role.name}**`);
                                    successCount++;
                                }
                            } else if (action.type === 'remove_role') {
                                const role = interaction.guild.roles.cache.get(action.roleId);
                                if (!role) {
                                    responseMsg.push(`<:Cancel:1473037949187657818> Role not found (deleted?)`);
                                    errorCount++;
                                } else if (!interaction.member.roles.cache.has(role.id)) {
                                    responseMsg.push(`ℹ️ You don't have ${role.name}`);
                                    successCount++;
                                } else if (role.position >= interaction.guild.members.me.roles.highest.position) {
                                    responseMsg.push(`<:Cancel:1473037949187657818> Can't remove ${role.name} - role is higher than bot's role`);
                                    errorCount++;
                                } else {
                                    await interaction.member.roles.remove(role);
                                    responseMsg.push(`<:Checkedbox:1473038547165384804> Removed role **${role.name}**`);
                                    successCount++;
                                }
                            } else if (action.type === 'toggle_role') {
                                const role = interaction.guild.roles.cache.get(action.roleId);
                                if (!role) {
                                    responseMsg.push(`<:Cancel:1473037949187657818> Role not found (deleted?)`);
                                    errorCount++;
                                } else if (role.position >= interaction.guild.members.me.roles.highest.position) {
                                    responseMsg.push(`<:Cancel:1473037949187657818> Can't toggle ${role.name} - role is higher than bot's role`);
                                    errorCount++;
                                } else if (role.managed) {
                                    responseMsg.push(`<:Cancel:1473037949187657818> Can't toggle ${role.name} - managed by integration`);
                                    errorCount++;
                                } else {
                                    if (interaction.member.roles.cache.has(action.roleId)) {
                                        await interaction.member.roles.remove(role);
                                        responseMsg.push(`<:Checkedbox:1473038547165384804> Removed role **${role.name}**`);
                                    } else {
                                        await interaction.member.roles.add(role);
                                        responseMsg.push(`<:Checkedbox:1473038547165384804> Added role **${role.name}**`);
                                    }
                                    successCount++;
                                }
                            }
                            // Message actions
                            else if (action.type === 'send_message') {
                                // When ephemeral is enabled and no specific target channel is set,
                                // deliver the message as part of the ephemeral reply instead of sending publicly
                                const hasExplicitChannel = action.channelId && action.channelId !== interaction.channel.id;

                                if (isEphemeral && !hasExplicitChannel) {
                                    // Ephemeral mode: collect message content to show in the ephemeral reply
                                    if (action.mode === 'embed' && action.embed) {
                                        // Store embed to attach in the final ephemeral reply
                                        if (!responseEmbeds) responseEmbeds = [];
                                        const embed = new EmbedBuilder();
                                        if (action.embed.title) embed.setTitle(replacePlaceholders(action.embed.title));
                                        if (action.embed.description) embed.setDescription(replacePlaceholders(action.embed.description));
                                        if (action.embed.color) embed.setColor(action.embed.color);
                                        if (action.embed.image) embed.setImage(action.embed.image);
                                        if (action.embed.thumbnail) embed.setThumbnail(action.embed.thumbnail);
                                        if (action.embed.author) embed.setAuthor({ name: replacePlaceholders(action.embed.author), iconURL: action.embed.authorIcon || undefined });
                                        if (action.embed.footer) embed.setFooter({ text: replacePlaceholders(action.embed.footer), iconURL: action.embed.footerIcon || undefined });
                                        if (action.embed.fields?.length > 0) {
                                            embed.addFields(action.embed.fields.map(f => ({ name: replacePlaceholders(f.name), value: replacePlaceholders(f.value), inline: f.inline })));
                                        }
                                        responseEmbeds.push(embed);
                                    } else {
                                        // Store plain text content to show in the ephemeral reply
                                        if (!ephemeralContent) ephemeralContent = [];
                                        ephemeralContent.push(replacePlaceholders(action.message));
                                    }
                                    successCount++;
                                } else {
                                    // Public mode or explicit channel: send to the target channel normally
                                    const targetChannel = hasExplicitChannel ? interaction.guild.channels.cache.get(action.channelId) : interaction.channel;
                                    if (!targetChannel) {
                                        responseMsg.push(`<:Cancel:1473037949187657818> Channel not found`);
                                        errorCount++;
                                    } else if (!targetChannel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
                                        responseMsg.push(`<:Cancel:1473037949187657818> No permission to send messages in ${targetChannel}`);
                                        errorCount++;
                                    } else {
                                        if (action.mode === 'embed' && action.embed) {
                                            const embed = new EmbedBuilder();
                                            if (action.embed.title) embed.setTitle(replacePlaceholders(action.embed.title));
                                            if (action.embed.description) embed.setDescription(replacePlaceholders(action.embed.description));
                                            if (action.embed.color) embed.setColor(action.embed.color);
                                            if (action.embed.image) embed.setImage(action.embed.image);
                                            if (action.embed.thumbnail) embed.setThumbnail(action.embed.thumbnail);
                                            if (action.embed.author) embed.setAuthor({ name: replacePlaceholders(action.embed.author), iconURL: action.embed.authorIcon || undefined });
                                            if (action.embed.footer) embed.setFooter({ text: replacePlaceholders(action.embed.footer), iconURL: action.embed.footerIcon || undefined });
                                            if (action.embed.fields?.length > 0) {
                                                embed.addFields(action.embed.fields.map(f => ({ name: replacePlaceholders(f.name), value: replacePlaceholders(f.value), inline: f.inline })));
                                            }
                                            await targetChannel.send({ embeds: [embed] });
                                        } else {
                                            const message = replacePlaceholders(action.message);
                                            await targetChannel.send(message);
                                        }
                                        responseMsg.push(`<:Checkedbox:1473038547165384804> Message sent to ${targetChannel}`);
                                        successCount++;
                                    }
                                }
                            } else if (action.type === 'send_dm') {
                                try {
                                    const message = replacePlaceholders(action.message);
                                    await interaction.user.send(message);
                                    responseMsg.push(`<:Checkedbox:1473038547165384804> DM sent`);
                                    successCount++;
                                } catch (dmError) {
                                    responseMsg.push(`<:Cancel:1473037949187657818> Could not send DM (DMs disabled?)`);
                                    errorCount++;
                                }
                            }
                            // Ticket action
                            else if (action.type === 'create_ticket') {
                                if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
                                    responseMsg.push(`<:Cancel:1473037949187657818> Bot needs Manage Channels permission`);
                                    errorCount++;
                                } else {
                                    const ticketName = replacePlaceholders(action.ticketName || 'ticket-{user}');
                                    const category = action.categoryId ? interaction.guild.channels.cache.get(action.categoryId) : null;

                                    // Reliable existing ticket check via tickets.json
                                    let ticketsConfig = {};
                                    if (jsonStore.has('tickets')) {
                                        ticketsConfig = jsonStore.read('tickets');
                                    }
                                    const guildTickets = ticketsConfig[interaction.guild.id]?.tickets || {};
                                    const existingEntry = Object.entries(guildTickets).find(([_, t]) => t.userId === interaction.user.id);
                                    const existingChannel = existingEntry ? interaction.guild.channels.cache.get(existingEntry[0]) : null;

                                    if (existingChannel) {
                                        responseMsg.push(`<:Cancel:1473037949187657818> You already have an open ticket: ${existingChannel}`);
                                        errorCount++;
                                    } else {
                                        // Clean stale entry if channel was deleted
                                        if (existingEntry) {
                                            delete guildTickets[existingEntry[0]];
                                        }

                                        // Get support role from ticket config if available
                                        const btnSupportRoleId = ticketsConfig[interaction.guild.id]?.supportRoleId;
                                        const btnPermOverwrites = [
                                            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                                            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                                            { id: interaction.guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
                                        ];
                                        if (btnSupportRoleId) {
                                            btnPermOverwrites.push({ id: btnSupportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
                                        }

                                        const ticketChannel = await interaction.guild.channels.create({
                                            name: ticketName,
                                            type: ChannelType.GuildText,
                                            parent: category,
                                            permissionOverwrites: btnPermOverwrites
                                        });

                                        // Persist ticket to tickets.json (reuse already-loaded config)
                                        if (!ticketsConfig[interaction.guild.id]) {
                                            ticketsConfig[interaction.guild.id] = { tickets: {} };
                                        }
                                        if (!ticketsConfig[interaction.guild.id].tickets) {
                                            ticketsConfig[interaction.guild.id].tickets = {};
                                        }
                                        ticketsConfig[interaction.guild.id].tickets[ticketChannel.id] = {
                                            userId: interaction.user.id,
                                            category: 'button-maker',
                                            categoryLabel: 'Button Maker Ticket',
                                            createdAt: Date.now()
                                        };
                                        jsonStore.write('tickets', ticketsConfig);

                                        // Send professional welcome message with buttons
                                        const ticketButtons = new ActionRowBuilder()
                                            .addComponents(
                                                new ButtonBuilder()
                                                    .setCustomId('ticket_claim')
                                                    .setLabel('Claim Ticket')
                                                    .setStyle(ButtonStyle.Primary)
                                                    .setEmoji('🎫'),
                                                new ButtonBuilder()
                                                    .setCustomId('ticket_close_btn')
                                                    .setLabel('Close Ticket')
                                                    .setStyle(ButtonStyle.Danger)
                                                    .setEmoji('<:Lock:1473038513749491773>'),
                                                new ButtonBuilder()
                                                    .setCustomId('ticket_transcript')
                                                    .setLabel('Save Transcript')
                                                    .setStyle(ButtonStyle.Secondary)
                                                    .setEmoji('<:Clipboardalt:1473039555190849598>')
                                            );

                                        const welcomeContainer = new ContainerBuilder()
                                            .setAccentColor(0xCAD7E6)
                                            .addTextDisplayComponents(
                                                new TextDisplayBuilder()
                                                    .setContent(
                                                        `# 🎫 Support Ticket\n\n` +
                                                        `Welcome ${interaction.user}! Thank you for reaching out.\n\n` +
                                                        `**Created:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n` +
                                                        `Please describe your issue in detail and a team member will assist you shortly.`
                                                    )
                                            )
                                            .addActionRowComponents(ticketButtons);

                                        await ticketChannel.send({
                                            components: [welcomeContainer],
                                            flags: MessageFlags.IsComponentsV2
                                        });

                                        // Send ping message so role + user actually get notified
                                        const btnPingParts = [];
                                        if (btnSupportRoleId) btnPingParts.push(`<@&${btnSupportRoleId}>`);
                                        btnPingParts.push(`${interaction.user}`);
                                        await ticketChannel.send(`${btnPingParts.join(' ')} — A new ticket has been opened!`).catch(() => { });

                                        responseMsg.push(`<:Checkedbox:1473038547165384804> Ticket created: ${ticketChannel}`);
                                        successCount++;
                                    }
                                }
                            }
                            // Moderation actions - these require admin configuration and should not auto-execute on clicker
                            else if (action.type === 'kick' || action.type === 'ban' || action.type === 'timeout') {
                                responseMsg.push(`<:Inforect:1473038624172937287> Moderation action (${action.type}) configured but requires admin setup to specify target user`);
                                successCount++;
                            }
                            // Channel creation
                            else if (action.type === 'create_channel') {
                                if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
                                    responseMsg.push(`<:Cancel:1473037949187657818> Bot needs Manage Channels permission`);
                                    errorCount++;
                                } else {
                                    const channelName = replacePlaceholders(action.channelName);
                                    const channelType = action.channelType === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
                                    const parent = action.categoryId ? interaction.guild.channels.cache.get(action.categoryId) : null;

                                    const newChannel = await interaction.guild.channels.create({
                                        name: channelName,
                                        type: channelType,
                                        parent: parent
                                    });
                                    responseMsg.push(`<:Checkedbox:1473038547165384804> Channel created: ${newChannel}`);
                                    successCount++;
                                }
                            }
                            // Embed action
                            else if (action.type === 'send_embed') {
                                const targetChannel = action.channelId ? interaction.guild.channels.cache.get(action.channelId) : interaction.channel;
                                if (!targetChannel) {
                                    responseMsg.push(`<:Cancel:1473037949187657818> Channel not found`);
                                    errorCount++;
                                } else if (!targetChannel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
                                    responseMsg.push(`<:Cancel:1473037949187657818> No permission to send messages in ${targetChannel}`);
                                    errorCount++;
                                } else if (!targetChannel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.EmbedLinks)) {
                                    responseMsg.push(`<:Cancel:1473037949187657818> No permission to send embeds in ${targetChannel}`);
                                    errorCount++;
                                } else {
                                    const hexColor = action.color?.replace('#', '') || '5865F2';
                                    const color = parseInt(hexColor, 16) || 0x5865F2;

                                    const title = replacePlaceholders(action.title);
                                    const description = replacePlaceholders(action.description);

                                    const embed = new EmbedBuilder()
                                        .setTitle(title)
                                        .setDescription(description)
                                        .setColor(color);

                                    await targetChannel.send({ embeds: [embed] });
                                    responseMsg.push(`<:Checkedbox:1473038547165384804> Embed sent to ${targetChannel}`);
                                    successCount++;
                                }
                            }
                        } catch (actionError) {
                            log.error(`Action error (${action.type}): ${actionError.message}`, actionError);
                            responseMsg.push(`<:Cancel:1473037949187657818> **${action.type}** failed: ${actionError.message.substring(0, 50)}`);
                            errorCount++;
                        }
                    }

                    // If we have ephemeral content from send_message actions, show them directly
                    // instead of the generic "Actions Complete" summary
                    if (isEphemeral && (ephemeralContent.length > 0 || responseEmbeds.length > 0) && errorCount === 0) {
                        // Check if there are ONLY send_message actions (no role/ticket/etc status to show)
                        const hasNonMessageActions = responseMsg.length > 0;

                        if (!hasNonMessageActions && ephemeralContent.length > 0 && responseEmbeds.length === 0) {
                            // Pure text message(s) — show them cleanly as ephemeral
                            await interaction.editReply({
                                content: ephemeralContent.join('\n'),
                                components: [],
                                flags: MessageFlags.Ephemeral
                            });
                        } else if (!hasNonMessageActions && responseEmbeds.length > 0 && ephemeralContent.length === 0) {
                            // Pure embed(s) — show them as ephemeral
                            await interaction.editReply({
                                embeds: responseEmbeds.slice(0, 10),
                                components: [],
                                flags: MessageFlags.Ephemeral
                            });
                        } else if (!hasNonMessageActions && responseEmbeds.length > 0 && ephemeralContent.length > 0) {
                            // Mixed text + embeds
                            await interaction.editReply({
                                content: ephemeralContent.join('\n'),
                                embeds: responseEmbeds.slice(0, 10),
                                components: [],
                                flags: MessageFlags.Ephemeral
                            });
                        } else {
                            // Has other action results too — show combined
                            let content = ephemeralContent.length > 0 ? ephemeralContent.join('\n') : '';
                            if (responseMsg.length > 0) {
                                content += (content ? '\n\n' : '') + responseMsg.join('\n');
                            }
                            const replyPayload = { flags: MessageFlags.Ephemeral };
                            if (content) replyPayload.content = content;
                            if (responseEmbeds.length > 0) replyPayload.embeds = responseEmbeds.slice(0, 10);
                            replyPayload.components = [];
                            await interaction.editReply(replyPayload);
                        }
                    } else {
                        // Build standard response with Components V2 summary
                        let statusEmoji = successCount > 0 ? '<:Checkedbox:1473038547165384804>' : '<:Cancel:1473037949187657818>';
                        let content = `# ${statusEmoji} Button Actions Complete\n\n`;

                        if (btnData.actions.length > 0) {
                            content += `**Summary:** ${successCount} successful, ${errorCount} failed\n\n`;
                        }

                        // Include any ephemeral content that couldn't be shown alone due to errors
                        if (ephemeralContent.length > 0) {
                            content += ephemeralContent.join('\n') + '\n\n';
                        }

                        if (responseMsg.length > 0) {
                            content += responseMsg.join('\n');
                        } else if (ephemeralContent.length === 0) {
                            content += '*No actions configured*';
                        }

                        const container = new ContainerBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder()
                                    .setContent(content)
                            );

                        const editPayload = { components: [container], flags: replyFlags };
                        if (responseEmbeds.length > 0) editPayload.embeds = responseEmbeds.slice(0, 10);
                        await interaction.editReply(editPayload);
                    }
                } catch (error) {
                    log.error(`Button Command: ${error.message}`, error);
                    const errFlags = MessageFlags.IsComponentsV2 | (isEphemeral ? MessageFlags.Ephemeral : 0);
                    const container = new ContainerBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder()
                                .setContent(`# <:Cancel:1473037949187657818> Execution Error\n\nThere was an error executing button actions!\n\n**Error:** ${error.message}\n\nPlease contact an administrator if this persists.`)
                        );

                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ components: [container], flags: errFlags });
                    } else {
                        await interaction.editReply({ components: [container], flags: errFlags });
                    }
                }
                return;
            }

            // Handle giveaway buttons
            if (interaction.customId.startsWith('giveaway_')) {
                const giveawayCmd = client.commands.get('giveaway');
                if (giveawayCmd && giveawayCmd.handleInteraction) {
                    try {
                        const handled = await giveawayCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Giveaway: ${error.message}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred!', flags: MessageFlags.Ephemeral });
                        }
                        return;
                    }
                }
            }

            // Handle poll buttons
            if (interaction.customId.startsWith('poll_vote_') || interaction.customId === 'poll_results' || interaction.customId === 'poll_end') {
                try {
                    let config = jsonStore.read('polls');
                    if (Array.isArray(config)) { config = {}; jsonStore.write('polls', config); }
                    const poll = config[interaction.guild.id]?.[interaction.message.id];

                    if (!poll) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Poll not found!', flags: MessageFlags.Ephemeral });
                    }

                    if (interaction.customId.startsWith('poll_vote_')) {
                        if (poll.ended) {
                            return interaction.reply({ content: '<:Cancel:1473037949187657818> This poll has ended!', flags: MessageFlags.Ephemeral });
                        }

                        const optionIndex = parseInt(interaction.customId.replace('poll_vote_', ''));

                        // Remove previous vote
                        poll.options.forEach(opt => {
                            const voteIndex = opt.votes.indexOf(interaction.user.id);
                            if (voteIndex > -1) opt.votes.splice(voteIndex, 1);
                        });

                        // Add new vote
                        poll.options[optionIndex].votes.push(interaction.user.id);
                        jsonStore.write('polls', config);

                        await interaction.reply({ content: `<:Checkedbox:1473038547165384804> Voted for **${poll.options[optionIndex].text}**!`, flags: MessageFlags.Ephemeral });
                    }

                    else if (interaction.customId === 'poll_results') {
                        const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes.length, 0);
                        const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

                        let resultsText = `# <:Bookopen:1473038576391557130>Poll Results\n\n**${poll.question}**\n\n`;
                        poll.options.forEach((opt, i) => {
                            const percentage = totalVotes > 0 ? ((opt.votes.length / totalVotes) * 100).toFixed(1) : 0;
                            resultsText += `${emojis[i]} **${opt.text}** - ${percentage}% (${opt.votes.length} votes)\n`;
                        });
                        resultsText += `\n**Total Votes:** ${totalVotes}`;

                        const container = new ContainerBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder()
                                    .setContent(resultsText)
                            );

                        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                    }

                    else if (interaction.customId === 'poll_end') {
                        if (interaction.user.id !== poll.hostId && !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                            return interaction.reply({ content: '<:Cancel:1473037949187657818> Only the poll host or moderators can end this poll!', flags: MessageFlags.Ephemeral });
                        }

                        const { endPoll } = require('./commands/automation/poll');
                        await endPoll(client, interaction.guild.id, interaction.message.id);
                        await interaction.reply({ content: '<:Checkedbox:1473038547165384804> Poll ended!', flags: MessageFlags.Ephemeral });
                    }
                } catch (error) {
                    log.error(`Poll: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> There was an error!', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                }
                return;
            }

            // Handle sticky message interactive buttons
            if (interaction.customId.startsWith('sticky_')) {
                try {
                    await handleStickyButtons(interaction);
                } catch (error) {
                    log.error(`Sticky: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> There was an error!', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                }
                return;
            }

            // Handle verification buttons
            if (interaction.customId.startsWith('verification_') || interaction.customId.startsWith('captcha_')) {
                try {
                    await handleVerificationButtons(interaction);
                } catch (error) {
                    log.error(`Verification: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> There was an error!', flags: MessageFlags.Ephemeral });
                    }
                }
                return;
            }

            // Handle profile customization buttons
            if (interaction.customId.startsWith('profile_')) {
                try {
                    await handleProfileButtons(interaction);
                } catch (error) {
                    log.error(`Profile: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> There was an error!', flags: MessageFlags.Ephemeral });
                    }
                }
                return;
            }

            // Handle help menu button from bot mention
            if (interaction.customId === 'show_help_menu') {
                const helpCommand = client.commands.get('help');
                if (helpCommand && helpCommand.execute) {
                    try {
                        await helpCommand.execute(interaction);
                    } catch (error) {
                        log.error(`Help button: ${error.message}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: '<:Cancel:1473037949187657818> There was an error showing the help menu!', flags: MessageFlags.Ephemeral }).catch(() => { });
                        }
                    }
                }
                return;
            }

            // Handle serverlist pagination buttons (slist_first/prev/next/last)
            if (interaction.customId.startsWith('slist_')) {
                if (!isOwner(interaction.user.id)) {
                    return interaction.reply({ content: '<:Cancel:1473037949187657818> This command is only available to the bot owner!', flags: MessageFlags.Ephemeral });
                }

                await interaction.deferUpdate();

                const action = interaction.customId.split('_')[1]; // first|prev|next|last
                // Read current page from the disabled info button label "page/total"
                const infoBtn = interaction.message.components
                    ?.find(r => r.components?.some(c => c.customId === 'slist_info'))
                    ?.components?.find(c => c.customId === 'slist_info');
                const [curStr, totalStr] = (infoBtn?.label || '1/1').split('/');
                const currentPage = parseInt(curStr) || 1;
                const currentTotal = parseInt(totalStr) || 1;

                let page;
                if (action === 'first') page = 1;
                else if (action === 'prev') page = currentPage - 1;
                else if (action === 'next') page = currentPage + 1;
                else if (action === 'last') page = currentTotal;
                else page = currentPage;

                const serverlistCmd = client.commands.get('serverlist');
                const { container, row } = await serverlistCmd.renderPage(interaction.client, page);

                await interaction.editReply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
                return;
            }

            // Handle favorites buttons
            if (interaction.customId.startsWith('favorites_')) {
                const [_, action, pageStr] = interaction.customId.split('_');
                const page = parseInt(pageStr) || 1;

                const favorites = await models.FavoriteSong.find({ userId: interaction.user.id });
                if (!favorites || favorites.length === 0) {
                    return interaction.reply({ content: '<:Cancel:1473037949187657818> You have no favorites saved!', flags: MessageFlags.Ephemeral });
                }

                if (action === 'play' || action === 'shuffle') {
                    if (!interaction.member.voice.channel) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> You need to be in a voice channel to play!', flags: MessageFlags.Ephemeral });
                    }
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                    let player = lavalinkManager.getPlayer(interaction.guild.id);
                    if (!player) {
                        player = await lavalinkManager.createPlayer({
                            guildId: interaction.guild.id,
                            voiceChannelId: interaction.member.voice.channel.id,
                            textChannelId: interaction.channel.id,
                            selfDeaf: true,
                            volume: 100
                        });
                    }
                    if (!player.connected) await player.connect();

                    let tracksToPlay = [...favorites];
                    if (action === 'shuffle') {
                        for (let i = tracksToPlay.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [tracksToPlay[i], tracksToPlay[j]] = [tracksToPlay[j], tracksToPlay[i]];
                        }
                    }

                    let added = 0;
                    for (const fav of tracksToPlay) {
                        try {
                            const result = await player.search({ query: fav.url }, interaction.user);
                            if (result && result.tracks && result.tracks[0]) {
                                player.queue.add(result.tracks[0]);
                                added++;
                            }
                        } catch (e) { }
                    }

                    if (!player.playing && !player.paused && player.queue.tracks.length > 0) {
                        await player.play();
                    }

                    return interaction.editReply({ content: `<:Checkedbox:1473038547165384804> Added **${added}** favorites to queue${action === 'shuffle' ? ' (shuffled)' : ''}!` });
                }

                if (action === 'prev' || action === 'next') {
                    const totalPages = Math.ceil(favorites.length / 10);
                    const newPage = action === 'prev' ? Math.max(1, page - 1) : Math.min(totalPages, page + 1);

                    const start = (newPage - 1) * 10;
                    const pageSongs = favorites.slice(start, start + 10);

                    let content = `# <:Heart:1473038659514007616> Your Favorites\n\n`;
                    content += `-# ${favorites.length} songs saved\n\n`;
                    pageSongs.forEach((song, i) => {
                        const title = (song.title || 'Unknown').substring(0, 40);
                        content += `**${start + i + 1}.** ${title}\n`;
                        content += `-# by ${song.author || 'Unknown'}\n\n`;
                    });
                    content += `-# Page ${newPage}/${totalPages}`;

                    const container = new ContainerBuilder()
                        .setAccentColor(0xCAD7E6)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`favorites_prev_${newPage}`).setEmoji('<:Caretleft:1473038193057333409>').setStyle(ButtonStyle.Secondary).setDisabled(newPage === 1),
                        new ButtonBuilder().setCustomId(`favorites_play_${newPage}`).setEmoji({ id: '1473039269726785737', name: 'Skipnext' }).setLabel('Play All').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`favorites_shuffle_${newPage}`).setEmoji({ id: '1473039298751107213', name: 'Shuffle' }).setLabel('Shuffle').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId(`favorites_next_${newPage}`).setEmoji('<:Skipnext:1473039269726785737>').setStyle(ButtonStyle.Secondary).setDisabled(newPage === totalPages)
                    );
                    container.addActionRowComponents(row);

                    await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                }
                return;
            }

            // Handle recommendations buttons
            if (interaction.customId.startsWith('rec_')) {
                const cache = interaction.client.recommendationCache?.get(interaction.message.id);

                if (!cache || Date.now() > cache.expires) {
                    return interaction.reply({ content: '<:Cancel:1473037949187657818> Recommendations expired. Use `/recommendations` again!', flags: MessageFlags.Ephemeral });
                }

                if (interaction.user.id !== cache.userId) {
                    return interaction.reply({ content: '<:Cancel:1473037949187657818> These recommendations are for someone else!', flags: MessageFlags.Ephemeral });
                }

                if (!interaction.member.voice.channel) {
                    return interaction.reply({ content: '<:Cancel:1473037949187657818> You need to be in a voice channel!', flags: MessageFlags.Ephemeral });
                }

                let player = lavalinkManager.getPlayer(interaction.guild.id);
                if (!player) {
                    player = await lavalinkManager.createPlayer({
                        guildId: interaction.guild.id,
                        voiceChannelId: interaction.member.voice.channel.id,
                        textChannelId: interaction.channel.id,
                        selfDeaf: true,
                        volume: 100
                    });
                }
                if (!player.connected) await player.connect();

                const [__, action, indexStr] = interaction.customId.split('_');

                if (action === 'add' && indexStr === 'all') {
                    for (const track of cache.tracks) {
                        player.queue.add(track);
                    }
                    if (!player.playing && !player.paused) await player.play();
                    return interaction.reply({ content: `<:Checkedbox:1473038547165384804> Added **${cache.tracks.length}** recommendations to queue!`, flags: MessageFlags.Ephemeral });
                }

                const index = parseInt(indexStr);
                if (!isNaN(index) && cache.tracks[index]) {
                    const track = cache.tracks[index];
                    player.queue.add(track);
                    if (!player.playing && !player.paused) await player.play();
                    return interaction.reply({ content: `<:Checkedbox:1473038547165384804> Added **${track.info.title.substring(0, 40)}** to queue!`, flags: MessageFlags.Ephemeral });
                }

                return;
            }

            // Ticket Claim Button
            if (interaction.customId === 'ticket_claim') {
                try {
                    const config = readTicketsConfig();
                    const guildConfig = config[interaction.guild.id];

                    if (!guildConfig) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Ticket system not configured!', flags: MessageFlags.Ephemeral });
                    }

                    const ticketData = guildConfig.tickets?.[interaction.channel.id];
                    if (!ticketData) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> This is not a ticket channel!', flags: MessageFlags.Ephemeral });
                    }

                    if (ticketData.claimedBy) {
                        const claimer = await interaction.guild.members.fetch(ticketData.claimedBy).catch(() => null);
                        return interaction.reply({
                            content: `<:Cancel:1473037949187657818> This ticket is already claimed by ${claimer ? claimer.user.username : 'someone'}!`,
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    // Use role ID directly — guild role cache may be incomplete on large servers
                    const claimSupportRoleId = guildConfig.supportRoleId;
                    const isClaimAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
                    if (claimSupportRoleId && !interaction.member.roles.cache.has(claimSupportRoleId) && !isClaimAdmin) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Only support team members can claim tickets!', flags: MessageFlags.Ephemeral });
                    }

                    ticketData.claimedBy = interaction.user.id;
                    ticketData.claimedAt = Date.now();
                    jsonStore.write('tickets', config);

                    const container = new ContainerBuilder()
                        .setAccentColor(0xCAD7E6)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder()
                                .setContent(
                                    `# 🎫 Ticket Claimed\n\n` +
                                    `This ticket has been claimed by ${interaction.user}.\n\n` +
                                    `They will be assisting you with your inquiry.`
                                )
                        );

                    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                } catch (error) {
                    log.error(`Ticket claim error: ${error.message}`, error);
                    await interaction.reply({ content: '<:Cancel:1473037949187657818> Failed to claim ticket!', flags: MessageFlags.Ephemeral });
                }
                return;
            }

            // Ticket Close Button
            if (interaction.customId === 'ticket_close_btn') {
                try {
                    const config = readTicketsConfig();
                    const guildConfig = config[interaction.guild.id];

                    if (!guildConfig) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Ticket system not configured!', flags: MessageFlags.Ephemeral });
                    }

                    const ticketData = guildConfig.tickets?.[interaction.channel.id];
                    if (!ticketData) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> This is not a ticket channel!', flags: MessageFlags.Ephemeral });
                    }

                    const isSupport = guildConfig.supportRoleId ? interaction.member.roles.cache.has(guildConfig.supportRoleId) : false;
                    const isCloseAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
                    const isTicketOwner = ticketData.userId === interaction.user.id;

                    if (!isSupport && !isCloseAdmin && !isTicketOwner) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Only the ticket owner or support team can close tickets!', flags: MessageFlags.Ephemeral });
                    }

                    const confirmButtons = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('ticket_close_confirm')
                                .setLabel('Confirm Close')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('<:Lock:1473038513749491773>'),
                            new ButtonBuilder()
                                .setCustomId('ticket_close_cancel')
                                .setEmoji({ id: '1473037949187657818', name: 'Cancel' })
                                .setLabel('Cancel')
                                .setStyle(ButtonStyle.Secondary)
                        );

                    const container = new ContainerBuilder()
                        .setAccentColor(0xCAD7E6)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder()
                                .setContent(
                                    `# <:Infotriangle:1473038460456800459> Close Ticket?\n\n` +
                                    `Are you sure you want to close this ticket?\n\n` +
                                    `This action will delete the channel in 5 seconds after confirmation.`
                                )
                        )
                        .addActionRowComponents(confirmButtons);

                    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                } catch (error) {
                    log.error(`Ticket close button error: ${error.message}`, error);
                    await interaction.reply({ content: '<:Cancel:1473037949187657818> Failed to close ticket!', flags: MessageFlags.Ephemeral });
                }
                return;
            }

            // Ticket Close Confirm
            if (interaction.customId === 'ticket_close_confirm') {
                try {
                    const config = readTicketsConfig();
                    const guildConfig = config[interaction.guild.id];
                    const ticketData = guildConfig?.tickets?.[interaction.channel.id];

                    // Abort on stale button — prevents unauthorized channel deletion
                    if (!guildConfig || !ticketData) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Ticket data not found — it may have already been closed!', flags: MessageFlags.Ephemeral });
                    }

                    // Permission check — use role ID directly, not cache lookup
                    const isSupport = guildConfig.supportRoleId ? interaction.member.roles.cache.has(guildConfig.supportRoleId) : false;
                    const isConfirmAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
                    const isTicketOwner = ticketData.userId === interaction.user.id;
                    const isClaimer = ticketData.claimedBy === interaction.user.id;

                    if (!isSupport && !isConfirmAdmin && !isTicketOwner && !isClaimer) {
                        return interaction.reply({
                            content: '<:Cancel:1473037949187657818> Only the ticket owner, support team, or claimer can close this ticket!',
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    delete guildConfig.tickets[interaction.channel.id];
                    jsonStore.write('tickets', config);

                    const container = new ContainerBuilder()
                        .setAccentColor(0xED4245)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder()
                                .setContent(
                                    `# <:Lock:1473038513749491773> Ticket Closed\n\n` +
                                    `Closed by ${interaction.user}\n\n` +
                                    `Channel will be deleted in 5 seconds...`
                                )
                        );

                    await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });

                    setTimeout(() => {
                        interaction.channel.delete().catch(err => log.error(`Failed to delete ticket: ${err.message}`));
                    }, 5000);
                } catch (error) {
                    log.error(`Ticket close confirm error: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> Failed to close ticket!', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                }
                return;
            }

            // Ticket Close Cancel
            if (interaction.customId === 'ticket_close_cancel') {
                await interaction.deferUpdate().catch(() => { });
                await interaction.message.delete().catch(() => { });
                return;
            }

            // Ticket Transcript Button
            if (interaction.customId === 'ticket_transcript') {
                try {
                    const config = readTicketsConfig();
                    const guildConfig = config[interaction.guild.id];
                    const ticketData = guildConfig?.tickets?.[interaction.channel.id];

                    // Permission check — owner, support, or admin only
                    const isTranscriptOwner = ticketData?.userId === interaction.user.id;
                    const isTranscriptSupport = guildConfig?.supportRoleId ? interaction.member.roles.cache.has(guildConfig.supportRoleId) : false;
                    const isTranscriptAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
                    if (!isTranscriptOwner && !isTranscriptSupport && !isTranscriptAdmin) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Only the ticket owner or support team can save transcripts!', flags: MessageFlags.Ephemeral });
                    }

                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                    const messages = await interaction.channel.messages.fetch({ limit: 100 });
                    const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

                    const createdAt = ticketData?.createdAt ? new Date(ticketData.createdAt).toISOString() : 'Unknown';
                    const categoryLabel = ticketData?.categoryLabel || 'N/A';

                    let transcript = `# Ticket Transcript\n`;
                    transcript += `**Channel:** ${interaction.channel.name}\n`;
                    transcript += `**Created:** ${createdAt}\n`;
                    transcript += `**Category:** ${categoryLabel}\n`;
                    if (ticketData?.claimedBy) transcript += `**Claimed By:** <@${ticketData.claimedBy}> (${ticketData.claimedBy})\n`;
                    if (ticketData?.members?.length) transcript += `**Added Members:** ${ticketData.members.map(id => `<@${id}> (${id})`).join(', ')}\n`;
                    transcript += `**Messages:** ${sortedMessages.size}\n\n`;
                    transcript += `---\n\n`;

                    sortedMessages.forEach(msg => {
                        const timestamp = new Date(msg.createdTimestamp).toISOString();
                        const author = msg.author.username;
                        const content = msg.content || '[No text content]';
                        transcript += `**[${timestamp}] ${author}:**\n${content}\n\n`;
                    });

                    const buffer = Buffer.from(transcript, 'utf8');
                    const { AttachmentBuilder: TranscriptAttachment } = require('discord.js');
                    const attachment = new TranscriptAttachment(buffer, { name: `transcript-${interaction.channel.name}.md` });

                    await interaction.editReply({
                        content: '<:Checkedbox:1473038547165384804> Transcript generated!',
                        files: [attachment]
                    });
                } catch (error) {
                    log.error(`Ticket transcript error: ${error.message}`, error);
                    if (interaction.deferred) {
                        await interaction.editReply({ content: '<:Cancel:1473037949187657818> Failed to generate transcript!' });
                    } else {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> Failed to generate transcript!', flags: MessageFlags.Ephemeral });
                    }
                }
                return;
            }

            // Legacy create_ticket button (keep for backwards compatibility)
            if (interaction.customId === 'create_ticket') {
                try {
                    const config = readTicketsConfig();
                    const guildConfig = config[interaction.guild.id];
                    if (!guildConfig) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Ticket system is not configured!', flags: MessageFlags.Ephemeral });
                    }

                    const existingTicket = Object.entries(guildConfig.tickets || {}).find(([_, ticket]) => ticket.userId === interaction.user.id);
                    if (existingTicket) {
                        const existingChannel = interaction.guild.channels.cache.get(existingTicket[0]);
                        if (existingChannel) {
                            return interaction.reply({ content: `<:Cancel:1473037949187657818> You already have an open ticket! ${existingChannel}`, flags: MessageFlags.Ephemeral });
                        } else {
                            // Clean up stale ticket entry for deleted channel
                            delete guildConfig.tickets[existingTicket[0]];
                            jsonStore.write('tickets', config);
                        }
                    }

                    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> I don\'t have permission to create channels! Please contact an administrator.', flags: MessageFlags.Ephemeral });
                    }

                    // Use monotonically incrementing ticket number
                    guildConfig.nextTicketNumber = (guildConfig.nextTicketNumber || Object.keys(guildConfig.tickets || {}).length) + 1;
                    const ticketNumber = guildConfig.nextTicketNumber;
                    const ticketChannelName = `ticket-${interaction.user.username}-${ticketNumber}`;

                    const category = interaction.guild.channels.cache.get(guildConfig.categoryId);
                    if (!category) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Ticket category not found!', flags: MessageFlags.Ephemeral });
                    }

                    const ticketChannel = await interaction.guild.channels.create({
                        name: ticketChannelName,
                        parent: category.id,
                        permissionOverwrites: [
                            {
                                id: interaction.guild.id,
                                deny: ['ViewChannel']
                            },
                            {
                                id: interaction.user.id,
                                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
                            },
                            {
                                id: guildConfig.supportRoleId,
                                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
                            }
                        ]
                    });

                    guildConfig.tickets = guildConfig.tickets || {};
                    guildConfig.tickets[ticketChannel.id] = {
                        userId: interaction.user.id,
                        categoryLabel: 'General',
                        createdAt: Date.now()
                    };
                    jsonStore.write('tickets', config);

                    const ticketButtons = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('ticket_claim')
                                .setLabel('Claim Ticket')
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('🎫'),
                            new ButtonBuilder()
                                .setCustomId('ticket_close_btn')
                                .setLabel('Close Ticket')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('<:Lock:1473038513749491773>'),
                            new ButtonBuilder()
                                .setCustomId('ticket_transcript')
                                .setLabel('Save Transcript')
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji('<:Clipboardalt:1473039555190849598>')
                        );

                    // Build welcome message - use custom if configured, otherwise default
                    const legacyWelcome = guildConfig.welcomeMessage;
                    if (legacyWelcome && ((legacyWelcome.mode === 'embed' && (legacyWelcome.title || legacyWelcome.description)) || (legacyWelcome.mode === 'simple' && legacyWelcome.content))) {
                        const { replacePlaceholders: legReplace, buildPreviewEmbed: legBuildEmbed } = require('./utils/actionMessageBuilder');
                        if (legacyWelcome.mode === 'embed') {
                            const embed = legBuildEmbed(legacyWelcome, interaction.user, interaction.guild, ticketChannel);
                            const container = new ContainerBuilder()
                                .setAccentColor(parseInt((legacyWelcome.color || '#5865F2').replace('#', ''), 16))
                                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                                    `# 🎫 Support Ticket\n**Created:** <t:${Math.floor(Date.now() / 1000)}:R>`
                                ))
                                .addActionRowComponents(ticketButtons);
                            await ticketChannel.send({ embeds: [embed], components: [container], flags: MessageFlags.IsComponentsV2 }).catch(err => {
                                log.error(`Error sending ticket message: ${err.message}`, err);
                            });
                        } else {
                            const customContent = legReplace(legacyWelcome.content, interaction.user, interaction.guild, ticketChannel);
                            const container = new ContainerBuilder()
                                .setAccentColor(0xCAD7E6)
                                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                                    `# 🎫 Support Ticket\n**Created:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n${customContent}`
                                ))
                                .addActionRowComponents(ticketButtons);
                            await ticketChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(err => {
                                log.error(`Error sending ticket message: ${err.message}`, err);
                            });
                        }
                    } else {
                        const container = new ContainerBuilder()
                            .setAccentColor(0xCAD7E6)
                            .addTextDisplayComponents(
                                new TextDisplayBuilder()
                                    .setContent(
                                        `# 🎫 Support Ticket\n\n` +
                                        `Welcome ${interaction.user}! Thank you for reaching out.\n\n` +
                                        `**Created:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n` +
                                        `Please describe your issue in detail. A support team member will assist you shortly.\n\n` +
                                        `Use the buttons below or commands:\n` +
                                        `• \`/ticket-add @user\` - Add someone to ticket\n` +
                                        `• \`/ticket-remove @user\` - Remove someone`
                                    )
                            )
                            .addActionRowComponents(ticketButtons);
                        await ticketChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(err => {
                            log.error(`Error sending ticket message: ${err.message}`, err);
                        });
                    }

                    // Send a separate plain message so role + user actually get pinged
                    const legacyPingParts = [];
                    if (guildConfig.supportRoleId) legacyPingParts.push(`<@&${guildConfig.supportRoleId}>`);
                    legacyPingParts.push(`${interaction.user}`);
                    await ticketChannel.send(`${legacyPingParts.join(' ')} — A new ticket has been opened!`).catch(() => { });

                    await interaction.reply({ content: `<:Checkedbox:1473038547165384804> Ticket created! ${ticketChannel}`, flags: MessageFlags.Ephemeral });
                } catch (error) {
                    log.error(`Legacy ticket creation: ${error.message}`, error);
                    if (!interaction.replied) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> There was an error creating the ticket!', flags: MessageFlags.Ephemeral });
                    }
                }
                return;
            }

            // Handle music control buttons (panel_, music_, filter_, queue_, search_)
            if (interaction.customId.startsWith('music_') || interaction.customId.startsWith('panel_') || interaction.customId.startsWith('filter_') || interaction.customId.startsWith('queue_') || interaction.customId.startsWith('search_') || interaction.customId === 'pause_resume' || interaction.customId === 'skip' || interaction.customId === 'stop') {
                // Compatibility layer: redirect music_* to panel_* for unified handling
                const buttonIdMap = {
                    'music_previous': 'panel_previous',
                    'music_pause_resume': 'panel_pause_resume',
                    'music_skip': 'panel_skip',
                    'music_stop': 'panel_stop',
                    'music_loop': 'panel_loop',
                    'music_shuffle': 'panel_shuffle',
                    'music_autoplay': 'panel_autoplay',
                    'music_filters': 'panel_filters',
                    'music_volume_down': 'panel_volume_down',
                    'music_volume_up': 'panel_volume_up',
                    'music_queue': 'panel_queue',
                    'music_refresh': 'panel_refresh',
                    'music_mute': 'panel_mute',
                    'music_247': 'panel_247'
                };

                const customId = buttonIdMap[interaction.customId] ?? interaction.customId;

                // For search buttons, we don't need player check
                if (customId.startsWith('search_')) {
                    if (interaction.customId === 'search_cancel') {
                        interaction.client.searchResults?.delete(interaction.user.id);
                        return interaction.update({ content: '<:Cancel:1473037949187657818> Search cancelled.', components: [], flags: MessageFlags.Ephemeral });
                    }

                    const searchData = interaction.client.searchResults?.get(interaction.user.id);
                    if (!searchData) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Search results expired! Please search again.', flags: MessageFlags.Ephemeral });
                    }

                    const index = parseInt(interaction.customId.split('_')[2]);
                    const track = searchData.tracks[index];

                    if (!track) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Invalid selection!', flags: MessageFlags.Ephemeral });
                    }

                    await searchData.player.queue.add(track);

                    const container = new ContainerBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder()
                                .setContent(`# <:Music:1473039311057190972> Added to Queue\n**${track.info.title}**\nDuration: ${formatTime(track.info.duration)} | Position: ${searchData.player.queue.tracks.length}`)
                        );

                    if (!searchData.player.playing && !searchData.player.paused) {
                        await searchData.player.play();
                    }

                    interaction.client.searchResults.delete(interaction.user.id);
                    return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                }

                // Handle music panel buttons
                if (customId.startsWith('panel_')) {
                    try {
                        const player = lavalinkManager.getPlayer(interaction.guild.id);
                        const musicPanel = require('./utils/musicPanel');

                        let isMusicPanelMessage = false;
                        if (jsonStore.has('musicpanel')) {
                            try {
                                const panelConfig = jsonStore.read('musicpanel');
                                const guildPanel = panelConfig[interaction.guild.id];
                                if (guildPanel && guildPanel.messageId === interaction.message.id) {
                                    isMusicPanelMessage = true;
                                }
                            } catch (e) { }
                        }

                        const isBotMessage = interaction.message.author?.id === client.user.id;

                        const updateUI = async () => {
                            if (player && player.queue.current) {
                                if (isMusicPanelMessage) {
                                    await updateMusicPanel(client, player, autoplayStatus).catch(() => { });
                                } else if (isBotMessage && interaction.message.editable) {
                                    const container = musicPanel.buildNowPlayingContainer(player, autoplayStatus);
                                    if (container) {
                                        await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch((err) => {
                                            log.warning(`Music UI update failed: ${err.message}`);
                                        });
                                    }
                                }
                            } else if (isMusicPanelMessage) {
                                await updateMusicPanel(client, player, autoplayStatus).catch(() => { });
                            }
                        };

                        // These buttons don't require voice channel
                        const noVoiceRequiredButtons = ['panel_247', 'panel_favorites', 'panel_history', 'panel_queue', 'panel_lyrics', 'panel_grab'];

                        if (!noVoiceRequiredButtons.includes(customId)) {
                            if (!interaction.member.voice.channel) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> You need to be in a voice channel!', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }

                            if (player && player.voiceChannelId && interaction.member.voice.channel.id !== player.voiceChannelId) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> You need to be in the same voice channel as the bot!', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }
                        }

                        if (customId === 'panel_pause_resume') {
                            if (!player || !player.queue.current) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing! Join a voice channel and type a song name.', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }
                            await interaction.deferUpdate().catch(() => { });
                            if (player.paused) {
                                await player.resume();
                            } else {
                                await player.pause();
                            }

                            await updateVoiceChannelStatus(client, player);
                            await updateUI();
                            return;
                        }

                        if (customId === 'panel_skip') {
                            if (!player || !player.queue.current) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing! Join a voice channel and type a song name.', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }

                            await interaction.deferUpdate().catch(() => { });

                            // Check if there are more tracks in the queue
                            if (!player.queue.tracks || player.queue.tracks.length === 0) {
                                // Check 24/7 mode before destroying player
                                let shouldStay = false;
                                if (jsonStore.has('musicpanel-247')) {
                                    const config247 = jsonStore.read('musicpanel-247');
                                    shouldStay = config247[interaction.guild.id]?.enabled || false;
                                }

                                if (shouldStay) {
                                    // Just stop the current track without destroying
                                    await player.stopPlaying();
                                } else {
                                    await player.destroy();
                                }
                                return;
                            }

                            await player.skip();
                            return;
                        }

                        if (customId === 'panel_stop') {
                            if (!player || !player.queue.current) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing! Join a voice channel and type a song name.', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }

                            await interaction.deferUpdate().catch(() => { });

                            let is247Enabled = false;
                            if (jsonStore.has('musicpanel-247')) {
                                const config247 = jsonStore.read('musicpanel-247');
                                is247Enabled = config247[interaction.guild.id]?.enabled || false;
                            }

                            const guildIdForPanel = interaction.guild.id;

                            if (is247Enabled) {
                                // Clear all tracks from queue
                                player.queue.tracks.splice(0, player.queue.tracks.length);
                                // Stop current track
                                await player.stopPlaying();

                                // Set waiting status for 24/7 mode
                                await updateVoiceChannelStatus(client, player, 'waiting');

                                // Update panel to idle state after a short delay
                                setTimeout(async () => {
                                    try {
                                        await updateMusicPanel(client, null, autoplayStatus, guildIdForPanel);
                                    } catch (err) {
                                        log.error(`Panel update after stop: ${err.message}`, err);
                                    }
                                }, 500);
                            } else {
                                await player.destroy();
                                // Panel will auto-update via playerDestroy event
                            }
                            return;
                        }

                        if (customId === 'panel_previous') {
                            if (!player || !player.queue.current) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing! Join a voice channel and type a song name.', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }
                            const previousTrack = player.queue.previous[0];
                            if (!previousTrack) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> No previous track available!', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }
                            await interaction.deferUpdate().catch(() => { });
                            await player.queue.add(previousTrack, 0);
                            await player.skip();
                            return;
                        }

                        if (customId === 'panel_loop') {
                            if (!player || !player.queue.current) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing! Join a voice channel and type a song name.', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }
                            await interaction.deferUpdate().catch(() => { });
                            const modes = ['off', 'track', 'queue'];
                            const currentIndex = modes.indexOf(player.repeatMode || 'off');
                            const nextMode = modes[(currentIndex + 1) % modes.length];
                            player.setRepeatMode(nextMode);
                            await updateUI();
                            return;
                        }

                        if (customId === 'panel_shuffle') {
                            if (!player || !player.queue.current) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing! Join a voice channel and type a song name.', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }
                            if (player.queue.tracks.length < 2) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Not enough tracks to shuffle!', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }
                            await interaction.deferUpdate().catch(() => { });
                            player.queue.shuffle();
                            await updateUI();
                            return;
                        }

                        if (customId === 'panel_autoplay') {
                            if (!player || !player.queue.current) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing! Join a voice channel and type a song name.', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }
                            await interaction.deferUpdate().catch(() => { });
                            const currentStatus = autoplayStatus.get(player.guildId) || false;
                            autoplayStatus.set(player.guildId, !currentStatus);
                            await updateUI();
                            return;
                        }

                        if (customId === 'panel_volume_down') {
                            if (!player || !player.queue.current) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing! Join a voice channel and type a song name.', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }
                            await interaction.deferUpdate().catch(() => { });
                            const newVolume = Math.max(0, player.volume - 10);
                            await player.setVolume(newVolume);
                            await updateUI();
                            return;
                        }

                        if (customId === 'panel_volume_up') {
                            if (!player || !player.queue.current) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing! Join a voice channel and type a song name.', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }
                            await interaction.deferUpdate().catch(() => { });
                            const newVolume = Math.min(200, player.volume + 10);
                            await player.setVolume(newVolume);
                            await updateUI();
                            return;
                        }

                        if (customId === 'panel_mute') {
                            if (!player || !player.queue.current) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing! Join a voice channel and type a song name.', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }
                            await interaction.deferUpdate().catch(() => { });

                            if (player.volume === 0) {
                                const restoreVolume = previousVolume.get(player.guildId) || 100;
                                await player.setVolume(restoreVolume);
                                previousVolume.delete(player.guildId);
                            } else {
                                previousVolume.set(player.guildId, player.volume);
                                await player.setVolume(0);
                            }

                            await updateUI();
                            return;
                        }

                        if (customId === 'panel_queue') {
                            if (!player || !player.queue.current) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing! Join a voice channel and type a song name.', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }

                            const queueCommand = interaction.client.commands.get('queue');
                            if (queueCommand) {
                                return await queueCommand.execute(interaction, lavalinkManager);
                            }
                            return;
                        }

                        if (customId === 'panel_filters') {
                            if (!player || !player.queue.current) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing! Join a voice channel and type a song name.', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }

                            const row1 = new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('filter_bassboost')
                                        .setLabel('Bass Boost')
                                        .setStyle(ButtonStyle.Primary)
                                        .setEmoji('<:Volumeup:1473039290136002844>'),
                                    new ButtonBuilder()
                                        .setCustomId('filter_nightcore')
                                        .setLabel('Nightcore')
                                        .setStyle(ButtonStyle.Primary)
                                        .setEmoji('<:Lightningalt:1473038679906844824>'),
                                    new ButtonBuilder()
                                        .setCustomId('filter_vaporwave')
                                        .setLabel('Vaporwave')
                                        .setStyle(ButtonStyle.Primary)
                                        .setEmoji('🌊'),
                                    new ButtonBuilder()
                                        .setCustomId('filter_8d')
                                        .setLabel('8D Audio')
                                        .setStyle(ButtonStyle.Primary)
                                        .setEmoji('<:Fire:1473038604812161218>')
                                );

                            const row2 = new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('filter_karaoke')
                                        .setLabel('Karaoke')
                                        .setStyle(ButtonStyle.Primary)
                                        .setEmoji('<:Microphone:1473039293088927996>'),
                                    new ButtonBuilder()
                                        .setCustomId('filter_tremolo')
                                        .setLabel('Tremolo')
                                        .setStyle(ButtonStyle.Primary)
                                        .setEmoji('<:Music:1473039311057190972>'),
                                    new ButtonBuilder()
                                        .setCustomId('filter_vibrato')
                                        .setLabel('Vibrato')
                                        .setStyle(ButtonStyle.Primary)
                                        .setEmoji('〰️'),
                                    new ButtonBuilder()
                                        .setCustomId('filter_distortion')
                                        .setLabel('Distortion')
                                        .setStyle(ButtonStyle.Primary)
                                        .setEmoji('<:Bullhorn:1473038903157199093>')
                                );

                            const row3 = new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('filter_soft')
                                        .setLabel('Soft')
                                        .setStyle(ButtonStyle.Secondary)
                                        .setEmoji('🎹'),
                                    new ButtonBuilder()
                                        .setCustomId('filter_pop')
                                        .setLabel('Pop')
                                        .setStyle(ButtonStyle.Secondary)
                                        .setEmoji('<:Music:1473039311057190972>'),
                                    new ButtonBuilder()
                                        .setCustomId('filter_party')
                                        .setLabel('Party')
                                        .setStyle(ButtonStyle.Secondary)
                                        .setEmoji('<:Money:1473377877239140529>'),
                                    new ButtonBuilder()
                                        .setCustomId('filter_electronic')
                                        .setLabel('Electronic')
                                        .setStyle(ButtonStyle.Secondary)
                                        .setEmoji('<:bots:1473368718120849500>')
                                );

                            const row4 = new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('filter_chipmunk')
                                        .setLabel('Chipmunk')
                                        .setStyle(ButtonStyle.Secondary)
                                        .setEmoji('🐿️'),
                                    new ButtonBuilder()
                                        .setCustomId('filter_daycore')
                                        .setLabel('Daycore')
                                        .setStyle(ButtonStyle.Secondary)
                                        .setEmoji('☁️'),
                                    new ButtonBuilder()
                                        .setCustomId('filter_china')
                                        .setLabel('China')
                                        .setStyle(ButtonStyle.Secondary)
                                        .setEmoji('🎎'),
                                    new ButtonBuilder()
                                        .setCustomId('filter_clear')
                                        .setLabel('Clear All')
                                        .setStyle(ButtonStyle.Danger)
                                        .setEmoji('<:Trash:1473038090074591293>')
                                );

                            const container = new ContainerBuilder()
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder()
                                        .setContent(`# <:Fire:1473038604812161218> Audio Filters\n\nSelect a filter to apply to the current track:\n\n**Available Filters:**\n<:Volumeup:1473039290136002844> Bass Boost - Enhanced bass\n<:Lightningalt:1473038679906844824> Nightcore - Sped up and higher pitched\n🌊 Vaporwave - Slowed down and lower pitched\n<:Fire:1473038604812161218> 8D Audio - Surround sound effect\n<:Microphone:1473039293088927996> Karaoke - Reduced vocals\n<:Music:1473039311057190972> Tremolo - Trembling effect\n〰️ Vibrato - Vibrating effect\n<:Bullhorn:1473038903157199093> Distortion - Heavy distortion\n🎹 Soft - Soft sound\n<:Music:1473039311057190972> Pop - Pop music EQ\n<:Money:1473377877239140529> Party - Party bass boost\n<:bots:1473368718120849500> Electronic - Electronic music EQ\n🐿️ Chipmunk - High pitched\n☁️ Daycore - Slow & deep\n🎎 China - Chinese style`)
                                )
                                .addActionRowComponents(row1)
                                .addActionRowComponents(row2)
                                .addActionRowComponents(row3)
                                .addActionRowComponents(row4);

                            return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                        }

                        if (customId === 'panel_247') {
                            let config247 = {};
                            if (jsonStore.has('musicpanel-247')) {
                                config247 = jsonStore.read('musicpanel-247');
                            }

                            const guildId = interaction.guild.id;
                            const isEnabled = config247[guildId]?.enabled || false;

                            if (isEnabled) {
                                await interaction.reply({ content: '<:Refresh:1473037911581528165> 24/7 Mode disabled! Bot will leave when queue is empty.', flags: MessageFlags.Ephemeral });
                                delete config247[guildId];
                                jsonStore.write('musicpanel-247', config247);
                                if (player) await updateUI();
                                return;
                            } else {
                                if (!player || !player.queue.current) {
                                    return await interaction.reply({ content: '<:Cancel:1473037949187657818> Start playing music first, then enable 24/7 mode!', flags: MessageFlags.Ephemeral });
                                }
                                if (!interaction.member.voice.channel) {
                                    return await interaction.reply({ content: '<:Cancel:1473037949187657818> Join a voice channel first to enable 24/7 mode!', flags: MessageFlags.Ephemeral });
                                }
                                await interaction.reply({ content: '<:Refresh:1473037911581528165> 24/7 Mode enabled! Bot will stay in voice channel.', flags: MessageFlags.Ephemeral });
                                config247[guildId] = {
                                    enabled: true,
                                    voiceChannelId: interaction.member.voice.channel.id,
                                    textChannelId: interaction.channel.id,
                                    enabledAt: Date.now()
                                };
                                jsonStore.write('musicpanel-247', config247);
                                await updateUI();
                                return;
                            }
                        }

                        if (customId === 'panel_join') {
                            if (!interaction.member.voice.channel) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Join a voice channel first!', flags: MessageFlags.Ephemeral });
                            }
                            await interaction.deferUpdate().catch(() => { });
                            return await interaction.reply({ content: '🎤 Ready! Type a song name in this channel to play music.', flags: MessageFlags.Ephemeral });
                        }

                        if (customId === 'panel_favorites') {
                            const favoritesCmd = interaction.client.commands.get('favorites');
                            if (favoritesCmd) {
                                return await favoritesCmd.execute(interaction, lavalinkManager);
                            }
                            return await interaction.reply({ content: '<:Heart:1473038659514007616> Use `/favorites` to view your saved songs.', flags: MessageFlags.Ephemeral });
                        }

                        if (customId === 'panel_history') {
                            return await interaction.reply({ content: '📜 Play history feature coming soon!', flags: MessageFlags.Ephemeral });
                        }

                        if (customId === 'panel_like') {
                            if (!player || !player.queue.current) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing!', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }

                            const track = player.queue.current;
                            try {
                                const existing = await models.FavoriteSong.findOne({
                                    userId: interaction.user.id,
                                    url: track.info.uri
                                });

                                if (existing) {
                                    return await interaction.reply({ content: '<:Heart:1473038659514007616> This song is already in your favorites!', flags: MessageFlags.Ephemeral });
                                }

                                await models.FavoriteSong.create({
                                    userId: interaction.user.id,
                                    url: track.info.uri,
                                    title: track.info.title,
                                    author: track.info.author,
                                    duration: track.info.duration,
                                    artworkUrl: track.info.artworkUrl || track.info.thumbnail,
                                    sourceName: track.info.sourceName,
                                    addedAt: new Date().toISOString()
                                });

                                return await interaction.reply({ content: `<:Heart:1473038659514007616> **${track.info.title}** added to favorites!`, flags: MessageFlags.Ephemeral });
                            } catch (err) {
                                log.error(`Like button error: ${err.message}`, err);
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Failed to save to favorites!', flags: MessageFlags.Ephemeral });
                            }
                        }

                        if (customId === 'panel_lyrics') {
                            if (!player || !player.queue.current) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing!', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }

                            const track = player.queue.current;
                            const container = new ContainerBuilder()
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder()
                                        .setContent(`# <:Edit:1473037903625191580> Lyrics\n\n**${track.info.title}**\nby ${track.info.author}\n\n-# Use \`/lyrics\` for full lyrics search functionality\n-# Tip: Search lyrics online for best results`)
                                );

                            return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                        }

                        if (customId === 'panel_seek_back') {
                            if (!player || !player.queue.current) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing!', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }

                            if (player.queue.current.info.duration === 0) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Cannot seek in a live stream!', flags: MessageFlags.Ephemeral });
                            }

                            await interaction.deferUpdate().catch(() => { });
                            const newPosition = Math.max(0, player.position - 10000);
                            await player.seek(newPosition);
                            await updateUI();
                            return;
                        }

                        if (customId === 'panel_seek_forward') {
                            if (!player || !player.queue.current) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing!', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }

                            if (player.queue.current.info.duration === 0) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Cannot seek in a live stream!', flags: MessageFlags.Ephemeral });
                            }

                            await interaction.deferUpdate().catch(() => { });
                            const duration = player.queue.current.info.duration;
                            const newPosition = Math.min(duration - 1000, player.position + 10000);
                            await player.seek(newPosition);
                            await updateUI();
                            return;
                        }

                        if (customId === 'panel_replay') {
                            if (!player || !player.queue.current) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing!', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }

                            await interaction.deferUpdate().catch(() => { });
                            await player.seek(0);
                            await updateUI();
                            return;
                        }

                        if (customId === 'panel_grab') {
                            if (!player || !player.queue.current) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing!', flags: MessageFlags.Ephemeral }).catch(() => { });
                            }

                            const track = player.queue.current;
                            try {
                                const container = new ContainerBuilder()
                                    .addTextDisplayComponents(
                                        new TextDisplayBuilder()
                                            .setContent(
                                                `# <:Download:1473039486727225394> Song Info\n\n` +
                                                `**${track.info.title}**\n` +
                                                `by ${track.info.author}\n\n` +
                                                `**Duration:** ${formatTime(track.info.duration)}\n` +
                                                `**Platform:** ${track.info.sourceName || 'Unknown'}\n` +
                                                `**URL:** ${track.info.uri}\n\n` +
                                                `-# Requested by <@${track.requester?.id || 'Unknown'}>`
                                            )
                                    );

                                await interaction.user.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {
                                    throw new Error('DM failed');
                                });

                                return await interaction.reply({ content: '<:Download:1473039486727225394> Song info sent to your DMs!', flags: MessageFlags.Ephemeral });
                            } catch (err) {
                                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Could not send DM. Make sure your DMs are open!', flags: MessageFlags.Ephemeral });
                            }
                        }
                    } catch (error) {
                        log.error(`Panel: ${error.message}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            return interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred!', flags: MessageFlags.Ephemeral }).catch(() => { });
                        }
                    }
                    return;
                }

                // Handle Leveling System Buttons
                if (interaction.customId.startsWith('levelroles_')) {
                    let levelRoles = {};
                    if (jsonStore.has('levelroles')) {
                        levelRoles = jsonStore.read('levelroles');
                    }
                    const guildRoles = levelRoles[interaction.guild.id] || [];

                    if (interaction.customId === 'levelroles_list') {
                        if (guildRoles.length === 0) {
                            const container = new ContainerBuilder()
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder()
                                        .setContent(`# <:Bookmark:1473038643492028517> Level Roles\n\nNo level roles configured!`)
                                );
                            return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                        }

                        let rolesList = '# <:Bookmark:1473038643492028517> Level Roles\n\n';
                        for (const lr of guildRoles) {
                            const role = interaction.guild.roles.cache.get(lr.roleId);
                            rolesList += `**Level ${lr.level}:** ${role || 'Deleted Role'}\n`;
                        }

                        const container = new ContainerBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder()
                                    .setContent(rolesList)
                            );
                        return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                    }

                    if (interaction.customId === 'levelroles_help') {
                        const container = new ContainerBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder()
                                    .setContent(`# <:Bookmark:1473038643492028517> Level Roles Help\n\n**Commands:**\n• \`-levelroles add <level> @role\` - Add level role reward\n• \`-levelroles remove <level>\` - Remove level role reward\n• \`-levelroles list\` - View all level roles\n\n**Example:**\n\`-levelroles add 10 @VIP\`\nUsers who reach level 10 will get the VIP role!`)
                            );
                        return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                    }
                }

                if (interaction.customId.startsWith('levelmultiplier_')) {
                    let multipliers = {};
                    if (jsonStore.has('levelmultiplier')) {
                        multipliers = jsonStore.read('levelmultiplier');
                    }
                    const guildMultipliers = multipliers[interaction.guild.id] || {};

                    if (interaction.customId === 'levelmultiplier_list') {
                        if (Object.keys(guildMultipliers).length === 0) {
                            const container = new ContainerBuilder()
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder()
                                        .setContent(`# <:Lightningalt:1473038679906844824> XP Multipliers\n\nNo XP multipliers configured!`)
                                );
                            return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                        }

                        let multiplierList = '# <:Lightningalt:1473038679906844824> XP Multipliers\n\n';
                        for (const [roleId, mult] of Object.entries(guildMultipliers)) {
                            const role = interaction.guild.roles.cache.get(roleId);
                            multiplierList += `**${role || 'Deleted Role'}:** ${mult}x XP\n`;
                        }

                        const container = new ContainerBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder()
                                    .setContent(multiplierList)
                            );
                        return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                    }

                    if (interaction.customId === 'levelmultiplier_help') {
                        const container = new ContainerBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder()
                                    .setContent(`# <:Lightningalt:1473038679906844824> XP Multiplier Help\n\n**Commands:**\n• \`-levelmultiplier set @role <multiplier>\` - Set XP multiplier\n• \`-levelmultiplier remove @role\` - Remove multiplier\n• \`-levelmultiplier list\` - View multipliers\n\n**Example:**\n\`-levelmultiplier set @Booster 2.0\`\nBoosters will earn 2x XP!`)
                            );
                        return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                    }
                }

                if (interaction.customId.startsWith('levelchannel_')) {

                    if (interaction.customId === 'levelchannel_disable') {
                        if (!interaction.member.permissions.has('Administrator')) {
                            const container = new ContainerBuilder()
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder()
                                        .setContent(`# <:Cancel:1473037949187657818> No Permission\n\nYou need Administrator permission!`)
                                );
                            return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                        }

                        let levelChannels = {};
                        if (jsonStore.has('levelchannel')) {
                            levelChannels = jsonStore.read('levelchannel');
                        }

                        delete levelChannels[interaction.guild.id];
                        jsonStore.write('levelchannel', levelChannels);

                        // Also update database so the XP handler uses same-channel
                        const { updateGuildConfig: updateGC } = require('./utils/database');
                        await updateGC(interaction.guild.id, {
                            'leveling.announcements.channel': 'same',
                            'leveling.announcements.customChannelId': null,
                            'leveling.announcementChannel': null
                        }).catch(() => { });

                        const container = new ContainerBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder()
                                    .setContent(`# <:Checkedbox:1473038547165384804> Level Channel Disabled\n\nLevel-up announcements will now appear where users level up`)
                            );
                        return await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                    }

                    if (interaction.customId === 'levelchannel_help') {
                        const container = new ContainerBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder()
                                    .setContent(`# <:Bullhorn:1473038903157199093> Level Channel Help\n\n**Commands:**\n• \`-levelchannel set #channel\` - Set announcement channel\n• \`-levelchannel disable\` - Disable channel\n\n**Example:**\n\`-levelchannel set #level-ups\`\nAll level-ups will be announced there!`)
                            );
                        return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                    }
                }

                if (interaction.customId.startsWith('toggleleveling_')) {
                    let toggle = {};
                    if (jsonStore.has('levelingtoggle')) {
                        toggle = jsonStore.read('levelingtoggle');
                    }
                    const guildToggle = toggle[interaction.guild.id];

                    if (interaction.customId === 'toggleleveling_list') {
                        if (!guildToggle || guildToggle.disabledChannels.length === 0) {
                            const container = new ContainerBuilder()
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder()
                                        .setContent(`# <:Refresh:1473037911581528165> Leveling Toggle\n\n**Status:** Enabled in all channels`)
                                );
                            return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                        }

                        let channelList = '# <:Refresh:1473037911581528165> Leveling Toggle\n\n**Disabled Channels:**\n';
                        for (const channelId of guildToggle.disabledChannels) {
                            const channel = interaction.guild.channels.cache.get(channelId);
                            channelList += `• ${channel || 'Deleted Channel'}\n`;
                            if (channelList.length > 3900) {
                                channelList += `*...and more*`;
                                break;
                            }
                        }

                        const container = new ContainerBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder()
                                    .setContent(channelList)
                            );
                        return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                    }

                    if (interaction.customId === 'toggleleveling_help') {
                        const container = new ContainerBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder()
                                    .setContent(`# <:Refresh:1473037911581528165> Leveling Toggle Help\n\n**Commands:**\n• \`-toggleleveling disable #channel\` - Disable XP in channel\n• \`-toggleleveling enable #channel\` - Enable XP in channel\n• \`-toggleleveling list\` - View disabled channels\n\n**Example:**\n\`-toggleleveling disable #bots\`\nNo XP will be earned in #bots!`)
                            );
                        return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                    }

                    if (interaction.customId === 'toggleleveling_toggle') {
                        if (!interaction.member.permissions.has('Administrator')) {
                            const container = new ContainerBuilder()
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder()
                                        .setContent(`# <:Cancel:1473037949187657818> No Permission\n\nYou need Administrator permission!`)
                                );
                            return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                        }

                        if (!toggle[interaction.guild.id]) {
                            toggle[interaction.guild.id] = { enabled: false, disabledChannels: [] };
                        }

                        const wasEnabled = toggle[interaction.guild.id].enabled === true;
                        toggle[interaction.guild.id].enabled = !wasEnabled;
                        jsonStore.write('levelingtoggle', toggle);

                        const { updateGuildConfig: updateGC } = require('./utils/database');
                        await updateGC(interaction.guild.id, { leveling: { ...(await getGuildConfigDb(interaction.guild.id))?.leveling, enabled: !wasEnabled } }).catch(() => { });

                        const newState = !wasEnabled;
                        let content = `# <:Fire:1473038604812161218> Leveling System\n\n`;
                        content += `**Status:** ${newState ? '<:online:1455550955679387743> Enabled' : '<:offline:1455550928282419302> Disabled'}\n\n`;
                        content += `### <:Document:1473039496995143731> Available Commands\n`;
                        content += `> \`-toggleleveling on\` — Enable leveling system\n`;
                        content += `> \`-toggleleveling off\` — Disable leveling system\n`;
                        content += `> \`-toggleleveling enable #channel\` — Re-enable XP in a channel\n`;
                        content += `> \`-toggleleveling disable #channel\` — Disable XP in a channel\n`;
                        content += `> \`-toggleleveling list\` — View disabled channels`;

                        const container = new ContainerBuilder()
                            .setAccentColor(newState ? 0x57F287 : 0xED4245)
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
                            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                            .addActionRowComponents(
                                new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('toggleleveling_list')
                                        .setLabel('View Disabled Channels')
                                        .setStyle(ButtonStyle.Primary)
                                        .setEmoji('<:Document:1473039496995143731>'),
                                    new ButtonBuilder()
                                        .setCustomId('toggleleveling_toggle')
                                        .setLabel(newState ? 'Disable' : 'Enable')
                                        .setStyle(newState ? ButtonStyle.Danger : ButtonStyle.Success)
                                        .setEmoji(newState ? '<:Cancel:1473037949187657818>' : '<:Checkedbox:1473038547165384804>')
                                )
                            );

                        return await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                    }
                }

                if (interaction.customId.startsWith('queue_page_')) {
                    const page = parseInt(interaction.customId.split('_')[2]);
                    const queueCommand = interaction.client.commands.get('queue');
                    if (queueCommand) {
                        interaction.options = {
                            getInteger: () => page
                        };
                        await queueCommand.execute(interaction, lavalinkManager);
                    }
                    return;
                }

                if (interaction.customId === 'queue_clear') {
                    if (!player) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing!', flags: MessageFlags.Ephemeral });
                    }
                    player.queue.tracks.splice(0, player.queue.tracks.length);
                    await interaction.reply({ content: '<:Trash:1473038090074591293> Queue cleared!', flags: MessageFlags.Ephemeral });
                    return;
                }

                if (interaction.customId === 'queue_shuffle') {
                    if (!player || player.queue.tracks.length < 2) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Not enough tracks to shuffle!', flags: MessageFlags.Ephemeral });
                    }
                    player.queue.shuffle();
                    const { buildQueueContainer } = require('./utils/musicPanel');
                    const container = buildQueueContainer(player, 0);
                    await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                    return;
                }

                if (interaction.customId.startsWith('queue_prev_') || interaction.customId.startsWith('queue_next_')) {
                    if (!player) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Nothing is playing!', flags: MessageFlags.Ephemeral });
                    }
                    const parts = interaction.customId.split('_');
                    const currentPage = parseInt(parts[2]) || 0;
                    const newPage = interaction.customId.startsWith('queue_prev_') ? currentPage - 1 : currentPage + 1;
                    const { buildQueueContainer } = require('./utils/musicPanel');
                    const container = buildQueueContainer(player, newPage);
                    await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                    return;
                }

                return;
            }
        }

        if (interaction.isStringSelectMenu()) {
            // Route shop category select menu
            if (interaction.customId === 'shop_cat_select') {
                const shopCmd = client.commands.get('shop');
                if (shopCmd && shopCmd.handleStringSelect) {
                    try {
                        const handled = await shopCmd.handleStringSelect(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Shop Select Error: ${error.message}`, error);
                    }
                }
                return;
            }
            // Route economy leaderboard sort select menu
            if (interaction.customId.startsWith('elb_sort_select_')) {
                const lbCmd = client.commands.get('economy-leaderboard');
                if (lbCmd && lbCmd.handleStringSelect) {
                    try {
                        const handled = await lbCmd.handleStringSelect(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Leaderboard Sort Select Error: ${error.message}`, error);
                    }
                }
                return;
            }
            // Route mines setup select menus (grid size + risk level).
            // Same handler is used for the button click path above.
            if (interaction.customId.startsWith('mines_setup_')) {
                const minesCmd = client.commands.get('mines');
                if (minesCmd && minesCmd.handleMinesInteraction) {
                    try {
                        const handled = await minesCmd.handleMinesInteraction(interaction);
                        if (handled !== false) return;
                    } catch (error) {
                        log.error(`Mines Setup Select Error: ${error.message}`, error);
                    }
                }
                return;
            }
            if (interaction.customId.startsWith('sug_select_')) {
                const suggestionCmd = client.commands.get('suggestion');
                if (suggestionCmd && suggestionCmd.handleInteraction) {
                    try {
                        const handled = await suggestionCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Suggestion Select Error: ${error.message}`, error);
                    }
                }
                return;
            }
            if (interaction.customId.startsWith('automod_')) {
                try {
                    return await handleAutomodSelectMenus(interaction);
                } catch (error) {
                    log.error(`Automod Select Error: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred processing this action.', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                    return;
                }
            }
            if (interaction.customId.startsWith('aichat_')) {
                const aichatCmd = client.commands.get('aichat-setup');
                if (aichatCmd && aichatCmd.handleInteraction) {
                    try {
                        const handled = await aichatCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`AI Chat Select: ${error.message}`, error);
                    }
                }
                return;
            }
            if (interaction.customId === 'rrsetup_select_template') {
                const rrCmd = client.commands.get('reactionroles');
                if (rrCmd && rrCmd.handleSetupInteraction) {
                    try {
                        await rrCmd.handleSetupInteraction(interaction);
                    } catch (error) {
                        log.error(`RR Template Select: ${error.message}`, error);
                    }
                }
                return;
            }
            if (interaction.customId === 'rrsetup_select_removerole') {
                const rrCmd = client.commands.get('reactionroles');
                if (rrCmd && rrCmd.handleSetupSelect) {
                    try {
                        await rrCmd.handleSetupSelect(interaction);
                    } catch (error) {
                        log.error(`RR Setup Select: ${error.message}`, error);
                    }
                }
                return;
            }
            if (interaction.customId.startsWith('ulb_type_')) {
                const ulbCmd = client.commands.get('leaderboard');
                if (ulbCmd && ulbCmd.handleSelectMenu) {
                    try {
                        const handled = await ulbCmd.handleSelectMenu(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Unified Leaderboard Select Error: ${error.message}`, error);
                    }
                }
                return;
            }

            if (interaction.customId === 'rankcard_font_select' || interaction.customId === 'profile_font_select') {
                try {
                    const { isValidFont, FONT_FAMILIES, getCustomFontName } = require('./utils/fontRegistry');
                    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
                    const { updateUserData } = require('./utils/dataManager');
                    const selectedFont = interaction.values[0];
                    const isRankCard = interaction.customId === 'rankcard_font_select';

                    if (selectedFont === '__custom_url__') {
                        const modal = new ModalBuilder()
                            .setCustomId(isRankCard ? 'custom_font_modal_rankcard' : 'custom_font_modal_profile')
                            .setTitle('Custom Font URL');

                        const urlInput = new TextInputBuilder()
                            .setCustomId('font_url')
                            .setLabel('Font URL (.ttf, .otf, .woff, .woff2)')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('https://example.com/fonts/MyFont-Regular.ttf')
                            .setRequired(true)
                            .setMinLength(10)
                            .setMaxLength(500);

                        modal.addComponents(new ActionRowBuilder().addComponents(urlInput));
                        return interaction.showModal(modal);
                    }

                    if (!isValidFont(selectedFont)) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Invalid font selection!', flags: MessageFlags.Ephemeral });
                    }

                    const dataPath = isRankCard ? 'profile.rankCard.fontFamily' : 'profile.profileCard.fontFamily';
                    await updateUserData(interaction.user.id, { [dataPath]: selectedFont });

                    const fontInfo = FONT_FAMILIES[selectedFont];
                    await interaction.update({
                        content: `<:Checkedbox:1473038547165384804> Font changed to **${fontInfo.emoji} ${fontInfo.name}**!\n-# ${fontInfo.description} • Use **Preview** to see how it looks.`,
                        components: []
                    });
                } catch (error) {
                    log.error(`Font Select Error: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> Failed to save font selection.', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                }
                return;
            }

            // Route card style selection for rank card and profile card
            if (interaction.customId === 'rankcard_style_select' || interaction.customId === 'profile_style_select') {
                try {
                    const { updateUserData } = require('./utils/dataManager');
                    const selectedStyle = interaction.values[0];

                    const validStyles = ['Default', 'Minimal', 'Neon', 'Classic', 'Modern'];
                    if (!validStyles.includes(selectedStyle)) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Invalid style selection!', flags: MessageFlags.Ephemeral });
                    }

                    const styleEmojis = { Default: '🎴', Minimal: '◻️', Neon: '💫', Classic: '🏛️', Modern: '🔷' };
                    const dataPath = interaction.customId === 'rankcard_style_select'
                        ? 'profile.rankCard.cardStyle'
                        : 'profile.profileCard.cardStyle';

                    await updateUserData(interaction.user.id, { [dataPath]: selectedStyle });

                    await interaction.update({
                        content: `<:Checkedbox:1473038547165384804> Card style changed to **${styleEmojis[selectedStyle]} ${selectedStyle}**!\n-# Use **Preview** to see how it looks. Custom colors will override theme colors.`,
                        components: []
                    });
                } catch (error) {
                    log.error(`Style Select Error: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> Failed to save style selection.', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                }
                return;
            }

            // Route badge style selection for profile card
            if (interaction.customId === 'profile_badge_select') {
                try {
                    const { updateUserData } = require('./utils/dataManager');
                    const selectedBadge = interaction.values[0];

                    const validBadges = ['Default', 'Compact', 'Detailed', 'Hidden'];
                    if (!validBadges.includes(selectedBadge)) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Invalid badge style!', flags: MessageFlags.Ephemeral });
                    }

                    const badgeEmojis = { Default: '🏅', Compact: '📦', Detailed: '📋', Hidden: '🚫' };
                    await updateUserData(interaction.user.id, { 'profile.profileCard.badgeStyle': selectedBadge });

                    await interaction.update({
                        content: `<:Checkedbox:1473038547165384804> Badge style changed to **${badgeEmojis[selectedBadge]} ${selectedBadge}**!\n-# Use **Preview** to see how badges will appear.`,
                        components: []
                    });
                } catch (error) {
                    log.error(`Badge Select Error: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> Failed to save badge style.', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                }
                return;
            }

            // Route inventory quick-use select menu
            if (interaction.customId === 'inv_use') {
                const invCmd = client.commands.get('inventory');
                if (invCmd && invCmd.handleInteraction) {
                    try {
                        const handled = await invCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Inventory Use Error: ${error.message}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred using that item.', flags: MessageFlags.Ephemeral }).catch(() => { });
                        }
                        return;
                    }
                }
            }
            // Route pets select menus (rarity, group, individual, weapon equip)
            if (interaction.customId.startsWith('pets:')) {
                const petsCmd = client.commands.get('pets');
                if (petsCmd && petsCmd.handleInteraction) {
                    try {
                        const handled = await petsCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Pets Select Error: ${error.message}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred processing this pets action.', flags: MessageFlags.Ephemeral }).catch(() => { });
                        }
                        return;
                    }
                }
            }

            // Handle ticket category selection
            if (interaction.customId === 'ticket_category_select') {
                try {
                    const config = readTicketsConfig();
                    const guildConfig = config[interaction.guild.id];

                    if (!guildConfig) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Ticket system is not configured for this server! Ask an admin to run `/ticket-setup create`', flags: MessageFlags.Ephemeral });
                    }

                    const selectedCategory = interaction.values[0];
                    const categoryInfo = guildConfig.categories?.find(cat => cat.id === selectedCategory);

                    if (!categoryInfo) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Invalid category selected!', flags: MessageFlags.Ephemeral });
                    }

                    const existingTicket = Object.entries(guildConfig.tickets || {}).find(([_, ticket]) => ticket.userId === interaction.user.id);
                    if (existingTicket) {
                        const existingChannel = interaction.guild.channels.cache.get(existingTicket[0]);
                        if (existingChannel) {
                            return interaction.reply({ content: `<:Cancel:1473037949187657818> You already have an open ticket! ${existingChannel}`, flags: MessageFlags.Ephemeral });
                        } else {
                            // Clean up stale ticket entry for deleted channel
                            delete guildConfig.tickets[existingTicket[0]];
                            jsonStore.write('tickets', config);
                        }
                    }

                    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> I don\'t have permission to create channels! Please contact an administrator.', flags: MessageFlags.Ephemeral });
                    }

                    // Use monotonically incrementing ticket number
                    guildConfig.nextTicketNumber = (guildConfig.nextTicketNumber || Object.keys(guildConfig.tickets || {}).length) + 1;
                    const ticketNumber = guildConfig.nextTicketNumber;
                    const ticketChannelName = `ticket-${interaction.user.username}-${ticketNumber}`;

                    const category = interaction.guild.channels.cache.get(guildConfig.categoryId);
                    if (!category) {
                        return interaction.reply({ content: '<:Cancel:1473037949187657818> Ticket category not found! The category may have been deleted.', flags: MessageFlags.Ephemeral });
                    }

                    const ticketChannel = await interaction.guild.channels.create({
                        name: ticketChannelName,
                        parent: category.id,
                        permissionOverwrites: [
                            {
                                id: interaction.guild.id,
                                deny: ['ViewChannel']
                            },
                            {
                                id: interaction.user.id,
                                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
                            },
                            {
                                id: guildConfig.supportRoleId,
                                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
                            }
                        ]
                    });

                    guildConfig.tickets = guildConfig.tickets || {};
                    guildConfig.tickets[ticketChannel.id] = {
                        userId: interaction.user.id,
                        category: selectedCategory,
                        categoryLabel: categoryInfo.label,
                        createdAt: Date.now()
                    };
                    jsonStore.write('tickets', config);

                    const emojiDisplay = categoryInfo.emoji.startsWith('<') ? '' : categoryInfo.emoji + ' ';
                    const labelClean = categoryInfo.label.replace(/<:[^>]+>/g, '').trim();

                    const ticketButtons = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('ticket_claim')
                                .setLabel('Claim Ticket')
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('🎫'),
                            new ButtonBuilder()
                                .setCustomId('ticket_close_btn')
                                .setLabel('Close Ticket')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('<:Lock:1473038513749491773>'),
                            new ButtonBuilder()
                                .setCustomId('ticket_transcript')
                                .setLabel('Save Transcript')
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji('<:Clipboardalt:1473039555190849598>')
                        );

                    // Build welcome message - use custom if configured, otherwise default
                    const welcomeMsg = guildConfig.welcomeMessage;
                    if (welcomeMsg && ((welcomeMsg.mode === 'embed' && (welcomeMsg.title || welcomeMsg.description)) || (welcomeMsg.mode === 'simple' && welcomeMsg.content))) {
                        const { replacePlaceholders: ticketReplace } = require('./utils/actionMessageBuilder');
                        if (welcomeMsg.mode === 'embed') {
                            // Build V2-native text from embed data (embeds + IsComponentsV2 cannot coexist)
                            let embedText = `# 🎫 ${emojiDisplay}${labelClean}\n`;
                            embedText += `**Category:** ${labelClean} | **Created:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n`;
                            if (welcomeMsg.author) {
                                embedText += `*${ticketReplace(welcomeMsg.author, interaction.user, interaction.guild, ticketChannel)}*\n`;
                            }
                            if (welcomeMsg.title) {
                                embedText += `### ${ticketReplace(welcomeMsg.title, interaction.user, interaction.guild, ticketChannel)}\n`;
                            }
                            if (welcomeMsg.description) {
                                embedText += `${ticketReplace(welcomeMsg.description, interaction.user, interaction.guild, ticketChannel)}\n`;
                            }
                            if (welcomeMsg.fields?.length) {
                                embedText += '\n';
                                for (const field of welcomeMsg.fields.slice(0, 25)) {
                                    const fName = ticketReplace(field.name, interaction.user, interaction.guild, ticketChannel);
                                    const fValue = ticketReplace(field.value, interaction.user, interaction.guild, ticketChannel);
                                    embedText += `**${fName}**\n${fValue}\n\n`;
                                }
                            }
                            if (welcomeMsg.footer) {
                                embedText += `\n-# ${ticketReplace(welcomeMsg.footer, interaction.user, interaction.guild, ticketChannel)}`;
                            }
                            const container = new ContainerBuilder()
                                .setAccentColor(parseInt((welcomeMsg.color || '#5865F2').replace('#', ''), 16))
                                .addTextDisplayComponents(new TextDisplayBuilder().setContent(embedText))
                                .addActionRowComponents(ticketButtons);
                            await ticketChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(err => {
                                log.error(`Error sending ticket message: ${err.message}`, err);
                            });
                        } else {
                            const customContent = ticketReplace(welcomeMsg.content, interaction.user, interaction.guild, ticketChannel);
                            const container = new ContainerBuilder()
                                .setAccentColor(0xCAD7E6)
                                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                                    `# 🎫 ${emojiDisplay}${labelClean}\n**Category:** ${labelClean} | **Created:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n${customContent}`
                                ))
                                .addActionRowComponents(ticketButtons);
                            await ticketChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(err => {
                                log.error(`Error sending ticket message: ${err.message}`, err);
                            });
                        }
                    } else {
                        const container = new ContainerBuilder()
                            .setAccentColor(0xCAD7E6)
                            .addTextDisplayComponents(
                                new TextDisplayBuilder()
                                    .setContent(
                                        `# 🎫 ${emojiDisplay}${labelClean}\n\n` +
                                        `Welcome ${interaction.user}! Thank you for reaching out.\n\n` +
                                        `**Category:** ${labelClean}\n` +
                                        `**Created:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n` +
                                        `Please describe your issue in detail. A support team member will assist you shortly.\n\n` +
                                        `Use the buttons below or commands:\n` +
                                        `• \`/ticket-add @user\` - Add someone to ticket\n` +
                                        `• \`/ticket-remove @user\` - Remove someone`
                                    )
                            )
                            .addActionRowComponents(ticketButtons);
                        await ticketChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(err => {
                            log.error(`Error sending ticket message: ${err.message}`, err);
                        });
                    }

                    // Send a separate plain message so role + user actually get pinged
                    const pingParts = [];
                    if (guildConfig.supportRoleId) pingParts.push(`<@&${guildConfig.supportRoleId}>`);
                    pingParts.push(`${interaction.user}`);
                    await ticketChannel.send(`${pingParts.join(' ')} — A new **${labelClean}** ticket has been opened!`).catch(() => { });

                    await interaction.reply({ content: `<:Checkedbox:1473038547165384804> Ticket created! ${ticketChannel}`, flags: MessageFlags.Ephemeral });
                } catch (error) {
                    log.error(`Ticket creation: ${error.message}`, error);
                    if (!interaction.replied) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> There was an error creating the ticket! Please try again.', flags: MessageFlags.Ephemeral });
                    }
                }
                return;
            }

            // Handle my-music select menu
            if (interaction.customId.startsWith('mymusic_')) {
                const myMusicCmd = client.commands.get('my-music');
                if (myMusicCmd && myMusicCmd.handleSelectMenu) {
                    try {
                        const handled = await myMusicCmd.handleSelectMenu(interaction, lavalinkManager);
                        if (handled) return;
                    } catch (error) {
                        log.error(`My Music Select: ${error.message}`, error);
                    }
                }
            }

            // Handle message-builder template select menus
            if (interaction.customId.startsWith('msgbuilder_select_')) {
                const msgBuilderCmd = client.commands.get('message-builder');
                if (msgBuilderCmd && msgBuilderCmd.handleSelectMenu) {
                    try {
                        const handled = await msgBuilderCmd.handleSelectMenu(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Message Builder Select: ${error.message} — ${JSON.stringify(error.rawError?.errors || error.errors || {})}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: '<:Cancel:1473037949187657818> Something went wrong loading that template. Please try again.', flags: MessageFlags.Ephemeral }).catch(() => { });
                        }
                    }
                }
            }

            // Handle welcomer template select menus
            if (interaction.customId.startsWith('welcomer_template_') || interaction.customId.startsWith('welcomer_select_')) {
                const welcomerCmd = client.commands.get('welcomer');
                if (welcomerCmd && welcomerCmd.handleInteraction) {
                    try {
                        const handled = await welcomerCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Welcomer Select: ${error.message}`, error);
                    }
                }
            }

            // Handle ignore-channels select menu
            if (interaction.customId.startsWith('ignorech_')) {
                const ignoreCmd = client.commands.get('ignore-channels');
                if (ignoreCmd && ignoreCmd.handleInteraction) {
                    try {
                        const handled = await ignoreCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Ignore Channels Select: ${error.message}`, error);
                    }
                }
            }

            // Handle botblock select menu
            if (interaction.customId.startsWith('botblock_')) {
                const bbCmd = client.commands.get('botblock');
                if (bbCmd && bbCmd.handleInteraction) {
                    try {
                        const handled = await bbCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Bot Block Select: ${error.message}`, error);
                    }
                }
            }

            // Handle spotify-link select menu
            if (interaction.customId.startsWith('spotlink_')) {
                const spotlinkCmd = client.commands.get('spotify-link');
                if (spotlinkCmd && spotlinkCmd.handleInteraction) {
                    try {
                        const handled = await spotlinkCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Spotify Link Select: ${error.message}`, error);
                    }
                }
            }

            // Handle social-notify select menu
            if (interaction.customId.startsWith('social_')) {
                const socialCmd = client.commands.get('social-notify');
                if (socialCmd && socialCmd.handleInteraction) {
                    try {
                        const handled = await socialCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Social Notify Select: ${error.message}`, error);
                    }
                }
            }

            // Handle booster-notify select menu
            if (interaction.customId.startsWith('booster_')) {
                const boosterCmd = client.commands.get('booster-notify');
                if (boosterCmd && boosterCmd.handleInteraction) {
                    try {
                        const handled = await boosterCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Booster Notify Select: ${error.message}`, error);
                    }
                }
            }

            // Handle apikeys select menu
            if (interaction.customId.startsWith('apikeys_')) {
                const apikeysCmd = client.commands.get('apikeys');
                if (apikeysCmd && apikeysCmd.handleInteraction) {
                    try {
                        const handled = await apikeysCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`API Keys Select: ${error.message}`, error);
                    }
                }
            }

            // Handle bot-customize select menu
            if (interaction.customId.startsWith('botcustom_')) {
                const botCustomCmd = client.commands.get('bot-customize');
                if (botCustomCmd && botCustomCmd.handleInteraction) {
                    try {
                        const handled = await botCustomCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Bot Customize Select: ${error.message}`, error);
                    }
                }
            }

            // Handle giveaway select menu
            if (interaction.customId.startsWith('giveaway_')) {
                const giveawayCmd = client.commands.get('giveaway');
                if (giveawayCmd && giveawayCmd.handleInteraction) {
                    try {
                        const handled = await giveawayCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Giveaway Select: ${error.message}`, error);
                    }
                }
            }

            // Handle select menu command executions (deployed select menus)
            if (interaction.customId.startsWith('select_cmd_')) {
                let isSelectEphemeral = true;
                try {
                    const prefixLength = 'select_cmd_'.length;
                    const afterPrefix = interaction.customId.substring(prefixLength);
                    const firstUnderscorePos = afterPrefix.indexOf('_');

                    if (firstUnderscorePos === -1) {
                        return interaction.reply({
                            content: '<:Cancel:1473037949187657818> Invalid select menu configuration!',
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    const guildId = afterPrefix.substring(0, firstUnderscorePos);
                    const menuId = afterPrefix.substring(firstUnderscorePos + 1);

                    if (!jsonStore.has('select-menus')) {
                        return interaction.reply({
                            content: '<:Cancel:1473037949187657818> Select menu configuration not found!',
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    const menusConfig = jsonStore.read('select-menus');
                    const menuData = menusConfig[guildId]?.[menuId];

                    if (!menuData || !menuData.options) {
                        return interaction.reply({
                            content: '<:Cancel:1473037949187657818> This select menu is no longer configured!',
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    const selectedValues = interaction.values;
                    isSelectEphemeral = menuData.ephemeral !== false;

                    await interaction.deferReply(isSelectEphemeral ? { flags: MessageFlags.Ephemeral } : {});

                    let responseMsg = [];
                    let successCount = 0;
                    let errorCount = 0;

                    // Collect ephemeral message content (used when menu is ephemeral)
                    let ephemeralContent = [];
                    let responseEmbeds = [];

                    const replacePlaceholders = (text) => {
                        if (!text) return text;
                        return text
                            .replace(/{user}/g, interaction.member?.displayName || interaction.user.username)
                            .replace(/{userId}/g, interaction.user.id)
                            .replace(/{userMention}/g, `<@${interaction.user.id}>`)
                            .replace(/{server}/g, interaction.guild.name)
                            .replace(/{membercount}/g, interaction.guild.memberCount.toString())
                            .replace(/{channel}/g, interaction.channel?.name || 'unknown')
                            .replace(/{channelId}/g, interaction.channel?.id || '')
                            .replace(/{channelMention}/g, interaction.channel ? `<#${interaction.channel.id}>` : '#unknown')
                            .replace(/{username}/g, interaction.user.username)
                            .replace(/{discriminator}/g, interaction.user.discriminator || '0')
                            .replace(/{tag}/g, interaction.user.username)
                            .replace(/{avatar}/g, interaction.user.displayAvatarURL({ dynamic: true }))
                            .replace(/{serverIcon}/g, interaction.guild.iconURL({ dynamic: true }) || '')
                            .replace(/{timestamp}/g, `<t:${Math.floor(Date.now() / 1000)}:F>`)
                            .replace(/{date}/g, new Date().toLocaleDateString())
                            .replace(/{time}/g, new Date().toLocaleTimeString())
                            .replace(/{number}/g, Date.now().toString());
                    };

                    for (const selectedValue of selectedValues) {
                        const option = menuData.options.find(o => o.value === selectedValue);
                        if (!option || !option.actions || option.actions.length === 0) {
                            responseMsg.push(`ℹ️ **${option?.label || selectedValue}** - No actions configured`);
                            continue;
                        }

                        for (const action of option.actions) {
                            try {
                                if (action.type === 'add_role') {
                                    const role = interaction.guild.roles.cache.get(action.roleId);
                                    if (!role) {
                                        responseMsg.push(`<:Cancel:1473037949187657818> Role not found`);
                                        errorCount++;
                                    } else if (role.position >= interaction.guild.members.me.roles.highest.position) {
                                        responseMsg.push(`<:Cancel:1473037949187657818> Can't add ${role.name} - too high`);
                                        errorCount++;
                                    } else {
                                        await interaction.member.roles.add(role);
                                        responseMsg.push(`<:Checkedbox:1473038547165384804> Added **${role.name}**`);
                                        successCount++;
                                    }
                                } else if (action.type === 'remove_role') {
                                    const role = interaction.guild.roles.cache.get(action.roleId);
                                    if (!role) {
                                        responseMsg.push(`<:Cancel:1473037949187657818> Role not found`);
                                        errorCount++;
                                    } else if (!interaction.member.roles.cache.has(role.id)) {
                                        responseMsg.push(`ℹ️ You don't have ${role.name}`);
                                        successCount++;
                                    } else {
                                        await interaction.member.roles.remove(role);
                                        responseMsg.push(`<:Checkedbox:1473038547165384804> Removed **${role.name}**`);
                                        successCount++;
                                    }
                                } else if (action.type === 'toggle_role') {
                                    const role = interaction.guild.roles.cache.get(action.roleId);
                                    if (!role) {
                                        responseMsg.push(`<:Cancel:1473037949187657818> Role not found`);
                                        errorCount++;
                                    } else if (role.position >= interaction.guild.members.me.roles.highest.position) {
                                        responseMsg.push(`<:Cancel:1473037949187657818> Can't toggle ${role.name} - too high`);
                                        errorCount++;
                                    } else {
                                        if (interaction.member.roles.cache.has(role.id)) {
                                            await interaction.member.roles.remove(role);
                                            responseMsg.push(`<:Checkedbox:1473038547165384804> Removed **${role.name}**`);
                                        } else {
                                            await interaction.member.roles.add(role);
                                            responseMsg.push(`<:Checkedbox:1473038547165384804> Added **${role.name}**`);
                                        }
                                        successCount++;
                                    }
                                } else if (action.type === 'send_message') {
                                    const hasExplicitChannel = action.channelId && action.channelId !== interaction.channel.id;

                                    if (isSelectEphemeral && !hasExplicitChannel) {
                                        // Ephemeral mode: collect message content to show in the ephemeral reply
                                        if (action.mode === 'embed' && action.embed) {
                                            const embed = new EmbedBuilder();
                                            if (action.embed.title) embed.setTitle(replacePlaceholders(action.embed.title));
                                            if (action.embed.description) embed.setDescription(replacePlaceholders(action.embed.description));
                                            if (action.embed.color) embed.setColor(action.embed.color);
                                            if (action.embed.image) embed.setImage(action.embed.image);
                                            if (action.embed.thumbnail) embed.setThumbnail(action.embed.thumbnail);
                                            if (action.embed.author) embed.setAuthor({ name: replacePlaceholders(action.embed.author), iconURL: action.embed.authorIcon || undefined });
                                            if (action.embed.footer) embed.setFooter({ text: replacePlaceholders(action.embed.footer), iconURL: action.embed.footerIcon || undefined });
                                            if (action.embed.fields?.length > 0) {
                                                embed.addFields(action.embed.fields.map(f => ({ name: replacePlaceholders(f.name), value: replacePlaceholders(f.value), inline: f.inline })));
                                            }
                                            responseEmbeds.push(embed);
                                        } else if (action.message) {
                                            ephemeralContent.push(replacePlaceholders(action.message));
                                        } else if (action.mode === 'components' && action.content) {
                                            ephemeralContent.push(replacePlaceholders(action.content));
                                        } else {
                                            responseMsg.push(`<:Cancel:1473037949187657818> No message content configured`);
                                            errorCount++;
                                            continue;
                                        }
                                        successCount++;
                                    } else {
                                        // Public mode or explicit channel: send to the target channel normally
                                        const targetChannel = hasExplicitChannel ? interaction.guild.channels.cache.get(action.channelId) : interaction.channel;
                                        if (!targetChannel) {
                                            responseMsg.push(`<:Cancel:1473037949187657818> Channel not found`);
                                            errorCount++;
                                        } else {
                                            if (action.mode === 'components' && action.content) {
                                                const accentHex = (action.color || '#5865F2').replace('#', '');
                                                const v2Container = new ContainerBuilder().setAccentColor(parseInt(accentHex, 16));
                                                const resolvedContent = replacePlaceholders(action.content);
                                                if (action.thumbnail) {
                                                    const section = new SectionBuilder()
                                                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(resolvedContent))
                                                        .setThumbnailAccessory(new ThumbnailBuilder().setURL(action.thumbnail));
                                                    v2Container.addSectionComponents(section);
                                                } else {
                                                    v2Container.addTextDisplayComponents(new TextDisplayBuilder().setContent(resolvedContent));
                                                }
                                                if (action.image) {
                                                    v2Container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
                                                    v2Container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(action.image)));
                                                }
                                                if (action.footer) {
                                                    v2Container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
                                                    v2Container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${replacePlaceholders(action.footer)}`));
                                                }
                                                await targetChannel.send({ components: [v2Container], flags: MessageFlags.IsComponentsV2 });
                                            } else if (action.mode === 'embed' && action.embed) {
                                                const embed = new EmbedBuilder();
                                                if (action.embed.title) embed.setTitle(replacePlaceholders(action.embed.title));
                                                if (action.embed.description) embed.setDescription(replacePlaceholders(action.embed.description));
                                                if (action.embed.color) embed.setColor(action.embed.color);
                                                if (action.embed.image) embed.setImage(action.embed.image);
                                                if (action.embed.thumbnail) embed.setThumbnail(action.embed.thumbnail);
                                                if (action.embed.author) embed.setAuthor({ name: replacePlaceholders(action.embed.author), iconURL: action.embed.authorIcon || undefined });
                                                if (action.embed.footer) embed.setFooter({ text: replacePlaceholders(action.embed.footer), iconURL: action.embed.footerIcon || undefined });
                                                if (action.embed.fields?.length > 0) {
                                                    embed.addFields(action.embed.fields.map(f => ({ name: replacePlaceholders(f.name), value: replacePlaceholders(f.value), inline: f.inline })));
                                                }
                                                await targetChannel.send({ embeds: [embed] });
                                            } else if (action.message) {
                                                await targetChannel.send(replacePlaceholders(action.message));
                                            } else {
                                                responseMsg.push(`<:Cancel:1473037949187657818> No message content configured`);
                                                errorCount++;
                                                continue;
                                            }
                                            responseMsg.push(`<:Checkedbox:1473038547165384804> Message sent to ${targetChannel}`);
                                            successCount++;
                                        }
                                    }
                                } else if (action.type === 'send_dm') {
                                    try {
                                        const dmContent = replacePlaceholders(action.message);
                                        if (!dmContent) throw new Error('No DM content');
                                        await interaction.user.send(dmContent);
                                        responseMsg.push(`<:Checkedbox:1473038547165384804> DM sent`);
                                        successCount++;
                                    } catch {
                                        responseMsg.push(`<:Cancel:1473037949187657818> Could not send DM`);
                                        errorCount++;
                                    }
                                } else if (action.type === 'create_ticket') {
                                    const ticketName = replacePlaceholders(action.ticketName || 'ticket-{user}');
                                    const category = action.categoryId ?
                                        interaction.guild.channels.cache.get(action.categoryId) : null;

                                    // Check tickets.json for existing ticket (reliable check)
                                    let ticketsConfig2 = {};
                                    if (jsonStore.has('tickets')) {
                                        ticketsConfig2 = jsonStore.read('tickets');
                                    }
                                    const guildTickets2 = ticketsConfig2[interaction.guild.id]?.tickets || {};
                                    const existingEntry = Object.entries(guildTickets2).find(([_, t]) => t.userId === interaction.user.id);
                                    const existingChannel = existingEntry ? interaction.guild.channels.cache.get(existingEntry[0]) : null;

                                    if (existingChannel) {
                                        responseMsg.push(`ℹ️ You already have a ticket: ${existingChannel}`);
                                    } else {
                                        // Clean stale entry if channel was deleted
                                        if (existingEntry) {
                                            delete guildTickets2[existingEntry[0]];
                                        }

                                        // Get support role from ticket config if available
                                        const selSupportRoleId = ticketsConfig2[interaction.guild.id]?.supportRoleId;
                                        const selPermOverwrites = [
                                            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                                            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                                            { id: interaction.guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
                                        ];
                                        if (selSupportRoleId) {
                                            selPermOverwrites.push({ id: selSupportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
                                        }

                                        const ticketChannel = await interaction.guild.channels.create({
                                            name: ticketName,
                                            type: ChannelType.GuildText,
                                            parent: category,
                                            permissionOverwrites: selPermOverwrites
                                        });

                                        // Persist ticket to tickets.json
                                        if (!ticketsConfig2[interaction.guild.id]) {
                                            ticketsConfig2[interaction.guild.id] = { tickets: {} };
                                        }
                                        if (!ticketsConfig2[interaction.guild.id].tickets) {
                                            ticketsConfig2[interaction.guild.id].tickets = {};
                                        }
                                        ticketsConfig2[interaction.guild.id].tickets[ticketChannel.id] = {
                                            userId: interaction.user.id,
                                            category: 'select-menu-maker',
                                            categoryLabel: 'Select Menu Ticket',
                                            createdAt: Date.now()
                                        };
                                        jsonStore.write('tickets', ticketsConfig2);

                                        // Send welcome message with buttons
                                        const smTicketButtons = new ActionRowBuilder()
                                            .addComponents(
                                                new ButtonBuilder()
                                                    .setCustomId('ticket_claim')
                                                    .setLabel('Claim Ticket')
                                                    .setStyle(ButtonStyle.Primary)
                                                    .setEmoji('🎫'),
                                                new ButtonBuilder()
                                                    .setCustomId('ticket_close_btn')
                                                    .setLabel('Close Ticket')
                                                    .setStyle(ButtonStyle.Danger)
                                                    .setEmoji('<:Lock:1473038513749491773>'),
                                                new ButtonBuilder()
                                                    .setCustomId('ticket_transcript')
                                                    .setLabel('Save Transcript')
                                                    .setStyle(ButtonStyle.Secondary)
                                                    .setEmoji('<:Clipboardalt:1473039555190849598>')
                                            );

                                        const smWelcomeContainer = new ContainerBuilder()
                                            .setAccentColor(0xCAD7E6)
                                            .addTextDisplayComponents(
                                                new TextDisplayBuilder()
                                                    .setContent(
                                                        `# 🎫 Support Ticket\n\n` +
                                                        `Welcome ${interaction.user}! Thank you for reaching out.\n\n` +
                                                        `**Created:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n` +
                                                        `Please describe your issue in detail and a team member will assist you shortly.`
                                                    )
                                            )
                                            .addActionRowComponents(smTicketButtons);

                                        await ticketChannel.send({
                                            components: [smWelcomeContainer],
                                            flags: MessageFlags.IsComponentsV2
                                        }).catch(() => { });

                                        // Send ping message so role + user actually get notified
                                        const selPingParts = [];
                                        if (selSupportRoleId) selPingParts.push(`<@&${selSupportRoleId}>`);
                                        selPingParts.push(`${interaction.user}`);
                                        await ticketChannel.send(`${selPingParts.join(' ')} — A new ticket has been opened!`).catch(() => { });

                                        responseMsg.push(`<:Checkedbox:1473038547165384804> Ticket created: ${ticketChannel}`);
                                        successCount++;
                                    }
                                } else if (action.type === 'send_embed') {
                                    const targetChannel = action.channelId ?
                                        interaction.guild.channels.cache.get(action.channelId) :
                                        interaction.channel;
                                    if (targetChannel) {
                                        const embed = new EmbedBuilder()
                                            .setTitle(replacePlaceholders(action.title))
                                            .setDescription(replacePlaceholders(action.description))
                                            .setColor(action.color || '#bcf1e4');
                                        await targetChannel.send({ embeds: [embed] });
                                        responseMsg.push(`<:Checkedbox:1473038547165384804> Embed sent`);
                                        successCount++;
                                    } else {
                                        responseMsg.push(`<:Cancel:1473037949187657818> Channel not found`);
                                        errorCount++;
                                    }
                                } else if (action.type === 'create_channel') {
                                    const channelName = replacePlaceholders(action.channelName);
                                    const category = action.categoryId ?
                                        interaction.guild.channels.cache.get(action.categoryId) : null;

                                    const newChannel = await interaction.guild.channels.create({
                                        name: channelName,
                                        type: ChannelType.GuildText,
                                        parent: category
                                    });
                                    responseMsg.push(`<:Checkedbox:1473038547165384804> Created ${newChannel}`);
                                    successCount++;
                                }
                            } catch (actionError) {
                                responseMsg.push(`<:Cancel:1473037949187657818> Action failed: ${actionError.message}`);
                                errorCount++;
                            }
                        }
                    }

                    // If we have ephemeral content from send_message actions, show them directly
                    // instead of the generic "Selection Complete" summary
                    if (isSelectEphemeral && (ephemeralContent.length > 0 || responseEmbeds.length > 0) && errorCount === 0) {
                        const hasNonMessageActions = responseMsg.length > 0;

                        if (!hasNonMessageActions && ephemeralContent.length > 0 && responseEmbeds.length === 0) {
                            // Pure text message(s) — show cleanly as ephemeral
                            await interaction.editReply({
                                content: ephemeralContent.join('\n'),
                                components: []
                            });
                        } else if (!hasNonMessageActions && responseEmbeds.length > 0 && ephemeralContent.length === 0) {
                            // Pure embed(s) — show as ephemeral
                            await interaction.editReply({
                                embeds: responseEmbeds.slice(0, 10),
                                components: []
                            });
                        } else if (!hasNonMessageActions && responseEmbeds.length > 0 && ephemeralContent.length > 0) {
                            // Mixed text + embeds
                            await interaction.editReply({
                                content: ephemeralContent.join('\n'),
                                embeds: responseEmbeds.slice(0, 10),
                                components: []
                            });
                        } else {
                            // Has other action results too — show combined
                            let content = ephemeralContent.length > 0 ? ephemeralContent.join('\n') : '';
                            if (responseMsg.length > 0) {
                                content += (content ? '\n\n' : '') + responseMsg.join('\n');
                            }
                            const replyPayload = {};
                            if (content) replyPayload.content = content;
                            if (responseEmbeds.length > 0) replyPayload.embeds = responseEmbeds.slice(0, 10);
                            replyPayload.components = [];
                            await interaction.editReply(replyPayload);
                        }
                    } else {
                        // Build standard response with Components V2 summary
                        let statusEmoji = successCount > 0 ? '<:Checkedbox:1473038547165384804>' : '<:Cancel:1473037949187657818>';
                        let content = `# ${statusEmoji} Selection Complete\n\n`;
                        content += `**Selected:** ${selectedValues.join(', ')}\n`;
                        content += `**Results:** ${successCount} successful, ${errorCount} failed\n\n`;

                        // Include any ephemeral content that couldn't be shown alone due to errors
                        if (ephemeralContent.length > 0) {
                            content += ephemeralContent.join('\n') + '\n\n';
                        }

                        if (responseMsg.length > 0) {
                            content += responseMsg.join('\n');
                        }

                        const container = new ContainerBuilder()
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

                        const editPayload = { components: [container], flags: MessageFlags.IsComponentsV2 };
                        if (responseEmbeds.length > 0) editPayload.embeds = responseEmbeds.slice(0, 10);
                        await interaction.editReply(editPayload);
                    }
                } catch (error) {
                    log.error(`Select Menu Command: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> Error executing menu actions!', flags: isSelectEphemeral ? MessageFlags.Ephemeral : 0 });
                    } else {
                        await interaction.editReply({ content: '<:Cancel:1473037949187657818> Error executing menu actions!' });
                    }
                }
                return;
            }

            // Handle select-menu-maker action select (edit-actions dropdown)
            if (interaction.customId.startsWith('select_action_add:')) {
                const selectMenuCmd = client.commands.get('select-menu-maker');
                if (selectMenuCmd && selectMenuCmd.handleInteraction) {
                    try {
                        const handled = await selectMenuCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Select Menu Maker: ${error.message}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: '<:Cancel:1473037949187657818> Error configuring action!', flags: MessageFlags.Ephemeral }).catch(() => { });
                        }
                    }
                }
                return;
            }

            // Handle quicksetup toggle select menu
            if (interaction.customId === 'quicksetup_toggle') {
                const quicksetupCmd = client.commands.get('quicksetup');
                if (quicksetupCmd && quicksetupCmd.handleInteraction) {
                    try {
                        const handled = await quicksetupCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Quick Setup Select: ${error.message}`, error);
                    }
                }
                return;
            }

            // Handle roletemplate toggle select menu and role select panels
            if (interaction.customId === 'roletemplate_toggle' || interaction.customId.startsWith('rt_select_')) {
                const rtCmd = client.commands.get('roletemplate');
                if (rtCmd && rtCmd.handleInteraction) {
                    try {
                        const handled = await rtCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Role Template Select: ${error.message}`, error);
                    }
                }
                return;
            }

            // Handle anti limit select menu
            if (interaction.customId === 'anti_select_category') {
                const antiCmd = client.commands.get('anti');
                if (antiCmd && antiCmd.handleInteraction) {
                    try {
                        await antiCmd.handleInteraction(interaction);
                    } catch (error) {
                        log.error(`Anti Limit Select: ${error.message}`, error);
                    }
                }
                return;
            }

            // Handle antinuke select menus
            if (interaction.customId === 'antinuke_protection_select' || interaction.customId === 'antinuke_action_select') {
                try {
                    await handleAntiNukeButtons(interaction);
                } catch (error) {
                    log.error(`Anti-Nuke select: ${error.message}`, error);
                    if (!interaction.replied) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> There was an error!', flags: MessageFlags.Ephemeral });
                    }
                }
                return;
            }

            if (interaction.customId === 'help_category') {
                const helpCommand = client.commands.get('help');
                if (helpCommand && helpCommand.handleSelectMenu) {
                    try {
                        await helpCommand.handleSelectMenu(interaction);
                    } catch (error) {
                        log.error(`Help select: ${error.message}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred. Please try using the command again.', flags: MessageFlags.Ephemeral }).catch(() => { });
                        }
                    }
                }
                return;
            }

            if (interaction.customId === 'help_more_options') {
                const helpCommand = client.commands.get('help');
                if (helpCommand && helpCommand.handleMoreOptions) {
                    try {
                        await helpCommand.handleMoreOptions(interaction);
                    } catch (error) {
                        log.error(`Help more options: ${error.message}`, error);
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred. Please try using the command again.', flags: MessageFlags.Ephemeral }).catch(() => { });
                        }
                    }
                }
                return;
            }

            if (interaction.customId === 'embed_template') {
                const embedCommand = client.commands.get('embed-quick');
                if (embedCommand && embedCommand.handleSelectMenu) {
                    await embedCommand.handleSelectMenu(interaction, lavalinkManager);
                }
            }

            if (interaction.customId === 'component_template') {
                const componentCommand = client.commands.get('components-quick');
                if (componentCommand && componentCommand.handleSelectMenu) {
                    await componentCommand.handleSelectMenu(interaction);
                }
            }
        }

        if (interaction.isChannelSelectMenu()) {
            // Feedback system channel selects
            if (interaction.customId === 'fb_select_channel' || interaction.customId === 'fb_select_logs') {
                const feedbackCmd = client.commands.get('feedback');
                if (feedbackCmd && feedbackCmd.handleInteraction) {
                    try {
                        await feedbackCmd.handleInteraction(interaction);
                    } catch (error) {
                        log.error(`Feedback Channel Select Error: ${error.message}`, error);
                    }
                }
                return;
            }
            // Suggestion system channel selects
            if (interaction.customId === 'sug_select_channel' || interaction.customId === 'sug_select_logs') {
                const suggestionCmd = client.commands.get('suggestion');
                if (suggestionCmd && suggestionCmd.handleInteraction) {
                    try {
                        const handled = await suggestionCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Suggestion Channel Select Error: ${error.message}`, error);
                    }
                }
                return;
            }
            // Anti-Nuke channel select menus
            if (interaction.customId.startsWith('antinuke_select_')) {
                const antinukeCmd = client.commands.get('antinuke');
                if (antinukeCmd && antinukeCmd.handleInteraction) {
                    try {
                        const handled = await antinukeCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Anti-Nuke Channel Select: ${error.message}`, error);
                    }
                }
                return;
            }
            // Welcomer / Leave channel select menus — unified handlers in welcomer.js
            if (interaction.customId === 'welcomer_select_channel_unified' || interaction.customId === 'leave_select_channel_unified') {
                const welcomerCmd = client.commands.get('welcomer');
                if (welcomerCmd && welcomerCmd.handleInteraction) {
                    try {
                        const handled = await welcomerCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Welcomer/Leave Channel Select (unified): ${error.message}`, error);
                    }
                }
                return;
            }
            // Welcomer/Leave channel select menus — legacy handlers in interactionHandlers
            if (interaction.customId === 'welcomer_comp_select_channel' || interaction.customId === 'welcomer_select_channel' || interaction.customId === 'leave_select_channel') {
                try {
                    await handleModalSubmit(interaction);
                } catch (error) {
                    log.error(`Welcomer/Leave Channel Select (handlers): ${error.message}`, error);
                }
                return;
            }
            // AutoMod channel select menus (interactionHandlers)
            if (interaction.customId === 'automod_select_log_channel' || interaction.customId === 'automod_select_ignore_channels') {
                try {
                    await handleModalSubmit(interaction);
                } catch (error) {
                    log.error(`AutoMod Channel Select: ${error.message}`, error);
                }
                return;
            }
            if (interaction.customId.startsWith('aichat_')) {
                const aichatCmd = client.commands.get('aichat-setup');
                if (aichatCmd && aichatCmd.handleInteraction) {
                    try {
                        const handled = await aichatCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`AI Chat Channel Select: ${error.message}`, error);
                    }
                }
                return;
            }
            if (interaction.customId === 'rrsetup_select_channel') {
                const rrCmd = client.commands.get('reactionroles');
                if (rrCmd && rrCmd.handleSetupSelect) {
                    try {
                        await rrCmd.handleSetupSelect(interaction);
                    } catch (error) {
                        log.error(`RR Setup Channel Select: ${error.message}`, error);
                    }
                }
                return;
            }

            if (interaction.customId.startsWith('ignorech_')) {
                const ignoreCmd = client.commands.get('ignore-channels');
                if (ignoreCmd && ignoreCmd.handleInteraction) {
                    try {
                        const handled = await ignoreCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Ignore Channels Channel Select: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('botblock_')) {
                const bbCmd = client.commands.get('botblock');
                if (bbCmd && bbCmd.handleInteraction) {
                    try {
                        const handled = await bbCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Bot Block Channel Select: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('app_select_')) {
                const appCmd = client.commands.get('application');
                if (appCmd && appCmd.handleInteraction) {
                    try {
                        await appCmd.handleInteraction(interaction);
                    } catch (error) {
                        log.error(`Application Channel Select: ${error.message}`, error);
                    }
                }
                return;
            }
            if (interaction.customId.startsWith('social_')) {
                const socialCmd = client.commands.get('social-notify');
                if (socialCmd && socialCmd.handleInteraction) {
                    try {
                        const handled = await socialCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Social Notify Channel Select: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('booster_')) {
                const boosterCmd = client.commands.get('booster-notify');
                if (boosterCmd && boosterCmd.handleInteraction) {
                    try {
                        const handled = await boosterCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Booster Notify Channel Select: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('sticky_')) {
                try {
                    await handleStickyButtons(interaction);
                } catch (error) {
                    log.error(`Sticky Channel Select: ${error.message}`, error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: '<:Cancel:1473037949187657818> There was an error!', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                }
                return;
            }
        }

        if (interaction.isRoleSelectMenu()) {
            // Anti-Nuke role select menus
            if (interaction.customId.startsWith('antinuke_select_')) {
                const antinukeCmd = client.commands.get('antinuke');
                if (antinukeCmd && antinukeCmd.handleInteraction) {
                    try {
                        const handled = await antinukeCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Anti-Nuke Role Select: ${error.message}`, error);
                    }
                }
                return;
            }
            // Welcomer autorole select menus — unified handlers in welcomer.js
            if (interaction.customId === 'welcomer_select_autorole_humans_unified' || interaction.customId === 'welcomer_select_autorole_bots_unified') {
                const welcomerCmd = client.commands.get('welcomer');
                if (welcomerCmd && welcomerCmd.handleInteraction) {
                    try {
                        const handled = await welcomerCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Welcomer AutoRole Select (unified): ${error.message}`, error);
                    }
                }
                return;
            }
            // Welcomer autorole select menus — legacy handlers in handleWelcomerButtons
            if (interaction.customId === 'welcomer_select_autorole_humans' || interaction.customId === 'welcomer_select_autorole_bots') {
                try {
                    await handleWelcomerButtons(interaction);
                } catch (error) {
                    log.error(`Welcomer AutoRole Select (handlers): ${error.message}`, error);
                }
                return;
            }
            // AutoMod role select menus (interactionHandlers)
            if (interaction.customId === 'automod_select_bypass_role' || interaction.customId === 'automod_select_ignore_roles') {
                try {
                    await handleModalSubmit(interaction);
                } catch (error) {
                    log.error(`AutoMod Role Select: ${error.message}`, error);
                }
                return;
            }
            if (interaction.customId.startsWith('app_select_')) {
                const appCmd = client.commands.get('application');
                if (appCmd && appCmd.handleInteraction) {
                    try {
                        await appCmd.handleInteraction(interaction);
                    } catch (error) {
                        log.error(`Application Role Select: ${error.message}`, error);
                    }
                }
                return;
            }
            if (interaction.customId.startsWith('ignorech_')) {
                const ignoreCmd = client.commands.get('ignore-channels');
                if (ignoreCmd && ignoreCmd.handleInteraction) {
                    try {
                        const handled = await ignoreCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Ignore Channels Role Select: ${error.message}`, error);
                    }
                }
            }
            if (interaction.customId.startsWith('social_')) {
                const socialCmd = client.commands.get('social-notify');
                if (socialCmd && socialCmd.handleInteraction) {
                    try {
                        const handled = await socialCmd.handleInteraction(interaction);
                        if (handled) return;
                    } catch (error) {
                        log.error(`Social Notify Role Select: ${error.message}`, error);
                    }
                }
            }
        }
        return;
    }

    // Block slash commands in music panel channel (only panel buttons allowed there)
    if (interaction.guild) {
        if (jsonStore.has('musicpanel')) {
            try {
                const panelConfig = jsonStore.read('musicpanel');
                const guildPanel = panelConfig[interaction.guild.id];
                if (guildPanel && interaction.channel.id === guildPanel.channelId) {
                    return interaction.reply({
                        content: '<:Cancel:1473037949187657818> Commands are disabled in the music panel channel. Just type a song name or URL to play music!',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => { });
                }
            } catch (e) { }
        }
    }

    // Check if channel is ignored for slash commands
    if (interaction.guild) {
        const ignoreChannelsCmd = client.commands.get('ignore-channels');
        if (ignoreChannelsCmd) {
            const ignoreConfig = ignoreChannelsCmd.getGuildConfig(interaction.guild.id);
            const categoryId = interaction.channel?.parentId || null;

            if (ignoreChannelsCmd.isChannelIgnored(interaction.guild.id, interaction.channel.id, categoryId)) {
                if (!ignoreChannelsCmd.canBypass(interaction.member, ignoreConfig)) {
                    return interaction.reply({
                        content: '<:Commentblock:1473370739351490794> **Commands Disabled**\n\nBot commands are disabled in this channel.',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => { });
                }
            }
        }
    }

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    // Block all slash commands in DMs — bot is server-only
    if (!interaction.guild) {
        return interaction.reply({ content: '<:Cancel:1473037949187657818> This bot only works in servers. Please use commands in a server, not in DMs.', flags: MessageFlags.Ephemeral }).catch(() => { });
    }

    if (command.premiumOnly && !premiumManager.hasPremiumAccess(interaction.user.id, interaction.guild?.id)) {
        return interaction.reply({ content: '<:Cancel:1473037949187657818> This feature requires **Premium**. Use `redeemkey` to activate or ask an admin to activate server premium.', flags: MessageFlags.Ephemeral }).catch(() => { });
    }

    // ── Bot Permission Pre-Check ──
    if (interaction.guild) {
        const cmdName = interaction.commandName;
        const permCheck = checkBotPermissions(interaction.guild, interaction.channel, cmdName);
        if (!permCheck.allowed) {
            return notifyMissingPermissionsSlash(interaction, cmdName, permCheck.missing);
        }
    }

    // ── Slash Command Cooldown Check (Premium users bypass) ──
    if (interaction.guild && !premiumManager.hasPremiumAccess(interaction.user.id, interaction.guild.id)) {
        const slashCooldown = botCustomize.getCooldown(interaction.guild.id);
        if (slashCooldown > 0) {
            const cdKey = `${interaction.guild.id}_${interaction.user.id}_${interaction.commandName}`;
            const now = Date.now();
            if (!client._cmdCooldowns) client._cmdCooldowns = new Map();
            const lastUsed = client._cmdCooldowns.get(cdKey) || 0;
            if (now - lastUsed < slashCooldown * 1000) {
                const remaining = ((slashCooldown * 1000 - (now - lastUsed)) / 1000).toFixed(1);
                return interaction.reply({ content: `<:Timer:1473039056710406204> Please wait **${remaining}s** before using \`/${interaction.commandName}\` again.`, flags: MessageFlags.Ephemeral }).catch(() => { });
            }
            client._cmdCooldowns.set(cdKey, now);
        }
    }

    // ── Apply Guild Customization to Slash Responses ──
    if (interaction.guild) {
        const _gCfg = botCustomize.getConfig(interaction.guild.id);
        const _gColor = botCustomize.getEmbedColor(interaction.guild.id);

        // Attach for commands that want direct access
        interaction._guildAccentColor = _gColor;
        interaction._guildFooterText = _gCfg.footerText;
        interaction._guildFooterIcon = _gCfg.footerIcon;

        const _patchOpts = (opts) => {
            if (typeof opts === 'string') opts = { content: opts };
            if (!opts) opts = {};
            // Ephemeral injection
            if (_gCfg.ephemeralResponses) {
                opts.flags = (opts.flags || 0) | MessageFlags.Ephemeral;
            }
            // Accent color on Components V2 containers (type 17)
            if (opts.components && Array.isArray(opts.components)) {
                for (const c of opts.components) {
                    if (c?.data?.type === 17 && c.data.accent_color === undefined) {
                        c.data.accent_color = _gColor;
                    }
                }
            }
            // Embed color + footer
            if (opts.embeds && Array.isArray(opts.embeds)) {
                for (const e of opts.embeds) {
                    const d = e?.data ?? e;
                    if (d && d.color === undefined) d.color = _gColor;
                    if (d && !d.footer && _gCfg.footerText) {
                        d.footer = { text: _gCfg.footerText };
                        if (_gCfg.footerIcon) d.footer.icon_url = _gCfg.footerIcon;
                    }
                }
            }
            return opts;
        };

        const _origReply = interaction.reply.bind(interaction);
        const _origFollowUp = interaction.followUp.bind(interaction);
        const _origEditReply = interaction.editReply.bind(interaction);
        const _origDeferReply = interaction.deferReply.bind(interaction);
        interaction.reply = (o) => _origReply(_patchOpts(o));
        interaction.followUp = (o) => _origFollowUp(_patchOpts(o));
        interaction.editReply = (o) => _origEditReply(_patchOpts(o));
        interaction.deferReply = (o) => {
            o = o || {};
            if (_gCfg.ephemeralResponses) o.flags = (o.flags || 0) | MessageFlags.Ephemeral;
            return _origDeferReply(o);
        };
    }

    try {
        trackCommand(interaction.commandName, interaction.user.id, interaction.guildId);
        await command.execute(interaction, client.lavalinkManager);
    } catch (error) {
        // ── Handle permission errors specifically ──
        if (isPermissionError(error)) {
            const perms = inferPermissionsFromCommand(interaction.commandName, command.category);
            await notifyMissingPermissionsSlash(interaction, interaction.commandName, perms);
            return;
        }

        log.error(`Command error (${interaction.commandName}): ${error.message}`, error);

        // Log error to designated channel
        await logError(client, error, {
            type: 'Slash Command Error',
            command: `/${interaction.commandName}`,
            user: interaction.user,
            guild: interaction.guild,
            channel: interaction.channel
        });

        try {
            const errorId = generateErrorId();
            await sendErrorReply(interaction, 'There was an error executing this command!', errorId);
        } catch (replyError) {
            // Reply error
        }
    }
});

// Voice Greeting System
client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
        if (!oldState.member || oldState.member.user?.bot) return;

        const isJoin = !oldState.channelId && newState.channelId;
        const isLeave = oldState.channelId && !newState.channelId;
        const isSwitch = oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId;

        if (!isJoin && !isLeave && !isSwitch) return;

        if (!jsonStore.has('voiceautorole')) return;
        const config = jsonStore.read('voiceautorole');
        const guildId = newState.guild.id || oldState.guild.id;
        const guildConfig = config[guildId];

        if (!guildConfig || !guildConfig.enabled || !guildConfig.voiceChannelId) return;

        const targetChannelId = guildConfig.voiceChannelId;

        // Only trigger for the configured voice channel
        const isTargetJoin = (isJoin || isSwitch) && newState.channelId === targetChannelId;
        const isTargetLeave = (isLeave || isSwitch) && oldState.channelId === targetChannelId;
        if (!isTargetJoin && !isTargetLeave) return;

        // Auto-reconnect: create player if it doesn't exist
        let player = client.lavalinkManager.getPlayer(guildId);
        if (!player || !player.connected) {
            try {
                player = client.lavalinkManager.createPlayer({
                    guildId: guildId,
                    voiceChannelId: targetChannelId,
                    textChannelId: guildConfig.textChannelId || targetChannelId,
                    selfDeaf: true
                });
                if (!player.connected) await player.connect();
            } catch (err) {
                log.debug(`Voice greet auto-reconnect failed: ${err.message}`);
                return;
            }
        }

        // Read guild language config
        let lang = 'en';
        if (jsonStore.has('guilds')) {
            try {
                const guilds = jsonStore.read('guilds');
                const g = guilds.find(x => x.guild_id === guildId);
                if (g?.speak?.default_lang) lang = g.speak.default_lang;
            } catch { }
        }

        const memberName = newState.member?.displayName || oldState.member?.displayName || 'Someone';
        const leaveName = oldState.member?.displayName || 'Someone';

        const welcomeTexts = {
            'en': `Welcome, ${memberName}. Nice to see you.`,
            'hi': `${memberName} जी, आपका स्वागत है।`,
            'es': `Bienvenido, ${memberName}. Qué gusto verte.`,
            'fr': `Bienvenue, ${memberName}. Ravi de vous voir.`,
            'de': `Willkommen, ${memberName}. Schön dich zu sehen.`,
            'ja': `${memberName}さん、いらっしゃいませ。`,
            'ko': `${memberName}님, 환영합니다.`,
            'pt': `Bem-vindo, ${memberName}. Bom te ver.`,
            'ru': `Добро пожаловать, ${memberName}.`,
            'ar': `مرحبا ${memberName}. سعيد برؤيتك.`,
            'bn': `স্বাগতম, ${memberName}।`,
            'ta': `வரவேற்கிறோம், ${memberName}.`,
            'te': `స్వాగతం, ${memberName}.`,
            'mr': `स्वागत, ${memberName}.`,
            'gu': `આવકાર, ${memberName}.`,
            'pa': `ਜੀ ਆਇਆ ਨੂੰ, ${memberName}.`,
            'ur': `${memberName} جی، خوش آمدید۔`
        };
        const leaveTexts = {
            'en': `Goodbye, ${leaveName}. Have a great day.`,
            'hi': `अलविदा, ${leaveName} जी। आपका दिन शुभ हो।`,
            'es': `Adiós, ${leaveName}. Que tengas un gran día.`,
            'fr': `Au revoir, ${leaveName}. Bonne journée.`,
            'de': `Tschüss, ${leaveName}. Schönen Tag noch.`,
            'ja': `${leaveName}さん、さようなら。`,
            'ko': `${leaveName}님, 안녕히 가세요.`,
            'pt': `Tchau, ${leaveName}. Tenha um bom dia.`,
            'ru': `До свидания, ${leaveName}. Хорошего дня.`,
            'ar': `مع السلامة ${leaveName}. يوم سعيد.`,
            'bn': `বিদায়, ${leaveName}। ভালো থাকবেন।`,
            'ta': `பிரியாவிடை, ${leaveName}.`,
            'te': `వీడ్కోలు, ${leaveName}.`,
            'mr': `निरोप, ${leaveName}.`,
            'gu': `આવજો, ${leaveName}.`,
            'pa': `ਅਲਵਿਦਾ, ${leaveName}.`,
            'ur': `خدا حافظ، ${leaveName} جی۔`
        };

        let text = '';
        // Use the correct text for the configured language, fallback to English
        if (isTargetJoin) {
            text = welcomeTexts[lang] || welcomeTexts['en'];
        } else if (isTargetLeave) {
            text = leaveTexts[lang] || leaveTexts['en'];
        }

        if (!text) return;

        // Determine TTS language code - must match the language of the text
        const textLang = welcomeTexts[lang] ? lang : 'en';
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${textLang}&client=gtx`;

        // Try to play TTS through Lavalink
        async function tryPlay(url) {
            try {
                const res = await player.search({ query: url }, client.user);
                if (res.tracks?.length) {
                    const track = res.tracks[0];
                    track.isSpeakCmd = true;
                    await player.queue.add(track);
                    if (!player.playing && !player.paused) await player.play();
                    return true;
                }
            } catch { }
            try {
                const res = await player.search({ query: url, source: 'http' }, client.user);
                if (res.tracks?.length) {
                    const track = res.tracks[0];
                    track.isSpeakCmd = true;
                    await player.queue.add(track);
                    if (!player.playing && !player.paused) await player.play();
                    return true;
                }
            } catch { }
            return false;
        }

        let played = await tryPlay(ttsUrl);

        // Fallback to StreamElements TTS (English-only but very reliable with Lavalink)
        if (!played) {
            const fallbackUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=${encodeURIComponent(text.substring(0, 200))}`;
            played = await tryPlay(fallbackUrl);
        }

        if (!played) {
            log.debug(`VoiceGreet: All TTS providers failed for guild ${guildId}`);
        }
    } catch (e) {
        log.debug(`VoiceGreet handler error: ${e.message}`);
    }
});

client.on('messageCreate', async (message) => {
    // Handle Bot-Blocked Channels (auto-delete all bot messages including xNico)
    if (message.author.bot && message.guild) {
        try {
            if (jsonStore.has('botblock')) {
                const botBlockConfig = jsonStore.read('botblock');
                const guildBlock = botBlockConfig[message.guild.id];
                if (guildBlock?.enabled !== false) {
                    const blockedChannels = guildBlock?.channels || [];
                    if (blockedChannels.includes(message.channel.id)) {
                        await message.delete().catch(() => { });
                        return;
                    }
                }
            }
        } catch (e) { }
        return; // All other bot messages — ignore
    }
    if (message.author.bot) return;

    // ═══════ Bot Ignore Module (Dashboard Integration) ═══════
    if (message.guild) {
        try {
            const biCfg = jsonStore.has('botignore-config') ? jsonStore.read('botignore-config')[message.guild.id] : null;
            if (biCfg && biCfg.enabled) {
                const isCh = (biCfg.ignoredChannels || []).includes(message.channel.id);
                const isUser = (biCfg.ignoredUsers || []).includes(message.author.id);
                const isRole = message.member && (biCfg.ignoredRoles || []).some(r => message.member.roles.cache.has(r));
                
                // Allow admins/owner to bypass
                const isBypassed = message.member?.permissions.has(PermissionFlagsBits.Administrator) || message.author.id === process.env.OWNER_ID;
                
                if ((isCh || isUser || isRole) && !isBypassed) {
                    if (!biCfg.ignorePrefix) {
                        return; // Ignore entirely (automod, leveling, events, everything)
                    } else {
                        // Ignore prefix only
                        const guildPrefix = getGuildPrefix(message.guild.id);
                        if (message.content.startsWith(guildPrefix)) {
                            return; // Ignore the command
                        }
                    }
                }
            }
        } catch (e) {}
    }
    // Handle DMs — only allow commands that explicitly support DMs
    if (!message.guild) {
        const dmPrefix = process.env.PREFIX || '-';
        if (!message.content.startsWith(dmPrefix)) return;
        const dmArgs = message.content.slice(dmPrefix.length).trim().split(/\s+/);
        const dmCmdName = dmArgs.shift()?.toLowerCase();
        if (!dmCmdName) return;
        const dmCmd = client.commands.get(dmCmdName);
        if (!dmCmd || !dmCmd.dmAllowed || typeof dmCmd.executePrefix !== 'function') return;
        try {
            dmCmd._guildPrefix = dmPrefix;
            await dmCmd.executePrefix(message, dmArgs, lavalinkManager, client);
        } catch (e) {
            log.error('[DM Prefix]', e.message);
        }
        return;
    }

    // Save the ORIGINAL channel.send before any patches so fallbacks never include a message_reference.
    const _safeFallbackSend = message.channel.send.bind(message.channel);

    // Helper: strip discord.js reply-reference fields and fall back to a plain channel.send.
    const _sendWithoutRef = async (options) => {
        try {
            if (typeof options === 'string') return await _safeFallbackSend({ content: options });
            // Remove any fields that discord.js or callers might add that create a message_reference
            const { nonce: _n, tts: _t, reply: _r, messageReference: _mr, ...rest } = (options || {});
            return await _safeFallbackSend(rest);
        } catch (_) { /* suppress — nothing more we can do */ }
    };

    // Patch message.reply to gracefully handle deleted messages (MESSAGE_REFERENCE_UNKNOWN_MESSAGE).
    // If the original message was deleted before the bot replies, fall back to a plain channel.send.
    const _originalReply = message.reply.bind(message);
    message.reply = async function safeReply(options) {
        try {
            return await _originalReply(options);
        } catch (err) {
            // Discord error 10008 = Unknown Message; 50035 = Invalid Form Body with message_reference
            const isUnknownRef =
                err?.code === 10008 ||
                (err?.code === 50035 && err?.message?.includes('message_reference'));
            if (isUnknownRef) {
                return await _sendWithoutRef(options); // always return, never re-throw ref errors
            }
            throw err;
        }
    };

    // Debug: show listener count and process id to detect duplicate instances
    try {
        // console.log(`[DEBUG] messageCreate invoked. pid=${process.pid} listeners=${client.listenerCount('messageCreate')}`);
    } catch (e) { }

    // Auto-delete messages in music panel channels (keep channel clean)
    const panelChannelId = musicPanelChannelCache.get(message.guild.id);
    if (panelChannelId && message.channel.id === panelChannelId) {
        setTimeout(() => {
            message.delete().catch(() => { });
        }, 3000); // Delete after 3 seconds so user can see their message briefly
    }

    // Suggestion channel — intercept plain messages and start confirmation flow
    try {
        const suggestionCmd = client.commands.get('suggestion');
        if (suggestionCmd?.handleMessage) {
            const handled = await suggestionCmd.handleMessage(message);
            if (handled) return; // Message consumed — stop further processing
        }
    } catch (sugErr) {
        log.error('Suggestion handleMessage error:', sugErr);
    }

    // Command Ignoring System
    if (jsonStore.has('ignored-channels')) {
        try {
            const ignored = jsonStore.read('ignored-channels');
            const guildIgnored = ignored[message.guild.id];
            if (guildIgnored) {
                const isIgnored = guildIgnored.channels.includes(message.channel.id) ||
                    (message.channel.parentId && guildIgnored.categories.includes(message.channel.parentId));

                if (isIgnored) {
                    // COMPLETELY STOP ALL BOT PROCESSING IN IGNORED CHANNELS
                    return;
                }
            }
        } catch (e) { }
    }

    const guildId = message.guild?.id;

    // ═══════ AI Chat — responds in configured channel (skip if message is a prefix command) ═══════
    try {
        const aiChatAllConfig = jsonStore.read('aichat');
        const aiChatConfig = aiChatAllConfig?.[guildId];

        if (aiChatConfig?.enabled && aiChatConfig.channelId === message.channel.id) {
            // Only process AI chat if it's NOT a prefix command
            const aiChatPrefix = getGuildPrefix(guildId);
            const isAiChatPrefixCommand = message.content.startsWith(aiChatPrefix);

            if (!isAiChatPrefixCommand && message.content.trim().length > 0) {
                try {
                    await message.channel.sendTyping();

                    const response = await generateAIResponse(message.content, message.channel.id, {
                        model: aiChatConfig.model || 'llama-3.3-70b-versatile',
                        maxTokens: aiChatConfig.maxTokens || 1024,
                        systemPrompt: aiChatConfig.systemPrompt || '',
                        metadata: {
                            botName: message.client.user?.username || 'xNico',
                            guildName: message.guild?.name || 'this server',
                            prefix: aiChatPrefix,
                            ownerId: process.env.OWNER_ID,
                            supportServer: process.env.SUPPORT_SERVER || 'https://discord.gg/Zs35X7Umak',
                            websiteUrl: process.env.BOT_WEBSITE || 'https://thenico.vercel.app'
                        }
                    });

                    if (response) {
                        // Split long responses
                        const chunks = response.match(/[\s\S]{1,2000}/g) || [response];
                        for (const chunk of chunks) {
                            await message.reply({
                                content: chunk,
                                allowedMentions: { repliedUser: false }
                            });
                        }
                    }
                } catch (e) {
                    log.error(`AI chat error in ${guildId}: ${e.message}`);
                    await message.reply({ content: '❌ AI is temporarily unavailable. Please try again later.', allowedMentions: { repliedUser: false } }).catch(() => { });
                }
                return; // Don't process further if AI channel
            }
        }
    } catch (e) {
        log.error(`Error loading AI chat config: ${e.message}`);
    }

    // ═══════ AutoMod — runs FIRST before any other handler (like Discord's native AutoMod) ═══════
    const automodConfig = automodCache.get(guildId);
    let automodBlocked = false;

    if (automodConfig?.enabled && message.content) {
        const isIgnored = automodConfig.ignoredRoles?.some(roleId => message.member?.roles.cache.has(roleId)) ||
            automodConfig.ignoredChannels?.includes(message.channel.id) ||
            message.member?.permissions.has('Administrator') ||
            (automodConfig.bypassRoleId && message.member?.roles.cache.has(automodConfig.bypassRoleId));

        if (!isIgnored) {
            const content = message.content;
            const contentLower = content.toLowerCase();

            // Collect ALL violations (don't short-circuit — check every filter like Discord AutoMod)
            const violations = [];

            // ── Bad Words Filter ──
            if (automodConfig.badWords?.enabled && automodConfig.badWords.words?.length > 0) {
                for (const word of automodConfig.badWords.words) {
                    const wordLower = word.toLowerCase().trim();
                    if (!wordLower) continue;

                    // Use word-boundary matching: match whole words, or phrases if the word contains spaces
                    // Also match words embedded with leetspeak-style separators
                    try {
                        const escaped = wordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(`(?:^|[^a-zA-Z0-9])${escaped}(?:[^a-zA-Z0-9]|$)`, 'i');
                        if (regex.test(contentLower) || contentLower === wordLower) {
                            violations.push({
                                filter: 'badWords',
                                action: automodConfig.badWords.action || 'delete',
                                reason: `Bad word detected: ||${wordLower}||`
                            });
                            break; // One bad word is enough
                        }
                    } catch (e) {
                        // Fallback for invalid regex: exact substring match for multi-word phrases
                        if (contentLower.includes(wordLower)) {
                            violations.push({
                                filter: 'badWords',
                                action: automodConfig.badWords.action || 'delete',
                                reason: `Bad word detected`
                            });
                            break;
                        }
                    }
                }
            }

            // ── Spam Filter ──
            if (automodConfig.spam?.enabled) {
                const userId = message.author.id;
                const key = `${guildId}-${userId}`;
                const now = Date.now();
                const timeWindow = automodConfig.spam.timeWindow || 5000;
                const messageLimit = automodConfig.spam.messageLimit || 5;

                if (!spamTracker.has(key)) {
                    spamTracker.set(key, []);
                }

                const userMessages = spamTracker.get(key);
                userMessages.push(now);

                // Clean old entries inline
                const recentMessages = userMessages.filter(time => now - time < timeWindow);
                spamTracker.set(key, recentMessages);

                if (recentMessages.length >= messageLimit) {
                    violations.push({
                        filter: 'spam',
                        action: automodConfig.spam.action || 'timeout',
                        reason: `Spam detected (${recentMessages.length} msgs in ${timeWindow / 1000}s)`
                    });
                }

                // Periodic spamTracker cleanup to prevent memory leaks
                if (spamTracker.size > 500) {
                    const cleanupNow = Date.now();
                    for (const [trackerKey, msgs] of spamTracker.entries()) {
                        const recent = msgs.filter(t => cleanupNow - t < 30000);
                        if (recent.length === 0) spamTracker.delete(trackerKey);
                        else spamTracker.set(trackerKey, recent);
                    }
                }
            }

            // ── Link Filter ──
            if (automodConfig.links?.enabled) {
                const urlRegex = /https?:\/\/[^\s<]+|www\.[^\s<]+|[a-zA-Z0-9][-a-zA-Z0-9]*\.(com|net|org|io|gg|tv|me|co|xyz|info|online|site|tech|dev|app|live|pro|cc|ru|cn|tk|ml|ga|cf|gq|pw|top|club|vip|ws|link|click|download|stream|fun|icu|buzz|monster|rest|hair|sbs|cfd)(?:[\/\?#][^\s]*)?/gi;
                const urls = content.match(urlRegex);

                if (urls && urls.length > 0) {
                    const whitelist = automodConfig.links.whitelist || [];
                    let hasBlockedLink = false;

                    if (whitelist.length === 0) {
                        // No whitelist = block all links
                        hasBlockedLink = true;
                    } else {
                        // Check each URL against whitelist
                        for (const url of urls) {
                            const urlLower = url.toLowerCase();
                            const isAllowed = whitelist.some(domain => {
                                const domainLower = domain.toLowerCase().trim();
                                // Match the domain anywhere in the URL
                                return urlLower.includes(domainLower);
                            });
                            if (!isAllowed) {
                                hasBlockedLink = true;
                                break;
                            }
                        }
                    }

                    if (hasBlockedLink) {
                        violations.push({
                            filter: 'links',
                            action: automodConfig.links.action || 'delete',
                            reason: 'Unauthorized link detected'
                        });
                    }
                }
            }

            // ── Discord Invite Filter ──
            if (automodConfig.invites?.enabled) {
                // Comprehensive invite regex: covers discord.gg, discord.com/invite, discordapp.com/invite, dsc.gg, invite.gg
                const inviteRegex = /(discord\.gg|discord(?:app)?\.com\/invite|dsc\.gg|invite\.gg|discord\.me)\/[a-zA-Z0-9-]+/gi;
                if (inviteRegex.test(content)) {
                    violations.push({
                        filter: 'invites',
                        action: automodConfig.invites.action || 'delete',
                        reason: 'Discord invite link detected'
                    });
                }
            }

            // ── Mass Mention Filter ──
            if (automodConfig.massMention?.enabled) {
                const mentionLimit = automodConfig.massMention.limit || 5;
                // Count user mentions + role mentions + @everyone/@here
                const userMentions = message.mentions.users.size;
                const roleMentions = message.mentions.roles.size;
                const everyoneMention = message.mentions.everyone ? 1 : 0;
                const totalMentions = userMentions + roleMentions + everyoneMention;

                if (totalMentions >= mentionLimit) {
                    violations.push({
                        filter: 'massMention',
                        action: automodConfig.massMention.action || 'delete',
                        reason: `Mass mention detected (${totalMentions} mentions)`
                    });
                }
            }

            // ── Excessive Caps Filter ──
            if (automodConfig.caps?.enabled) {
                const minLength = automodConfig.caps.minLength || 10;
                const capsPercentage = automodConfig.caps.percentage || 70;
                // Only check letters (ignore numbers, spaces, symbols)
                const letters = content.replace(/[^a-zA-Z]/g, '');

                if (letters.length >= minLength) {
                    const upperCount = (content.match(/[A-Z]/g) || []).length;
                    const ratio = (upperCount / letters.length) * 100;

                    if (ratio >= capsPercentage) {
                        violations.push({
                            filter: 'caps',
                            action: automodConfig.caps.action || 'delete',
                            reason: `Excessive caps (${Math.round(ratio)}%)`
                        });
                    }
                }
            }

            // ═══════ Process violations ═══════
            if (violations.length > 0) {
                // Use the most severe action from all violations
                const severityOrder = { 'warn': 0, 'delete': 1, 'timeout': 2, 'kick': 3, 'ban': 4 };
                violations.sort((a, b) => (severityOrder[b.action] || 0) - (severityOrder[a.action] || 0));
                const primary = violations[0];
                const action = primary.action;
                const allReasons = violations.map(v => v.reason).join(' | ');

                // Preserve message data before destructive actions
                const savedContent = content.substring(0, 1000);
                const savedAuthorTag = message.author.username;
                const savedAuthorId = message.author.id;
                const savedAuthor = message.author;
                const savedChannel = message.channel;
                const savedMember = message.member;
                const savedGuild = message.guild;

                try {
                    // Delete message for all destructive actions
                    if (action === 'delete' || action === 'timeout' || action === 'kick' || action === 'ban') {
                        await message.delete().catch(() => { });
                        automodBlocked = true; // Block further message processing
                    }

                    // Execute action
                    if (action === 'warn') {
                        const warnMsg = await savedChannel.send({
                            content: `<:Infotriangle:1473038460456800459> <@${savedAuthorId}>, your message was flagged by AutoMod. Reason: ${allReasons}`,
                        }).catch(() => null);
                        if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => { }), 8000);
                    } else if (action === 'delete') {
                        const delMsg = await savedChannel.send({
                            content: `<:Shield:1473038669831995494> <@${savedAuthorId}>, your message was removed by AutoMod. Reason: ${allReasons}`,
                        }).catch(() => null);
                        if (delMsg) setTimeout(() => delMsg.delete().catch(() => { }), 5000);
                    } else if (action === 'timeout' && savedMember) {
                        await savedMember.timeout(5 * 60 * 1000, allReasons).catch(e => log.error('AutoMod timeout: ' + e.message));
                        const timeoutMsg = await savedChannel.send({
                            content: `<:Shield:1473038669831995494> <@${savedAuthorId}> has been timed out for 5 minutes. Reason: ${allReasons}`,
                        }).catch(() => null);
                        if (timeoutMsg) setTimeout(() => timeoutMsg.delete().catch(() => { }), 10000);
                    } else if (action === 'kick' && savedMember) {
                        await savedMember.kick(allReasons).catch(e => log.error('AutoMod kick: ' + e.message));
                        await savedChannel.send(`<:Shield:1473038669831995494> **${savedAuthorTag}** has been kicked by AutoMod. Reason: ${allReasons}`).catch(() => { });
                    } else if (action === 'ban' && savedMember) {
                        await savedMember.ban({ reason: allReasons, deleteMessageSeconds: 60 }).catch(e => log.error('AutoMod ban: ' + e.message));
                        await savedChannel.send(`<:Shield:1473038669831995494> **${savedAuthorTag}** has been banned by AutoMod. Reason: ${allReasons}`).catch(() => { });
                    }

                    // ── Log to log channel ──
                    if (automodConfig.logChannel) {
                        const logCh = savedGuild.channels.cache.get(automodConfig.logChannel);
                        if (logCh) {
                            const violationList = violations.map(v => `• **${v.filter}** — ${v.reason}`).join('\n');
                            const logContainer = new ContainerBuilder()
                                .setAccentColor(action === 'ban' ? 0xFF0000 : action === 'kick' ? 0xFF6600 : action === 'timeout' ? 0xFFA500 : 0xFFCC00)
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder()
                                        .setContent(
                                            `# <:Shield:1473038669831995494> AutoMod Action\n\n` +
                                            `**User:** ${savedAuthorTag} (<@${savedAuthorId}>)\n` +
                                            `**Channel:** <#${savedChannel.id}>\n` +
                                            `**Action:** \`${action.toUpperCase()}\`\n\n` +
                                            `### Violations\n${violationList}\n\n` +
                                            `### Message Content\n\`\`\`\n${savedContent.substring(0, 500)}${savedContent.length > 500 ? '...' : ''}\n\`\`\`\n` +
                                            `-# <t:${Math.floor(Date.now() / 1000)}:R>`
                                        )
                                );
                            await logCh.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
                        }
                    }

                    // ── Webhook: AutoMod violation log ──
                    try {
                        const AUTOMOD_WEBHOOK = 'https://discord.com/api/webhooks/1457415882190880944/_iJ_4EqDIEHYKKzl1V881VsAMBGTFE_zaVGuMcM2_jwml7gU1resxTnYWr_YdAa-Hysd';
                        const violationListWh = violations.map(v => `• **${v.filter}** — ${v.reason}`).join('\n');
                        const actionColors = { ban: 0xFF0000, kick: 0xFF6600, timeout: 0xFFA500, delete: 0xFFCC00, warn: 0xFFEE00 };
                        const automodWhEmbed = {
                            title: '🛡️  AutoMod Triggered',
                            color: actionColors[action] || 0xFFCC00,
                            thumbnail: { url: savedAuthor.displayAvatarURL?.({ dynamic: true, size: 256 }) || '' },
                            fields: [
                                { name: '🏷️ Server', value: `\`${savedGuild.name}\` (\`${savedGuild.id}\`)`, inline: false },
                                { name: '👤 User', value: `${savedAuthorTag} (<@${savedAuthorId}>)`, inline: true },
                                { name: '📌 Channel', value: `<#${savedChannel.id}>`, inline: true },
                                { name: '⚡ Action Taken', value: `\`${action.toUpperCase()}\``, inline: true },
                                { name: '📋 Violations', value: violationListWh || 'N/A', inline: false },
                                { name: '💬 Message Content', value: `\`\`\`\n${savedContent.substring(0, 300)}${savedContent.length > 300 ? '...' : ''}\n\`\`\``, inline: false },
                            ],
                            footer: { text: `Server Members: ${savedGuild.memberCount.toLocaleString()}` },
                            timestamp: new Date().toISOString()
                        };
                        fetch(AUTOMOD_WEBHOOK, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ username: client.user.username, avatar_url: client.user.displayAvatarURL({ size: 256 }), embeds: [automodWhEmbed] })
                        }).catch(err => log.error(`AutoMod webhook failed: ${err.message}`));
                    } catch (e) { }
                } catch (error) {
                    log.error(`AutoMod action error (${action}): ${error.message}`);
                }

                // If message was deleted, stop all further processing
                if (automodBlocked) return;
            }
        }
    }

    // ═══════ Standalone Anti-Spam (antispam.json) — separate from AutoMod ═══════
    if (!automodBlocked) {
        try {
            if (jsonStore.has('antispam')) {
                const antispamConfig = jsonStore.read('antispam');
                const spamCfg = antispamConfig[guildId];

                if (spamCfg?.enabled && !message.member?.permissions.has('Administrator')) {
                    const isSpamWhitelisted = (spamCfg.whitelistedRoles || []).some(roleId => message.member?.roles.cache.has(roleId)) ||
                        (spamCfg.whitelistedChannels || []).includes(message.channel.id);

                    if (!isSpamWhitelisted) {
                        const userId = message.author.id;
                        const now = Date.now();
                        const filters = spamCfg.filters || {};
                        let triggered = null;
                        let reason = '';

                        // --- Message Spam (rate-based) ---
                        if (!triggered && filters.messageSpam?.enabled) {
                            const key = `antispam-msg-${guildId}-${userId}`;
                            const timeWindow = filters.messageSpam.interval || 5000;
                            const limit = filters.messageSpam.maxMessages || 5;
                            if (!spamTracker.has(key)) spamTracker.set(key, []);
                            const arr = spamTracker.get(key);
                            arr.push(now);
                            const recent = arr.filter(t => now - t < timeWindow);
                            spamTracker.set(key, recent);
                            if (recent.length >= limit) { triggered = 'Message Spam'; reason = `${recent.length} messages in ${timeWindow / 1000}s`; spamTracker.delete(key); }
                        }

                        // --- Emoji Spam ---
                        if (!triggered && filters.emojiSpam?.enabled && message.content) {
                            const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic}|<a?:\w+:\d+>)/gu;
                            const emojis = message.content.match(emojiRegex);
                            if (emojis && emojis.length > (filters.emojiSpam.maxEmojis || 10)) {
                                triggered = 'Emoji Spam'; reason = `${emojis.length} emojis (max: ${filters.emojiSpam.maxEmojis || 10})`;
                            }
                        }

                        // --- CAPS Spam ---
                        if (!triggered && filters.capsSpam?.enabled && message.content) {
                            const text = message.content.replace(/[^a-zA-Z]/g, '');
                            const minLen = filters.capsSpam.minLength || 10;
                            const maxPct = filters.capsSpam.maxPercent || 70;
                            if (text.length >= minLen) {
                                const upper = text.replace(/[^A-Z]/g, '').length;
                                const pct = (upper / text.length) * 100;
                                if (pct > maxPct) { triggered = 'CAPS Spam'; reason = `${Math.round(pct)}% uppercase (max: ${maxPct}%)`; }
                            }
                        }

                        // --- Link Spam ---
                        if (!triggered && filters.linkSpam?.enabled && message.content) {
                            const urlRegex = /https?:\/\/[^\s<]+/gi;
                            const links = message.content.match(urlRegex) || [];
                            const whitelist = (filters.linkSpam.whitelistedDomains || []).map(d => d.toLowerCase());
                            const nonWhitelisted = links.filter(url => {
                                try { const host = new URL(url).hostname.toLowerCase(); return !whitelist.some(d => host === d || host.endsWith('.' + d)); } catch { return true; }
                            });
                            if (nonWhitelisted.length > (filters.linkSpam.maxLinks || 3)) {
                                triggered = 'Link Spam'; reason = `${nonWhitelisted.length} links (max: ${filters.linkSpam.maxLinks || 3})`;
                            }
                        }

                        // --- Image Spam (rate-based) ---
                        if (!triggered && filters.imageSpam?.enabled) {
                            const imageCount = message.attachments.filter(a => a.contentType?.startsWith('image/')).size + (message.embeds?.filter(e => e.image || e.thumbnail).length || 0);
                            if (imageCount > 0) {
                                const key = `antispam-img-${guildId}-${userId}`;
                                const tw = filters.imageSpam.interval || 10000;
                                if (!spamTracker.has(key)) spamTracker.set(key, []);
                                const arr = spamTracker.get(key);
                                for (let i = 0; i < imageCount; i++) arr.push(now);
                                const recent = arr.filter(t => now - t < tw);
                                spamTracker.set(key, recent);
                                if (recent.length > (filters.imageSpam.maxImages || 3)) { triggered = 'Image Spam'; reason = `${recent.length} images in ${tw / 1000}s`; spamTracker.delete(key); }
                            }
                        }

                        // --- Sticker Spam (rate-based) ---
                        if (!triggered && filters.stickerSpam?.enabled && message.stickers?.size > 0) {
                            const key = `antispam-stk-${guildId}-${userId}`;
                            const tw = filters.stickerSpam.interval || 10000;
                            if (!spamTracker.has(key)) spamTracker.set(key, []);
                            const arr = spamTracker.get(key);
                            for (let i = 0; i < message.stickers.size; i++) arr.push(now);
                            const recent = arr.filter(t => now - t < tw);
                            spamTracker.set(key, recent);
                            if (recent.length > (filters.stickerSpam.maxStickers || 3)) { triggered = 'Sticker Spam'; reason = `${recent.length} stickers in ${tw / 1000}s`; spamTracker.delete(key); }
                        }

                        // --- Mention Spam ---
                        if (!triggered && filters.mentionSpam?.enabled) {
                            const mentionCount = (message.mentions.users?.size || 0) + (message.mentions.roles?.size || 0);
                            if (mentionCount > (filters.mentionSpam.maxMentions || 5)) {
                                triggered = 'Mention Spam'; reason = `${mentionCount} mentions (max: ${filters.mentionSpam.maxMentions || 5})`;
                            }
                        }

                        // --- Duplicate Spam (rate-based) ---
                        if (!triggered && filters.duplicateSpam?.enabled && message.content) {
                            const key = `antispam-dup-${guildId}-${userId}`;
                            const tw = filters.duplicateSpam.interval || 30000;
                            if (!spamTracker.has(key)) spamTracker.set(key, []);
                            const arr = spamTracker.get(key);
                            arr.push({ time: now, content: message.content.toLowerCase().trim() });
                            const recent = arr.filter(e => now - e.time < tw);
                            spamTracker.set(key, recent);
                            const dupes = recent.filter(e => e.content === message.content.toLowerCase().trim()).length;
                            if (dupes > (filters.duplicateSpam.maxDuplicates || 3)) { triggered = 'Duplicate Spam'; reason = `${dupes} identical messages in ${tw / 1000}s`; spamTracker.delete(key); }
                        }

                        // --- Invite Spam ---
                        if (!triggered && filters.inviteSpam?.enabled && message.content) {
                            const inviteRegex = /(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\//i;
                            if (inviteRegex.test(message.content)) {
                                triggered = 'Invite Spam'; reason = 'Discord invite link detected';
                            }
                        }

                        // --- Newline Spam ---
                        if (!triggered && filters.newlineSpam?.enabled && message.content) {
                            const newlines = (message.content.match(/\n/g) || []).length;
                            if (newlines > (filters.newlineSpam.maxNewlines || 15)) {
                                triggered = 'Newline Spam'; reason = `${newlines} newlines (max: ${filters.newlineSpam.maxNewlines || 15})`;
                            }
                        }

                        // --- Execute punishment if any filter triggered ---
                        if (triggered) {
                            const action = spamCfg.action || 'timeout';
                            const fullReason = `Anti-Spam [${triggered}]: ${reason}`;
                            await message.delete().catch(() => { });

                            if (action === 'timeout' && message.member) {
                                const duration = spamCfg.timeoutDuration || 60000;
                                await message.member.timeout(duration, fullReason).catch(e => log.error('AntiSpam timeout: ' + e.message));
                                const msg = await message.channel.send(`<:Shield:1473038669831995494> <@${userId}> has been timed out for **${Math.round(duration / 1000)}s** — ${triggered.toLowerCase()} detected.`).catch(() => null);
                                if (msg) setTimeout(() => msg.delete().catch(() => { }), 8000);
                            } else if (action === 'kick' && message.member) {
                                await message.member.kick(fullReason).catch(e => log.error('AntiSpam kick: ' + e.message));
                                await message.channel.send(`<:Shield:1473038669831995494> **${message.author.username}** has been kicked — ${triggered.toLowerCase()} detected.`).catch(() => { });
                            } else if (action === 'ban' && message.member) {
                                await message.member.ban({ reason: fullReason, deleteMessageSeconds: 60 }).catch(e => log.error('AntiSpam ban: ' + e.message));
                                await message.channel.send(`<:Shield:1473038669831995494> **${message.author.username}** has been banned — ${triggered.toLowerCase()} detected.`).catch(() => { });
                            } else if (action === 'warn') {
                                const msg = await message.channel.send(`<:Infotriangle:1473038460456800459> <@${userId}>, stop! ${triggered} detected: ${reason}`).catch(() => null);
                                if (msg) setTimeout(() => msg.delete().catch(() => { }), 8000);
                            }

                            if (spamCfg.logChannel) {
                                const logCh = message.guild.channels.cache.get(spamCfg.logChannel);
                                if (logCh) {
                                    const logContainer = new ContainerBuilder()
                                        .setAccentColor(action === 'ban' ? 0xFF0000 : action === 'kick' ? 0xFF6600 : 0xFFA500)
                                        .addTextDisplayComponents(
                                            new TextDisplayBuilder().setContent(
                                                `# <:Shield:1473038669831995494> Anti-Spam Action\n\n` +
                                                `**User:** ${message.author.username} (<@${userId}>)\n` +
                                                `**Channel:** <#${message.channel.id}>\n` +
                                                `**Action:** \`${action.toUpperCase()}\`\n` +
                                                `**Filter:** ${triggered}\n` +
                                                `**Reason:** ${reason}\n` +
                                                `-# <t:${Math.floor(Date.now() / 1000)}:R>`
                                            )
                                        );
                                    await logCh.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
                                }
                            }
                            return;
                        }
                    }
                }
            }
        } catch (e) {
            // Silently ignore antispam errors
        }
    }

    // Counting Game Handler
    try {
        const { db } = require('./utils/database');
        const countingData = await db.get(`counting_${guildId}`);

        if (countingData && message.channel.id === countingData.channelId) {
            const content = message.content.trim();
            const num = parseInt(content);

            if (!isNaN(num) && content === num.toString()) {
                const expectedNum = countingData.currentCount + 1;
                const previousUserId = countingData.lastUserId;
                const sameUser = message.author.id === previousUserId;

                if (num === expectedNum && !sameUser) {
                    countingData.currentCount = num;
                    countingData.lastUserId = message.author.id;
                    countingData.totalCounts++;
                    if (num > countingData.highScore) countingData.highScore = num;
                    await db.set(`counting_${guildId}`, countingData);
                    await message.react('<:Checkedbox:1473038547165384804>');
                } else {
                    let failReason = '';
                    if (sameUser) {
                        failReason = 'You can\'t count twice in a row!';
                    } else if (num !== expectedNum) {
                        failReason = `Wrong number! Expected **${expectedNum}**`;
                    }

                    countingData.fails++;
                    const oldCount = countingData.currentCount;
                    countingData.currentCount = 0;
                    countingData.lastUserId = null;
                    await db.set(`counting_${guildId}`, countingData);

                    await message.react('<:Cancel:1473037949187657818>');
                    const container = new ContainerBuilder()
                        .setAccentColor(0xED4245)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `# <:Cancel:1473037949187657818> Count Reset!\n\n` +
                                `${failReason}\n\n` +
                                `**Previous count:** ${oldCount}\n` +
                                `**High score:** ${countingData.highScore}\n\n` +
                                `Start again from **1**!`
                            )
                        );
                    await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
                }
            }
        }
    } catch (e) { }

    // Bot mention response - Professional styled
    if (message.content === `<@${client.user.id}>` || message.content === `<@!${client.user.id}>`) {
        const totalCommands = new Set(client.commands?.values() || []).size;
        const totalServers = client.guilds.cache.size;
        const totalUsers = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
        const uptime = Math.floor(client.uptime / 1000);
        const uptimeStr = uptime > 86400 ? `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h` :
            uptime > 3600 ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m` :
                `${Math.floor(uptime / 60)}m ${uptime % 60}s`;

        const guildCustom = botCustomize.getConfig(guildId);
        const gPrefix = getGuildPrefix(guildId);
        const accentColor = botCustomize.getEmbedColor(guildId);
        const aboutLine = guildCustom.aboutText
            ? `> ${guildCustom.aboutText.split('\n')[0].substring(0, 120)}\n\n`
            : `> <:Lightningalt:1473038679906844824> **Advanced Multi-Purpose Discord Bot**\n\n`;

        let mentionContent = `# <:xnico:1486755083390550036> ${client.user.username}\n\n`;
        mentionContent += aboutLine;
        mentionContent += `### <:Settings:1473037894703779851> Quick Info\n`;
        mentionContent += `-# Prefix: \`${gPrefix}\` • Slash: \`/\`\n`;
        mentionContent += `-# Commands: \`${totalCommands}\` • Servers: \`${totalServers}\`\n`;
        mentionContent += `-# Uptime: \`${uptimeStr}\`\n\n`;
        mentionContent += `### <:Music:1473039311057190972> Features\n`;
        mentionContent += `-# <:YoutubeLive:1435331502710722592> Music • <:Shield:1473038669831995494> Moderation • <a:loading:1506015728871149770> Leveling\n`;
        mentionContent += `-# <:Money:1473377877239140529> Economy • <:Gamepad:1473039216429498409> Fun • <:Bookopen:1473038576391557130> Profiles\n\n`;
        if (guildCustom.footerText) {
            mentionContent += `-# ${guildCustom.footerText}`;
        } else {
            mentionContent += `-# Use \`${gPrefix}help\` or \`/help\` to explore all commands`;
        }

        const container = new ContainerBuilder()
            .setAccentColor(accentColor)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(mentionContent))
            .addActionRowComponents(
                new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('show_help_menu')
                            .setLabel('Commands')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('<:Bookopen:1473038576391557130>'),
                        new ButtonBuilder()
                            .setLabel('Invite Me')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`)
                            .setEmoji('<:Checkedbox:1473038547165384804>'),
                        new ButtonBuilder()
                            .setLabel('Support')
                            .setStyle(ButtonStyle.Link)
                            .setURL(process.env.SUPPORT_SERVER || 'https://discord.gg/Zs35X7Umak')
                            .setEmoji('<:Envelope:1473038885364695113>'),
                        new ButtonBuilder()
                            .setLabel('Vote')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`https://top.gg/bot/${client.user.id}/vote`)
                            .setEmoji('<a:loading:1506015728871149770>')
                    )
            );

        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (guildId) {
        // Track message count for guild members
        try {
            // Use $inc which auto-creates member if needed via incrementGuildMemberField
            await models.GuildMember.findOneAndUpdate(
                { guildId, userId: message.author.id },
                {
                    $inc: {
                        'leveling.messageCount': 1,
                        'analytics.totalMessages': 1
                    }
                }
            );
        } catch (error) {
            // Ignore message counting errors
        }

        // Handle sticky messages (with cooldown to prevent rate limits)
        if (jsonStore.has('sticky')) {
            const stickyConfig = jsonStore.read('sticky');
            const guildStickyConfig = stickyConfig[guildId];

            // Ensure proper structure exists
            if (guildStickyConfig && !guildStickyConfig.messages) {
                guildStickyConfig.messages = {};
            }

            if (guildStickyConfig?.enabled && guildStickyConfig.messages?.[message.channel.id]) {
                const stickyData = guildStickyConfig.messages[message.channel.id];

                // Cooldown: only re-send if at least 3 seconds have passed since last re-send
                if (!global.stickyCooldowns) global.stickyCooldowns = new Map();
                const cooldownKey = `${guildId}_${message.channel.id}`;
                const lastSent = global.stickyCooldowns.get(cooldownKey) || 0;
                const now = Date.now();

                if (now - lastSent < 3000) {
                    // Skip — too soon, avoid rate limits
                } else {
                    global.stickyCooldowns.set(cooldownKey, now);

                    // Delete old sticky message if it exists
                    if (stickyData.messageId) {
                        try {
                            const oldMsg = await message.channel.messages.fetch(stickyData.messageId).catch(() => null);
                            if (oldMsg) await oldMsg.delete().catch(() => { });
                        } catch (error) {
                            // Sticky delete error
                        }
                    }

                    // Send new sticky message based on display type
                    try {
                        let newSticky;
                        const displayType = stickyData.displayType || 'container';
                        const { replacePlaceholders } = require('./utils/interactionHandlers');

                        if (displayType === 'embed') {
                            const processedTitle = replacePlaceholders(stickyData.embedTitle || 'Sticky Message', message.author, message.guild, message.channel);
                            const processedContent = replacePlaceholders(stickyData.content, message.author, message.guild, message.channel);
                            const processedFooter = replacePlaceholders(stickyData.embedFooter || '', message.author, message.guild, message.channel);
                            const processedAuthor = replacePlaceholders(stickyData.embedAuthor || '', message.author, message.guild, message.channel);

                            const embed = new EmbedBuilder()
                                .setTitle(processedTitle)
                                .setDescription(processedContent)
                                .setColor(parseInt(stickyData.embedColor, 16) || 0x5865F2);

                            if (stickyData.embedFooter) embed.setFooter({ text: processedFooter });
                            if (stickyData.embedAuthor) embed.setAuthor({ name: processedAuthor });
                            if (stickyData.embedThumbnail) embed.setThumbnail(stickyData.embedThumbnail);
                            if (stickyData.embedImage) embed.setImage(stickyData.embedImage);

                            newSticky = await message.channel.send({ embeds: [embed] });
                        } else if (displayType === 'container') {
                            const processedContent = replacePlaceholders(stickyData.content, message.author, message.guild, message.channel);
                            const container = new ContainerBuilder()
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder()
                                        .setContent(processedContent)
                                );

                            newSticky = await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
                        } else if (displayType === 'content') {
                            const processedContent = replacePlaceholders(stickyData.content, message.author, message.guild, message.channel);
                            newSticky = await message.channel.send({ content: processedContent });
                        }

                        if (newSticky) {
                            // Update the sticky data with new message ID and ensure channel ID is saved
                            if (!guildStickyConfig.messages[message.channel.id]) {
                                guildStickyConfig.messages[message.channel.id] = {};
                            }
                            guildStickyConfig.messages[message.channel.id].messageId = newSticky.id;
                            guildStickyConfig.messages[message.channel.id].channelId = message.channel.id;
                            jsonStore.write('sticky', stickyConfig);
                        }
                    } catch (error) {
                        log.error('Sticky send error', error);
                    }
                } // end cooldown else
            }
        }

        // Handle Media-Only Channels
        if (jsonStore.has('media-only')) {
            try {
                const mediaOnlyConfig = jsonStore.read('media-only');
                const mediaOnlyChannels = mediaOnlyConfig[guildId]?.channels || [];

                if (mediaOnlyChannels.includes(message.channel.id)) {
                    // Check if user is moderator/admin (exempt from rule)
                    const isModerator = message.member.permissions.has('ManageMessages') ||
                        message.member.permissions.has('Administrator');

                    // Check if message has any attachments (images, videos, files, etc.)
                    const hasAttachments = message.attachments.size > 0;

                    if (!hasAttachments && !isModerator) {
                        try {
                            await message.delete();
                            const warningMsg = await message.channel.send(
                                `**${message.author.username}**, this is a media-only channel. Please only post messages with images, videos, or files.`
                            );

                            // Auto-delete warning after 5 seconds
                            setTimeout(() => {
                                warningMsg.delete().catch(() => { });
                            }, 5000);
                        } catch (error) {
                            // Ignore if bot doesn't have permissions
                        }
                        return; // Stop processing this message
                    }
                }
            } catch (error) {
                // Ignore media-only errors
            }
        }

        // Handle Simple Sticky Messages
        if (jsonStore.has('simple-sticky')) {
            const simpleStickyConfig = jsonStore.read('simple-sticky');
            const channelSticky = simpleStickyConfig[guildId]?.[message.channel.id];

            if (channelSticky) {
                // Delete old sticky message
                if (channelSticky.messageId) {
                    try {
                        const oldMsg = await message.channel.messages.fetch(channelSticky.messageId).catch(() => null);
                        if (oldMsg) await oldMsg.delete().catch(() => { });
                    } catch (error) {
                        // Ignore deletion errors
                    }
                }

                // Send new sticky message
                try {
                    const newSticky = await message.channel.send(channelSticky.content);
                    simpleStickyConfig[guildId][message.channel.id].messageId = newSticky.id;
                    jsonStore.write('simple-sticky', simpleStickyConfig);
                } catch (error) {
                    // Ignore send errors
                }
            }
        }

        // Handle AFK System
        if (jsonStore.has('afk')) {
            const afkConfig = jsonStore.read('afk');
            const userId = message.author.id;

            // Check if user is AFK and remove them
            if (afkConfig[userId]) {
                const afkData = afkConfig[userId];
                const afkDuration = Date.now() - afkData.timestamp;
                const hours = Math.floor(afkDuration / 3600000);
                const minutes = Math.floor((afkDuration % 3600000) / 60000);
                const seconds = Math.floor((afkDuration % 60000) / 1000);

                let durationText = '';
                if (hours > 0) durationText += `${hours}h `;
                if (minutes > 0) durationText += `${minutes}m `;
                durationText += `${seconds}s`;

                // Load stats to update total time
                let afkStats = {};
                if (jsonStore.has('afk-stats')) {
                    afkStats = jsonStore.read('afk-stats');
                }
                if (!afkStats[userId]) {
                    afkStats[userId] = { count: 0, totalTime: 0 };
                }
                afkStats[userId].totalTime += afkDuration;
                afkStats[userId].count++; // Increment count
                jsonStore.write('afk-stats', afkStats);

                delete afkConfig[userId];
                jsonStore.write('afk', afkConfig);

                // Format total time
                const totalMs = afkStats[userId].totalTime;
                const totalHours = Math.floor(totalMs / 3600000);
                const totalMinutes = Math.floor((totalMs % 3600000) / 60000);
                const totalSeconds = Math.floor((totalMs % 60000) / 1000);

                let totalTimeText = '';
                if (totalHours > 0) totalTimeText += `${totalHours}h `;
                if (totalMinutes > 0) totalTimeText += `${totalMinutes}m `;
                totalTimeText += `${totalSeconds}s`;

                let welcomeBackText = `# <:Checkedbox:1473038547165384804> Welcome Back!\n\nYour AFK status has been removed.\n\n<:Timer:1473039056710406204> **You were AFK for:** ${durationText}\n<:Bookopen:1473038576391557130>**Total AFK Times:** ${afkStats[userId].count}\n<a:loading:1506015728871149770> **Total AFK Duration:** ${totalTimeText}`;

                if (afkData.mentions && afkData.mentions.length > 0) {
                    const uniqueMentions = [...new Set(afkData.mentions)];
                    const mentionList = uniqueMentions.slice(0, 10).map(id => `<@${id}>`).join(', ');
                    welcomeBackText += `\n\n<:Chat:1473038936241864865> **You were mentioned by:**\n${uniqueMentions.length > 10 ? `${mentionList} and ${uniqueMentions.length - 10} more` : mentionList}`;
                }

                const welcomeBackContainer = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder()
                            .setContent(welcomeBackText)
                    );

                await message.reply({ components: [welcomeBackContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => { });

                try {
                    if (message.member && message.member.manageable && message.member.nickname?.startsWith('[AFK] ')) {
                        const restoredNick = afkData.previousNickname;
                        await message.member.setNickname(restoredNick).catch(() => { });
                    }
                } catch (error) {
                    // AFK nick remove error
                }
            }

            // Check if any mentioned users are AFK
            if (message.mentions.users.size > 0) {
                const mentionedAfkUsers = [];

                for (const [mentionedUserId, user] of message.mentions.users) {
                    if (mentionedUserId === userId) continue;

                    if (afkConfig[mentionedUserId]) {
                        const afkData = afkConfig[mentionedUserId];
                        const afkDuration = Date.now() - afkData.timestamp;
                        const hours = Math.floor(afkDuration / 3600000);
                        const minutes = Math.floor((afkDuration % 3600000) / 60000);

                        let durationText = '';
                        if (hours > 0) durationText = `${hours}h ${minutes}m ago`;
                        else if (minutes > 0) durationText = `${minutes}m ago`;
                        else durationText = 'Just now';

                        mentionedAfkUsers.push({
                            user: user,
                            message: afkData.message,
                            duration: durationText
                        });

                        if (!afkData.mentions) afkData.mentions = [];
                        if (!afkData.mentions.includes(userId)) {
                            afkData.mentions.push(userId);
                            jsonStore.write('afk', afkConfig);
                        }

                        // Send DM notification if enabled
                        if (afkData.dmNotifications) {
                            try {
                                const dmContainer = new ContainerBuilder()
                                    .addTextDisplayComponents(
                                        new TextDisplayBuilder()
                                            .setContent(`# 📬 AFK Mention Notification\n\n**${message.author.username}** mentioned you in **${message.guild.name}**\n\n<:Pin:1473038806612447500> **Channel:** <#${message.channel.id}>\n<:Chat:1473038936241864865> **Message:** ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}\n\n<:Attach:1473037923979886694> [Jump to Message](${message.url})`)
                                    );
                                await user.send({ components: [dmContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
                            } catch (error) {
                                // AFK DM error
                            }
                        }
                    }

                    if (mentionedAfkUsers.length > 0) {
                        const afkDescription = mentionedAfkUsers.map(data =>
                            `**${data.user.username}** is AFK (${data.duration})\n└ ${data.message}`
                        ).join('\n\n');

                        const afkContainer = new ContainerBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder()
                                    .setContent(`# 💤 AFK Users Mentioned\n\n${afkDescription}`)
                            );

                        await message.reply({ components: [afkContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
                    }
                }
            }

            const autoresponderConfig = autoresponderCache.get(guildId);
            if (autoresponderConfig?.enabled && autoresponderConfig.responses) {
                const content = message.content.toLowerCase();
                for (const item of autoresponderConfig.responses) {
                    if (content.includes(item.trigger)) {
                        try {
                            const container = new ContainerBuilder()
                                .addTextDisplayComponents(
                                    new TextDisplayBuilder()
                                        .setContent(item.response)
                                );
                            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                        } catch (error) {
                            log.error('Autoresponder error', error);
                        }
                        break;
                    }
                }
            }

            const autoreactConfig = autoreactCache.get(guildId);
            if (autoreactConfig?.enabled && autoreactConfig.reactions) {
                const content = message.content.toLowerCase();
                for (const item of autoreactConfig.reactions) {
                    if (content.includes(item.trigger)) {
                        for (const emoji of item.emojis) {
                            try {
                                await message.react(emoji).catch(() => { });
                            } catch (error) {
                                // Skip invalid emoji, continue with remaining
                            }
                        }
                        break;
                    }
                }
            }

            // Handle Antilink Protection
            const antilinkPath = path.join(__dirname, 'data', 'antilink.json');
            if (jsonStore.has('antilink')) {
                const antilinkData = jsonStore.read('antilink');
                if (antilinkData[guildId]) {
                    const isAdmin = message.member?.permissions.has('Administrator');
                    if (!isAdmin) {
                        const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|net|org|io|gg|tv|me|co|xyz|info|online|site|tech)[^\s]*)/gi;
                        if (urlRegex.test(message.content)) {
                            try {
                                await message.delete();
                                const warnMsg = await message.channel.send(`<:Cancel:1473037949187657818> **${message.author.username}**, links are not allowed in this server!`).catch(() => null);
                                if (warnMsg) {
                                    setTimeout(() => warnMsg.delete().catch(() => { }), 5000);
                                }
                                return;
                            } catch (error) {
                                log.error('Antilink delete error', error);
                            }
                        }
                    }
                }
            }

            // Handle Leveling/XP System

            if (!message.author.bot && !message.content.startsWith(getGuildPrefix(guildId))) {
                // Check if leveling is disabled for this guild
                let toggleConfig = {};
                if (jsonStore.has('levelingtoggle')) {
                    toggleConfig = jsonStore.read('levelingtoggle');
                }

                // Process leveling only when explicitly enabled for this guild
                const isLevelingEnabled = toggleConfig[guildId]?.enabled === true;

                if (isLevelingEnabled) {
                    // Check if channel is disabled
                    const isChannelDisabled = toggleConfig[guildId]?.disabledChannels?.includes(message.channel.id);

                    if (!isChannelDisabled) {
                        const guildConfig = await getGuildConfigDb(guildId);
                        const levelingConfig = guildConfig?.leveling || {};

                        // Check if channel or user's roles are in the ignore list
                        const ignoreChannels = levelingConfig.ignoreChannels || [];
                        const ignoreRoles = levelingConfig.ignoreRoles || [];
                        const isChannelIgnored = ignoreChannels.includes(message.channel.id);
                        const isRoleIgnored = ignoreRoles.length > 0 && message.member.roles.cache.some(r => ignoreRoles.includes(r.id));

                        if (!isChannelIgnored && !isRoleIgnored) {
                            const xpSettings = levelingConfig.xpSettings || { minXp: 15, maxXp: 25, cooldown: 60 };

                            let leveling = {};
                            if (jsonStore.has('leveling')) {
                                leveling = jsonStore.read('leveling');
                            }

                            if (!leveling[guildId]) {
                                leveling[guildId] = {};
                            }

                            if (!leveling[guildId][message.author.id]) {
                                leveling[guildId][message.author.id] = { xp: 0, level: 0, lastXpGain: 0, messages: 0 };
                            }

                            const userData = leveling[guildId][message.author.id];
                            // Track total messages regardless of XP cooldown
                            userData.messages = (userData.messages || 0) + 1;
                            const now = Date.now();
                            const xpCooldown = (xpSettings.cooldown || 60) * 1000;

                            if (now - userData.lastXpGain >= xpCooldown) {
                                const minXp = xpSettings.minXp || 15;
                                const maxXp = xpSettings.maxXp || 25;
                                let multiplier = levelingConfig.multiplier || 1;

                                // Check per-role multipliers from levelmultiplier.json
                                try {
                                    if (jsonStore.has('levelmultiplier')) {
                                        const roleMultipliers = jsonStore.read('levelmultiplier');
                                        const guildMultipliers = roleMultipliers[guildId] || {};
                                        for (const [roleId, mult] of Object.entries(guildMultipliers)) {
                                            if (message.member.roles.cache.has(roleId) && mult > multiplier) {
                                                multiplier = mult;
                                            }
                                        }
                                    }
                                } catch { }

                                const xpGain = Math.floor((Math.floor(Math.random() * (maxXp - minXp + 1)) + minXp) * multiplier);
                                userData.xp += xpGain;
                                userData.lastXpGain = now;

                                const oldLevel = Math.floor(0.1 * Math.sqrt(userData.xp - xpGain));
                                const newLevel = Math.floor(0.1 * Math.sqrt(userData.xp));

                                if (newLevel > oldLevel) {
                                    userData.level = newLevel;

                                    // Handle roles - check database first, then fall back to levelroles.json
                                    let rolesConfig = levelingConfig.roles;
                                    if ((!rolesConfig || !Array.isArray(rolesConfig) || rolesConfig.length === 0)) {
                                        try {
                                            if (jsonStore.has('levelroles')) {
                                                const fileRoles = jsonStore.read('levelroles');
                                                if (fileRoles[guildId] && Array.isArray(fileRoles[guildId]) && fileRoles[guildId].length > 0) {
                                                    rolesConfig = fileRoles[guildId];
                                                }
                                            }
                                        } catch { }
                                    }
                                    if (rolesConfig && Array.isArray(rolesConfig) && rolesConfig.length > 0) {
                                        const rolesToAdd = rolesConfig
                                            .filter(r => newLevel >= r.level)
                                            .map(r => r.roleId);

                                        if (rolesToAdd.length > 0) {
                                            try {
                                                if (levelingConfig.stackRoles) {
                                                    await message.member.roles.add(rolesToAdd).catch(() => { });
                                                } else {
                                                    const highestRole = rolesConfig
                                                        .filter(r => newLevel >= r.level)
                                                        .sort((a, b) => b.level - a.level)[0];

                                                    const rolesToRemove = rolesConfig
                                                        .filter(r => r.roleId !== highestRole.roleId)
                                                        .map(r => r.roleId);

                                                    await message.member.roles.remove(rolesToRemove).catch(() => { });
                                                    await message.member.roles.add(highestRole.roleId).catch(() => { });
                                                }
                                            } catch (e) { }
                                        }
                                    }

                                    // Handle announcement - check announcements config, announcementChannel, and levelchannel.json fallback
                                    const announceConfig = levelingConfig.announcements || {};
                                    if (announceConfig.enabled !== false) {
                                        let announceChannel = message.channel;

                                        if (announceConfig.channel === 'custom' && announceConfig.customChannelId) {
                                            announceChannel = message.guild.channels.cache.get(announceConfig.customChannelId) || message.channel;
                                        } else if (announceConfig.channel === 'dm') {
                                            announceChannel = message.author;
                                        } else if (levelingConfig.announcementChannel) {
                                            // Fallback: check announcementChannel set via leveling-setup panel
                                            const panelChannel = message.guild.channels.cache.get(levelingConfig.announcementChannel);
                                            if (panelChannel) announceChannel = panelChannel;
                                        } else {
                                            // Fallback: check levelchannel.json
                                            try {
                                                if (jsonStore.has('levelchannel')) {
                                                    const lcData = jsonStore.read('levelchannel');
                                                    if (lcData[guildId]) {
                                                        const fallbackChannel = message.guild.channels.cache.get(lcData[guildId]);
                                                        if (fallbackChannel) announceChannel = fallbackChannel;
                                                    }
                                                }
                                            } catch { }
                                        }

                                        // Generate professional canvas level-up card
                                        try {
                                            const { generateLevelUpCard } = require('./utils/levelUpCard');
                                            const { AttachmentBuilder } = require('discord.js');

                                            const sorted = Object.entries(leveling[guildId] || {})
                                                .map(([uid, d]) => ({ uid, xp: d.xp }))
                                                .sort((a, b) => b.xp - a.xp);
                                            const userRank = sorted.findIndex(u => u.uid === message.author.id) + 1;

                                            let levelUpFontFamily = 'Poppins';
                                            try {
                                                const { getUserData: _getUD } = require('./utils/dataManager');
                                                const _ud = await _getUD(message.author.id);
                                                levelUpFontFamily = _ud?.profile?.rankCard?.fontFamily || _ud?.profile?.profileCard?.fontFamily || 'Poppins';
                                            } catch { }
                                            const cardBuffer = await generateLevelUpCard(message.author, {
                                                oldLevel: oldLevel,
                                                newLevel: newLevel,
                                                totalXp: userData.xp,
                                                rank: userRank,
                                                xpGain: xpGain,
                                                fontFamily: levelUpFontFamily
                                            });

                                            const attachment = new AttachmentBuilder(cardBuffer, { name: 'level-up.png' });
                                            await announceChannel.send({
                                                content: `${message.author}`,
                                                files: [attachment],
                                                allowedMentions: { users: [message.author.id] }
                                            }).catch(() => { });
                                        } catch (cardErr) {
                                            // Fallback to text if card generation fails
                                            const msgTemplate = announceConfig.message || '# <:Money:1473377877239140529> Level Up!\n\n{user} reached **Level {level}**!\n\n**Total XP:** {xp}';
                                            const finalMsg = msgTemplate
                                                .replace(/{user}/g, message.author.toString())
                                                .replace(/{level}/g, newLevel.toString())
                                                .replace(/{xp}/g, userData.xp.toLocaleString());

                                            const levelUpContainer = new ContainerBuilder()
                                                .addTextDisplayComponents(
                                                    new TextDisplayBuilder()
                                                        .setContent(finalMsg)
                                                );

                                            await announceChannel.send({ components: [levelUpContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
                                        }
                                    }
                                }

                                jsonStore.write('leveling', leveling);
                            }
                        } // end ignoreChannels/ignoreRoles check
                    }
                }
            }
        }

        // Handle Music Panel Song Requests
        if (jsonStore.has('musicpanel')) {
            const panelConfig = jsonStore.read('musicpanel');
            const guildPanel = panelConfig[guildId];

            // Check if this channel is the music panel
            if (guildPanel && message.channel.id === guildPanel.channelId) {
                // Block all bot messages except from this bot (music panel bot)
                if (message.author.bot && message.author.id !== client.user.id) {
                    try {
                        await message.delete();
                    } catch (err) {
                        log.error('Failed to delete bot message in music panel: ' + err.message);
                    }
                    return; // Don't process bot messages further
                }

                // Always delete user messages in music panel channel with retry
                const deleteUserMessage = async (delayMs = 300) => {
                    setTimeout(async () => {
                        let retries = 3;
                        while (retries > 0) {
                            try {
                                // Check if message still exists and is deletable
                                if (!message.deletable) {
                                    return; // Message not deletable, exit early
                                }

                                await message.delete();
                                return; // Success
                            } catch (err) {
                                retries--;
                                if (retries === 0) {
                                    log.error('Failed to delete message in music panel after retries: ' + err.message);
                                } else {
                                    // Wait before retry
                                    await new Promise(resolve => setTimeout(resolve, 200));
                                }
                            }
                        }
                    }, delayMs);
                };

                const query = message.content.trim();

                // Delete empty messages or commands (block all bot commands in music panel)
                if (!query || message.content.startsWith(getGuildPrefix(guildId))) {
                    await deleteUserMessage(100);
                    return;
                }

                // Delete message after short delay (Hydra-style)
                await deleteUserMessage(300);

                // Check if user is in a voice channel
                if (!message.member.voice.channel) {
                    return; // Silently ignore if not in voice
                }

                try {
                    let player = lavalinkManager.getPlayer(message.guild.id);

                    // If player exists, check if user is in the same voice channel as bot
                    if (player && player.voiceChannelId) {
                        if (message.member.voice.channel.id !== player.voiceChannelId) {
                            // User is not in the same VC as bot - silently ignore
                            return;
                        }
                    }

                    // Create player if it doesn't exist
                    if (!player) {
                        player = await lavalinkManager.createPlayer({
                            guildId: message.guild.id,
                            voiceChannelId: message.member.voice.channel.id,
                            textChannelId: message.channel.id,
                            selfDeaf: true,
                            selfMute: false,
                            volume: 100
                        });

                        await player.connect();
                    }

                    // Detect if query is a URL or needs search prefix
                    let searchQuery = query;
                    const isUrl = /^https?:\/\//.test(query);
                    const isSpotify = query.includes('spotify.com');
                    const isYouTube = query.includes('youtube.com') || query.includes('youtu.be');
                    const isSoundCloud = query.includes('soundcloud.com');

                    // If it's not a URL, add search prefix
                    if (!isUrl) {
                        searchQuery = `ytsearch:${query}`;
                    }

                    // Add timeout handling for search with longer timeout for playlists
                    const doSearch = (q) => Promise.race([
                        player.search({ query: q }, message.author),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Search timeout')), 20000))
                    ]);

                    let res = await doSearch(searchQuery).catch(err => {
                        log.error('Music Panel search error: ' + err.message);
                        throw err;
                    });

                    // Fallback to SoundCloud if YouTube search returned no results
                    if (!isUrl && (res.loadType === 'empty' || res.loadType === 'error' || !res.tracks || res.tracks.length === 0)) {
                        res = await doSearch(`scsearch:${query}`).catch(err => {
                            log.error('Music Panel SoundCloud fallback error: ' + err.message);
                            throw err;
                        });
                    }

                    if (res.loadType === 'error') {
                        log.error('Lavalink load error: ' + (res.exception?.message || 'Unknown'));
                        return; // Silently fail for errors
                    }

                    if (res.loadType === 'empty' || !res.tracks || res.tracks.length === 0) {
                        return; // Silently fail for no results
                    }

                    // Handle playlists
                    if (res.loadType === 'playlist') {
                        for (const track of res.tracks) {
                            track.requester = message.author;
                            await player.queue.add(track);
                        }
                    } else {
                        // Handle single track or search results
                        const track = res.tracks[0];
                        track.requester = message.author;
                        await player.queue.add(track);
                    }

                    if (!player.playing && !player.paused) {
                        await player.play();
                    }

                    // Update panel after adding song
                    await updateMusicPanel(client, player, autoplayStatus).catch(err => log.error(`Panel update: ${err.message}`, err));
                } catch (error) {
                    log.error('Music Panel request error', error);
                    // Silently fail - don't send error messages in music panel
                }
                return;
            }
        }
    }

    // No-prefix resolution — premium/owner validated inside the noprefix module
    const noPrefixCommand = client.commands.get('noprefix');
    let noPrefixEnabled = false;
    const PREFIX = getGuildPrefix(guildId);
    let hasPrefix = message.content.startsWith(PREFIX);
    const isPremiumUser = premiumManager.hasPremiumAccess(message.author.id, message.guild?.id);
    const isOwnerUser = isOwner(message.author.id);

    if (noPrefixCommand) {
        noPrefixEnabled = noPrefixCommand.isGlobalNoPrefixEnabled(message.author.id)
            || (message.guild && noPrefixCommand.isNoPrefixEnabled(message.guild.id, message.author.id));
    }

    // Check if user is bot banned
    const botBanPath = path.join(__dirname, 'datas', 'botbans.json');
    if (jsonStore.has('botbans')) {
        const botBans = jsonStore.read('botbans');
        if (botBans[message.author.id]) {
            const banData = botBans[message.author.id];
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Commentblock:1473370739351490794> You are banned from using this bot!\n\n**Reason:** ${banData.reason}\n**Banned:** <t:${Math.floor(banData.timestamp / 1000)}:R>`)
                );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
        }
    }

    // Check if channel is ignored for commands
    const ignoreChannelsCmd = client.commands.get('ignore-channels');
    if (ignoreChannelsCmd && message.guild) {
        const ignoreConfig = ignoreChannelsCmd.getGuildConfig(message.guild.id);
        const categoryId = message.channel.parentId || null;

        if (ignoreChannelsCmd.isChannelIgnored(message.guild.id, message.channel.id, categoryId)) {
            if (!ignoreChannelsCmd.canBypass(message.member, ignoreConfig)) {
                if (ignoreConfig.notifyUser) {
                    const container = new ContainerBuilder()
                        .setAccentColor(0xED4245)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder()
                                .setContent(`# <:Commentblock:1473370739351490794> Commands Disabled\n\nBot commands are disabled in this channel.`)
                        );
                    message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 }).then(msg => {
                        setTimeout(() => msg.delete().catch(() => { }), 5000);
                    }).catch(() => { });
                }
                return;
            }
        }
    }

    // Process commands if prefix is used or no-prefix mode is enabled
    if (hasPrefix || noPrefixEnabled) {
        const args = hasPrefix
            ? message.content.slice(PREFIX.length).trim().split(/ +/)
            : message.content.trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // console.log(`Prefix command received: ${commandName} by ${message.author.username}`);

        // Check for custom commands first
        if (jsonStore.has('customcmds') && guildId) {
            const customCmds = jsonStore.read('customcmds');
            if (customCmds[guildId] && customCmds[guildId][commandName]) {
                const response = customCmds[guildId][commandName];
                return message.reply(response).catch(() => { });
            }
        }

        const command = client.commands.get(commandName) ||
            client.commands.get(commandName === 'np' ? 'nowplaying' : commandName);

        if (!command) {
            return;
        }

        if (!command.executePrefix) {
            return;
        }

        if (command.premiumOnly && !premiumManager.hasPremiumAccess(message.author.id, message.guild?.id)) {
            return message.reply('<:Cancel:1473037949187657818> This feature requires **Premium**. Use `redeemkey` to activate or ask an admin to activate server premium.').catch(() => { });
        }

        // ── Bot Permission Pre-Check ──
        if (message.guild) {
            const permCheck = checkBotPermissions(message.guild, message.channel, commandName);
            if (!permCheck.allowed) {
                await notifyMissingPermissions(message.author, message.channel, commandName, permCheck.missing, message.guild);
                return;
            }
        }

        let botCustomConfig = botCustomize.getConfig(guildId);

        // Delete command message if enabled
        if (botCustomConfig.deleteCommands && message.deletable) {
            message.delete().catch(() => { });
            // Message will be deleted — replace reply with channel.send to avoid MESSAGE_REFERENCE_UNKNOWN_MESSAGE
            message.reply = _sendWithoutRef;
        }

        // ── Command Cooldown Check (Premium users bypass) ──
        const cooldownSec = botCustomConfig.commandCooldown || 0;
        if (cooldownSec > 0 && !premiumManager.hasPremiumAccess(message.author.id, guildId)) {
            const cdKey = `${guildId}_${message.author.id}_${commandName}`;
            const now = Date.now();
            if (!client._cmdCooldowns) client._cmdCooldowns = new Map();
            const lastUsed = client._cmdCooldowns.get(cdKey) || 0;
            if (now - lastUsed < cooldownSec * 1000) {
                const remaining = ((cooldownSec * 1000 - (now - lastUsed)) / 1000).toFixed(1);
                const cdContainer = new ContainerBuilder()
                    .setAccentColor(0xED4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder()
                            .setContent(`<:Timer:1473039056710406204> Please wait **${remaining}s** before using \`${commandName}\` again.`)
                    );
                return message.reply({ components: [cdContainer], flags: MessageFlags.IsComponentsV2 }).then(m => {
                    setTimeout(() => m.delete().catch(() => { }), 3000);
                }).catch(() => { });
            }
            client._cmdCooldowns.set(cdKey, now);
            // Auto-cleanup old entries every 1000 commands
            if (client._cmdCooldowns.size > 5000) {
                const threshold = now - 120000;
                for (const [k, v] of client._cmdCooldowns) {
                    if (v < threshold) client._cmdCooldowns.delete(k);
                }
            }
        }

        // ── Apply Guild Customization to Prefix Responses ──
        if (message.guild) {
            const _gColor = botCustomize.getEmbedColor(guildId);
            const _gFoot = botCustomConfig.footerText;
            const _gFootIcon = botCustomConfig.footerIcon;

            // Attach for commands that want direct access
            message._guildPrefix = PREFIX;
            message._guildAccentColor = _gColor;
            message._guildFooterText = _gFoot;
            message._guildFooterIcon = _gFootIcon;

            const _patchMsgOpts = (opts) => {
                if (typeof opts === 'string') opts = { content: opts };
                if (!opts) opts = {};
                // Accent color on Components V2 containers (type 17)
                if (opts.components && Array.isArray(opts.components)) {
                    for (const c of opts.components) {
                        if (c?.data?.type === 17 && c.data.accent_color === undefined) {
                            c.data.accent_color = _gColor;
                        }
                    }
                }
                // Embed color + footer
                if (opts.embeds && Array.isArray(opts.embeds)) {
                    for (const e of opts.embeds) {
                        const d = e?.data ?? e;
                        if (d && d.color === undefined) d.color = _gColor;
                        if (d && !d.footer && _gFoot) {
                            d.footer = { text: _gFoot };
                            if (_gFootIcon) d.footer.icon_url = _gFootIcon;
                        }
                    }
                }
                return opts;
            };

            const _origMsgReply = message.reply.bind(message);
            message.reply = (o) => _origMsgReply(_patchMsgOpts(o));
            const _origChannelSend = message.channel.send.bind(message.channel);
            message.channel.send = (o) => _origChannelSend(_patchMsgOpts(o));
        }

        try {
            trackCommand(commandName, message.author.id, message.guild?.id);
            await command.executePrefix(message, args, lavalinkManager, client);
        } catch (error) {
            // ── Handle permission errors specifically ──
            if (isPermissionError(error)) {
                const perms = inferPermissionsFromCommand(commandName, command.category);
                await notifyMissingPermissions(message.author, message.channel, commandName, perms, message.guild);
                return;
            }

            log.error(`Prefix command (${commandName}): ${error.message}`, error);

            // Log error to designated channel
            await logError(client, error, {
                type: 'Prefix Command Error',
                command: `${PREFIX}${commandName}`,
                user: message.author,
                guild: message.guild,
                channel: message.channel,
                additionalInfo: `Args: ${args.join(' ')}`
            });

            const errorId = generateErrorId();
            const { container, row } = buildErrorContainer('Command Error', `There was an error executing **${commandName}**!\n\n\`\`\`\n${error.message}\n\`\`\``, errorId);
            message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
        }
    }
});

// ═══════ Anti-Nuke Core Engine ═══════

function isAntiNukeExempt(guild, config, executorId) {
    // Always exempt the bot itself
    const botId = guild.members.me?.id || client.user?.id;
    if (executorId === botId) return true;
    // Always exempt the guild owner
    if (executorId === guild.ownerId) return true;
    // Check whitelisted users
    if (config.whitelistedUsers?.includes(executorId)) return true;
    // Check bypass role
    if (config.bypassRoleId) {
        const member = guild.members.cache.get(executorId);
        if (member?.roles.cache.has(config.bypassRoleId)) return true;
    }
    return false;
}

async function executeAntiNukePunishment(guild, member, actionType, action, executor) {
    const botMember = guild.members.me;
    if (!botMember) return false;

    // Hierarchy check — cannot punish members with equal or higher roles
    if (member.roles?.highest?.position >= botMember.roles.highest.position) {
        log.warning(`Anti-Nuke: Cannot punish ${executor.username || executor.id} — role hierarchy too high`);
        return false;
    }

    const reason = `Anti-Nuke: Exceeded ${action} limit`;

    if (actionType === 'remove_roles') {
        const rolesToRemove = member.roles.cache.filter(role =>
            role.id !== guild.id &&
            role.position < botMember.roles.highest.position
        );
        if (rolesToRemove.size > 0) {
            await member.roles.remove(rolesToRemove, reason);
        }
        log.warning(`Anti-Nuke: Removed roles from ${executor.username || executor.id} for ${action}`);
    } else if (actionType === 'kick') {
        if (!member.kickable) return false;
        await member.kick(reason);
        log.warning(`Anti-Nuke: Kicked ${executor.username || executor.id} for ${action}`);
    } else if (actionType === 'ban') {
        if (!member.bannable) return false;
        await member.ban({ reason, deleteMessageSeconds: 0 });
        log.warning(`Anti-Nuke: Banned ${executor.username || executor.id} for ${action}`);
    } else if (actionType === 'timeout') {
        if (!member.moderatable) return false;
        // 1 hour default timeout
        await member.timeout(3600000, reason);
        log.warning(`Anti-Nuke: Timed out ${executor.username || executor.id} for ${action}`);
    } else {
        return false;
    }
    return true;
}

const ANTINUKE_ACTION_LABELS = {
    banProtection: { label: 'Ban Protection', emoji: '<:banhammer:1473367388597780592>' },
    kickProtection: { label: 'Kick Protection', emoji: '<:Userblock:1473038868184826149>' },
    channelDelete: { label: 'Channel Delete', emoji: '<:Trash:1473038090074591293>' },
    channelCreate: { label: 'Channel Create', emoji: '<:Add:1473038100862337035>' },
    roleDelete: { label: 'Role Delete', emoji: '<:Trash:1473038090074591293>' },
    roleCreate: { label: 'Role Create', emoji: '<:Add:1473038100862337035>' },
    webhookCreate: { label: 'Webhook Protection', emoji: '<:Bookmark:1473039494604132423>' },
    botAdd: { label: 'Bot Add Protection', emoji: '<:bots:1473368718120849500>' }
};

const ANTINUKE_PUNISH_LABELS = {
    remove_roles: 'Strip Roles',
    kick: 'Kick',
    ban: 'Ban',
    timeout: 'Timeout',
    kick_bot: 'Kick Bot',
    kick_both: 'Kick Bot & User',
    ban_bot: 'Ban Bot'
};

const ANTINUKE_PUNISH_COLORS = { ban: 0xFF0000, kick: 0xFF6600, remove_roles: 0xFFA500, timeout: 0xFFCC00, kick_bot: 0xFF6600, kick_both: 0xFF0000, ban_bot: 0xFF0000 };

function sendAntiNukeLog(guild, config, executor, action, limit, timeWindow, recentCount, actionType, target) {
    if (!config.logChannel) return;

    const logChannel = guild.channels.cache.get(config.logChannel);
    if (!logChannel) return;

    const meta = ANTINUKE_ACTION_LABELS[action] || { label: action, emoji: '<:Shield:1473038669831995494>' };
    const punishLabel = ANTINUKE_PUNISH_LABELS[actionType] || actionType;
    const accentColor = ANTINUKE_PUNISH_COLORS[actionType] || 0xED4245;
    const nowTs = Math.floor(Date.now() / 1000);

    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(
            new TextDisplayBuilder()
                .setContent(
                    `# ${meta.emoji} Anti-Nuke Triggered\n\n` +
                    `${meta.emoji} **Protection:** ${meta.label}\n` +
                    `<:Userblock:1473038868184826149> **Offender:** <@${executor.id}> (\`${executor.id}\`)\n` +
                    `<:Lightningalt:1473038679906844824> **Violations:** \`${recentCount}\` / \`${limit}\` in \`${timeWindow / 1000}s\`\n` +
                    `<:Shield:1473038669831995494> **Punishment:** \`${punishLabel}\`\n` +
                    (target ? `<:Bookmark:1473039494604132423> **Target:** \`${target}\`\n` : '') +
                    `<:Timer:1473039056710406204> **Time:** <t:${nowTs}:f> (<t:${nowTs}:R>)\n\n` +
                    `-# xNico Anti-Nuke Engine`
                )
        );

    logChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications }).catch(() => { });
}

async function checkAntiNuke(guild, action, executor, target = null) {
    if (!guild || !executor?.id) return;

    const config = antinukeCache.get(guild.id);
    if (!config?.enabled) return;

    const protectionConfig = config[action];
    if (!protectionConfig?.enabled) return;

    if (executor.bot) return;
    if (isAntiNukeExempt(guild, config, executor.id)) return;

    const key = `${guild.id}-${executor.id}-${action}`;
    const now = Date.now();
    const timeWindow = protectionConfig.timeWindow || 60000;
    const limit = protectionConfig.limit || 3;

    let actions = antinukeTracker.get(key);
    if (!actions) {
        actions = [];
        antinukeTracker.set(key, actions);
    }
    actions.push(now);

    const cutoff = now - timeWindow;
    let startIdx = 0;
    while (startIdx < actions.length && actions[startIdx] < cutoff) startIdx++;
    if (startIdx > 0) actions.splice(0, startIdx);

    if (actions.length <= limit) return;

    const member = guild.members.cache.get(executor.id) || await guild.members.fetch(executor.id).catch(() => null);
    if (!member) return;

    const actionType = protectionConfig.action || 'remove_roles';
    const violationCount = actions.length;

    try {
        const success = await executeAntiNukePunishment(guild, member, actionType, action, executor);

        antinukeTracker.delete(key);

        if (success) {
            sendAntiNukeLog(guild, config, executor, action, limit, timeWindow, violationCount, actionType, target);

            try {
                const ANTINUKE_WEBHOOK = 'https://discord.com/api/webhooks/1457415882190880944/_iJ_4EqDIEHYKKzl1V881VsAMBGTFE_zaVGuMcM2_jwml7gU1resxTnYWr_YdAa-Hysd';
                const antinukeWhEmbed = {
                    title: '🔐  Anti-Nuke Protection Triggered',
                    color: ANTINUKE_PUNISH_COLORS[actionType] || 0xFF0000,
                    thumbnail: { url: guild.iconURL({ dynamic: true, size: 512 }) || '' },
                    fields: [
                        { name: '🏷️ Server', value: `\`${guild.name}\` (\`${guild.id}\`)`, inline: false },
                        { name: '👤 Offender', value: `${executor.username || 'Unknown'} (<@${executor.id}>)`, inline: true },
                        { name: '⚡ Threat Action', value: `\`${action}\``, inline: true },
                        { name: '🛡️ Response', value: `\`${actionType.toUpperCase()}\``, inline: true },
                        { name: '📊 Violations', value: `\`${actions.length}\` actions in \`${(timeWindow / 1000)}s\` (limit: \`${limit}\`)`, inline: false },
                        { name: '🎯 Target', value: target ? `\`${target}\`` : 'N/A', inline: true },
                        { name: '👥 Server Members', value: `\`${guild.memberCount.toLocaleString()}\``, inline: true },
                    ],
                    footer: { text: `Anti-Nuke • Protection Active` },
                    timestamp: new Date().toISOString()
                };
                fetch(ANTINUKE_WEBHOOK, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: client.user?.username || 'Bot', avatar_url: client.user?.displayAvatarURL({ size: 256 }) || '', embeds: [antinukeWhEmbed] })
                }).catch(() => { });
            } catch (e) { }
        }
    } catch (error) {
        log.error(`Anti-Nuke punishment error (${action}):`, error);
    }
}

async function checkAuditLogAntiNuke(guild, auditType, action, targetId, targetName, maxAge = 5000) {
    if (!guild) return;

    const config = antinukeCache.get(guild.id);
    if (!config?.enabled) return;
    if (!config[action]?.enabled) return;

    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return;

    try {
        const auditLogs = await guild.fetchAuditLogs({ type: auditType, limit: 1 });
        const entry = auditLogs.entries.first();
        if (!entry) return;
        if (targetId && entry.target?.id !== targetId) return;
        if (Date.now() - entry.createdTimestamp > maxAge) return;

        const executor = entry.executor;
        if (!executor?.id) return;

        const botId = botMember.id || client.user?.id;
        if (executor.id === botId) return;
        if (executor.bot) return;

        await checkAntiNuke(guild, action, executor, targetName);
    } catch (error) {
        if (error.code !== 10004 && error.code !== 50013) {
            log.error(`Anti-Nuke ${action} audit error:`, error);
        }
    }
}

client.on('guildMemberAdd', async (member) => {
    try {
        await logMemberJoin(member);

        // Update server stats channels
        try { await updateServerStats(member.guild); } catch { }

        if (member.user.bot) {
            const config = antinukeCache.get(member.guild.id);
            if (config?.enabled && config.botAdd?.enabled) {
                try {
                    const botMember = member.guild.members.me;
                    if (botMember?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
                        const auditLogs = await member.guild.fetchAuditLogs({
                            type: 28,
                            limit: 1
                        });
                        const botAddLog = auditLogs.entries.first();
                        if (botAddLog && botAddLog.target?.id === member.id) {
                            const executor = botAddLog.executor;
                            if (executor?.id && !isAntiNukeExempt(member.guild, config, executor.id)) {
                                const action = config.botAdd.action || 'kick_bot';
                                if (action === 'kick_bot' && member.kickable) {
                                    await member.kick('Anti-Nuke: Unauthorized bot addition');
                                    log.warning(`Anti-Nuke: Kicked bot ${member.user.username} added by ${executor.username || executor.id}`);
                                } else if (action === 'kick_both') {
                                    if (member.kickable) {
                                        await member.kick('Anti-Nuke: Unauthorized bot addition');
                                    }
                                    const executorMember = await member.guild.members.fetch(executor.id).catch(() => null);
                                    if (executorMember?.kickable) {
                                        await executorMember.kick('Anti-Nuke: Unauthorized bot addition');
                                    }
                                    log.warning(`Anti-Nuke: Kicked bot ${member.user.username} and executor ${executor.username || executor.id}`);
                                } else if (action === 'ban_bot' && member.bannable) {
                                    await member.ban({ reason: 'Anti-Nuke: Unauthorized bot addition', deleteMessageSeconds: 0 });
                                    log.warning(`Anti-Nuke: Banned bot ${member.user.username} added by ${executor.username || executor.id}`);
                                }

                                // Send log
                                if (config.logChannel) {
                                    const logChannel = member.guild.channels.cache.get(config.logChannel);
                                    if (logChannel) {
                                        const actionLabels = { kick_bot: 'Kicked Bot', kick_both: 'Kicked Bot & Executor', ban_bot: 'Banned Bot' };
                                        const nowTs = Math.floor(Date.now() / 1000);
                                        const container = new ContainerBuilder()
                                            .setAccentColor(ANTINUKE_PUNISH_COLORS[action] || 0xED4245)
                                            .addTextDisplayComponents(
                                                new TextDisplayBuilder()
                                                    .setContent(
                                                        `# <:bots:1473368718120849500> Anti-Nuke: Bot Add Protection\n\n` +
                                                        `<:Userblock:1473038868184826149> **Added by:** <@${executor.id}> (\`${executor.id}\`)\n` +
                                                        `<:bots:1473368718120849500> **Bot:** <@${member.id}> (\`${member.id}\`)\n` +
                                                        `<:Shield:1473038669831995494> **Action:** \`${actionLabels[action] || action}\`\n` +
                                                        `<:Timer:1473039056710406204> **Time:** <t:${nowTs}:f> (<t:${nowTs}:R>)\n\n` +
                                                        `-# xNico Anti-Nuke Engine`
                                                    )
                                            );
                                        logChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications }).catch(() => { });
                                    }
                                }
                            }
                        }
                    }
                } catch (error) {
                    if (error.code !== 10004 && error.code !== 50013) {
                        log.error('Anti-Nuke bot add error', error);
                    }
                }
            }
        }

        if (isTrackingEnabled(member.guild.id)) {
            await handleMemberJoin(member);
        }

        // Anti-Alt Protection — kick accounts younger than configured minimum age
        if (!member.user.bot) {
            const antialtConfig = antialtCache.get(member.guild.id);
            if (antialtConfig?.enabled) {
                const accountAgeMs = Date.now() - member.user.createdTimestamp;
                const minAgeDays = antialtConfig.minAge || 7;
                const minAgeMs = minAgeDays * 24 * 60 * 60 * 1000;

                if (accountAgeMs < minAgeMs) {
                    try {
                        const accountAgeDays = Math.floor(accountAgeMs / (24 * 60 * 60 * 1000));
                        await member.kick(`Anti-Alt: Account too new (${accountAgeDays} days old, min: ${minAgeDays} days)`);
                        log.warning(`Anti-Alt: Kicked ${member.user.username} (account age: ${accountAgeDays} days, required: ${minAgeDays} days)`);
                    } catch (err) {
                        log.error('Anti-Alt kick error', err);
                    }
                    return;
                }
            }
        }

        // Anti-Raid Protection (using in-memory cache)
        try {
            const guildAntiraidConfig = antiraidCache.get(member.guild.id);
            if (guildAntiraidConfig?.enabled) {
                // Check bypass role
                const bypassRole = guildAntiraidConfig.bypassRoleId;
                const hasBypass = bypassRole && member.roles?.cache?.has(bypassRole);

                if (!hasBypass && !member.user.bot) {
                    // Account age check
                    if (guildAntiraidConfig.accountAge?.enabled) {
                        const accountAgeMs = Date.now() - member.user.createdTimestamp;
                        const minAgeDays = guildAntiraidConfig.accountAge.minDays || 7;
                        const minAgeMs = minAgeDays * 24 * 60 * 60 * 1000;

                        if (accountAgeMs < minAgeMs) {
                            const action = guildAntiraidConfig.accountAge.action || 'kick';
                            try {
                                if (action === 'kick') {
                                    await member.kick(`Anti-Raid: Account too new (${Math.floor(accountAgeMs / (24 * 60 * 60 * 1000))} days old, min: ${minAgeDays} days)`);
                                } else if (action === 'ban') {
                                    await member.ban({ reason: `Anti-Raid: Account too new` });
                                }

                                if (guildAntiraidConfig.logChannel) {
                                    const logChannel = member.guild.channels.cache.get(guildAntiraidConfig.logChannel);
                                    if (logChannel) {
                                        const container = new ContainerBuilder()
                                            .addTextDisplayComponents(
                                                new TextDisplayBuilder()
                                                    .setContent(`# <:Shield:1473038669831995494> Anti-Raid: Account Age Protection\n\n**User:** ${member.user.username} (${member.id})\n**Account Age:** ${Math.floor(accountAgeMs / (24 * 60 * 60 * 1000))} days\n**Required:** ${minAgeDays} days\n**Action:** ${action}`)
                                            );
                                        await logChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications }).catch(() => { });
                                    }
                                }
                            } catch (err) {
                                log.error('Anti-Raid account age error', err);
                            }
                            return;
                        }
                    }

                    // Join rate tracking
                    if (guildAntiraidConfig.joinRate?.enabled) {
                        const joinRateKey = `joinrate-${member.guild.id}`;
                        if (!global.joinRateTracker) global.joinRateTracker = new Map();

                        if (!global.joinRateTracker.has(joinRateKey)) {
                            global.joinRateTracker.set(joinRateKey, []);
                        }

                        const joins = global.joinRateTracker.get(joinRateKey);
                        const now = Date.now();
                        joins.push({ time: now, memberId: member.id });

                        const timeWindow = guildAntiraidConfig.joinRate.timeWindow || 10000;
                        const recentJoins = joins.filter(j => now - j.time < timeWindow);
                        global.joinRateTracker.set(joinRateKey, recentJoins);

                        const limit = guildAntiraidConfig.joinRate.limit || 10;
                        if (recentJoins.length > limit) {
                            const action = guildAntiraidConfig.joinRate.action || 'kick';
                            try {
                                if (action === 'kick') {
                                    await member.kick('Anti-Raid: Join rate limit exceeded');
                                } else if (action === 'ban') {
                                    await member.ban({ reason: 'Anti-Raid: Join rate limit exceeded' });
                                }

                                // Auto lockdown if threshold reached
                                if (guildAntiraidConfig.autoLockdown?.enabled) {
                                    const lockdownKey = `lockdown-${member.guild.id}`;
                                    if (!global.lockdownTracker) global.lockdownTracker = new Map();

                                    const lockdownCount = (global.lockdownTracker.get(lockdownKey) || 0) + 1;
                                    global.lockdownTracker.set(lockdownKey, lockdownCount);

                                    if (lockdownCount >= (guildAntiraidConfig.autoLockdown.threshold || 15)) {
                                        // Trigger auto lockdown
                                        const textChannels = member.guild.channels.cache.filter(ch => ch.type === 0);
                                        for (const [, channel] of textChannels) {
                                            try {
                                                await channel.permissionOverwrites.edit(member.guild.roles.everyone, {
                                                    SendMessages: false
                                                });
                                            } catch (e) { }
                                        }

                                        if (guildAntiraidConfig.logChannel) {
                                            const logChannel = member.guild.channels.cache.get(guildAntiraidConfig.logChannel);
                                            if (logChannel) {
                                                const container = new ContainerBuilder()
                                                    .addTextDisplayComponents(
                                                        new TextDisplayBuilder()
                                                            .setContent(`# <:Lock:1473038513749491773> Anti-Raid: Auto Lockdown Triggered\n\n**Reason:** Join rate exceeded threshold (${lockdownCount} incidents)\n**Action:** All text channels locked`)
                                                    );
                                                await logChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications }).catch(() => { });
                                            }
                                        }

                                        // Restore permissions after lockdown duration
                                        const duration = guildAntiraidConfig.autoLockdown.duration || 300000;
                                        setTimeout(async () => {
                                            try {
                                                global.lockdownTracker.set(lockdownKey, 0);
                                                // Restore channel permissions
                                                const textChannelsRestore = member.guild.channels.cache.filter(ch => ch.type === 0);
                                                for (const [, channel] of textChannelsRestore) {
                                                    try {
                                                        await channel.permissionOverwrites.edit(member.guild.roles.everyone, {
                                                            SendMessages: null
                                                        });
                                                    } catch (e) { }
                                                }

                                                if (guildAntiraidConfig.logChannel) {
                                                    const logCh = member.guild.channels.cache.get(guildAntiraidConfig.logChannel);
                                                    if (logCh) {
                                                        const restoreContainer = new ContainerBuilder()
                                                            .addTextDisplayComponents(
                                                                new TextDisplayBuilder()
                                                                    .setContent(`# <:Checkedbox:1473038547165384804> Anti-Raid: Lockdown Lifted\n\n**Duration:** ${duration / 1000} seconds\n**Action:** All text channels unlocked`)
                                                            );
                                                        await logCh.send({ components: [restoreContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
                                                    }
                                                }
                                            } catch (e) {
                                                log.error('Anti-Raid lockdown restore error', e);
                                            }
                                        }, duration);

                                        // Cleanup old join rate entries to prevent memory growth
                                        if (global.joinRateTracker && global.joinRateTracker.size > 100) {
                                            const now = Date.now();
                                            for (const [key, joins] of global.joinRateTracker.entries()) {
                                                const recentJoins = joins.filter(j => now - j.time < 60000);
                                                if (recentJoins.length === 0) {
                                                    global.joinRateTracker.delete(key);
                                                } else {
                                                    global.joinRateTracker.set(key, recentJoins);
                                                }
                                            }
                                        }
                                    }
                                }

                                if (guildAntiraidConfig.logChannel) {
                                    const logChannel = member.guild.channels.cache.get(guildAntiraidConfig.logChannel);
                                    if (logChannel) {
                                        const container = new ContainerBuilder()
                                            .addTextDisplayComponents(
                                                new TextDisplayBuilder()
                                                    .setContent(`# <:Shield:1473038669831995494> Anti-Raid: Join Rate Protection\n\n**User:** ${member.user.username} (${member.id})\n**Joins in window:** ${recentJoins.length}/${limit}\n**Action:** ${action}`)
                                            );
                                        await logChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications }).catch(() => { });
                                    }
                                }
                            } catch (err) {
                                log.error('Anti-Raid join rate error', err);
                            }
                            return;
                        }
                    }

                    // Suspicious patterns check
                    if (guildAntiraidConfig.suspiciousPatterns?.enabled) {
                        const username = member.user.username.toLowerCase();
                        const suspiciousPatterns = [
                            /^[a-z]{8}[0-9]{4}$/i,
                            /discord.*nitro/i,
                            /free.*nitro/i,
                            /^user[0-9]+$/i,
                            /admin.*official/i
                        ];

                        const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(username));
                        if (isSuspicious) {
                            const action = guildAntiraidConfig.suspiciousPatterns.action || 'kick';
                            try {
                                if (action === 'kick') {
                                    await member.kick('Anti-Raid: Suspicious username pattern');
                                } else if (action === 'ban') {
                                    await member.ban({ reason: 'Anti-Raid: Suspicious username pattern' });
                                }

                                if (guildAntiraidConfig.logChannel) {
                                    const logChannel = member.guild.channels.cache.get(guildAntiraidConfig.logChannel);
                                    if (logChannel) {
                                        const container = new ContainerBuilder()
                                            .addTextDisplayComponents(
                                                new TextDisplayBuilder()
                                                    .setContent(`# <:Shield:1473038669831995494> Anti-Raid: Suspicious Pattern Detected\n\n**User:** ${member.user.username} (${member.id})\n**Pattern:** Username matched suspicious criteria\n**Action:** ${action}`)
                                            );
                                        await logChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications }).catch(() => { });
                                    }
                                }
                            } catch (err) {
                                log.error('Anti-Raid suspicious pattern error', err);
                            }
                            return;
                        }
                    }
                }
            }
        } catch (error) {
            log.error('Anti-Raid error', error);
        }

        // Handle AutoRole Assignment (runs independently of welcomer)
        try {
            if (jsonStore.has('autorole')) {
                const autoroleConfig = jsonStore.read('autorole');
                const guildAutorole = autoroleConfig[member.guild.id];

                if (guildAutorole) {
                    let roleIds;
                    if (typeof guildAutorole === 'string') {
                        roleIds = member.user.bot ? [] : [guildAutorole];
                    } else {
                        roleIds = member.user.bot ? guildAutorole.bots : guildAutorole.humans;
                    }

                    if (Array.isArray(roleIds) && roleIds.length > 0) {
                        const rolesToAdd = [];

                        for (const roleId of roleIds) {
                            const role = member.guild.roles.cache.get(roleId);
                            if (role && !role.managed && role.position < member.guild.members.me.roles.highest.position) {
                                rolesToAdd.push(roleId);
                            }
                        }

                        if (rolesToAdd.length > 0) {
                            await member.roles.add(rolesToAdd, 'AutoRole assignment').catch(err => {
                                log.error(`AutoRole: Failed to assign roles to ${member.user.username}: ${err.message}`);
                            });
                            const assignedRoles = rolesToAdd.map(id => member.guild.roles.cache.get(id)?.name).filter(Boolean).join(', ');
                            log.info(`AutoRole: Assigned [${assignedRoles}] to ${member.user.username}`);
                        }
                    }
                }
            }
        } catch (error) {
            log.error('AutoRole error', error);
        }

        if (!jsonStore.has('welcomer')) return;

        const config = jsonStore.read('welcomer');
        const guildConfig = config[member.guild.id];

        if (!guildConfig || !guildConfig.enabled) {
            return;
        }

        const channel = member.guild.channels.cache.get(guildConfig.channelId);
        if (!channel) {
            log.error(`Welcomer: Channel ${guildConfig.channelId} not found in guild ${member.guild.id}`);
            return;
        }

        if (!channel.permissionsFor(member.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
            log.error(`Welcomer: Missing permissions in channel ${channel.name}`);
            return;
        }

        const mode = guildConfig.mode || guildConfig.displayType || 'components';
        const rawContent = guildConfig.content || guildConfig.message || `Welcome {user} to {server}!`;
        const processedContent = replacePlaceholders(rawContent, member.user, member.guild, channel) || 'Welcome!';
        const safeStr = (s, fb = '\u200b') => (!s || typeof s !== 'string') ? fb : (s.length > 4096 ? s.substring(0, 4093) + '...' : s);
        const colorStr = typeof guildConfig.color === 'string' ? guildConfig.color : (guildConfig.containerColor ? `#${guildConfig.containerColor.toString(16)}` : '#bcf1e4');
        const colorValue = colorStr ? parseInt(colorStr.replace('#', ''), 16) : 0x5865F2;

        if (mode === 'embed') {
            const embed = new EmbedBuilder()
                .setColor(isNaN(colorValue) ? 0x5865F2 : colorValue)
                .setDescription(processedContent)
                .setTimestamp();

            if (guildConfig.title) {
                embed.setTitle(replacePlaceholders(guildConfig.title, member.user, member.guild, channel));
            }

            if (guildConfig.image) {
                const imgVal = typeof guildConfig.image === 'string' ? guildConfig.image : guildConfig.image?.url;
                const processedImage = imgVal ? replacePlaceholders(imgVal, member.user, member.guild, channel) : null;
                if (processedImage && (processedImage.startsWith('http://') || processedImage.startsWith('https://'))) {
                    embed.setImage(processedImage);
                }
            }

            if (guildConfig.thumbnail) {
                const thumbVal = typeof guildConfig.thumbnail === 'string' ? guildConfig.thumbnail : guildConfig.thumbnail?.url;
                const processedThumb = thumbVal ? replacePlaceholders(thumbVal, member.user, member.guild, channel) : null;
                if (processedThumb && (processedThumb.startsWith('http://') || processedThumb.startsWith('https://'))) {
                    embed.setThumbnail(processedThumb);
                }
            }

            if (guildConfig.footer) {
                embed.setFooter({ text: replacePlaceholders(guildConfig.footer, member.user, member.guild, channel) });
            }

            if (guildConfig.author) {
                embed.setAuthor({
                    name: replacePlaceholders(guildConfig.author, member.user, member.guild, channel),
                    iconURL: member.user.displayAvatarURL({ size: 64 })
                });
            }

            const pingContent = guildConfig.pingUser ? `<@${member.id}>` : undefined;
            channel.send({ content: pingContent, embeds: [embed] }).then(sentMsg => {
                if (guildConfig.autoDelete > 0) {
                    setTimeout(() => sentMsg.delete().catch(() => { }), guildConfig.autoDelete * 1000);
                }
            }).catch(err => {
                log.error('Welcomer: Error sending embed message', err);
            });
        } else {
            const { MediaGalleryBuilder, MediaGalleryItemBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
            const container = new ContainerBuilder();

            // Only set accent color if not colorless mode
            if (!guildConfig.colorless && !isNaN(colorValue)) {
                container.setAccentColor(colorValue);
            }

            const thumbValue = typeof guildConfig.thumbnail === 'string' ? guildConfig.thumbnail : (guildConfig.thumbnail?.url || null);
            const imageValue = typeof (guildConfig.mediaUrl || guildConfig.image) === 'string' ? (guildConfig.mediaUrl || guildConfig.image) : (guildConfig.mediaGallery?.url || guildConfig.image?.url || null);
            const processedThumb = thumbValue ? replacePlaceholders(thumbValue, member.user, member.guild, channel) : null;
            const processedImage = imageValue ? replacePlaceholders(imageValue, member.user, member.guild, channel) : null;

            const imgPos = guildConfig.imagePosition || 'bottom';

            // Build image gallery if image exists (not used for 'side' mode)
            let imageGallery = null;
            if (processedImage && imgPos !== 'side' && (processedImage.startsWith('http://') || processedImage.startsWith('https://'))) {
                imageGallery = new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(processedImage)
                );
            }

            // For 'side' mode, image becomes thumbnail accessory alongside text
            const sideImageUrl = (imgPos === 'side' && processedImage && processedImage.startsWith('http')) ? processedImage : null;
            const effectiveThumb = sideImageUrl || processedThumb;
            const hasValidThumb = effectiveThumb && (effectiveThumb.startsWith('http://') || effectiveThumb.startsWith('https://'));

            // Add image gallery at top if position is 'top'
            if (imageGallery && imgPos === 'top') {
                container.addMediaGalleryComponents(imageGallery);
            }

            const welcomeBtnPos = guildConfig.buttonPosition || 'bottom';
            function renderWelcomeBtns() {
                if (guildConfig.buttons?.length > 0) {
                    const urlButtons = guildConfig.buttons
                        .filter(b => b.label && b.url && (b.url.startsWith('http://') || b.url.startsWith('https://')))
                        .slice(0, 5)
                        .map(b => {
                            const btn = new ButtonBuilder()
                                .setLabel(typeof b.label === 'string' ? b.label.substring(0, 80) : 'Link')
                                .setURL(b.url)
                                .setStyle(ButtonStyle.Link);
                            if (b.emoji) btn.setEmoji(b.emoji);
                            return btn;
                        });
                    if (urlButtons.length > 0) container.addActionRowComponents(new ActionRowBuilder().addComponents(...urlButtons));
                }
                if (guildConfig.actionButtons?.length > 0) {
                    try {
                        if (jsonStore.has('button-commands')) {
                            const btnConfig = jsonStore.read('button-commands');
                            const gId = member.guild.id;
                            if (btnConfig[gId]) {
                                const styleMap = { 'primary': ButtonStyle.Primary, 'secondary': ButtonStyle.Secondary, 'success': ButtonStyle.Success, 'danger': ButtonStyle.Danger, 'link': ButtonStyle.Link };
                                let actionRow = new ActionRowBuilder();
                                let count = 0;
                                for (const buttonId of guildConfig.actionButtons.slice(0, 25)) {
                                    const bd = btnConfig[gId][buttonId];
                                    if (!bd) continue;
                                    const ab = new ButtonBuilder().setLabel(bd.label).setStyle(styleMap[bd.style] || ButtonStyle.Primary);
                                    if (bd.style === 'link') { if (bd.url) ab.setURL(bd.url); else continue; }
                                    else ab.setCustomId(`btn_cmd_${gId}_${buttonId}`);
                                    if (bd.emoji) ab.setEmoji(bd.emoji);
                                    actionRow.addComponents(ab);
                                    count++;
                                    if (count >= 5) { container.addActionRowComponents(actionRow); actionRow = new ActionRowBuilder(); count = 0; }
                                }
                                if (count > 0) container.addActionRowComponents(actionRow);
                            }
                        }
                    } catch (e) { log.error('Welcome action buttons: ' + e.message); }
                }
            }

            function renderWelcomeMenus() {
                if (guildConfig.actionMenus?.length > 0) {
                    try {
                        if (jsonStore.has('select-menus')) {
                            const menuConfig = jsonStore.read('select-menus');
                            const gId = member.guild.id;
                            if (menuConfig[gId]) {
                                for (const menuId of guildConfig.actionMenus.slice(0, 5)) {
                                    const md = menuConfig[gId][menuId];
                                    if (!md) continue;
                                    const sm = new StringSelectMenuBuilder()
                                        .setCustomId(`sm_cmd_${gId}_${menuId}`)
                                        .setPlaceholder(md.placeholder || 'Select an option...')
                                        .setMinValues(md.minValues || 1)
                                        .setMaxValues(md.maxValues || 1);
                                    
                                    if (md.options?.length > 0) {
                                        sm.addOptions(md.options.slice(0, 25).map(o => ({
                                            label: o.label,
                                            value: o.value,
                                            description: o.description || undefined,
                                            emoji: o.emoji || undefined
                                        })));
                                        container.addActionRowComponents(new ActionRowBuilder().addComponents(sm));
                                    }
                                }
                            }
                        }
                    } catch (e) { log.error('Welcome action menus: ' + e.message); }
                }
            }

            // Components at top — before content
            if (welcomeBtnPos === 'top') {
                renderWelcomeBtns();
                renderWelcomeMenus();
            }

            const hasSeparators = /\{separator(:(small|medium|large))?\}/gi.test(rawContent);

            // Count how many extra components we'll need after content
            const extraComponents = (imageGallery && imgPos === 'bottom' ? 1 : 0) + (guildConfig.footer ? 2 : 0) + (guildConfig.buttons?.length > 0 ? 1 : 0) + (guildConfig.canvas?.enabled ? 1 : 0);
            const maxContentComponents = 10 - (imageGallery && imgPos === 'top' ? 1 : 0) - extraComponents;
            let componentCount = imageGallery && imgPos === 'top' ? 1 : 0;

            if (hasSeparators) {
                // Split on raw separators FIRST, then replace placeholders on each text part
                const markedContent = rawContent
                    .replace(/\{separator:small\}/gi, '---SEPARATOR:SMALL---')
                    .replace(/\{separator:medium\}/gi, '---SEPARATOR:MEDIUM---')
                    .replace(/\{separator:large\}/gi, '---SEPARATOR:LARGE---')
                    .replace(/\{separator\}/gi, '---SEPARATOR:SMALL---');
                const parts = markedContent.split(/---SEPARATOR:(SMALL|MEDIUM|LARGE)---/);
                let isFirst = true;

                for (let i = 0; i < parts.length; i++) {
                    if (componentCount >= maxContentComponents) break;
                    const part = parts[i];
                    if (part === 'SMALL' || part === 'MEDIUM' || part === 'LARGE') {
                        const spacing = part === 'LARGE' ? SeparatorSpacingSize.Large :
                            part === 'MEDIUM' ? SeparatorSpacingSize.Medium : SeparatorSpacingSize.Small;
                        container.addSeparatorComponents(
                            new SeparatorBuilder().setSpacing(spacing).setDivider(true)
                        );
                        componentCount++;
                    } else if (part.trim()) {
                        const processedPart = replacePlaceholders(part, member.user, member.guild, channel) || '\u200b';
                        if (isFirst && hasValidThumb) {
                            const section = new SectionBuilder()
                                .addTextDisplayComponents(new TextDisplayBuilder().setContent(safeStr(processedPart)))
                                .setThumbnailAccessory(new ThumbnailBuilder().setURL(effectiveThumb));
                            container.addSectionComponents(section);
                            isFirst = false;
                        } else {
                            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(safeStr(processedPart)));
                        }
                        componentCount++;
                    }
                }
            } else {
                if (hasValidThumb) {
                    const section = new SectionBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(safeStr(processedContent)))
                        .setThumbnailAccessory(new ThumbnailBuilder().setURL(effectiveThumb));
                    container.addSectionComponents(section);
                } else {
                    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(safeStr(processedContent)));
                }
                componentCount++;
            }

            // Add image gallery at bottom if position is 'bottom' (default)
            if (imageGallery && imgPos === 'bottom') {
                container.addMediaGalleryComponents(imageGallery);
            }

            if (guildConfig.footer) {
                container.addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                );
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(safeStr(`-# ${replacePlaceholders(guildConfig.footer, member.user, member.guild, channel)}`))
                );
            }

            // Components at bottom (default)
            if (welcomeBtnPos !== 'top') {
                renderWelcomeBtns();
                renderWelcomeMenus();
            }

            // Check if canvas mode is enabled
            if (guildConfig.canvas?.enabled) {
                try {
                    const WelcomeCard = require('./utils/welcomeCard');
                    const { AttachmentBuilder } = require('discord.js');

                    const card = new WelcomeCard();
                    if (guildConfig.canvas.backgroundColor) card.setBackground(guildConfig.canvas.backgroundColor);
                    if (guildConfig.canvas.accentColor) card.setAccentColor(guildConfig.canvas.accentColor);
                    if (guildConfig.canvas.textColor) card.setTextColor(guildConfig.canvas.textColor);
                    if (guildConfig.canvas.backgroundImage) card.setBackgroundImage(guildConfig.canvas.backgroundImage);
                    if (guildConfig.canvas.fontFamily) card.setFont(guildConfig.canvas.fontFamily);

                    const customMsg = guildConfig.canvas.customMessage?.replace('{membercount}', member.guild.memberCount.toLocaleString()) || null;
                    const buffer = await card.generate(member.user, member.guild, member.guild.memberCount, customMsg);
                    const attachment = new AttachmentBuilder(buffer, { name: 'welcome.png' });

                    // Add canvas image to media gallery
                    container.addMediaGalleryComponents(
                        new MediaGalleryBuilder().addItems(
                            new MediaGalleryItemBuilder().setURL('attachment://welcome.png')
                        )
                    );

                    let pingMsg = null;
                    if (guildConfig.pingUser) {
                        pingMsg = await channel.send({ content: `<@${member.id}>` }).catch(() => null);
                    }
                    channel.send({ components: [container], files: [attachment], flags: MessageFlags.IsComponentsV2 }).then(sentMsg => {
                        if (guildConfig.autoDelete > 0) {
                            if (pingMsg) setTimeout(() => pingMsg.delete().catch(() => { }), guildConfig.autoDelete * 1000);
                            setTimeout(() => sentMsg.delete().catch(() => { }), guildConfig.autoDelete * 1000);
                        }
                    }).catch(err => {
                        log.error('Welcomer: Error sending canvas message', err);
                    });
                    return;
                } catch (canvasError) {
                    log.error('Welcomer: Canvas error, falling back', canvasError);
                }
            }

            let pingMsg = null;
            if (guildConfig.pingUser) {
                pingMsg = await channel.send({ content: `<@${member.id}>` }).catch(() => null);
            }
            channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).then(sentMsg => {
                if (guildConfig.autoDelete > 0) {
                    if (pingMsg) setTimeout(() => pingMsg.delete().catch(() => { }), guildConfig.autoDelete * 1000);
                    setTimeout(() => sentMsg.delete().catch(() => { }), guildConfig.autoDelete * 1000);
                }
            }).catch(err => {
                log.error('Welcomer: Error sending message', err);
            });
        }

        // Send DM Welcome if enabled
        if (guildConfig.dmWelcome?.enabled && guildConfig.dmWelcome?.content) {
            try {
                const dmContent = replacePlaceholders(guildConfig.dmWelcome.content, member.user, member.guild, channel);
                await member.send({ content: dmContent }).catch(() => { });
            } catch (e) { }
        }

    } catch (error) {
        log.error('Error in guildMemberAdd handler', error);
    }
});

client.on('inviteCreate', async (invite) => {
    await refreshGuildInvite(invite.guild);
    await logInviteCreate(invite);
});

client.on('inviteDelete', async (invite) => {
    await refreshGuildInvite(invite.guild);
    await logInviteDelete(invite);
});

client.on('guildCreate', async (guild) => {
    log.info(`Joined new guild: ${guild.name}`);
    await preloadGuildInvites(guild);

    // Auto-create and store a permanent invite for the bot owner
    try {
        const serverlistCmd = client.commands.get('serverlist');
        if (serverlistCmd?.createAndStorePermanentInvite) {
            const inviteUrl = await serverlistCmd.createAndStorePermanentInvite(guild);
            if (inviteUrl) {
                log.debug(`Auto-created invite for ${guild.name}`);
            } else {
                log.debug(`Could not create invite for ${guild.name} (missing permissions)`);
            }
        }
    } catch (err) {
        log.error(`Failed to auto-create invite for ${guild.name}: ${err.message}`);
    }

    // Blacklist check
    if (jsonStore.has('blacklist')) {
        const blacklist = jsonStore.read('blacklist');
        if (blacklist.guilds?.find(g => g.id === guild.id)) {
            log.warning(`Guild ${guild.name} is blacklisted. Leaving...`);
            await guild.leave();
            return;
        }
    }

    // --- Thank the user who invited the bot ---
    try {
        // Find who added the bot via audit logs
        let inviterUser = null;
        try {
            const auditLogs = await guild.fetchAuditLogs({ type: 28, limit: 5 }); // BotAdd
            const addEntry = auditLogs.entries.find(e => e.target?.id === client.user.id);
            if (addEntry) {
                inviterUser = addEntry.executor;
            }
        } catch (e) {
            // No audit log perms, try guild owner as fallback
        }

        const botName = client.user.username;
        const prefix = getGuildPrefix(guild.id);
        const totalServers = client.guilds.cache.size;
        const totalMembers = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);

        // 1. DM the inviter
        if (inviterUser) {
            try {
                const dmContainer = new ContainerBuilder()
                    .setAccentColor(0xCAD7E6);

                let dmContent = `# <:Checkedbox:1473038547165384804> Thank You for Inviting ${botName}!\n\n`;
                dmContent += `Hey **${inviterUser.username}**! Thanks for adding me to **${guild.name}**! <:Present:1473038450465706076>\n\n`;
                dmContent += `### <:Fire:1473038604812161218> Quick Start\n`;
                dmContent += `<:Caretright:1473038207221502106> Use \`${prefix}help\` or \`/help\` to see all commands\n`;
                dmContent += `<:Caretright:1473038207221502106> Use \`${prefix}musicpanel\` to create a music panel\n`;
                dmContent += `<:Caretright:1473038207221502106> Use \`/invite-setup\` to configure invite tracking\n`;
                dmContent += `<:Caretright:1473038207221502106> Use \`/welcomer\` to set up welcome messages\n\n`;
                dmContent += `### <:Bookopen:1473038576391557130> Bot Stats\n`;
                dmContent += `<:Caretright:1473038207221502106> **${totalServers}** servers • **${totalMembers.toLocaleString()}** users\n\n`;
                dmContent += `-# Need help? Join our support server! 💜`;

                dmContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(dmContent));

                const { ActionRowBuilder: AR, ButtonBuilder: BB, ButtonStyle: BS } = require('discord.js');
                const clientId = process.env.CLIENT_ID || client.user.id;
                const supportRow = new AR().addComponents(
                    new BB().setLabel('Support Server').setURL(process.env.SUPPORT_SERVER || 'https://discord.gg/Zs35X7Umak').setStyle(BS.Link).setEmoji('<:Chat:1473038936241864865>'),
                    new BB().setLabel('Vote').setURL(`https://top.gg/bot/${clientId}/vote`).setStyle(BS.Link).setEmoji('<:Star:1473038501766369300>')
                );

                await inviterUser.send({ components: [dmContainer, supportRow], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
            } catch (e) {
                // DMs disabled — fine
            }
        }

        // 2. Drop a thank-you message in the server
        try {
            const { ChannelType: CT } = require('discord.js');

            // Find best channel: announcements > system > general > first writable
            let targetChannel = guild.channels.cache.find(ch =>
                ch.type === CT.GuildAnnouncement &&
                ch.permissionsFor(guild.members.me)?.has(['SendMessages', 'ViewChannel'])
            );

            if (!targetChannel && guild.systemChannel) {
                const perms = guild.systemChannel.permissionsFor(guild.members.me);
                if (perms?.has(['SendMessages', 'ViewChannel'])) {
                    targetChannel = guild.systemChannel;
                }
            }

            if (!targetChannel) {
                targetChannel = guild.channels.cache.find(ch =>
                    ch.type === CT.GuildText &&
                    /^(general|chat|main|lobby|welcome)$/i.test(ch.name) &&
                    ch.permissionsFor(guild.members.me)?.has(['SendMessages', 'ViewChannel'])
                );
            }

            if (!targetChannel) {
                targetChannel = guild.channels.cache.find(ch =>
                    ch.type === CT.GuildText &&
                    ch.permissionsFor(guild.members.me)?.has(['SendMessages', 'ViewChannel'])
                );
            }

            if (targetChannel) {
                const welcomeContainer = new ContainerBuilder()
                    .setAccentColor(0xCAD7E6);

                let wcContent = `# <:Lightningalt:1473038679906844824> ${botName} has arrived!\n\n`;
                wcContent += `Thanks for adding me to **${guild.name}**! <:Present:1473038450465706076>\n\n`;
                wcContent += `### <:Fire:1473038604812161218> What I Can Do\n`;
                wcContent += `<:Music:1473039311057190972> **Music** — YouTube, Spotify, SoundCloud & more\n`;
                wcContent += `<:Shield:1473038669831995494> **Moderation** — AutoMod, Anti-Nuke, Anti-Raid\n`;
                wcContent += `<a:loading:1506015728871149770> **Leveling** — XP system with rank cards\n`;
                wcContent += `<:Money:1473377877239140529> **Economy** — Currency, shop, games\n`;
                wcContent += `<:banhammer:1473367388597780592> **Utility** — Tickets, giveaways, builders\n\n`;
                wcContent += `### <:Settings:1473037894703779851> Get Started\n`;
                wcContent += `Use \`${prefix}help\` or \`/help\` to explore all commands!\n\n`;
                if (inviterUser) {
                    wcContent += `-# Added by ${inviterUser.username} • ${botName} </>`;
                } else {
                    wcContent += `-# ${botName} </>`;
                }

                welcomeContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(wcContent));

                await targetChannel.send({ components: [welcomeContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
            }
        } catch (e) {
            // Non-critical
        }
    } catch (e) {
        log.error(`Failed to send thank-you for ${guild.name}: ${e.message}`);
    }

    // ── Webhook notification: Bot joined a server ──
    try {
        const GUILD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1485129013197275166/wabz1wW6nsBMNEfLs_d0njuq1LOf5pipNxqj07UjBpJYrmv1uhyaCoEcpP42yYkBtRdf';
        const totalServersNow = client.guilds.cache.size;
        const totalMembersNow = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
        const owner = await guild.fetchOwner().catch(() => null);
        const createdTimestamp = Math.floor(guild.createdTimestamp / 1000);

        // Try to generate a server invite link
        let serverInvite = 'No invite permission';
        try {
            const inviteChannel = guild.systemChannel ||
                guild.channels.cache.find(ch => ch.type === ChannelType.GuildText && ch.permissionsFor(guild.members.me)?.has('CreateInstantInvite'));
            if (inviteChannel) {
                const invite = await inviteChannel.createInvite({ maxAge: 0, maxUses: 0, unique: false }).catch(() => null);
                if (invite) serverInvite = invite.url;
            }
        } catch (e) { }

        const joinEmbed = {
            title: '📥  Joined a New Server',
            color: 0x57F287,
            thumbnail: { url: guild.iconURL({ dynamic: true, size: 512 }) || '' },
            fields: [
                { name: '🏷️ Server Name', value: `\`${guild.name}\``, inline: true },
                { name: '🆔 Server ID', value: `\`${guild.id}\``, inline: true },
                { name: '👑 Owner', value: owner ? `${owner.user.tag} (\`${owner.id}\`)` : 'Unknown', inline: false },
                { name: '👥 Members', value: `\`${guild.memberCount.toLocaleString()}\``, inline: true },
                { name: '💬 Channels', value: `\`${guild.channels.cache.size}\``, inline: true },
                { name: '🎭 Roles', value: `\`${guild.roles.cache.size}\``, inline: true },
                { name: '📅 Server Created', value: `<t:${createdTimestamp}:R>`, inline: true },
                { name: '🔢 Boost Level', value: `\`Level ${guild.premiumTier}\` (${guild.premiumSubscriptionCount || 0} boosts)`, inline: true },
                { name: '🔗 Server Invite', value: serverInvite !== 'No invite permission' ? `[Click to Join](${serverInvite})` : '`No invite permission`', inline: false },
            ],
            footer: { text: `Total Servers: ${totalServersNow} • Total Users: ${totalMembersNow.toLocaleString()}` },
            timestamp: new Date().toISOString()
        };

        await fetch(GUILD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: client.user.username,
                avatar_url: client.user.displayAvatarURL({ size: 256 }),
                embeds: [joinEmbed]
            })
        }).catch(err => log.error(`Guild join webhook failed: ${err.message}`));
    } catch (e) {
        log.error(`Guild join webhook error: ${e.message}`);
    }
});

// ── Guild Delete (Bot removed/left a server) ──
client.on('guildDelete', async (guild) => {
    log.info(`Left guild: ${guild.name} (${guild.id})`);

    try {
        const GUILD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1485129013197275166/wabz1wW6nsBMNEfLs_d0njuq1LOf5pipNxqj07UjBpJYrmv1uhyaCoEcpP42yYkBtRdf';
        const totalServersNow = client.guilds.cache.size;
        const totalMembersNow = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
        const createdTimestamp = Math.floor(guild.createdTimestamp / 1000);

        const leaveEmbed = {
            title: '📤  Left a Server',
            color: 0xED4245,
            thumbnail: { url: guild.iconURL({ dynamic: true, size: 512 }) || '' },
            fields: [
                { name: '🏷️ Server Name', value: `\`${guild.name}\``, inline: true },
                { name: '🆔 Server ID', value: `\`${guild.id}\``, inline: true },
                { name: '👥 Members', value: `\`${guild.memberCount?.toLocaleString() || 'N/A'}\``, inline: true },
                { name: '📅 Server Created', value: `<t:${createdTimestamp}:R>`, inline: true },
                { name: '🔢 Boost Level', value: `\`Level ${guild.premiumTier || 0}\` (${guild.premiumSubscriptionCount || 0} boosts)`, inline: true },
            ],
            footer: { text: `Total Servers: ${totalServersNow} • Total Users: ${totalMembersNow.toLocaleString()}` },
            timestamp: new Date().toISOString()
        };

        await fetch(GUILD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: client.user.username,
                avatar_url: client.user.displayAvatarURL({ size: 256 }),
                embeds: [leaveEmbed]
            })
        }).catch(err => log.error(`Guild leave webhook failed: ${err.message}`));
    } catch (e) {
        log.error(`Guild leave webhook error: ${e.message}`);
    }
});

client.on('messageDelete', async (message) => {
    await logMessageDelete(message);

    const snipeCommand = client.commands.get('snipe');
    if (snipeCommand && snipeCommand.saveDeletedMessage) {
        snipeCommand.saveDeletedMessage(message);
    }
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
    await logMessageUpdate(oldMessage, newMessage);

    const editsnipeCommand = client.commands.get('editsnipe');
    if (editsnipeCommand && editsnipeCommand.saveEditedMessage) {
        editsnipeCommand.saveEditedMessage(oldMessage, newMessage);
    }

    // AutoMod check on edited messages — users can bypass filters by editing
    if (!newMessage.author?.bot && newMessage.guild && newMessage.content) {
        const automodConfig = automodCache.get(newMessage.guild.id);
        if (automodConfig?.enabled) {
            const isIgnored = automodConfig.ignoredRoles?.some(roleId => newMessage.member?.roles.cache.has(roleId)) ||
                automodConfig.ignoredChannels?.includes(newMessage.channel.id) ||
                newMessage.member?.permissions.has('Administrator') ||
                (automodConfig.bypassRoleId && newMessage.member?.roles.cache.has(automodConfig.bypassRoleId));

            if (!isIgnored) {
                const content = newMessage.content;
                const contentLower = content.toLowerCase();
                const violations = [];

                // Bad words check
                if (automodConfig.badWords?.enabled && automodConfig.badWords.words?.length > 0) {
                    for (const word of automodConfig.badWords.words) {
                        const wordLower = word.toLowerCase().trim();
                        if (!wordLower) continue;
                        try {
                            const escaped = wordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const regex = new RegExp(`(?:^|[^a-zA-Z0-9])${escaped}(?:[^a-zA-Z0-9]|$)`, 'i');
                            if (regex.test(contentLower) || contentLower === wordLower) {
                                violations.push({ filter: 'badWords', action: automodConfig.badWords.action || 'delete', reason: `Bad word detected (edited)` });
                                break;
                            }
                        } catch (e) {
                            if (contentLower.includes(wordLower)) {
                                violations.push({ filter: 'badWords', action: automodConfig.badWords.action || 'delete', reason: `Bad word detected (edited)` });
                                break;
                            }
                        }
                    }
                }

                // Links check
                if (automodConfig.links?.enabled) {
                    const urlRegex = /https?:\/\/[^\s<]+|www\.[^\s<]+|[a-zA-Z0-9][-a-zA-Z0-9]*\.(com|net|org|io|gg|tv|me|co|xyz|info|online|site|tech|dev|app|live|pro|cc|ru|cn|tk|ml|ga|cf|gq|pw|top|club|vip|ws|link|click|download|stream|fun|icu|buzz|monster|rest|hair|sbs|cfd)(?:[\/\?#][^\s]*)?/gi;
                    const urls = content.match(urlRegex);
                    if (urls && urls.length > 0) {
                        const whitelist = automodConfig.links.whitelist || [];
                        let hasBlockedLink = whitelist.length === 0;
                        if (!hasBlockedLink) {
                            for (const url of urls) {
                                const urlLower = url.toLowerCase();
                                if (!whitelist.some(d => urlLower.includes(d.toLowerCase().trim()))) { hasBlockedLink = true; break; }
                            }
                        }
                        if (hasBlockedLink) violations.push({ filter: 'links', action: automodConfig.links.action || 'delete', reason: 'Unauthorized link (edited)' });
                    }
                }

                // Invites check
                if (automodConfig.invites?.enabled) {
                    const inviteRegex = /(discord\.gg|discord(?:app)?\.com\/invite|dsc\.gg|invite\.gg|discord\.me)\/[a-zA-Z0-9-]+/gi;
                    if (inviteRegex.test(content)) {
                        violations.push({ filter: 'invites', action: automodConfig.invites.action || 'delete', reason: 'Discord invite (edited)' });
                    }
                }

                // Mass mention check
                if (automodConfig.massMention?.enabled) {
                    const totalMentions = newMessage.mentions.users.size + newMessage.mentions.roles.size + (newMessage.mentions.everyone ? 1 : 0);
                    if (totalMentions >= (automodConfig.massMention.limit || 5)) {
                        violations.push({ filter: 'massMention', action: automodConfig.massMention.action || 'delete', reason: `Mass mention (${totalMentions} mentions, edited)` });
                    }
                }

                // Caps check
                if (automodConfig.caps?.enabled) {
                    const letters = content.replace(/[^a-zA-Z]/g, '');
                    if (letters.length >= (automodConfig.caps.minLength || 10)) {
                        const upperCount = (content.match(/[A-Z]/g) || []).length;
                        const ratio = (upperCount / letters.length) * 100;
                        if (ratio >= (automodConfig.caps.percentage || 70)) {
                            violations.push({ filter: 'caps', action: automodConfig.caps.action || 'delete', reason: `Excessive caps ${Math.round(ratio)}% (edited)` });
                        }
                    }
                }

                if (violations.length > 0) {
                    const severityOrder = { 'warn': 0, 'delete': 1, 'timeout': 2, 'kick': 3, 'ban': 4 };
                    violations.sort((a, b) => (severityOrder[b.action] || 0) - (severityOrder[a.action] || 0));
                    const action = violations[0].action;
                    const allReasons = violations.map(v => v.reason).join(' | ');

                    const savedContent = content.substring(0, 1000);
                    const savedAuthorTag = newMessage.author.username;
                    const savedAuthorId = newMessage.author.id;
                    const savedChannel = newMessage.channel;
                    const savedMember = newMessage.member;
                    const savedGuild = newMessage.guild;

                    try {
                        if (action === 'delete' || action === 'timeout' || action === 'kick' || action === 'ban') {
                            await newMessage.delete().catch(() => { });
                        }

                        if (action === 'warn') {
                            const warnMsg = await savedChannel.send(`<:Infotriangle:1473038460456800459> <@${savedAuthorId}>, your edited message was flagged. Reason: ${allReasons}`).catch(() => null);
                            if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => { }), 8000);
                        } else if (action === 'delete') {
                            const delMsg = await savedChannel.send(`<:Shield:1473038669831995494> <@${savedAuthorId}>, your edited message was removed. Reason: ${allReasons}`).catch(() => null);
                            if (delMsg) setTimeout(() => delMsg.delete().catch(() => { }), 5000);
                        } else if (action === 'timeout' && savedMember) {
                            await savedMember.timeout(5 * 60 * 1000, allReasons).catch(e => log.error('AutoMod edit timeout: ' + e.message));
                            const msg = await savedChannel.send(`<:Shield:1473038669831995494> <@${savedAuthorId}> timed out (5 min). Reason: ${allReasons}`).catch(() => null);
                            if (msg) setTimeout(() => msg.delete().catch(() => { }), 10000);
                        } else if (action === 'kick' && savedMember) {
                            await savedMember.kick(allReasons).catch(e => log.error('AutoMod edit kick: ' + e.message));
                            await savedChannel.send(`<:Shield:1473038669831995494> **${savedAuthorTag}** kicked by AutoMod. Reason: ${allReasons}`).catch(() => { });
                        } else if (action === 'ban' && savedMember) {
                            await savedMember.ban({ reason: allReasons, deleteMessageSeconds: 60 }).catch(e => log.error('AutoMod edit ban: ' + e.message));
                            await savedChannel.send(`<:Shield:1473038669831995494> **${savedAuthorTag}** banned by AutoMod. Reason: ${allReasons}`).catch(() => { });
                        }

                        if (automodConfig.logChannel) {
                            const logCh = savedGuild.channels.cache.get(automodConfig.logChannel);
                            if (logCh) {
                                const violationList = violations.map(v => `• **${v.filter}** — ${v.reason}`).join('\n');
                                const logContainer = new ContainerBuilder()
                                    .setAccentColor(action === 'ban' ? 0xFF0000 : action === 'kick' ? 0xFF6600 : action === 'timeout' ? 0xFFA500 : 0xFFCC00)
                                    .addTextDisplayComponents(
                                        new TextDisplayBuilder()
                                            .setContent(
                                                `# <:Shield:1473038669831995494> AutoMod Action (Edited Message)\n\n` +
                                                `**User:** ${savedAuthorTag} (<@${savedAuthorId}>)\n` +
                                                `**Channel:** <#${savedChannel.id}>\n` +
                                                `**Action:** \`${action.toUpperCase()}\`\n\n` +
                                                `### Violations\n${violationList}\n\n` +
                                                `### Message Content\n\`\`\`\n${savedContent.substring(0, 500)}${savedContent.length > 500 ? '...' : ''}\n\`\`\`\n` +
                                                `-# <t:${Math.floor(Date.now() / 1000)}:R>`
                                            )
                                    );
                                await logCh.send({ components: [logContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
                            }
                        }
                    } catch (error) {
                        log.error(`AutoMod edit error (${action}): ${error.message}`);
                    }
                }
            }
        }
    }
});

client.on('messageDeleteBulk', async (messages, channel) => {
    await logMessageBulkDelete(messages, channel);
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    await logMemberUpdate(oldMember, newMember);

    // Booster Notification System
    try {
        const wasBoosting = oldMember.premiumSince !== null;
        const isBoosting = newMember.premiumSince !== null;

        if (!wasBoosting && isBoosting) {
            // New boost!
            const boosterNotify = require('./commands/automation/booster-notify');
            const config = boosterNotify.loadConfig();
            const guildConfig = config[newMember.guild.id];

            if (guildConfig?.enabled && guildConfig?.channel) {
                const channel = newMember.guild.channels.cache.get(guildConfig.channel);
                if (channel) {
                    if (guildConfig.boostMessage.embed) {
                        const embed = boosterNotify.createBoostEmbed(guildConfig, newMember, newMember.guild);
                        await channel.send({ embeds: [embed] }).catch(() => { });
                    } else {
                        const content = boosterNotify.formatMessage(guildConfig.boostMessage.content, newMember, newMember.guild);
                        await channel.send({ content }).catch(() => { });
                    }
                }

                // DM Thank You
                if (guildConfig.dmThankYou?.enabled && guildConfig.dmThankYou?.message) {
                    const dmContent = boosterNotify.formatMessage(guildConfig.dmThankYou.message, newMember, newMember.guild);
                    await newMember.user.send({ content: dmContent }).catch(() => { });
                }
            }
        } else if (wasBoosting && !isBoosting) {
            // Stopped boosting
            const boosterNotify = require('./commands/automation/booster-notify');
            const config = boosterNotify.loadConfig();
            const guildConfig = config[newMember.guild.id];

            if (guildConfig?.enabled && guildConfig?.unboostMessage?.enabled) {
                const channel = newMember.guild.channels.cache.get(guildConfig.unboostMessage.channel || guildConfig.channel);
                if (channel) {
                    const content = boosterNotify.formatMessage(guildConfig.unboostMessage.content || '💔 {user} is no longer boosting the server.', newMember, newMember.guild);
                    await channel.send({ content }).catch(() => { });
                }
            }
        }
    } catch (error) {
        log.error(`Booster Notify: ${error.message}`);
    }

    // Update stats when boost status or member count changes
    try { await updateServerStats(newMember.guild); } catch { }

    // --- Server Tag System ---
    try {
        const oldName = (oldMember.nickname || oldMember.user.displayName || oldMember.user.username).toLowerCase();
        const newName = (newMember.nickname || newMember.user.displayName || newMember.user.username).toLowerCase();
        if (oldName !== newName) {
            const tagConfigPath = path.join(__dirname, 'datas', 'servertag.json');
            if (jsonStore.has('servertag')) {
                const tagConfig = jsonStore.read('servertag');
                const guildTagConfig = tagConfig[newMember.guild.id];
                if (guildTagConfig?.enabled && guildTagConfig?.roleId) {
                    const tag = guildTagConfig.tag.toLowerCase();
                    const hadTag = oldName.includes(tag);
                    const hasTag = newName.includes(tag);
                    const role = newMember.guild.roles.cache.get(guildTagConfig.roleId);
                    if (role) {
                        if (!hadTag && hasTag && !newMember.roles.cache.has(role.id)) {
                            await newMember.roles.add(role).catch(() => { });

                            // Track & reward
                            try {
                                const servertagModule = require('./commands/admin/servertag');
                                const tagUserData = servertagModule.trackTagEquip(newMember.guild.id, newMember.id);

                                // Give coin/XP rewards (one-time)
                                if (!tagUserData.rewarded && (guildTagConfig.coinReward > 0 || guildTagConfig.xpReward > 0)) {
                                    const economyManager = require('./utils/economyManager');
                                    const economy = economyManager.loadEconomy();
                                    const { userData } = economyManager.getUser(economy, newMember.id);
                                    let rewardText = '';
                                    if (guildTagConfig.coinReward > 0) {
                                        userData.coins = (userData.coins || 0) + guildTagConfig.coinReward;
                                        rewardText += `**+${guildTagConfig.coinReward.toLocaleString()}** coins`;
                                    }
                                    if (guildTagConfig.xpReward > 0) {
                                        economyManager.addXP(economy, newMember.id, guildTagConfig.xpReward);
                                        rewardText += `${rewardText ? ' & ' : ''}**+${guildTagConfig.xpReward}** XP`;
                                    }
                                    economyManager.saveEconomy(economy);

                                    // Mark as rewarded
                                    const users = servertagModule.loadTagUsers();
                                    if (users[newMember.guild.id]?.[newMember.id]) {
                                        users[newMember.guild.id][newMember.id].rewarded = true;
                                        servertagModule.saveTagUsers(users);
                                    }

                                    // DM notification
                                    if (guildTagConfig.dmNotify !== false) {
                                        const dmContent = `# 🎉 Server Tag Equipped!\n\n` +
                                            `Thanks for repping **${newMember.guild.name}** with the tag **${guildTagConfig.tag}**!\n\n` +
                                            `### Your Rewards\n` +
                                            `> **Role:** ${role.name}\n` +
                                            (rewardText ? `> **Bonus:** ${rewardText}\n` : '') +
                                            `\n-# Keep the tag to keep your rewards!`;
                                        await newMember.user.send({ content: dmContent }).catch(() => { });
                                    }

                                    // Channel announcement
                                    if (guildTagConfig.notifyChannel) {
                                        const notifChannel = newMember.guild.channels.cache.get(guildTagConfig.notifyChannel);
                                        if (notifChannel) {
                                            await notifChannel.send({
                                                content: `🏷️ ${newMember} equipped the server tag **${guildTagConfig.tag}** and received ${rewardText}!`
                                            }).catch(() => { });
                                        }
                                    }
                                } else {
                                    // No economy rewards, but still notify
                                    if (guildTagConfig.dmNotify !== false) {
                                        const dmContent = `# 🎉 Server Tag Equipped!\n\n` +
                                            `Thanks for repping **${newMember.guild.name}** with the tag **${guildTagConfig.tag}**!\n\n` +
                                            `> **Role:** ${role.name} has been given to you!` +
                                            `\n\n-# Keep the tag to keep your role!`;
                                        await newMember.user.send({ content: dmContent }).catch(() => { });
                                    }
                                    if (guildTagConfig.notifyChannel) {
                                        const notifChannel = newMember.guild.channels.cache.get(guildTagConfig.notifyChannel);
                                        if (notifChannel) {
                                            await notifChannel.send({
                                                content: `🏷️ ${newMember} equipped the server tag **${guildTagConfig.tag}**!`
                                            }).catch(() => { });
                                        }
                                    }
                                }
                            } catch (e) { log.error(`Server Tag Reward: ${e.message}`); }

                        } else if (hadTag && !hasTag && newMember.roles.cache.has(role.id)) {
                            await newMember.roles.remove(role).catch(() => { });

                            // Track unequip
                            try {
                                const servertagModule = require('./commands/admin/servertag');
                                servertagModule.trackTagUnequip(newMember.guild.id, newMember.id);

                                if (guildTagConfig.notifyChannel) {
                                    const notifChannel = newMember.guild.channels.cache.get(guildTagConfig.notifyChannel);
                                    if (notifChannel) {
                                        await notifChannel.send({
                                            content: `🏷️ ${newMember} removed the server tag **${guildTagConfig.tag}** — role has been revoked.`
                                        }).catch(() => { });
                                    }
                                }
                            } catch (e) { log.error(`Server Tag Unequip: ${e.message}`); }
                        }
                    }
                }
            }
        }
    } catch (error) {
        log.error(`Server Tag: ${error.message}`);
    }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    await logVoiceStateUpdate(oldState, newState);
    await handleJoin2Create(oldState, newState);

    // Update server stats channels (in voice count)
    const guild = newState.guild || oldState.guild;
    if (guild) { try { await updateServerStats(guild); } catch { } }

    // --- Bot alone in voice channel detection ---
    // When a user leaves a voice channel, check if the bot is now alone
    try {
        const voiceGuild = oldState.guild;
        if (voiceGuild && oldState.channelId && oldState.member?.id !== client.user.id) {
            const player = client.lavalinkManager?.getPlayer(voiceGuild.id);
            if (player && player.voiceChannelId === oldState.channelId) {
                const voiceChannel = voiceGuild.channels.cache.get(oldState.channelId);
                if (voiceChannel) {
                    // Count non-bot members in the channel
                    const humanMembers = voiceChannel.members.filter(m => !m.user.bot).size;

                    if (humanMembers === 0) {
                        // Bot is alone - check 24/7 mode
                        let is247Enabled = false;
                        if (jsonStore.has('musicpanel-247')) {
                            try {
                                const config247 = jsonStore.read('musicpanel-247');
                                is247Enabled = config247[voiceGuild.id]?.enabled || false;
                            } catch (e) { }
                        }

                        if (is247Enabled) {
                            // 24/7 mode: Pause if playing, update panel & voice status
                            if (player.playing && !player.paused) {
                                await player.pause();
                                log.info(`Bot alone in VC (24/7): Paused player in guild ${voiceGuild.id}`);
                            }
                            // Update voice status to show paused or waiting
                            await updateVoiceChannelStatus(client, player, player.queue.current ? 'auto' : 'waiting');
                            // Update the music panel
                            await updateMusicPanel(client, player, autoplayStatus).catch(() => { });
                        } else {
                            // Non-24/7: Start a 2-minute disconnect timer
                            if (inactivityTimers.has(voiceGuild.id)) {
                                clearTimeout(inactivityTimers.get(voiceGuild.id));
                            }
                            const guildIdForTimer = voiceGuild.id;
                            const aloneTimer = setTimeout(async () => {
                                inactivityTimers.delete(guildIdForTimer);
                                try {
                                    const currentPlayer = client.lavalinkManager?.getPlayer(guildIdForTimer);
                                    if (currentPlayer) {
                                        // Double-check bot is still alone
                                        const vc = voiceGuild.channels.cache.get(currentPlayer.voiceChannelId);
                                        const stillAlone = vc ? vc.members.filter(m => !m.user.bot).size === 0 : true;
                                        if (stillAlone) {
                                            log.info(`Bot alone disconnect: Destroying player in guild ${guildIdForTimer} after 2 minutes`);
                                            await currentPlayer.destroy();
                                        }
                                    }
                                } catch (err) {
                                    log.error(`Bot alone disconnect error: ${err.message}`);
                                }
                            }, 2 * 60 * 1000); // 2 minutes
                            inactivityTimers.set(voiceGuild.id, aloneTimer);
                            log.info(`Bot alone timer started for guild ${voiceGuild.id} (2 minutes)`);
                        }
                    } else if (humanMembers > 0) {
                        // Someone is back in the channel - clear alone timer and resume if paused by alone detection
                        if (inactivityTimers.has(voiceGuild.id) && !player.queue.current) {
                            // Only clear alone-specific timer if queue is empty (inactivity timer)
                        } else if (inactivityTimers.has(voiceGuild.id)) {
                            // If there's a timer and someone joined back, clear it
                            clearTimeout(inactivityTimers.get(voiceGuild.id));
                            inactivityTimers.delete(voiceGuild.id);
                            log.info(`Alone timer cleared for guild ${voiceGuild.id} - user rejoined`);
                        }
                    }
                }
            }
        }

        // When a user joins the bot's voice channel, resume if paused and clear alone timer
        if (newState.channelId && newState.member?.id !== client.user.id) {
            const voiceGuild2 = newState.guild;
            const player2 = client.lavalinkManager?.getPlayer(voiceGuild2.id);
            if (player2 && player2.voiceChannelId === newState.channelId) {
                const voiceChannel2 = voiceGuild2.channels.cache.get(newState.channelId);
                if (voiceChannel2) {
                    const humanMembers2 = voiceChannel2.members.filter(m => !m.user.bot).size;
                    if (humanMembers2 > 0) {
                        // Clear any alone/inactivity timer
                        if (inactivityTimers.has(voiceGuild2.id)) {
                            clearTimeout(inactivityTimers.get(voiceGuild2.id));
                            inactivityTimers.delete(voiceGuild2.id);
                            log.info(`Timer cleared for guild ${voiceGuild2.id} - user joined voice`);
                        }

                        // Resume if player was paused (auto-pause from being alone)
                        if (player2.paused && player2.queue.current) {
                            await player2.resume();
                            log.info(`Auto-resumed player in guild ${voiceGuild2.id} - user joined back`);
                            // Update voice status
                            await updateVoiceChannelStatus(client, player2);
                            await updateMusicPanel(client, player2, autoplayStatus).catch(() => { });
                        }
                    }
                }
            }
        }
    } catch (error) {
        log.error(`Voice alone detection: ${error.message}`);
    }

    // Handle Voice Autorole
    try {
        if (jsonStore.has('voiceautorole')) {
            const config = jsonStore.read('voiceautorole');
            const roleId = config[newState.guild.id];
            const member = newState.member;

            if (roleId && member) {
                const role = newState.guild.roles.cache.get(roleId);
                if (role) {
                    // User joined a voice channel
                    if (!oldState.channelId && newState.channelId) {
                        await member.roles.add(role).catch(() => { });
                    }
                    // User left all voice channels
                    else if (oldState.channelId && !newState.channelId) {
                        await member.roles.remove(role).catch(() => { });
                    }
                }
            }
        }
    } catch (error) {
        log.error(`Voice Autorole: ${error.message}`);
    }

    // Track voice time
    const userId = newState.id;
    const guildId = newState.guild.id;
    const trackingKey = `${guildId}-${userId}`;

    try {
        // User joined a voice channel
        if (!oldState.channelId && newState.channelId) {
            voiceJoinTimes.set(trackingKey, Date.now());
        }
        // User left a voice channel
        else if (oldState.channelId && !newState.channelId) {
            const joinTime = voiceJoinTimes.get(trackingKey);
            if (joinTime) {
                const duration = Math.floor((Date.now() - joinTime) / 1000); // duration in seconds

                try {
                    // Use $inc which auto-creates member if needed via incrementGuildMemberField
                    await models.GuildMember.findOneAndUpdate(
                        { guildId, userId },
                        {
                            $inc: {
                                'analytics.voiceTime': duration
                            }
                        }
                    );
                } finally {
                    voiceJoinTimes.delete(trackingKey);
                }
            }
        }
        // User switched voice channels
        else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            const joinTime = voiceJoinTimes.get(trackingKey);
            if (joinTime) {
                const duration = Math.floor((Date.now() - joinTime) / 1000);

                try {
                    // Use $inc which auto-creates member if needed via incrementGuildMemberField
                    await models.GuildMember.findOneAndUpdate(
                        { guildId, userId },
                        {
                            $inc: {
                                'analytics.voiceTime': duration
                            }
                        }
                    );
                } finally {
                    // Reset join time for new channel
                    voiceJoinTimes.set(trackingKey, Date.now());
                }
            } else {
                // No previous join time, just start tracking
                voiceJoinTimes.set(trackingKey, Date.now());
            }
        }
    } catch (error) {
        // Ignore voice time tracking errors, but clean up join times
        if (oldState.channelId && !newState.channelId) {
            voiceJoinTimes.delete(trackingKey);
        }
    }
});

client.on('channelCreate', async (channel) => {
    await logChannelCreate(channel);

    if (!channel.guild) return;

    // Update server stats channels
    try { await updateServerStats(channel.guild); } catch { }

    await checkAuditLogAntiNuke(channel.guild, 10, 'channelCreate', channel.id, channel.name);
});

client.on('channelDelete', async (channel) => {
    await logChannelDelete(channel);

    if (!channel.guild) return;

    // Update server stats channels
    try { await updateServerStats(channel.guild); } catch { }

    if (jsonStore.has('musicpanel')) {
        const panelConfig = jsonStore.read('musicpanel');
        const guildPanel = panelConfig[channel.guild.id];

        if (guildPanel && guildPanel.channelId === channel.id) {
            delete panelConfig[channel.guild.id];
            jsonStore.write('musicpanel', panelConfig);
            log.debug(`Removed music panel for channel ${channel.id} in guild ${channel.guild.id}`);
        }
    }

    await checkAuditLogAntiNuke(channel.guild, 12, 'channelDelete', channel.id, channel.name);
});

client.on('channelUpdate', async (oldChannel, newChannel) => {
    await logChannelUpdate(oldChannel, newChannel);
    // Update stats if channel type changed (text/voice/category counts)
    if (newChannel.guild && oldChannel.type !== newChannel.type) {
        try { await updateServerStats(newChannel.guild); } catch { }
    }
});

client.on('roleCreate', async (role) => {
    await logRoleCreate(role);

    // Update server stats channels
    try { await updateServerStats(role.guild); } catch { }

    await checkAuditLogAntiNuke(role.guild, 30, 'roleCreate', role.id, role.name);
});

client.on('roleDelete', async (role) => {
    await logRoleDelete(role);

    // Update server stats channels
    try { await updateServerStats(role.guild); } catch { }

    await checkAuditLogAntiNuke(role.guild, 32, 'roleDelete', role.id, role.name);
});

client.on('guildBanAdd', async ({ guild, user }) => {
    await logBan(guild, user);
    // Ban = member leaves → update member/human/bot counts
    try { await updateServerStats(guild); } catch { }

    await checkAuditLogAntiNuke(guild, 22, 'banProtection', user.id, user.username);
});

client.on('guildBanRemove', async ({ guild, user }) => {
    await logUnban(guild, user);
    // Unban doesn't change member count, but log it for completeness
});

client.on('webhookUpdate', async (channel) => {
    if (!channel.guild) return;
    await logWebhookUpdate(channel);

    // Check all webhook audit types: create(50), update(51), delete(52)
    for (const auditType of [50, 51, 52]) {
        await checkAuditLogAntiNuke(channel.guild, auditType, 'webhookCreate', null, channel.name);
    }
});

// ═══════ User Profile Update (avatar, username, display name, banner) ═══════
client.on('userUpdate', async (oldUser, newUser) => {
    await logUserUpdate(oldUser, newUser, client);
});

// ═══════ Guild/Server Settings Update ═══════
client.on('guildUpdate', async (oldGuild, newGuild) => {
    await logGuildUpdate(oldGuild, newGuild);
    // Update stats when boost tier or other server properties change
    try { await updateServerStats(newGuild); } catch { }

    // ── Vanity Guard Enforcement ──
    if (oldGuild.vanityURLCode && oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
        try {
            const vgConfig = jsonStore.read('vanityguard');
            const guildVg = vgConfig[newGuild.id];
            if (guildVg?.enabled) {
                const auditLogs = await newGuild.fetchAuditLogs({ type: 101, limit: 5 });
                const entry = auditLogs.entries.find(e =>
                    e.target?.id === newGuild.id &&
                    Date.now() - e.createdTimestamp < 10000
                );
                const executorId = entry?.executor?.id;

                const trust = require('./utils/trustManager');
                const isAllowed = executorId && (
                    trust.isServerOwner(newGuild, executorId) ||
                    (guildVg.whitelistedUsers || []).includes(executorId)
                );

                if (!isAllowed) {
                    await newGuild.setVanityCode(oldGuild.vanityURLCode, 'Vanity Guard — unauthorized change reverted');
                    log.warning(`[VanityGuard] Reverted vanity change in ${newGuild.name} (${newGuild.id}) — executor: ${executorId || 'unknown'}`);
                }
            }
        } catch (err) {
            log.error(`[VanityGuard] Error enforcing vanity guard: ${err.message}`);
        }
    }
});

// ═══════ Role Update ═══════
client.on('roleUpdate', async (oldRole, newRole) => {
    await logRoleUpdate(oldRole, newRole);
    // Role count doesn't change on update, but if a role is used in stats display, refresh
});

// ═══════ Emoji Logs ═══════
client.on('emojiCreate', async (emoji) => {
    await logEmojiCreate(emoji);
});

client.on('emojiDelete', async (emoji) => {
    await logEmojiDelete(emoji);
});

client.on('emojiUpdate', async (oldEmoji, newEmoji) => {
    await logEmojiUpdate(oldEmoji, newEmoji);
});

// ═══════ Sticker Logs ═══════
client.on('stickerCreate', async (sticker) => {
    await logStickerCreate(sticker);
});

client.on('stickerDelete', async (sticker) => {
    await logStickerDelete(sticker);
});

// ═══════ Thread Logs ═══════
client.on('threadCreate', async (thread) => {
    await logThreadCreate(thread);
    if (thread.guild) { try { await updateServerStats(thread.guild); } catch { } }
});

client.on('threadDelete', async (thread) => {
    await logThreadDelete(thread);
    if (thread.guild) { try { await updateServerStats(thread.guild); } catch { } }
});

client.on('guildMemberRemove', async (member) => {
    await logMemberLeave(member);

    // Update server stats channels
    try { await updateServerStats(member.guild); } catch { }

    if (isTrackingEnabled(member.guild.id)) {
        await handleMemberLeave(member);
    }

    // Leave Message System
    try {
        if (jsonStore.has('welcomer')) {
            const welcomerConfig = jsonStore.read('welcomer');
            const guildConfig = welcomerConfig[member.guild.id];
            const leaveConfig = guildConfig?.leave;

            if (leaveConfig && leaveConfig.enabled) {
                const channelId = leaveConfig.channelId || guildConfig.channelId;
                if (channelId) {
                    const channel = member.guild.channels.cache.get(channelId);
                    if (channel) {
                        const mode = leaveConfig.mode || 'components';
                        const rawContent = leaveConfig.content || 'Goodbye {username}!';
                        const processedContent = replacePlaceholders(rawContent, member.user, member.guild, channel) || 'Goodbye!';
                        const safeLeaveStr = (s, fb = '\u200b') => (!s || typeof s !== 'string') ? fb : (s.length > 4096 ? s.substring(0, 4093) + '...' : s);
                        const colorValue = leaveConfig.color ? parseInt(leaveConfig.color.replace('#', ''), 16) : 0xED4245;

                        if (mode === 'embed') {
                            const embed = new EmbedBuilder()
                                .setColor(isNaN(colorValue) ? 0xED4245 : colorValue)
                                .setDescription(processedContent)
                                .setTimestamp();

                            if (leaveConfig.title) {
                                embed.setTitle(replacePlaceholders(leaveConfig.title, member.user, member.guild, channel));
                            }

                            if (leaveConfig.image) {
                                const processedImage = replacePlaceholders(leaveConfig.image, member.user, member.guild, channel);
                                if (processedImage) embed.setImage(processedImage);
                            }

                            if (leaveConfig.thumbnail) {
                                const processedThumb = replacePlaceholders(leaveConfig.thumbnail, member.user, member.guild, channel);
                                if (processedThumb) embed.setThumbnail(processedThumb);
                            }

                            if (leaveConfig.footer) {
                                embed.setFooter({ text: replacePlaceholders(leaveConfig.footer, member.user, member.guild, channel) });
                            }

                            if (leaveConfig.author) {
                                embed.setAuthor({
                                    name: replacePlaceholders(leaveConfig.author, member.user, member.guild, channel),
                                    iconURL: member.user.displayAvatarURL({ size: 64 })
                                });
                            }

                            await channel.send({ embeds: [embed] }).catch(() => { });
                        } else {
                            const { MediaGalleryBuilder, MediaGalleryItemBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
                            const container = new ContainerBuilder();

                            // Only set accent color if not colorless mode
                            if (!leaveConfig.colorless && !isNaN(colorValue)) {
                                container.setAccentColor(colorValue);
                            }

                            const processedThumb = leaveConfig.thumbnail ? replacePlaceholders(leaveConfig.thumbnail, member.user, member.guild, channel) : null;
                            const processedImage = leaveConfig.image ? replacePlaceholders(leaveConfig.image, member.user, member.guild, channel) : null;

                            const imgPos = leaveConfig.imagePosition || 'bottom';

                            // Build image gallery if image exists (not used for 'side' mode)
                            let imageGallery = null;
                            if (processedImage && imgPos !== 'side') {
                                imageGallery = new MediaGalleryBuilder().addItems(
                                    new MediaGalleryItemBuilder().setURL(processedImage)
                                );
                            }

                            // For 'side' mode, image becomes thumbnail accessory
                            const sideImageUrl = (imgPos === 'side' && processedImage) ? processedImage : null;
                            const effectiveThumb = sideImageUrl || processedThumb;

                            // Add image gallery at top if position is 'top'
                            if (imageGallery && imgPos === 'top') {
                                container.addMediaGalleryComponents(imageGallery);
                            }

                            const leaveBtnPos = leaveConfig.buttonPosition || 'bottom';
                            function renderLeaveButtons() {
                                if (leaveConfig.buttons?.length > 0) {
                                    const urlButtons = leaveConfig.buttons
                                        .filter(b => b.label && b.url && (b.url.startsWith('http://') || b.url.startsWith('https://')))
                                        .slice(0, 5)
                                        .map(b => {
                                            const btn = new ButtonBuilder()
                                                .setLabel(typeof b.label === 'string' ? b.label.substring(0, 80) : 'Link')
                                                .setURL(b.url)
                                                .setStyle(ButtonStyle.Link);
                                            if (b.emoji) btn.setEmoji(b.emoji);
                                            return btn;
                                        });
                                    if (urlButtons.length > 0) container.addActionRowComponents(new ActionRowBuilder().addComponents(...urlButtons));
                                }
                                if (leaveConfig.actionButtons?.length > 0) {
                                    try {
                                        if (jsonStore.has('button-commands')) {
                                            const btnConfig = jsonStore.read('button-commands');
                                            const gId = member.guild.id;
                                            if (btnConfig[gId]) {
                                                const styleMap = { 'primary': ButtonStyle.Primary, 'secondary': ButtonStyle.Secondary, 'success': ButtonStyle.Success, 'danger': ButtonStyle.Danger, 'link': ButtonStyle.Link };
                                                let actionRow = new ActionRowBuilder();
                                                let count = 0;
                                                for (const buttonId of leaveConfig.actionButtons.slice(0, 25)) {
                                                    const bd = btnConfig[gId][buttonId];
                                                    if (!bd) continue;
                                                    const ab = new ButtonBuilder().setLabel(bd.label).setStyle(styleMap[bd.style] || ButtonStyle.Primary);
                                                    if (bd.style === 'link') { if (bd.url) ab.setURL(bd.url); else continue; }
                                                    else ab.setCustomId(`btn_cmd_${gId}_${buttonId}`);
                                                    if (bd.emoji) ab.setEmoji(bd.emoji);
                                                    actionRow.addComponents(ab);
                                                    count++;
                                                    if (count >= 5) { container.addActionRowComponents(actionRow); actionRow = new ActionRowBuilder(); count = 0; }
                                                }
                                                if (count > 0) container.addActionRowComponents(actionRow);
                                            }
                                        }
                                    } catch (e) { log.error('Leave action buttons: ' + e.message); }
                                }
                            }

                            // Buttons at top — placed before content
                            if (leaveBtnPos === 'top') renderLeaveButtons();

                            const hasSeparators = /\{separator(:(small|medium|large))?\}/gi.test(rawContent);

                            // Count extra components needed after content
                            const extraLeaveComponents = (imageGallery && imgPos === 'bottom' ? 1 : 0) + (leaveConfig.footer ? 2 : 0) + (leaveConfig.buttons?.length > 0 ? 1 : 0) + (leaveConfig.canvas?.enabled ? 1 : 0);
                            const maxLeaveContentComponents = 10 - (imageGallery && imgPos === 'top' ? 1 : 0) - extraLeaveComponents;
                            let leaveComponentCount = imageGallery && imgPos === 'top' ? 1 : 0;

                            if (hasSeparators) {
                                // Split on raw separators FIRST, then replace placeholders on each text part
                                const markedContent = rawContent
                                    .replace(/\{separator:small\}/gi, '---SEPARATOR:SMALL---')
                                    .replace(/\{separator:medium\}/gi, '---SEPARATOR:MEDIUM---')
                                    .replace(/\{separator:large\}/gi, '---SEPARATOR:LARGE---')
                                    .replace(/\{separator\}/gi, '---SEPARATOR:SMALL---');
                                const parts = markedContent.split(/---SEPARATOR:(SMALL|MEDIUM|LARGE)---/);
                                let isFirst = true;

                                for (let i = 0; i < parts.length; i++) {
                                    if (leaveComponentCount >= maxLeaveContentComponents) break;
                                    const part = parts[i];
                                    if (part === 'SMALL' || part === 'MEDIUM' || part === 'LARGE') {
                                        const spacing = part === 'LARGE' ? SeparatorSpacingSize.Large :
                                            part === 'MEDIUM' ? SeparatorSpacingSize.Medium : SeparatorSpacingSize.Small;
                                        container.addSeparatorComponents(
                                            new SeparatorBuilder().setSpacing(spacing).setDivider(true)
                                        );
                                        leaveComponentCount++;
                                    } else if (part.trim()) {
                                        const processedPart = replacePlaceholders(part, member.user, member.guild, channel) || '\u200b';
                                        if (isFirst && effectiveThumb) {
                                            const section = new SectionBuilder()
                                                .addTextDisplayComponents(new TextDisplayBuilder().setContent(safeLeaveStr(processedPart)))
                                                .setThumbnailAccessory(new ThumbnailBuilder().setURL(effectiveThumb));
                                            container.addSectionComponents(section);
                                            isFirst = false;
                                        } else {
                                            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(safeLeaveStr(processedPart)));
                                        }
                                        leaveComponentCount++;
                                    }
                                }
                            } else {
                                if (effectiveThumb) {
                                    const section = new SectionBuilder()
                                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(safeLeaveStr(processedContent)))
                                        .setThumbnailAccessory(new ThumbnailBuilder().setURL(effectiveThumb));
                                    container.addSectionComponents(section);
                                } else {
                                    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(safeLeaveStr(processedContent)));
                                }
                                leaveComponentCount++;
                            }

                            // Add image gallery at bottom if position is 'bottom' (default)
                            if (imageGallery && imgPos === 'bottom') {
                                container.addMediaGalleryComponents(imageGallery);
                            }

                            if (leaveConfig.footer) {
                                container.addSeparatorComponents(
                                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                                );
                                container.addTextDisplayComponents(
                                    new TextDisplayBuilder().setContent(safeLeaveStr(`-# ${replacePlaceholders(leaveConfig.footer, member.user, member.guild, channel)}`))
                                );
                            }

                            // Buttons at bottom (default)
                            if (leaveBtnPos !== 'top') renderLeaveButtons();

                            // Check if canvas mode is enabled for leave
                            if (leaveConfig.canvas?.enabled) {
                                try {
                                    const LeaveCard = require('./utils/leaveCard');
                                    const { AttachmentBuilder } = require('discord.js');

                                    const card = new LeaveCard();
                                    if (leaveConfig.canvas.backgroundColor) card.setBackground(leaveConfig.canvas.backgroundColor);
                                    if (leaveConfig.canvas.accentColor) card.setAccentColor(leaveConfig.canvas.accentColor);
                                    if (leaveConfig.canvas.textColor) card.setTextColor(leaveConfig.canvas.textColor);
                                    if (leaveConfig.canvas.backgroundImage) card.setBackgroundImage(leaveConfig.canvas.backgroundImage);
                                    if (leaveConfig.canvas.fontFamily) card.setFont(leaveConfig.canvas.fontFamily);

                                    const customMsg = leaveConfig.canvas.customMessage?.replace('{membercount}', member.guild.memberCount.toLocaleString()) || null;
                                    const buffer = await card.generate(member.user, member.guild, member.guild.memberCount, customMsg);
                                    const attachment = new AttachmentBuilder(buffer, { name: 'leave.png' });

                                    container.addMediaGalleryComponents(
                                        new MediaGalleryBuilder().addItems(
                                            new MediaGalleryItemBuilder().setURL('attachment://leave.png')
                                        )
                                    );

                                    await channel.send({ components: [container], files: [attachment], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
                                    return;
                                } catch (canvasError) {
                                    log.error('Canvas leave error, falling back', canvasError);
                                }
                            }

                            await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
                        }
                    }
                }
            }
        }
    } catch (error) {
        log.error('Leave message error', error);
    }

    await checkAuditLogAntiNuke(member.guild, 20, 'kickProtection', member.id, member.user?.username || member.id, 3000);
});

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;

    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            log.error('Error fetching reaction', error);
            return;
        }
    }

    // Reaction Roles System
    try {
        if (reaction.message.partial) {
            try { await reaction.message.fetch(); } catch { /* skip if can't fetch */ }
        }

        if (jsonStore.has('reactionroles')) {
            const rrConfig = jsonStore.read('reactionroles');
            const guildId = reaction.message.guild?.id;
            if (guildId && rrConfig[guildId]) {
                const msgId = reaction.message.id;
                const panel = rrConfig[guildId][msgId];

                if (panel && panel.mode !== 'button') {
                    const emojiStr = reaction.emoji.id
                        ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`
                        : reaction.emoji.name;

                    const matchedRole = panel.roles.find(r => {
                        if (r.emoji === emojiStr) return true;
                        if (reaction.emoji.id && r.emoji.includes(reaction.emoji.id)) return true;
                        if (!reaction.emoji.id && r.emoji === reaction.emoji.name) return true;
                        return false;
                    });

                    if (matchedRole) {
                        const guild = reaction.message.guild;
                        const member = await guild.members.fetch(user.id).catch(() => null);
                        if (member) {
                            const role = guild.roles.cache.get(matchedRole.roleId);
                            if (role && !role.managed && role.position < guild.members.me.roles.highest.position) {
                                if (!member.roles.cache.has(matchedRole.roleId)) {
                                    await member.roles.add(role).catch(() => { });
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch (err) {
        log.error('Reaction role (add): ' + err.message);
    }

    // Starboard System
    if (reaction.emoji.id === '1473038604812161218' || reaction.emoji.name === '⭐') {
        if (!jsonStore.has('starboard')) return;

        const starboard = jsonStore.read('starboard');
        const guildStarboard = starboard[reaction.message.guild.id];

        if (!guildStarboard) return;

        const starCount = reaction.count;

        if (starCount >= guildStarboard.threshold) {
            const starChannel = reaction.message.guild.channels.cache.get(guildStarboard.channelId);
            if (!starChannel) return;

            if (!guildStarboard.starredMessages) {
                guildStarboard.starredMessages = {};
            }

            if (guildStarboard.starredMessages[reaction.message.id]) {
                const starredMsg = await starChannel.messages.fetch(guildStarboard.starredMessages[reaction.message.id]).catch(() => null);
                if (starredMsg) {
                    const container = new ContainerBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder()
                                .setContent(`# <:Fire:1473038604812161218> Starboard (${starCount} stars)\n\n**Author:** ${reaction.message.author}\n**Channel:** ${reaction.message.channel}\n**[Jump to Message](${reaction.message.url})**\n\n${reaction.message.content || '*[No text content]*'}`)
                        );

                    await starredMsg.edit({ components: [container] });
                }
                return;
            }

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Fire:1473038604812161218> Starboard (${starCount} stars)\n\n**Author:** ${reaction.message.author}\n**Channel:** ${reaction.message.channel}\n**[Jump to Message](${reaction.message.url})**\n\n${reaction.message.content || '*[No text content]*'}`)
                );

            const starredMsg = await starChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
            guildStarboard.starredMessages[reaction.message.id] = starredMsg.id;
            jsonStore.write('starboard', starboard);
        }
    }
});

client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;

    if (reaction.partial) {
        try { await reaction.fetch(); } catch { return; }
    }
    if (reaction.message.partial) {
        try { await reaction.message.fetch(); } catch { return; }
    }

    try {
        if (!jsonStore.has('reactionroles')) return;

        const rrConfig = jsonStore.read('reactionroles');
        const guildId = reaction.message.guild?.id;
        if (!guildId || !rrConfig[guildId]) return;

        const msgId = reaction.message.id;
        const panel = rrConfig[guildId][msgId];

        if (!panel || panel.mode === 'button') return;

        const emojiStr = reaction.emoji.id
            ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`
            : reaction.emoji.name;

        const matchedRole = panel.roles.find(r => {
            if (r.emoji === emojiStr) return true;
            if (reaction.emoji.id && r.emoji.includes(reaction.emoji.id)) return true;
            if (!reaction.emoji.id && r.emoji === reaction.emoji.name) return true;
            return false;
        });

        if (matchedRole) {
            const guild = reaction.message.guild;
            const member = await guild.members.fetch(user.id).catch(() => null);
            if (member) {
                const role = guild.roles.cache.get(matchedRole.roleId);
                if (role && !role.managed && role.position < guild.members.me.roles.highest.position) {
                    if (member.roles.cache.has(matchedRole.roleId)) {
                        await member.roles.remove(role).catch(() => { });
                    }
                }
            }
        }
    } catch (err) {
        log.error('Reaction role (remove): ' + err.message);
    }
});

// Top.gg Vote Webhook Server (only on shard 0)
const shardId = client.shard?.ids?.[0] ?? 0;
if (shardId === 0) {
    const express = require('express');
    const app = express();
    app.use(express.json());

    const { TTS_CACHE_DIR, ensureCacheDir } = require('./utils/ttsEngine');
    ensureCacheDir();
    app.get('/tts/:filename', (req, res) => {
        const filename = req.params.filename;
        // Only allow .mp3 files with hex names (md5 hashes)
        if (!/^[a-f0-9]{32}\.mp3$/.test(filename)) {
            return res.status(400).send('Invalid filename');
        }
        const filePath = path.join(TTS_CACHE_DIR, filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('Not found');
        }
        res.setHeader('Content-Type', 'audio/mpeg');
        fs.createReadStream(filePath).pipe(res);
    });

    app.post('/topgg-webhook', async (req, res) => {
        const auth = req.headers.authorization;
        if (auth !== process.env.TOPGG_WEBHOOK_SECRET) {
            log.warning('Top.gg webhook: Unauthorized request');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { user, type, isWeekend, query } = req.body;

        // Only process upvotes
        if (type !== 'upvote') {
            return res.status(200).json({ success: true, message: 'Not an upvote' });
        }

        // Respond immediately to prevent timeout
        res.status(200).json({ success: true });

        try {

            // Load configs
            const voteConfig = jsonStore.has('vote-config')
                ? jsonStore.read('vote-config')
                : {};

            // Load/create user votes tracking
            let userVotes = {};
            if (jsonStore.has('user-votes')) {
                userVotes = jsonStore.read('user-votes');
            }

            // Fetch Discord user
            const discordUser = await client.users.fetch(user).catch(() => null);
            if (!discordUser) {
                log.warning(`Top.gg vote: Could not fetch user ${user}`);
                return;
            }

            // Update user vote stats
            const now = Date.now();
            const TWELVE_HOURS = 12 * 60 * 60 * 1000;
            const STREAK_WINDOW = 13 * 60 * 60 * 1000; // 13 hours for streak (1 hour grace)

            if (!userVotes[user]) {
                userVotes[user] = { totalVotes: 0, streak: 0, lastVote: 0, firstVote: now };
            }

            const userData = userVotes[user];
            const timeSinceLastVote = now - (userData.lastVote || 0);

            // Calculate streak
            if (userData.lastVote && timeSinceLastVote <= STREAK_WINDOW) {
                userData.streak = (userData.streak || 0) + 1;
            } else if (timeSinceLastVote > STREAK_WINDOW) {
                userData.streak = 1; // Reset streak
            } else {
                userData.streak = (userData.streak || 0) + 1;
            }

            userData.totalVotes = (userData.totalVotes || 0) + 1;
            userData.lastVote = now;

            // Save user votes
            jsonStore.write('user-votes', userVotes);

            // Award voter badge
            const badgeManager = require('./utils/badgeManager');
            await badgeManager.initializeDefaultBadges();

            // Check if user already has voter badge
            const existingBadges = await badgeManager.getUserBadges(user);
            const hasVoterBadge = existingBadges.some(b => b.badgeId === 'voter');
            let isFirstVote = false;

            if (!hasVoterBadge) {
                const badgeResult = await badgeManager.addBadgeToUser(user, 'voter');
                if (badgeResult.success) {
                    isFirstVote = true;
                    log.debug(`Voter badge awarded to user ${user}`);
                } else {
                    log.debug(`Failed to award voter badge: ${badgeResult.message}`);
                }
            }

            // Calculate next vote time
            const voteHours = isWeekend ? 6 : 12;
            const nextVoteTime = Math.floor(now / 1000) + (voteHours * 3600);

            // Get streak emoji and message
            const getStreakInfo = (streak) => {
                if (streak >= 30) return { emoji: '<:Fire:1473038604812161218>', title: 'LEGENDARY', color: 0xFF4500 };
                if (streak >= 14) return { emoji: '<:Lightningalt:1473038679906844824>', title: 'EPIC', color: 0x9B59B6 };
                if (streak >= 7) return { emoji: '<:Sketch:1473038248493453352>', title: 'AMAZING', color: 0x3498DB };
                if (streak >= 3) return { emoji: '<:Star:1473038501766369300>', title: 'GREAT', color: 0x2ECC71 };
                return { emoji: '🗳', title: '', color: 0xFF3366 };
            };

            const streakInfo = getStreakInfo(userData.streak);

            // Send to all configured guild channels
            for (const [guildId, config] of Object.entries(voteConfig)) {
                if (!config.enabled || !config.channelId) continue;

                const guild = client.guilds.cache.get(guildId);
                if (!guild) continue;

                const channel = guild.channels.cache.get(config.channelId);
                if (!channel) continue;

                try {
                    // Build professional vote notification
                    const { SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');

                    const headerSection = new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `# <:Fire:1473038604812161218> New Vote Received!`
                            )
                        )
                        .setThumbnailAccessory(
                            new ThumbnailBuilder({ media: { url: discordUser.displayAvatarURL({ size: 256 }) } })
                        );

                    let statsContent = `### <:user:1417581304299741184> Voter\n`;
                    statsContent += `**${discordUser.globalName || discordUser.username}** (\`${discordUser.username}\`)\n\n`;

                    statsContent += `### <:Fire:1473038604812161218> Vote Statistics\n`;
                    statsContent += `${streakInfo.emoji} **Streak:** ${userData.streak} vote${userData.streak > 1 ? 's' : ''} in a row`;
                    if (streakInfo.title) statsContent += ` — *${streakInfo.title}!*`;
                    statsContent += `\n`;
                    statsContent += `<a:loading:1506015728871149770> **Total Votes:** ${userData.totalVotes}\n`;

                    if (isWeekend) {
                        statsContent += `\n### <:Present:1473038450465706076> Weekend Bonus Active!\n`;
                        statsContent += `*Votes count double during weekends!*\n`;
                    }

                    if (isFirstVote) {
                        statsContent += `\n### 🏅 First Vote!\n`;
                        statsContent += `*${discordUser.username} earned the **Voter** badge!*\n`;
                    }

                    statsContent += `\n### <:Clock:1473039102113878056> Next Vote\n`;
                    statsContent += `Available <t:${nextVoteTime}:R> (<t:${nextVoteTime}:t>)\n`;

                    statsContent += `\n-# Thank you for supporting ${client.user.username}! Every vote helps us grow.`;

                    const voteContainer = new ContainerBuilder()
                        .setAccentColor(streakInfo.color)
                        .addSectionComponents(headerSection)
                        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(statsContent));

                    const voteBtn = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setLabel('Vote on Top.gg')
                            .setURL(`https://top.gg/bot/${client.user.id}/vote`)
                            .setStyle(ButtonStyle.Link)
                            .setEmoji('<:topgg:1473546762248523839>'),
                        new ButtonBuilder()
                            .setLabel('Vote on DBL')
                            .setURL('https://discordbotlist.com/bots/xnico')
                            .setStyle(ButtonStyle.Link)
                            .setEmoji('<:Cursor:1473038064564834544>'),
                        new ButtonBuilder()
                            .setLabel('View Bot Page')
                            .setURL(`https://top.gg/bot/${client.user.id}`)
                            .setStyle(ButtonStyle.Link)
                            .setEmoji('<:Attach:1473037923979886694>')
                    );

                    if (config.pingRoleId) {
                        voteContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`<@&${config.pingRoleId}>`));
                    }
                    await channel.send({
                        components: [voteContainer, voteBtn],
                        flags: MessageFlags.IsComponentsV2
                    });

                    // Update guild stats
                    config.totalVotes = (config.totalVotes || 0) + 1;
                    config.lastVote = now;
                    config.lastVoterId = user;
                } catch (err) {
                    log.error(`Top.gg vote notification error for guild ${guildId}: ${err.message}`);
                }
            }

            // Save updated config
            jsonStore.write('vote-config', voteConfig);

            // Send DM thank you message
            try {
                const { SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');

                let dmContent = `# <:Fire:1473038604812161218> Thank You for Voting!\n\n`;
                dmContent += `Your vote for **${client.user.username}** has been received!\n\n`;

                dmContent += `### ${streakInfo.emoji} Your Stats\n`;
                dmContent += `**Current Streak:** ${userData.streak} vote${userData.streak > 1 ? 's' : ''} in a row\n`;
                dmContent += `**Total Votes:** ${userData.totalVotes}\n`;

                if (isWeekend) {
                    dmContent += `\n### <:Present:1473038450465706076> Weekend Bonus\n`;
                    dmContent += `You voted during a weekend — your vote counts double!\n`;
                }

                if (isFirstVote) {
                    dmContent += `\n### 🏅 Badge Earned!\n`;
                    dmContent += `You've earned the **Voter** badge! Check your profile to see it.\n`;
                }

                if (userData.streak >= 7) {
                    dmContent += `\n### <:Fire:1473038604812161218> Streak Bonus\n`;
                    dmContent += `Amazing dedication! Keep your streak going!\n`;
                }

                dmContent += `\n### <:Clock:1473039102113878056> Next Vote\n`;
                dmContent += `You can vote again <t:${nextVoteTime}:R>\n`;
                dmContent += `\n### <:Notificationon:1473038417691676784> Reminders\n`;
                dmContent += `Use \`/myvotes\` to enable vote reminders — I'll DM you when you can vote again!\n`;
                dmContent += `\n-# Your support means everything to us! 💜`;

                const dmContainer = new ContainerBuilder()
                    .setAccentColor(streakInfo.color)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(dmContent));

                const dmBtn = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel(`Vote Again in ${voteHours}h`)
                        .setURL(`https://top.gg/bot/${client.user.id}/vote`)
                        .setStyle(ButtonStyle.Link)
                        .setEmoji('<:topgg:1473546762248523839>'),
                    new ButtonBuilder()
                        .setLabel('Vote on DBL too!')
                        .setURL('https://discordbotlist.com/bots/xnico')
                        .setStyle(ButtonStyle.Link)
                        .setEmoji('<:Cursor:1473038064564834544>'),
                    new ButtonBuilder()
                        .setLabel('Invite Bot')
                        .setURL(`https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`)
                        .setStyle(ButtonStyle.Link)
                        .setEmoji('<:Add:1473038100862337035>')
                );

                await discordUser.send({ components: [dmContainer, dmBtn], flags: MessageFlags.IsComponentsV2 });
            } catch (dmErr) {
                // User has DMs disabled, silently ignore
            }

            // Mark user as eligible for a reminder (handled by persistent scheduler)
            userData.nextVoteAvailable = now + (voteHours * 60 * 60 * 1000);
            userData.reminderSent = false;
            jsonStore.write('user-votes', userVotes);

            log.debug(`Top.gg vote from ${discordUser.username} (streak: ${userData.streak})`);

        } catch (error) {
            log.error('Top.gg webhook error', error);
        }
    });

    // DiscordBotList (DBL) Vote Webhook
    app.post('/dbl-webhook', async (req, res) => {
        const auth = req.headers.authorization;
        if (!process.env.DBL_WEBHOOK_SECRET || auth !== process.env.DBL_WEBHOOK_SECRET) {
            log.warning('DBL webhook: Unauthorized request');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = req.body.id;
        if (!userId) {
            return res.status(400).json({ error: 'Missing user id' });
        }

        // Respond immediately to prevent timeout
        res.status(200).json({ success: true });

        try {

            const voteConfig = jsonStore.has('vote-config')
                ? jsonStore.read('vote-config')
                : {};

            let userVotes = {};
            if (jsonStore.has('user-votes')) {
                userVotes = jsonStore.read('user-votes');
            }

            const discordUser = await client.users.fetch(userId).catch(() => null);
            if (!discordUser) {
                log.warning(`DBL vote: Could not fetch user ${userId}`);
                return;
            }

            const now = Date.now();
            const STREAK_WINDOW = 13 * 60 * 60 * 1000;

            if (!userVotes[userId]) {
                userVotes[userId] = { totalVotes: 0, streak: 0, lastVote: 0, firstVote: now };
            }

            const userData = userVotes[userId];
            const timeSinceLastVote = now - (userData.lastVote || 0);

            if (userData.lastVote && timeSinceLastVote <= STREAK_WINDOW) {
                userData.streak = (userData.streak || 0) + 1;
            } else if (timeSinceLastVote > STREAK_WINDOW) {
                userData.streak = 1;
            } else {
                userData.streak = (userData.streak || 0) + 1;
            }

            userData.totalVotes = (userData.totalVotes || 0) + 1;
            userData.lastVote = now;
            userData.lastPlatform = 'dbl';

            jsonStore.write('user-votes', userVotes);

            // Award voter badge
            const badgeManager = require('./utils/badgeManager');
            await badgeManager.initializeDefaultBadges();
            const existingBadges = await badgeManager.getUserBadges(userId);
            const hasVoterBadge = existingBadges.some(b => b.badgeId === 'voter');
            let isFirstVote = false;

            if (!hasVoterBadge) {
                const badgeResult = await badgeManager.addBadgeToUser(userId, 'voter');
                if (badgeResult.success) {
                    isFirstVote = true;
                    log.debug(`Voter badge awarded to user ${userId} (via DBL)`);
                }
            }

            const nextVoteTime = Math.floor(now / 1000) + 43200; // 12 hours

            const getStreakInfo = (streak) => {
                if (streak >= 30) return { emoji: '<:Fire:1473038604812161218>', title: 'LEGENDARY', color: 0xFF4500 };
                if (streak >= 14) return { emoji: '<:Lightningalt:1473038679906844824>', title: 'EPIC', color: 0x9B59B6 };
                if (streak >= 7) return { emoji: '<:Sketch:1473038248493453352>', title: 'AMAZING', color: 0x3498DB };
                if (streak >= 3) return { emoji: '<:Star:1473038501766369300>', title: 'GREAT', color: 0x2ECC71 };
                return { emoji: '🗳', title: '', color: 0x4F86EC };
            };

            const streakInfo = getStreakInfo(userData.streak);

            // Send to all configured guild channels
            for (const [guildId, config] of Object.entries(voteConfig)) {
                if (!config.enabled || !config.channelId) continue;

                const guild = client.guilds.cache.get(guildId);
                if (!guild) continue;

                const channel = guild.channels.cache.get(config.channelId);
                if (!channel) continue;

                try {
                    const { SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');

                    const headerSection = new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `# <:Cursor:1473038064564834544> New Vote on DiscordBotList!`
                            )
                        )
                        .setThumbnailAccessory(
                            new ThumbnailBuilder({ media: { url: discordUser.displayAvatarURL({ size: 256 }) } })
                        );

                    let statsContent = `### <:user:1417581304299741184> Voter\n`;
                    statsContent += `**${discordUser.globalName || discordUser.username}** (\`${discordUser.username}\`)\n\n`;

                    statsContent += `### <:Fire:1473038604812161218> Vote Statistics\n`;
                    statsContent += `${streakInfo.emoji} **Streak:** ${userData.streak} vote${userData.streak > 1 ? 's' : ''} in a row`;
                    if (streakInfo.title) statsContent += ` — *${streakInfo.title}!*`;
                    statsContent += `\n`;
                    statsContent += `<a:loading:1506015728871149770> **Total Votes:** ${userData.totalVotes}\n`;
                    statsContent += `<:Cursor:1473038064564834544> **Platform:** DiscordBotList\n`;

                    if (isFirstVote) {
                        statsContent += `\n### 🏅 First Vote!\n`;
                        statsContent += `*${discordUser.username} earned the **Voter** badge!*\n`;
                    }

                    statsContent += `\n### <:Clock:1473039102113878056> Next Vote\n`;
                    statsContent += `Available <t:${nextVoteTime}:R> (<t:${nextVoteTime}:t>)\n`;

                    statsContent += `\n-# Thank you for supporting ${client.user.username}! Every vote helps us grow.`;

                    const voteContainer = new ContainerBuilder()
                        .setAccentColor(streakInfo.color)
                        .addSectionComponents(headerSection)
                        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(statsContent));

                    const voteBtn = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setLabel('Vote on Top.gg')
                            .setURL(`https://top.gg/bot/${client.user.id}/vote`)
                            .setStyle(ButtonStyle.Link)
                            .setEmoji('<:topgg:1473546762248523839>'),
                        new ButtonBuilder()
                            .setLabel('Vote on DBL')
                            .setURL('https://discordbotlist.com/bots/xnico')
                            .setStyle(ButtonStyle.Link)
                            .setEmoji('<:Cursor:1473038064564834544>')
                    );

                    if (config.pingRoleId) {
                        voteContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`<@&${config.pingRoleId}>`));
                    }
                    await channel.send({
                        components: [voteContainer, voteBtn],
                        flags: MessageFlags.IsComponentsV2
                    });

                    config.totalVotes = (config.totalVotes || 0) + 1;
                    config.lastVote = now;
                    config.lastVoterId = userId;
                } catch (err) {
                    log.error(`DBL vote notification error for guild ${guildId}: ${err.message}`);
                }
            }

            jsonStore.write('vote-config', voteConfig);

            // Send DM thank you message
            try {
                const { SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');

                let dmContent = `# <:Cursor:1473038064564834544> Thank You for Voting!\n\n`;
                dmContent += `Your vote for **${client.user.username}** on **DiscordBotList** has been received!\n\n`;

                dmContent += `### ${streakInfo.emoji} Your Stats\n`;
                dmContent += `**Current Streak:** ${userData.streak} vote${userData.streak > 1 ? 's' : ''} in a row\n`;
                dmContent += `**Total Votes:** ${userData.totalVotes}\n`;

                if (isFirstVote) {
                    dmContent += `\n### 🏅 Badge Earned!\n`;
                    dmContent += `You've earned the **Voter** badge! Check your profile to see it.\n`;
                }

                if (userData.streak >= 7) {
                    dmContent += `\n### <:Fire:1473038604812161218> Streak Bonus\n`;
                    dmContent += `Amazing dedication! Keep your streak going!\n`;
                }

                dmContent += `\n### <:Clock:1473039102113878056> Next Vote\n`;
                dmContent += `You can vote again <t:${nextVoteTime}:R>\n`;
                dmContent += `\n### <:Notificationon:1473038417691676784> Reminders\n`;
                dmContent += `Use \`/myvotes\` to enable vote reminders — I'll DM you when you can vote again!\n`;
                dmContent += `\n-# Your support means everything to us! 💜`;

                const dmContainer = new ContainerBuilder()
                    .setAccentColor(streakInfo.color)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(dmContent));

                const dmBtn = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Vote Again in 12h')
                        .setURL('https://discordbotlist.com/bots/xnico')
                        .setStyle(ButtonStyle.Link)
                        .setEmoji('<:Cursor:1473038064564834544>'),
                    new ButtonBuilder()
                        .setLabel('Vote on Top.gg too!')
                        .setURL(`https://top.gg/bot/${client.user.id}/vote`)
                        .setStyle(ButtonStyle.Link)
                        .setEmoji('<:topgg:1473546762248523839>')
                );

                await discordUser.send({ components: [dmContainer, dmBtn], flags: MessageFlags.IsComponentsV2 });
            } catch (dmErr) {
                // User has DMs disabled
            }

            // Schedule vote reminder
            setTimeout(async () => {
                try {
                    const reminderUser = await client.users.fetch(userId).catch(() => null);
                    if (!reminderUser) return;

                    const currentUserVotes = jsonStore.has('user-votes')
                        ? jsonStore.read('user-votes')
                        : {};

                    if (currentUserVotes[userId]?.lastVote > now) return;

                    const currentStreak = currentUserVotes[userId]?.streak || 0;

                    let reminderContent = `# <:Cursor:1473038064564834544> Vote Reminder\n\n`;
                    reminderContent += `Hey **${reminderUser.username}**!\n\n`;
                    reminderContent += `You can now vote for **${client.user.username}** again!\n\n`;

                    if (currentStreak > 0) {
                        reminderContent += `### <:Infotriangle:1473038460456800459> Streak Warning\n`;
                        reminderContent += `You have a **${currentStreak}-vote streak**! Vote soon to keep it.\n\n`;
                    }

                    reminderContent += `-# Click below to vote now!`;

                    const reminderContainer = new ContainerBuilder()
                        .setAccentColor(0xCAD7E6)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(reminderContent));

                    const reminderBtn = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setLabel('Vote on DBL')
                            .setURL('https://discordbotlist.com/bots/xnico')
                            .setStyle(ButtonStyle.Link)
                            .setEmoji('<:Cursor:1473038064564834544>'),
                        new ButtonBuilder()
                            .setLabel('Vote on Top.gg')
                            .setURL(`https://top.gg/bot/${client.user.id}/vote`)
                            .setStyle(ButtonStyle.Link)
                            .setEmoji('<:topgg:1473546762248523839>')
                    );

                    await reminderUser.send({ components: [reminderContainer, reminderBtn], flags: MessageFlags.IsComponentsV2 });
                } catch (reminderErr) { }
            }, 12 * 60 * 60 * 1000);

            log.debug(`DBL vote from ${discordUser.username} (streak: ${userData.streak})`);

        } catch (error) {
            log.error('DBL webhook error', error);
        }
    });

    app.get('/health', (req, res) => {
        res.json({ status: 'ok', uptime: process.uptime() });
    });

    const PORT = process.env.WEBHOOK_PORT || 3000;
    app.listen(PORT, () => {
        log.info(`Webhook server on port ${PORT}`);
    });

    // Dashboard spawning removed from index.js as it is managed by shard.js
}

const token = process.env.TOKEN?.trim();
if (!token) {
    log.critical('TOKEN environment variable is not set!');
    process.exit(1);
}

async function checkRateLimit() {
    try {
        const https = require('https');
        return new Promise((resolve) => {
            const req = https.request({
                hostname: 'discord.com',
                path: '/api/v10/gateway',
                method: 'HEAD',
                timeout: 10000
            }, (res) => {
                if (res.statusCode === 429) {
                    const retryAfter = parseInt(res.headers['retry-after']) || 60;
                    resolve({ rateLimited: true, retryAfter });
                } else {
                    resolve({ rateLimited: false, retryAfter: 0 });
                }
            });
            req.on('error', () => resolve({ rateLimited: false, retryAfter: 0 }));
            req.on('timeout', () => { req.destroy(); resolve({ rateLimited: false, retryAfter: 0 }); });
            req.end();
        });
    } catch {
        return { rateLimited: false, retryAfter: 0 };
    }
}

async function loginWithRetry(maxRetries = 10) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Check for rate limit before attempting login
            const { rateLimited, retryAfter } = await checkRateLimit();
            if (rateLimited) {
                const waitTime = Math.min(retryAfter, 1200); // Cap at 20 minutes
                const mins = Math.floor(waitTime / 60);
                const secs = waitTime % 60;
                log.warning(`Rate limited by Discord. Waiting ${mins}m ${secs}s before login...`);
                await new Promise(r => setTimeout(r, waitTime * 1000));
            }

            log.info(`Logging into Discord... (attempt ${attempt}/${maxRetries})`);

            await client.login(token);
            log.success('Login successful!');
            return;
        } catch (error) {
            log.error(`Login attempt ${attempt} failed: ${error.message}`);

            if (error.message.includes('TOKEN_INVALID') || error.message.includes('invalid token') || error.code === 'TokenInvalid') {
                log.critical('Invalid bot token. Please update TOKEN in Secrets.');
                process.exit(1);
            }

            // Handle rate limit errors
            if (error.status === 429 || error.message.includes('rate limit') || error.message.includes('429')) {
                const waitTime = error.retry_after || 60;
                log.warning(`Rate limited. Waiting ${waitTime}s...`);
                await new Promise(r => setTimeout(r, waitTime * 1000));
                continue; // Don't count this as a failed attempt
            }

            if (attempt < maxRetries) {
                const delay = Math.min(attempt * 10000, 60000); // Exponential up to 60s
                log.info(`Waiting ${delay / 1000}s before retry...`);
                await new Promise(r => setTimeout(r, delay));
            } else {
                log.critical('All login attempts failed.');
                process.exit(1);
            }
        }
    }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
    }
}

loginWithRetry();