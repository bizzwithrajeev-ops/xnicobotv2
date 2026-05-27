const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('../../utils/database');
const { buildPermissionDenied, COLORS, BRANDING } = require('../../utils/responseBuilder');
const { paginate, setupPaginationCollector } = require('../../utils/pagination');

/**
 * Build the paginated payload for the "list" subcommand. Combines
 * ignored channels and roles into one numbered, sectioned list so we
 * stay under the 4 000-char container cap on busy servers, while
 * keeping the existing two-section layout intact at small sizes.
 */
function buildIgnoreListResult(guild, ignoreChannels, ignoreRoles) {
    const E = {
        block:  '<:Commentblock:1473370739351490794>',
        chan:   '<:Folderblock:1473039508545994996>',
        role:   '<:Userplus:1473038912212435086>',
        caret:  '<:Caretright:1473038207221502106>',
        none:   '<:Cancel:1473037949187657818>',
    };

    const channelLines = ignoreChannels.length > 0
        ? ignoreChannels.map((id, i) => {
            const ch = guild.channels.cache.get(id);
            const label = ch ? `${ch}` : `~~<#${id}>~~ \`(deleted)\``;
            return `${E.caret} \`${String(i + 1).padStart(2, '0')}.\` ${label}`;
        })
        : [`${E.none} *No ignored channels*`];

    const roleLines = ignoreRoles.length > 0
        ? ignoreRoles.map((id, i) => {
            const role = guild.roles.cache.get(id);
            const label = role ? `<@&${id}>` : `~~<@&${id}>~~ \`(deleted)\``;
            return `${E.caret} \`${String(i + 1).padStart(2, '0')}.\` ${label}`;
        })
        : [`${E.none} *No ignored roles*`];

    const lines = [
        `### ${E.chan} Ignored Channels (${ignoreChannels.length})`,
        ...channelLines,
        '',
        `### ${E.role} Ignored Roles (${ignoreRoles.length})`,
        ...roleLines,
    ];

    return paginate({
        header:
            `# ${E.block} Leveling · Ignore List\n` +
            `-# Members do not gain XP in these channels or with these roles.`,
        lines,
        perPage:     20,
        accentColor: COLORS.WARNING,
        footer:      BRANDING,
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leveling-ignore')
        .setDescription('Configure ignored channels/roles for leveling')
        .addSubcommand(sub => sub.setName('add-channel').setDescription('Ignore a channel')
            .addChannelOption(o => o.setName('channel').setDescription('Channel to ignore').setRequired(true)))
        .addSubcommand(sub => sub.setName('remove-channel').setDescription('Un-ignore a channel')
            .addChannelOption(o => o.setName('channel').setDescription('Channel to remove').setRequired(true)))
        .addSubcommand(sub => sub.setName('add-role').setDescription('Ignore a role')
            .addRoleOption(o => o.setName('role').setDescription('Role to ignore').setRequired(true)))
        .addSubcommand(sub => sub.setName('remove-role').setDescription('Un-ignore a role')
            .addRoleOption(o => o.setName('role').setDescription('Role to remove').setRequired(true)))
        .addSubcommand(sub => sub.setName('list').setDescription('View all ignored channels and roles')),
    name: 'leveling-ignore',
    prefix: 'leveling-ignore',
    description: 'Configure ignored channels and roles for leveling (prefix-only)',
    usage: 'leveling-ignore <add-channel|remove-channel|add-role|remove-role|list> [target]',
    category: 'leveling',
    aliases: ['lvlignore', 'levelignore'],

    async execute(interaction) {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> You need **Administrator** permission!', flags: MessageFlags.Ephemeral });
        }

        const subcommand = interaction.options.getSubcommand();
        const guildConfig = await getGuildConfig(interaction.guild.id);

        if (subcommand === 'add-channel') {
            const channel = interaction.options.getChannel('channel');
            const ignoreChannels = guildConfig.leveling?.ignoreChannels || [];

            if (ignoreChannels.includes(channel.id)) {
                return interaction.reply({
                    content: `<:Cancel:1473037949187657818> ${channel} is already in the ignore list!`,
                    flags: MessageFlags.Ephemeral
                });
            }

            ignoreChannels.push(channel.id);
            await updateGuildConfig(interaction.guild.id, {
                'leveling.ignoreChannels': ignoreChannels
            });

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Add:1473038100862337035> Channel Added to Ignore List\n\n**Channel:** ${channel}\n\nUsers will not gain XP in this channel.`)
                );

            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'remove-channel') {
            const channel = interaction.options.getChannel('channel');
            let ignoreChannels = guildConfig.leveling?.ignoreChannels || [];

            if (!ignoreChannels.includes(channel.id)) {
                return interaction.reply({
                    content: `<:Cancel:1473037949187657818> ${channel} is not in the ignore list!`,
                    flags: MessageFlags.Ephemeral
                });
            }

            ignoreChannels = ignoreChannels.filter(id => id !== channel.id);
            await updateGuildConfig(interaction.guild.id, {
                'leveling.ignoreChannels': ignoreChannels
            });

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Trash:1473038090074591293> Channel Removed from Ignore List\n\n**Channel:** ${channel}\n\nUsers can now gain XP in this channel.`)
                );

            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'add-role') {
            const role = interaction.options.getRole('role');
            const ignoreRoles = guildConfig.leveling?.ignoreRoles || [];

            if (ignoreRoles.includes(role.id)) {
                return interaction.reply({
                    content: `<:Cancel:1473037949187657818> ${role} is already in the ignore list!`,
                    flags: MessageFlags.Ephemeral
                });
            }

            ignoreRoles.push(role.id);
            await updateGuildConfig(interaction.guild.id, {
                'leveling.ignoreRoles': ignoreRoles
            });

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Add:1473038100862337035> Role Added to Ignore List\n\n**Role:** ${role}\n\nUsers with this role will not gain XP.`)
                );

            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'remove-role') {
            const role = interaction.options.getRole('role');
            let ignoreRoles = guildConfig.leveling?.ignoreRoles || [];

            if (!ignoreRoles.includes(role.id)) {
                return interaction.reply({
                    content: `<:Cancel:1473037949187657818> ${role} is not in the ignore list!`,
                    flags: MessageFlags.Ephemeral
                });
            }

            ignoreRoles = ignoreRoles.filter(id => id !== role.id);
            await updateGuildConfig(interaction.guild.id, {
                'leveling.ignoreRoles': ignoreRoles
            });

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Trash:1473038090074591293> Role Removed from Ignore List\n\n**Role:** ${role}\n\nUsers with this role can now gain XP.`)
                );

            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'list') {
            const ignoreChannels = guildConfig.leveling?.ignoreChannels || [];
            const ignoreRoles    = guildConfig.leveling?.ignoreRoles    || [];

            const result = buildIgnoreListResult(interaction.guild, ignoreChannels, ignoreRoles);
            const reply  = await interaction.reply({ ...result, fetchReply: true });
            setupPaginationCollector(reply, result._pageData, interaction.user.id);
            return;
        }
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            const container = buildPermissionDenied('Administrator');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const guildConfig = await getGuildConfig(message.guild.id);
        const ignoreChannels = guildConfig.leveling?.ignoreChannels || [];
        const ignoreRoles    = guildConfig.leveling?.ignoreRoles    || [];

        const result = buildIgnoreListResult(message.guild, ignoreChannels, ignoreRoles);
        const reply  = await message.reply(result);
        setupPaginationCollector(reply, result._pageData, message.author.id);
    }
};
