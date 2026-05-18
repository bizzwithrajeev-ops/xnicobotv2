'use strict';

/**
 * Connect 4 — bet vs the bot.
 *
 * Pay model: bet up-front, win pays 2×, draw refunds, loss keeps
 * the bet. The original umbrella version used a defensive heuristic
 * bot that was very hard to beat. This version softens the bot to
 * give the player a fair shot:
 *   - 70% picks the strongest move (winning move > blocking move >
 *     centre-priority).
 *   - 30% picks any random legal column.
 *
 * The board is 6 rows × 7 columns. Custom IDs encode the gameId so
 * a stale message's buttons can be ignored after expiry.
 */

const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags
} = require('discord.js');
const { parseBet, getBalance, MAX_BET } = require('../../utils/betHelper');
const { gamblingGuard } = require('../../utils/economyGuards');
const { formatCoinsShort } = require('../../utils/currencyHelper');
const { deductBet, settle } = require('../../utils/betGameHelper');

const ROWS = 6, COLS = 7;
const games = new Map();
setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [id, g] of games) if (g.createdAt < cutoff) games.delete(id);
}, 5 * 60 * 1000);

function drop(board, col, piece) {
    for (let r = ROWS - 1; r >= 0; r--) {
        if (!board[r][col]) { board[r][col] = piece; return r; }
    }
    return -1;
}

function checkWin(board, piece) {
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c <= COLS - 4; c++)
            if ([0,1,2,3].every(i => board[r][c + i] === piece)) return true;
    for (let r = 0; r <= ROWS - 4; r++)
        for (let c = 0; c < COLS; c++)
            if ([0,1,2,3].every(i => board[r + i][c] === piece)) return true;
    for (let r = 3; r < ROWS; r++)
        for (let c = 0; c <= COLS - 4; c++)
            if ([0,1,2,3].every(i => board[r - i][c + i] === piece)) return true;
    for (let r = 0; r <= ROWS - 4; r++)
        for (let c = 0; c <= COLS - 4; c++)
            if ([0,1,2,3].every(i => board[r + i][c + i] === piece)) return true;
    return false;
}

function isFull(board) { return board.every(row => row.every(Boolean)); }

function botMove(board) {
    const canDrop = c => board[0][c] === null;
    const tryDrop = (c, piece) => {
        const b = board.map(r => [...r]);
        drop(b, c, piece);
        return b;
    };
    if (Math.random() < 0.7) {
        // 1) Win this move if possible
        for (let c = 0; c < COLS; c++) {
            if (canDrop(c) && checkWin(tryDrop(c, 'Y'), 'Y')) return c;
        }
        // 2) Block player's winning move
        for (let c = 0; c < COLS; c++) {
            if (canDrop(c) && checkWin(tryDrop(c, 'R'), 'R')) return c;
        }
        // 3) Centre priority
        const order = [3, 2, 4, 1, 5, 0, 6];
        return order.find(c => canDrop(c)) ?? -1;
    }
    // 30% random legal
    const legal = Array.from({ length: COLS }, (_, i) => canDrop(i) ? i : -1).filter(i => i !== -1);
    return legal.length === 0 ? -1 : legal[Math.floor(Math.random() * legal.length)];
}

function buildContainer(game, payoutInfo = null) {
    const EMPTY = '⬜', RED = '🔴', YELLOW = '🟡';
    const display = game.board.map(row =>
        row.map(cell => cell === 'R' ? RED : cell === 'Y' ? YELLOW : EMPTY).join('')
    ).join('\n') + '\n1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣';

    let header;
    if (game.status === 'won' && game.winner === 'R') header = `### 🏆 You Win!`;
    else if (game.status === 'won' && game.winner === 'Y') header = `### 🤖 Bot Wins.`;
    else if (game.status === 'draw')                       header = `### 🤝 Draw — bet refunded.`;
    else header = `Drop your piece — get 4 in a row!\n-# 🔴 You  •  🟡 Bot`;

    let content = `# 🔵 Connect 4\n\n**Bet:** ${formatCoinsShort(game.bet, game.guildId)}\n\n${header}\n\n${display}`;
    if (payoutInfo) content += `\n\n${payoutInfo}`;

    const accent = (game.status === 'won' && game.winner === 'R') ? 0x57F287
        : (game.status === 'won' && game.winner === 'Y') ? 0xED4245
        : game.status === 'draw' ? 0xFEE75C
        : 0xCAD7E6;

    const c = new ContainerBuilder()
        .setAccentColor(accent)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

    if (game.status === 'playing') {
        c.addActionRowComponents(new ActionRowBuilder().addComponents(
            ...[0,1,2,3,4].map(col =>
                new ButtonBuilder()
                    .setCustomId(`c4_${game.id}_${col}`)
                    .setLabel(String(col + 1))
                    .setStyle(game.board[0][col] ? ButtonStyle.Secondary : ButtonStyle.Primary)
                    .setDisabled(!!game.board[0][col])
            )
        ));
        c.addActionRowComponents(new ActionRowBuilder().addComponents(
            ...[5, 6].map(col =>
                new ButtonBuilder()
                    .setCustomId(`c4_${game.id}_${col}`)
                    .setLabel(String(col + 1))
                    .setStyle(game.board[0][col] ? ButtonStyle.Secondary : ButtonStyle.Primary)
                    .setDisabled(!!game.board[0][col])
            )
        ));
    }
    return c;
}

