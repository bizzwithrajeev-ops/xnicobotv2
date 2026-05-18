const { isOwner } = require('../../utils/helpers');
const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { paginate, setupPaginationCollector } = require('../../utils/pagination');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');

const jsonStore = require('../../utils/jsonStore');

function loadBlacklist() {
    if (!jsonStore.has('blacklist')) {
        jsonStore.write('blacklist', { users: [], guilds: [] });
    }
    return jsonStore.read('blacklist');
}

function saveBlacklist(data) {
    jsonStore.write('blacklist', data);
}

function buildBlacklistPaginated(blacklist) {
    const allLines = [];

    if (blacklist.users.length > 0) {
        allLines.push(`### <:User:1473038971398520977> Blacklisted Users`);
        blacklist.users.forEach(u => {
            allLines.push(`> <:Commentblock:1473370739351490794> **${u.username || u.id}** (\`${u.id}\`)\n> └ ${u.reason}`);
        });
    }

    if (blacklist.guilds.length > 0) {
        if (allLines.length > 0) allLines.push('');
        allLines.push(`### <:Home:1473039138868433192> Blacklisted Servers`);
        blacklist.guilds.forEach(g => {
            allLines.push(`> <:Commentblock:1473370739351490794> **${g.name}** (\`${g.id}\`)\n> └ ${g.reason}`);
        });
    }

    if (allLines.length === 0) {
        const container = new ContainerBuilder()
            .setAccentColor(COLORS.INFO)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Commentblock:1473370739351490794> Blacklist\n\n*No blacklisted users or servers.*`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));
        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }

    return paginate({
        header: `# <:Commentblock:1473370739351490794> Blacklist\n-# **${blacklist.users.length}** users, **${blacklist.guilds.length}** servers`,
        lines: allLines,
        perPage: 10,
        accentColor: COLORS.INFO,
        footer: `-# xNico </>`
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blacklist')
        .setDescription('<:Lock:1473038513749491773> Owner Only: Manage blacklisted users/servers')
        .addSubcommand(subcommand =>
            subcommand.setName('add-user').setDescription('Blacklist a user')
                .addUserOption(option => option.setName('user').setDescription('The user to blacklist').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('Reason for blacklist')))
        .addSubcommand(subcommand =>
            subcommand.setName('remove-user').setDescription('Remove a user from blacklist')
                .addUserOption(option => option.setName('user').setDescription('The user to unblacklist').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('add-guild').setDescription('Blacklist a server')
                .addStringOption(option => option.setName('guildid').setDescription('The server ID to blacklist').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('Reason for blacklist')))
        .addSubcommand(subcommand =>
            subcommand.setName('remove-guild').setDescription('Remove a server from blacklist')
                .addStringOption(option => option.setName('guildid').setDescription('The server ID to unblacklist').setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName('list').setDescription('List all blacklisted users/servers')),
    
    async execute(interaction) {
        if (!isOwner(interaction.user.id)) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> This command is only available to the bot owner!', flags: MessageFlags.Ephemeral });
        }

        const subcommand = interaction.options.getSubcommand();
        const blacklist = loadBlacklist();

        if (subcommand === 'add-user') {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';

            if (blacklist.users.find(u => u.id === user.id)) {
                return interaction.reply({ content: `<:Cancel:1473037949187657818> ${user.username} is already blacklisted!`, flags: MessageFlags.Ephemeral });
            }

            blacklist.users.push({ id: user.id, tag: user.username, username: user.username, reason, addedAt: Date.now() });
            saveBlacklist(blacklist);

            const container = new ContainerBuilder()
                .setAccentColor(COLORS.INFO)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Checkedbox:1473038547165384804> User Blacklisted\n\n` +
                    `<:User:1473038971398520977> **User:** ${user.username}\n` +
                    `<:Caretright:1473038207221502106> **Reason:** ${reason}`
                ))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        } else if (subcommand === 'remove-user') {
            const user = interaction.options.getUser('user');
            const index = blacklist.users.findIndex(u => u.id === user.id);
            if (index === -1) {
                return interaction.reply({ content: `<:Cancel:1473037949187657818> ${user.username} is not blacklisted!`, flags: MessageFlags.Ephemeral });
            }

            blacklist.users.splice(index, 1);
            saveBlacklist(blacklist);

            await interaction.reply({ content: `<:Checkedbox:1473038547165384804> Successfully removed **${user.username}** from blacklist!`, flags: MessageFlags.Ephemeral });

        } else if (subcommand === 'add-guild') {
            const guildId = interaction.options.getString('guildid');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const guild = interaction.client.guilds.cache.get(guildId);

            if (blacklist.guilds.find(g => g.id === guildId)) {
                return interaction.reply({ content: `<:Cancel:1473037949187657818> Server is already blacklisted!`, flags: MessageFlags.Ephemeral });
            }

            blacklist.guilds.push({ id: guildId, name: guild ? guild.name : 'Unknown Server', reason, addedAt: Date.now() });
            saveBlacklist(blacklist);

            if (guild) {
                try { await guild.leave(); } catch {}
            }

            const container = new ContainerBuilder()
                .setAccentColor(COLORS.INFO)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Checkedbox:1473038547165384804> Server Blacklisted\n\n` +
                    `<:Home:1473039138868433192> **Server:** ${guild?.name || guildId}\n` +
                    `<:Caretright:1473038207221502106> **Reason:** ${reason}` +
                    (guild ? `\n<:Caretright:1473038207221502106> **Left server:** Yes` : '')
                ))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        } else if (subcommand === 'remove-guild') {
            const guildId = interaction.options.getString('guildid');
            const index = blacklist.guilds.findIndex(g => g.id === guildId);
            if (index === -1) {
                return interaction.reply({ content: `<:Cancel:1473037949187657818> Server is not blacklisted!`, flags: MessageFlags.Ephemeral });
            }

            blacklist.guilds.splice(index, 1);
            saveBlacklist(blacklist);

            await interaction.reply({ content: `<:Checkedbox:1473038547165384804> Successfully removed server from blacklist!`, flags: MessageFlags.Ephemeral });

        } else if (subcommand === 'list') {
            const result = buildBlacklistPaginated(blacklist);
            const reply = await interaction.reply({ ...result, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, fetchReply: true });
            if (result._pageData) setupPaginationCollector(reply, result._pageData, interaction.user.id);
        }
    },

    prefix: 'blacklist',
    description: 'Manage blacklisted users/servers',
    usage: 'blacklist [add-user|remove-user|add-server|remove-server|list]',
    category: 'owner',
    ownerOnly: true,

    async executePrefix(message, args) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const action = args[0]?.toLowerCase();
        const blacklist = loadBlacklist();

        if (!action || action === 'list') {
            const result = buildBlacklistPaginated(blacklist);
            const reply = await message.reply(result);
            if (result._pageData) setupPaginationCollector(reply, result._pageData, message.author.id);
            return;
        }

        if (action === 'add-user' || action === 'adduser') {
            const userId = args[1]?.replace(/[<@!>]/g, '');
            const reason = args.slice(2).join(' ') || 'No reason provided';

            if (!userId) {
                return message.reply('<:Cancel:1473037949187657818> Please provide a user ID or mention!');
            }

            try {
                const user = await message.client.users.fetch(userId);
                if (blacklist.users.find(u => u.id === user.id)) {
                    return message.reply(`<:Cancel:1473037949187657818> **${user.username}** is already blacklisted!`);
                }

                blacklist.users.push({ id: user.id, tag: user.username, username: user.username, reason, addedAt: Date.now() });
                saveBlacklist(blacklist);

                const container = new ContainerBuilder()
                    .setAccentColor(COLORS.INFO)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> User Blacklisted\n\n` +
                        `<:User:1473038971398520977> **User:** ${user.username}\n` +
                        `<:Caretright:1473038207221502106> **Reason:** ${reason}`
                    ))
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch {
                return message.reply('<:Cancel:1473037949187657818> Could not find that user!');
            }
        }

        if (action === 'remove-user' || action === 'removeuser') {
            const userId = args[1]?.replace(/[<@!>]/g, '');
            if (!userId) return message.reply('<:Cancel:1473037949187657818> Please provide a user ID or mention!');

            const index = blacklist.users.findIndex(u => u.id === userId);
            if (index === -1) return message.reply('<:Cancel:1473037949187657818> That user is not blacklisted!');

            const removed = blacklist.users.splice(index, 1)[0];
            saveBlacklist(blacklist);
            return message.reply(`<:Checkedbox:1473038547165384804> Successfully removed **${removed.username || removed.id}** from blacklist!`);
        }

        if (action === 'add-guild' || action === 'addguild' || action === 'add-server' || action === 'addserver') {
            const guildId = args[1];
            const reason = args.slice(2).join(' ') || 'No reason provided';
            if (!guildId) return message.reply('<:Cancel:1473037949187657818> Please provide a server ID!');

            if (blacklist.guilds.find(g => g.id === guildId)) {
                return message.reply('<:Cancel:1473037949187657818> That server is already blacklisted!');
            }

            const guild = message.client.guilds.cache.get(guildId);
            blacklist.guilds.push({ id: guildId, name: guild ? guild.name : 'Unknown Server', reason, addedAt: Date.now() });
            saveBlacklist(blacklist);

            if (guild) { try { await guild.leave(); } catch {} }

            const container = new ContainerBuilder()
                .setAccentColor(COLORS.INFO)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Checkedbox:1473038547165384804> Server Blacklisted\n\n` +
                    `<:Home:1473039138868433192> **Server:** ${guild?.name || guildId}\n` +
                    `<:Caretright:1473038207221502106> **Reason:** ${reason}` +
                    (guild ? `\n<:Caretright:1473038207221502106> **Left server:** Yes` : '')
                ))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (action === 'remove-guild' || action === 'removeguild' || action === 'remove-server' || action === 'removeserver') {
            const guildId = args[1];
            if (!guildId) return message.reply('<:Cancel:1473037949187657818> Please provide a server ID!');

            const index = blacklist.guilds.findIndex(g => g.id === guildId);
            if (index === -1) return message.reply('<:Cancel:1473037949187657818> That server is not blacklisted!');

            const removed = blacklist.guilds.splice(index, 1)[0];
            saveBlacklist(blacklist);
            return message.reply(`<:Checkedbox:1473038547165384804> Successfully removed **${removed.name}** from blacklist!`);
        }

        const helpContainer = new ContainerBuilder()
            .setAccentColor(COLORS.INFO)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# <:Lock:1473038513749491773> Blacklist Commands\n\n` +
                `<:Caretright:1473038207221502106> \`blacklist\` - View all blacklisted users/servers\n` +
                `<:Caretright:1473038207221502106> \`blacklist add-user <@user/id> [reason]\` - Blacklist a user\n` +
                `<:Caretright:1473038207221502106> \`blacklist remove-user <@user/id>\` - Remove user\n` +
                `<:Caretright:1473038207221502106> \`blacklist add-server <id> [reason]\` - Blacklist a server\n` +
                `<:Caretright:1473038207221502106> \`blacklist remove-server <id>\` - Remove server`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));
        
        return message.reply({ components: [helpContainer], flags: MessageFlags.IsComponentsV2 });
    }
};
