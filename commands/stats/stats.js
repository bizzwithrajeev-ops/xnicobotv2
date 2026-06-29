'use strict';

/**
 * /stats — One clean personal-stats panel (Components V2 container).
 *
 * Consolidates the per-metric checks into a single command: messages,
 * daily messages, voice time, invites, XP/level and interactions — each
 * with the user's value AND their server/global rank. Data is sourced
 * through the leaderboard's shared loaders (loadAllEntries / LB_TYPES) so
 * the numbers always match the /leaderboard board exactly (and use the
 * correct stores — XP from `leveling`, invites from `invites`, etc.).
 *
 * The leaderboard itself stays in canvas; personal stats stay in a clean
 * container per the project's UI direction.
 */

const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');

const { loadAllEntries, LB_TYPES } = require('../leveling/leaderboard');

// Order shown in the panel. Each maps to an LB_TYPES key so labels,
// emojis and value formatting stay consistent with the leaderboard.
const STAT_ORDER = ['leveling', 'messages', 'dailymessages', 'voice', 'invites', 'interaction'];

const BRAND = '<:xnico:1486755083390550036>';
const PIN = '<:pin:1473038806612447500>';

function escapeMarkdown(text) {
    return String(text || '').replace(/[*_~`|>\\]/g, (m) => `\\${m}`);
}

/**
 * Resolve the user's value + rank for every tracked category in one scope.
 */
async function collectStats(guild, userId, scope) {
    const out = [];
    for (const type of STAT_ORDER) {
        const cfg = LB_TYPES[type];
        if (!cfg) continue;
        let entries = [];
        try { entries = await loadAllEntries(guild, type, scope); } catch { entries = []; }
        const idx = entries.findIndex((e) => e.userId === userId);
        const value = idx >= 0 ? entries[idx].value : 0;
        out.push({
            type,
            label: cfg.label,
            emoji: cfg.emoji,
            valueStr: cfg.format(value, guild?.id),
            rank: idx >= 0 ? idx + 1 : null,
            total: entries.length,
            ranked: idx >= 0,
        });
    }
    return out;
}

async function buildStatsReply(client, guild, targetUser, scope) {
    const validScope = scope === 'global' ? 'global' : 'server';
    const stats = await collectStats(guild, targetUser.id, validScope);

    const scopeLabel = validScope === 'global' ? 'Global Network' : (guild?.name || 'This Server');
    const scopeIcon = validScope === 'global' ? '🌍' : '🏠';

    const container = new ContainerBuilder().setAccentColor(0x5865F2);

    // Header with avatar thumbnail.
    const headerText = [
        `# ${escapeMarkdown(targetUser.globalName || targetUser.username)}`,
        `### ${scopeIcon} Stats · ${escapeMarkdown(scopeLabel)}`,
    ].join('\n');

    const avatarUrl = targetUser.displayAvatarURL({ size: 256, extension: 'png' });
    try {
        const header = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
            .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: avatarUrl } }));
        container.addSectionComponents(header);
    } catch {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText));
    }

    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );

    // One clean line per category: value + rank.
    const lines = stats.map((s) => {
        const rankStr = s.ranked ? `rank \`#${s.rank}\`` : '`unranked`';
        return `${s.emoji}  **${s.label}** — ${s.valueStr}  ·  ${rankStr}`;
    });
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ${BRAND} xNico  ·  ${PIN} ${validScope === 'global' ? 'Across all servers' : 'This server'}`
    ));

    // Server ↔ Global toggle, nested inside the container.
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`sc_server_${targetUser.id}`)
            .setLabel('Server')
            .setEmoji('🏠')
            .setStyle(validScope === 'server' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(validScope === 'server'),
        new ButtonBuilder()
            .setCustomId(`sc_global_${targetUser.id}`)
            .setLabel('Global')
            .setEmoji('🌍')
            .setStyle(validScope === 'global' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(validScope === 'global')
    );
    container.addActionRowComponents(row);

    return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View a clean stat panel — messages, daily, voice, invites, XP, interactions')
        .addUserOption(o =>
            o.setName('user')
                .setDescription('User to check (defaults to yourself)')
                .setRequired(false)
        ),

    prefix: 'stats',
    aliases: ['statcard', 'sc', 'mystats'],
    description: 'View a clean personal stat panel with value + rank for every category',
    usage: 'stats [@user]',
    category: 'stats',

    async execute(interaction) {
        await interaction.deferReply();
        const targetUser = interaction.options.getUser('user') || interaction.user;
        try {
            const reply = await buildStatsReply(interaction.client, interaction.guild, targetUser, 'server');
            await interaction.editReply(reply);
        } catch (err) {
            console.error('stats command error:', err);
            await interaction.editReply({ content: '<:Cancel:1473037949187657818> Failed to load stats.' });
        }
    },

    async executePrefix(message, args) {
        const { resolveUser } = require('../../utils/resolveUser');
        const targetUser = (await resolveUser(message, args)) || message.author;
        try {
            const reply = await buildStatsReply(message.client, message.guild, targetUser, 'server');
            await message.reply(reply);
        } catch (err) {
            console.error('stats prefix error:', err);
            await message.reply('<:Cancel:1473037949187657818> Failed to load stats.');
        }
    },

    async handleButton(interaction) {
        const parts = interaction.customId.split('_');
        if (parts.length < 3 || parts[0] !== 'sc') {
            await interaction.deferUpdate().catch(() => {});
            return true;
        }
        const scope = parts[1] === 'global' ? 'global' : 'server';
        const targetUserId = parts[2];

        let targetUser;
        try {
            targetUser = await interaction.client.users.fetch(targetUserId);
        } catch {
            await interaction.deferUpdate().catch(() => {});
            return true;
        }

        try {
            await interaction.deferUpdate();
            const reply = await buildStatsReply(interaction.client, interaction.guild, targetUser, scope);
            await interaction.editReply(reply);
        } catch (err) {
            console.error('stats button error:', err);
        }
        return true;
    },
};
