'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags } = require('discord.js');
const { getLeaderboard, getGlobalLeaderboard } = require('../../utils/database');
const { generateStatsLeaderboard, STAT_TYPE_CONFIG } = require('../../utils/statsLeaderboardCard');

const VALID_STAT_TYPES = ['messages', 'voice', 'xp', 'invites'];

const FIELD_MAP = {
    messages: 'analytics.totalMessages',
    voice: 'analytics.voiceTime',
    xp: 'leveling.xp',
    invites: 'invites.invites'
};

const GLOBAL_FIELD_MAP = {
    messages: 'totalMessages',
    voice: 'voiceTime',
    xp: 'xp',
    invites: 'invites'
};

const PER_PAGE = 10;

async function resolveEntries(client, rawEntries) {
    return Promise.all(
        rawEntries.map(async (entry) => {
            let username = 'Unknown User';
            let avatarURL = null;
            try {
                const user = await client.users.fetch(entry.userId);
                username = user.username;
                avatarURL = user.displayAvatarURL({ size: 128, extension: 'png' });
            } catch {}
            return { ...entry, username, avatarURL };
        })
    );
}

async function buildLeaderboardReply(client, guild, statType, scope, page) {
    const validType = VALID_STAT_TYPES.includes(statType) ? statType : 'messages';
    let allEntries;

    if (scope === 'global') {
        allEntries = getGlobalLeaderboard(GLOBAL_FIELD_MAP[validType], 99999);
    } else {
        const field = FIELD_MAP[validType];
        const lb = await getLeaderboard(guild.id, field, 99999);
        allEntries = lb.map((entry, i) => {
            const [table, subField] = field.split('.');
            const value = Number(entry[table]?.[subField] || 0);
            return { userId: entry.userId, value };
        }).filter(e => e.value > 0);
    }

    const totalPages = Math.max(1, Math.ceil(allEntries.length / PER_PAGE));
    page = Math.max(0, Math.min(page, totalPages - 1));

    const pageEntries = allEntries.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
    const resolved = await resolveEntries(client, pageEntries);

    const title = scope === 'global'
        ? `Global ${STAT_TYPE_CONFIG[validType].label} Leaderboard`
        : `${guild.name} — ${STAT_TYPE_CONFIG[validType].label}`;

    const buffer = await generateStatsLeaderboard({
        title,
        iconURL: scope === 'server' ? (guild.iconURL({ size: 256 }) || null) : null,
        entries: resolved,
        statType: validType,
        scope,
        page,
        totalPages
    });

    const attachment = new AttachmentBuilder(buffer, { name: 'statboard.png' });

    const typeRow = new ActionRowBuilder();
    for (const key of VALID_STAT_TYPES) {
        typeRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`slb_type_${scope}_${key}_${page}`)
                .setLabel(STAT_TYPE_CONFIG[key].label)
                .setStyle(key === validType ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setDisabled(key === validType)
        );
    }
    typeRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`slb_scope_${scope === 'server' ? 'global' : 'server'}_${validType}_0`)
            .setLabel(scope === 'server' ? 'Global' : 'Server')
            .setEmoji(scope === 'server' ? '🌍' : '🏠')
            .setStyle(ButtonStyle.Secondary)
    );

    const components = [typeRow];

    if (totalPages > 1) {
        const navRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`slb_page_${scope}_${validType}_${page - 1}`)
                .setEmoji('<:History:1473037847568318605>')
                .setLabel('Prev')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId('slb_page_info')
                .setLabel(`${page + 1}/${totalPages}`)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`slb_page_${scope}_${validType}_${page + 1}`)
                .setEmoji('<:Skipnext:1473039269726785737>')
                .setLabel('Next')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages - 1)
        );
        components.push(navRow);
    }

    return { files: [attachment], components };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('statboard')
        .setDescription('View a visual leaderboard for various activity metrics')
        .addStringOption(o =>
            o.setName('type')
                .setDescription('Stat type to rank by')
                .setRequired(false)
                .addChoices(
                    { name: '💬 Messages', value: 'messages' },
                    { name: '🔊 Voice Time', value: 'voice' },
                    { name: '⚡ XP', value: 'xp' },
                    { name: '📨 Invites', value: 'invites' }
                )
        ),

    prefix: 'statboard',
    aliases: ['slb', 'statlb'],
    description: 'View a visual leaderboard for various activity metrics',
    usage: 'statboard [messages|voice|xp|invites]',
    category: 'stats',

    async execute(interaction) {
        await interaction.deferReply();

        const type = interaction.options.getString('type') || 'messages';

        try {
            const reply = await buildLeaderboardReply(interaction.client, interaction.guild, type, 'server', 0);
            await interaction.editReply(reply);
        } catch (err) {
            console.error('statboard error:', err);
            await interaction.editReply({ content: '<:Cancel:1473037949187657818> Failed to generate leaderboard.' });
        }
    },

    async executePrefix(message, args) {
        const type = VALID_STAT_TYPES.includes(args[0]?.toLowerCase()) ? args[0].toLowerCase() : 'messages';

        try {
            const reply = await buildLeaderboardReply(message.client, message.guild, type, 'server', 0);
            await message.reply(reply);
        } catch (err) {
            console.error('statboard prefix error:', err);
            await message.reply('<:Cancel:1473037949187657818> Failed to generate leaderboard.');
        }
    },

    async handleButton(interaction) {
        const match = interaction.customId.match(/^slb_(?:type|scope|page)_(\w+)_(\w+)_(-?\d+)$/);
        if (!match) {
            await interaction.deferUpdate();
            return true;
        }

        const [, scope, statType, pageStr] = match;
        const page = parseInt(pageStr);
        const validScope = scope === 'global' ? 'global' : 'server';
        const validType = VALID_STAT_TYPES.includes(statType) ? statType : 'messages';

        try {
            const reply = await buildLeaderboardReply(interaction.client, interaction.guild, validType, validScope, Math.max(0, page));
            await interaction.update(reply);
        } catch (err) {
            console.error('statboard button error:', err);
            await interaction.deferUpdate();
        }
        return true;
    }
};
