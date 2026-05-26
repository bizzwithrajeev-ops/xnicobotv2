const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

const jsonStore = require('../../utils/jsonStore');
const { ensureMigrated } = require('../../utils/ticketPanels');

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

/**
 * Refreshes every panel known to the multi-panel registry.
 * Returns the count of panels successfully refreshed (or `null` when none configured).
 */
async function updateTicketPanels(client, guildId) {
    // Lazy-require to avoid a circular import (ticket-setup → ticketPanels → ticket-categories).
    const { updatePanelMessage } = require('./ticket-setup');
    const config = loadConfig();
    const guildConfig = ensureMigrated(config[guildId]);
    if (!guildConfig?.panels || Object.keys(guildConfig.panels).length === 0) return null;

    let refreshed = 0;
    for (const panelId of Object.keys(guildConfig.panels)) {
        if (await updatePanelMessage(client, guildId, panelId)) refreshed++;
    }
    return refreshed;
}

// Back-compat shim — older code calls `updateTicketPanel(client, guildId, guildConfig)`.
async function updateTicketPanel(client, guildId /*, guildConfig */) {
    const refreshed = await updateTicketPanels(client, guildId);
    return refreshed !== null && refreshed > 0;
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