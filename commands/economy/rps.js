'use strict';

/**
 * Rock Paper Scissors — bet vs the bot.
 *
 *   Win  : payout 2× (profit = bet)
 *   Tie  : refund bet (profit = 0)
 *   Lose : already deducted (profit = -bet)
 *
 * The legacy `commands/fun/rps.js` was a free vs-bot version. This
 * replaces it with a proper economy bet. The slash command takes a
 * required `bet` and a required `choice`. Prefix form supports
 * `<choice> <bet>` or `<bet> <choice>` to be forgiving.
 */

const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags
} = require('discord.js');
const economyManager = require('../../utils/economyManager');
const { parseBet, getBalance, MAX_BET } = require('../../utils/betHelper');
const { gamblingGuard } = require('../../utils/economyGuards');
const { formatCoinsShort } = require('../../utils/currencyHelper');

const CHOICES = {
    rock:     { emoji: '🪨', label: 'Rock',     beats: 'scissors' },
    paper:    { emoji: '📜', label: 'Paper',    beats: 'rock'     },
    scissors: { emoji: '✂️', label: 'Scissors', beats: 'paper'    }
};
const CHOICE_LIST = Object.keys(CHOICES);

const COOLDOWN = 4_000;
const cooldowns = new Map();

/**
 * `tokens` is the loose argv after the command name. We accept either
 * order: `rps rock 100` or `rps 100 rock`. Returns `{ choice, betArg }`
 * or null if neither token resolves to a valid choice.
 */
function pickFromTokens(tokens) {
    let choice = null, betArg = null;
    for (const t of tokens) {
        const lower = String(t || '').toLowerCase();
        if (CHOICES[lower]) { choice = lower; continue; }
        // Short aliases
        if (lower === 'r') choice = 'rock';
        else if (lower === 'p') choice = 'paper';
        else if (lower === 's') choice = 'scissors';
        else if (!betArg) betArg = lower;
    }
    return choice ? { choice, betArg } : null;
}

async function handleRps(reply, userId, guildId, choice, betArg) {
    const now = Date.now();
    if ((cooldowns.get(userId) || 0) > now) {
        const left = Math.ceil((cooldowns.get(userId) - now) / 1000);
        const c = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `<:Sandwatch:1473038580094861545> Wait **${left}s** before playing again.`
            ));
        return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    const balance = getBalance(userId);
    const betResult = parseBet(betArg, balance);

    if (!betResult.valid) {
        // No bet → show help
        if (!betArg) {
            const c = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent([
                    `# ✊ Rock Paper Scissors`,
                    ``,
                    `**Usage:** \`rps <rock|paper|scissors> <bet>\``,
                    `**Max Bet:** ${formatCoinsShort(MAX_BET, guildId)}`,
                    ``,
                    `Win pays **2×**, ties refund the bet.`,
                    ``,
                    `**Examples:**`,
                    `\`rps rock 100\``,
                    `\`rps paper all\``,
                    `\`rps s 50k\``,
                ].join('\n')));
            return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
        }
        return reply(betResult.error);
    }

    const bet = betResult.amount;
    cooldowns.set(userId, now + COOLDOWN);

    const botChoice = CHOICE_LIST[Math.floor(Math.random() * CHOICE_LIST.length)];
    const playerChoice = choice;
    const p = CHOICES[playerChoice];
    const b = CHOICES[botChoice];

    let outcome, profit, payout;
    if (playerChoice === botChoice) {
        outcome = 'tie';
        profit = 0;
        payout = bet;
    } else if (p.beats === botChoice) {
        outcome = 'win';
        profit = bet;
        payout = bet * 2;
    } else {
        outcome = 'lose';
        profit = -bet;
        payout = 0;
    }

    // Apply economy update.
    const economy = economyManager.loadEconomy();
    const { userData } = economyManager.getUser(economy, userId);
    userData.coins -= bet;
    userData.totalGambled = (userData.totalGambled || 0) + bet;
    if (payout > 0) {
        userData.coins += payout;
        if (outcome === 'win') userData.totalWon = (userData.totalWon || 0) + bet;
    }
    if (outcome === 'lose') {
        userData.totalLost = (userData.totalLost || 0) + bet;
    }
    economyManager.addXP(economy, userId, outcome === 'win' ? 6 : 2);
    economyManager.checkAllAchievements(economy, userId);
    economyManager.saveEconomy(economy);

    let resultText, color;
    if (outcome === 'win') {
        resultText = `<:Checkedbox:1473038547165384804> **You Win!** +${formatCoinsShort(profit, guildId)}`;
        color = 0x57F287;
    } else if (outcome === 'lose') {
        resultText = `<:Cancel:1473037949187657818> **You Lose!** -${formatCoinsShort(bet, guildId)}`;
        color = 0xED4245;
    } else {
        resultText = `🤝 **Tie!** Bet refunded.`;
        color = 0xFEE75C;
    }

    let content = `# ✊ Rock Paper Scissors\n\n`;
    content += `### Match\n`;
    content += `> **You:** ${p.emoji} ${p.label}\n`;
    content += `> **Bot:** ${b.emoji} ${b.label}\n\n`;
    content += `### Result\n`;
    content += `> ${resultText}\n\n`;
    content += `💼 **Balance:** ${formatCoinsShort(userData.coins, guildId)}`;

    const c = new ContainerBuilder()
        .setAccentColor(color)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Rock Paper Scissors vs the bot — bet your coins')
        .addStringOption(o => o.setName('choice').setDescription('Your move').setRequired(true)
            .addChoices(
                { name: '🪨 Rock',     value: 'rock'     },
                { name: '📜 Paper',    value: 'paper'    },
                { name: '✂️ Scissors', value: 'scissors' }
            ))
        .addStringOption(o => o.setName('bet').setDescription(`Amount to bet (max ${MAX_BET.toLocaleString()}) or "all"`).setRequired(true)),

    prefix: 'rps',
    description: 'Rock Paper Scissors vs the bot — win pays 2×, tie refunds.',
    usage: 'rps <rock|paper|scissors> <bet>',
    category: 'economy',
    aliases: ['rockpaperscissors', 'rpsbet'],

    async execute(interaction) {
        if (await gamblingGuard(interaction)) return;
        const choice = interaction.options.getString('choice');
        const bet = interaction.options.getString('bet');
        return handleRps(
            (opts) => interaction.reply(opts),
            interaction.user.id,
            interaction.guild?.id,
            choice,
            bet
        );
    },

    async executePrefix(message, args) {
        if (await gamblingGuard(message)) return;
        const parsed = pickFromTokens(args);
        if (!parsed) {
            // No choice provided → fall through to help text via empty bet.
            return handleRps(
                (opts) => message.reply(opts),
                message.author.id,
                message.guild?.id,
                'rock', // dummy; the help-text path triggers on the missing bet anyway
                null
            );
        }
        return handleRps(
            (opts) => message.reply(opts),
            message.author.id,
            message.guild?.id,
            parsed.choice,
            parsed.betArg
        );
    }
};
