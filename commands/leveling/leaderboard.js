'use strict';

const {
    SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, AttachmentBuilder, MessageFlags,
    ContainerBuilder, TextDisplayBuilder
} = require('discord.js');
const { getLeaderboard, getGlobalLeaderboard } = require('../../utils/database');
const { generateStatsLeaderboard, STAT_TYPE_CONFIG } = require('../../utils/statsLeaderboardCard');
const { buildLoadingResponse } = require('../../utils/responseBuilder');
const economyManager = require('../../utils/economyManager');

const PER_PAGE = 10;
const PREFIX = 'ulb';

const LB_TYPES = {
    leveling:  { field: 'leveling.xp',              globalField: 'xp',            menuLabel: 'Leveling',   menuEmoji: '1473038391632203887', menuDesc: 'XP & level rankings' },
    messages:  { field: 'analytics.totalMessages',   globalField: 'totalMessages', menuLabel: 'Messages',   menuEmoji: '1473038576391557130', menuDesc: 'Most active chatters' },
    voice:     { field: 'analytics.voiceTime',       globalField: 'voiceTime',     menuLabel: 'Voice Time', menuEmoji: '1473039290136002844', menuDesc: 'Longest voice sessions' },
    invites:   { field: 'invites.invites',           globalField: 'invites',       menuLabel: 'Invites',    menuEmoji: '1473038903157199093', menuDesc: 'Top server inviters' },
    economy:   { field: null,                        globalField: null,            menuLabel: 'Economy',    menuEmoji: '1473038248493453352', menuDesc: 'Richest users by net worth' },
};

async function resolveEntries(client, rawEntries) {
    return Promise.all(
        rawEntries.map(async (entry) => {
            let username = 'Unknown User';
            let avatarURL = null;
            try {
                const user = await client.users.fetch(entry.userId);
                username = user.globalName || user.username;
                avatarURL = user.displayAvatarURL({ size: 128, extension: 'png' });
            } catch {}
            return { ...entry, username, avatarURL };
        })
    );
}

function getEconomyEntries(guild, scope) {
    const economy = economyManager.loadEconomy();
    let entries = Object.entries(economy).map(([userId, raw]) => {
        const coins = Number(raw.coins) || 0;
        const bank = Number(raw.bank) || 0;
        return { userId, value: coins + bank };
    }).filter(e => e.value > 0);

    if (scope === 'server' && guild) {
        const memberIds = new Set(guild.members.cache.keys());
        entries = entries.filter(e => memberIds.has(e.userId));
    }

    entries.sort((a, b) => b.value - a.value);
    return entries;
}

