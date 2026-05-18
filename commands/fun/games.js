'use strict';
const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
} = require('discord.js');

const CV2 = MessageFlags.IsComponentsV2;

// ── In-memory game state store (30-min TTL) ──────────────────────────────────
const gameStates = new Map();
const STATE_TTL = 30 * 60_000;

function setGame(key, data) {
    gameStates.set(key, { ...data, expiresAt: Date.now() + STATE_TTL });
    setTimeout(() => gameStates.delete(key), STATE_TTL);
}

function getGame(key) {
    const g = gameStates.get(key);
    if (!g || Date.now() > g.expiresAt) { gameStates.delete(key); return null; }
    return g;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MINESWEEPER — 5×5 grid, 5 mines
// ═══════════════════════════════════════════════════════════════════════════════
const MSW_ROWS = 5, MSW_COLS = 5, MSW_MINES = 5;

function mswNewState() {
    const grid = Array.from({ length: MSW_ROWS }, () =>
        Array.from({ length: MSW_COLS }, () =>
            ({ mine: false, revealed: false, flagged: false, adjacent: 0 })
        )
    );
    let placed = 0;
    while (placed < MSW_MINES) {
        const r = Math.floor(Math.random() * MSW_ROWS);
        const c = Math.floor(Math.random() * MSW_COLS);
        if (!grid[r][c].mine) { grid[r][c].mine = true; placed++; }
    }
    for (let r = 0; r < MSW_ROWS; r++) {
        for (let c = 0; c < MSW_COLS; c++) {
            if (grid[r][c].mine) continue;
            let n = 0;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = r + dr, nc = c + dc;
                    if (nr >= 0 && nr < MSW_ROWS && nc >= 0 && nc < MSW_COLS && grid[nr][nc].mine) n++;
                }
            }
            grid[r][c].adjacent = n;
        }
    }
    return { type: 'msw', grid, status: 'playing' };
}

function mswFloodFill(grid, r, c) {
    if (r < 0 || r >= MSW_ROWS || c < 0 || c >= MSW_COLS) return;
    const cell = grid[r][c];
    if (cell.revealed || cell.flagged || cell.mine) return;
    cell.revealed = true;
    if (cell.adjacent === 0) {
        for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++)
                mswFloodFill(grid, r + dr, c + dc);
    }
}

function mswCheckWin(grid) {
    return grid.every(row => row.every(c => c.mine || c.revealed));
}

function mswBuildContainer(msgId, state) {
    const { grid, status } = state;
    const flagged = grid.flat().filter(c => c.flagged).length;

    let header;
    if (status === 'won')  header = `## 💣 Minesweeper\n### 🏆 You Won! All safe cells revealed!`;
    else if (status === 'lost') header = `## 💣 Minesweeper\n### 💥 Boom! You hit a mine!`;
    else header = `## 💣 Minesweeper  •  5×5  •  ${MSW_MINES} mines\nClick cells to reveal. Numbers = adjacent mines.\n-# 💣 Mines: **${MSW_MINES}**  •  🚩 Flagged: **${flagged}**  •  Right-click not available — type \`flag\` command to toggle`;

    const c = new ContainerBuilder()
        .setAccentColor(status === 'won' ? 0x57F287 : status === 'lost' ? 0xED4245 : 0x5865F2)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(header))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    for (let r = 0; r < MSW_ROWS; r++) {
        const btns = [];
        for (let col = 0; col < MSW_COLS; col++) {
            const cell = grid[r][col];
            let label, style, disabled = status !== 'playing';
            if (status !== 'playing') {
                if (cell.mine && cell.revealed) { label = '💥'; style = ButtonStyle.Danger; }
                else if (cell.mine)             { label = '💣'; style = ButtonStyle.Danger; }
                else if (cell.adjacent > 0)     { label = String(cell.adjacent); style = ButtonStyle.Secondary; }
                else                             { label = '·'; style = ButtonStyle.Secondary; }
            } else if (cell.revealed) {
                label   = cell.adjacent > 0 ? String(cell.adjacent) : '·';
                style   = ButtonStyle.Secondary;
                disabled = true;
            } else if (cell.flagged) {
                label = '🚩'; style = ButtonStyle.Primary;
            } else {
                label = '?'; style = ButtonStyle.Secondary;
            }
            btns.push(
                new ButtonBuilder()
                    .setCustomId(`msw_cell_${msgId}_${r}_${col}`)
                    .setLabel(label)
                    .setStyle(style)
                    .setDisabled(disabled)
            );
        }
        c.addActionRowComponents(new ActionRowBuilder().addComponents(...btns));
    }

    if (status !== 'playing') {
        c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addActionRowComponents(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`msw_new_${msgId}`).setLabel('New Game').setStyle(ButtonStyle.Success).setEmoji('🔄')
            ));
    }

    return c;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIC-TAC-TOE — player (X) vs bot (O), minimax AI
// ═══════════════════════════════════════════════════════════════════════════════
const TTT_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

function tttNewState(userId) {
    return { type: 'ttt', board: Array(9).fill(null), userId, status: 'playing' };
}

function tttWinner(board) {
    for (const [a,b,cc] of TTT_LINES)
        if (board[a] && board[a] === board[b] && board[a] === board[cc]) return board[a];
    return null;
}

function tttMinimax(board, isMax) {
    const w = tttWinner(board);
    if (w === 'O') return 10;
    if (w === 'X') return -10;
    if (board.every(Boolean)) return 0;
    let best = isMax ? -Infinity : Infinity;
    for (let i = 0; i < 9; i++) {
        if (board[i]) continue;
        board[i] = isMax ? 'O' : 'X';
        const s = tttMinimax(board, !isMax);
        board[i] = null;
        best = isMax ? Math.max(best, s) : Math.min(best, s);
    }
    return best;
}

function tttBotMove(board) {
    let best = -Infinity, move = -1;
    for (let i = 0; i < 9; i++) {
        if (board[i]) continue;
        board[i] = 'O';
        const s = tttMinimax(board, false);
        board[i] = null;
        if (s > best) { best = s; move = i; }
    }
    return move;
}

