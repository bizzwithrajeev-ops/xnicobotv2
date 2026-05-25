'use strict';

/**
 * Minesweeper — bet on revealing safe tiles, cash out for a multiplier.
 *
 * Bug fixes in this rewrite
 * ─────────────────────────
 * 1. `buildGameContainer`, `buildSetupContainer`, `revealTile`, and
 *    `cashOut` all referenced a free `guildId` variable that wasn't in
 *    scope. Calling them threw `ReferenceError` mid-game (silently
 *    swallowed by Discord.js). Fixed by storing `guildId` on the
 *    `game` object at creation time and reading `game.guildId`
 *    everywhere downstream.
 * 2. `executePrefix` called `handleMines(reply, userId, args, guildId)`
 *    with only 4 args, but the signature expects
 *    `(reply, userId, args, interaction, guildId)` — so `guildId` was
 *    being passed as `interaction` and the actual guildId was
 *    `undefined`. Aligned the signatures.
 * 3. The "Lost" balance display, "Won" balance display, and "Potential"
 *    payout text all read `formatCoins(..., guildId)` from the missing
 *    free variable — same bug, same fix.
 * 4. Removed unused `interaction` parameter from `handleMines` since
 *    nothing in the function used it.
 *
 * Custom emojis
 * ─────────────
 * Replaced unicode mine/risk emoji with the codebase's custom set so
 * the appearance is consistent with every other panel:
 *   <:Lightning:..>      title / cashout
 *   <:Cancel:..>         hit-mine state, full-board mine reveal
 *   <:Checkedbox:..>     cash-out success
 *   <:Toggleon:..>       low risk
 *   <:idle:..>           medium risk
 *   <:Fire:..>           hard risk
 *   <:Toggleoff:..>      extreme risk
 *   <:Sketch:..>         revealed safe tile (gem)
 */

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { formatCoins, formatCoinsShort, coinIcon, coinEmoji } = require('../../utils/currencyHelper');
const { createContainer, addTextDisplay, addSeparator, formatNumber, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const { parseBet, getBalance, MAX_BET } = require('../../utils/betHelper');
const { gamblingGuard } = require('../../utils/economyGuards');

/* ═══════════════════════════════════════════════════════════════════
   GAME CONFIG
   ═══════════════════════════════════════════════════════════════════ */

const GRIDS = {
    '3x3': { rows: 3, cols: 3, total: 9 },
    '4x4': { rows: 4, cols: 4, total: 16 },
    '5x4': { rows: 4, cols: 5, total: 20 },
};

const RISKS = {
    low: {
        mines: { '3x3': 1, '4x4': 3,  '5x4': 4  },
        baseMultiplier: 1.2,
        label: '✧ Low',
        color: 0x57F287
    },
    medium: {
        mines: { '3x3': 2, '4x4': 5,  '5x4': 7  },
        baseMultiplier: 1.5,
        label: '✦ Medium',
        color: 0xFEE75C
    },
    hard: {
        mines: { '3x3': 3, '4x4': 7,  '5x4': 10 },
        baseMultiplier: 2.0,
        label: '𖤍 Hard',
        color: 0xF97316
    },
    extreme: {
        mines: { '3x3': 5, '4x4': 10, '5x4': 15 },
        baseMultiplier: 3.5,
        label: '𖤐 Extreme',
        color: 0xED4245
    },
};

const TITLE_EMOJI       = '<:Lightning:1473038797540298792>';
const SAFE_TILE_EMOJI   = '<:Sketch:1473038248493453352>';
const MINE_EMOJI        = '<:Cancel:1473037949187657818>';
const SUCCESS_EMOJI     = '<:Checkedbox:1473038547165384804>';
const WARN_EMOJI        = '<:Infotriangle:1473038460456800459>';

/** Active games keyed by userId. */
const activeGames = new Map();

/* ═══════════════════════════════════════════════════════════════════
   PURE GAME LOGIC
   ═══════════════════════════════════════════════════════════════════ */

function calculateMultiplier(revealed, totalSafe, risk) {
    if (revealed === 0) return 1;
    const base = RISKS[risk].baseMultiplier;
    return Math.round((Math.pow(base, revealed) + (revealed * 0.1)) * 100) / 100;
}

function generateBoard(gridKey, risk) {
    const grid = GRIDS[gridKey];
    const mineCount = RISKS[risk].mines[gridKey];
    const board = Array(grid.total).fill(false);
    let placed = 0;
    while (placed < mineCount) {
        const pos = Math.floor(Math.random() * grid.total);
        if (!board[pos]) { board[pos] = true; placed++; }
    }
    return board;
}

/* ═══════════════════════════════════════════════════════════════════
   UI BUILDERS
   ═══════════════════════════════════════════════════════════════════ */

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
                btn = new ButtonBuilder()
                    .setCustomId(`mines_${game.userId}_${idx}`)
                    .setEmoji(MINE_EMOJI)
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true);
            } else if (isRevealed) {
                btn = new ButtonBuilder()
                    .setCustomId(`mines_${game.userId}_${idx}`)
                    .setEmoji(SAFE_TILE_EMOJI)
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true);
            } else if (game.ended) {
                btn = new ButtonBuilder()
                    .setCustomId(`mines_${game.userId}_${idx}`)
                    .setLabel('·')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true);
            } else {
                btn = new ButtonBuilder()
                    .setCustomId(`mines_${game.userId}_${idx}`)
                    .setLabel('·')
                    .setStyle(ButtonStyle.Secondary);
            }
            row.addComponents(btn);
        }
        rows.push(row);
    }

    if (!game.ended && game.revealed.size > 0) {
        const mult = calculateMultiplier(game.revealed.size, game.totalSafe, game.risk);
        const payout = Math.floor(game.bet * mult);
        // The guild's currency may be a free-form string from the
        // dashboard (`$`, `coins`, ...). `setEmoji` only accepts
        // valid unicode or `<:NAME:ID>` custom emoji — anything else
        // makes Discord reject the whole component payload with
        // INVALID_FORM_BODY. Fall back to no emoji in that case.
        const cashoutBtn = new ButtonBuilder()
            .setCustomId(`mines_${game.userId}_cashout`)
            .setLabel(`Cash Out · ${mult}x = ${formatNumber(payout)}`)
            .setStyle(ButtonStyle.Primary);
        const safeIcon = coinEmoji(game.guildId);
        if (safeIcon) cashoutBtn.setEmoji(safeIcon);
        const cashoutRow = new ActionRowBuilder().addComponents(cashoutBtn);
        rows.push(cashoutRow);
    }

    return rows;
}

