const { SlashCommandBuilder, AttachmentBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildLoadingResponse, buildErrorResponse } = require('../../utils/responseBuilder');
const { generateLeaderboard } = require('../../utils/leaderboardCard');

const jsonStore = require('../../utils/jsonStore');

function getLeveling() {
    if (!jsonStore.has('leveling')) {
        jsonStore.write('leveling', {});
        return {};
    }
    return jsonStore.read('leveling');
}

function calculateLevel(xp) {
    return Math.floor(0.1 * Math.sqrt(xp));
}

async function buildLeaderboardImage(client, guild) {
    const leveling = getLeveling();
    const guildData = leveling[guild.id] || {};

    const sorted = Object.entries(guildData)
        .map(([userId, data]) => ({
            userId,
            xp: data.xp,
            level: calculateLevel(data.xp),
            messages: data.messages || 0
        }))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 10);

    if (sorted.length === 0) return null;

    const entries = [];
    for (let i = 0; i < sorted.length; i++) {
        const user = await client.users.fetch(sorted[i].userId).catch(() => null);
        entries.push({
            userId: sorted[i].userId,
            username: user ? (user.globalName || user.username) : 'Unknown User',
            avatarURL: user ? user.displayAvatarURL({ extension: 'png', size: 128 }) : null,
            xp: sorted[i].xp,
            level: sorted[i].level,
            messages: sorted[i].messages,
            rank: i + 1,
        });
    }

    const buffer = await generateLeaderboard({
        guildName: guild.name,
        guildIconURL: guild.iconURL({ extension: 'png', size: 128 }),
        totalMembers: guild.memberCount,
        entries,
    });

    return new AttachmentBuilder(buffer, { name: 'leaderboard.png' });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('levels')
        .setDescription('View the server leveling leaderboard'),
    name: 'levels',
    prefix: 'levels',
    description: 'View the server leveling leaderboard (canvas)',
    usage: 'levels',
    category: 'leveling',
    aliases: ['xptop', 'xplb'],

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const attachment = await buildLeaderboardImage(interaction.client, interaction.guild);
            if (!attachment) {
                const container = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder()
                            .setContent(`# <:Award:1473038391632203887> Level Leaderboard\n\nNo users found! Start chatting to gain XP!`)
                    );
                return await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            await interaction.editReply({ files: [attachment] });
        } catch (error) {
            console.error('Error generating leaderboard:', error);
            await interaction.editReply('<:Cancel:1473037949187657818> An error occurred while generating the leaderboard.');
        }
    },

    async executePrefix(message) {
        const loadingContainer = buildLoadingResponse('Generating Leaderboard', 'Please wait while the leaderboard is being created...');
        const msg = await message.reply({ components: [loadingContainer], flags: MessageFlags.IsComponentsV2 });

        try {
            const attachment = await buildLeaderboardImage(message.client, message.guild);
            if (!attachment) {
                const container = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder()
                            .setContent(`# <:Award:1473038391632203887> Level Leaderboard\n\nNo users found! Start chatting to gain XP!`)
                    );
                return await msg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            await msg.delete().catch(() => {});
            await message.reply({ files: [attachment] });
        } catch (error) {
            console.error('Error generating leaderboard:', error);
            const errContainer = buildErrorResponse('Leaderboard Error', 'An error occurred while generating the leaderboard.', 'Please try again later.');
            await msg.edit({ components: [errContainer], flags: MessageFlags.IsComponentsV2 });
        }
    },
};