function tttBuildContainer(msgId, state) {
    const { board, status } = state;
    const winner = tttWinner(board);
    const draw = !winner && board.every(Boolean);

    let headerText;
    if (winner === 'X')   headerText = `## ✖⭕ Tic-Tac-Toe\n### 🏆 You Win! Well played!`;
    else if (winner === 'O') headerText = `## ✖⭕ Tic-Tac-Toe\n### 🤖 Bot Wins! Better luck next time.`;
    else if (draw)           headerText = `## ✖⭕ Tic-Tac-Toe\n### 🤝 Draw! Neither side wins.`;
    else                     headerText = `## ✖⭕ Tic-Tac-Toe\n**You are X** — click a cell to make your move!`;

    const accent = winner === 'X' ? 0x57F287 : winner === 'O' ? 0xED4245 : draw ? 0xFEE75C : 0x5865F2;
    const styles = { X: ButtonStyle.Danger, O: ButtonStyle.Primary };
    const labels = { X: 'X', O: 'O', null: '·' };

    const c = new ContainerBuilder()
        .setAccentColor(accent)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    for (let r = 0; r < 3; r++) {
        const btns = [];
        for (let col = 0; col < 3; col++) {
            const i = r * 3 + col;
            btns.push(
                new ButtonBuilder()
                    .setCustomId(`gm_ttt_cell_${msgId}_${i}`)
                    .setLabel(labels[board[i]])
                    .setStyle(board[i] ? styles[board[i]] : ButtonStyle.Secondary)
                    .setDisabled(!!board[i] || status !== 'playing')
            );
        }
        c.addActionRowComponents(new ActionRowBuilder().addComponents(...btns));
    }

    if (status !== 'playing') {
        c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addActionRowComponents(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`gm_ttt_new_${msgId}`).setLabel('Play Again').setStyle(ButtonStyle.Success).setEmoji('🔄')
            ));
    }

    return c;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROCK PAPER SCISSORS — stateless, vs bot
// ═══════════════════════════════════════════════════════════════════════════════
const RPS_CHOICES = {
    rock:     { emoji: '🪨', label: 'Rock',     beats: 'scissors' },
    paper:    { emoji: '📜', label: 'Paper',    beats: 'rock' },
    scissors: { emoji: '🔪', label: 'Scissors', beats: 'paper' },
};

function rpsBuildContainer(nonce) {
    return new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## 🪨📜🔪 Rock Paper Scissors\nMake your choice!`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rps_rock_${nonce}`).setLabel('Rock').setStyle(ButtonStyle.Primary).setEmoji('🪨'),
            new ButtonBuilder().setCustomId(`rps_paper_${nonce}`).setLabel('Paper').setStyle(ButtonStyle.Success).setEmoji('📜'),
            new ButtonBuilder().setCustomId(`rps_scissors_${nonce}`).setLabel('Scissors').setStyle(ButtonStyle.Danger).setEmoji('🔪')
        ));
}

function rpsBuildResult(playerChoice, botChoice) {
    const p = RPS_CHOICES[playerChoice];
    const b = RPS_CHOICES[botChoice];
    const outcome = playerChoice === botChoice ? 'draw'
        : p.beats === botChoice ? 'win' : 'lose';
    const resultLine = outcome === 'win' ? '### 🏆 You Win!'
        : outcome === 'lose' ? '### 😢 You Lose!' : '### 🤝 Draw!';
    const accent = outcome === 'win' ? 0x57F287 : outcome === 'lose' ? 0xED4245 : 0xFEE75C;

    return new ContainerBuilder()
        .setAccentColor(accent)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## 🪨📜🔪 Rock Paper Scissors\n${resultLine}\n\n` +
            `${p.emoji} **You:** ${p.label}\n${b.emoji} **Bot:** ${b.label}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rps_rock_${Date.now()}`).setLabel('Rock').setStyle(ButtonStyle.Primary).setEmoji('🪨'),
            new ButtonBuilder().setCustomId(`rps_paper_${Date.now()}`).setLabel('Paper').setStyle(ButtonStyle.Success).setEmoji('📜'),
            new ButtonBuilder().setCustomId(`rps_scissors_${Date.now()}`).setLabel('Scissors').setStyle(ButtonStyle.Danger).setEmoji('🔪')
        ));
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANGMAN — modal-based letter guessing, 6 lives
// ═══════════════════════════════════════════════════════════════════════════════
const HGM_WORDS = [
    'APPLE','BRAVE','CLOUD','DANCE','EAGLE','FLAME','GRACE','HEART','IVORY',
    'JEWEL','KNIFE','LEMON','MANGO','NOBLE','OCEAN','PIANO','RIVER','STORM',
    'TIGER','ULTRA','VAPOR','WITCH','AMBER','BLAZE','CORAL','DRIFT','EMBER',
    'FROST','GLADE','HAVEN','JOKER','KARMA','LUNAR','MAPLE','NEXUS','ORBIT',
    'PRISM','RADAR','SOLAR','TEMPO','UNION','WORLD','PIXEL','REBEL','SHADE',
    'TOWER','VALOR','ARENA','BRUSH','CRANE','DELTA','EQUIP','FLAIR','GLOBE',
    'HASTE','IDEAL','LANCE','MODEL','NERVE','OASIS','PLUME','REALM','SCOUT',
    'TRUCE','UNITY','BENCH','BLISS','CHARM','DEPTH','EPOCH','FEAST','GRAIN',
    'HEDGE','INPUT','LIGHT','NIGHT','PEACE','QUEST','ROUTE','SKATE','TREND',
    'VENOM','WHIRL','BLAZE','CANDY','DRIVE','FAIRY','GLOOM','HYDRA','INLET',
];

const HGM_STAGES = [
    '```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```',
    '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```',
    '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```',
    '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```',
    '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```',
    '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```',
    '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```',
];

function hgmNewState(userId) {
    const word = HGM_WORDS[Math.floor(Math.random() * HGM_WORDS.length)];
    return { type: 'hgm', word, guessed: [], wrong: 0, userId, status: 'playing' };
}

function hgmBuildContainer(msgId, state) {
    const { word, guessed, wrong, status } = state;
    const display = word.split('').map(l => guessed.includes(l) ? `**${l}**` : '\\_').join('  ');
    const wrongLetters = guessed.filter(l => !word.includes(l));

    let bodyText;
    if (status === 'won') {
        bodyText = `### 🎉 You Won!\nThe word was **${word}**\n-# Solved in ${guessed.length} guesses`;
    } else if (status === 'lost') {
        bodyText = `### 💀 Game Over!\nThe word was **${word}**`;
    } else {
        bodyText = [
            `${display}`,
            ``,
            `❌ Wrong guesses **(${wrong}/6):** ${wrongLetters.length > 0 ? wrongLetters.join('  ') : 'None yet'}`,
            `-# All guessed: ${guessed.length > 0 ? guessed.join('  ') : 'None'}`,
        ].join('\n');
    }

    const accent = status === 'won' ? 0x57F287 : status === 'lost' ? 0xED4245 : 0x5865F2;

    const c = new ContainerBuilder()
        .setAccentColor(accent)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## 🔤 Hangman\n${HGM_STAGES[wrong]}\n${bodyText}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    if (status === 'playing') {
        c.addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`hgm_guess_${msgId}`)
                .setLabel('Guess a Letter')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔤')
        ));
    } else {
        c.addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`hgm_new_${msgId}`)
                .setLabel('Play Again')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🔄')
        ));
    }
    return c;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NUMBER GUESSING — 1-100, 7 attempts, modal input
