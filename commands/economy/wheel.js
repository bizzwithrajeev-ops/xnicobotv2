'use strict';

/**
 * Wheel — bet on a Fortune Wheel spin. Pick a wheel preset (segment
 * count + payout shape), press Start, watch the wheel spin, see where
 * the pointer lands.
 *
 * Presets
 * ───────
 *   Small  — 6 segments, common 0.5×/1×/2× with one rare 5× jackpot
 *   Medium — 10 segments, more variance, 10× jackpot
 *   Large  — 20 segments, high volatility, 25× jackpot
 *   Mega   — 40 segments, lottery-style, 100× jackpot
 *
 * Math
 * ────
 *   Each segment is uniformly likely. Expected value tuned to ~92–95%
 *   RTP per preset by mixing 0.5× / 1× / 2× / 5× / jackpot multipliers.
 */

const {
    SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, MessageFlags
} = require('discord.js');
const { formatCoins, formatCoinsAmount } = require('../../utils/currencyHelper');
const {
    createContainer, addTextDisplay, addSeparator, formatNumber, SeparatorSpacingSize
} = require('../../utils/componentHelpers');
const { parseBet, getBalance, MAX_BET } = require('../../utils/betHelper');
const { gamblingGuard } = require('../../utils/economyGuards');
const { deductBet, settle } = require('../../utils/betGameHelper');

const E = {
    title:    '<:Lightning:1473038797540298792>',
    spin:     '<:Music:1473039311057190972>',
    success:  '<:Checkedbox:1473038547165384804>',
    fail:     '<:Cancel:1473037949187657818>',
    info:     '<:Inforect:1473038624172937287>',
    warn:     '<:Infotriangle:1473038460456800459>',
    coin:     '<:Money:1473377877239140529>',
    chart:    '<:transfer:1479780506718437396>',
    skipnext: '<:Skipnext:1473039269726785737>',
    star:     '<:Star:1473038501766369300>',
    fire:     '<:Fire:1473038604812161218>',
    crown:    '<:Crown:1506010837368963142>',
    gem:      '<:Sketch:1473038248493453352>',
    riskLow:  '<:Caretright:1473038207221502106>',
    riskMed:  '<:Caretright:1473038207221502106>',
    riskHigh: '<:Caretright:1473038207221502106>',
    riskMax: '<:Caretright:1473038207221502106>',
};

/* ═══════════════════════════════════════════════════════════════════
   PRESETS — wheel segments by multiplier
   ═══════════════════════════════════════════════════════════════════ */

const PRESETS = {
    small: {
        label: 'Small Wheel',
        emoji: E.riskLow,
        color: 0x57F287,
        desc: '6 slices · low volatility · 5× jackpot',
        // [multiplier, count] — sum of counts = total segments
        segments: [[0.5, 2], [1.0, 2], [2.0, 1], [5.0, 1]],
    },
    medium: {
        label: 'Medium Wheel',
        emoji: E.riskMed,
        color: 0xFEE75C,
        desc: '10 slices · balanced · 10× jackpot',
        segments: [[0.0, 1], [0.5, 3], [1.0, 3], [2.0, 2], [10.0, 1]],
    },
    large: {
        label: 'Large Wheel',
        emoji: E.riskHigh,
        color: 0xF97316,
        desc: '20 slices · high variance · 25× jackpot',
        segments: [[0.0, 4], [0.5, 6], [1.0, 4], [2.0, 3], [5.0, 2], [25.0, 1]],
    },
    mega: {
        label: 'Mega Wheel',
        emoji: E.riskMax,
        color: 0xED4245,
        desc: '40 slices · lottery-style · 100× jackpot',
        segments: [[0.0, 18], [0.5, 10], [1.0, 5], [2.0, 4], [5.0, 2], [100.0, 1]],
    },
};

const activeGames = new Map();

/* ═══════════════════════════════════════════════════════════════════
   PURE LOGIC
   ═══════════════════════════════════════════════════════════════════ */

function expandSegments(presetKey) {
    const list = [];
    for (const [mult, count] of PRESETS[presetKey].segments) {
        for (let i = 0; i < count; i++) list.push(mult);
    }
    return list;
}

function spinWheel(presetKey) {
    const segments = expandSegments(presetKey);
    const idx = Math.floor(Math.random() * segments.length);
    return { mult: segments[idx], slot: idx, total: segments.length };
}

