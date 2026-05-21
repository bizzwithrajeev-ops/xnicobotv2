'use strict';

const { MessageFlags } = require('discord.js');
const { createContainer, addTextDisplay, addSeparator, formatNumber, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const economyManager = require('../../utils/economyManager');

async function handleWithdraw(reply, userId, args) {
    const economy = economyManager.loadEconomy();
    const { userData: user } = economyManager.getUser(economy, userId);

    const input = args[0]?.toLowerCase();
    const amount = input === 'all' ? user.bank : parseInt(input, 10);

    if (amount === undefined || amount === null || isNaN(amount) || amount <= 0) {
        const container = createContainer(0xCAD7E6);
        addTextDisplay(container, [
            `# 🏦 Withdraw`,
            '',
            `**Usage:** \`withdraw <amount | all>\``,
            '',
            `**Your Balances:**`,
            `<:Money:1473377877239140529> Wallet: ${formatNumber(user.coins)} coins`,
            `🏦 Bank: ${formatNumber(user.bank)} coins`,
            '',
            `**Examples:**`,
            `\`withdraw 500\``,
            `\`withdraw all\``,
        ].join('\n'));
        return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (amount > user.bank) {
        const c = createContainer(0xED4245);
        addTextDisplay(c, '<:Cancel:1473037949187657818> You don\'t have that many coins in your bank!');
        return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    user.bank -= amount;
    user.coins += amount;
    economyManager.saveEconomy(economy);

    const container = createContainer(0xCAD7E6);
    addTextDisplay(container, [
        `# 🏦 Withdrawal Successful`,
        '',
        `<:Checkedbox:1473038547165384804> Withdrew **${formatNumber(amount)}** coins from your bank.`,
    ].join('\n'));

    addSeparator(container, SeparatorSpacingSize.Small);

    addTextDisplay(container, [
        `**New Balances:**`,
        `<:Money:1473377877239140529> Wallet: ${formatNumber(user.coins)} coins`,
        `🏦 Bank: ${formatNumber(user.bank)} coins`,
        `<:Invoice:1473039492217835550> **Total:** ${formatNumber(user.coins + user.bank)} coins`,
    ].join('\n'));

    return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
    data: new (require('discord.js').SlashCommandBuilder)()
        .setName('withdraw')
        .setDescription('Withdraw coins from your bank to your wallet')
        .addStringOption(o => o.setName('amount').setDescription('Amount to withdraw or "all"').setRequired(true)),
    prefix: 'withdraw',
    description: 'Withdraw coins from your bank to your wallet',
    usage: 'withdraw <amount|all>',
    aliases: ['with', 'take'],
    category: 'economy',

    async executePrefix(message, args) {
        return handleWithdraw(message.reply.bind(message), message.author.id, args);
    },

    async execute(interaction) {
        const amountStr = interaction.options?.getString('amount') || interaction.options?.getInteger('amount');
        return handleWithdraw(interaction.reply.bind(interaction), interaction.user.id, amountStr ? [String(amountStr)] : []);
    }
};