// ═══════════════════════════════════════════════════════════════════════════════
function ngrNewState(userId) {
    return {
        type: 'ngr',
        target: Math.floor(Math.random() * 100) + 1,
        attempts: 0,
        maxAttempts: 7,
        lastHint: null,
        guesses: [],
        userId,
        status: 'playing',
    };
}

function ngrBuildContainer(msgId, state) {
    const { attempts, maxAttempts, lastHint, status, target, guesses } = state;
    const hintEmoji = lastHint === 'higher' ? '📈' : lastHint === 'lower' ? '📉' : '🎯';
    const hintText  = lastHint === 'higher' ? `${hintEmoji} Go **Higher!**`
        : lastHint === 'lower' ? `${hintEmoji} Go **Lower!**` : '';

    let bodyText;
    if (status === 'won') {
        bodyText = `### 🎉 Correct!\nThe number was **${target}** — found in **${attempts}** attempt${attempts !== 1 ? 's' : ''}!`;
    } else if (status === 'lost') {
        bodyText = `### 💀 Out of Guesses!\nThe number was **${target}**`;
    } else {
        bodyText = [
            `Guess a number from **1** to **100**`,
            hintText,
            `-# Attempt **${attempts}/${maxAttempts}**  •  Previous: ${guesses.length > 0 ? guesses.join(', ') : 'None'}`,
        ].filter(Boolean).join('\n');
    }

    const accent = status === 'won' ? 0x57F287 : status === 'lost' ? 0xED4245 : 0x5865F2;

    const c = new ContainerBuilder()
        .setAccentColor(accent)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## 🔢 Number Guessing\nI'm thinking of a number from 1 to 100...\n\n${bodyText}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    if (status === 'playing') {
        c.addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ngr_guess_${msgId}`)
                .setLabel('Make a Guess')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎯')
        ));
    } else {
        c.addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ngr_new_${msgId}`)
                .setLabel('New Game')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🔄')
        ));
    }
    return c;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY GAME — 4×4 grid, 8 emoji pairs
// ═══════════════════════════════════════════════════════════════════════════════
const MEM_EMOJIS = ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼'];

function memNewState(userId) {
    const pairs = [...MEM_EMOJIS, ...MEM_EMOJIS];
    for (let i = pairs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    return {
        type: 'mem',
        tiles: pairs.map(emoji => ({ emoji, matched: false })),
        flipped: [],
        pending: [],
        matchedCount: 0,
        userId,
        status: 'playing',
    };
}

function memBuildContainer(msgId, state) {
    const { tiles, flipped, pending, matchedCount, status } = state;
    const remaining = 8 - matchedCount;

    let headerText;
    if (status === 'won') {
        headerText = `## 🃏 Memory Game\n### 🏆 All Pairs Found! Incredible memory!`;
    } else {
        headerText = `## 🃏 Memory Game  •  8 pairs\nFlip cards to find matching emoji pairs!\n-# Pairs found: **${matchedCount}/8**  •  Remaining: **${remaining}**`;
    }

    const accent = status === 'won' ? 0x57F287 : 0x5865F2;

    const c = new ContainerBuilder()
        .setAccentColor(accent)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    for (let r = 0; r < 4; r++) {
        const btns = [];
        for (let col = 0; col < 4; col++) {
            const idx = r * 4 + col;
            const tile = tiles[idx];
            const isFlipped = flipped.includes(idx) || pending.includes(idx);

            let label, style, disabled;
            if (tile.matched) {
                label = tile.emoji; style = ButtonStyle.Success; disabled = true;
            } else if (isFlipped) {
                label = tile.emoji; style = ButtonStyle.Primary; disabled = false;
            } else {
                label = '?'; style = ButtonStyle.Secondary; disabled = status !== 'playing';
            }

            btns.push(
                new ButtonBuilder()
                    .setCustomId(`mem_card_${msgId}_${idx}`)
                    .setLabel(label)
                    .setStyle(style)
                    .setDisabled(disabled)
            );
        }
        c.addActionRowComponents(new ActionRowBuilder().addComponents(...btns));
    }

    if (status === 'won') {
        c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addActionRowComponents(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`mem_new_${msgId}`).setLabel('New Game').setStyle(ButtonStyle.Success).setEmoji('🔄')
            ));
    }

    return c;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2048 — 4×4 sliding tile puzzle
// ═══════════════════════════════════════════════════════════════════════════════
function t28SpawnTile(grid) {
    const empty = grid.reduce((acc, v, i) => v === 0 ? [...acc, i] : acc, []);
    if (empty.length === 0) return;
    grid[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < 0.9 ? 2 : 4;
}

function t28SlideRow(row) {
    const filtered = row.filter(v => v !== 0);
    let points = 0;
    for (let i = 0; i < filtered.length - 1; i++) {
        if (filtered[i] !== 0 && filtered[i] === filtered[i + 1]) {
            filtered[i] *= 2;
            points += filtered[i];
            filtered[i + 1] = 0;
        }
    }
    const merged = filtered.filter(v => v !== 0);
    while (merged.length < 4) merged.push(0);
    return { row: merged, points };
}

function t28Move(grid, direction) {
    const newGrid = [...grid];
    let totalPoints = 0;
    let moved = false;

    const getRow = r => [0,1,2,3].map(c => newGrid[r * 4 + c]);
    const getCol = c => [0,1,2,3].map(r => newGrid[r * 4 + c]);
    const setRow = (r, row) => row.forEach((v, c) => { newGrid[r * 4 + c] = v; });
    const setCol = (c, col) => col.forEach((v, r) => { newGrid[r * 4 + c] = v; });

    if (direction === 'left') {
        for (let r = 0; r < 4; r++) {
            const orig = getRow(r);
            const { row: slid, points } = t28SlideRow([...orig]);
            if (orig.join() !== slid.join()) moved = true;
            setRow(r, slid);
            totalPoints += points;
        }
    } else if (direction === 'right') {
        for (let r = 0; r < 4; r++) {
            const orig = getRow(r);
            const { row: slid, points } = t28SlideRow([...orig].reverse());
            const result = slid.reverse();
            if (orig.join() !== result.join()) moved = true;
            setRow(r, result);
            totalPoints += points;
        }
    } else if (direction === 'up') {
        for (let c = 0; c < 4; c++) {
            const orig = getCol(c);
            const { row: slid, points } = t28SlideRow([...orig]);
            if (orig.join() !== slid.join()) moved = true;
            setCol(c, slid);
            totalPoints += points;
        }
    } else if (direction === 'down') {
        for (let c = 0; c < 4; c++) {
            const orig = getCol(c);
            const { row: slid, points } = t28SlideRow([...orig].reverse());
            const result = slid.reverse();
            if (orig.join() !== result.join()) moved = true;
            setCol(c, result);
            totalPoints += points;
        }
    }

    return { newGrid, totalPoints, moved };
}

function t28IsGameOver(grid) {
    if (grid.includes(0)) return false;
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            const v = grid[r * 4 + c];
            if (c < 3 && grid[r * 4 + c + 1] === v) return false;
            if (r < 3 && grid[(r + 1) * 4 + c] === v) return false;
        }
    }
    return true;
}

