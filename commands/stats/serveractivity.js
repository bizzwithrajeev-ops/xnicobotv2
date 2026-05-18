'use strict';

const jsonStore = require('../../utils/jsonStore');
const {
    SlashCommandBuilder, MessageFlags,
    ContainerBuilder, TextDisplayBuilder, SectionBuilder,
    ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize
} = require('discord.js');


function readGuildMembers() {
    try {
        if (!jsonStore.has('guild_members')) return [];
        const raw = JSON.stringify(jsonStore.read('guild_members'));
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function formatVoiceTime(seconds) {
    const s = Number(seconds) || 0;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
}

function buildServerActivityContainer(guild) {
    const rows = readGuildMembers().filter(entry => entry.guild_id === guild.id);

    let totalMessages = 0;
    let totalVoiceTime = 0;
    let totalXp = 0;
    let totalCommands = 0;
    let activeMembers = 0;

    for (const row of rows) {
        const messages = Number(row?.analytics?.totalMessages || 0);
        const voiceTime = Number(row?.analytics?.voiceTime || 0);
        const xp = Number(row?.leveling?.xp || 0);
        const commands = Number(row?.leveling?.commandsUsed || 0);

        totalMessages += messages;
        totalVoiceTime += voiceTime;
        totalXp += xp;
        totalCommands += commands;

        if (messages > 0 || voiceTime > 0 || xp > 0 || commands > 0) activeMembers += 1;
    }

    const trackedMembers = rows.length;
    const avgMessages = trackedMembers > 0 ? Math.round(totalMessages / trackedMembers) : 0;
    const avgVoice = trackedMembers > 0 ? Math.round(totalVoiceTime / trackedMembers) : 0;

    const content =
        `<:Inforect:1473038624172937287> **Tracked Members**\n> \`${trackedMembers.toLocaleString()}\` entries\n\n` +
        `<:Fire:1473038604812161218> **Active Members**\n> \`${activeMembers.toLocaleString()}\` members with recorded activity\n\n` +
        `<:Bookopen:1473038576391557130> **Total Messages**\n> \`${totalMessages.toLocaleString()}\` (avg \`${avgMessages.toLocaleString()}\` per tracked member)\n\n` +
        `<:Volumeup:1473039290136002844> **Total Voice Time**\n> \`${formatVoiceTime(totalVoiceTime)}\` (avg \`${formatVoiceTime(avgVoice)}\`)\n\n` +
        `<a:loading:1506015728871149770> **Total XP**\n> \`${totalXp.toLocaleString()} XP\`\n\n` +
        `<:Gamepad:1473039216429498409> **Total Commands Used**\n> \`${totalCommands.toLocaleString()}\``;

    return new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `## <:Inforect:1473038624172937287>  Server Activity\n-# Aggregated stats for **${guild.name}**`
                    )
                )
                .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: guild.iconURL({ size: 256 }) || 'https://cdn.discordapp.com/embed/avatars/0.png' } }))
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Use `/topstats` for ranked leaderboards by type.'));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serveractivity')
        .setDescription('View aggregated activity analytics for this server'),

    prefix: 'serveractivity',
    aliases: ['serverstats2', 'guildactivity', 'activitystats'],
    description: 'View aggregated activity analytics for this server',
    usage: 'serveractivity',
    category: 'stats',

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            const container = buildServerActivityContainer(interaction.guild);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('serveractivity error:', error);
            await interaction.editReply({ content: '<:Cancel:1473037949187657818> Failed to build server activity stats.' });
        }
    },

    async executePrefix(message) {
        try {
            const container = buildServerActivityContainer(message.guild);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('serveractivity prefix error:', error);
            await message.reply('<:Cancel:1473037949187657818> Failed to build server activity stats.');
        }
    }
};
