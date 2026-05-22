const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    PermissionFlagsBits,
    SeparatorBuilder,
    SeparatorSpacingSize,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType
} = require('discord.js');
const { buildErrorResponse, BRANDING } = require('../../utils/responseBuilder');
const trust = require('../../utils/trustManager');
const { checkAndExpire } = require('../../utils/panelExpiration');
const jsonStore = require('../../utils/jsonStore');

// --- Security system definitions ---
const SYSTEMS = {
    antialt: {
        label: 'Anti-Alt',
        emoji: '<:Userblock:1473038868184826149>',
        description: 'Block accounts younger than 7 days',
        details: 'Min age `7 days` • Action: `kick`'
    },
    antispam: {
        label: 'Anti-Spam',
        emoji: '<:Lightningalt:1473038679906844824>',
        description: '10 spam filters with timeout action',
        details: 'All 10 filters • Action: `timeout` • Duration: `60s`'
    },
    antiraid: {
        label: 'Anti-Raid',
        emoji: '<:Shield:1473038669831995494>',
        description: 'Join rate limit + auto lockdown',
        details: 'Rate: `10/10s` • Age: `7d` • Lockdown: `15` joins • Action: `kick`'
    },
    antinuke: {
        label: 'Anti-Nuke',
        emoji: '<:banhammer:1473367388597780592>',
        description: '8 protections (ban, kick, channels, roles, webhooks, bots)',
        details: 'Limits: `2-3/60s` • Action: `remove_roles` / `kick_bot`'
    },
    automod: {
        label: 'AutoMod',
        emoji: '<:Settings:1473037894703779851>',
        description: 'Spam, links, invites, mentions, caps, profanity, slurs',
        details: 'Modules: `7/9` active • Action: `delete`'
    }
};

const TIMEOUT_MS = 5 * 60 * 1000;

// --- Load/Save helpers ---
function loadJSON(storeName) {
    return jsonStore.read(storeName);
}

function saveJSON(storeName, data) {
    jsonStore.write(storeName, data);
}

// --- Default secure configs ---
function getSecureAntialt() {
    return { enabled: true, minAge: 7 };
}

function getSecureAntispam(logChannel) {
    return {
        enabled: true,
        action: 'timeout',
        timeoutDuration: 60000,
        whitelistedRoles: [],
        whitelistedChannels: [],
        logChannel: logChannel || null,
        filters: {
            messageSpam: { enabled: true, maxMessages: 5, interval: 5000 },
            emojiSpam: { enabled: true, maxEmojis: 10 },
            capsSpam: { enabled: true, minLength: 10, maxPercent: 70 },
            linkSpam: { enabled: true, maxLinks: 3, whitelistedDomains: [] },
            imageSpam: { enabled: true, maxImages: 3, interval: 10000 },
            stickerSpam: { enabled: true, maxStickers: 3, interval: 10000 },
            mentionSpam: { enabled: true, maxMentions: 5 },
            duplicateSpam: { enabled: true, maxDuplicates: 3, interval: 30000 },
            inviteSpam: { enabled: true },
            newlineSpam: { enabled: true, maxNewlines: 15 }
        }
    };
}

function getSecureAntiraid(logChannel) {
    return {
        enabled: true,
        joinRate: { enabled: true, limit: 10, timeWindow: 10000, action: 'kick' },
        accountAge: { enabled: true, minDays: 7, action: 'kick' },
        autoLockdown: { enabled: true, threshold: 15, duration: 300000 },
        suspiciousPatterns: { enabled: true, action: 'kick' },
        logChannel: logChannel || null,
        whitelistedRoles: [],
        bypassRoleId: null
    };
}

function getSecureAntinuke(logChannel) {
    return {
        enabled: true,
        banProtection: { enabled: true, limit: 3, timeWindow: 60000, action: 'remove_roles' },
        kickProtection: { enabled: true, limit: 3, timeWindow: 60000, action: 'remove_roles' },
        channelDelete: { enabled: true, limit: 2, timeWindow: 60000, action: 'remove_roles' },
        channelCreate: { enabled: true, limit: 3, timeWindow: 60000, action: 'remove_roles' },
        roleDelete: { enabled: true, limit: 2, timeWindow: 60000, action: 'remove_roles' },
        roleCreate: { enabled: true, limit: 3, timeWindow: 60000, action: 'remove_roles' },
        webhookCreate: { enabled: true, limit: 2, timeWindow: 60000, action: 'remove_roles' },
        botAdd: { enabled: true, action: 'kick_bot' },
        whitelistedUsers: [],
        bypassRoleId: null,
        logChannel: logChannel || null
    };
}