function t28NewState(userId) {
    const grid = Array(16).fill(0);
    t28SpawnTile(grid);
    t28SpawnTile(grid);
    return { type: 't28', grid, score: 0, userId, status: 'playing' };
}

function t28TileColor(v) {
    if (v === 0) return ButtonStyle.Secondary;
    if (v <= 4) return ButtonStyle.Secondary;
    if (v <= 64) return ButtonStyle.Primary;
    if (v <= 512) return ButtonStyle.Success;
    return ButtonStyle.Danger;
}

function t28BuildContainer(msgId, state) {
    const { grid, score, status } = state;

    const tileLabel = v => v === 0 ? '·' : String(v);
    const rows = [0,1,2,3].map(r => [0,1,2,3].map(c => grid[r * 4 + c]));
    const boardText = rows.map(row => row.map(v => v === 0 ? '   ·' : String(v).padStart(4, ' ')).join(' ')).join('\n');

    let headerText;
    if (status === 'won') {
        headerText = `## 🎮 2048\n### 🏆 You Reached 2048! Outstanding!\n-# Final Score: **${score}**`;
    } else if (status === 'lost') {
        headerText = `## 🎮 2048\n### 💀 No More Moves! Game Over.\n-# Final Score: **${score}**`;
    } else {
        headerText = `## 🎮 2048\nSlide tiles to combine them — reach **2048** to win!\n-# Score: **${score}**`;
    }

    const accent = status === 'won' ? 0x57F287 : status === 'lost' ? 0xED4245 : 0x5865F2;

    const c = new ContainerBuilder()
        .setAccentColor(accent)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            headerText + '\n```\n' + boardText + '\n```'
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    if (status === 'playing') {
        c.addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`t28_up_${msgId}`).setLabel('Up').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`t28_down_${msgId}`).setLabel('Down').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`t28_left_${msgId}`).setLabel('Left').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`t28_right_${msgId}`).setLabel('Right').setStyle(ButtonStyle.Secondary)
        ));
    } else {
        c.addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`t28_new_${msgId}`).setLabel('New Game').setStyle(ButtonStyle.Success).setEmoji('🔄')
        ));
    }

    return c;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATTLESHIP — 5×5 grid, sink the hidden fleet
// ═══════════════════════════════════════════════════════════════════════════════
function bshPlaceShips(grid) {
    for (const len of [3, 2, 2]) {
        let placed = false, tries = 0;
        while (!placed && tries++ < 200) {
            const horiz = Math.random() < 0.5;
            const r = Math.floor(Math.random() * (horiz ? 5 : 6 - len));
            const c = Math.floor(Math.random() * (horiz ? 6 - len : 5));
            const cells = Array.from({ length: len }, (_, i) => [horiz ? r : r + i, horiz ? c + i : c]);
            if (cells.every(([nr, nc]) => !grid[nr][nc].ship)) {
                cells.forEach(([nr, nc]) => { grid[nr][nc].ship = true; });
                placed = true;
            }
        }
    }
}

function bshNewState(userId) {
    const grid = Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => ({ ship: false, shot: false }))
    );
    bshPlaceShips(grid);
    const totalShipCells = grid.flat().filter(c => c.ship).length;
    return { type: 'bsh', grid, totalShipCells, hitsLeft: totalShipCells, shotsCount: 0, userId, status: 'playing' };
}

function bshBuildContainer(msgId, state) {
    const { grid, hitsLeft, totalShipCells, shotsCount, status } = state;
    const hitsFound = totalShipCells - hitsLeft;

    let headerText;
    if (status === 'won') {
        headerText = `## 🚢 Battleship\n### 🏆 All Ships Sunk! You Win in ${shotsCount} shots!`;
    } else {
        const hitRate = shotsCount > 0 ? Math.round((hitsFound / shotsCount) * 100) : 0;
        headerText = `## 🚢 Battleship  •  5×5\nFind and sink the hidden enemy fleet!\n-# Ship cells remaining: **${hitsLeft}**  •  Shots fired: **${shotsCount}**  •  Accuracy: **${hitRate}%**`;
    }

    const accent = status === 'won' ? 0x57F287 : 0x5865F2;

    const c = new ContainerBuilder()
        .setAccentColor(accent)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    for (let r = 0; r < 5; r++) {
        const btns = [];
        for (let col = 0; col < 5; col++) {
            const cell = grid[r][col];
            let label, style, disabled;
            if (cell.shot) {
                label = cell.ship ? '💥' : '🌊';
                style = cell.ship ? ButtonStyle.Danger : ButtonStyle.Secondary;
                disabled = true;
            } else {
                label = '·';
                style = ButtonStyle.Primary;
                disabled = status !== 'playing';
            }
            btns.push(
                new ButtonBuilder()
                    .setCustomId(`bsh_cell_${msgId}_${r}_${col}`)
                    .setLabel(label)
                    .setStyle(style)
                    .setDisabled(disabled)
            );
        }
        c.addActionRowComponents(new ActionRowBuilder().addComponents(...btns));
    }

    if (status === 'won') {
        c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addActionRowComponents(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`bsh_new_${msgId}`).setLabel('New Game').setStyle(ButtonStyle.Success).setEmoji('🔄')
            ));
    }

    return c;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECT 4 — 6×7 grid, player (Red) vs smart bot (Yellow)
// ═══════════════════════════════════════════════════════════════════════════════
const C4_ROWS = 6, C4_COLS = 7;

