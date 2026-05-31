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
        aiText: { enabled: false, action: 'delete', minSeverity: 'medium' },
        aiImage: { enabled: false, action: 'delete' },
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
        slurs: { ...defaults.slurs, ...saved.slurs },
        aiText: { ...defaults.aiText, ...saved.aiText },
        aiImage: { ...defaults.aiImage, ...saved.aiImage }
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
        guildConfig.slurs?.enabled,
        guildConfig.aiText?.enabled,
        guildConfig.aiImage?.enabled
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

    // ── AI Protection ──
    const aiFilters = '### <:Sparkles:1473038248493453352> AI Protection (All Languages)\n' +
        formatCheck(guildConfig.aiText?.enabled) + ' **AI Text Scan** — NSFW / slurs / hate in any language → `' + (guildConfig.aiText?.action || 'delete') + '`\n' +
        formatCheck(guildConfig.aiImage?.enabled) + ' **AI Image Scan** — NSFW / explicit / gore images → `' + (guildConfig.aiImage?.action || 'delete') + '`';

    // ── Configuration ──
    const configSection = '### <:Settings:1473037894703779851> Configuration\n' +
        '<:Caretright:1473038207221502106> **Active Filters:** `' + activeCount + '/11` protections\n' +
        '<:Caretright:1473038207221502106> **Bypass Role:** ' + bypassRole + '\n' +
        '<:Caretright:1473038207221502106> **Log Channel:** ' + logChannel;

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
    if (guildConfig.aiText?.enabled) enabledFilters.push('aiText');
    if (guildConfig.aiImage?.enabled) enabledFilters.push('aiImage');

    const toggleMenu = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('automod_toggle_filters')
                .setPlaceholder('Select filters to enable (deselect to disable)')
                .setMinValues(0)
                .setMaxValues(11)
                .setOptions([
                    { label: 'Bad Words',       description: `${guildConfig.badWords?.words?.length || 0} words • Action: ${guildConfig.badWords?.action || 'delete'}`,                                                value: 'badWords',       emoji: { id: '1473038936241864865', name: 'Chat' },         default: guildConfig.badWords?.enabled || false },
                    { label: 'Anti-Spam',       description: `${guildConfig.spam?.messageLimit || 5} msgs/${Math.round((guildConfig.spam?.timeWindow || 5000) / 1000)}s • Action: ${guildConfig.spam?.action || 'timeout'}`, value: 'spam',           emoji: { id: '1473037911581528165', name: 'Refresh' },      default: guildConfig.spam?.enabled || false },
                    { label: 'Link Filter',     description: `${guildConfig.links?.whitelist?.length || 0} whitelisted • Action: ${guildConfig.links?.action || 'delete'}`,                                          value: 'links',          emoji: { id: '1473037923979886694', name: 'Attach' },       default: guildConfig.links?.enabled || false },
                    { label: 'Invite Blocker',  description: `Action: ${guildConfig.invites?.action || 'delete'}`,                                                                                                    value: 'invites',        emoji: { id: '1473038885364695113', name: 'Envelope' },     default: guildConfig.invites?.enabled || false },
                    { label: 'Mass Mentions',   description: `Limit: ${guildConfig.massMention?.limit || 5}+ mentions • Action: ${guildConfig.massMention?.action || 'delete'}`,                                       value: 'massMention',    emoji: { id: '1473038903157199093', name: 'Bullhorn' },     default: guildConfig.massMention?.enabled || false },
                    { label: 'Caps Lock',       description: `${guildConfig.caps?.percentage || 70}%+ uppercase • Action: ${guildConfig.caps?.action || 'delete'}`,                                                  value: 'caps',           emoji: { id: '1473038797540298792', name: 'Lightning' },    default: guildConfig.caps?.enabled || false },
                    { label: 'Profanity',       description: 'Discord built-in profanity filter',                                                                                                                      value: 'profanity',      emoji: { id: '1473037949187657818', name: 'Cancel' },       default: guildConfig.profanity?.enabled || false },
                    { label: 'Sexual Content',  description: 'Discord built-in sexual content filter',                                                                                                                 value: 'sexualContent',  emoji: { id: '1473038460456800459', name: 'Infotriangle' }, default: guildConfig.sexualContent?.enabled || false },
                    { label: 'Slurs',           description: 'Discord built-in slurs filter',                                                                                                                          value: 'slurs',          emoji: { id: '1473038669831995494', name: 'Shield' },       default: guildConfig.slurs?.enabled || false },
                    { label: 'AI Text Scan',    description: `Multilingual NSFW/slur/hate AI • Action: ${guildConfig.aiText?.action || 'delete'}`,                                                                     value: 'aiText',         emoji: { id: '1473038248493453352', name: 'Sparkles' },     default: guildConfig.aiText?.enabled || false },
                    { label: 'AI Image Scan',   description: `NSFW/explicit/gore image AI • Action: ${guildConfig.aiImage?.action || 'delete'}`,                                                                       value: 'aiImage',        emoji: { id: '1473039568398843957', name: 'Picture' },      default: guildConfig.aiImage?.enabled || false }
                ])
        );

    // ── Row 2: Select menu to configure limits/action for a filter ──
    const configureMenu = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('automod_configure_filter')
                .setPlaceholder('Select a filter  to configure limits & action')
                .setMinValues(1)
                .setMaxValues(1)
                .setOptions([
                    // Discord rejects an emoji object whose `name` field still
                    // contains the raw `<:NAME:ID>` markup — the API parses
                    // `name` as a plain emoji name and bails with
                    // INVALID_FORM_BODY ("invalid emoji"). Pass the formatted
                    // string instead so discord.js parses it into
                    // `{ id, name, animated }` correctly.
                    { label: 'Bad Words',      description: 'Configure word list & action',           value: 'badwords', emoji: '<:Settingsadjust:1473038223625294048>' },
                    { label: 'Anti-Spam',      description: 'Set message limit, time window & action', value: 'spam',     emoji: '<:Settingsadjust:1473038223625294048>' },
                    { label: 'Link Filter',    description: 'Configure whitelist & action',           value: 'links',    emoji: '<:Settingsadjust:1473038223625294048>' },
                    { label: 'Invite Blocker', description: 'Configure action',                        value: 'invites',  emoji: '<:Settingsadjust:1473038223625294048>' },
                    { label: 'Mass Mentions',  description: 'Set mention limit & action',             value: 'mentions', emoji: '<:Settingsadjust:1473038223625294048>' },
                    { label: 'Caps Lock',      description: 'Set percentage, min length & action',    value: 'caps',     emoji: '<:Settingsadjust:1473038223625294048>' },
                    { label: 'AI Text Scan',   description: 'Set action & minimum severity',          value: 'aitext',   emoji: '<:Settingsadjust:1473038223625294048>' },
                    { label: 'AI Image Scan',  description: 'Configure action',                       value: 'aiimage',  emoji: '<:Settingsadjust:1473038223625294048>' }
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
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(aiFilters))
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
