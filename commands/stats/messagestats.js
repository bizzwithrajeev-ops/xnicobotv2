'use strict';

const {
    SlashCommandBuilder, MessageFlags,
    ContainerBuilder, TextDisplayBuilder, SectionBuilder,
    ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize
} = require('discord.js');
const { getGuildMember, getLeaderboard } = require('../../utils/database');

async function buildMessageStatsContainer(guild, targetUser, targetMember) {
    const memberData = await getGuildMember(guild.id, targetUser.id).catch(() => null);

    const totalMessages  = memberData?.analytics?.totalMessages  || 0;
    const levelMessages  = memberData?.leveling?.messageCount    || 0;
    const commandsUsed   = memberData?.leveling?.commandsUsed    || 0;
    const xp             = memberData?.leveling?.xp              || 0;
    const level          = memberData?.leveling?.level           || 0;

    // Calculate rank by totalMessages
    let rank = 'N/A';
    try {
        const lb = await getLeaderboard(guild.id, 'analytics.totalMessages', 100);
        const pos = lb.findIndex(m => m.userId === targetUser.id);
        rank = pos !== -1 ? `#${pos + 1}` : 'Unranked';
    } catch {}

    const accent = parseInt(targetMember.displayHexColor.replace('#', '') || 'CAD7E6', 16);

    const section = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## <:Bookopen:1473038576391557130>  Message Statistics\n` +
                `-# Stats for **${targetUser.username}** in **${guild.name}**`
            )
        )
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: targetUser.displayAvatarURL({ size: 256 }) } }));

    const statsText =
        `<:Caretright:1473038207221502106> **Total Messages Tracked**\n> \`${totalMessages.toLocaleString()}\`\n\n` +
        `<:Bookopen:1473038576391557130> **Messages Counted for XP**\n> \`${levelMessages.toLocaleString()}\`\n\n` +
        `<:Gamepad:1473039216429498409> **Commands Used**\n> \`${commandsUsed.toLocaleString()}\`\n\n` +
        `<a:loading:1506015728871149770> **XP Earned**\n> \`${xp.toLocaleString()} XP\` · Level \`${level}\`\n\n` +
        `<:Award:1473038391632203887> **Message Rank**\n> \`${rank}\` on this server`;

    return new ContainerBuilder()
        .setAccentColor(accent || 0xCAD7E6)
        .addSectionComponents(section)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(statsText))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# Use \`/topstats type:messages\` to see the server leaderboard`
            )
        );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('messagestats')
        .setDescription('View message statistics for a user')
        .addUserOption(o =>
            o.setName('user')
                .setDescription('User to check (defaults to yourself)')
                .setRequired(false)
        ),

    prefix: 'messagestats',
    aliases: ['msgstats', 'msgstas'],
    description: 'View message statistics for a user',
    usage: 'messagestats [@user]',
    category: 'stats',

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const targetUser   = interaction.options.getUser('user') || interaction.user;
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.editReply({ content: '<:Cancel:1473037949187657818> That user is not in this server.' });
        }

        try {
            const container = await buildMessageStatsContainer(interaction.guild, targetUser, targetMember);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('messagestats error:', err);
            await interaction.editReply({ content: '<:Cancel:1473037949187657818> Failed to fetch message statistics.' });
        }
    },

    async executePrefix(message, args) {
        const targetUser   = message.mentions.users.first() || message.author;
        const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return message.reply('<:Cancel:1473037949187657818> That user is not in this server.');
        }

        try {
            const container = await buildMessageStatsContainer(message.guild, targetUser, targetMember);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('messagestats prefix error:', err);
            await message.reply('<:Cancel:1473037949187657818> Failed to fetch message statistics.');
        }
    }
};