function c4NewState(userId) {
    return {
        type: 'c4',
        board: Array.from({ length: C4_ROWS }, () => Array(C4_COLS).fill(null)),
        userId,
        status: 'playing',
        winner: null,
    };
}

function c4Drop(board, col, piece) {
    for (let r = C4_ROWS - 1; r >= 0; r--) {
        if (!board[r][col]) { board[r][col] = piece; return r; }
    }
    return -1;
}

function c4CheckWin(board, piece) {
    for (let r = 0; r < C4_ROWS; r++)
        for (let c = 0; c <= C4_COLS - 4; c++)
            if ([0,1,2,3].every(i => board[r][c + i] === piece)) return true;
    for (let r = 0; r <= C4_ROWS - 4; r++)
        for (let c = 0; c < C4_COLS; c++)
            if ([0,1,2,3].every(i => board[r + i][c] === piece)) return true;
    for (let r = 3; r < C4_ROWS; r++)
        for (let c = 0; c <= C4_COLS - 4; c++)
            if ([0,1,2,3].every(i => board[r - i][c + i] === piece)) return true;
    for (let r = 0; r <= C4_ROWS - 4; r++)
        for (let c = 0; c <= C4_COLS - 4; c++)
            if ([0,1,2,3].every(i => board[r + i][c + i] === piece)) return true;
    return false;
}

function c4BotMove(board) {
    const canDrop = c => board[0][c] === null;
    const tryDrop = (c, piece) => {
        const b = board.map(r => [...r]);
        c4Drop(b, c, piece);
        return b;
    };
    for (let c = 0; c < C4_COLS; c++) {
        if (canDrop(c) && c4CheckWin(tryDrop(c, 'Y'), 'Y')) return c;
    }
    for (let c = 0; c < C4_COLS; c++) {
        if (canDrop(c) && c4CheckWin(tryDrop(c, 'R'), 'R')) return c;
    }
    const order = [3, 2, 4, 1, 5, 0, 6];
    return order.find(c => canDrop(c)) ?? -1;
}

function c4BuildContainer(msgId, state) {
    const { board, status, winner } = state;

    let headerText;
    if (status === 'won' && winner === 'R')   headerText = `## 🔵 Connect 4\n### 🏆 You Win! 4 in a row!`;
    else if (status === 'won' && winner === 'Y') headerText = `## 🔵 Connect 4\n### 🤖 Bot Wins! Better luck next time.`;
    else if (status === 'draw')                  headerText = `## 🔵 Connect 4\n### 🤝 Draw! The board is full.`;
    else headerText = `## 🔵 Connect 4\nDrop your piece — get 4 in a row to win!\n-# You are 🔴 Red  •  Bot is 🟡 Yellow`;

    const EMPTY = '⬜', RED = '🔴', YELLOW = '🟡';
    const boardDisplay = board.map(row =>
        row.map(cell => cell === 'R' ? RED : cell === 'Y' ? YELLOW : EMPTY).join('')
    ).join('\n') + '\n1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣';

    const accent = (status === 'won' && winner === 'R') ? 0x57F287
        : (status === 'won' && winner === 'Y') ? 0xED4245
        : status === 'draw' ? 0xFEE75C : 0x5865F2;

    const c = new ContainerBuilder()
        .setAccentColor(accent)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            headerText + '\n\n' + boardDisplay
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    if (status === 'playing') {
        c.addActionRowComponents(new ActionRowBuilder().addComponents(
            ...[0,1,2,3,4].map(col =>
                new ButtonBuilder()
                    .setCustomId(`gm_c4_col_${msgId}_${col}`)
                    .setLabel(String(col + 1))
                    .setStyle(board[0][col] ? ButtonStyle.Secondary : ButtonStyle.Primary)
                    .setDisabled(!!board[0][col])
            )
        ));
        c.addActionRowComponents(new ActionRowBuilder().addComponents(
            ...[5, 6].map(col =>
                new ButtonBuilder()
                    .setCustomId(`gm_c4_col_${msgId}_${col}`)
                    .setLabel(String(col + 1))
                    .setStyle(board[0][col] ? ButtonStyle.Secondary : ButtonStyle.Primary)
                    .setDisabled(!!board[0][col])
            )
        ));
    } else {
        c.addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`gm_c4_new_${msgId}`).setLabel('New Game').setStyle(ButtonStyle.Success).setEmoji('🔄')
        ));
    }

    return c;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERACTION HANDLER