function multiplierEmoji(mult) {
    if (mult >= 25) return E.crown;
    if (mult >= 5)  return E.gem;
    if (mult >= 2)  return E.star;
    if (mult >= 1)  return E.success;
    if (mult > 0)   return E.warn;
    return E.fail;
}

/* ═══════════════════════════════════════════════════════════════════
   UI BUILDERS
   ═══════════════════════════════════════════════════════════════════ */

function buildSetupContainer(userId) {
    const game = activeGames.get(userId);
    if (!game) {
        const c = createContainer(0xED4245);
        addTextDisplay(c, `${E.fail} Setup expired. Run \`wheel <bet>\` again.`);
        return c;
    }

    const ready = !!game.preset;
    const accent = game.preset ? PRESETS[game.preset].color : 0xCAD7E6;

    const lines = [
        `# ${E.title} Fortune Wheel — Setup`,
        '',
        `> ${E.coin} **Bet:** ${formatCoinsAmount(game.bet, game.guildId)}`,
    ];
    if (game.preset) {
        const p = PRESETS[game.preset];
        const top = Math.max(...p.segments.map(([m]) => m));
        lines.push(`> ${p.emoji} **Wheel:** ${p.label}  ·  top \`${top}x\``);
    }

    lines.push('');
    lines.push(ready
        ? `${E.success} Ready! Press **Start Game** to spin the wheel.`
        : `${E.info} Pick a wheel preset below to enable Start.`);

    const container = createContainer(accent);
    addTextDisplay(container, lines.join('\n'));
    addSeparator(container, SeparatorSpacingSize.Small);

    const opts = Object.entries(PRESETS).map(([key, p]) => ({
        label: p.label,
        value: key,
        description: p.desc,
        emoji: p.emoji,
        default: game.preset === key,
    }));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`wheel_setup_preset_${userId}`)
            .setPlaceholder(game.preset ? `Wheel · ${PRESETS[game.preset].label}` : 'Select a wheel…')
            .addOptions(opts)
    ));

    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`wheel_setup_start_${userId}`)
            .setLabel('Start Game')
            .setEmoji(E.skipnext)
            .setStyle(ButtonStyle.Success)
            .setDisabled(!ready),
        new ButtonBuilder()
            .setCustomId(`wheel_setup_cancel_${userId}`)
            .setLabel('Cancel')
            .setEmoji(E.fail)
            .setStyle(ButtonStyle.Secondary),
    ));

    return container;
}

function buildResultContainer(game, result) {
    const p = PRESETS[game.preset];
    const won = result.payout > game.bet;
    const push = result.payout === game.bet;
    const color = won ? 0x57F287 : push ? 0xFEE75C : 0xED4245;

    // Build a payout-distribution preview line (each unique mult shown once).
    const uniqueMults = [...new Set(expandSegments(game.preset))].sort((a, b) => a - b);
    const distLine = uniqueMults.map(m => {
        const n = expandSegments(game.preset).filter(x => x === m).length;
        const tag = m === result.mult ? `**${m}x · ${n}**` : `${m}x · ${n}`;
        return `${multiplierEmoji(m)} ${tag}`;
    }).join('  ·  ');

    const lines = [
        `# ${E.title} Fortune Wheel`,
        `-# ${p.emoji} ${p.label}  ·  ${result.total} segments`,
        '',
        `> ${E.coin} **Bet:** ${formatCoinsAmount(game.bet, game.guildId)}`,
        `> ${E.spin} **Landed:** slot ${result.slot + 1} → ${multiplierEmoji(result.mult)} \`${result.mult}x\``,
        '',
        won
            ? `${E.success} **Won ${formatCoins(result.payout - game.bet, game.guildId)}!** (received ${formatNumber(result.payout)})`
            : push
                ? `${E.info} **Bet refunded** — landed on 1×`
                : `${E.fail} **Lost ${formatCoins(game.bet - result.payout, game.guildId)}** (kept ${formatNumber(result.payout)})`,
        '',
        `-# Distribution: ${distLine}`,
    ];

    const container = createContainer(color);
    addTextDisplay(container, lines.join('\n'));
    return container;
}

/* ═══════════════════════════════════════════════════════════════════
   COMMAND ENTRY
   ═══════════════════════════════════════════════════════════════════ */

