'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { createContainer, addTextDisplay, addSeparator, formatNumber, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const { parseBet, processBetResult, getBalance, MAX_BET } = require('../../utils/betHelper');
const { gamblingGuard } = require('../../utils/economyGuards');

// ═══ Game Config ═══
const GRIDS = {
    '3x3': { rows: 3, cols: 3, total: 9 },
    '4x4': { rows: 4, cols: 4, total: 16 },
    '5x4': { rows: 4, cols: 5, total: 20 },
};

const RISKS = {
    low:     { mines: { '3x3': 1, '4x4': 3, '5x4': 4 },  baseMultiplier: 1.2, label: '🟢 Low',     color: 0x57F287 },
    medium:  { mines: { '3x3': 2, '4x4': 5, '5x4': 7 },  baseMultiplier: 1.5, label: '🟡 Medium',  color: 0xFEE75C },
    hard:    { mines: { '3x3': 3, '4x4': 7, '5x4': 10 }, baseMultiplier: 2.0, label: '🟠 Hard',    color: 0xF97316 },
    extreme: { mines: { '3x3': 5, '4x4': 10, '5x4': 15 }, baseMultiplier: 3.5, label: '🔴 Extreme', color: 0xED4245 },
};

// Active games: Map<userId, gameState>
const activeGames = new Map();

function calculateMultiplier(revealed, totalSafe, risk) {
    if (revealed === 0) return 1;
    const base = RISKS[risk].baseMultiplier;
    // Exponential growth: more tiles revealed = higher multiplier
    return Math.round((Math.pow(base, revealed) + (revealed * 0.1)) * 100) / 100;
}

function generateBoard(gridKey, risk) {
    const grid = GRIDS[gridKey];
    const mineCount = RISKS[risk].mines[gridKey];
    const board = Array(grid.total).fill(false);
    
    // Place mines randomly
    let placed = 0;
    while (placed < mineCount) {
        const pos = Math.floor(Math.random() * grid.total);
        if (!board[pos]) {
            board[pos] = true; // true = mine
            placed++;
        }
    }
    return board;
}

function buildGameGrid(game, reveal = false) {
    const grid = GRIDS[game.gridKey];
    const rows = [];
    
    for (let r = 0; r < grid.rows; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < grid.cols; c++) {
            const idx = r * grid.cols + c;
            const isRevealed = game.revealed.has(idx);
            const isMine = game.board[idx];
            
            let btn;
            if (reveal && isMine) {
                // Game over — show all mines
                btn = new ButtonBuilder()
                    .setCustomId(`mines_${game.userId}_${idx}`)
                    .setEmoji('💣')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true);
            } else if (isRevealed) {
                // Already revealed safe tile
                btn = new ButtonBuilder()
                    .setCustomId(`mines_${game.userId}_${idx}`)
                    .setEmoji('<:Sketch:1473038248493453352>')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true);
            } else if (game.ended) {
                // Game ended — disable remaining
                btn = new ButtonBuilder()
                    .setCustomId(`mines_${game.userId}_${idx}`)
                    .setLabel('·')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true);
            } else {
                // Unrevealed — clickable
                btn = new ButtonBuilder()
                    .setCustomId(`mines_${game.userId}_${idx}`)
                    .setLabel('·')
                    .setStyle(ButtonStyle.Secondary);
            }
            row.addComponents(btn);
        }
        rows.push(row);
    }
    
    // Add cashout button (only if game is active and at least 1 tile revealed)
    if (!game.ended && game.revealed.size > 0) {
        const cashoutRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`mines_${game.userId}_cashout`)
                .setLabel(`💰 Cash Out (${calculateMultiplier(game.revealed.size, game.totalSafe, game.risk)}x = ${formatNumber(Math.floor(game.bet * calculateMultiplier(game.revealed.size, game.totalSafe, game.risk)))})`)
                .setStyle(ButtonStyle.Primary)
        );
        rows.push(cashoutRow);
    }
    
    return rows;
}