// ═══════════════════════════════════════════════════════════════════════════════
async function handleInteraction(interaction) {
    const { customId } = interaction;
    const msgId = interaction.message?.id;

    // ── Minesweeper: new game ──────────────────────────────────────────────────
    if (customId.startsWith('msw_new_')) {
        const state = mswNewState();
        setGame(msgId, state);
        await interaction.update({ components: [mswBuildContainer(msgId, state)], flags: CV2 });
        return true;
    }

    // ── Minesweeper: cell click ────────────────────────────────────────────────
    if (customId.startsWith('msw_cell_')) {
        const state = getGame(msgId);
        if (!state || state.type !== 'msw' || state.status !== 'playing') {
            await interaction.deferUpdate().catch(() => null);
            return true;
        }
        const parts = customId.split('_');
        const r = parseInt(parts[parts.length - 2]);
        const c = parseInt(parts[parts.length - 1]);
        const cell = state.grid[r][c];
        if (cell.revealed || cell.flagged) { await interaction.deferUpdate().catch(() => null); return true; }

        if (cell.mine) {
            cell.revealed = true;
            state.status = 'lost';
        } else {
            mswFloodFill(state.grid, r, c);
            if (mswCheckWin(state.grid)) state.status = 'won';
        }
        setGame(msgId, state);
        await interaction.update({ components: [mswBuildContainer(msgId, state)], flags: CV2 });
        return true;
    }

    // ── Tic-Tac-Toe: new game ──────────────────────────────────────────────────
    if (customId.startsWith('gm_ttt_new_')) {
        const state = tttNewState(interaction.user.id);
        setGame(msgId, state);
        await interaction.update({ components: [tttBuildContainer(msgId, state)], flags: CV2 });
        return true;
    }

    // ── Tic-Tac-Toe: cell click ────────────────────────────────────────────────
    if (customId.startsWith('gm_ttt_cell_')) {
        const state = getGame(msgId);
        if (!state || state.type !== 'ttt' || state.status !== 'playing') {
            await interaction.deferUpdate().catch(() => null);
            return true;
        }
        if (interaction.user.id !== state.userId) {
            await interaction.reply({ content: '❌ This game belongs to someone else.', flags: MessageFlags.Ephemeral }).catch(() => null);
            return true;
        }
        const pos = parseInt(customId.split('_')[4]);
        if (state.board[pos]) { await interaction.deferUpdate().catch(() => null); return true; }

        state.board[pos] = 'X';
        let winner = tttWinner(state.board);
        if (!winner && !state.board.every(Boolean)) {
            const bot = tttBotMove(state.board);
            if (bot !== -1) { state.board[bot] = 'O'; winner = tttWinner(state.board); }
        }
        if (winner || state.board.every(Boolean)) state.status = 'done';
        setGame(msgId, state);
        await interaction.update({ components: [tttBuildContainer(msgId, state)], flags: CV2 });
        return true;
    }

    // ── Rock Paper Scissors ────────────────────────────────────────────────────
    if (customId.startsWith('rps_rock_') || customId.startsWith('rps_paper_') || customId.startsWith('rps_scissors_')) {
        const choice = customId.split('_')[1];
        if (!['rock', 'paper', 'scissors'].includes(choice)) return false;
        const choices = ['rock', 'paper', 'scissors'];
        const botChoice = choices[Math.floor(Math.random() * 3)];
        await interaction.update({ components: [rpsBuildResult(choice, botChoice)], flags: CV2 });
        return true;
    }

    // ── Hangman: guess button ─────────────────────────────────────────────────
    if (customId.startsWith('hgm_guess_')) {
        const state = getGame(msgId);
        if (!state || state.type !== 'hgm') return false;
        if (interaction.user.id !== state.userId) {
            await interaction.reply({ content: '❌ This game belongs to someone else.', flags: MessageFlags.Ephemeral }).catch(() => null);
            return true;
        }
        return interaction.showModal(
            new ModalBuilder()
                .setCustomId(`hgm_modal_${msgId}`)
                .setTitle('Guess a Letter')
                .addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('hgm_letter')
                        .setLabel('Enter a single letter (A-Z)')
                        .setStyle(TextInputStyle.Short)
                        .setMinLength(1).setMaxLength(1)
                        .setPlaceholder('e.g.  E')
                        .setRequired(true)
                ))
        );
    }

    // ── Hangman: new game ──────────────────────────────────────────────────────
    if (customId.startsWith('hgm_new_')) {
        const state = hgmNewState(interaction.user.id);
        setGame(msgId, state);
        await interaction.update({ components: [hgmBuildContainer(msgId, state)], flags: CV2 });
        return true;
    }

    // ── Number Guess: guess button ────────────────────────────────────────────
    if (customId.startsWith('ngr_guess_')) {
        const state = getGame(msgId);
        if (!state || state.type !== 'ngr') return false;
        if (interaction.user.id !== state.userId) {
            await interaction.reply({ content: '❌ This game belongs to someone else.', flags: MessageFlags.Ephemeral }).catch(() => null);
            return true;
        }
        return interaction.showModal(
            new ModalBuilder()
                .setCustomId(`ngr_modal_${msgId}`)
                .setTitle('Make a Guess')
                .addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('ngr_number')
                        .setLabel('Enter a number (1-100)')
                        .setStyle(TextInputStyle.Short)
                        .setMinLength(1).setMaxLength(3)
                        .setPlaceholder('e.g.  50')
                        .setRequired(true)
                ))
        );
    }

    // ── Number Guess: new game ────────────────────────────────────────────────
    if (customId.startsWith('ngr_new_')) {
        const state = ngrNewState(interaction.user.id);
        setGame(msgId, state);
        await interaction.update({ components: [ngrBuildContainer(msgId, state)], flags: CV2 });
        return true;
    }

    // ── Memory Game: new game ─────────────────────────────────────────────────
    if (customId.startsWith('mem_new_')) {
        const state = memNewState(interaction.user.id);
        setGame(msgId, state);
        await interaction.update({ components: [memBuildContainer(msgId, state)], flags: CV2 });
        return true;
    }

    // ── Memory Game: card click ───────────────────────────────────────────────
    if (customId.startsWith('mem_card_')) {
        const state = getGame(msgId);
        if (!state || state.type !== 'mem' || state.status !== 'playing') {
            await interaction.deferUpdate().catch(() => null);
            return true;
        }
        if (interaction.user.id !== state.userId) {
            await interaction.reply({ content: '❌ This game belongs to someone else.', flags: MessageFlags.Ephemeral }).catch(() => null);
            return true;
        }
        const idx = parseInt(customId.split('_').pop());
        const tile = state.tiles[idx];

        // Clear non-matching pending pair on next action
        if (state.pending.length === 2) state.pending = [];

        // Ignore already-matched or already-visible cards
        if (tile.matched || state.flipped.includes(idx) || state.pending.includes(idx)) {
            await interaction.deferUpdate().catch(() => null);
            return true;
        }

        if (state.flipped.length === 0) {
            state.flipped = [idx];
        } else {
            const firstIdx = state.flipped[0];
            if (state.tiles[firstIdx].emoji === tile.emoji) {
                state.tiles[firstIdx].matched = true;
                tile.matched = true;
                state.matchedCount++;
                state.flipped = [];
                if (state.matchedCount === 8) state.status = 'won';
            } else {
                state.pending = [firstIdx, idx];
                state.flipped = [];
            }
        }

        setGame(msgId, state);
        await interaction.update({ components: [memBuildContainer(msgId, state)], flags: CV2 });
        return true;
    }

    // ── 2048: new game ────────────────────────────────────────────────────────
    if (customId.startsWith('t28_new_')) {
        const state = t28NewState(interaction.user.id);
        setGame(msgId, state);
        await interaction.update({ components: [t28BuildContainer(msgId, state)], flags: CV2 });
        return true;
    }

    // ── 2048: direction buttons ───────────────────────────────────────────────
    if (customId.startsWith('t28_up_') || customId.startsWith('t28_down_') ||
        customId.startsWith('t28_left_') || customId.startsWith('t28_right_')) {
        const state = getGame(msgId);
        if (!state || state.type !== 't28' || state.status !== 'playing') {
            await interaction.deferUpdate().catch(() => null);
            return true;
        }
        if (interaction.user.id !== state.userId) {
            await interaction.reply({ content: '❌ This game belongs to someone else.', flags: MessageFlags.Ephemeral }).catch(() => null);
            return true;
        }
        const dir = customId.split('_')[1];
        const { newGrid, totalPoints, moved } = t28Move(state.grid, dir);
        if (!moved) { await interaction.deferUpdate().catch(() => null); return true; }

        state.grid = newGrid;
        state.score += totalPoints;

        if (state.grid.includes(2048)) {
            state.status = 'won';
        } else {
            t28SpawnTile(state.grid);
            if (t28IsGameOver(state.grid)) state.status = 'lost';
        }

        setGame(msgId, state);
        await interaction.update({ components: [t28BuildContainer(msgId, state)], flags: CV2 });
        return true;
    }

    // ── Battleship: new game ──────────────────────────────────────────────────
    if (customId.startsWith('bsh_new_')) {
        const state = bshNewState(interaction.user.id);
        setGame(msgId, state);
        await interaction.update({ components: [bshBuildContainer(msgId, state)], flags: CV2 });
        return true;
    }

    // ── Battleship: cell click ────────────────────────────────────────────────
    if (customId.startsWith('bsh_cell_')) {
        const state = getGame(msgId);
        if (!state || state.type !== 'bsh' || state.status !== 'playing') {
            await interaction.deferUpdate().catch(() => null);
            return true;
        }
        if (interaction.user.id !== state.userId) {
            await interaction.reply({ content: '❌ This game belongs to someone else.', flags: MessageFlags.Ephemeral }).catch(() => null);
            return true;
        }
        const parts = customId.split('_');
        const r = parseInt(parts[parts.length - 2]);
        const col = parseInt(parts[parts.length - 1]);
        const cell = state.grid[r][col];

        if (cell.shot) { await interaction.deferUpdate().catch(() => null); return true; }

        cell.shot = true;
        state.shotsCount++;
        if (cell.ship) {
            state.hitsLeft--;
            if (state.hitsLeft === 0) state.status = 'won';
        }

        setGame(msgId, state);
        await interaction.update({ components: [bshBuildContainer(msgId, state)], flags: CV2 });
        return true;
    }

    // ── Connect 4: new game ───────────────────────────────────────────────────
    if (customId.startsWith('gm_c4_new_')) {
        const state = c4NewState(interaction.user.id);
        setGame(msgId, state);
        await interaction.update({ components: [c4BuildContainer(msgId, state)], flags: CV2 });
        return true;
    }

    // ── Connect 4: column drop ────────────────────────────────────────────────
    if (customId.startsWith('gm_c4_col_')) {
        const state = getGame(msgId);
        if (!state || state.type !== 'c4' || state.status !== 'playing') {
            await interaction.deferUpdate().catch(() => null);
            return true;
        }
        if (interaction.user.id !== state.userId) {
            await interaction.reply({ content: '❌ This game belongs to someone else.', flags: MessageFlags.Ephemeral }).catch(() => null);
            return true;
        }
        const col = parseInt(customId.split('_')[4]);

        if (c4Drop(state.board, col, 'R') === -1) {
            await interaction.deferUpdate().catch(() => null);
            return true;
        }

        if (c4CheckWin(state.board, 'R')) {
            state.status = 'won'; state.winner = 'R';
        } else if (state.board.every(row => row.every(Boolean))) {
            state.status = 'draw';
        } else {
            const botCol = c4BotMove(state.board);
            if (botCol !== -1) {
                c4Drop(state.board, botCol, 'Y');
                if (c4CheckWin(state.board, 'Y')) {
                    state.status = 'won'; state.winner = 'Y';
                } else if (state.board.every(row => row.every(Boolean))) {
                    state.status = 'draw';
                }
            }
        }

        setGame(msgId, state);
        await interaction.update({ components: [c4BuildContainer(msgId, state)], flags: CV2 });
        return true;
    }

    return false;
}

