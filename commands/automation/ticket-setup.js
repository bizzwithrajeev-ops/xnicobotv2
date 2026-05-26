const {
    SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder,
    ActionRowBuilder, StringSelectMenuBuilder, MessageFlags, ChannelType,
    SeparatorBuilder, SeparatorSpacingSize, EmbedBuilder
} = require('discord.js');
const {
    startMessageBuilderSession, handleButtonInteraction,
    handleModalSubmit: handleMsgBuilderModal,
    buildMessageBuilderPanel, extractPrefixFromCustomId,
    replacePlaceholders: msgReplace, buildComponentsV2Message,
} = require('../../utils/actionMessageBuilder');
const { checkAndExpire } = require('../../utils/panelExpiration');
const {
    readAll, saveAll, ensureMigrated, newPanelId,
    resolvePanelCategories,
} = require('../../utils/ticketPanels');

/* ───────────────────────────── presets ─────────────────────────── */

// Curated category presets — picked when admin runs `/ticket-setup style`.
// Each preset gives the panel its own personality plus appropriate categories.
const TICKET_PRESETS = {
    purchase: {
        label: 'Purchase / Sales Support',
        description: 'Optimized for storefronts, product help and billing tickets.',
        categories: [
            { id: 'purchase', label: 'Purchase Help',    emoji: '🛒', description: 'Help with buying or product info' },
            { id: 'billing',  label: 'Billing Issue',    emoji: '💳', description: 'Payment, invoices and refunds' },
            { id: 'product',  label: 'Product Support',  emoji: '📦', description: 'Issues with a delivered product' },
            { id: 'general',  label: 'General Question', emoji: '<:Chat:1473038936241864865>', description: 'Anything else we can help with' }
        ]
    },
    general: {
        label: 'General Server Support',
        description: 'Balanced setup for community servers.',
        categories: [
            { id: 'general', label: 'General Support', emoji: '<:Chat:1473038936241864865>',  description: 'General questions and help' },
            { id: 'bug',     label: 'Bug Report',      emoji: '🐛',                          description: 'Report a bug or glitch' },
            { id: 'feature', label: 'Feature Request', emoji: '<:Star:1473038501766369300>', description: 'Suggest an improvement' },
            { id: 'report',  label: 'User Report',     emoji: '🚨',                          description: 'Report a member or behavior' },
            { id: 'other',   label: 'Other',           emoji: '<:Edit:1473037903625191580>', description: "Anything that doesn't fit above" }
        ]
    },
    random: {
        label: 'Casual / Random',
        description: 'Light tone — for community/fun servers.',
        categories: [
            { id: 'chat',   label: 'Just Chat',      emoji: '💬', description: 'Hop in and chat with us' },
            { id: 'fun',    label: 'Fun Stuff',      emoji: '🎉', description: 'Suggestions, games, events' },
            { id: 'help',   label: 'Need Help',      emoji: '🆘', description: 'I need a hand with something' },
            { id: 'random', label: 'Other / Random', emoji: '<:Edit:1473037903625191580>', description: 'Whatever else you need' }
        ]
    },
    minimal: {
        label: 'Minimal',
        description: 'Just one button — opens a generic ticket.',
        categories: [
            { id: 'general', label: 'Open Ticket', emoji: '🎫', description: 'Open a private support ticket' }
        ]
    }
};

/* ─────────────────────── panel rendering ───────────────────────── */

/**
 * Render the panel message body. Used for both initial send and live updates.
 * Returns a discord.js send/edit payload (with components + flags).
 */
function buildPanelMessage({ guildConfig, panel, panelId, supportRole, guild }) {
    const categories = resolvePanelCategories(guildConfig, panel);

    // Custom-id encodes the panel id so a single bot can host many panels.
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`ticket_select:${panelId}`);

    if (categories.length === 0) {
        // Fresh setup — no categories yet. Surface a clear placeholder so the
        // panel still renders, but block ticket creation until admins add some.
        selectMenu
            .setPlaceholder('<:Inforect:1473038624172937287> Please create new categories to add here')
            .setDisabled(true)
            .addOptions([{
                label: 'No categories available',
                value: '__none__',
                description: 'Admins: run /ticket-categories add'
            }]);
    } else {
        selectMenu
            .setPlaceholder('Select a ticket category to get help')
            .addOptions(
                categories.slice(0, 25).map(cat => {
                    const opt = { label: cat.label.slice(0, 100), value: cat.id, description: (cat.description || '').slice(0, 100) };
                    const parsed = parseEmoji(cat.emoji);
                    if (parsed) opt.emoji = parsed;
                    return opt;
                })
            );
    }

    const row = new ActionRowBuilder().addComponents(selectMenu);

    // Build the visible body — either a custom V2/embed/simple panel or our default.
    const panelConfig = panel?.panelMessage || guildConfig?.panelMessage || null;

    if (panelConfig?.mode === 'components') {
        const container = buildComponentsV2Message(panelConfig, null, guild, null);
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addActionRowComponents(row);
        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }

    if (panelConfig?.mode === 'embed') {
        const embed = new EmbedBuilder();
        if (panelConfig.title)       embed.setTitle(msgReplace(panelConfig.title, null, guild));
        if (panelConfig.description) embed.setDescription(msgReplace(panelConfig.description, null, guild));
        if (panelConfig.color)       embed.setColor(panelConfig.color);
        if (panelConfig.image)       embed.setImage(panelConfig.image);
        if (panelConfig.thumbnail)   embed.setThumbnail(panelConfig.thumbnail);
        if (panelConfig.author)      embed.setAuthor({ name: msgReplace(panelConfig.author, null, guild), iconURL: panelConfig.authorIcon || undefined });
        if (panelConfig.footer)      embed.setFooter({ text: msgReplace(panelConfig.footer, null, guild), iconURL: panelConfig.footerIcon || undefined });
        if (panelConfig.fields?.length) {
            for (const f of panelConfig.fields.slice(0, 25)) {
                embed.addFields({
                    name:  msgReplace(f.name, null, guild),
                    value: msgReplace(f.value, null, guild),
                    inline: f.inline || false,
                });
            }
        }
        return { embeds: [embed], components: [row] };
    }

    if (panelConfig?.mode === 'simple' && panelConfig.content) {
        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(msgReplace(panelConfig.content, null, guild)))
            .addActionRowComponents(row);
        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }

    // Default body
    const body = buildDefaultPanelContent({ supportRole, categories, panelLabel: panel?.label });
    const container = new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
        .addActionRowComponents(row);
    return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

