const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags
} = require('discord.js');

const games = new Map();

const COLS      = 5;
const ROWS      = 6;
const CELL_EMPTY = 0;
const CELL_P1    = 1;
const CELL_P2    = 2;
const BLANK      = '⠀'; // Braille blank — renders as visually empty button

function createBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(CELL_EMPTY));
}

// Returns the row index where a piece would land if dropped into col, or -1 if full
function landingRow(board, col) {
    for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][col] === CELL_EMPTY) return r;
    }
    return -1;
}

function dropPiece(board, col, who) {
    const r = landingRow(board, col);
    if (r !== -1) board[r][col] = who;
    return r;
}

function isBoardFull(board) {
    return board[0].every(cell => cell !== CELL_EMPTY);
}

function checkWin(board, row, col, who) {
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    for (const [dr, dc] of dirs) {
        let n = 1;
        for (const s of [1,-1]) {
            let r = row + dr*s, c = col + dc*s;
            while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === who) {
                n++; r += dr*s; c += dc*s;
            }
        }
        if (n >= 4) return true;
    }
    return false;
}

/*
 * Build the 6×5 button grid that IS the board.
 *
 * Rules per cell:
 *  - Filled P1     → Danger (red),   emoji 🔴, disabled
 *  - Filled P2     → Success (green), emoji 🟢, disabled
 *  - Landing slot  → Primary (blue),  emoji = current player's piece, ENABLED  ← the only clickable cells
 *  - Other empty   → Secondary (grey), blank label, disabled
 *  - gameOver=true → all disabled, landing slots shown as grey/blank
 *
 * Each button has a unique ID: c4_r{row}_c{col}
 * On click, the COLUMN is extracted — piece always falls to the landing slot.
 */
function buildBoardRows(board, currentWho, gameOver = false) {
    // Pre-compute landing rows so we do it once
    const landing = Array.from({ length: COLS }, (_, c) => gameOver ? -1 : landingRow(board, c));

    const rows = [];
    for (let r = 0; r < ROWS; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < COLS; c++) {
            const cell = board[r][c];
            const btn  = new ButtonBuilder().setCustomId(`c4_r${r}_c${c}`);

            if (cell === CELL_P1) {
                btn.setStyle(ButtonStyle.Danger).setEmoji('🔴').setDisabled(true);
            } else if (cell === CELL_P2) {
                btn.setStyle(ButtonStyle.Success).setEmoji('🟢').setDisabled(true);
            } else if (!gameOver && landing[c] === r) {
                // This is exactly where the next piece lands — make it the interactive target
                const emoji = currentWho === CELL_P1 ? '🔴' : '🟢';
                btn.setStyle(ButtonStyle.Primary).setEmoji(emoji).setDisabled(false);
            } else {
                btn.setStyle(ButtonStyle.Secondary).setLabel(BLANK).setDisabled(true);
            }

            row.addComponents(btn);
        }
        rows.push(row);
    }
    return rows;
}

/*
 * Container layout (exactly 40 components — Discord's hard cap):
 *   1  ContainerBuilder
 *   1  TextDisplay  (title + players)
 *   1  Separator
 *   1  TextDisplay  (turn indicator)
 *   6  ActionRows × (1 row + 5 buttons) = 36
 *   ─────────────────────────────────────
 *   40 total
 */
function buildGameContainer(player1, player2, board, currentTurn, player1Id) {
    const isP1        = currentTurn === player1Id;
    const currentWho  = isP1 ? CELL_P1 : CELL_P2;
    const turnEmoji   = isP1 ? '🔴' : '🟢';
    const turnName    = (isP1 ? player1 : player2).displayName ?? (isP1 ? player1 : player2).username;
    const accentColor = isP1 ? 0xE74C3C : 0x2ECC71;

    const p1name = player1.displayName ?? player1.username;
    const p2name = player2.displayName ?? player2.username;

    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## 🎮  Connect 4\n🔴 **${p1name}**  ─  🟢 **${p2name}**`
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `${turnEmoji} **${turnName}**'s turn  •  click a highlighted button to drop`
            )
        );

    for (const row of buildBoardRows(board, currentWho)) {
        container.addActionRowComponents(row);
    }

    return container;
}

function buildEndContainer(player1, player2, board, headline, accentColor) {
    const p1name = player1.displayName ?? player1.username;
    const p2name = player2.displayName ?? player2.username;

    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## 🎮  Connect 4\n🔴 **${p1name}**  ─  🟢 **${p2name}**`
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(headline)
        );

    for (const row of buildBoardRows(board, CELL_EMPTY, true)) {
        container.addActionRowComponents(row);
    }

    return container;
}

function errContainer(text) {
    return new ContainerBuilder()
        .setAccentColor(0x95A5A6)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(text)
        );
}

