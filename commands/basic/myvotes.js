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
    MessageFlags
} = require('discord.js');

const jsonStore = require('../../utils/jsonStore');

function loadUserVotes() {
    return jsonStore.has('user-votes') ? jsonStore.read('user-votes') : {};
}

function saveUserVotes(data) {
    jsonStore.write('user-votes', data);
}

function getStreakEmoji(streak) {
    if (streak >= 30) return '<:Fire:1473038604812161218>';
    if (streak >= 14) return '<:Lightningalt:1473038679906844824>';
    if (streak >= 7) return '<:Sketch:1473038248493453352>';
    if (streak >= 3) return '<:Star:1473038501766369300>';
    return '🗳️';
}

function getStreakTitle(streak) {
    if (streak >= 30) return ' — *LEGENDARY!*';
    if (streak >= 14) return ' — *EPIC!*';
    if (streak >= 7) return ' — *AMAZING!*';
    if (streak >= 3) return ' — *GREAT!*';
    return '';
}

function buildVoteStatsPanel(user, userData, clientId) {
    const now = Date.now();
    const hasVoted = userData && userData.totalVotes > 0;
    const nextVoteTs = userData?.nextVoteAvailable || 0;
    const canVoteNow = !nextVoteTs || now >= nextVoteTs;
    const remindersOn = userData?.remindersEnabled === true;

    const voteLink = `https://top.gg/bot/${clientId}/vote`;

    const section = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# <:Fire:1473038604812161218> Vote Statistics\n` +
                `-# Showing stats for **${user.globalName || user.username}**`
            )
        )
        .setThumbnailAccessory(
            new ThumbnailBuilder({ media: { url: user.displayAvatarURL({ size: 256 }) } })
        );

    let statsContent = '';

    if (!hasVoted) {
        statsContent += `### <:Infotriangle:1473038460456800459> No Votes Yet\n`;
        statsContent += `You haven't voted for **xNico** yet. Every vote helps us grow!\n\n`;
        statsContent += `### <:Present:1473038450465706076> Rewards for Voting\n`;
        statsContent += `• <:Fire:1473038604812161218> Build a daily voting streak\n`;
        statsContent += `• 🏅 Earn the exclusive **Voter** badge on your profile\n`;
        statsContent += `• <:Heart:1473038659514007616> Help the bot reach more servers\n\n`;
        statsContent += `-# Click below to cast your first vote!`;
    } else {
        const streak = userData.streak || 0;
        const total = userData.totalVotes || 0;
        const lastVoteTs = Math.floor((userData.lastVote || 0) / 1000);
        const firstVoteTs = Math.floor((userData.firstVote || userData.lastVote || 0) / 1000);

        statsContent += `### <:Fire:1473038604812161218> Current Streak\n`;
        statsContent += `${getStreakEmoji(streak)} **${streak}** vote${streak !== 1 ? 's' : ''} in a row${getStreakTitle(streak)}\n\n`;

        statsContent += `### <a:loading:1506015728871149770> All-Time Votes\n`;
        statsContent += `**${total}** total vote${total !== 1 ? 's' : ''}\n\n`;

        statsContent += `### <:Clock:1473039102113878056> Vote Timestamps\n`;
        statsContent += `**First vote:** <t:${firstVoteTs}:D>\n`;
        statsContent += `**Last vote:** <t:${lastVoteTs}:R>\n\n`;

        statsContent += `### <:Checkedbox:1473038547165384804> Next Vote\n`;
        if (canVoteNow) {
            statsContent += `<:correct:1415659106735599646> **You can vote right now!**\n\n`;
        } else {
            const ts = Math.floor(nextVoteTs / 1000);
            statsContent += `Available <t:${ts}:R> · <t:${ts}:t>\n\n`;
        }

        statsContent += `### <:Notificationon:1473038417691676784> Vote Reminder\n`;
        statsContent += remindersOn
            ? `<:correct:1415659106735599646> Reminders are **ON** — I'll DM you when you can vote again.`
            : `<:Cancel:1473037949187657818> Reminders are **OFF** — toggle below to get notified.`;
    }

    const container = new ContainerBuilder()
        .setAccentColor(hasVoted ? 0xCAD7E6 : 0x95A5A6)
        .addSectionComponents(section)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(statsContent))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));

    const voteRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel(canVoteNow ? 'Vote Now on Top.gg' : 'Vote on Top.gg')
            .setURL(voteLink)
            .setStyle(ButtonStyle.Link)
            .setEmoji('<:topgg:1473546762248523839>'),
        new ButtonBuilder()
            .setLabel('Vote on DBL')
            .setURL('https://discordbotlist.com/bots/xnico')
            .setStyle(ButtonStyle.Link)
            .setEmoji('<:Cursor:1473038064564834544>')
    );

    const reminderRow = hasVoted ? new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('voterem_toggle')
            .setLabel(remindersOn ? 'Disable Reminders' : 'Enable Reminders')
            .setStyle(remindersOn ? ButtonStyle.Danger : ButtonStyle.Success)
            .setEmoji(remindersOn ? '<:Notificationoff:1473038396394926230>' : '<:Notificationon:1473038417691676784>'),
        new ButtonBuilder()
            .setCustomId('voterem_refresh')
            .setLabel('Refresh')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Reload:1473039026296504320>')
    ) : null;

    return { container, voteRow, reminderRow };
}