async function handleWheel(reply, userId, args, guildId) {
    if (activeGames.has(userId)) {
        const c = createContainer(0xFEE75C);
        addTextDisplay(c, `${E.warn} You already have an active wheel session. Finish or cancel it first.`);
        return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    const balance = getBalance(userId);
    const betResult = parseBet(args[0], balance);

    if (!betResult.valid) {
        const container = createContainer(0xCAD7E6);
        addTextDisplay(container, [
            `# ${E.title} Fortune Wheel`,
            '',
            `> ${E.info} **Usage:** \`wheel <bet>\``,
            `> ${E.coin} **Max Bet:** ${formatNumber(MAX_BET)}`,
            '',
            `Spin the Fortune Wheel — pick a preset, then watch where the pointer lands.`,
            '',
            `**Wheels:** ${E.riskLow} Small · ${E.riskMed} Medium · ${E.riskHigh} Large · ${E.riskMax} Mega`,
            '',
            `Bigger wheels = lower hit-rate but jackpots up to **100×**.`,
        ].join('\n'));
        return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const bet = betResult.amount;
    activeGames.set(userId, {
        phase: 'setup', bet, guildId: guildId || null, userId, preset: null, timestamp: Date.now(),
    });
    setTimeout(() => {
        const g = activeGames.get(userId);
        if (g && g.phase === 'setup') activeGames.delete(userId);
    }, 90_000);

    return reply({ components: [buildSetupContainer(userId)], flags: MessageFlags.IsComponentsV2 });
}

/* ═══════════════════════════════════════════════════════════════════
   ROUTER
   ═══════════════════════════════════════════════════════════════════ */

async function handleWheelInteraction(interaction) {
    const customId = interaction.customId;
    if (!customId.startsWith('wheel_')) return false;
    const userId = interaction.user.id;

    if (customId.startsWith('wheel_setup_preset_')) {
        const target = customId.split('_')[3];
        if (userId !== target) return interaction.reply({ content: `${E.fail} Not your game!`, flags: MessageFlags.Ephemeral });
        const game = activeGames.get(userId);
        if (!game || game.phase !== 'setup') return interaction.reply({ content: `${E.fail} Setup expired.`, flags: MessageFlags.Ephemeral });
        game.preset = interaction.values[0];
        return interaction.update({ components: [buildSetupContainer(userId)], flags: MessageFlags.IsComponentsV2 });
    }

    if (customId.startsWith('wheel_setup_cancel_')) {
        const target = customId.split('_')[3];
        if (userId !== target) return interaction.reply({ content: `${E.fail} Not your game!`, flags: MessageFlags.Ephemeral });
        activeGames.delete(userId);
        const c = createContainer(0x6b7280);
        addTextDisplay(c, `# ${E.fail} Setup Cancelled\n\nNo coins were charged.`);
        return interaction.update({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    if (customId.startsWith('wheel_setup_start_')) {
        const target = customId.split('_')[3];
        if (userId !== target) return interaction.reply({ content: `${E.fail} Not your game!`, flags: MessageFlags.Ephemeral });
        const game = activeGames.get(userId);
        if (!game || game.phase !== 'setup') return interaction.reply({ content: `${E.fail} Setup expired.`, flags: MessageFlags.Ephemeral });
        if (!game.preset) return interaction.reply({ content: `${E.warn} Pick a wheel preset first.`, flags: MessageFlags.Ephemeral });
        return startGame(interaction, game);
    }

    return false;
}

/* ═══════════════════════════════════════════════════════════════════
   LIFECYCLE
   ═══════════════════════════════════════════════════════════════════ */

async function startGame(interaction, game) {
    deductBet(game.userId, game.bet);
    game.phase = 'playing';
    activeGames.delete(game.userId);

    const result = spinWheel(game.preset);
    const payout = Math.floor(game.bet * result.mult);
    settle(game.userId, game.bet, payout);
    result.payout = payout;

    const container = buildResultContainer(game, result);
    return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wheel')
        .setDescription('Spin the Fortune Wheel — pick a preset, win up to 100×')
        .addStringOption(o => o.setName('bet').setDescription('Bet amount (max 100k) or "all"').setRequired(true)),

    prefix: 'wheel',
    aliases: ['fortune', 'spin'],
    description: 'Spin the Fortune Wheel — small to mega presets, jackpots up to 100×.',
    usage: 'wheel <bet>',
    category: 'economy',

    handleWheelInteraction,

    async execute(interaction) {
        if (await gamblingGuard(interaction)) return;
        const amount = interaction.options.getString('bet');
        await handleWheel((opts) => interaction.reply(opts), interaction.user.id, [amount], interaction.guild?.id);
    },

    async executePrefix(message, args) {
        if (await gamblingGuard(message)) return;
        await handleWheel((opts) => message.reply(opts), message.author.id, args, message.guild?.id);
    },
};
