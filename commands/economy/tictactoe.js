'use strict';

/**
 * Tic-Tac-Toe — bet vs the bot.
 *
 * Pay model: bet up-front, win pays 2×, draw refunds the bet, loss
 * keeps the deduction. The original umbrella version used a perfect
 * minimax bot — the player could only tie or lose, which is the
 * opposite of fair gambling. Here the bot picks the optimal move
 * 60% of the time and a random move 40% of the time so the player
 * actually has a chance to win.
 *
 * One game per user at a time. State auto-expires after 10 minutes.
 */

const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags
} = require('discord.js');
const economyManager = require('../../utils/economyManager');
const { parseBet, getBalance, MAX_BET } = require('../../utils/betHelper');
const { gamblingGuard } = require('../../utils/economyGuards');
const { formatCoinsShort } = require('../../utils/currencyHelper');

const games = new Map();
setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [id, g] of games) if (g.createdAt < cutoff) games.delete(id);
}, 5 * 60 * 1000);

const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

function winner(board) {
    for (const [a,b,c] of LINES) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    return null;
}

function isFull(board) { return board.every(Boolean); }

/**
 * Minimax for the optimal bot move. Returns the index of the cell
 * the bot should play to maximise its chance of winning.
 */
function bestMove(board) {
    let best = -Infinity, move = -1;
    for (let i = 0; i < 9; i++) {
        if (board[i]) continue;
        board[i] = 'O';
        const score = minimax(board, false);
        board[i] = null;
        if (score > best) { best = score; move = i; }
    }
    return move;
}

function minimax(board, isMax) {
    const w = winner(board);
    if (w === 'O') return 10;
    if (w === 'X') return -10;
    if (isFull(board)) return 0;
    let best = isMax ? -Infinity : Infinity;
    for (let i = 0; i < 9; i++) {
        if (board[i]) continue;
        board[i] = isMax ? 'O' : 'X';
        const s = minimax(board, !isMax);
        board[i] = null;
        best = isMax ? Math.max(best, s) : Math.min(best, s);
    }
    return best;
}

function botMove(board) {
    // Beatable: 60% optimal, 40% random.
    if (Math.random() < 0.6) return bestMove(board);
    const empty = board.map((v, i) => v ? -1 : i).filter(i => i !== -1);
    return empty[Math.floor(Math.random() * empty.length)];
}

function settle(userId, bet, payout) {
    const economy = economyManager.loadEconomy();
    const { userData } = economyManager.getUser(economy, userId);
    if (payout > 0) {
        userData.coins += payout;
        if (payout > bet) userData.totalWon = (userData.totalWon || 0) + (payout - bet);
    }
    if (payout < bet) {
        userData.totalLost = (userData.totalLost || 0) + (bet - payout);
    }
    economyManager.addXP(economy, userId, payout > bet ? 6 : 2);
    economyManager.checkAllAchievements(economy, userId);
    economyManager.saveEconomy(economy);
    return userData;
}

function buildContainer(game, payoutInfo = null) {
    const w = winner(game.board);
    const draw = !w && isFull(game.board);

    let header;
    let accent = 0xCAD7E6;
    if (w === 'X')      { header = `### 🏆 You Win!`;          accent = 0x57F287; }
    else if (w === 'O') { header = `### 🤖 Bot Wins!`;         accent = 0xED4245; }
    else if (draw)      { header = `### 🤝 Draw — bet refunded.`; accent = 0xFEE75C; }
    else                { header = `**You are X** — click a cell to play!`; }

    let content = `# ✖⭕ Tic-Tac-Toe\n\n`;
    content += `**Bet:** ${formatCoinsShort(game.bet, game.guildId)}\n\n${header}`;
    if (payoutInfo) content += `\n\n${payoutInfo}`;

    const c = new ContainerBuilder()
        .setAccentColor(accent)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

    const styles = { X: ButtonStyle.Danger, O: ButtonStyle.Primary };
    const labels = { X: 'X', O: 'O' };
    for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let col = 0; col < 3; col++) {
            const i = r * 3 + col;
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`ttt_${game.id}_${i}`)
                    .setLabel(game.board[i] ? labels[game.board[i]] : '·')
                    .setStyle(game.board[i] ? styles[game.board[i]] : ButtonStyle.Secondary)
                    .setDisabled(!!game.board[i] || game.finished)
            );
        }
        c.addActionRowComponents(row);
    }
    return c;
}

