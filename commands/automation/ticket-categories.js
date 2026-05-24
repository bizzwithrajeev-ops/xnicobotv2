const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, StringSelectMenuBuilder, ActionRowBuilder, SeparatorBuilder, SeparatorSpacingSize, EmbedBuilder } = require('discord.js');

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

async function updateTicketPanel(client, guildId, guildConfig) {
    try {
        const channel = await client.channels.fetch(guildConfig.channelId);
        if (!channel) return false;

        // Try to fetch the panel message by stored ID
        let panelMessage = null;
        if (guildConfig.panelMessageId) {
            try {
                panelMessage = await channel.messages.fetch(guildConfig.panelMessageId);
            } catch (error) {
                // Panel message was deleted or ID is invalid
            }
        }

        // Fallback: search for the panel message by customId if we don't have a stored ID
        if (!panelMessage) {
            const messages = await channel.messages.fetch({ limit: 50 });
            panelMessage = messages.find(m => 
                m.author.id === client.user.id && 
                m.components?.length > 0 &&
                m.components[0]?.components?.[0]?.customId === 'ticket_category_select'
            );
            
            // If we found the panel via fallback, persist its ID for future updates (backwards compatibility)
            if (panelMessage) {
                const config = loadConfig();
                if (config[guildId]) {
                    config[guildId].panelMessageId = panelMessage.id;
                    saveConfig(config);
                }
            }
        }

        if (!panelMessage) return false;

        // Safely fetch support role
        let supportRole = null;
        try {
            if (guildConfig.supportRoleId) {
                const guild = client.guilds.cache.get(guildId);
                if (guild) {
                    supportRole = await guild.roles.fetch(guildConfig.supportRoleId).catch(() => null);
                }
            }
        } catch (error) {
            // Role doesn't exist or can't be fetched
            supportRole = null;
        }
        
        // Check if we have categories
        if (!guildConfig.categories || guildConfig.categories.length === 0) {
            // No categories - use disabled placeholder select menu so panel remains discoverable
            const disabledMenu = new StringSelectMenuBuilder()
                .setCustomId('ticket_category_select')
                .setPlaceholder('<:Inforect:1473038624172937287> No categories configured')
                .setDisabled(true)
                .addOptions([{
                    label: 'No categories available',
                    value: 'none',
                    description: 'Administrators need to add categories'
                }]);

            const row = new ActionRowBuilder().addComponents(disabledMenu);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# 🎫 Support Tickets\n\n<:Inforect:1473038624172937287> **No ticket categories configured!**\n\nAdministrators can add categories using:\n\`/ticket-categories add <id> <label> <emoji> <description>\`\n\n**Support Team:** ${supportRole || 'Not Set'}`)
                )
                .addActionRowComponents(row);

            await panelMessage.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            return true;
        }

        // Build panel content using custom config or default
        const panelConfig = guildConfig.panelMessage || null;
        let panelContent;

        if (panelConfig && panelConfig.mode) {
            // Custom panel — use stored config
            const { replacePlaceholders: msgReplace, buildComponentsV2Message } = require('../../utils/actionMessageBuilder');
            const guild = client.guilds.cache.get(guildId);
            if (panelConfig.mode === 'components') {
                const container = buildComponentsV2Message(panelConfig, null, guild, null);
                panelContent = { type: 'components', container };
            } else if (panelConfig.mode === 'embed') {
                                const embed = new EmbedBuilder();
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
                panelContent = { type: 'embed', embed };
            } else {
                panelContent = { type: 'simple', content: msgReplace(panelConfig.content, null, guild) };
            }
        } else {
            // Default panel
            let categoriesDesc = '';
            guildConfig.categories.forEach(cat => {
                categoriesDesc += `${cat.emoji} ${cat.label} - ${cat.description}\n`;
            });
            panelContent = { type: 'default', content: `# 🎫 Support Tickets\n\nNeed help? Select a category below to create a support ticket!\n\n**Categories:**\n${categoriesDesc}\n**Support Team:** ${supportRole || 'Not Set'}` };
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_category_select')
            .setPlaceholder('Select a ticket category')
            .addOptions(
                guildConfig.categories.map(cat => ({
                    label: cat.label,
                    value: cat.id,
                    description: cat.description,
                    emoji: cat.emoji
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        if (panelContent.type === 'embed') {
            await panelMessage.edit({ embeds: [panelContent.embed], components: [row] });
        } else if (panelContent.type === 'components') {
            panelContent.container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
            panelContent.container.addActionRowComponents(row);
            await panelMessage.edit({ components: [panelContent.container], flags: MessageFlags.IsComponentsV2 });
        } else {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(panelContent.content)
                )
                .addActionRowComponents(row);
            await panelMessage.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        return true;
    } catch (error) {
        console.error('Error updating ticket panel:', error);
        return false;
    }
}

module.exports = {
    category: 'automation',
    data: new SlashCommandBuilder()
        .setName('ticket-categories')
        .setDescription('View or manage ticket categories')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all ticket categories'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new ticket category')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('Category ID (unique identifier)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('label')
                        .setDescription('Category label (display name)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('emoji')
                        .setDescription('Category emoji')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Category description')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a ticket category')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('Category ID to remove')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Edit an existing ticket category')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('Category ID to edit')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('label')
                        .setDescription('New category label')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('emoji')
                        .setDescription('New category emoji')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('New category description')
                        .setRequired(false)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const config = loadConfig();
        const guildConfig = config[interaction.guild.id];

        if (!guildConfig) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> Ticket system is not configured! Use `/ticket-setup` first.', flags: MessageFlags.Ephemeral });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            let categoriesText = '# <:Bookopen:1473038576391557130> Ticket Categories\n\n';

            if (!guildConfig.categories || guildConfig.categories.length === 0) {
                categoriesText += 'No categories configured.';
            } else {
                guildConfig.categories.forEach((cat, index) => {
                    categoriesText += `**${index + 1}.** ${cat.emoji} **${cat.label}**\n`;
                    categoriesText += `   ID: \`${cat.id}\`\n`;
                    categoriesText += `   Description: ${cat.description}\n\n`;
                });
            }

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(categoriesText)
                );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        else if (subcommand === 'add') {
            const id = interaction.options.getString('id');
            const label = interaction.options.getString('label');
            const emoji = interaction.options.getString('emoji');
            const description = interaction.options.getString('description');

            if (!guildConfig.categories) guildConfig.categories = [];

            // Check if ID already exists
            if (guildConfig.categories.find(cat => cat.id === id)) {
                return interaction.reply({ content: `<:Cancel:1473037949187657818> A category with ID \`${id}\` already exists!`, flags: MessageFlags.Ephemeral });
            }

            guildConfig.categories.push({ id, label, emoji, description });
            saveConfig(config);

            // Update the ticket panel
            const panelUpdated = await updateTicketPanel(interaction.client, interaction.guild.id, guildConfig);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Category Added\n\n${emoji} **${label}**\nID: \`${id}\`\nDescription: ${description}\n\nTotal categories: ${guildConfig.categories.length}${panelUpdated ? '\n\n<:Checkedbox:1473038547165384804> Ticket panel updated!' : '\n\n<:Inforect:1473038624172937287> Panel update failed - please use `/ticket-setup` to recreate the panel'}`)
                );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        else if (subcommand === 'remove') {
            const id = interaction.options.getString('id');

            if (!guildConfig.categories) guildConfig.categories = [];

            const index = guildConfig.categories.findIndex(cat => cat.id === id);

            if (index === -1) {
                return interaction.reply({ content: `<:Cancel:1473037949187657818> Category with ID \`${id}\` not found!`, flags: MessageFlags.Ephemeral });
            }

            const removed = guildConfig.categories.splice(index, 1)[0];
            saveConfig(config);

            // Update the ticket panel
            const panelUpdated = await updateTicketPanel(interaction.client, interaction.guild.id, guildConfig);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Category Removed\n\n${removed.emoji} **${removed.label}**\nID: \`${removed.id}\`\n\nRemaining categories: ${guildConfig.categories.length}${panelUpdated ? '\n\n<:Checkedbox:1473038547165384804> Ticket panel updated!' : '\n\n<:Inforect:1473038624172937287> Panel update failed - please use `/ticket-setup` to recreate the panel'}`)
                );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        else if (subcommand === 'edit') {
            const id = interaction.options.getString('id');
            const newLabel = interaction.options.getString('label');
            const newEmoji = interaction.options.getString('emoji');
            const newDescription = interaction.options.getString('description');

            if (!guildConfig.categories) guildConfig.categories = [];

            const category = guildConfig.categories.find(cat => cat.id === id);

            if (!category) {
                return interaction.reply({ content: `<:Cancel:1473037949187657818> Category with ID \`${id}\` not found!`, flags: MessageFlags.Ephemeral });
            }

            if (!newLabel && !newEmoji && !newDescription) {
                return interaction.reply({ content: `<:Cancel:1473037949187657818> Please provide at least one field to update (label, emoji, or description)!`, flags: MessageFlags.Ephemeral });
            }

            const changes = [];
            if (newLabel) {
                category.label = newLabel;
                changes.push(`**Label:** ${newLabel}`);
            }
            if (newEmoji) {
                category.emoji = newEmoji;
                changes.push(`**Emoji:** ${newEmoji}`);
            }
            if (newDescription) {
                category.description = newDescription;
                changes.push(`**Description:** ${newDescription}`);
            }

            saveConfig(config);

            const panelUpdated = await updateTicketPanel(interaction.client, interaction.guild.id, guildConfig);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(
                            `# <:Checkedbox:1473038547165384804> Category Updated\n\n` +
                            `**ID:** \`${id}\`\n\n` +
                            `### Changes Made\n` +
                            changes.join('\n') +
                            `${panelUpdated ? '\n\n<:Checkedbox:1473038547165384804> Ticket panel updated!' : '\n\n<:Inforect:1473038624172937287> Panel update failed - please use `/ticket-setup` to recreate the panel'}`
                        )
                );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('<:Cancel:1473037949187657818> You need Manage Guild permission to use this command!');
        }

        const config = loadConfig();
        const guildConfig = config[message.guild.id];

        if (!guildConfig) {
            return message.reply('<:Cancel:1473037949187657818> Ticket system is not configured! Use `-ticket-setup` first.');
        }

        const subcommand = args[0]?.toLowerCase();

        if (!subcommand || subcommand === 'list') {
            let categoriesText = '# <:Bookopen:1473038576391557130> Ticket Categories\n\n';

            if (!guildConfig.categories || guildConfig.categories.length === 0) {
                categoriesText += 'No categories configured.';
            } else {
                guildConfig.categories.forEach((cat, index) => {
                    categoriesText += `**${index + 1}.** ${cat.emoji} **${cat.label}**\n`;
                    categoriesText += `   ID: \`${cat.id}\`\n`;
                    categoriesText += `   Description: ${cat.description}\n\n`;
                });
            }

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(categoriesText)
                );

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'add') {
            if (args.length < 5) {
                return message.reply('<:Cancel:1473037949187657818> Usage: `-ticket-categories add <id> <emoji> <label> <description>`\nExample: `-ticket-categories add billing 💰 "Billing Issues" "Get help with payments"`');
            }

            const id = args[1];
            const emoji = args[2];
            const label = args[3];
            const description = args.slice(4).join(' ');

            if (!guildConfig.categories) guildConfig.categories = [];

            if (guildConfig.categories.find(cat => cat.id === id)) {
                return message.reply(`<:Cancel:1473037949187657818> A category with ID \`${id}\` already exists!`);
            }

            guildConfig.categories.push({ id, label, emoji, description });
            saveConfig(config);

            // Update the ticket panel
            const panelUpdated = await updateTicketPanel(message.client, message.guild.id, guildConfig);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Category Added\n\n${emoji} **${label}**\nID: \`${id}\`\nDescription: ${description}\n\nTotal categories: ${guildConfig.categories.length}${panelUpdated ? '\n\n<:Checkedbox:1473038547165384804> Ticket panel updated!' : '\n\n<:Inforect:1473038624172937287> Panel update failed - please use `-ticket-setup` to recreate the panel'}`)
                );

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'remove') {
            if (args.length < 2) {
                return message.reply('<:Cancel:1473037949187657818> Usage: `-ticket-categories remove <id>`');
            }

            const id = args[1];

            if (!guildConfig.categories) guildConfig.categories = [];

            const index = guildConfig.categories.findIndex(cat => cat.id === id);

            if (index === -1) {
                return message.reply(`<:Cancel:1473037949187657818> Category with ID \`${id}\` not found!`);
            }

            const removed = guildConfig.categories.splice(index, 1)[0];
            saveConfig(config);

            // Update the ticket panel
            const panelUpdated = await updateTicketPanel(message.client, message.guild.id, guildConfig);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Category Removed\n\n${removed.emoji} **${removed.label}**\nID: \`${removed.id}\`\n\nRemaining categories: ${guildConfig.categories.length}${panelUpdated ? '\n\n<:Checkedbox:1473038547165384804> Ticket panel updated!' : '\n\n<:Inforect:1473038624172937287> Panel update failed - please use `-ticket-setup` to recreate the panel'}`)
                );

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        message.reply('<:Cancel:1473037949187657818> Invalid subcommand! Use: `list`, `add`, or `remove`');
    }
};