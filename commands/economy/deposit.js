'use strict';

const { MessageFlags } = require('discord.js');
const { createContainer, addTextDisplay, addSeparator, formatNumber, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const economyManager = require('../../utils/economyManager');

async function handleDeposit(reply, userId, args) {
    const economy = economyManager.loadEconomy();
    const { userData } = economyManager.getUser(economy, userId);

    const input = args[0]?.toLowerCase();
    let amount;

    if (input === 'all') {
        amount = userData.coins;
    } else {
        amount = parseInt(input, 10);
    }

    if (amount === undefined || amount === null || isNaN(amount) || amount <= 0) {
        const container = createContainer(0xCAD7E6);
        addTextDisplay(container, [
            '# 🏦 Deposit',
            '',
            '**Usage:** `deposit <amount | all>`',
            '',
            '**Your Balances:**',
            `💰 Wallet: ${formatNumber(userData.coins)} coins`,
            `🏦 Bank: ${formatNumber(userData.bank)} coins`,
            '',
            '**Examples:**',
            '`deposit 500`',
            '`deposit all`',
        ].join('\n'));
        return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (amount > userData.coins) {
        const c = createContainer(0xED4245);
        addTextDisplay(c, '<:Cancel:1473037949187657818> You don\'t have that many coins in your wallet!');
        return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    userData.coins -= amount;
    userData.bank += amount;
    economyManager.saveEconomy(economy);

    const container = createContainer(0xCAD7E6);
    addTextDisplay(container, [
        '# 🏦 Deposit Successful',
        '',
        `<:Checkedbox:1473038547165384804> Deposited **${formatNumber(amount)}** coins.`,
    ].join('\n'));

    addSeparator(container, SeparatorSpacingSize.Small);

    addTextDisplay(container, [
        '**New Balances:**',
        `💰 Wallet: ${formatNumber(userData.coins)} coins`,
        `🏦 Bank: ${formatNumber(userData.bank)} coins`,
        `<:Invoice:1473039492217835550> **Total:** ${formatNumber(userData.coins + userData.bank)} coins`,
    ].join('\n'));

    return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
    data: new (require('discord.js').SlashCommandBuilder)()
        .setName('deposit')
        .setDescription('Deposit coins from your wallet into the bank')
        .addStringOption(o => o.setName('amount').setDescription('Amount to deposit or "all"').setRequired(true)),
    prefix: 'deposit',
    description: 'Deposit coins from your wallet into the bank',
    usage: 'deposit <amount|all>',
    aliases: ['dep'],
    category: 'economy',

    async executePrefix(message, args) {
        return handleDeposit(message.reply.bind(message), message.author.id, args);
    },

    async execute(interaction) {
        const amountStr = interaction.options?.getString('amount') || interaction.options?.getInteger('amount');
        return handleDeposit(interaction.reply.bind(interaction), interaction.user.id, amountStr ? [String(amountStr)] : []);
    }
};
