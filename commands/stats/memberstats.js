'use strict';

const {
    SlashCommandBuilder, MessageFlags,
    ContainerBuilder, TextDisplayBuilder, SectionBuilder,
    ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize
} = require('discord.js');
const { getGuildMember } = require('../../utils/database');

function formatVoiceTime(seconds) {
    if (!seconds || seconds <= 0) return '0h 0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function buildMemberStatsContainer(guild, targetUser, targetMember) {
    const memberData = await getGuildMember(guild.id, targetUser.id).catch(() => null);

    const totalMessages  = memberData?.analytics?.totalMessages  || 0;
    const levelMessages  = memberData?.leveling?.messageCount    || 0;
    const commandsUsed   = memberData?.leveling?.commandsUsed    || 0;
    const xp             = memberData?.leveling?.xp              || 0;
    const level          = memberData?.leveling?.level           || 0;
    const voiceTime      = memberData?.analytics?.voiceTime      || 0;
    const warnings       = (memberData?.warnings || []).length;
    const invites        = memberData?.invites?.invites          || 0;
    const invitesLeft    = memberData?.invites?.left             || 0;
    const invitesFake    = memberData?.invites?.fake             || 0;

    const joinedAt = targetMember.joinedAt
        ? `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:R>`
        : 'Unknown';
    const createdAt = `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`;

    const accent = parseInt(targetMember.displayHexColor.replace('#', '') || '5865F2', 16);
    const roles = targetMember.roles.cache.filter(r => r.id !== guild.id);
    const topRole = roles.sort((a, b) => b.position - a.position).first();

    const section = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## <:Inforect:1473038624172937287>  Member Statistics\n` +
                `-# Full analytics for **${targetUser.username}** in **${guild.name}**`
            )
        )
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: targetUser.displayAvatarURL({ size: 256 }) } }));

    const activityBlock =
        `<:Bookopen:1473038576391557130> **Messages**\n` +
        `> Total: \`${totalMessages.toLocaleString()}\` · XP Messages: \`${levelMessages.toLocaleString()}\` · Commands: \`${commandsUsed.toLocaleString()}\`\n\n` +
        `<:Volumeup:1473039290136002844> **Voice Time**\n` +
        `> \`${formatVoiceTime(voiceTime)}\` total\n\n` +
        `<:Lightning:1473038797540298792> **Leveling**\n` +
        `> Level \`${level}\` · \`${xp.toLocaleString()} XP\``;

    const serverBlock =
        `<:Bullhorn:1473038903157199093> **Invites**\n` +
        `> Valid: \`${invites}\` · Left: \`${invitesLeft}\` · Fake: \`${invitesFake}\`\n\n` +
        `<:banhammer:1473367388597780592> **Warnings**\n` +
        `> \`${warnings}\` active warning${warnings !== 1 ? 's' : ''}\n\n` +
        `<:Settings:1473037894703779851> **Roles**\n` +
        `> \`${roles.size}\` role${roles.size !== 1 ? 's' : ''} · Top: ${topRole ? topRole.toString() : 'None'}\n\n` +
        `<:Pin:1473038806612447500> **Joined**\n` +
        `> Server: ${joinedAt} · Account: ${createdAt}`;

    return new ContainerBuilder()
        .setAccentColor(accent || 0x5865F2)
        .addSectionComponents(section)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### <:Fire:1473038604812161218> Activity\n${activityBlock}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### <:Pin:1473038806612447500> Server Info\n${serverBlock}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# Use \`/messagestats\` · \`/voicestats\` · \`/topstats\` for focused views`
            )
        );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('memberstats')
        .setDescription('View full activity statistics for a member')
        .addUserOption(o =>
            o.setName('user')
                .setDescription('User to check (defaults to yourself)')
                .setRequired(false)
        ),

    prefix: 'memberstats',
    aliases: ['mstats', 'mstat'],
    description: 'View full activity statistics for a member',
    usage: 'memberstats [@user]',
    category: 'stats',

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const targetUser   = interaction.options.getUser('user') || interaction.user;
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.editReply({ content: '<:Cancel:1473037949187657818> That user is not in this server.' });
        }

        try {
            const container = await buildMemberStatsContainer(interaction.guild, targetUser, targetMember);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('memberstats error:', err);
            await interaction.editReply({ content: '<:Cancel:1473037949187657818> Failed to fetch member statistics.' });
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
            const container = await buildMemberStatsContainer(message.guild, targetUser, targetMember);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('memberstats prefix error:', err);
            await message.reply('<:Cancel:1473037949187657818> Failed to fetch member statistics.');
        }
    }
};