async function buildUnifiedLeaderboard(client, guild, type, scope, page) {
    const validType = LB_TYPES[type] ? type : 'leveling';
    const cfg = LB_TYPES[validType];
    let allEntries;

    if (validType === 'economy') {
        allEntries = getEconomyEntries(guild, scope);
    } else if (scope === 'global') {
        allEntries = getGlobalLeaderboard(cfg.globalField, 99999);
    } else {
        const lb = await getLeaderboard(guild.id, cfg.field, 99999);
        allEntries = lb.map((entry) => {
            const [table, subField] = cfg.field.split('.');
            const value = Number(entry[table]?.[subField] || 0);
            return { userId: entry.userId, value };
        }).filter(e => e.value > 0);
    }

    const totalPages = Math.max(1, Math.ceil(allEntries.length / PER_PAGE));
    page = Math.max(0, Math.min(page, totalPages - 1));

    const pageEntries = allEntries.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
    const resolved = await resolveEntries(client, pageEntries);

    const scopeLabel = scope === 'global' ? 'Global' : guild.name;
    const statCfg = STAT_TYPE_CONFIG[validType] || STAT_TYPE_CONFIG.messages;
    const title = scope === 'global'
        ? `Global ${statCfg.label} Leaderboard`
        : `${scopeLabel} — ${statCfg.label}`;

    const buffer = await generateStatsLeaderboard({
        title,
        iconURL: scope === 'server' ? (guild.iconURL({ size: 256 }) || null) : null,
        entries: resolved,
        statType: validType,
        scope,
        page,
        totalPages
    });

    const attachment = new AttachmentBuilder(buffer, { name: 'leaderboard.png' });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`${PREFIX}_type_${scope}_${page}`)
        .setPlaceholder(`${statCfg.emoji ? '' : ''}${statCfg.label} Leaderboard`)
        .setMinValues(1)
        .setMaxValues(1);

    for (const [key, meta] of Object.entries(LB_TYPES)) {
        selectMenu.addOptions({
            label: meta.menuLabel,
            value: key,
            emoji: meta.menuEmoji,
            description: meta.menuDesc,
            default: key === validType
        });
    }

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);

    const btnRow = new ActionRowBuilder();

    const otherScope = scope === 'server' ? 'global' : 'server';
    btnRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`${PREFIX}_scope_${otherScope}_${validType}_0`)
            .setLabel(scope === 'server' ? 'Global' : 'Server')
            .setEmoji(scope === 'server' ? '1473038903157199093' : '1473038576391557130')
            .setStyle(ButtonStyle.Secondary)
    );

    if (totalPages > 1) {
        btnRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`${PREFIX}_page_${scope}_${validType}_${page - 1}`)
                .setEmoji('<:History:1473037847568318605>')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId(`${PREFIX}_info`)
                .setLabel(`${page + 1} / ${totalPages}`)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`${PREFIX}_page_${scope}_${validType}_${page + 1}`)
                .setEmoji('<:Skipnext:1473039269726785737>')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages - 1)
        );
    }

    const components = [selectRow, btnRow];
    return { files: [attachment], components };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the unified leaderboard — leveling, messages, voice, invites, economy')
        .addStringOption(o =>
            o.setName('type')
                .setDescription('Leaderboard category')
                .setRequired(false)
                .addChoices(
                    { name: '🏆 Leveling',   value: 'leveling' },
                    { name: '💬 Messages',   value: 'messages' },
                    { name: '🔊 Voice Time', value: 'voice' },
                    { name: '📨 Invites',    value: 'invites' },
                    { name: '💰 Economy',    value: 'economy' }
                )
        )
        .addStringOption(o =>
            o.setName('scope')
                .setDescription('Server or global rankings')
                .setRequired(false)
                .addChoices(
                    { name: '🏠 Server', value: 'server' },
                    { name: '🌍 Global', value: 'global' }
                )
        ),

    prefix: 'leaderboard',
    aliases: ['top', 'board', 'rankings'],
    description: 'View the unified leaderboard with dropdown selection',
    usage: 'leaderboard [leveling|messages|voice|invites|economy] [server|global]',
    category: 'leveling',

    async execute(interaction) {
        await interaction.deferReply();

        const type = interaction.options.getString('type') || 'leveling';
        const scope = interaction.options.getString('scope') || 'server';

        try {
            const reply = await buildUnifiedLeaderboard(interaction.client, interaction.guild, type, scope, 0);
            await interaction.editReply(reply);
        } catch (err) {
            console.error('leaderboard error:', err);
            await interaction.editReply({ content: '<:Cancel:1473037949187657818> Failed to generate the leaderboard.' });
        }
    },

    async executePrefix(message, args) {
        const validTypes = Object.keys(LB_TYPES);
        const type = validTypes.includes(args[0]?.toLowerCase()) ? args[0].toLowerCase() : 'leveling';
        const scope = (args[1]?.toLowerCase() === 'global') ? 'global' : 'server';

        const loadMsg = await message.reply({
            components: [buildLoadingResponse('Leaderboard', 'Generating canvas leaderboard...')],
            flags: MessageFlags.IsComponentsV2
        });

        try {
            const reply = await buildUnifiedLeaderboard(message.client, message.guild, type, scope, 0);
            await loadMsg.delete().catch(() => {});
            await message.reply(reply);
        } catch (err) {
            console.error('leaderboard prefix error:', err);
            await loadMsg.edit({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Error\n\nFailed to generate the leaderboard.'))], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async handleButton(interaction) {
        const match = interaction.customId.match(/^ulb_(?:scope|page)_(\w+)_(\w+)_(-?\d+)$/);
        if (!match) {
            await interaction.deferUpdate();
            return true;
        }

        const [, scope, statType, pageStr] = match;
        const page = parseInt(pageStr);
        const validScope = scope === 'global' ? 'global' : 'server';
        const validType = LB_TYPES[statType] ? statType : 'leveling';

        try {
            await interaction.deferUpdate();
            const reply = await buildUnifiedLeaderboard(interaction.client, interaction.guild, validType, validScope, Math.max(0, page));
            await interaction.editReply(reply);
        } catch (err) {
            console.error('leaderboard button error:', err);
        }
        return true;
    },

    async handleSelectMenu(interaction) {
        const match = interaction.customId.match(/^ulb_type_(\w+)_(\d+)$/);
        if (!match) return false;

        const [, scope, ] = match;
        const selectedType = interaction.values[0];
        const validScope = scope === 'global' ? 'global' : 'server';
        const validType = LB_TYPES[selectedType] ? selectedType : 'leveling';

        try {
            await interaction.deferUpdate();
            const reply = await buildUnifiedLeaderboard(interaction.client, interaction.guild, validType, validScope, 0);
            await interaction.editReply(reply);
        } catch (err) {
            console.error('leaderboard select error:', err);
        }
        return true;
    }
};
