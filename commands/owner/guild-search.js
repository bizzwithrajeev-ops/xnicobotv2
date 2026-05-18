const { isOwner } = require('../../utils/helpers');
const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { paginate, setupPaginationCollector } = require('../../utils/pagination');
const { COLORS, EMOJIS, BRANDING } = require('../../utils/responseBuilder');

function searchGuilds(client, query, minMembers, maxMembers, sortBy) {
    let guilds = Array.from(client.guilds.cache.values());

    if (query) {
        const lowerQuery = query.toLowerCase();
        guilds = guilds.filter(g => g.name.toLowerCase().includes(lowerQuery) || g.id === query);
    }

    if (minMembers) {
        guilds = guilds.filter(g => g.memberCount >= minMembers);
    }

    if (maxMembers) {
        guilds = guilds.filter(g => g.memberCount <= maxMembers);
    }

    switch (sortBy) {
        case 'members-desc':
            guilds.sort((a, b) => b.memberCount - a.memberCount);
            break;
        case 'members-asc':
            guilds.sort((a, b) => a.memberCount - b.memberCount);
            break;
        case 'name':
            guilds.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'created':
            guilds.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
            break;
        default:
            guilds.sort((a, b) => b.memberCount - a.memberCount);
    }

    return guilds;
}

function buildGuildSearchResult(guilds, query, filters) {
    const filterParts = [];
    if (query) filterParts.push(`Query: \`${query}\``);
    if (filters.minMembers) filterParts.push(`Min: \`${filters.minMembers}\``);
    if (filters.maxMembers) filterParts.push(`Max: \`${filters.maxMembers}\``);
    if (filters.sortBy) filterParts.push(`Sort: \`${filters.sortBy}\``);
    const filterText = filterParts.length > 0 ? filterParts.join(' • ') : 'No filters';

    const lines = guilds.map((g, i) => {
        const created = `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`;
        const boostLevel = g.premiumTier ? `Boost Lvl ${g.premiumTier}` : 'No Boosts';
        return `**${i + 1}.** ${g.name}\n> <:Fileuser:1473039570630348810> \`${g.id}\`\n> <:Userplus:1473038912212435086> **${g.memberCount.toLocaleString()}** members • ${boostLevel}\n> <:Alarm:1473039068546732214> Created ${created}`;
    });

    if (lines.length === 0) {
        const container = new ContainerBuilder()
            .setAccentColor(COLORS.INFO)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# <:Bookopen:1473038576391557130> Guild Search\n\n` +
                `${EMOJIS.WARNING} No guilds found matching your criteria.\n\n` +
                `### <:Invoice:1473039492217835550> Filters Applied\n> ${filterText}`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }

    return paginate({
        header: `# <:Bookopen:1473038576391557130> Guild Search\n-# **${guilds.length}** results found • ${filterText}`,
        lines,
        perPage: 8,
        accentColor: COLORS.INFO,
        footer: BRANDING
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guild-search')
        .setDescription('<:Lock:1473038513749491773> Owner Only: Search guilds by name or filter by member count')
        .addStringOption(option =>
            option.setName('query').setDescription('Search query (guild name or ID)'))
        .addIntegerOption(option =>
            option.setName('min-members').setDescription('Minimum member count').setMinValue(0))
        .addIntegerOption(option =>
            option.setName('max-members').setDescription('Maximum member count').setMinValue(1))
        .addStringOption(option =>
            option.setName('sort').setDescription('Sort results by')
                .addChoices(
                    { name: 'Members (High to Low)', value: 'members-desc' },
                    { name: 'Members (Low to High)', value: 'members-asc' },
                    { name: 'Name (A-Z)', value: 'name' },
                    { name: 'Created (Newest)', value: 'created' }
                )),

    prefix: 'guild-search',
    description: 'Search guilds by name or filter by member count',
    usage: 'guild-search [query] [--min <n>] [--max <n>] [--sort <type>]',
    aliases: ['gsearch', 'findguild', 'searchguild'],
    category: 'owner',
    ownerOnly: true,

    async execute(interaction) {
        if (!isOwner(interaction.user.id)) {
            return interaction.reply({ content: `${EMOJIS.ERROR} This command is only available to the bot owner!`, flags: MessageFlags.Ephemeral });
        }

        const query = interaction.options.getString('query');
        const minMembers = interaction.options.getInteger('min-members');
        const maxMembers = interaction.options.getInteger('max-members');
        const sortBy = interaction.options.getString('sort') || 'members-desc';

        const guilds = searchGuilds(interaction.client, query, minMembers, maxMembers, sortBy);
        const result = buildGuildSearchResult(guilds, query, { minMembers, maxMembers, sortBy });
        const reply = await interaction.reply({ ...result, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, fetchReply: true });
        if (result._pageData) setupPaginationCollector(reply, result._pageData, interaction.user.id);
    },

    async executePrefix(message, args) {
        if (!isOwner(message.author.id)) {
            return message.reply(`${EMOJIS.ERROR} This command is only available to the bot owner!`);
        }

        let query = null;
        let minMembers = null;
        let maxMembers = null;
        let sortBy = 'members-desc';

        const queryParts = [];
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--min' && args[i + 1]) {
                minMembers = parseInt(args[++i]);
            } else if (args[i] === '--max' && args[i + 1]) {
                maxMembers = parseInt(args[++i]);
            } else if (args[i] === '--sort' && args[i + 1]) {
                sortBy = args[++i];
            } else {
                queryParts.push(args[i]);
            }
        }

        if (queryParts.length > 0) query = queryParts.join(' ');

        const guilds = searchGuilds(message.client, query, minMembers, maxMembers, sortBy);
        const result = buildGuildSearchResult(guilds, query, { minMembers, maxMembers, sortBy });
        const reply = await message.reply(result);
        if (result._pageData) setupPaginationCollector(reply, result._pageData, message.author.id);
    }
};