function getSecureAutomod(logChannel) {
    return {
        enabled: true,
        badWords: { enabled: false, words: [], action: 'delete' },
        spam: { enabled: true, maxMessages: 5, interval: 5000, action: 'delete' },
        links: { enabled: true, action: 'delete', whitelist: [] },
        invites: { enabled: true, action: 'delete' },
        massMention: { enabled: true, maxMentions: 5, action: 'delete' },
        caps: { enabled: true, percentage: 70, minLength: 10, action: 'delete' },
        profanity: { enabled: true, action: 'delete' },
        sexualContent: { enabled: true, action: 'delete' },
        slurs: { enabled: true, action: 'delete' },
        logChannel: logChannel || null,
        ignoredRoles: [],
        ignoredChannels: [],
        bypassRoleId: null
    };
}

// --- Apply or disable a single system ---
function applySystemConfig(guildId, systemKey, enable, logChannelId) {
    try {
        const config = loadJSON(systemKey);

        if (!enable) {
            // Preserve all existing config; flip only the `enabled` flag.
            // Previously this branch overwrote the whole object, wiping
            // whitelisted users / log channel / bypass roles whenever a
            // system was unchecked in the wizard.
            if (!config[guildId] || typeof config[guildId] !== 'object') {
                config[guildId] = { enabled: false };
            } else {
                config[guildId].enabled = false;
            }
            saveJSON(systemKey, config);
            if (systemKey === 'antialt' && global.updateAntialtCache) global.updateAntialtCache(guildId, config[guildId]);
            if (systemKey === 'antiraid' && global.updateAntiraidCache) global.updateAntiraidCache(guildId, config[guildId]);
            if (systemKey === 'antinuke' && global.reloadAntinukeCache) global.reloadAntinukeCache(config);
            if (systemKey === 'automod' && global.updateAutomodCache) global.updateAutomodCache(guildId, config[guildId]);
            return true;
        }

        const generators = {
            antialt: () => getSecureAntialt(),
            antispam: () => getSecureAntispam(logChannelId),
            antiraid: () => getSecureAntiraid(logChannelId),
            antinuke: () => getSecureAntinuke(logChannelId),
            automod: () => getSecureAutomod(logChannelId)
        };

        // Merge defaults with any pre-existing config so the user keeps
        // their whitelist, bypass role, and log channel customizations.
        const generated = generators[systemKey]();
        const existing = (config[guildId] && typeof config[guildId] === 'object') ? config[guildId] : {};
        // Honor existing arrays/IDs that the secure preset wouldn't know about:
        const preserveKeys = ['whitelistedUsers', 'whitelistedRoles', 'ignoredRoles', 'ignoredChannels', 'bypassRoleId', 'logChannel', '_savedThreatLimits', '_savedLimits'];
        const merged = { ...generated };
        for (const k of preserveKeys) {
            if (existing[k] !== undefined) merged[k] = existing[k];
        }
        // Always honor the explicitly-passed log channel
        if (logChannelId) merged.logChannel = logChannelId;
        config[guildId] = merged;
        saveJSON(systemKey, config);

        if (systemKey === 'antialt' && global.updateAntialtCache) global.updateAntialtCache(guildId, config[guildId]);
        if (systemKey === 'antiraid' && global.updateAntiraidCache) global.updateAntiraidCache(guildId, config[guildId]);
        if (systemKey === 'antinuke' && global.reloadAntinukeCache) global.reloadAntinukeCache(config);
        if (systemKey === 'automod' && global.updateAutomodCache) global.updateAutomodCache(guildId, config[guildId]);
        return true;
    } catch (e) {
        console.error(`[QuickSetup] Failed to apply ${systemKey}:`, e);
        return false;
    }
}

