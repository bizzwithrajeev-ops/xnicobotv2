'use strict';

const { createContainer, addTextDisplay, addSeparator, formatNumber, MessageFlags, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const { formatCoins, formatCoinsShort } = require('../../utils/currencyHelper');
const { parseBet, processBetResult, getBalance, MAX_BET } = require('../../utils/betHelper');
const { gamblingGuard } = require('../../utils/economyGuards');

const COOLDOWN = 5_000;
const cooldowns = new Map();

async function handleBetflip(reply, userId, args, guildId) {
    const now = Date.now();

    if (cooldowns.get(userId) > now) {
        const left = Math.ceil((cooldowns.get(userId) - now) / 1000);
        const c = createContainer(0xCAD7E6);
        addTextDisplay(c, `<:Clock:1473039102113878056> Wait **${left}s** before flipping again.`);
        return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    const choice = args[0]?.toLowerCase();
    if (!choice || !['h', 't', 'heads', 'tails'].includes(choice)) {
        const container = createContainer(0xCAD7E6);
        addTextDisplay(container, [
            `# <:Money:1473377877239140529> Coinflip`,
            '',
            `**Usage:** \`coinflip <heads/tails> <amount>\``,
            '',
            `**Aliases:** \`h\` = heads, \`t\` = tails`,
            `**Max Bet:** ${formatNumber(MAX_BET)}`,
            '',
            `**Examples:**`,
            `\`coinflip h 1000\``,
            `\`coinflip tails 50k\``,
            `\`coinflip h all\``,
        ].join('\n'));
        return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const normalizedChoice = (choice === 'h' || choice === 'heads') ? 'heads' : 'tails';
    const balance = getBalance(userId);
    const betResult = parseBet(args[1], balance);

    if (!betResult.valid) {
        return reply(betResult.error);
    }

    const bet = betResult.amount;
    cooldowns.set(userId, now + COOLDOWN);

    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = normalizedChoice === result;

    const { userData } = processBetResult(userId, bet, won, 1);

    const coinEmoji = result === 'heads' ? '<:Money:1473377877239140529>' : '💿';
    const container = createContainer(won ? 0xCAD7E6 : 0xED4245);

    addTextDisplay(container, [
        `# <:Money:1473377877239140529> Coinflip`,
        '',
        `## ${coinEmoji} ${result.toUpperCase()}`,
        `> Your pick: **${normalizedChoice.toUpperCase()}**`,
    ].join('\n'));

    addSeparator(container, SeparatorSpacingSize.Small);

    const resultLines = [];
    if (won) {
        resultLines.push(`<:Checkedbox:1473038547165384804> **Won ${formatCoins(bet, guildId)}!**`);
    } else {
        resultLines.push(`<:Cancel:1473037949187657818> **Lost ${formatCoins(bet, guildId)}**`);
    }

    resultLines.push(
        '',
        `<:Money:1473377877239140529> **Balance:** ${formatCoins(userData.coins, guildId)}`,
        '',
        `-# ${won ? 'Nice flip! Go again?' : 'Better luck next flip!'}`,
    );

    addTextDisplay(container, resultLines.join('\n'));
    return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
    data: new (require('discord.js').SlashCommandBuilder)()
        .setName('betflip')
        .setDescription('Flip a coin and bet on heads or tails')
        .addStringOption(o => o.setName('choice').setDescription('heads or tails').setRequired(true).addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' }))
        .addStringOption(o => o.setName('amount').setDescription('Bet amount (max 100k) or "all"').setRequired(true)),

    prefix: 'betflip',
    description: 'Flip a coin — bet on heads or tails (max 100k)',
    usage: 'betflip <heads/tails> <amount>',
    category: 'economy',
    aliases: ['coinflip', 'cf', 'flip'],

    async execute(interaction) {
        if (await gamblingGuard(interaction)) return;
        const choice = interaction.options.getString('choice');
        const amount = interaction.options.getString('amount');
        await handleBetflip(
            (opts) => interaction.reply(opts),
            interaction.user.id,
            [choice, amount], interaction.guild?.id
        );
    },

    async executePrefix(message, args) {
        if (await gamblingGuard(message)) return;
        await handleBetflip(
            (opts) => message.reply(opts),
            message.author.id,
            args, message.guild?.id
        );
    }
};
