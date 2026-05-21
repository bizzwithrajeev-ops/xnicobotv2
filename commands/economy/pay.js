'use strict';

const { SlashCommandBuilder } = require('discord.js');
const {
    createContainer,
    addTextDisplay,
    formatNumber,
    MessageFlags
} = require('../../utils/componentHelpers');

const economyManager = require('../../utils/economyManager');
const { resolveUser } = require('../../utils/resolveUser');

/* =======================================================
   REPLY ADAPTER
   Safely handles Message & Interaction contexts
======================================================= */

function createReply(ctx) {
    // Slash command interaction
    if ('commandName' in ctx) {
        return (payload) => ctx.reply(payload);
    }

    // Prefix message
    if ('channel' in ctx) {
        return (payload) => ctx.reply(payload);
    }

    throw new Error('Invalid command context provided to pay command');
}

/* =======================================================
   CORE BUSINESS LOGIC
======================================================= */

async function handlePay(ctx, senderId, target, amount) {
    const reply = createReply(ctx);

    /* ---------- VALIDATION ---------- */

    if (!target) {
        const container = createContainer();
        addTextDisplay(
            container,
            `# <:Cancel:1473037949187657818> Invalid Usage\n\nUsage: \`pay @user <amount>\``
        );
        return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (target.id === senderId) {
        const container = createContainer();
        addTextDisplay(
            container,
            `# <:Cancel:1473037949187657818> Invalid Transaction\n\nYou cannot pay yourself.`
        );
        return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (target.bot) {
        const container = createContainer();
        addTextDisplay(
            container,
            `# <:Cancel:1473037949187657818> Invalid Transaction\n\nYou cannot pay bots.`
        );
        return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (!Number.isInteger(amount) || amount <= 0) {
        const container = createContainer();
        addTextDisplay(
            container,
            `# <:Cancel:1473037949187657818> Invalid Amount\n\nAmount must be a number greater than **0**.`
        );
        return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    /* ---------- ECONOMY ---------- */

    const economy = economyManager.loadEconomy();

    const { userData: sender } =
        economyManager.getUser(economy, senderId);

    const { userData: receiver } =
        economyManager.getUser(economy, target.id);

    if (sender.coins < amount) {
        const container = createContainer();
        addTextDisplay(
            container,
            `# <:Cancel:1473037949187657818> Insufficient Funds\n\n<:Money:1473377877239140529> **Your Balance:** ${formatNumber(sender.coins)} coins`
        );
        return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    /* ---------- TRANSFER ---------- */

    sender.coins -= amount;
    receiver.coins += amount;

    economyManager.saveEconomy(economy);

    /* ---------- SUCCESS ---------- */

    const container = createContainer();
    addTextDisplay(
        container,
        `# 💸 Payment Successful\n\n` +
        `You paid **${target.username}** <:Money:1473377877239140529> ${formatNumber(amount)} coins\n\n` +
        `<:Money:1473377877239140529> **Your New Balance:** ${formatNumber(sender.coins)} coins`
    );

    return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

/* =======================================================
   COMMAND EXPORT
======================================================= */

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Pay another user coins')
        .addUserOption(o => o.setName('user').setDescription('User to pay').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount to pay').setRequired(true).setMinValue(1)),
    name: 'pay',
    prefix: 'pay',
    aliases: ['give', 'transfer'],
    category: 'economy',

    /* ---------- SLASH ---------- */
    async execute(interaction) {
        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        return handlePay(
            interaction,
            interaction.user.id,
            target,
            amount
        );
    },

    /* ---------- PREFIX ---------- */
    async executePrefix(message, args) {
        const target = await resolveUser(message, args);
        const amount = parseInt(args[1], 10);

        return handlePay(
            message,
            message.author.id,
            target,
            amount
        );
    }
};