async function startGame(source, player1, opponent) {
    const isInteraction = !!source.options;
    const gameId        = `${source.channel.id}-${Date.now()}`;
    const board         = createBoard();
    const game          = { player1Id: player1.id, player2Id: opponent.id, currentTurn: player1.id, board, gameId };
    games.set(gameId, game);

    const container = buildGameContainer(player1, opponent, board, player1.id, player1.id);
    let msg;
    if (isInteraction) {
        msg = await source.reply({ components: [container], flags: MessageFlags.IsComponentsV2, fetchReply: true });
    } else {
        msg = await source.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    setupCollector(msg, game, player1, opponent, gameId);
}

function setupCollector(msg, game, player1, opponent, gameId) {
    const collector = msg.createMessageComponentCollector({
        filter: i => i.customId.startsWith('c4_r') && [game.player1Id, game.player2Id].includes(i.user.id),
        time: 300_000
    });

    collector.on('collect', async i => {
        try {
            // Wrong turn
            if (i.user.id !== game.currentTurn) {
                return i.reply({
                    components: [errContainer(`## ⛔  Not Your Turn\nWait for **${(i.user.id === game.player1Id ? opponent : player1).displayName ?? (i.user.id === game.player1Id ? opponent : player1).username}** to play.`)],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
                });
            }

            // Parse column from ID: "c4_r{r}_c{c}" → split('_') → ['c4','r#','c#'] → index 2 = 'c#'
            const col  = parseInt(i.customId.split('_')[2].slice(1));
            const isP1 = i.user.id === game.player1Id;
            const who  = isP1 ? CELL_P1 : CELL_P2;
            const row  = dropPiece(game.board, col, who);

            if (row === -1) {
                return i.reply({
                    components: [errContainer(`## ⛔  Column Full\nThat column is full — choose another!`)],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
                });
            }

            // Win check
            if (checkWin(game.board, row, col, who)) {
                const winner = isP1 ? player1 : opponent;
                const loser  = isP1 ? opponent : player1;
                const wEmoji = isP1 ? '🔴' : '🟢';
                const wName  = winner.displayName ?? winner.username;
                const lName  = loser.displayName  ?? loser.username;
                await i.update({
                    components: [buildEndContainer(
                        player1, opponent, game.board,
                        `## 🏆  ${wEmoji} ${wName} wins!\nDefeated **${lName}** — well played!`,
                        isP1 ? 0xE74C3C : 0x2ECC71
                    )],
                    flags: MessageFlags.IsComponentsV2
                });
                games.delete(gameId);
                collector.stop('win');
                return;
            }

            // Draw check
            if (isBoardFull(game.board)) {
                await i.update({
                    components: [buildEndContainer(
                        player1, opponent, game.board,
                        `## 🤝  Draw!\nNo moves left — great match by both sides!`,
                        0x7F8C8D
                    )],
                    flags: MessageFlags.IsComponentsV2
                });
                games.delete(gameId);
                collector.stop('draw');
                return;
            }

            // Next turn
            game.currentTurn = isP1 ? game.player2Id : game.player1Id;
            await i.update({
                components: [buildGameContainer(player1, opponent, game.board, game.currentTurn, game.player1Id)],
                flags: MessageFlags.IsComponentsV2
            });

        } catch (err) {
            console.error('[Connect4]', err);
            if (!i.replied && !i.deferred) {
                await i.reply({
                    components: [errContainer(`## ⚠️  Error\nSomething went wrong — please try again.`)],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
                }).catch(() => {});
            }
        }
    });

    collector.on('end', async (_, reason) => {
        if (reason === 'win' || reason === 'draw') return;
        await msg.edit({
            components: [buildEndContainer(
                player1, opponent, game.board,
                `## ⏱️  Timed Out\nGame ended due to inactivity.`,
                0x7F8C8D
            )],
            flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
        games.delete(gameId);
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('connect4')
        .setDescription('Challenge someone to a game of Connect 4')
        .addUserOption(opt =>
            opt.setName('opponent')
                .setDescription('The user you want to play against')
                .setRequired(true)
        ),

    prefix: 'connect4',
    description: 'Challenge someone to a game of Connect 4',
    usage: 'connect4 <@user>',
    category: 'games',
    aliases: ['c4'],

    async execute(interaction) {
        const opponent = interaction.options.getUser('opponent');
        if (opponent.id === interaction.user.id)
            return interaction.reply({ components: [errContainer(`## ⛔  Invalid\nYou can't play against yourself!`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        if (opponent.bot)
            return interaction.reply({ components: [errContainer(`## ⛔  Invalid\nYou can't play against a bot!`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        await startGame(interaction, interaction.user, opponent);
    },

    async executePrefix(message, args) {
        const opponent = message.mentions.users.first();
        if (!opponent)
            return message.reply({ components: [errContainer(`## ⛔  Missing Opponent\nMention a user to play with!\n**Usage:** \`-connect4 @user\``)], flags: MessageFlags.IsComponentsV2 });
        if (opponent.id === message.author.id)
            return message.reply({ components: [errContainer(`## ⛔  Invalid\nYou can't play against yourself!`)], flags: MessageFlags.IsComponentsV2 });
        if (opponent.bot)
            return message.reply({ components: [errContainer(`## ⛔  Invalid\nYou can't play against a bot!`)], flags: MessageFlags.IsComponentsV2 });
        await startGame(message, message.author, opponent);
    }
};