function buildGameContainer(game, status = 'playing') {
    const multiplier = calculateMultiplier(game.revealed.size, game.totalSafe, game.risk);
    const potential = Math.floor(game.bet * multiplier);
    const riskInfo = RISKS[game.risk];
    const grid = GRIDS[game.gridKey];
    const mineCount = riskInfo.mines[game.gridKey];
    
    let color = riskInfo.color;
    let statusText = '';
    
    if (status === 'playing') {
        statusText = `**Revealed:** ${game.revealed.size}/${game.totalSafe} safe tiles\n**Multiplier:** ${multiplier}x\n**Potential:** ${formatNumber(potential)} coins`;
    } else if (status === 'won') {
        color = 0x57F287;
        statusText = `<:Checkedbox:1473038547165384804> **Cashed out at ${multiplier}x!**\n**Won:** ${formatNumber(potential)} coins (+${formatNumber(potential - game.bet)})`;
    } else if (status === 'lost') {
        color = 0xED4245;
        statusText = `💣 **BOOM! Hit a mine!**\n**Lost:** ${formatNumber(game.bet)} coins`;
    }
    
    const container = createContainer(color);
    addTextDisplay(container, [
        `# 💣 Minesweeper`,
        '',
        `**Grid:** ${game.gridKey} • **Risk:** ${riskInfo.label} • **Mines:** ${mineCount}`,
        `**Bet:** ${formatNumber(game.bet)} coins`,
        '',
        statusText,
    ].join('\n'));
    
    return container;
}

// ═══ Command Handler ═══
async function handleMines(reply, userId, args, interaction) {
    // Check if user already has an active game
    if (activeGames.has(userId)) {
        const c = createContainer(0xFEE75C);
        addTextDisplay(c, `<:Infotriangle:1473038460456800459> You already have an active mines game! Finish it first or it will expire in 2 minutes.`);
        return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }
    
    const balance = getBalance(userId);
    const betResult = parseBet(args[0], balance);
    
    if (!betResult.valid) {
        const container = createContainer(0xCAD7E6);
        addTextDisplay(container, [
            `# 💣 Minesweeper`,
            '',
            `**Usage:** \`mines <bet>\``,
            `**Max Bet:** ${formatNumber(MAX_BET)}`,
            '',
            `Reveal tiles without hitting a mine! Each safe tile increases your multiplier.`,
            `Cash out anytime to lock in your winnings.`,
            '',
            `**Grids:** 3×3 • 4×4 • 5×4`,
            `**Risks:** 🟢 Low • 🟡 Medium • 🟠 Hard • 🔴 Extreme`,
            '',
            `Higher risk = more mines = higher multipliers!`,
        ].join('\n'));
        return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
    
    const bet = betResult.amount;
    
    // Store pending setup
    activeGames.set(userId, {
        phase: 'setup',
        bet,
        gridKey: null,
        risk: null,
        userId,
        timestamp: Date.now()
    });
    
    // Auto-expire setup after 60s
    setTimeout(() => {
        const game = activeGames.get(userId);
        if (game && game.phase === 'setup') activeGames.delete(userId);
    }, 60000);
    
    const container = buildSetupContainer(userId);
    return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

function buildSetupContainer(userId) {
    const game = activeGames.get(userId);
    const container = createContainer(0xCAD7E6);
    addTextDisplay(container, [
        `# 💣 Minesweeper`,
        '',
        `**Bet:** ${formatNumber(game.bet)} coins`,
        '',
        `Select your grid size and risk level below:`,
    ].join('\n'));
    
    addSeparator(container, SeparatorSpacingSize.Small);
    
    const gridOptions = [
        { label: '3×3 (9 tiles)', value: '3x3', description: 'Quick game, fewer tiles', emoji: '🔲' },
        { label: '4×4 (16 tiles)', value: '4x4', description: 'Standard game', emoji: '🔳' },
        { label: '5×4 (20 tiles)', value: '5x4', description: 'Large grid, more strategy', emoji: '⬛' },
    ];
    if (game.gridKey) {
        const opt = gridOptions.find(o => o.value === game.gridKey);
        if (opt) opt.default = true;
    }
    
    const riskOptions = [
        { label: 'Low Risk', value: 'low', description: 'Fewer mines, lower multiplier', emoji: '🟢' },
        { label: 'Medium Risk', value: 'medium', description: 'Balanced mines & reward', emoji: '🟡' },
        { label: 'Hard Risk', value: 'hard', description: 'Many mines, high multiplier', emoji: '🟠' },
        { label: 'Extreme Risk', value: 'extreme', description: 'Most mines, highest multiplier', emoji: '🔴' },
    ];
    if (game.risk) {
        const opt = riskOptions.find(o => o.value === game.risk);
        if (opt) opt.default = true;
    }

    const gridSelect = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`mines_setup_grid_${userId}`)
            .setPlaceholder('Select grid size…')
            .addOptions(gridOptions)
    );
    
    const riskSelect = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`mines_setup_risk_${userId}`)
            .setPlaceholder('Select risk level…')
            .addOptions(riskOptions)
    );
    
    container.addActionRowComponents(gridSelect);
    container.addActionRowComponents(riskSelect);
    
    return container;
}