// ── Modal submission handler ──────────────────────────────────────────────────
async function handleModal(interaction) {
    const { customId } = interaction;

    // Hangman modal
    if (customId.startsWith('hgm_modal_')) {
        const gameMsgId = customId.slice('hgm_modal_'.length);
        const state = getGame(gameMsgId);
        if (!state || state.type !== 'hgm') {
            return interaction.reply({ content: '❌ Game session expired — start a new game!', flags: MessageFlags.Ephemeral });
        }
        const letter = interaction.fields.getTextInputValue('hgm_letter').trim().toUpperCase();
        if (!/^[A-Z]$/.test(letter)) {
            return interaction.reply({ content: '❌ Please enter a single letter A–Z.', flags: MessageFlags.Ephemeral });
        }
        if (state.guessed.includes(letter)) {
            return interaction.reply({ content: `❌ You already guessed **${letter}**! Try a different letter.`, flags: MessageFlags.Ephemeral });
        }
        state.guessed.push(letter);
        if (!state.word.includes(letter)) {
            state.wrong++;
            if (state.wrong >= 6) state.status = 'lost';
        } else if (state.word.split('').every(l => state.guessed.includes(l))) {
            state.status = 'won';
        }
        setGame(gameMsgId, state);
        const gameMsg = await interaction.channel?.messages.fetch(gameMsgId).catch(() => null);
        if (gameMsg) await gameMsg.edit({ components: [hgmBuildContainer(gameMsgId, state)], flags: CV2 }).catch(() => null);
        await interaction.deferUpdate().catch(() =>
            interaction.reply({ content: `${letter} noted!`, flags: MessageFlags.Ephemeral }).catch(() => null)
        );
        return true;
    }

    // Number Guess modal
    if (customId.startsWith('ngr_modal_')) {
        const gameMsgId = customId.slice('ngr_modal_'.length);
        const state = getGame(gameMsgId);
        if (!state || state.type !== 'ngr') {
            return interaction.reply({ content: '❌ Game session expired — start a new game!', flags: MessageFlags.Ephemeral });
        }
        const raw = interaction.fields.getTextInputValue('ngr_number').trim();
        const guess = parseInt(raw);
        if (isNaN(guess) || guess < 1 || guess > 100) {
            return interaction.reply({ content: '❌ Enter a whole number between 1 and 100.', flags: MessageFlags.Ephemeral });
        }
        state.attempts++;
        state.guesses.push(guess);
        if (guess === state.target) {
            state.status = 'won';
            state.lastHint = null;
        } else if (state.attempts >= state.maxAttempts) {
            state.status = 'lost';
        } else {
            state.lastHint = guess < state.target ? 'higher' : 'lower';
        }
        setGame(gameMsgId, state);
        const gameMsg = await interaction.channel?.messages.fetch(gameMsgId).catch(() => null);
        if (gameMsg) await gameMsg.edit({ components: [ngrBuildContainer(gameMsgId, state)], flags: CV2 }).catch(() => null);
        await interaction.deferUpdate().catch(() =>
            interaction.reply({ content: `Guess of ${guess} noted!`, flags: MessageFlags.Ephemeral }).catch(() => null)
        );
        return true;
    }

    return false;
}

