const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags, ChannelType, SeparatorBuilder, SeparatorSpacingSize, EmbedBuilder, EmbedBuilder: EB } = require('discord.js');
const { startMessageBuilderSession, handleButtonInteraction, handleModalSubmit: handleMsgBuilderModal, buildMessageBuilderPanel, buildPreviewEmbed, buildComponentsV2Message, replacePlaceholders: msgReplacePlaceholders, getSession, messageBuilderSessions, extractPrefixFromCustomId } = require('../../utils/actionMessageBuilder');
const { checkAndExpire } = require('../../utils/panelExpiration');

const jsonStore = require('../../utils/jsonStore');

function loadConfig() {
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

function saveConfig(config) {
    jsonStore.write('tickets', config);
}

function buildDefaultPanelContent(supportRole, categories) {
    let content = `# 🎫 Support Ticket System\n\n`;
    content += `Need assistance? Our support team is here to help! Select a category below that best matches your inquiry.\n\n`;
    content += `### <:Document:1473039496995143731> Available Categories\n`;
    
    for (const cat of categories) {
        const cleanLabel = cat.label.replace(/<:[^>]+>/g, '').trim();
        content += `${cat.emoji.startsWith('<') ? '<:Pin:1473038806612447500>' : cat.emoji} **${cleanLabel}**\n`;
        content += `*${cat.description}*\n\n`;
    }
    
    content += `### 📖 How It Works\n`;
    content += `**1.** Select a category from the dropdown menu below\n`;
    content += `**2.** A private channel will be created for your ticket\n`;
    content += `**3.** Describe your issue and our team will assist you\n\n`;
    content += `**Support Team:** ${supportRole}`;
    
    return content;
}

function buildTicketPanel(supportRole, categories, panelConfig, guild) {
    if (panelConfig && panelConfig.mode) {
        const { replacePlaceholders: msgReplace } = require('../../utils/actionMessageBuilder');
        if (panelConfig.mode === 'components') {
            // Components V2 panel using ContainerBuilder
            const { buildComponentsV2Message: buildV2 } = require('../../utils/actionMessageBuilder');
            const container = buildV2(panelConfig, null, guild, null);
            return { type: 'components', container };
        } else if (panelConfig.mode === 'embed') {
            // Return embed-based panel
                        const embed = new EB();
            if (panelConfig.title) embed.setTitle(msgReplace(panelConfig.title, null, guild));
            if (panelConfig.description) embed.setDescription(msgReplace(panelConfig.description, null, guild));
            if (panelConfig.color) embed.setColor(panelConfig.color);
            if (panelConfig.image) embed.setImage(panelConfig.image);
            if (panelConfig.thumbnail) embed.setThumbnail(panelConfig.thumbnail);
            if (panelConfig.author) embed.setAuthor({ name: msgReplace(panelConfig.author, null, guild), iconURL: panelConfig.authorIcon || undefined });
            if (panelConfig.footer) embed.setFooter({ text: msgReplace(panelConfig.footer, null, guild), iconURL: panelConfig.footerIcon || undefined });
            if (panelConfig.fields?.length) {
                for (const f of panelConfig.fields.slice(0, 25)) {
                    embed.addFields({ name: msgReplace(f.name, null, guild), value: msgReplace(f.value, null, guild), inline: f.inline || false });
                }
            }
            return { type: 'embed', embed };
        } else if (panelConfig.content) {
            return { type: 'simple', content: msgReplace(panelConfig.content, null, guild) };
        }
    }
    return { type: 'default', content: buildDefaultPanelContent(supportRole, categories) };
}

function buildPanelMessage(supportRole, categories, panelConfig, guild) {
    const panel = buildTicketPanel(supportRole, categories, panelConfig, guild);
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_category_select')
        .setPlaceholder('Select a ticket category to get help')
        .addOptions(
            categories.map(cat => ({
                label: cat.label.replace(/^[^\s]+\s/, ''),
                value: cat.id,
                description: cat.description,
                emoji: cat.emoji
            }))
        );
    const row = new ActionRowBuilder().addComponents(selectMenu);

    if (panel.type === 'embed') {
        return { embeds: [panel.embed], components: [row] };
    }
    if (panel.type === 'components') {
        // Append the select menu row to the V2 container
        panel.container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        panel.container.addActionRowComponents(row);
        return { components: [panel.container], flags: MessageFlags.IsComponentsV2 };
    }
    const container = new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(panel.content))
        .addActionRowComponents(row);
    return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

function buildSetupConfirmation(channel, category, supportRole) {
    return `# <:Checkedbox:1473038547165384804> Ticket System Successfully Configured\n\n` +
        `Your ticket system is now ready to use!\n\n` +
        `### <:Document:1473039496995143731> Configuration Summary\n` +
        `**Panel Channel:** ${channel}\n` +
        `**Ticket Category:** ${category}\n` +
        `**Support Role:** ${supportRole}\n\n` +
        `### 🎫 Default Ticket Categories\n` +
        `<:Chat:1473038936241864865> **General Support** - General questions and help\n` +
        `🐛 **Bug Report** - Report bugs and issues\n` +
        `<:Star:1473038501766369300> **Feature Request** - Suggest new features\n` +
        `💳 **Payment Issue** - Billing and payment help\n` +
        `<:Edit:1473037903625191580> **Other** - Anything else\n\n` +
        `### <:Settings:1473037894703779851> Related Commands\n` +
        `\`/ticket-add @user\` - Add a user to the ticket\n` +
        `\`/ticket-remove @user\` - Remove a user from the ticket\n` +
        `\`/ticket-close\` - Close the current ticket\n` +
        `\`/ticket-transcript\` - Save ticket transcript\n\n` +
        `*Users can now create tickets using the dropdown menu!*`;
}

module.exports = {
    category: 'automation',
    data: new SlashCommandBuilder()
        .setName('ticket-setup')
        .setDescription('Setup the ticket support system with categorized ticket creation')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new ticket system')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Channel where the ticket panel will be displayed')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('category')
                        .setDescription('Category where ticket channels will be created')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('support-role')
                        .setDescription('Role that can view and manage all tickets')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('help')
                .setDescription('View detailed guide on setting up the ticket system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('message')
                .setDescription('Customize the welcome message sent when a ticket is opened'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset-message')
                .setDescription('Reset the ticket welcome message to default'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('panel')
                .setDescription('Customize the ticket panel message displayed in the channel'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset-panel')
                .setDescription('Reset the ticket panel message to default'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'help') {
            return this.handleHelp(interaction);
        }

        if (subcommand === 'message') {
            return this.handleMessage(interaction);
        }

        if (subcommand === 'reset-message') {
            return this.handleResetMessage(interaction);
        }

        if (subcommand === 'panel') {
            return this.handlePanel(interaction);
        }

        if (subcommand === 'reset-panel') {
            return this.handleResetPanel(interaction);
        }

        const channel = interaction.options.getChannel('channel');
        const category = interaction.options.getChannel('category');
        const supportRole = interaction.options.getRole('support-role');
        
        if (category.type !== ChannelType.GuildCategory) {
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xED4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Invalid Category\n\n` +
                        `Please select a **category channel** (folder icon), not a text channel.\n\n` +
                        `**Tip:** Categories appear with folder icons in your channel list.`
                    )
                );
            return interaction.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        
        const config = loadConfig();
        const existingGuildConfig = config[interaction.guild.id];
        const categories = [
            { id: 'support', label: 'General Support', emoji: '<:Chat:1473038936241864865>', description: 'Get help with general questions and inquiries' },
            { id: 'other', label: 'Other', emoji: '<:Edit:1473037903625191580>', description: 'Anything else that doesn\'t fit above' }
        ];
        
        config[interaction.guild.id] = {
            channelId: channel.id,
            categoryId: category.id,
            supportRoleId: supportRole.id,
            tickets: existingGuildConfig?.tickets || {},
            nextTicketNumber: existingGuildConfig?.nextTicketNumber || 0,
            categories: categories
        };
        saveConfig(config);
        
        const panelMsg = buildPanelMessage(supportRole, categories, null, interaction.guild);
        const panelMessage = await channel.send(panelMsg);
        
        config[interaction.guild.id].panelMessageId = panelMessage.id;
        saveConfig(config);
        
        const setupContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(buildSetupConfirmation(channel, category, supportRole))
            );
        
        await interaction.reply({ components: [setupContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async handleMessage(interaction) {
        const config = loadConfig();
        const guildConfig = config[interaction.guild.id];

        if (!guildConfig) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> Ticket system is not set up yet! Use `/ticket-setup create` first.', flags: MessageFlags.Ephemeral });
        }

        const prefix = `ticketmsg:${interaction.guild.id}`;
        const data = startMessageBuilderSession(interaction.user.id, 'ticket', interaction.guild.id, 'welcome', 'Ticket Welcome Message');

        // Pre-fill with existing custom message if any
        if (guildConfig.welcomeMessage) {
            const wm = guildConfig.welcomeMessage;
            data.mode = wm.mode || 'simple';
            data.content = wm.content || '';
            data.title = wm.title || '';
            data.description = wm.description || '';
            data.color = wm.color || '#5865F2';
            data.image = wm.image || '';
            data.thumbnail = wm.thumbnail || '';
            data.footer = wm.footer || '';
            data.footerIcon = wm.footerIcon || '';
            data.author = wm.author || '';
            data.authorIcon = wm.authorIcon || '';
            data.fields = wm.fields || [];
        }

        const container = buildMessageBuilderPanel(data, prefix, 'Ticket Welcome Message');
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async handlePanel(interaction) {
        const config = loadConfig();
        const guildConfig = config[interaction.guild.id];

        if (!guildConfig) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> Ticket system is not set up yet! Use `/ticket-setup create` first.', flags: MessageFlags.Ephemeral });
        }

        const prefix = `ticketpanel:${interaction.guild.id}`;
        const data = startMessageBuilderSession(interaction.user.id, 'ticketpanel', interaction.guild.id, 'panel', 'Ticket Panel Message');

        if (guildConfig.panelMessage) {
            const pm = guildConfig.panelMessage;
            data.mode = pm.mode || 'simple';
            data.content = pm.content || '';
            data.title = pm.title || '';
            data.description = pm.description || '';
            data.color = pm.color || '#5865F2';
            data.image = pm.image || '';
            data.thumbnail = pm.thumbnail || '';
            data.footer = pm.footer || '';
            data.footerIcon = pm.footerIcon || '';
            data.author = pm.author || '';
            data.authorIcon = pm.authorIcon || '';
            data.fields = pm.fields || [];
        }

        const container = buildMessageBuilderPanel(data, prefix, 'Ticket Panel Message');
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async handleResetPanel(interaction) {
        const config = loadConfig();
        const guildConfig = config[interaction.guild.id];

        if (!guildConfig) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> Ticket system is not set up yet!', flags: MessageFlags.Ephemeral });
        }

        delete guildConfig.panelMessage;
        saveConfig(config);

        // Re-send the default panel
        try {
            const guild = interaction.guild;
            const channel = await guild.channels.fetch(guildConfig.channelId).catch(() => null);
            const supportRole = guildConfig.supportRoleId ? await guild.roles.fetch(guildConfig.supportRoleId).catch(() => null) : null;
            const categories = guildConfig.categories || [];
            if (channel && guildConfig.panelMessageId) {
                const oldMsg = await channel.messages.fetch(guildConfig.panelMessageId).catch(() => null);
                if (oldMsg) {
                    const panelMsg = buildPanelMessage(supportRole, categories, null, guild);
                    await oldMsg.edit(panelMsg);
                }
            }
        } catch {}

        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Checkedbox:1473038547165384804> Panel Message Reset\n\n` +
                    `The ticket panel message has been reset to the default.\n\n` +
                    `Use \`/ticket-setup panel\` to customize it again.`
                )
            );
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async handleResetMessage(interaction) {
        const config = loadConfig();
        const guildConfig = config[interaction.guild.id];

        if (!guildConfig) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> Ticket system is not set up yet!', flags: MessageFlags.Ephemeral });
        }

        delete guildConfig.welcomeMessage;
        saveConfig(config);

        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Checkedbox:1473038547165384804> Welcome Message Reset\n\n` +
                    `The ticket welcome message has been reset to the default.\n\n` +
                    `### Default Message\n` +
                    `The default message includes:\n` +
                    `• Welcome greeting with user mention\n` +
                    `• Category label\n` +
                    `• Creation timestamp\n` +
                    `• Instructions for describing the issue\n` +
                    `• Ticket command help\n\n` +
                    `Use \`/ticket-setup message\` to customize it again.`
                )
            );
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async handleInteraction(interaction) {
        if (!interaction.isButton()) return false;
        if (await checkAndExpire(interaction, 'config')) return true;
        const prefix = extractPrefixFromCustomId(interaction.customId);

        // Handle panel builder buttons
        if (prefix.startsWith('ticketpanel:')) {
            const guildId = prefix.replace('ticketpanel:', '');

            const onSave = async (btnInteraction, data) => {
                const config = loadConfig();
                if (!config[guildId]) {
                    return btnInteraction.update({ content: '<:Cancel:1473037949187657818> Ticket system config not found!', components: [], flags: MessageFlags.Ephemeral });
                }

                config[guildId].panelMessage = {
                    mode: data.mode,
                    content: data.content || '',
                    title: data.title || '',
                    description: data.description || '',
                    color: data.color || '#5865F2',
                    image: data.image || '',
                    thumbnail: data.thumbnail || '',
                    footer: data.footer || '',
                    footerIcon: data.footerIcon || '',
                    author: data.author || '',
                    authorIcon: data.authorIcon || '',
                    fields: data.fields || []
                };
                saveConfig(config);

                // Update the live panel message
                try {
                    const guild = btnInteraction.guild;
                    const channel = await guild.channels.fetch(config[guildId].channelId).catch(() => null);
                    const supportRole = config[guildId].supportRoleId ? await guild.roles.fetch(config[guildId].supportRoleId).catch(() => null) : null;
                    const categories = config[guildId].categories || [];
                    if (channel && config[guildId].panelMessageId) {
                        const oldMsg = await channel.messages.fetch(config[guildId].panelMessageId).catch(() => null);
                        if (oldMsg) {
                            const panelMsg = buildPanelMessage(supportRole, categories, config[guildId].panelMessage, guild);
                            await oldMsg.edit(panelMsg);
                        }
                    }
                } catch {}

                const confirmContainer = new ContainerBuilder()
                    .setAccentColor(0xCAD7E6)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# <:Checkedbox:1473038547165384804> Panel Message Saved!\n\n` +
                            `Your custom ticket panel message has been saved and applied.\n\n` +
                            `**Mode:** ${data.mode === 'embed' ? '<:Document:1473039496995143731> Embed' : '<:Chat:1473038936241864865> Simple'}\n\n` +
                            `The panel in the ticket channel has been updated.\n\n` +
                            `Use \`/ticket-setup reset-panel\` to revert to default.`
                        )
                    );
                await btnInteraction.update({ components: [confirmContainer], flags: MessageFlags.IsComponentsV2 });
            };

            const onCancel = async (btnInteraction) => {
                await btnInteraction.update({ content: '<:Cancel:1473037949187657818> Panel builder cancelled.', components: [], flags: MessageFlags.Ephemeral });
            };

            return await handleButtonInteraction(interaction, prefix, 'ticketpanel', guildId, 'panel', onSave, onCancel);
        }

        // Handle welcome message builder buttons
        if (!prefix.startsWith('ticketmsg:')) return false;

        const guildId = prefix.replace('ticketmsg:', '');

        const onSave = async (btnInteraction, data) => {
            const config = loadConfig();
            if (!config[guildId]) {
                return btnInteraction.update({ content: '<:Cancel:1473037949187657818> Ticket system config not found!', components: [], flags: MessageFlags.Ephemeral });
            }

            // Save the welcome message config
            config[guildId].welcomeMessage = {
                mode: data.mode,
                content: data.content || '',
                title: data.title || '',
                description: data.description || '',
                color: data.color || '#5865F2',
                image: data.image || '',
                thumbnail: data.thumbnail || '',
                footer: data.footer || '',
                footerIcon: data.footerIcon || '',
                author: data.author || '',
                authorIcon: data.authorIcon || '',
                fields: data.fields || []
            };
            saveConfig(config);

            const confirmContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> Welcome Message Saved!\n\n` +
                        `Your custom ticket welcome message has been saved.\n\n` +
                        `**Mode:** ${data.mode === 'embed' ? '<:Document:1473039496995143731> Embed' : '<:Chat:1473038936241864865> Simple'}\n\n` +
                        `This message will be sent when a new ticket is opened.\n\n` +
                        `### Available Placeholders\n` +
                        `\`{user}\` - Mention the ticket opener\n` +
                        `\`{username}\` - Username\n` +
                        `\`{server}\` - Server name\n` +
                        `\`{timestamp}\` - Current time\n` +
                        `\`{membercount}\` - Member count\n\n` +
                        `Use \`/ticket-setup reset-message\` to revert to default.`
                    )
                );
            await btnInteraction.update({ components: [confirmContainer], flags: MessageFlags.IsComponentsV2 });
        };

        const onCancel = async (btnInteraction) => {
            await btnInteraction.update({ content: '<:Cancel:1473037949187657818> Message builder cancelled.', components: [], flags: MessageFlags.Ephemeral });
        };

        return await handleButtonInteraction(interaction, prefix, 'ticket', guildId, 'welcome', onSave, onCancel);
    },

    async handleModalSubmit(interaction) {
        const prefix = extractPrefixFromCustomId(interaction.customId);

        // Handle panel builder modals
        if (prefix.startsWith('ticketpanel:')) {
            const guildId = prefix.replace('ticketpanel:', '');
            return await handleMsgBuilderModal(interaction, prefix, 'ticketpanel', guildId, 'panel');
        }

        // Handle welcome message builder modals
        if (!prefix.startsWith('ticketmsg:')) return false;

        const guildId = prefix.replace('ticketmsg:', '');
        return await handleMsgBuilderModal(interaction, prefix, 'ticket', guildId, 'welcome');
    },

    async handleHelp(interaction) {
        const helpContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Clipboard:1473039573037617162> Ticket System - Complete Guide\n\n` +
                    `Create a professional support ticket system for your server!\n\n` +
                    `### <:Settings:1473037894703779851> Setup Steps\n\n` +
                    `**Step 1:** Create a category for tickets\n` +
                    `Go to Server Settings > Create Category > Name it "Tickets" or "Support"\n\n` +
                    `**Step 2:** Create a channel for the ticket panel\n` +
                    `Create a text channel like #create-ticket or #support\n\n` +
                    `**Step 3:** Create or choose a support role\n` +
                    `This role will be able to see and manage all tickets\n\n` +
                    `**Step 4:** Run the setup command\n` +
                    `\`/ticket-setup create channel:#support category:#Tickets support-role:@Support\`\n\n` +
                    `### 🎫 How It Works\n\n` +
                    `**For Users:**\n` +
                    `• Click the dropdown in the ticket panel\n` +
                    `• Select a category that matches their issue\n` +
                    `• A private channel is created for them\n` +
                    `• They describe their issue and wait for support\n\n` +
                    `**For Support Staff:**\n` +
                    `• See all ticket channels automatically\n` +
                    `• Use \`/ticket-close\` to close tickets\n` +
                    `• Use \`/ticket-add @user\` to add people\n` +
                    `• Use \`/ticket-transcript\` to save logs\n\n` +
                    `### <:Document:1473039496995143731> Default Categories\n` +
                    `<:Chat:1473038936241864865> **General Support** - General questions\n` +
                    `🐛 **Bug Report** - Report issues\n` +
                    `<:Star:1473038501766369300> **Feature Request** - Suggest features\n` +
                    `💳 **Payment Issue** - Billing help\n` +
                    `<:Edit:1473037903625191580> **Other** - Everything else\n\n` +
                    `### <:Infotriangle:1473038460456800459> Requirements\n` +
                    `**Bot Permissions:**\n` +
                    `• Manage Channels\n` +
                    `• Manage Roles\n` +
                    `• View Channels\n` +
                    `• Send Messages\n\n` +
                    `### <:Lightbulbalt:1473038470787240009> Pro Tips\n` +
                    `• Put the ticket panel in a read-only channel\n` +
                    `• Only support staff should have the support role\n` +
                    `• Keep the ticket category clean - closed tickets are deleted\n` +
                    `• Use transcripts to save important conversations`
                )
            );

        await interaction.reply({ components: [helpContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('<:Cancel:1473037949187657818> You need **Manage Guild** permission to use this command!');
        }

        if (args[0]?.toLowerCase() === 'message') {
            return message.reply('<:Cancel:1473037949187657818> The message builder is only available via slash command: `/ticket-setup message`');
        }

        if (args[0]?.toLowerCase() === 'reset-message') {
            const config = loadConfig();
            if (!config[message.guild.id]) {
                return message.reply('<:Cancel:1473037949187657818> Ticket system is not set up yet!');
            }
            delete config[message.guild.id].welcomeMessage;
            saveConfig(config);
            return message.reply('<:Checkedbox:1473038547165384804> Ticket welcome message has been reset to default!');
        }

        if (!args.length || args[0]?.toLowerCase() === 'help') {
            const helpContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# 🎫 Ticket System Setup Guide\n\n` +
                        `Create a professional ticket support system for your server.\n\n` +
                        `### 📖 Usage\n` +
                        `\`-ticket-setup #panel-channel #category @support-role\`\n\n` +
                        `### <:Document:1473039496995143731> Parameters\n` +
                        `**#panel-channel** - Where users see the ticket creation menu\n` +
                        `**#category** - Where ticket channels will be created (must be a category!)\n` +
                        `**@support-role** - Role that can view and manage all tickets\n\n` +
                        `### <:Edit:1473037903625191580> Example\n` +
                        `\`-ticket-setup #support #Tickets @Support Team\`\n\n` +
                        `### 🎫 Features\n` +
                        `• 5 pre-configured ticket categories\n` +
                        `• Private ticket channels\n` +
                        `• Ticket transcripts\n` +
                        `• Add/remove users from tickets\n` +
                        `• Close and delete tickets\n\n` +
                        `### <:Settings:1473037894703779851> Related Commands\n` +
                        `\`-ticket-close\` - Close a ticket\n` +
                        `\`-ticket-add @user\` - Add user to ticket\n` +
                        `\`-ticket-remove @user\` - Remove user\n` +
                        `\`-ticket-transcript\` - Save transcript\n\n` +
                        `### <:Lightbulbalt:1473038470787240009> Tip\n` +
                        `Use \`/ticket-setup help\` for detailed guide!`
                    )
                );
            return message.reply({ components: [helpContainer], flags: MessageFlags.IsComponentsV2 });
        }

        const channels = Array.from(message.mentions.channels.values());
        const role = message.mentions.roles.first();

        if (channels.length < 2 || !role) {
            return message.reply('<:Cancel:1473037949187657818> **Usage:** `-ticket-setup #panel-channel #category @support-role`\n*Make sure to mention both a text channel and a category!*');
        }

        const channel = channels[0];
        const category = channels[1];
        
        if (category.type !== ChannelType.GuildCategory) {
            return message.reply('<:Cancel:1473037949187657818> The second channel must be a **category** (folder icon), not a text channel!');
        }
        
        const config = loadConfig();
        const categories = [
            { id: 'support', label: 'General Support', emoji: '<:Chat:1473038936241864865>', description: 'Get help with general questions and inquiries' },
            { id: 'bug', label: 'Bug Report', emoji: '🐛', description: 'Report a bug, glitch, or unexpected behavior' },
            { id: 'feature', label: 'Feature Request', emoji: '<:Star:1473038501766369300>', description: 'Suggest a new feature or improvement' },
            { id: 'payment', label: 'Payment Issue', emoji: '💳', description: 'Help with payments, billing, or subscriptions' },
            { id: 'other', label: 'Other', emoji: '<:Edit:1473037903625191580>', description: 'Anything else that doesn\'t fit above' }
        ];
        
        config[message.guild.id] = {
            channelId: channel.id,
            categoryId: category.id,
            supportRoleId: role.id,
            tickets: {},
            categories: categories
        };
        saveConfig(config);
        
        const panelMsg = buildPanelMessage(role, categories, null, message.guild);
        const panelMessage = await channel.send(panelMsg);
        
        config[message.guild.id].panelMessageId = panelMessage.id;
        saveConfig(config);
        
        const setupContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(buildSetupConfirmation(channel, category, role))
            );
        
        message.reply({ components: [setupContainer], flags: MessageFlags.IsComponentsV2 });
    }
};