function buildGameContainer(game, status = 'playing') {
    const multiplier = calculateMultiplier(game.revealed.size, game.totalSafe, game.risk);
    const potential = Math.floor(game.bet * multiplier);
    const riskInfo = RISKS[game.risk];
    const mineCount = riskInfo.mines[game.gridKey];

    let color = riskInfo.color;
    let statusText = '';

    if (status === 'playing') {
        statusText =
            `**Revealed:** ${game.revealed.size}/${game.totalSafe} safe tiles\n` +
            `**Multiplier:** ${multiplier}x\n` +
            `**Potential:** ${formatCoins(potential, game.guildId)}`;
    } else if (status === 'won') {
        color = 0x57F287;
        statusText =
            `${SUCCESS_EMOJI} **Cashed out at ${multiplier}x!**\n` +
            `**Won:** ${formatCoins(potential, game.guildId)} (+${formatNumber(potential - game.bet)})`;
    } else if (status === 'lost') {
        color = 0xED4245;
        statusText =
            `${MINE_EMOJI} **BOOM! Hit a mine!**\n` +
            `**Lost:** ${formatCoins(game.bet, game.guildId)}`;
    }

    const container = createContainer(color);
    addTextDisplay(container, [
        `# ${TITLE_EMOJI} Minesweeper`,
        '',
        `**Grid:** ${game.gridKey} • **Risk:** ${riskInfo.label} • **Mines:** ${mineCount}`,
        `**Bet:** ${formatCoins(game.bet, game.guildId)}`,
        '',
        statusText,
    ].join('\n'));

    return container;
}