// --- Build the main interactive panel ---
function buildPanel(session, guildName) {
    const enabledCount = Object.values(session.systems).filter(Boolean).length;
    const totalSystems = Object.keys(SYSTEMS).length;
    const logText = session.logChannelId ? `<#${session.logChannelId}>` : '`Not set`';

    const check = '<:Checkedbox:1473038547165384804>';
    const uncheck = '<:Uncheckbox:1473038543768109076>';

    // Header
    const headerText = `# <:Shield:1473038669831995494> Security Quick Setup\n-# Interactive security configuration for **${guildName}**`;

    // Status bar
    const statusText = enabledCount === totalSystems
        ? `<:online:1473369837245042762> **All ${totalSystems} systems selected** — Ready to deploy`
        : enabledCount === 0
            ? `<:idle:1473370085719863366> **No systems selected** — Select systems below`
            : `<:Toggleoff:1473038582813032590> **${enabledCount}/${totalSystems} systems selected**`;

    // Systems list with toggle state
    let systemsText = '### <:Document:1473039496995143731> Protection Systems\n';
    for (const [key, sys] of Object.entries(SYSTEMS)) {
        const enabled = session.systems[key];
        const icon = enabled ? check : uncheck;
        systemsText += `${icon} ${sys.emoji} **${sys.label}** — ${sys.description}\n`;
        if (enabled) {
            systemsText += `-# ╰ ${sys.details}\n`;
        }
    }

    // Log channel info
    const logSection = `### <:Bookmark:1473039494604132423> Log Channel\n**Security logs:** ${logText}\n-# All enabled systems will send alerts to this channel`;

    // Select menu for toggling individual systems
    const selectOptions = Object.entries(SYSTEMS).map(([key, sys]) => ({
        label: sys.label,
        description: `${session.systems[key] ? '✓ Enabled' : '✗ Disabled'} • ${sys.description}`,
        value: key,
        emoji: sys.emoji,
        default: session.systems[key]
    }));

    const selectMenu = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('quicksetup_toggle')
                .setPlaceholder('Toggle security systems...')
                .setMinValues(0)
                .setMaxValues(totalSystems)
                .addOptions(selectOptions)
        );

    // Control buttons
    const controlButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('quicksetup_enable_all')
                .setLabel('Enable All')
                .setStyle(ButtonStyle.Success)
                .setEmoji('<:Toggleon:1473038585501581312>')
                .setDisabled(enabledCount === totalSystems),
            new ButtonBuilder()
                .setCustomId('quicksetup_disable_all')
                .setLabel('Disable All')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('<:Toggleoff:1473038582813032590>')
                .setDisabled(enabledCount === 0),
            new ButtonBuilder()
                .setCustomId('quicksetup_logchannel')
                .setLabel('Set Log Channel')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('<:Bookmark:1473039494604132423>'),
            new ButtonBuilder()
                .setCustomId('quicksetup_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:Cancel:1473037949187657818>')
        );

    // Apply button (separate row for emphasis)
    const applyButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('quicksetup_apply')
                .setLabel(`Apply Configuration (${enabledCount} Systems)`)
                .setStyle(ButtonStyle.Success)
                .setEmoji('<:Shield:1473038669831995494>')
                .setDisabled(enabledCount === 0)
        );

    const accentColor = enabledCount === totalSystems ? 0x57F287 : enabledCount > 0 ? 0xFEE75C : 0xCAD7E6;

    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(statusText))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(systemsText))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(logSection))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(selectMenu)
        .addActionRowComponents(controlButtons)
        .addActionRowComponents(applyButtons)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# <:Infotriangle:1473038460456800459> Select systems to toggle • Changes are applied only when you click Apply\n${BRANDING}`));

    return container;
}

