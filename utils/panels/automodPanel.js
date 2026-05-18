const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { THEME, formatCheck, createFooterText } = require('../theme');

const jsonStore = require('../jsonStore');
const log = require('../logger-styled');

function loadConfig() {
    if (!jsonStore.has('automod')) {
        jsonStore.write('automod', {});
        return {};
    }
    try {
        return jsonStore.read('automod');
    } catch (e) {
        return {};
    }
}

function saveConfig(config, guildId = null) {
    jsonStore.write('automod', config);
    if (global.updateAutomodCache && guildId && config[guildId]) {
        global.updateAutomodCache(guildId, config[guildId]);
    }
}

function getDefaultConfig() {
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

function getGuildConfig(guildId) {
    const config = loadConfig();
    const defaults = getDefaultConfig();
    const saved = config[guildId] || {};

    return {
        ...defaults,
        ...saved,
        badWords: { ...defaults.badWords, ...saved.badWords },
        spam: { ...defaults.spam, ...saved.spam },
        links: { ...defaults.links, ...saved.links },
        invites: { ...defaults.invites, ...saved.invites },
        massMention: { ...defaults.massMention, ...saved.massMention },
        caps: { ...defaults.caps, ...saved.caps },
        profanity: { ...defaults.profanity, ...saved.profanity },
        sexualContent: { ...defaults.sexualContent, ...saved.sexualContent },
        slurs: { ...defaults.slurs, ...saved.slurs }
    };
}

function buildAutomodPanel(guildConfig) {
    const activeCount = [
        guildConfig.badWords?.enabled,
        guildConfig.spam?.enabled,
        guildConfig.links?.enabled,
        guildConfig.invites?.enabled,
        guildConfig.massMention?.enabled,
        guildConfig.caps?.enabled,
        guildConfig.profanity?.enabled,
        guildConfig.sexualContent?.enabled,
        guildConfig.slurs?.enabled
    ].filter(Boolean).length;

    const logChannel = guildConfig.logChannel ? '<#' + guildConfig.logChannel + '>' : '`Not Set`';
    const bypassRole = guildConfig.bypassRoleId ? '<@&' + guildConfig.bypassRoleId + '>' : '`None`';

    // ── Header ──
    const headerText = '# <:Shield:1473038669831995494> AutoMod Protection\n-# Discord native AutoMod integration • Select filters to toggle';

    // ── Status ──
    const statusSection = guildConfig.enabled
        ? '<:Toggleon:1473038585501581312> **System Active** — Server is being protected'
        : '<:Toggleoff:1473038582813032590> **System Inactive** — Enable protection below';

    // ── Custom Filters Grid ──
    const customFilters = '### <:Shield:1473038669831995494> Custom Filters\n' +
        formatCheck(guildConfig.badWords?.enabled) + ' **Bad Words** — `' + (guildConfig.badWords?.words?.length || 0) + ' words` → `' + (guildConfig.badWords?.action || 'delete') + '`\n' +
        formatCheck(guildConfig.spam?.enabled) + ' **Anti-Spam** — `' + (guildConfig.spam?.messageLimit || 5) + ' msgs/' + (Math.round((guildConfig.spam?.timeWindow || 5000) / 1000)) + 's` → `' + (guildConfig.spam?.action || 'timeout') + '`\n' +
        formatCheck(guildConfig.links?.enabled) + ' **Link Filter** — `' + (guildConfig.links?.whitelist?.length || 0) + ' whitelisted` → `' + (guildConfig.links?.action || 'delete') + '`\n' +
        formatCheck(guildConfig.invites?.enabled) + ' **Invite Blocker** → `' + (guildConfig.invites?.action || 'delete') + '`\n' +
        formatCheck(guildConfig.massMention?.enabled) + ' **Mass Mentions** — `' + (guildConfig.massMention?.limit || 5) + '+ mentions` → `' + (guildConfig.massMention?.action || 'delete') + '`\n' +
        formatCheck(guildConfig.caps?.enabled) + ' **Caps Lock** — `' + (guildConfig.caps?.percentage || 70) + '%+` → `' + (guildConfig.caps?.action || 'delete') + '`';

    // ── Discord Presets ──
    const presetFilters = '### <:Lock:1473038513749491773> Discord Preset Filters\n' +
        formatCheck(guildConfig.profanity?.enabled) + ' **Profanity** — Discord built-in filter\n' +
        formatCheck(guildConfig.sexualContent?.enabled) + ' **Sexual Content** — Discord built-in filter\n' +
        formatCheck(guildConfig.slurs?.enabled) + ' **Slurs** — Discord built-in filter';

    // ── Configuration ──
    const configSection = '### <:Settings:1473037894703779851> Configuration\n' +
        '▸ **Active Filters:** `' + activeCount + '/9` protections\n' +
        '▸ **Bypass Role:** ' + bypassRole + '\n' +
        '▸ **Log Channel:** ' + logChannel;

    const footerText = createFooterText();

    // ── Row 1: Select menu to toggle filters on/off ──
    const enabledFilters = [];
    if (guildConfig.badWords?.enabled) enabledFilters.push('badWords');
    if (guildConfig.spam?.enabled) enabledFilters.push('spam');
    if (guildConfig.links?.enabled) enabledFilters.push('links');
    if (guildConfig.invites?.enabled) enabledFilters.push('invites');
    if (guildConfig.massMention?.enabled) enabledFilters.push('massMention');
    if (guildConfig.caps?.enabled) enabledFilters.push('caps');
    if (guildConfig.profanity?.enabled) enabledFilters.push('profanity');
    if (guildConfig.sexualContent?.enabled) enabledFilters.push('sexualContent');
    if (guildConfig.slurs?.enabled) enabledFilters.push('slurs');

    const toggleMenu = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('automod_toggle_filters')
                .setPlaceholder('⚡ Select filters to enable (deselect to disable)')
                .setMinValues(0)
                .setMaxValues(9)
                .setOptions([
                    { label: 'Bad Words', description: `${guildConfig.badWords?.words?.length || 0} words • Action: ${guildConfig.badWords?.action || 'delete'}`, value: 'badWords', emoji: { name: '💬' }, default: guildConfig.badWords?.enabled || false },
                    { label: 'Anti-Spam', description: `${guildConfig.spam?.messageLimit || 5} msgs/${Math.round((guildConfig.spam?.timeWindow || 5000) / 1000)}s • Action: ${guildConfig.spam?.action || 'timeout'}`, value: 'spam', emoji: { name: '🔄' }, default: guildConfig.spam?.enabled || false },
                    { label: 'Link Filter', description: `${guildConfig.links?.whitelist?.length || 0} whitelisted • Action: ${guildConfig.links?.action || 'delete'}`, value: 'links', emoji: { name: '🔗' }, default: guildConfig.links?.enabled || false },
                    { label: 'Invite Blocker', description: `Action: ${guildConfig.invites?.action || 'delete'}`, value: 'invites', emoji: { name: '✉' }, default: guildConfig.invites?.enabled || false },
                    { label: 'Mass Mentions', description: `Limit: ${guildConfig.massMention?.limit || 5}+ mentions • Action: ${guildConfig.massMention?.action || 'delete'}`, value: 'massMention', emoji: { name: '📢' }, default: guildConfig.massMention?.enabled || false },
                    { label: 'Caps Lock', description: `${guildConfig.caps?.percentage || 70}%+ uppercase • Action: ${guildConfig.caps?.action || 'delete'}`, value: 'caps', emoji: { name: '🔠' }, default: guildConfig.caps?.enabled || false },
                    { label: 'Profanity', description: 'Discord built-in profanity filter', value: 'profanity', emoji: { name: '🤬' }, default: guildConfig.profanity?.enabled || false },
                    { label: 'Sexual Content', description: 'Discord built-in sexual content filter', value: 'sexualContent', emoji: { name: '🔞' }, default: guildConfig.sexualContent?.enabled || false },
                    { label: 'Slurs', description: 'Discord built-in slurs filter', value: 'slurs', emoji: { name: '🚷' }, default: guildConfig.slurs?.enabled || false }
                ])
        );

    // ── Row 2: Select menu to configure limits/action for a filter ──
    const configureMenu = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('automod_configure_filter')
                .setPlaceholder('⚙️ Select a filter to configure limits & action')
                .setMinValues(1)
                .setMaxValues(1)
                .setOptions([
                    { label: 'Bad Words', description: 'Configure word list & action', value: 'badwords', emoji: { name: '💬' } },
                    { label: 'Anti-Spam', description: 'Set message limit, time window & action', value: 'spam', emoji: { name: '🔄' } },
                    { label: 'Link Filter', description: 'Configure whitelist & action', value: 'links', emoji: { name: '🔗' } },
                    { label: 'Invite Blocker', description: 'Configure action', value: 'invites', emoji: { name: '✉' } },
                    { label: 'Mass Mentions', description: 'Set mention limit & action', value: 'mentions', emoji: { name: '📢' } },
                    { label: 'Caps Lock', description: 'Set percentage, min length & action', value: 'caps', emoji: { name: '🔠' } }
                ])
        );

    // ── Row 3: Main controls ──
    const mainControls = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('automod_toggle')
                .setLabel(guildConfig.enabled ? 'Disable System' : 'Enable System')
                .setStyle(guildConfig.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
                .setEmoji(guildConfig.enabled ? '<:Toggleoff:1473038582813032590>' : '<:Toggleon:1473038585501581312>'),
            new ButtonBuilder()
                .setCustomId('automod_enable_all')
                .setLabel('Deploy All')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('<:Lightningalt:1473038679906844824>'),
            new ButtonBuilder()
                .setCustomId('automod_default')
                .setLabel('Reset Default')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:History:1473037847568318605>'),
            new ButtonBuilder()
                .setCustomId('automod_status')
                .setLabel('Status')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:Invoice:1473039492217835550>')
        );

    // ── Row 4: Settings ──
    const settingsRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('automod_logs')
                .setLabel('Log Channel')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('<:Document:1473039496995143731>'),
            new ButtonBuilder()
                .setCustomId('automod_bypass_role')
                .setLabel('Bypass Role')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('<:Shield:1473038669831995494>'),
            new ButtonBuilder()
                .setCustomId('automod_settings')
                .setLabel('Advanced')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:Settings:1473037894703779851>'),
            new ButtonBuilder()
                .setCustomId('automod_ignore_channels')
                .setLabel('Ignore Ch.')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:Volumeoff:1473039301414621427>')
        );

    const container = new ContainerBuilder()
        .setAccentColor(guildConfig.enabled ? 0x57F287 : 0xED4245)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(statusSection))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(customFilters))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(presetFilters))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(configSection))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(toggleMenu)
        .addActionRowComponents(configureMenu)
        .addActionRowComponents(mainControls)
        .addActionRowComponents(settingsRow)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footerText));

    return container;
}

async function refreshAutomodPanel(message, guildId) {
    const guildConfig = getGuildConfig(guildId);
    const container = buildAutomodPanel(guildConfig);

    try {
        await message.edit({ components: [container] });
        return { success: true };
    } catch (error) {
        log.error('Error refreshing automod panel:', error);
        return { success: false, error };
    }
}

module.exports = {
    loadConfig,
    saveConfig,
    getDefaultConfig,
    getGuildConfig,
    buildAutomodPanel,
    refreshAutomodPanel
};
