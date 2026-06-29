const { SlashCommandBuilder, AttachmentBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildLoadingResponse, buildErrorResponse } = require('../../utils/responseBuilder');
const { generateLeaderboardCard } = require('../../utils/leaderboardCard');

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

async function buildLeaderboardImage(client, guild, requesterId) {
    const leveling = getLeveling();
    const guildData = leveling[guild.id] || {};

    const sortedAll = Object.entries(guildData)
        .map(([userId, data]) => ({
            userId,
            xp: Number(data.xp) || 0,
            level: calculateLevel(Number(data.xp) || 0),
            messages: Number(data.messages) || 0,
        }))
        .filter((e) => e.xp > 0)
        .sort((a, b) => b.xp - a.xp);

    if (sortedAll.length === 0) return null;

    const top = sortedAll.slice(0, 10);
    const entries = [];
    for (let i = 0; i < top.length; i++) {
        const user = await client.users.fetch(top[i].userId).catch(() => null);
        entries.push({
            rank: i + 1,
            name: user ? (user.globalName || user.username) : 'Unknown User',
            avatar: user ? user.displayAvatarURL({ extension: 'png', size: 128 }) : null,
            isRequester: top[i].userId === requesterId,
            primaryValue: top[i].xp,
            primaryLabel: 'XP',
            statLine: `Level ${top[i].level}  ·  ${top[i].messages.toLocaleString()} messages`,
        });
    }

    // Requester standing (footer) — only meaningful if they're ranked.
    let requester = null;
    const rIdx = sortedAll.findIndex((e) => e.userId === requesterId);
    if (rIdx >= 0) {
        const rEntry = sortedAll[rIdx];
        const above = sortedAll[rIdx - 1];
        const gap = above ? above.xp - rEntry.xp : 0;
        requester = {
            rank: rIdx + 1,
            primaryValue: rEntry.xp,
            statLine: `Level ${rEntry.level}  ·  ${rEntry.messages.toLocaleString()} messages`,
            gapText: above && gap > 0 ? `${gap.toLocaleString()} XP behind rank #${rIdx}` : null,
        };
    }

    const buffer = await generateLeaderboardCard(entries, {
        accentInt: 0xFBBF24,
        accentEmoji: '<:Award:1473038391632203887>',
        titleLabel: 'Level',
        modeLabel: 'By XP',
        scopeLabel: guild.name,
        scopeEmoji: '🏆',
        totalCount: sortedAll.length,
        page: 0,
        totalPages: Math.max(1, Math.ceil(sortedAll.length / 10)),
        requester,
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
            const attachment = await buildLeaderboardImage(interaction.client, interaction.guild, interaction.user.id);
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
            const attachment = await buildLeaderboardImage(message.client, message.guild, message.author.id);
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
