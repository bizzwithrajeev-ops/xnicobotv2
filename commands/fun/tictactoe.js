const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const games = new Map();

// Cleanup stale games every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [id, game] of games) {
        if (now - game.createdAt > 10 * 60 * 1000) games.delete(id);
    }
}, 5 * 60 * 1000);

const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6]             // diagonals
];

function checkWin(board, symbol) {
    return winPatterns.some(pattern =>
        pattern.every(i => board[i] === symbol)
    );
}

function checkDraw(board) {
    return board.every(cell => cell !== '⬜');
}

function buildBoardRows(gameId, game, disabled = false) {
    const rows = [];
    for (let i = 0; i < 3; i++) {
        const row = new ActionRowBuilder();
        for (let j = 0; j < 3; j++) {
            const index = i * 3 + j;
            const cell = game.board[index];
            const isEmpty = cell === '⬜';
            const button = new ButtonBuilder()
                .setCustomId(`ttt_${gameId}_${index}`)
                .setStyle(isEmpty ? ButtonStyle.Secondary : (cell === '❌' ? ButtonStyle.Danger : ButtonStyle.Primary))
                .setDisabled(disabled || !isEmpty);
            if (isEmpty) {
                button.setLabel('\u200b');
            } else {
                button.setLabel(' ').setEmoji(cell);
            }
            row.addComponents(button);
        }
        rows.push(row);
    }
    return rows;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tictactoe')
        .setDescription('Challenge someone to a game of Tic Tac Toe')
        .addUserOption(option =>
            option.setName('opponent')
                .setDescription('The user to play against')
                .setRequired(true)),

    prefix: 'tictactoe',
    description: 'Challenge someone to a game of Tic Tac Toe',
    usage: 'tictactoe <@user>',
    category: 'games',
    aliases: ['ttt', 'xo'],

    async execute(interaction) {
        const opponent = interaction.options.getUser('opponent');

        if (opponent.bot) {
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Can't Play Bots\n\nYou cannot play against bots!`)
                );
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        if (opponent.id === interaction.user.id) {
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Can't Play Yourself\n\nYou cannot play against yourself!`)
                );
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const gameId = `${interaction.user.id}-${opponent.id}-${Date.now()}`;
        const board = ['⬜', '⬜', '⬜', '⬜', '⬜', '⬜', '⬜', '⬜', '⬜'];

        const game = {
            board,
            players: [interaction.user.id, opponent.id],
            playerNames: [interaction.user.username, opponent.username],
            currentPlayer: 0,
            symbols: ['❌', '⭕'],
            createdAt: Date.now()
        };
        games.set(gameId, game);

        const rows = buildBoardRows(gameId, game);
        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# ❌⭕ Tic Tac Toe\n\n**${game.playerNames[0]}** (❌) vs **${game.playerNames[1]}** (⭕)\n\n**Current Turn:** ${game.playerNames[0]} (❌)`)
            );
        rows.forEach(row => container.addActionRowComponents(row));

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message) {
        const opponent = message.mentions.users.first();

        if (!opponent) {
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# ❌⭕ Tic Tac Toe\n\n**Usage:** \`-tictactoe @user\`\n\nChallenge someone to a classic game of Tic Tac Toe!\n\n**Example:** \`-tictactoe @Friend\``)
                );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (opponent.bot) {
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Can't Play Bots\n\nYou cannot play against bots!`)
                );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (opponent.id === message.author.id) {
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Can't Play Yourself\n\nYou cannot play against yourself!`)
                );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const gameId = `${message.author.id}-${opponent.id}-${Date.now()}`;
        const board = ['⬜', '⬜', '⬜', '⬜', '⬜', '⬜', '⬜', '⬜', '⬜'];

        const game = {
            board,
            players: [message.author.id, opponent.id],
            playerNames: [message.author.username, opponent.username],
            currentPlayer: 0,
            symbols: ['❌', '⭕'],
            createdAt: Date.now()
        };
        games.set(gameId, game);

        const rows = buildBoardRows(gameId, game);
        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# ❌⭕ Tic Tac Toe\n\n**${game.playerNames[0]}** (❌) vs **${game.playerNames[1]}** (⭕)\n\n**Current Turn:** ${game.playerNames[0]} (❌)`)
            );
        rows.forEach(row => container.addActionRowComponents(row));

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async handleButton(interaction) {
        const customId = interaction.customId;
        if (!customId.startsWith('ttt_')) return false;

        const lastUnderscore = customId.lastIndexOf('_');
        const index = parseInt(customId.slice(lastUnderscore + 1));
        const gameId = customId.slice(4, lastUnderscore);
        const game = games.get(gameId);

        if (!game) {
            await interaction.reply({
                components: [new ContainerBuilder().setAccentColor(0xCAD7E6).addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Game Expired\n\nThis game has expired. Start a new one with `-tictactoe @user`!')
                )],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
            return true;
        }

        if (!game.players.includes(interaction.user.id)) {
            await interaction.reply({
                components: [new ContainerBuilder().setAccentColor(0xCAD7E6).addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Not Your Game\n\nYou are not a player in this game!')
                )],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
            return true;
        }

        if (interaction.user.id !== game.players[game.currentPlayer]) {
            await interaction.reply({
                components: [new ContainerBuilder().setAccentColor(0xCAD7E6).addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Not Your Turn\n\nWait for your opponent to play!')
                )],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
            return true;
        }

        if (game.board[index] !== '⬜') {
            await interaction.deferUpdate();
            return true;
        }

        // Place the symbol
        game.board[index] = game.symbols[game.currentPlayer];
        const currentSymbol = game.symbols[game.currentPlayer];
        const currentPlayerName = game.playerNames[game.currentPlayer];

        try {
            // Check for win
            if (checkWin(game.board, currentSymbol)) {
                const rows = buildBoardRows(gameId, game, true);
                const container = new ContainerBuilder()
                    .setAccentColor(0xCAD7E6)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# ❌⭕ Tic Tac Toe\n\n**${game.playerNames[0]}** (❌) vs **${game.playerNames[1]}** (⭕)\n\n` +
                            `<:Award:1473038391632203887> **${currentPlayerName}** (${currentSymbol}) wins!`
                        )
                    );
                rows.forEach(row => container.addActionRowComponents(row));
                games.delete(gameId);
                await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                return true;
            }

            // Check for draw
            if (checkDraw(game.board)) {
                const rows = buildBoardRows(gameId, game, true);
                const container = new ContainerBuilder()
                    .setAccentColor(0xCAD7E6)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# ❌⭕ Tic Tac Toe\n\n**${game.playerNames[0]}** (❌) vs **${game.playerNames[1]}** (⭕)\n\n` +
                            `🤝 **It's a draw!**`
                        )
                    );
                rows.forEach(row => container.addActionRowComponents(row));
                games.delete(gameId);
                await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                return true;
            }

            // Switch turns
            game.currentPlayer = game.currentPlayer === 0 ? 1 : 0;
            const nextPlayerName = game.playerNames[game.currentPlayer];
            const nextSymbol = game.symbols[game.currentPlayer];

            const rows = buildBoardRows(gameId, game);
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# ❌⭕ Tic Tac Toe\n\n**${game.playerNames[0]}** (❌) vs **${game.playerNames[1]}** (⭕)\n\n` +
                        `**Current Turn:** ${nextPlayerName} (${nextSymbol})`
                    )
                );
            rows.forEach(row => container.addActionRowComponents(row));

            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (e) {
            if (e.code !== 10008 && e.code !== 40060) console.error('TicTacToe update error:', e);
        }
        return true;
    }
};