// --- Build result panel after applying ---
function buildResultPanel(results, session, guildName) {
    const check = '<:Checkedbox:1473038547165384804>';
    const cross = '<:Cancel:1473037949187657818>';
    const dash = '<:Toggleoff:1473038582813032590>';

    const enabledSystems = Object.entries(session.systems).filter(([, v]) => v);
    const disabledSystems = Object.entries(session.systems).filter(([, v]) => !v);
    const successCount = Object.entries(results).filter(([, v]) => v).length;
    const failCount = enabledSystems.length - successCount;
    const logText = session.logChannelId ? `<#${session.logChannelId}>` : '`Not set`';

    const headerText = `# <:Shield:1473038669831995494> Security Setup Complete\n-# Configuration applied to **${guildName}**`;

    const statusText = failCount === 0
        ? `<:online:1473369837245042762> **${successCount} system${successCount !== 1 ? 's' : ''} enabled** • ${disabledSystems.length} kept disabled — Setup complete`
        : `<:Toggleoff:1473038582813032590> **${successCount} enabled, ${failCount} failed** — Check bot permissions`;

    // Enabled systems
    let enabledText = '### <:Toggleon:1473038585501581312> Enabled Systems\n';
    if (enabledSystems.length === 0) {
        enabledText += '-# No systems were enabled\n';
    } else {
        for (const [key] of enabledSystems) {
            const sys = SYSTEMS[key];
            const success = results[key];
            enabledText += `${success ? check : cross} ${sys.emoji} **${sys.label}** — ${sys.details}\n`;
        }
    }

    // Disabled systems
    let disabledText = '';
    if (disabledSystems.length > 0) {
        disabledText = '### <:Toggleoff:1473038582813032590> Disabled Systems\n';
        for (const [key] of disabledSystems) {
            const sys = SYSTEMS[key];
            disabledText += `${dash} ${sys.emoji} ~~${sys.label}~~ — Kept disabled\n`;
        }
    }

    const configSection = `### <:Settings:1473037894703779851> Applied Configuration\n` +
        `**Log Channel:** ${logText}\n` +
        (session.systems.antialt ? `**Anti-Alt:** Min account age \`7 days\`\n` : '') +
        (session.systems.antispam ? `**Anti-Spam:** Action \`timeout\` • All 10 filters enabled\n` : '') +
        (session.systems.antiraid ? `**Anti-Raid:** Join limit \`10/10s\` • Age \`7d\` • Lockdown at \`15\`\n` : '') +
        (session.systems.antinuke ? `**Anti-Nuke:** Limits \`2-3/60s\` • Action \`remove_roles\` / \`kick_bot\`\n` : '') +
        (session.systems.automod ? `**AutoMod:** Delete spam, links, invites, caps, profanity, slurs\n` : '');

    const tipsSection = `### <:Lightbulbalt:1473038470787240009> What's Next?\n` +
        `<:Caretright:1473038207221502106> Use \`/antinuke\` to add **whitelisted users** (trusted admins)\n` +
        `<:Caretright:1473038207221502106> Use \`/anti\` to adjust **protection limits** per category\n` +
        `<:Caretright:1473038207221502106> Use \`/antiraid\` to set a **bypass role** for trusted members\n` +
        `<:Caretright:1473038207221502106> Use \`/automod\` to add **custom bad words** list\n` +
        `<:Caretright:1473038207221502106> Use \`/antispam configure\` to fine-tune filter thresholds`;

    const container = new ContainerBuilder()
        .setAccentColor(failCount === 0 ? 0x57F287 : 0xED4245)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(statusText))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(enabledText));

    if (disabledText) {
        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(disabledText));
    }

    container
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(configSection))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(tipsSection))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

    return container;
}

// --- In-memory session store ---
const activeSessions = new Map();

function getSessionKey(userId, guildId) {
    return `${userId}_${guildId}`;
}