function buildSetupContainer(userId) {
    const game = activeGames.get(userId);
    if (!game) {
        const c = createContainer(0xED4245);
        addTextDisplay(c, `${MINE_EMOJI} Setup expired. Run \`mines <bet>\` again.`);
        return c;
    }

    const container = createContainer(0xCAD7E6);
    addTextDisplay(container, [
        `# ${TITLE_EMOJI} Minesweeper`,
        '',
        `**Bet:** ${formatCoins(game.bet, game.guildId)}`,
        '',
        `Select your grid size and risk level below:`,
    ].join('\n'));

    addSeparator(container, SeparatorSpacingSize.Small);

    const gridOptions = [
        { label: '3×3 (9 tiles)',  value: '3x3', description: 'Quick game, fewer tiles',     emoji: '🔲' },
        { label: '4×4 (16 tiles)', value: '4x4', description: 'Standard game',                emoji: '🔳' },
        { label: '5×4 (20 tiles)', value: '5x4', description: 'Large grid, more strategy',   emoji: '⬛' },
    ];
    if (game.gridKey) {
        const opt = gridOptions.find(o => o.value === game.gridKey);
        if (opt) opt.default = true;
    }

    const riskOptions = [
        { label: 'Low Risk',     value: 'low',     description: 'Fewer mines, lower multiplier',     emoji: '✧'  },
        { label: 'Medium Risk',  value: 'medium',  description: 'Balanced mines & reward',            emoji: '✦'      },
        { label: 'Hard Risk',    value: 'hard',    description: 'Many mines, high multiplier',        emoji: '𖤐'      },
        { label: 'Extreme Risk', value: 'extreme', description: 'Most mines, highest multiplier',     emoji: '𖤍' },
    ];
    if (game.risk) {
        const opt = riskOptions.find(o => o.value === game.risk);
        if (opt) opt.default = true;
    }

    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`mines_setup_grid_${userId}`)
            .setPlaceholder('Select grid size…')
            .addOptions(gridOptions)
    ));

    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`mines_setup_risk_${userId}`)
            .setPlaceholder('Select risk level…')
            .addOptions(riskOptions)
    ));

    return container;
}

/* ═══════════════════════════════════════════════════════════════════
   COMMAND HANDLER
   ═══════════════════════════════════════════════════════════════════ */

