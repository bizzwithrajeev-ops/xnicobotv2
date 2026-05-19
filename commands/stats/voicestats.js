'use strict';

const {
    SlashCommandBuilder, MessageFlags,
    ContainerBuilder, TextDisplayBuilder, SectionBuilder,
    ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize
} = require('discord.js');
const { getGuildMember, getLeaderboard } = require('../../utils/database');

function formatVoiceTime(seconds) {
    if (!seconds || seconds <= 0) return '0h 0m 0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

async function buildVoiceStatsContainer(guild, targetUser, targetMember) {
    const memberData = await getGuildMember(guild.id, targetUser.id).catch(() => null);

    const voiceTime = memberData?.analytics?.voiceTime || 0;
    const hours     = (voiceTime / 3600).toFixed(1);

    // Daily average: spread over account-creation days (cap at 30 days)
    const joinedDays = targetMember.joinedAt
        ? Math.max(1, Math.floor((Date.now() - targetMember.joinedAt.getTime()) / 86_400_000))
        : 1;
    const avgMinutesPerDay = ((voiceTime / 60) / joinedDays).toFixed(1);

    // Rank among server members
    let rank = 'N/A';
    try {
        const lb = await getLeaderboard(guild.id, 'analytics.voiceTime', 100);
        const pos = lb.findIndex(m => m.userId === targetUser.id);
        rank = pos !== -1 ? `#${pos + 1}` : 'Unranked';
    } catch {}

    const accent = parseInt(targetMember.displayHexColor.replace('#', '') || 'a78bfa', 16);

    const section = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## <:Volumeup:1473039290136002844>  Voice Statistics\n` +
                `-# Stats for **${targetUser.username}** in **${guild.name}**`
            )
        )
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: targetUser.displayAvatarURL({ size: 256 }) } }));

    const statsText =
        `<:Volumeup:1473039290136002844> **Total Voice Time**\n> \`${formatVoiceTime(voiceTime)}\` (${hours} hours)\n\n` +
        `<:Lightning:1473038797540298792> **Daily Average**\n> \`${avgMinutesPerDay} min/day\` over ${joinedDays} days\n\n` +
        `<:Award:1473038391632203887> **Voice Rank**\n> \`${rank}\` on this server`;

    return new ContainerBuilder()
        .setAccentColor(accent || 0xa78bfa)
        .addSectionComponents(section)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(statsText))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# Use \`/topstats type:voice\` to see the server voice leaderboard`
            )
        );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('voicestats')
        .setDescription('View voice channel time statistics for a user')
        .addUserOption(o =>
            o.setName('user')
                .setDescription('User to check (defaults to yourself)')
                .setRequired(false)
        ),

    prefix: 'voicestats',
    aliases: ['vcstats', 'voicetime'],
    description: 'View voice channel time statistics for a user',
    usage: 'voicestats [@user]',
    category: 'stats',

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const targetUser   = interaction.options.getUser('user') || interaction.user;
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.editReply({ content: '<:Cancel:1473037949187657818> That user is not in this server.' });
        }

        try {
            const container = await buildVoiceStatsContainer(interaction.guild, targetUser, targetMember);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('voicestats error:', err);
            await interaction.editReply({ content: '<:Cancel:1473037949187657818> Failed to fetch voice statistics.' });
        }
    },

    async executePrefix(message, args) {
        const { resolveUser } = require('../../utils/resolveUser');
        const targetUser   = (await resolveUser(message, args)) || message.author;
        const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return message.reply('<:Cancel:1473037949187657818> That user is not in this server.');
        }

        try {
            const container = await buildVoiceStatsContainer(message.guild, targetUser, targetMember);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('voicestats prefix error:', err);
            await message.reply('<:Cancel:1473037949187657818> Failed to fetch voice statistics.');
        }
    }
};