function createSession(logChannelId) {
    return {
        systems: {
            antialt: true,
            antispam: true,
            antiraid: true,
            antinuke: true,
            automod: true
        },
        logChannelId: logChannelId || null,
        createdAt: Date.now()
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quicksetup')
        .setDescription('Interactive security setup — choose which systems to enable')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt =>
            opt.setName('log-channel')
                .setDescription('Channel for security logs (optional)')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)),
    prefix: 'quicksetup',
    description: 'Interactive security setup — choose which systems to enable',
    usage: 'quicksetup [#log-channel]',
    category: 'admin',
    aliases: ['securitysetup', 'setupsecurity', 'protectserver'],

    async execute(interaction) {
        if (!trust.isServerOwner(interaction.guild, interaction.user.id)) {
            const container = buildErrorResponse('Permission Denied', 'Only the **server owner** can run security quick setup.');
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        try {
            const logChannel = interaction.options.getChannel('log-channel');
            const logChannelId = logChannel?.id || null;
            const key = getSessionKey(interaction.user.id, interaction.guild.id);

            const session = createSession(logChannelId);
            activeSessions.set(key, session);

            setTimeout(() => activeSessions.delete(key), TIMEOUT_MS);

            const panel = buildPanel(session, interaction.guild.name);
            await interaction.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        } catch (error) {
            console.error('[QuickSetup] Error:', error);
            const container = buildErrorResponse('Error', 'An error occurred while preparing security setup.', error.message);
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args) {
        if (!trust.isServerOwner(message.guild, message.author.id)) {
            const container = buildErrorResponse('Permission Denied', 'Only the **server owner** can run security quick setup.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            let logChannelId = null;
            if (args[0]) {
                const channelId = args[0].replace(/[<#>]/g, '');
                const channel = message.guild.channels.cache.get(channelId);
                if (channel && channel.type === ChannelType.GuildText) {
                    logChannelId = channel.id;
                }
            }

            const key = getSessionKey(message.author.id, message.guild.id);
            const session = createSession(logChannelId);
            activeSessions.set(key, session);

            setTimeout(() => activeSessions.delete(key), TIMEOUT_MS);

            const panel = buildPanel(session, message.guild.name);
            await message.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[QuickSetup] Error:', error);
            const container = buildErrorResponse('Error', 'An error occurred while preparing security setup.', error.message);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async handleInteraction(interaction) {
        const customId = interaction.customId;
        if (!customId.startsWith('quicksetup_')) return false;
        if (await checkAndExpire(interaction, 'setup')) return true;

        // Permission check
        if (!trust.isServerOwner(interaction.guild, interaction.user.id)) {
            const container = buildErrorResponse('Permission Denied', 'Only the **server owner** can use this panel.');
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            return true;
        }

        const key = getSessionKey(interaction.user.id, interaction.guild.id);
        const session = activeSessions.get(key);

        if (!session && customId !== 'quicksetup_cancel') {
            const container = buildErrorResponse('Session Expired', 'Your setup session has expired. Run `/quicksetup` again.');
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            return true;
        }

        // --- Select menu: toggle individual systems ---
        if (customId === 'quicksetup_toggle' && interaction.isStringSelectMenu()) {
            const selected = interaction.values;
            for (const sysKey of Object.keys(SYSTEMS)) {
                session.systems[sysKey] = selected.includes(sysKey);
            }
            activeSessions.set(key, session);

            const panel = buildPanel(session, interaction.guild.name);
            await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
            return true;
        }

        // --- Enable All ---
        if (customId === 'quicksetup_enable_all') {
            for (const sysKey of Object.keys(SYSTEMS)) {
                session.systems[sysKey] = true;
            }
            activeSessions.set(key, session);

            const panel = buildPanel(session, interaction.guild.name);
            await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
            return true;
        }

        // --- Disable All ---
        if (customId === 'quicksetup_disable_all') {
            for (const sysKey of Object.keys(SYSTEMS)) {
                session.systems[sysKey] = false;
            }
            activeSessions.set(key, session);

            const panel = buildPanel(session, interaction.guild.name);
            await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
            return true;
        }

        // --- Set Log Channel button ---
        if (customId === 'quicksetup_logchannel') {
            const modal = new ModalBuilder()
                .setCustomId('quicksetup_modal_log')
                .setTitle('Set Security Log Channel');

            const channelInput = new TextInputBuilder()
                .setCustomId('log_channel_id')
                .setLabel('Channel ID')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Right-click channel → Copy Channel ID')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(channelInput));
            await interaction.showModal(modal);
            return true;
        }

        // --- Log channel modal submit ---
        if (customId === 'quicksetup_modal_log' && interaction.isModalSubmit()) {
            const channelInput = interaction.fields.getTextInputValue('log_channel_id');
            const channelId = channelInput.replace(/[<#>]/g, '').trim();

            const channel = interaction.guild.channels.cache.get(channelId);
            if (!channel || channel.type !== ChannelType.GuildText) {
                const container = buildErrorResponse('Invalid Channel', 'Please provide a valid text channel ID. Right-click a channel and select **Copy Channel ID**.');
                await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                return true;
            }

            session.logChannelId = channelId;
            activeSessions.set(key, session);

            await interaction.deferUpdate();
            const panel = buildPanel(session, interaction.guild.name);
            await interaction.editReply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
            return true;
        }

        // --- Apply configuration ---
        if (customId === 'quicksetup_apply') {
            await interaction.deferUpdate();

            const results = {};
            for (const [sysKey, enabled] of Object.entries(session.systems)) {
                if (enabled) {
                    results[sysKey] = applySystemConfig(interaction.guild.id, sysKey, true, session.logChannelId);
                } else {
                    applySystemConfig(interaction.guild.id, sysKey, false, session.logChannelId);
                }
            }

            activeSessions.delete(key);

            const resultPanel = buildResultPanel(results, session, interaction.guild.name);
            await interaction.editReply({ components: [resultPanel], flags: MessageFlags.IsComponentsV2 });
            return true;
        }

        // --- Cancel ---
        if (customId === 'quicksetup_cancel') {
            activeSessions.delete(key);
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('### <:Cancel:1473037949187657818> Setup Cancelled\n-# No changes were made to your security configuration.'))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            return true;
        }

        return false;
    }
};
