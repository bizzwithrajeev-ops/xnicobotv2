const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const suits = ['♠', '♥', '♦', '♣'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const games = new Map();

// Cleanup stale games every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [id, game] of games) {
        if (now - game.createdAt > 10 * 60 * 1000) games.delete(id);
    }
}, 5 * 60 * 1000);

function drawCard() {
    const suit = suits[Math.floor(Math.random() * suits.length)];
    const rank = ranks[Math.floor(Math.random() * ranks.length)];
    return { suit, rank, display: `${rank}${suit}` };
}

function calculateHand(cards) {
    let total = 0;
    let aces = 0;
    for (const card of cards) {
        if (card.rank === 'A') { total += 11; aces++; }
        else if (['K', 'Q', 'J'].includes(card.rank)) total += 10;
        else total += parseInt(card.rank);
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
}

function formatCards(cards) {
    return cards.map(c => `\`${c.display}\``).join(' ');
}

function buildGameContainer(game, hideDealer = true, resultText = null) {
    const playerTotal = calculateHand(game.playerCards);
    const dealerTotal = hideDealer ? calculateHand([game.dealerCards[0]]) : calculateHand(game.dealerCards);
    const dealerDisplay = hideDealer ? `${formatCards([game.dealerCards[0]])} \`??\`` : formatCards(game.dealerCards);
    const dealerTotalDisplay = hideDealer ? '?' : dealerTotal;

    let content = `# 🃏 Blackjack\n\n`;
    content += `**Dealer's Hand** (${dealerTotalDisplay})\n`;
    content += `> ${dealerDisplay}\n\n`;
    content += `**Your Hand** (${playerTotal})\n`;
    content += `> ${formatCards(game.playerCards)}`;

    if (resultText) content += `\n\n${resultText}`;

    let accentColor = 0x2B2D31;
    if (resultText) {
        if (resultText.includes('You Win') || resultText.includes('Blackjack')) accentColor = 0x00FF00;
        else if (resultText.includes('Bust') || resultText.includes('Dealer Wins')) accentColor = 0xFF0000;
        else if (resultText.includes('Push')) accentColor = 0xFFA500;
    }

    return { content, accentColor };
}

function buildActionRow(gameId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`bj_${gameId}_hit`).setLabel('Hit').setEmoji('🃏').setStyle(ButtonStyle.Primary).setDisabled(disabled),
        new ButtonBuilder().setCustomId(`bj_${gameId}_stand`).setLabel('Stand').setEmoji('✋').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
    );
}

function startGame(playerId) {
    const gameId = `${playerId}-${Date.now()}`;
    const game = {
        playerCards: [drawCard(), drawCard()],
        dealerCards: [drawCard(), drawCard()],
        playerId,
        createdAt: Date.now(),
        finished: false
    };
    games.set(gameId, game);

    // Check for natural blackjack
    const playerTotal = calculateHand(game.playerCards);
    const dealerTotal = calculateHand(game.dealerCards);

    if (playerTotal === 21 && dealerTotal === 21) {
        game.finished = true;
        const { content, accentColor } = buildGameContainer(game, false, '🤝 **Push!** Both have Blackjack!');
        const container = new ContainerBuilder().setAccentColor(accentColor)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
            .addActionRowComponents(buildActionRow(gameId, true));
        games.delete(gameId);
        return { container };
    }

    if (playerTotal === 21) {
        game.finished = true;
        const { content, accentColor } = buildGameContainer(game, false, '🎉 **Blackjack! You Win!**');
        const container = new ContainerBuilder().setAccentColor(accentColor)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
            .addActionRowComponents(buildActionRow(gameId, true));
        games.delete(gameId);
        return { container };
    }

    const { content, accentColor } = buildGameContainer(game, true);
    const container = new ContainerBuilder().setAccentColor(accentColor)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .addActionRowComponents(buildActionRow(gameId));
    return { container };
}

function dealerPlay(game) {
    while (calculateHand(game.dealerCards) < 17) {
        game.dealerCards.push(drawCard());
    }
}

function resolveGame(game, gameId) {
    dealerPlay(game);
    game.finished = true;

    const playerTotal = calculateHand(game.playerCards);
    const dealerTotal = calculateHand(game.dealerCards);
    let resultText;

    if (dealerTotal > 21) resultText = '<:Award:1473038391632203887> **You Win!** Dealer busted with ' + dealerTotal + '!';
    else if (playerTotal > dealerTotal) resultText = '<:Award:1473038391632203887> **You Win!** ' + playerTotal + ' vs ' + dealerTotal;
    else if (dealerTotal > playerTotal) resultText = '<:Cancel:1473037949187657818> **Dealer Wins!** ' + dealerTotal + ' vs ' + playerTotal;
    else resultText = '🤝 **Push!** Both have ' + playerTotal;

    const { content, accentColor } = buildGameContainer(game, false, resultText);
    const container = new ContainerBuilder().setAccentColor(accentColor)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .addActionRowComponents(buildActionRow(gameId, true));
    games.delete(gameId);
    return { container };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Play a game of Blackjack against the dealer'),
    prefix: 'blackjack',
    description: 'Play a game of Blackjack against the dealer!',
    usage: 'blackjack',
    category: 'games',
    aliases: ['bj', '21'],

    async execute(interaction) {
        const { container } = startGame(interaction.user.id);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message) {
        const { container } = startGame(message.author.id);
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async handleButton(interaction) {
        const customId = interaction.customId;
        if (!customId.startsWith('bj_')) return false;

        const lastUnderscore = customId.lastIndexOf('_');
        const action = customId.slice(lastUnderscore + 1);
        const gameId = customId.slice(3, lastUnderscore);
        const game = games.get(gameId);

        if (!game) {
            await interaction.reply({
                components: [new ContainerBuilder().setAccentColor(0xCAD7E6).addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Game Expired\n\nThis game has expired. Start a new one with `-blackjack`!')
                )],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
            return true;
        }

        if (interaction.user.id !== game.playerId) {
            await interaction.reply({
                components: [new ContainerBuilder().setAccentColor(0xCAD7E6).addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Not Your Game\n\nThis is not your game! Start your own with `-blackjack`')
                )],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
            return true;
        }

        if (game.finished) {
            await interaction.deferUpdate();
            return true;
        }

        try {
            if (action === 'hit') {
                game.playerCards.push(drawCard());
                const playerTotal = calculateHand(game.playerCards);

                if (playerTotal > 21) {
                    game.finished = true;
                    const { content, accentColor } = buildGameContainer(game, false, `<:Cancel:1473037949187657818> **Bust!** You went over with ${playerTotal}!`);
                    const container = new ContainerBuilder().setAccentColor(accentColor)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
                        .addActionRowComponents(buildActionRow(gameId, true));
                    games.delete(gameId);
                    await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                } else if (playerTotal === 21) {
                    // Auto-stand on 21
                    const { container } = resolveGame(game, gameId);
                    await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                } else {
                    const { content, accentColor } = buildGameContainer(game, true);
                    const container = new ContainerBuilder().setAccentColor(accentColor)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
                        .addActionRowComponents(buildActionRow(gameId));
                    await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                }
            } else if (action === 'stand') {
                const { container } = resolveGame(game, gameId);
                await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
        } catch (e) {
            if (e.code !== 10008 && e.code !== 40060) console.error('Blackjack update error:', e);
        }

        return true;
    }
};