function startGame(userId, guildId, bet) {
    deductBet(userId, bet);
    const id = `${userId}-${Date.now()}`;
    const game = {
        id, playerId: userId, guildId, bet,
        board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
        status: 'playing', winner: null,
        createdAt: Date.now()
    };
    games.set(id, game);
    return buildContainer(game);
}

async function runStart(reply, userId, guildId, args) {
    const balance = getBalance(userId);
    const r = parseBet(args[0], balance);
    if (!r.valid) return reply(r.error);

    for (const g of games.values()) {
        if (g.playerId === userId && g.status === 'playing') {
            const c = new ContainerBuilder().setAccentColor(0xFEE75C)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `<:Infotriangle:1473038460456800459> Finish your active connect-4 game first.`
                ));
            return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
        }
    }
    return reply({ components: [startGame(userId, guildId, r.amount)], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('connect4')
        .setDescription('Connect 4 vs the bot — bet your coins')
        .addStringOption(o => o.setName('bet').setDescription(`Amount to bet (max ${MAX_BET.toLocaleString()}) or "all"`).setRequired(true)),
    prefix: 'connect4',
    aliases: ['c4', 'connectfour'],
    description: 'Bet vs the bot — win pays 2×, draw refunds.',
    usage: 'connect4 <bet>',
    category: 'economy',

    async execute(interaction) {
        if (await gamblingGuard(interaction)) return;
        return runStart(o => interaction.reply(o), interaction.user.id, interaction.guild?.id, [interaction.options.getString('bet')]);
    },
    async executePrefix(message, args) {
        if (await gamblingGuard(message)) return;
        return runStart(o => message.reply(o), message.author.id, message.guild?.id, args);
    },

    async handleButton(interaction) {
        const customId = interaction.customId;
        if (!customId.startsWith('c4_')) return false;

        const lastUnderscore = customId.lastIndexOf('_');
        const col = parseInt(customId.slice(lastUnderscore + 1), 10);
        const gameId = customId.slice(3, lastUnderscore);
        const game = games.get(gameId);

        if (!game || game.status !== 'playing') {
            await interaction.deferUpdate().catch(() => {});
            return true;
        }
        if (interaction.user.id !== game.playerId) {
            await interaction.reply({ content: '<:Cancel:1473037949187657818> Not your game.', flags: MessageFlags.Ephemeral }).catch(() => {});
            return true;
        }

        if (drop(game.board, col, 'R') === -1) {
            await interaction.deferUpdate().catch(() => {});
            return true;
        }

        let info = null;
        let payout = null;

        if (checkWin(game.board, 'R')) {
            game.status = 'won'; game.winner = 'R';
            payout = game.bet * 2;
            info = `<:Checkedbox:1473038547165384804> +${formatCoinsShort(game.bet, game.guildId)} profit`;
        } else if (isFull(game.board)) {
            game.status = 'draw';
            payout = game.bet;
            info = `🤝 Bet refunded.`;
        } else {
            const bc = botMove(game.board);
            if (bc !== -1) drop(game.board, bc, 'Y');
            if (checkWin(game.board, 'Y')) {
                game.status = 'won'; game.winner = 'Y';
                payout = 0;
                info = `<:Cancel:1473037949187657818> Lost ${formatCoinsShort(game.bet, game.guildId)}`;
            } else if (isFull(game.board)) {
                game.status = 'draw';
                payout = game.bet;
                info = `🤝 Bet refunded.`;
            }
        }

        if (payout !== null) {
            settle(game.playerId, game.bet, payout);
            games.delete(gameId);
        }

        try {
            await interaction.update({ components: [buildContainer(game, info)], flags: MessageFlags.IsComponentsV2 });
        } catch (e) {
            if (e.code !== 10008 && e.code !== 40060) console.error('[Connect4] update error:', e);
        }
        return true;
    }
};
