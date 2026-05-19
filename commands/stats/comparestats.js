'use strict';

const {
    SlashCommandBuilder, MessageFlags,
    ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize
} = require('discord.js');
const { getGuildMember } = require('../../utils/database');

function formatVoiceTime(seconds) {
    const s = Number(seconds) || 0;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
}

function winnerLine(label, leftName, leftValue, rightName, rightValue, isVoice = false) {
    const fmt = (v) => isVoice ? formatVoiceTime(v) : v.toLocaleString();
    if (leftValue === rightValue) return `**${label}:** Tie (${fmt(leftValue)})`;
    return leftValue > rightValue
        ? `**${label}:** ${leftName} wins (${fmt(leftValue)} vs ${fmt(rightValue)})`
        : `**${label}:** ${rightName} wins (${fmt(rightValue)} vs ${fmt(leftValue)})`;
}

async function buildCompareContainer(guild, userA, userB) {
    const [aData, bData] = await Promise.all([
        getGuildMember(guild.id, userA.id).catch(() => null),
        getGuildMember(guild.id, userB.id).catch(() => null),
    ]);

    const a = {
        messages: Number(aData?.analytics?.totalMessages || 0),
        voice: Number(aData?.analytics?.voiceTime || 0),
        xp: Number(aData?.leveling?.xp || 0),
        commands: Number(aData?.leveling?.commandsUsed || 0),
    };
    const b = {
        messages: Number(bData?.analytics?.totalMessages || 0),
        voice: Number(bData?.analytics?.voiceTime || 0),
        xp: Number(bData?.leveling?.xp || 0),
        commands: Number(bData?.leveling?.commandsUsed || 0),
    };

    const details =
        `### <:Bookopen:1473038576391557130> ${userA.username}\n` +
        `> Messages: \`${a.messages.toLocaleString()}\`\n` +
        `> Voice: \`${formatVoiceTime(a.voice)}\`\n` +
        `> XP: \`${a.xp.toLocaleString()}\`\n` +
        `> Commands: \`${a.commands.toLocaleString()}\`\n\n` +
        `### <:Bookopen:1473038576391557130> ${userB.username}\n` +
        `> Messages: \`${b.messages.toLocaleString()}\`\n` +
        `> Voice: \`${formatVoiceTime(b.voice)}\`\n` +
        `> XP: \`${b.xp.toLocaleString()}\`\n` +
        `> Commands: \`${b.commands.toLocaleString()}\``;

    const comparison = [
        winnerLine('Messages', userA.username, a.messages, userB.username, b.messages),
        winnerLine('Voice Time', userA.username, a.voice, userB.username, b.voice, true),
        winnerLine('XP', userA.username, a.xp, userB.username, b.xp),
        winnerLine('Commands Used', userA.username, a.commands, userB.username, b.commands),
    ].join('\n');

    return new ContainerBuilder()
        .setAccentColor(0xA78BFA)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## <:Inforect:1473038624172937287>  Compare Stats\n-# **${userA.username}** vs **${userB.username}**`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(details))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <:Award:1473038391632203887> Winners\n${comparison}`));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('comparestats')
        .setDescription('Compare tracked activity stats between two users')
        .addUserOption(o => o.setName('user1').setDescription('First user').setRequired(true))
        .addUserOption(o => o.setName('user2').setDescription('Second user').setRequired(true)),

    prefix: 'comparestats',
    aliases: ['compareactivity', 'statcompare'],
    description: 'Compare tracked activity stats between two users',
    usage: 'comparestats @user1 @user2',
    category: 'stats',

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const user1 = interaction.options.getUser('user1');
        const user2 = interaction.options.getUser('user2');

        if (user1.id === user2.id) {
            return interaction.editReply({ content: '<:Cancel:1473037949187657818> Pick two different users to compare.' });
        }

        try {
            const container = await buildCompareContainer(interaction.guild, user1, user2);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('comparestats error:', error);
            await interaction.editReply({ content: '<:Cancel:1473037949187657818> Failed to compare user stats.' });
        }
    },

    async executePrefix(message, args) {
        // Resolve two users from mentions or IDs
        let user1 = message.mentions.users.first();
        let user2 = message.mentions.users.size >= 2 ? [...message.mentions.users.values()][1] : null;

        // Fallback: parse IDs from args
        if (!user1 && args[0]) {
            const id = args[0].replace(/[<@!>]/g, '');
            if (/^\d{17,20}$/.test(id)) user1 = await message.client.users.fetch(id).catch(() => null);
        }
        if (!user2 && args[1]) {
            const id = args[1].replace(/[<@!>]/g, '');
            if (/^\d{17,20}$/.test(id)) user2 = await message.client.users.fetch(id).catch(() => null);
        }

        if (!user1 || !user2) {
            return message.reply('<:Cancel:1473037949187657818> Usage: `comparestats @user1 @user2`');
        }

        if (user1.id === user2.id) {
            return message.reply('<:Cancel:1473037949187657818> Pick two different users to compare.');
        }

        try {
            const container = await buildCompareContainer(message.guild, user1, user2);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('comparestats prefix error:', error);
            await message.reply('<:Cancel:1473037949187657818> Failed to compare user stats.');
        }
    }
};