// ── MODULE EXPORT ─────────────────────────────────────────────────────────────
module.exports = {
    name: 'games',
    aliases: ['games', 'game'],
    category: 'fun',
    description: 'Nine interactive button games: Minesweeper, Tic-Tac-Toe, RPS, Hangman, Number Guess, Memory, 2048, Battleship, Connect 4',
    usage: '/games <subcommand>',
    permissions: [],

    data: new SlashCommandBuilder()
        .setName('games')
        .setDescription('Play interactive button games')
        .addSubcommand(sub => sub.setName('minesweeper').setDescription('5x5 Minesweeper — reveal all safe cells without hitting a mine'))
        .addSubcommand(sub => sub.setName('tictactoe').setDescription('Tic-Tac-Toe against an unbeatable bot'))
        .addSubcommand(sub => sub.setName('rps').setDescription('Rock Paper Scissors against the bot'))
        .addSubcommand(sub => sub.setName('hangman').setDescription('Guess the hidden word one letter at a time'))
        .addSubcommand(sub => sub.setName('numguess').setDescription('Guess the secret number (1–100) in 7 tries'))
        .addSubcommand(sub => sub.setName('memory').setDescription('Flip cards to find all 8 matching emoji pairs'))
        .addSubcommand(sub => sub.setName('2048').setDescription('Slide tiles to combine them and reach 2048'))
        .addSubcommand(sub => sub.setName('battleship').setDescription('Hunt down and sink the hidden enemy fleet on a 5×5 grid'))
        .addSubcommand(sub => sub.setName('connect4').setDescription('Drop pieces to get 4 in a row — beat the smart bot')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'rps') {
            return interaction.reply({ components: [rpsBuildContainer(interaction.id)], flags: CV2 });
        }

        await interaction.deferReply();
        const msg = await interaction.fetchReply();
        const id = msg.id;

        if (sub === 'minesweeper') {
            const state = mswNewState();
            setGame(id, state);
            return interaction.editReply({ components: [mswBuildContainer(id, state)], flags: CV2 });
        }
        if (sub === 'tictactoe') {
            const state = tttNewState(interaction.user.id);
            setGame(id, state);
            return interaction.editReply({ components: [tttBuildContainer(id, state)], flags: CV2 });
        }
        if (sub === 'hangman') {
            const state = hgmNewState(interaction.user.id);
            setGame(id, state);
            return interaction.editReply({ components: [hgmBuildContainer(id, state)], flags: CV2 });
        }
        if (sub === 'numguess') {
            const state = ngrNewState(interaction.user.id);
            setGame(id, state);
            return interaction.editReply({ components: [ngrBuildContainer(id, state)], flags: CV2 });
        }
        if (sub === 'memory') {
            const state = memNewState(interaction.user.id);
            setGame(id, state);
            return interaction.editReply({ components: [memBuildContainer(id, state)], flags: CV2 });
        }
        if (sub === '2048') {
            const state = t28NewState(interaction.user.id);
            setGame(id, state);
            return interaction.editReply({ components: [t28BuildContainer(id, state)], flags: CV2 });
        }
        if (sub === 'battleship') {
            const state = bshNewState(interaction.user.id);
            setGame(id, state);
            return interaction.editReply({ components: [bshBuildContainer(id, state)], flags: CV2 });
        }
        if (sub === 'connect4') {
            const state = c4NewState(interaction.user.id);
            setGame(id, state);
            return interaction.editReply({ components: [c4BuildContainer(id, state)], flags: CV2 });
        }
    },

    async executePrefix(message, args) {
        const sub = (args[0] || '').toLowerCase();

        const HELP =
            '**🎮 xNico Games — pick a game:**\n\n' +
            '`-games minesweeper` — 💣 5×5 Minesweeper\n' +
            '`-games tictactoe`   — ✖⭕ Tic-Tac-Toe vs AI\n' +
            '`-games rps`         — 🪨📜🔪 Rock Paper Scissors\n' +
            '`-games hangman`     — 🔤 Hangman (guess the word)\n' +
            '`-games numguess`    — 🔢 Number Guess (1–100, 7 tries)\n' +
            '`-games memory`      — 🃏 Memory Card Game (8 pairs)\n' +
            '`-games 2048`        — 🎮 2048 (slide tiles)\n' +
            '`-games battleship`  — 🚢 Battleship (sink the fleet)\n' +
            '`-games connect4`    — 🔵 Connect 4 vs AI\n\n' +
            '-# Tip: standalone commands like `-tictactoe @user` let you play against friends!';

        if (!sub) return message.reply(HELP);

        if (sub === 'rps') {
            const nonce = Date.now().toString();
            return message.reply({ components: [rpsBuildContainer(nonce)], flags: CV2 });
        }

        const reply = await message.reply({ content: '🎮 Starting game…' });
        const id = reply.id;

        if (sub === 'minesweeper') {
            const state = mswNewState();
            setGame(id, state);
            return reply.edit({ content: null, components: [mswBuildContainer(id, state)], flags: CV2 });
        }
        if (sub === 'tictactoe') {
            const state = tttNewState(message.author.id);
            setGame(id, state);
            return reply.edit({ content: null, components: [tttBuildContainer(id, state)], flags: CV2 });
        }
        if (sub === 'hangman') {
            const state = hgmNewState(message.author.id);
            setGame(id, state);
            return reply.edit({ content: null, components: [hgmBuildContainer(id, state)], flags: CV2 });
        }
        if (sub === 'numguess') {
            const state = ngrNewState(message.author.id);
            setGame(id, state);
            return reply.edit({ content: null, components: [ngrBuildContainer(id, state)], flags: CV2 });
        }
        if (sub === 'memory') {
            const state = memNewState(message.author.id);
            setGame(id, state);
            return reply.edit({ content: null, components: [memBuildContainer(id, state)], flags: CV2 });
        }
        if (sub === '2048') {
            const state = t28NewState(message.author.id);
            setGame(id, state);
            return reply.edit({ content: null, components: [t28BuildContainer(id, state)], flags: CV2 });
        }
        if (sub === 'battleship') {
            const state = bshNewState(message.author.id);
            setGame(id, state);
            return reply.edit({ content: null, components: [bshBuildContainer(id, state)], flags: CV2 });
        }
        if (sub === 'connect4') {
            const state = c4NewState(message.author.id);
            setGame(id, state);
            return reply.edit({ content: null, components: [c4BuildContainer(id, state)], flags: CV2 });
        }

        return reply.edit({ content: HELP });
    },

    handleInteraction,
    handleModal,
};