function startGame(userId, guildId, bet) {
    const economy = economyManager.loadEconomy();
    const { userData } = economyManager.getUser(economy, userId);
    userData.coins -= bet;
    userData.totalGambled = (userData.totalGambled || 0) + bet;
    economyManager.saveEconomy(economy);

    const id = `${userId}-${Date.now()}`;
    const game = {
        id, playerId: userId, guildId, bet,
        board: Array(9).fill(null),
        finished: false,
        createdAt: Date.now()
    };
    games.set(id, game);
    return buildContainer(game);
}

async function runStart(reply, userId, guildId, args) {
    const balance = getBalance(userId);
    const betResult = parseBet(args[0], balance);
    if (!betResult.valid) return reply(betResult.error);

    for (const g of games.values()) {
        if (g.playerId === userId && !g.finished) {
            const c = new ContainerBuilder().setAccentColor(0xFEE75C)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `<:Infotriangle:1473038460456800459> Finish your active tic-tac-toe game first.`
                ));
            return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
        }
    }
    const container = startGame(userId, guildId, betResult.amount);
    return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tictactoe')
        .setDescription('Tic-Tac-Toe vs the bot — bet your coins')
        .addStringOption(o => o.setName('bet').setDescription(`Amount to bet (max ${MAX_BET.toLocaleString()}) or "all"`).setRequired(true)),
    prefix: 'tictactoe',
    aliases: ['ttt'],
    description: 'Bet vs the bot — win pays 2×, draw refunds.',
    usage: 'tictactoe <bet>',
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
        if (!customId.startsWith('ttt_')) return false;

        const lastUnderscore = customId.lastIndexOf('_');
        const cellIdx = parseInt(customId.slice(lastUnderscore + 1), 10);
        const gameId  = customId.slice(4, lastUnderscore);
        const game = games.get(gameId);

        if (!game) {
            await interaction.reply({
                components: [new ContainerBuilder().setAccentColor(0xCAD7E6)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Game Expired'))],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            }).catch(() => {});
            return true;
        }
        if (interaction.user.id !== game.playerId) {
            await interaction.reply({ content: '<:Cancel:1473037949187657818> Not your game.', flags: MessageFlags.Ephemeral }).catch(() => {});
            return true;
        }
        if (game.finished || game.board[cellIdx]) {
            await interaction.deferUpdate().catch(() => {});
            return true;
        }

        // Player move
        game.board[cellIdx] = 'X';
        let w = winner(game.board);
        if (!w && !isFull(game.board)) {
            const m = botMove(game.board);
            if (m !== -1) game.board[m] = 'O';
            w = winner(game.board);
        }

        let payout = null, info = null;
        if (w === 'X') {
            payout = game.bet * 2;
            info = `<:Checkedbox:1473038547165384804> +${formatCoinsShort(game.bet, game.guildId)} profit`;
        } else if (w === 'O') {
            payout = 0;
            info = `<:Cancel:1473037949187657818> Lost ${formatCoinsShort(game.bet, game.guildId)}`;
        } else if (isFull(game.board)) {
            payout = game.bet;
            info = `🤝 Bet of ${formatCoinsShort(game.bet, game.guildId)} refunded`;
        }

        if (payout !== null) {
            game.finished = true;
            settle(game.playerId, game.bet, payout);
            games.delete(gameId);
        }

        const container = buildContainer(game, info);
        try {
            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (e) {
            if (e.code !== 10008 && e.code !== 40060) console.error('[TicTacToe] update error:', e);
        }
        return true;
    }
};