function buildDefaultPanelContent({ supportRole, categories, panelLabel }) {
    let content = `# <:Document:1473039496995143731> Support Tickets`;
    if (panelLabel && panelLabel !== 'Default') content += ` — ${panelLabel}`;
    content += `\n\n`;

    if (categories.length === 0) {
        content += `<:Inforect:1473038624172937287> **No ticket categories configured yet.**\n\n`;
        content += `Admins, add some with:\n`;
        content += `> \`/ticket-categories add <id> <label> <emoji> <description>\`\n\n`;
        content += `Or apply a preset with \`/ticket-setup style preset:<purchase|general|random|minimal>\`.\n\n`;
        if (supportRole) content += `**Support Team:** ${supportRole}`;
        return content;
    }

    content += `Need a hand? Pick a category from the dropdown below and we'll spin up a private channel for you.\n\n`;
    content += `### <:Bookopen:1473038576391557130> Available Categories\n`;
    for (const cat of categories) {
        const cleanLabel = cat.label.replace(/<:[^>]+>/g, '').trim();
        const showEmoji  = cat.emoji && !cat.emoji.startsWith('<') ? cat.emoji : '<:Pin:1473038806612447500>';
        content += `${showEmoji} **${cleanLabel}**\n`;
        content += `> *${cat.description}*\n\n`;
    }
    content += `### <:Lightbulbalt:1473038470787240009> How It Works\n`;
    content += `<:Pin:1473038806612447500> **1.** Select a category from the dropdown menu below\n`;
    content += `<:Pin:1473038806612447500> **2.** A private channel is created — only you and staff can see it\n`;
    content += `<:Pin:1473038806612447500> **3.** Describe your issue and our team will assist you\n\n`;
    if (supportRole) content += `**Support Team:** ${supportRole}`;
    return content;
}

/**
 * Parse a stored emoji string into a Discord select-option emoji shape.
 * Accepts unicode strings ("🐛"), custom emojis ("<:Name:123>" / "<a:Name:123>"),
 * or raw IDs ("123"). Returns `null` if nothing usable is found so callers can omit.
 */
function parseEmoji(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const m = raw.match(/^<(a)?:([\w~]+):(\d+)>$/);
    if (m) return { id: m[3], name: m[2], animated: !!m[1] };
    if (/^\d{15,}$/.test(raw)) return { id: raw };
    return { name: raw };
}

/* ────────────────── confirmation / status messages ───────────────── */

function buildSetupConfirmation({ panelChannel, ticketCategory, supportRole, panelLabel }) {
    return `# <:Checkedbox:1473038547165384804> Ticket Panel Created\n\n` +
        `Your panel is live. Users can open tickets from it as soon as you add categories.\n\n` +
        `### <:Document:1473039496995143731> Panel Summary\n` +
        `<:Pin:1473038806612447500> **Panel Label:** \`${panelLabel}\`\n` +
        `<:Pin:1473038806612447500> **Panel Channel:** ${panelChannel}\n` +
        `<:Pin:1473038806612447500> **Ticket Category:** ${ticketCategory}\n` +
        `<:Pin:1473038806612447500> **Support Role:** ${supportRole}\n\n` +
        `### <:Star:1473038501766369300> Next Steps\n` +
        `<:Pin:1473038806612447500> Add categories: \`/ticket-categories add <id> <label> <emoji> <description>\`\n` +
        `<:Pin:1473038806612447500> Or apply a preset: \`/ticket-setup style preset:purchase\`\n` +
        `<:Pin:1473038806612447500> Configure transcripts: \`/ticket-setup transcript mode:auto log-channel:#logs\`\n\n` +
        `### <:Bookopen:1473038576391557130> Multiple Panels\n` +
        `<:Pin:1473038806612447500> Add another panel: \`/ticket-setup panel-add channel:#sales label:Sales\`\n` +
        `<:Pin:1473038806612447500> List panels: \`/ticket-setup panel-list\`\n` +
        `<:Pin:1473038806612447500> Tie panel to specific categories: \`/ticket-setup panel-categories\``;
}

/* ─────────────────────── command builder ──────────────────────── */

