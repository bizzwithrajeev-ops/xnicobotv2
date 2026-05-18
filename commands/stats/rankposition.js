'use strict';

const {
    SlashCommandBuilder, MessageFlags,
    ContainerBuilder, TextDisplayBuilder, SectionBuilder,
    ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize
} = require('discord.js');
const { getLeaderboard, getGuildMember } = require('../../utils/database');

async function resolveRank(guildId, userId, field) {
    const leaderboard = await getLeaderboard(guildId, field, 500);
    const index = leaderboard.findIndex(entry => entry.userId === userId);
    return index >= 0 ? index + 1 : null;
}

async function buildRankPositionContainer(guild, user, member) {
    const userData = await getGuildMember(guild.id, user.id).catch(() => null);
    const messageCount = Number(userData?.analytics?.totalMessages || 0);
    const voiceTime = Number(userData?.analytics?.voiceTime || 0);
    const xp = Number(userData?.leveling?.xp || 0);
    const invites = Number(userData?.invites?.invites || 0);

    const [messageRank, voiceRank, xpRank, inviteRank] = await Promise.all([
        resolveRank(guild.id, user.id, 'analytics.totalMessages').catch(() => null),
        resolveRank(guild.id, user.id, 'analytics.voiceTime').catch(() => null),
        resolveRank(guild.id, user.id, 'leveling.xp').catch(() => null),
        resolveRank(guild.id, user.id, 'invites.invites').catch(() => null),
    ]);

    const line = (label, value, rank) =>
        `**${label}:** \`${value.toLocaleString()}\` · Rank ${rank ? `\`#${rank}\`` : '`Unranked`'}`;

    return new ContainerBuilder()
        .setAccentColor(parseInt(member.displayHexColor.replace('#', '') || '5865F2', 16) || 0x5865F2)
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `## <:Award:1473038391632203887>  Rank Positions\n-# Ranking snapshot for **${user.username}**`
                    )
                )
                .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: user.displayAvatarURL({ size: 256 }) } }))
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `${line('Messages', messageCount, messageRank)}\n` +
            `${line('Voice Seconds', voiceTime, voiceRank)}\n` +
            `${line('XP', xp, xpRank)}\n` +
            `${line('Invites', invites, inviteRank)}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Use `/topstats` to view full leaderboards.'));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rankposition')
        .setDescription('View your rank positions across major activity metrics')
        .addUserOption(o =>
            o.setName('user')
                .setDescription('Target user (default: yourself)')
                .setRequired(false)
        ),

    prefix: 'rankposition',
    aliases: ['statsrank', 'positionstats'],
    description: 'View rank positions across activity metrics',
    usage: 'rankposition [@user]',
    category: 'stats',

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const user = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        if (!member) {
            return interaction.editReply({ content: '<:Cancel:1473037949187657818> That user is not in this server.' });
        }

        try {
            const container = await buildRankPositionContainer(interaction.guild, user, member);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('rankposition error:', error);
            await interaction.editReply({ content: '<:Cancel:1473037949187657818> Failed to fetch rank positions.' });
        }
    },

    async executePrefix(message) {
        const user = message.mentions.users.first() || message.author;
        const member = await message.guild.members.fetch(user.id).catch(() => null);

        if (!member) {
            return message.reply('<:Cancel:1473037949187657818> That user is not in this server.');
        }

        try {
            const container = await buildRankPositionContainer(message.guild, user, member);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('rankposition prefix error:', error);
            await message.reply('<:Cancel:1473037949187657818> Failed to fetch rank positions.');
        }
    }
};
