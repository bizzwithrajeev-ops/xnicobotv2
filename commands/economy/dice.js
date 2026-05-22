'use strict';

const { createContainer, addTextDisplay, addSeparator, formatNumber, MessageFlags, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const { parseBet, processBetResult, getBalance, MAX_BET } = require('../../utils/betHelper');
const { gamblingGuard } = require('../../utils/economyGuards');
const { resolveUser } = require('../../utils/resolveUser');

const COOLDOWN = 5_000;
const cooldowns = new Map();

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

async function handleDice(reply, userId, args, opponent = null) {
    const now = Date.now();

    if (cooldowns.get(userId) > now) {
        const left = Math.ceil((cooldowns.get(userId) - now) / 1000);
        const c = createContainer(0xCAD7E6);
        addTextDisplay(c, `<:Clock:1473039102113878056> Wait **${left}s** before rolling again.`);
        return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    const balance = getBalance(userId);
    const betResult = parseBet(args[0], balance);

    if (!betResult.valid) {
        const container = createContainer(0xCAD7E6);
        addTextDisplay(container, [
            `# <:Gamepad:1473039216429498409> Dice Roll`,
            '',
            `**Usage:** \`dice <amount> [@opponent]\``,
            `**Max Bet:** ${formatNumber(MAX_BET)}`,
            '',
            `Roll against the bot or challenge another player!`,
            `Higher roll wins. Ties = push (no loss).`,
            '',
            `**Examples:**`,
            `\`dice 500\` — Roll vs bot`,
            `\`dice 1000 @user\` — Challenge a player`,
            `\`dice all\` — Bet everything (up to 100k)`,
        ].join('\n'));
        return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const bet = betResult.amount;
    cooldowns.set(userId, now + COOLDOWN);

    // Roll dice
    const playerRoll = Math.floor(Math.random() * 6) + 1;
    const opponentRoll = Math.floor(Math.random() * 6) + 1;
    const opponentName = opponent ? `<@${opponent.id}>` : '🤖 Bot';

    let won, tie = false;
    if (playerRoll > opponentRoll) won = true;
    else if (playerRoll < opponentRoll) won = false;
    else { won = false; tie = true; }

    // Process bet (tie = no change)
    let userData;
    if (tie) {
        const economyManager = require('../../utils/economyManager');
        const economy = economyManager.loadEconomy();
        ({ userData } = economyManager.getUser(economy, userId));
    } else {
        ({ userData } = processBetResult(userId, bet, won, 1));
    }

    const container = createContainer(won ? 0x57F287 : (tie ? 0xFEE75C : 0xED4245));

    addTextDisplay(container, [
        `# <:Gamepad:1473039216429498409> Dice Roll`,
        '',
        `### You: ${DICE_FACES[playerRoll - 1]} **${playerRoll}**`,
        `### ${opponentName}: ${DICE_FACES[opponentRoll - 1]} **${opponentRoll}**`,
    ].join('\n'));

    addSeparator(container, SeparatorSpacingSize.Small);

    if (tie) {
        addTextDisplay(container, `🤝 **Tie!** No coins lost.\n\n<:Money:1473377877239140529> **Balance:** ${formatNumber(userData.coins)} coins`);
    } else if (won) {
        addTextDisplay(container, `<:Checkedbox:1473038547165384804> **You won ${formatNumber(bet)} coins!**\n\n<:Money:1473377877239140529> **Balance:** ${formatNumber(userData.coins)} coins`);
    } else {
        addTextDisplay(container, `<:Cancel:1473037949187657818> **You lost ${formatNumber(bet)} coins**\n\n<:Money:1473377877239140529> **Balance:** ${formatNumber(userData.coins)} coins`);
    }

    return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
    data: new (require('discord.js').SlashCommandBuilder)()
        .setName('dice')
        .setDescription('Roll dice against the bot or another player')
        .addStringOption(o => o.setName('amount').setDescription('Bet amount (max 100k) or "all"').setRequired(true))
        .addUserOption(o => o.setName('opponent').setDescription('Challenge a player (optional, bot plays if empty)')),

    prefix: 'dice',
    description: 'Roll dice — higher roll wins (max 100k bet)',
    usage: 'dice <amount> [@opponent]',
    category: 'economy',
    aliases: ['diceroll'],

    async execute(interaction) {
        if (await gamblingGuard(interaction)) return;
        const amount = interaction.options.getString('amount');
        const opponent = interaction.options.getUser('opponent');
        await handleDice(
            (opts) => interaction.reply(opts),
            interaction.user.id,
            [amount],
            opponent
        );
    },

    async executePrefix(message, args) {
        if (await gamblingGuard(message)) return;
        const opponent = await resolveUser(message, args);
        await handleDice(
            (opts) => message.reply(opts),
            message.author.id,
            [args[0]],
            opponent
        );
    }
};