module.exports = {
    category: 'automation',
    data: new SlashCommandBuilder()
        .setName('ticket-setup')
        .setDescription('Setup the ticket support system with categorized ticket creation')
        .addSubcommand(s => s
            .setName('create')
            .setDescription('Create the first ticket panel (no categories until you add them)')
            .addChannelOption(o => o.setName('channel').setDescription('Channel where the ticket panel will be displayed').setRequired(true))
            .addChannelOption(o => o.setName('category').setDescription('Discord category where ticket channels will be created').setRequired(true))
            .addRoleOption(o => o.setName('support-role').setDescription('Role that can view and manage tickets').setRequired(true)))
        .addSubcommand(s => s
            .setName('panel-add')
            .setDescription('Add another ticket panel in a different channel (with its own categories)')
            .addChannelOption(o => o.setName('channel').setDescription('Channel where this panel will be posted').setRequired(true))
            .addStringOption(o => o.setName('label').setDescription('Short label so admins can identify this panel').setRequired(true))
            .addStringOption(o => o.setName('categories').setDescription('Comma-separated category IDs to expose (default: all)').setRequired(false))
            .addRoleOption(o => o.setName('support-role').setDescription('Override support role for this panel only').setRequired(false))
            .addChannelOption(o => o.setName('ticket-category').setDescription('Override Discord category for tickets opened from this panel').setRequired(false)))
        .addSubcommand(s => s
            .setName('panel-list')
            .setDescription('List all ticket panels configured in this server'))
        .addSubcommand(s => s
            .setName('panel-remove')
            .setDescription('Remove a ticket panel (deletes the panel message)')
            .addStringOption(o => o.setName('panel-id').setDescription('The panel ID (see /ticket-setup panel-list)').setRequired(true)))
        .addSubcommand(s => s
            .setName('panel-categories')
            .setDescription('Choose which categories a specific panel exposes')
            .addStringOption(o => o.setName('panel-id').setDescription('The panel ID (see /ticket-setup panel-list)').setRequired(true))
            .addStringOption(o => o.setName('categories').setDescription('Comma-separated category IDs (empty = show all)').setRequired(false)))
        .addSubcommand(s => s
            .setName('help')
            .setDescription('View detailed guide on the ticket system'))
        .addSubcommand(s => s
            .setName('message')
            .setDescription('Customize the welcome message sent when a ticket is opened'))
        .addSubcommand(s => s
            .setName('reset-message')
            .setDescription('Reset the ticket welcome message to default'))
        .addSubcommand(s => s
            .setName('panel')
            .setDescription('Customize the panel message displayed in the panel channel'))
        .addSubcommand(s => s
            .setName('reset-panel')
            .setDescription('Reset the ticket panel message to default'))
        .addSubcommand(s => s
            .setName('style')
            .setDescription('Apply a category preset to the category pool')
            .addStringOption(o => o.setName('preset').setDescription('Which category style to apply').setRequired(true)
                .addChoices(
                    { name: 'Purchase / Sales Support', value: 'purchase' },
                    { name: 'General Server Support',   value: 'general' },
                    { name: 'Casual / Random',          value: 'random' },
                    { name: 'Minimal (single button)',  value: 'minimal' }
                )))
        .addSubcommand(s => s
            .setName('transcript')
            .setDescription('Configure transcript saving for closed tickets')
            .addStringOption(o => o.setName('mode').setDescription('When to save transcripts').setRequired(true)
                .addChoices(
                    { name: 'Auto — save automatically when a ticket closes', value: 'auto' },
                    { name: 'Manual — only when staff click "Save Transcript"', value: 'manual' },
                    { name: 'Both — auto-save plus the manual button',         value: 'both' },
                    { name: 'Off — disable transcripts entirely',              value: 'off' }
                ))
            .addChannelOption(o => o.setName('log-channel').setDescription('Channel where transcripts are posted').setRequired(false)))
        .addSubcommand(s => s
            .setName('status')
            .setDescription('Inspect the current ticket system configuration'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    /* ───────────────────────── routing ─────────────────────────── */

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        switch (subcommand) {
            case 'create':           return this.handleCreate(interaction);
            case 'panel-add':        return this.handlePanelAdd(interaction);
            case 'panel-list':       return this.handlePanelList(interaction);
            case 'panel-remove':     return this.handlePanelRemove(interaction);
            case 'panel-categories': return this.handlePanelCategories(interaction);
            case 'help':             return this.handleHelp(interaction);
            case 'message':          return this.handleMessage(interaction);
            case 'reset-message':    return this.handleResetMessage(interaction);
            case 'panel':            return this.handlePanel(interaction);
            case 'reset-panel':      return this.handleResetPanel(interaction);
            case 'style':            return this.handleStyle(interaction);
            case 'transcript':       return this.handleTranscript(interaction);
            case 'status':           return this.handleStatus(interaction);
        }
    },

    /* ────────────────────────── create ─────────────────────────── */

    async handleCreate(interaction) {
        const channel = interaction.options.getChannel('channel');
        const ticketCategory = interaction.options.getChannel('category');
        const supportRole = interaction.options.getRole('support-role');

        if (ticketCategory.type !== ChannelType.GuildCategory) {
            return interaction.reply({
                content: '<:Cancel:1473037949187657818> The **category** option must be a Discord category (folder icon), not a text channel.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
            return interaction.reply({
                content: '<:Cancel:1473037949187657818> The **channel** option must be a text channel.',
                flags: MessageFlags.Ephemeral
            });
        }

        const config = readAll();
        const existing = ensureMigrated(config[interaction.guild.id]);

        const guildConfig = {
            // Guild-level defaults (fall-throughs for panels that don't override)
            categoryId:     ticketCategory.id,
            supportRoleId:  supportRole.id,
            tickets:        existing?.tickets        || {},
            nextTicketNumber: existing?.nextTicketNumber || 0,
            // Fresh setup → empty category pool. Admins fill it via
            // /ticket-categories add or /ticket-setup style.
            categories:     existing?.categories     || [],
            transcriptMode: existing?.transcriptMode || 'manual',
            transcriptChannelId: existing?.transcriptChannelId || null,
            welcomeMessage: existing?.welcomeMessage,
            panelMessage:   existing?.panelMessage,
            panels:         existing?.panels || {},
        };

        // Reset any previously orphaned legacy single-panel data — the new
        // `panels` map is the source of truth from now on.
        delete guildConfig.channelId;
        delete guildConfig.panelMessageId;

        // The "default" panel is created on first setup; subsequent creates
        // overwrite it (re-posts the panel) but leave any other panels alone.
        const panelId = 'default';
        const renderArgs = {
            guildConfig,
            panel: {
                channelId: channel.id,
                label: 'Default',
                categoryIds: [],          // empty = expose entire pool
                supportRoleId: null,      // fall back to guild
                channelCategoryId: null,
                panelMessage: null,
            },
            panelId,
            supportRole,
            guild: interaction.guild,
        };

        // Tear down the old default panel if there was one
        const old = guildConfig.panels[panelId];
        if (old?.channelId && old?.messageId) {
            try {
                const oldChan = await interaction.guild.channels.fetch(old.channelId).catch(() => null);
                const oldMsg  = oldChan ? await oldChan.messages.fetch(old.messageId).catch(() => null) : null;
                if (oldMsg) await oldMsg.delete().catch(() => null);
            } catch { /* non-fatal */ }
        }

        const panelMessage = await channel.send(buildPanelMessage(renderArgs));

        guildConfig.panels[panelId] = {
            channelId: channel.id,
            messageId: panelMessage.id,
            label: 'Default',
            categoryIds: [],
            supportRoleId: null,
            channelCategoryId: null,
            panelMessage: null,
        };

        config[interaction.guild.id] = guildConfig;
        saveAll(config);

        const setupContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                buildSetupConfirmation({
                    panelChannel: channel,
                    ticketCategory,
                    supportRole,
                    panelLabel: 'Default',
                })
            ));
        await interaction.reply({ components: [setupContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    /* ───────────────────────── panel-add ───────────────────────── */

    async handlePanelAdd(interaction) {
        const channel = interaction.options.getChannel('channel');
        const label   = interaction.options.getString('label').trim().slice(0, 50);
        const catsRaw = interaction.options.getString('categories') || '';
        const supportRole = interaction.options.getRole('support-role');
        const ticketCategory = interaction.options.getChannel('ticket-category');

        if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
            return interaction.reply({
                content: '<:Cancel:1473037949187657818> The panel **channel** must be a text channel.',
                flags: MessageFlags.Ephemeral
            });
        }
        if (ticketCategory && ticketCategory.type !== ChannelType.GuildCategory) {
            return interaction.reply({
                content: '<:Cancel:1473037949187657818> **ticket-category** must be a Discord category.',
                flags: MessageFlags.Ephemeral
            });
        }

        const config = readAll();
        const guildConfig = ensureMigrated(config[interaction.guild.id]);
        if (!guildConfig) {
            return interaction.reply({
                content: '<:Cancel:1473037949187657818> Run `/ticket-setup create` first to configure the base ticket system.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Validate requested category IDs against the pool (silently drop unknowns)
        const pool = (guildConfig.categories || []).map(c => c.id);
        const requested = catsRaw.split(',').map(s => s.trim()).filter(Boolean);
        const categoryIds = requested.filter(id => pool.includes(id));
        const unknown = requested.filter(id => !pool.includes(id));

        const panelId = newPanelId();
        const panel = {
            channelId: channel.id,
            messageId: null,                    // populated after send
            label,
            categoryIds,                        // [] = expose all
            supportRoleId: supportRole?.id || null,
            channelCategoryId: ticketCategory?.id || null,
            panelMessage: null,
        };

        const guildSupportRole = guildConfig.supportRoleId ? interaction.guild.roles.cache.get(guildConfig.supportRoleId) : null;
        const panelSupportRole = supportRole || guildSupportRole;

        const sent = await channel.send(buildPanelMessage({
            guildConfig,
            panel,
            panelId,
            supportRole: panelSupportRole,
            guild: interaction.guild,
        })).catch(err => {
            return interaction.reply({
                content: `<:Cancel:1473037949187657818> Failed to send panel: ${err.message}`,
                flags: MessageFlags.Ephemeral
            }).then(() => null);
        });
        if (!sent) return;

        panel.messageId = sent.id;
        guildConfig.panels = guildConfig.panels || {};
        guildConfig.panels[panelId] = panel;
        config[interaction.guild.id] = guildConfig;
        saveAll(config);

        const summary = new ContainerBuilder()
            .setAccentColor(0x57F287)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# <:Checkedbox:1473038547165384804> Panel Added\n\n` +
                `### <:Document:1473039496995143731> Panel Details\n` +
                `<:Pin:1473038806612447500> **ID:** \`${panelId}\`\n` +
                `<:Pin:1473038806612447500> **Label:** \`${label}\`\n` +
                `<:Pin:1473038806612447500> **Channel:** ${channel}\n` +
                `<:Pin:1473038806612447500> **Categories:** ${categoryIds.length ? categoryIds.map(c => `\`${c}\``).join(', ') : '*all*'}\n` +
                `<:Pin:1473038806612447500> **Support Role Override:** ${supportRole || '*none (uses default)*'}\n` +
                `<:Pin:1473038806612447500> **Ticket Category Override:** ${ticketCategory || '*none (uses default)*'}\n` +
                (unknown.length ? `\n<:Inforect:1473038624172937287> Skipped unknown category IDs: ${unknown.map(c => `\`${c}\``).join(', ')}\n` : '') +
                `\n### <:Lightbulbalt:1473038470787240009> Next\n` +
                `<:Pin:1473038806612447500> Edit which categories show: \`/ticket-setup panel-categories panel-id:${panelId}\`\n` +
                `<:Pin:1473038806612447500> Remove panel: \`/ticket-setup panel-remove panel-id:${panelId}\``
            ));
        await interaction.reply({ components: [summary], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    /* ──────────────────────── panel-list ───────────────────────── */

    async handlePanelList(interaction) {
        const config = readAll();
        const guildConfig = ensureMigrated(config[interaction.guild.id]);
        if (!guildConfig) {
            return interaction.reply({
                content: '<:Cancel:1473037949187657818> Ticket system is not set up yet — run `/ticket-setup create` first.',
                flags: MessageFlags.Ephemeral
            });
        }

        const panels = Object.entries(guildConfig.panels || {});
        let body = `# <:Bookopen:1473038576391557130> Ticket Panels (${panels.length})\n\n`;

        if (!panels.length) {
            body += `*No panels yet. Run \`/ticket-setup create\` to add the first one.*`;
        } else {
            for (const [id, p] of panels) {
                const cats = (p.categoryIds && p.categoryIds.length)
                    ? p.categoryIds.map(c => `\`${c}\``).join(', ')
                    : '*all*';
                body += `### <:Pin:1473038806612447500> ${p.label || 'Untitled'}  \`${id}\`\n`;
                body += `<:Pin:1473038806612447500> **Channel:** <#${p.channelId}>\n`;
                body += `<:Pin:1473038806612447500> **Categories:** ${cats}\n`;
                if (p.supportRoleId)     body += `<:Pin:1473038806612447500> **Role Override:** <@&${p.supportRoleId}>\n`;
                if (p.channelCategoryId) body += `<:Pin:1473038806612447500> **Ticket Category Override:** <#${p.channelCategoryId}>\n`;
                body += `\n`;
            }
        }

        await interaction.reply({
            components: [new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
    },

    /* ──────────────────────── panel-remove ─────────────────────── */

    async handlePanelRemove(interaction) {
        const panelId = interaction.options.getString('panel-id');
        const config = readAll();
        const guildConfig = ensureMigrated(config[interaction.guild.id]);
        if (!guildConfig?.panels?.[panelId]) {
            return interaction.reply({
                content: `<:Cancel:1473037949187657818> No panel found with ID \`${panelId}\`. Use \`/ticket-setup panel-list\` to see panels.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const panel = guildConfig.panels[panelId];

        // Best-effort cleanup of the panel message
        try {
            const ch = await interaction.guild.channels.fetch(panel.channelId).catch(() => null);
            const msg = ch ? await ch.messages.fetch(panel.messageId).catch(() => null) : null;
            if (msg) await msg.delete().catch(() => null);
        } catch { /* non-fatal */ }

        delete guildConfig.panels[panelId];
        config[interaction.guild.id] = guildConfig;
        saveAll(config);

        await interaction.reply({
            content: `<:Checkedbox:1473038547165384804> Removed panel \`${panel.label || panelId}\` (\`${panelId}\`).`,
            flags: MessageFlags.Ephemeral
        });
    },

    /* ───────────────────── panel-categories ────────────────────── */

    async handlePanelCategories(interaction) {
        const panelId = interaction.options.getString('panel-id');
        const catsRaw = interaction.options.getString('categories') || '';

        const config = readAll();
        const guildConfig = ensureMigrated(config[interaction.guild.id]);
        if (!guildConfig?.panels?.[panelId]) {
            return interaction.reply({
                content: `<:Cancel:1473037949187657818> No panel found with ID \`${panelId}\`.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const pool = (guildConfig.categories || []).map(c => c.id);
        const requested = catsRaw.split(',').map(s => s.trim()).filter(Boolean);
        const categoryIds = requested.filter(id => pool.includes(id));
        const unknown = requested.filter(id => !pool.includes(id));

        guildConfig.panels[panelId].categoryIds = categoryIds;
        config[interaction.guild.id] = guildConfig;
        saveAll(config);

        // Live update
        const updated = await updatePanelMessage(interaction.client, interaction.guild.id, panelId);

        await interaction.reply({
            content:
                `<:Checkedbox:1473038547165384804> Panel \`${panelId}\` now exposes ${categoryIds.length ? categoryIds.map(c => `\`${c}\``).join(', ') : '**all categories**'}.` +
                (unknown.length ? `\n<:Inforect:1473038624172937287> Ignored unknown IDs: ${unknown.map(c => `\`${c}\``).join(', ')}` : '') +
                (updated ? `` : `\n<:Inforect:1473038624172937287> Could not auto-refresh the panel message.`),
            flags: MessageFlags.Ephemeral
        });
    },

    /* ─────────────────── style / transcript / status ───────────── */

    async handleStyle(interaction) {
        const config = readAll();
        const guildConfig = ensureMigrated(config[interaction.guild.id]);
        if (!guildConfig) {
            return interaction.reply({
                content: '<:Cancel:1473037949187657818> Run `/ticket-setup create` first.',
                flags: MessageFlags.Ephemeral
            });
        }
        const presetKey = interaction.options.getString('preset');
        const preset = TICKET_PRESETS[presetKey];
        if (!preset) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> Unknown preset.', flags: MessageFlags.Ephemeral });
        }

        guildConfig.categories = JSON.parse(JSON.stringify(preset.categories));
        config[interaction.guild.id] = guildConfig;
        saveAll(config);

        // Refresh every panel — they may have shown empty placeholders
        let refreshed = 0;
        for (const panelId of Object.keys(guildConfig.panels || {})) {
            if (await updatePanelMessage(interaction.client, interaction.guild.id, panelId)) refreshed++;
        }

        const catList = guildConfig.categories
            .map(c => `${c.emoji} **${c.label}** — ${c.description}`)
            .join('\n');

        await interaction.reply({
            components: [new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Checkedbox:1473038547165384804> Style Applied\n\n` +
                    `**Preset:** ${preset.label}\n` +
                    `${preset.description}\n\n` +
                    `### <:Bookopen:1473038576391557130> Category Pool\n${catList}\n\n` +
                    `<:Checkedbox:1473038547165384804> Refreshed **${refreshed}** panel${refreshed === 1 ? '' : 's'}.`
                ))],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
    },

    async handleTranscript(interaction) {
        const config = readAll();
        const guildConfig = ensureMigrated(config[interaction.guild.id]);
        if (!guildConfig) {
            return interaction.reply({
                content: '<:Cancel:1473037949187657818> Run `/ticket-setup create` first.',
                flags: MessageFlags.Ephemeral
            });
        }
        const mode = interaction.options.getString('mode');
        const logChannel = interaction.options.getChannel('log-channel');

        if (logChannel && ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(logChannel.type)) {
            return interaction.reply({
                content: '<:Cancel:1473037949187657818> Transcript log channel must be a **text** channel.',
                flags: MessageFlags.Ephemeral
            });
        }
        if ((mode === 'auto' || mode === 'both') && !logChannel && !guildConfig.transcriptChannelId) {
            return interaction.reply({
                content: '<:Cancel:1473037949187657818> Auto-transcript needs a `log-channel`. Pass one with `log-channel:#channel`.',
                flags: MessageFlags.Ephemeral
            });
        }

        guildConfig.transcriptMode = mode;
        if (logChannel) guildConfig.transcriptChannelId = logChannel.id;
        config[interaction.guild.id] = guildConfig;
        saveAll(config);

        const desc = {
            auto:   'Transcripts are saved **automatically** when any ticket is closed.',
            manual: 'Transcripts are saved only when staff press the **Save Transcript** button.',
            both:   'Transcripts are saved **automatically on close** *and* via the manual button.',
            off:    'Transcript saving is **disabled**.',
        }[mode];
        const target = (mode === 'auto' || mode === 'both')
            ? `**Log Channel:** <#${guildConfig.transcriptChannelId}>`
            : `**Log Channel:** *(not used in this mode)*`;

        await interaction.reply({
            components: [new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Checkedbox:1473038547165384804> Transcript Settings Saved\n\n` +
                    `**Mode:** \`${mode}\`\n` +
                    `${target}\n\n` +
                    `${desc}\n\n` +
                    `### <:Document:1473039496995143731> Output Format\n` +
                    `Transcripts are delivered as both \`.md\` and \`.html\`. All messages, attachments, and embeds are captured up to a 2,000-message limit.`
                ))],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
    },

    async handleStatus(interaction) {
        const config = readAll();
        const guildConfig = ensureMigrated(config[interaction.guild.id]);
        if (!guildConfig) {
            return interaction.reply({
                content: '<:Cancel:1473037949187657818> Ticket system is not set up yet. Use `/ticket-setup create`.',
                flags: MessageFlags.Ephemeral
            });
        }

        const panels = Object.entries(guildConfig.panels || {});
        const panelLines = panels.length
            ? panels.map(([id, p]) =>
                `<:Pin:1473038806612447500> **${p.label || 'Untitled'}** \`${id}\` → <#${p.channelId}> · ${(p.categoryIds?.length ? p.categoryIds.length + ' cats' : 'all cats')}`
            ).join('\n')
            : '*none*';

        const cat        = guildConfig.categoryId    ? `<#${guildConfig.categoryId}>`     : '*missing*';
        const role       = guildConfig.supportRoleId ? `<@&${guildConfig.supportRoleId}>` : '*missing*';
        const tMode      = guildConfig.transcriptMode || 'manual';
        const tLog       = guildConfig.transcriptChannelId ? `<#${guildConfig.transcriptChannelId}>` : '*not set*';
        const openTickets = Object.keys(guildConfig.tickets || {}).length;
        const totalIssued = guildConfig.nextTicketNumber || 0;

        const categoriesList = (guildConfig.categories || [])
            .map(c => `<:Pin:1473038806612447500> ${c.emoji} **${c.label}** \`${c.id}\``)
            .join('\n') || '*none — add some with /ticket-categories add*';

        const welcomeStatus = guildConfig.welcomeMessage ? '<:Checkedbox:1473038547165384804> Custom' : '<:Edit:1473037903625191580> Default';

        await interaction.reply({
            components: [new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Document:1473039496995143731> Ticket System Status\n\n` +
                    `### <:Settings:1473037894703779851> Defaults\n` +
                    `<:Pin:1473038806612447500> **Ticket Category:** ${cat}\n` +
                    `<:Pin:1473038806612447500> **Support Role:** ${role}\n\n` +
                    `### <:Bookopen:1473038576391557130> Panels (${panels.length})\n${panelLines}\n\n` +
                    `### <:Star:1473038501766369300> Category Pool (${(guildConfig.categories || []).length})\n${categoriesList}\n\n` +
                    `### <:Clipboardalt:1473039555190849598> Transcripts\n` +
                    `<:Pin:1473038806612447500> **Mode:** \`${tMode}\`\n` +
                    `<:Pin:1473038806612447500> **Log Channel:** ${tLog}\n\n` +
                    `### <:Edit:1473037903625191580> Customization\n` +
                    `<:Pin:1473038806612447500> **Welcome Message:** ${welcomeStatus}\n\n` +
                    `### <:Chat:1473038936241864865> Activity\n` +
                    `<:Pin:1473038806612447500> **Open Tickets:** \`${openTickets}\`\n` +
                    `<:Pin:1473038806612447500> **Total Issued:** \`${totalIssued}\``
                ))],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
    },

    /* ───────────────── welcome / panel builders ────────────────── */

    async handleMessage(interaction) {
        const config = readAll();
        const guildConfig = ensureMigrated(config[interaction.guild.id]);
        if (!guildConfig) {
            return interaction.reply({
                content: '<:Cancel:1473037949187657818> Run `/ticket-setup create` first.',
                flags: MessageFlags.Ephemeral
            });
        }
        const prefix = `ticketmsg:${interaction.guild.id}`;
        const data = startMessageBuilderSession(interaction.user.id, 'ticket', interaction.guild.id, 'welcome', 'Ticket Welcome Message');
        if (guildConfig.welcomeMessage) Object.assign(data, {
            mode: guildConfig.welcomeMessage.mode || 'simple',
            content: guildConfig.welcomeMessage.content || '',
            title: guildConfig.welcomeMessage.title || '',
            description: guildConfig.welcomeMessage.description || '',
            color: guildConfig.welcomeMessage.color || '#5865F2',
            image: guildConfig.welcomeMessage.image || '',
            thumbnail: guildConfig.welcomeMessage.thumbnail || '',
            footer: guildConfig.welcomeMessage.footer || '',
            footerIcon: guildConfig.welcomeMessage.footerIcon || '',
            author: guildConfig.welcomeMessage.author || '',
            authorIcon: guildConfig.welcomeMessage.authorIcon || '',
            fields: guildConfig.welcomeMessage.fields || [],
        });
        const container = buildMessageBuilderPanel(data, prefix, 'Ticket Welcome Message');
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async handlePanel(interaction) {
        const config = readAll();
        const guildConfig = ensureMigrated(config[interaction.guild.id]);
        if (!guildConfig) {
            return interaction.reply({
                content: '<:Cancel:1473037949187657818> Run `/ticket-setup create` first.',
                flags: MessageFlags.Ephemeral
            });
        }
        const prefix = `ticketpanel:${interaction.guild.id}`;
        const data = startMessageBuilderSession(interaction.user.id, 'ticketpanel', interaction.guild.id, 'panel', 'Ticket Panel Message');
        if (guildConfig.panelMessage) Object.assign(data, {
            mode: guildConfig.panelMessage.mode || 'simple',
            content: guildConfig.panelMessage.content || '',
            title: guildConfig.panelMessage.title || '',
            description: guildConfig.panelMessage.description || '',
            color: guildConfig.panelMessage.color || '#5865F2',
            image: guildConfig.panelMessage.image || '',
            thumbnail: guildConfig.panelMessage.thumbnail || '',
            footer: guildConfig.panelMessage.footer || '',
            footerIcon: guildConfig.panelMessage.footerIcon || '',
            author: guildConfig.panelMessage.author || '',
            authorIcon: guildConfig.panelMessage.authorIcon || '',
            fields: guildConfig.panelMessage.fields || [],
        });
        const container = buildMessageBuilderPanel(data, prefix, 'Ticket Panel Message');
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async handleResetPanel(interaction) {
        const config = readAll();
        const guildConfig = ensureMigrated(config[interaction.guild.id]);
        if (!guildConfig) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> Ticket system is not set up.', flags: MessageFlags.Ephemeral });
        }
        delete guildConfig.panelMessage;
        config[interaction.guild.id] = guildConfig;
        saveAll(config);
        for (const panelId of Object.keys(guildConfig.panels || {})) {
            await updatePanelMessage(interaction.client, interaction.guild.id, panelId);
        }
        await interaction.reply({
            content: '<:Checkedbox:1473038547165384804> Panel message reset to default. All panels refreshed.',
            flags: MessageFlags.Ephemeral
        });
    },

    async handleResetMessage(interaction) {
        const config = readAll();
        const guildConfig = ensureMigrated(config[interaction.guild.id]);
        if (!guildConfig) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> Ticket system is not set up.', flags: MessageFlags.Ephemeral });
        }
        delete guildConfig.welcomeMessage;
        config[interaction.guild.id] = guildConfig;
        saveAll(config);
        await interaction.reply({
            content: '<:Checkedbox:1473038547165384804> Welcome message reset to default.',
            flags: MessageFlags.Ephemeral
        });
    },

    /* ──────────────────── builder button/modal routing ─────────── */

    async handleInteraction(interaction) {
        if (!interaction.isButton()) return false;
        if (await checkAndExpire(interaction, 'config')) return true;
        const prefix = extractPrefixFromCustomId(interaction.customId);

        if (prefix.startsWith('ticketpanel:')) {
            const guildId = prefix.replace('ticketpanel:', '');
            const onSave = async (btnInteraction, data) => {
                const config = readAll();
                const guildConfig = ensureMigrated(config[guildId]);
                if (!guildConfig) {
                    return btnInteraction.update({ content: '<:Cancel:1473037949187657818> Ticket system not configured!', components: [] });
                }
                guildConfig.panelMessage = sanitizePanelMessageData(data);
                config[guildId] = guildConfig;
                saveAll(config);
                let refreshed = 0;
                for (const panelId of Object.keys(guildConfig.panels || {})) {
                    if (await updatePanelMessage(btnInteraction.client, guildId, panelId)) refreshed++;
                }
                await btnInteraction.update({
                    components: [new ContainerBuilder()
                        .setAccentColor(0xCAD7E6)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                            `# <:Checkedbox:1473038547165384804> Panel Message Saved\n\n` +
                            `Refreshed **${refreshed}** panel${refreshed === 1 ? '' : 's'}.\n` +
                            `**Mode:** ${data.mode === 'embed' ? '<:Document:1473039496995143731> Embed' : data.mode === 'components' ? '<:Settings:1473037894703779851> Components V2' : '<:Chat:1473038936241864865> Simple'}\n\n` +
                            `Reset with \`/ticket-setup reset-panel\`.`
                        ))],
                    flags: MessageFlags.IsComponentsV2
                });
            };
            const onCancel = async (b) => b.update({ content: '<:Cancel:1473037949187657818> Panel builder cancelled.', components: [] });
            return await handleButtonInteraction(interaction, prefix, 'ticketpanel', guildId, 'panel', onSave, onCancel);
        }

        if (!prefix.startsWith('ticketmsg:')) return false;
        const guildId = prefix.replace('ticketmsg:', '');
        const onSave = async (btnInteraction, data) => {
            const config = readAll();
            const guildConfig = ensureMigrated(config[guildId]);
            if (!guildConfig) {
                return btnInteraction.update({ content: '<:Cancel:1473037949187657818> Ticket system not configured!', components: [] });
            }
            guildConfig.welcomeMessage = sanitizePanelMessageData(data);
            config[guildId] = guildConfig;
            saveAll(config);
            await btnInteraction.update({
                components: [new ContainerBuilder()
                    .setAccentColor(0xCAD7E6)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> Welcome Message Saved\n\n` +
                        `**Mode:** ${data.mode === 'embed' ? '<:Document:1473039496995143731> Embed' : '<:Chat:1473038936241864865> Simple'}\n\n` +
                        `Will be sent on every new ticket.\n\n` +
                        `### <:Lightbulbalt:1473038470787240009> Placeholders\n` +
                        `\`{user}\` \`{username}\` \`{server}\` \`{timestamp}\` \`{membercount}\` \`{channel}\``
                    ))],
                flags: MessageFlags.IsComponentsV2
            });
        };
        const onCancel = async (b) => b.update({ content: '<:Cancel:1473037949187657818> Message builder cancelled.', components: [] });
        return await handleButtonInteraction(interaction, prefix, 'ticket', guildId, 'welcome', onSave, onCancel);
    },

    async handleModalSubmit(interaction) {
        const prefix = extractPrefixFromCustomId(interaction.customId);
        if (prefix.startsWith('ticketpanel:')) {
            return handleMsgBuilderModal(interaction, prefix, 'ticketpanel', prefix.replace('ticketpanel:', ''), 'panel');
        }
        if (prefix.startsWith('ticketmsg:')) {
            return handleMsgBuilderModal(interaction, prefix, 'ticket', prefix.replace('ticketmsg:', ''), 'welcome');
        }
        return false;
    },

    /* ───────────────────────── help ─────────────────────────────── */

    async handleHelp(interaction) {
        await interaction.reply({
            components: [new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Clipboard:1473039573037617162> Ticket System — Complete Guide\n\n` +
                    `Multi-panel ticket support with category presets, customizable messages, and full transcripts.\n\n` +
                    `### <:Settings:1473037894703779851> First-Time Setup\n` +
                    `<:Pin:1473038806612447500> **1.** \`/ticket-setup create channel:#tickets category:Tickets support-role:@Support\`\n` +
                    `<:Pin:1473038806612447500> **2.** Add categories: \`/ticket-categories add <id> <label> <emoji> <description>\`\n` +
                    `<:Pin:1473038806612447500>      *(or)* \`/ticket-setup style preset:purchase\`\n` +
                    `<:Pin:1473038806612447500> **3.** *(optional)* \`/ticket-setup transcript mode:auto log-channel:#logs\`\n\n` +
                    `### <:Bookopen:1473038576391557130> Multiple Panels\n` +
                    `<:Pin:1473038806612447500> Add a second panel: \`/ticket-setup panel-add channel:#sales label:Sales categories:purchase,billing\`\n` +
                    `<:Pin:1473038806612447500> List all panels: \`/ticket-setup panel-list\`\n` +
                    `<:Pin:1473038806612447500> Edit panel categories: \`/ticket-setup panel-categories panel-id:<id> categories:billing,product\`\n` +
                    `<:Pin:1473038806612447500> Remove a panel: \`/ticket-setup panel-remove panel-id:<id>\`\n\n` +
                    `### <:Star:1473038501766369300> Customize\n` +
                    `\`/ticket-setup style preset:<purchase|general|random|minimal>\`\n` +
                    `\`/ticket-setup panel\` — design the panel body (V2 builder)\n` +
                    `\`/ticket-setup message\` — design the in-ticket welcome\n` +
                    `\`/ticket-setup status\` — current configuration\n` +
                    `\`/ticket-categories add|edit|remove|list\` — fine-tune the category pool\n\n` +
                    `### <:Chat:1473038936241864865> User Flow\n` +
                    `<:Pin:1473038806612447500> Pick a category from the dropdown\n` +
                    `<:Pin:1473038806612447500> Get a private channel named \`category-username-N\` (e.g. \`general-rajeev-1\`)\n` +
                    `<:Pin:1473038806612447500> Discuss with staff, share screenshots, etc.\n` +
                    `<:Pin:1473038806612447500> Close → transcript saves automatically (if enabled)\n\n` +
                    `### <:Document:1473039496995143731> In-Ticket Commands\n` +
                    `\`/ticket-add @user\` — invite someone\n` +
                    `\`/ticket-remove @user\` — remove someone\n` +
                    `\`/ticket-close\` — close the ticket\n\n` +
                    `### <:Infotriangle:1473038460456800459> Required Bot Permissions\n` +
                    `Manage Channels • Manage Roles • Send Messages • Embed Links • Attach Files • Read Message History`
                ))],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
    },

    /* ─────────────────────── prefix command ────────────────────── */

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('<:Cancel:1473037949187657818> You need **Manage Guild** permission to use this command!');
        }
        const sub = args[0]?.toLowerCase();
        if (['message', 'panel', 'style', 'transcript', 'status', 'panel-add', 'panel-list', 'panel-remove', 'panel-categories'].includes(sub)) {
            return message.reply(`<:Inforect:1473038624172937287> The \`${sub}\` action is only available via slash command: \`/ticket-setup ${sub}\``);
        }
        if (sub === 'reset-message') {
            const config = readAll();
            const guildConfig = ensureMigrated(config[message.guild.id]);
            if (!guildConfig) return message.reply('<:Cancel:1473037949187657818> Ticket system is not set up.');
            delete guildConfig.welcomeMessage;
            config[message.guild.id] = guildConfig; saveAll(config);
            return message.reply('<:Checkedbox:1473038547165384804> Welcome message reset to default.');
        }
        if (sub === 'reset-panel') {
            const config = readAll();
            const guildConfig = ensureMigrated(config[message.guild.id]);
            if (!guildConfig) return message.reply('<:Cancel:1473037949187657818> Ticket system is not set up.');
            delete guildConfig.panelMessage;
            config[message.guild.id] = guildConfig; saveAll(config);
            for (const panelId of Object.keys(guildConfig.panels || {})) {
                await updatePanelMessage(message.client, message.guild.id, panelId);
            }
            return message.reply('<:Checkedbox:1473038547165384804> Panel reset to default. Refreshed all panels.');
        }
        if (!args.length || sub === 'help') {
            return message.reply({
                components: [new ContainerBuilder()
                    .setAccentColor(0xCAD7E6)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Clipboard:1473039573037617162> Ticket System — Quick Setup\n\n` +
                        `### <:Document:1473039496995143731> Usage\n` +
                        `\`-ticket-setup #panel-channel #category @support-role\`\n\n` +
                        `Use \`/ticket-setup help\` for the full guide. Multi-panel features (\`panel-add\`, \`panel-list\`, etc.) are slash-only.`
                    ))],
                flags: MessageFlags.IsComponentsV2
            });
        }

        const channels = Array.from(message.mentions.channels.values());
        const role = message.mentions.roles.first();
        if (channels.length < 2 || !role) {
            return message.reply('<:Cancel:1473037949187657818> **Usage:** `-ticket-setup #panel-channel #category @support-role`');
        }
        const channel = channels[0];
        const category = channels[1];
        if (category.type !== ChannelType.GuildCategory) {
            return message.reply('<:Cancel:1473037949187657818> The second channel must be a **category** (folder icon).');
        }

        const config = readAll();
        const existing = ensureMigrated(config[message.guild.id]);
        const guildConfig = {
            categoryId:    category.id,
            supportRoleId: role.id,
            tickets:           existing?.tickets || {},
            nextTicketNumber:  existing?.nextTicketNumber || 0,
            categories:        existing?.categories || [],
            transcriptMode:    existing?.transcriptMode || 'manual',
            transcriptChannelId: existing?.transcriptChannelId || null,
            welcomeMessage:    existing?.welcomeMessage,
            panelMessage:      existing?.panelMessage,
            panels:            existing?.panels || {},
        };

        const old = guildConfig.panels.default;
        if (old?.channelId && old?.messageId) {
            try {
                const oldChan = await message.guild.channels.fetch(old.channelId).catch(() => null);
                const oldMsg  = oldChan ? await oldChan.messages.fetch(old.messageId).catch(() => null) : null;
                if (oldMsg) await oldMsg.delete().catch(() => null);
            } catch {}
        }

        const renderArgs = {
            guildConfig,
            panel: { channelId: channel.id, label: 'Default', categoryIds: [], supportRoleId: null, channelCategoryId: null, panelMessage: null },
            panelId: 'default',
            supportRole: role,
            guild: message.guild,
        };
        const sent = await channel.send(buildPanelMessage(renderArgs));

        guildConfig.panels.default = {
            channelId: channel.id,
            messageId: sent.id,
            label: 'Default',
            categoryIds: [],
            supportRoleId: null,
            channelCategoryId: null,
            panelMessage: null,
        };
        config[message.guild.id] = guildConfig;
        saveAll(config);

        await message.reply({
            components: [new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    buildSetupConfirmation({
                        panelChannel: channel, ticketCategory: category, supportRole: role, panelLabel: 'Default'
                    })
                ))],
            flags: MessageFlags.IsComponentsV2
        });
    },
};

