'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags } = require('discord.js');
const { getGuildMember, getLeaderboard, getGlobalUserStats, getGlobalLeaderboard } = require('../../utils/database');
const { generateStatsCard } = require('../../utils/statsCard');
const { getUserData: getMainUserData } = require('../../utils/dataManager');

async function getServerRank(guildId, userId) {
    try {
        const lb = await getLeaderboard(guildId, 'analytics.totalMessages', 99999);
        const pos = lb.findIndex(m => m.userId === userId);
        return pos !== -1 ? pos + 1 : 'N/A';
    } catch { return 'N/A'; }
}

function getGlobalRank(userId) {
    const lb = getGlobalLeaderboard('totalMessages', 99999);
    const pos = lb.findIndex(e => e.userId === userId);
    return pos !== -1 ? pos + 1 : 'N/A';
}

async function buildStatsReply(client, guild, targetUser, scope) {
    let cardData;

    if (scope === 'global') {
        const globalStats = getGlobalUserStats(targetUser.id);
        const rank = getGlobalRank(targetUser.id);
        cardData = {
            username: targetUser.username,
            avatarURL: targetUser.displayAvatarURL({ size: 256, extension: 'png' }),
            totalMessages: globalStats.totalMessages,
            voiceTime: globalStats.voiceTime,
            xp: globalStats.xp,
            level: globalStats.level,
            invites: globalStats.invites,
            commandsUsed: globalStats.commandsUsed,
            rank,
            scope: 'global',
            guildsActive: globalStats.guildsActive
        };
    } else {
        const memberData = await getGuildMember(guild.id, targetUser.id).catch(() => null);
        const rank = await getServerRank(guild.id, targetUser.id);
        cardData = {
            username: targetUser.username,
            avatarURL: targetUser.displayAvatarURL({ size: 256, extension: 'png' }),
            totalMessages: memberData?.analytics?.totalMessages || 0,
            voiceTime: memberData?.analytics?.voiceTime || 0,
            xp: memberData?.leveling?.xp || 0,
            level: memberData?.leveling?.level || 0,
            invites: memberData?.invites?.invites || 0,
            commandsUsed: memberData?.leveling?.commandsUsed || 0,
            rank,
            scope: 'server',
            scopeLabel: `Stats in ${guild.name}`
        };
    }

    let statsFontFamily = 'Inter';
    try {
        const mainUserData = await getMainUserData(targetUser.id);
        statsFontFamily = mainUserData?.profile?.rankCard?.fontFamily || mainUserData?.profile?.profileCard?.fontFamily || 'Inter';
    } catch {}
    cardData.fontFamily = statsFontFamily;

    const buffer = await generateStatsCard(cardData);
    const attachment = new AttachmentBuilder(buffer, { name: 'stats.png' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`sc_server_${targetUser.id}`)
            .setLabel('Server')
            .setEmoji('🏠')
            .setStyle(scope === 'server' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(scope === 'server'),
        new ButtonBuilder()
            .setCustomId(`sc_global_${targetUser.id}`)
            .setLabel('Global')
            .setEmoji('🌍')
            .setStyle(scope === 'global' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(scope === 'global')
    );

    return { files: [attachment], components: [row] };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View a visual stat card for any user')
        .addUserOption(o =>
            o.setName('user')
                .setDescription('User to check (defaults to yourself)')
                .setRequired(false)
        ),

    prefix: 'stats',
    aliases: ['statcard', 'sc'],
    description: 'View a visual stat card for any user',
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
            await interaction.editReply({ content: '<:Cancel:1473037949187657818> Failed to generate stat card.' });
        }
    },

    async executePrefix(message, args) {
        const targetUser = message.mentions.users.first() || message.author;

        try {
            const reply = await buildStatsReply(message.client, message.guild, targetUser, 'server');
            await message.reply(reply);
        } catch (err) {
            console.error('stats prefix error:', err);
            await message.reply('<:Cancel:1473037949187657818> Failed to generate stat card.');
        }
    },

    async handleButton(interaction) {
        const parts = interaction.customId.split('_');
        if (parts.length < 3) {
            await interaction.deferUpdate();
            return true;
        }

        const scope = parts[1];
        const targetUserId = parts[2];

        let targetUser;
        try {
            targetUser = await interaction.client.users.fetch(targetUserId);
        } catch {
            await interaction.deferUpdate();
            return true;
        }

        const validScope = scope === 'global' ? 'global' : 'server';

        try {
            const reply = await buildStatsReply(interaction.client, interaction.guild, targetUser, validScope);
            await interaction.update(reply);
        } catch (err) {
            console.error('stats button error:', err);
            await interaction.deferUpdate();
        }
        return true;
    }
};