async function handleMines(reply, userId, args, guildId) {
    if (activeGames.has(userId)) {
        const c = createContainer(0xFEE75C);
        addTextDisplay(c, `${WARN_EMOJI} You already have an active mines game! Finish it first or it will expire in 2 minutes.`);
        return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    const balance = getBalance(userId);
    const betResult = parseBet(args[0], balance);

    if (!betResult.valid) {
        const container = createContainer(0xCAD7E6);
        addTextDisplay(container, [
            `# ${TITLE_EMOJI} Minesweeper`,
            '',
            `**Usage:** \`mines <bet>\``,
            `**Max Bet:** ${formatNumber(MAX_BET)}`,
            '',
            `Reveal tiles without hitting a mine. Each safe tile increases your multiplier.`,
            `Cash out anytime to lock in your winnings.`,
            '',
            `**Grids:** 3×3 • 4×4 • 5×4`,
            `**Risks:** <:Toggleon:1473038585501581312> Low · <:idle:1473370085719863366> Medium · <:Fire:1473038604812161218> Hard · <:Toggleoff:1473038582813032590> Extreme`,
            '',
            `Higher risk = more mines = higher multipliers.`,
        ].join('\n'));
        return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const bet = betResult.amount;

    activeGames.set(userId, {
        phase: 'setup',
        bet,
        guildId: guildId || null,   // ← persisted onto the game object so every helper has it
        gridKey: null,
        risk: null,
        userId,
        timestamp: Date.now()
    });

    // Auto-expire setup after 60s
    setTimeout(() => {
        const game = activeGames.get(userId);
        if (game && game.phase === 'setup') activeGames.delete(userId);
    }, 60_000);

    return reply({
        components: [buildSetupContainer(userId)],
        flags: MessageFlags.IsComponentsV2
    });
}

/* ═══════════════════════════════════════════════════════════════════
   INTERACTION ROUTER
   ═══════════════════════════════════════════════════════════════════ */

async function handleMinesInteraction(interaction) {
    const customId = interaction.customId;
    if (!customId.startsWith('mines_')) return false;

    const userId = interaction.user.id;

    /* ── Setup: pick grid ─────────────────────────────────────────── */
    if (customId.startsWith('mines_setup_grid_')) {
        const targetUser = customId.split('_')[3];
        if (userId !== targetUser) {
            return interaction.reply({ content: `${MINE_EMOJI} Not your game!`, flags: MessageFlags.Ephemeral });
        }
        const game = activeGames.get(userId);
        if (!game || game.phase !== 'setup') {
            return interaction.reply({ content: `${MINE_EMOJI} Game expired.`, flags: MessageFlags.Ephemeral });
        }
        game.gridKey = interaction.values[0];
        if (game.gridKey && game.risk) return startGame(interaction, game);
        return interaction.update({
            components: [buildSetupContainer(userId)],
            flags: MessageFlags.IsComponentsV2
        });
    }

    /* ── Setup: pick risk ─────────────────────────────────────────── */
    if (customId.startsWith('mines_setup_risk_')) {
        const targetUser = customId.split('_')[3];
        if (userId !== targetUser) {
            return interaction.reply({ content: `${MINE_EMOJI} Not your game!`, flags: MessageFlags.Ephemeral });
        }
        const game = activeGames.get(userId);
        if (!game || game.phase !== 'setup') {
            return interaction.reply({ content: `${MINE_EMOJI} Game expired.`, flags: MessageFlags.Ephemeral });
        }
        game.risk = interaction.values[0];
        if (game.gridKey && game.risk) return startGame(interaction, game);
        return interaction.update({
            components: [buildSetupContainer(userId)],
            flags: MessageFlags.IsComponentsV2
        });
    }

    /* ── Tile click or cashout ────────────────────────────────────── */
    const parts = customId.split('_');
    if (parts[0] === 'mines' && parts.length === 3) {
        const targetUser = parts[1];
        const action = parts[2];

        if (userId !== targetUser) {
            return interaction.reply({ content: `${MINE_EMOJI} Not your game!`, flags: MessageFlags.Ephemeral });
        }
        const game = activeGames.get(userId);
        if (!game || game.phase !== 'playing') {
            return interaction.reply({ content: `${MINE_EMOJI} No active game.`, flags: MessageFlags.Ephemeral });
        }

        if (action === 'cashout') return cashOut(interaction, game);

        const tileIdx = parseInt(action, 10);
        if (isNaN(tileIdx)) return interaction.deferUpdate();

        return revealTile(interaction, game, tileIdx);
    }

    return false;
}

/* ═══════════════════════════════════════════════════════════════════
   GAME LIFECYCLE
   ═══════════════════════════════════════════════════════════════════ */

async function startGame(interaction, game) {
    const economyManager = require('../../utils/economyManager');
    const economy = economyManager.loadEconomy();
    const { userData } = economyManager.getUser(economy, game.userId);

    if (userData.coins < game.bet) {
        activeGames.delete(game.userId);
        const c = createContainer(0xED4245);
        addTextDisplay(c, `${MINE_EMOJI} Not enough coins. Balance: ${formatCoins(userData.coins, game.guildId)}`);
        return interaction.update({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    userData.coins -= game.bet;
    userData.totalGambled = (userData.totalGambled || 0) + game.bet;
    economyManager.saveEconomy(economy);

    game.phase     = 'playing';
    game.board     = generateBoard(game.gridKey, game.risk);
    game.revealed  = new Set();
    game.totalSafe = game.board.filter(x => !x).length;
    game.ended     = false;

    // Auto-expire after 2 minutes
    game.expireTimer = setTimeout(() => {
        if (activeGames.has(game.userId) && !game.ended) {
            game.ended = true;
            activeGames.delete(game.userId);
        }
    }, 120_000);

    const container = buildGameContainer(game, 'playing');
    addSeparator(container, SeparatorSpacingSize.Small);
    for (const row of buildGameGrid(game)) container.addActionRowComponents(row);

    return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function revealTile(interaction, game, tileIdx) {
    // Anti-double-click + race-with-end guard. The previous
    // implementation only checked `revealed.has(tileIdx)`, which
    // means two near-simultaneous clicks both saw an empty set,
    // both called `interaction.update`, and the second threw
    // `InteractionAlreadyReplied` (logged but visible to the user).
    if (game.ended) return interaction.deferUpdate().catch(() => {});
    if (game.revealed.has(tileIdx)) return interaction.deferUpdate().catch(() => {});

    // Mark as in-flight so a parallel click on a different tile
    // bails out before mutating shared state.
    if (game._processing) return interaction.deferUpdate().catch(() => {});
    game._processing = true;
    try {
        const isMine = game.board[tileIdx];

        if (isMine) {
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
            addTextDisplay(container, `${coinIcon(game.guildId)} **Balance:** ${formatCoins(userData.coins, game.guildId)}`);
            addSeparator(container, SeparatorSpacingSize.Small);
            for (const row of buildGameGrid(game, true)) container.addActionRowComponents(row);

            return await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        game.revealed.add(tileIdx);

        // Auto-cashout when every safe tile has been revealed
        if (game.revealed.size >= game.totalSafe) return await cashOut(interaction, game);

        const container = buildGameContainer(game, 'playing');
        addSeparator(container, SeparatorSpacingSize.Small);
        for (const row of buildGameGrid(game)) container.addActionRowComponents(row);

        return await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } finally {
        game._processing = false;
    }
}

async function cashOut(interaction, game) {
    // Race guard: if another click is already settling the game,
    // swallow this one instead of double-paying out.
    if (game.ended || game._cashedOut) return interaction.deferUpdate().catch(() => {});
    game._cashedOut = true;
    game.ended = true;
    clearTimeout(game.expireTimer);
    activeGames.delete(game.userId);

    const multiplier = calculateMultiplier(game.revealed.size, game.totalSafe, game.risk);
    const payout = Math.floor(game.bet * multiplier);
    const profit = payout - game.bet;

    const economyManager = require('../../utils/economyManager');
    const economy = economyManager.loadEconomy();
    const { userData } = economyManager.getUser(economy, game.userId);
    userData.coins   += payout;
    userData.totalWon = (userData.totalWon || 0) + Math.max(0, profit);
    economyManager.addXP(economy, game.userId, Math.min(20, game.revealed.size * 2));
    economyManager.checkAllAchievements(economy, game.userId);
    economyManager.saveEconomy(economy);

    const container = buildGameContainer(game, 'won');
    addSeparator(container, SeparatorSpacingSize.Small);
    addTextDisplay(container,
        `${coinIcon(game.guildId)} **Balance:** ${formatCoins(userData.coins, game.guildId)}\n`
        + `-# Revealed ${game.revealed.size}/${game.totalSafe} safe tiles`);
    addSeparator(container, SeparatorSpacingSize.Small);
    for (const row of buildGameGrid(game)) container.addActionRowComponents(row);

    return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

/* ═══════════════════════════════════════════════════════════════════
   MODULE EXPORT
   ═══════════════════════════════════════════════════════════════════ */

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mines')
        .setDescription('Play minesweeper — reveal tiles without hitting mines')
        .addStringOption(o => o.setName('bet').setDescription('Bet amount (max 100k) or "all"').setRequired(true)),

    prefix: 'mines',
    description: 'Minesweeper gambling — reveal tiles, avoid mines, cash out anytime (max 100k)',
    usage: 'mines <bet>',
    category: 'economy',
    aliases: ['minesweeper', 'ms'],

    handleMinesInteraction,

    async execute(interaction) {
        if (await gamblingGuard(interaction)) return;
        const amount = interaction.options.getString('bet');
        await handleMines(
            (opts) => interaction.reply(opts),
            interaction.user.id,
            [amount],
            interaction.guild?.id
        );
    },

    async executePrefix(message, args) {
        if (await gamblingGuard(message)) return;
        await handleMines(
            (opts) => message.reply(opts),
            message.author.id,
            args,
            message.guild?.id
        );
    }
};