/* ────────────────────────── helpers ────────────────────────────── */

function sanitizePanelMessageData(data) {
    return {
        mode:        data.mode,
        content:     data.content     || '',
        title:       data.title       || '',
        description: data.description || '',
        color:       data.color       || '#5865F2',
        image:       data.image       || '',
        thumbnail:   data.thumbnail   || '',
        footer:      data.footer      || '',
        footerIcon:  data.footerIcon  || '',
        author:      data.author      || '',
        authorIcon:  data.authorIcon  || '',
        fields:      data.fields      || [],
    };
}

/**
 * Re-render a specific panel's message with the latest config + categories.
 * Returns true on success. Stale or deleted panel messages are dropped from
 * the config so we don't keep retrying forever.
 */
async function updatePanelMessage(client, guildId, panelId) {
    const config = readAll();
    const guildConfig = ensureMigrated(config[guildId]);
    if (!guildConfig?.panels?.[panelId]) return false;

    const panel = guildConfig.panels[panelId];
    if (!panel.channelId || !panel.messageId) return false;

    try {
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return false;
        const channel = await guild.channels.fetch(panel.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return false;
        const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
        if (!msg) {
            // Message was deleted. Drop it from config so next /ticket-setup create
            // doesn't try to delete a ghost.
            delete guildConfig.panels[panelId];
            config[guildId] = guildConfig;
            saveAll(config);
            return false;
        }

        const supportRoleId = panel.supportRoleId || guildConfig.supportRoleId;
        const supportRole = supportRoleId ? await guild.roles.fetch(supportRoleId).catch(() => null) : null;

        await msg.edit(buildPanelMessage({
            guildConfig, panel, panelId, supportRole, guild,
        }));
        return true;
    } catch (err) {
        return false;
    }
}

// Export internals so commands/automation/ticket-categories.js can call updatePanelMessage
module.exports.updatePanelMessage = updatePanelMessage;
module.exports.TICKET_PRESETS = TICKET_PRESETS;