module.exports = {
    prefix: 'myvotes',
    aliases: ['mv', 'votestats', 'mystreak', 'votes'],
    description: 'Check your vote stats, streak, and manage vote reminders',
    usage: 'myvotes',
    category: 'basic',
    dmAllowed: true,

    data: new SlashCommandBuilder()
        .setName('myvotes')
        .setDescription('Check your vote stats, streak, and manage vote reminders')
        .setDMPermission(true),

    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const userVotes = loadUserVotes();
            const userData = userVotes[interaction.user.id] || null;
            const clientId = process.env.CLIENT_ID || interaction.client.user.id;
            const { container, voteRow, reminderRow } = buildVoteStatsPanel(interaction.user, userData, clientId);
            const components = reminderRow
                ? [container, voteRow, reminderRow]
                : [container, voteRow];
            await interaction.editReply({ components, flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[myvotes slash]', error);
            try { await interaction.editReply({ content: '<:Cancel:1473037949187657818> Failed to load your vote stats.' }); } catch { }
        }
    },

    async executePrefix(message) {
        try {
            const userVotes = loadUserVotes();
            const userData = userVotes[message.author.id] || null;
            const clientId = process.env.CLIENT_ID || message.client.user.id;
            const { container, voteRow, reminderRow } = buildVoteStatsPanel(message.author, userData, clientId);
            const components = reminderRow
                ? [container, voteRow, reminderRow]
                : [container, voteRow];
            await message.reply({ components, flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[myvotes prefix]', error);
            await message.reply('<:Cancel:1473037949187657818> Failed to load your vote stats.').catch(() => { });
        }
    },

    async handleInteraction(interaction) {
        if (!interaction.isButton()) return false;
        const { customId, user } = interaction;
        if (!customId.startsWith('voterem_')) return false;

        const userVotes = loadUserVotes();
        if (!userVotes[user.id]) {
            await interaction.reply({ content: '<:Cancel:1473037949187657818> You haven\'t voted yet! Vote first to use reminders.', flags: MessageFlags.Ephemeral });
            return true;
        }

        if (customId === 'voterem_toggle') {
            userVotes[user.id].remindersEnabled = !userVotes[user.id].remindersEnabled;
            saveUserVotes(userVotes);

            const isNowOn = userVotes[user.id].remindersEnabled;
            const clientId = process.env.CLIENT_ID || interaction.client.user.id;
            const { container, voteRow, reminderRow } = buildVoteStatsPanel(user, userVotes[user.id], clientId);
            const components = reminderRow ? [container, voteRow, reminderRow] : [container, voteRow];

            await interaction.update({ components, flags: MessageFlags.IsComponentsV2 });
            return true;
        }

        if (customId === 'voterem_refresh') {
            const clientId = process.env.CLIENT_ID || interaction.client.user.id;
            const { container, voteRow, reminderRow } = buildVoteStatsPanel(user, userVotes[user.id], clientId);
            const components = reminderRow ? [container, voteRow, reminderRow] : [container, voteRow];
            await interaction.update({ components, flags: MessageFlags.IsComponentsV2 });
            return true;
        }

        return false;
    }
};