// ═══ Interaction Handler (buttons + selects) ═══
async function handleMinesInteraction(interaction) {
    const customId = interaction.customId;
    if (!customId.startsWith('mines_')) return false;
    
    const userId = interaction.user.id;
    
    // Grid selection
    if (customId.startsWith('mines_setup_grid_')) {
        const targetUser = customId.split('_')[3];
        if (userId !== targetUser) return interaction.reply({ content: '<:Cancel:1473037949187657818> Not your game!', flags: MessageFlags.Ephemeral });
        
        const game = activeGames.get(userId);
        if (!game || game.phase !== 'setup') return interaction.reply({ content: '<:Cancel:1473037949187657818> Game expired.', flags: MessageFlags.Ephemeral });
        
        game.gridKey = interaction.values[0];
        
        // Check if both selected → enable start button
        if (game.gridKey && game.risk) {
            return startGame(interaction, game);
        }
        
        const c = buildSetupContainer(userId);
        return interaction.update({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }
    
    // Risk selection
    if (customId.startsWith('mines_setup_risk_')) {
        const targetUser = customId.split('_')[3];
        if (userId !== targetUser) return interaction.reply({ content: '<:Cancel:1473037949187657818> Not your game!', flags: MessageFlags.Ephemeral });
        
        const game = activeGames.get(userId);
        if (!game || game.phase !== 'setup') return interaction.reply({ content: '<:Cancel:1473037949187657818> Game expired.', flags: MessageFlags.Ephemeral });
        
        game.risk = interaction.values[0];
        
        if (game.gridKey && game.risk) {
            return startGame(interaction, game);
        }
        
        const c = buildSetupContainer(userId);
        return interaction.update({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }
    
    // Start button (fallback — both selections auto-start now)
    if (customId.startsWith('mines_start_')) {
        const game = activeGames.get(userId);
        if (!game) return interaction.reply({ content: '<:Cancel:1473037949187657818> Game expired.', flags: 64 });
        if (game.gridKey && game.risk) return startGame(interaction, game);
        return interaction.reply({ content: '<:Cancel:1473037949187657818> Select both grid and risk first!', flags: 64 });
    }
    
    // Tile click or cashout
    const parts = customId.split('_');
    if (parts[0] === 'mines' && parts.length === 3) {
        const targetUser = parts[1];
        const action = parts[2];
        
        if (userId !== targetUser) return interaction.reply({ content: '<:Cancel:1473037949187657818> Not your game!', flags: MessageFlags.Ephemeral });
        
        const game = activeGames.get(userId);
        if (!game || game.phase !== 'playing') return interaction.reply({ content: '<:Cancel:1473037949187657818> No active game.', flags: MessageFlags.Ephemeral });
        
        if (action === 'cashout') {
            return cashOut(interaction, game);
        }
        
        const tileIdx = parseInt(action);
        if (isNaN(tileIdx)) return interaction.deferUpdate();
        
        return revealTile(interaction, game, tileIdx);
    }
    
    return false;
}

async function startGame(interaction, game) {
    // Deduct bet
    const economyManager = require('../../utils/economyManager');
    const economy = economyManager.loadEconomy();
    const { userData } = economyManager.getUser(economy, game.userId);
    
    if (userData.coins < game.bet) {
        activeGames.delete(game.userId);
        const c = createContainer(0xED4245);
        addTextDisplay(c, `<:Cancel:1473037949187657818> Not enough coins! Balance: ${formatNumber(userData.coins)}`);
        return interaction.update({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }
    
    userData.coins -= game.bet;
    userData.totalGambled = (userData.totalGambled || 0) + game.bet;
    economyManager.saveEconomy(economy);
    
    // Generate board
    game.phase = 'playing';
    game.board = generateBoard(game.gridKey, game.risk);
    game.revealed = new Set();
    game.totalSafe = game.board.filter(x => !x).length;
    game.ended = false;
    
    // Auto-expire after 2 minutes
    game.expireTimer = setTimeout(() => {
        if (activeGames.has(game.userId) && !game.ended) {
            game.ended = true;
            activeGames.delete(game.userId);
        }
    }, 120000);
    
    const container = buildGameContainer(game, 'playing');
    addSeparator(container, SeparatorSpacingSize.Small);
    const gridRows = buildGameGrid(game);
    for (const row of gridRows) container.addActionRowComponents(row);
    
    return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function revealTile(interaction, game, tileIdx) {
    if (game.revealed.has(tileIdx)) return interaction.deferUpdate();
    
    const isMine = game.board[tileIdx];
    
    if (isMine) {
        // BOOM — lost
        game.ended = true;
        game.revealed.add(tileIdx);
        clearTimeout(game.expireTimer);
        activeGames.delete(game.userId);
        
        const economyManager = require('../../utils/economyManager');
        const economy = economyManager.loadEconomy();
        const { userData } = economyManager.getUser(economy, game.userId);
        userData.totalLost = (userData.totalLost || 0) + game.bet;
        economyManager.addXP(economy, game.userId, 2);
        economyManager.saveEconomy(economy);
        
        const container = buildGameContainer(game, 'lost');
        addSeparator(container, SeparatorSpacingSize.Small);
        addTextDisplay(container, `💰 **Balance:** ${formatNumber(userData.coins)} coins`);
        addSeparator(container, SeparatorSpacingSize.Small);
        const gridRows = buildGameGrid(game, true);
        for (const row of gridRows) container.addActionRowComponents(row);
        
        return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
    
    // Safe tile
    game.revealed.add(tileIdx);
    
    // Check if all safe tiles revealed (auto-win)
    if (game.revealed.size >= game.totalSafe) {
        return cashOut(interaction, game);
    }
    
    const container = buildGameContainer(game, 'playing');
    addSeparator(container, SeparatorSpacingSize.Small);
    const gridRows = buildGameGrid(game);
    for (const row of gridRows) container.addActionRowComponents(row);
    
    return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function cashOut(interaction, game) {
    game.ended = true;
    clearTimeout(game.expireTimer);
    activeGames.delete(game.userId);
    
    const multiplier = calculateMultiplier(game.revealed.size, game.totalSafe, game.risk);
    const payout = Math.floor(game.bet * multiplier);
    const profit = payout - game.bet;
    
    const economyManager = require('../../utils/economyManager');
    const economy = economyManager.loadEconomy();
    const { userData } = economyManager.getUser(economy, game.userId);
    userData.coins += payout;
    userData.totalWon = (userData.totalWon || 0) + profit;
    economyManager.addXP(economy, game.userId, Math.min(20, game.revealed.size * 2));
    economyManager.checkAllAchievements(economy, game.userId);
    economyManager.saveEconomy(economy);
    
    const container = buildGameContainer(game, 'won');
    addSeparator(container, SeparatorSpacingSize.Small);
    addTextDisplay(container, `💰 **Balance:** ${formatNumber(userData.coins)} coins\n-# Revealed ${game.revealed.size}/${game.totalSafe} safe tiles`);
    addSeparator(container, SeparatorSpacingSize.Small);
    const gridRows = buildGameGrid(game);
    for (const row of gridRows) container.addActionRowComponents(row);
    
    return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

// ═══ Module Export ═══
module.exports = {
    data: new SlashCommandBuilder()
        .setName('mines')
        .setDescription('Play minesweeper — reveal tiles without hitting mines!')
        .addStringOption(o => o.setName('bet').setDescription('Bet amount (max 100k) or "all"').setRequired(true)),
    
    prefix: 'mines',
    description: 'Minesweeper gambling — reveal tiles, avoid mines, cash out anytime (max 100k)',
    usage: 'mines <bet>',
    category: 'economy',
    aliases: ['minesweeper', 'mine', 'ms'],
    
    handleMinesInteraction,
    
    async execute(interaction) {
        if (await gamblingGuard(interaction)) return;
        const amount = interaction.options.getString('bet');
        await handleMines((opts) => interaction.reply(opts), interaction.user.id, [amount], interaction);
    },
    
    async executePrefix(message, args) {
        if (await gamblingGuard(message)) return;
        await handleMines((opts) => message.reply(opts), message.author.id, args);
    }
};
