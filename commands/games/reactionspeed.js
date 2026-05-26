const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const games = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [id, game] of games) {
        if (now - game.createdAt > 60 * 1000) games.delete(id);
    }
}, 60 * 1000);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reactionspeed')
        .setDescription('Test your reaction speed - click the button as fast as you can!'),

    prefix: 'reactionspeed',
    description: 'Test your reaction speed - click the button when it turns green!',
    usage: 'reactionspeed',
    category: 'games',
    aliases: ['reflextest', 'speedtest', 'reaction', 'reactiontest'],

    async execute(interaction) {
        await startReactionTest(interaction, true);
    },

    async executePrefix(message) {
        await startReactionTest(message, false);
    },

    async handleButton(interaction) {
        if (!interaction.isButton()) return false;
        const customId = interaction.customId;
        if (!customId.startsWith('reaction_')) return false;

        const parts = customId.split('_');
        const action = parts[1];
        const gameId = parts.slice(2).join('_');
        const game = games.get(gameId);

        if (!game) {
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ⚡ Reaction Speed\n\n*This game has expired. Start a new one!*`));
            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            return true;
        }

        if (interaction.user.id !== game.playerId) {
            await interaction.reply({ content: 'This is not your game!', flags: MessageFlags.Ephemeral });
            return true;
        }

        if (action === 'early') {
            games.delete(gameId);
            const container = new ContainerBuilder()
                .setAccentColor(0xFF0000)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# ⚡ Reaction Speed\n\n` +
                        `# 😬 Too Early!\n\n` +
                        `You clicked before the button turned green!\n` +
                        `*Try again with \`/reactionspeed\`!*`
                    )
                );
            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            return true;
        }

        if (action === 'go') {
            const reactionTime = Date.now() - game.goTime;
            games.delete(gameId);

            let rating;
            if (reactionTime < 200) rating = '🏆 **Superhuman!**';
            else if (reactionTime < 300) rating = '⚡ **Lightning Fast!**';
            else if (reactionTime < 400) rating = '<:Star:1473038501766369300> **Great!**';
            else if (reactionTime < 500) rating = '<:Checkedbox:1473038547165384804> **Good!**';
            else if (reactionTime < 700) rating = '👍 **Average**';
            else rating = '🐢 **Slow...**';

            const container = new ContainerBuilder()
                .setAccentColor(0x00FF00)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# ⚡ Reaction Speed\n\n` +
                        `# 🎯 ${reactionTime}ms\n\n` +
                        `${rating}\n\n` +
                        `*Try again with \`/reactionspeed\`!*`
                    )
                );
            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            return true;
        }

        return false;
    }
};

async function startReactionTest(context, isInteraction) {
    const authorId = isInteraction ? context.user.id : context.author.id;
    const gameId = `${authorId}_${Date.now()}`;
    const delay = Math.floor(Math.random() * 4000) + 2000;

    const game = {
        id: gameId,
        playerId: authorId,
        goTime: null,
        createdAt: Date.now()
    };
    games.set(gameId, game);

    const waitContainer = new ContainerBuilder()
        .setAccentColor(0xFF0000)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# ⚡ Reaction Speed Test\n\n` +
                `# 🔴 Wait for it...\n\n` +
                `-# Click the button when it turns green!`
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`reaction_early_${gameId}`)
                    .setLabel('Wait...')
                    .setStyle(ButtonStyle.Danger)
            )
        );

    let reply;
    if (isInteraction) {
        reply = await context.reply({ components: [waitContainer], flags: MessageFlags.IsComponentsV2, fetchReply: true });
    } else {
        reply = await context.reply({ components: [waitContainer], flags: MessageFlags.IsComponentsV2 });
    }

    setTimeout(async () => {
        const currentGame = games.get(gameId);
        if (!currentGame) return;

        currentGame.goTime = Date.now();

        const goContainer = new ContainerBuilder()
            .setAccentColor(0x00FF00)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# ⚡ Reaction Speed Test\n\n` +
                    `# 🟢 CLICK NOW!\n\n` +
                    `-# Click as fast as you can!`
                )
            )
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`reaction_go_${gameId}`)
                        .setLabel('CLICK!')
                        .setStyle(ButtonStyle.Success)
                )
            );

        try {
            if (isInteraction) {
                await context.editReply({ components: [goContainer], flags: MessageFlags.IsComponentsV2 });
            } else {
                await reply.edit({ components: [goContainer], flags: MessageFlags.IsComponentsV2 });
            }
        } catch {
            games.delete(gameId);
        }
    }, delay);
}
