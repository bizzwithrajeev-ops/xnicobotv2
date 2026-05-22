'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createContainer, addTextDisplay, addSeparator, formatNumber, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const economyManager = require('../../utils/economyManager');
const { resolveUser } = require('../../utils/resolveUser');

async function handleBalance(reply, targetUser) {
    const economy = economyManager.loadEconomy();
    const { userData, changed } = economyManager.getUser(economy, targetUser.id);
    if (changed) economyManager.saveEconomy(economy);

    const wallet = Number(userData.coins) || 0;
    const bank = Number(userData.bank) || 0;
    const total = wallet + bank;

    const container = createContainer(0xCAD7E6);
    addTextDisplay(container, [
        '# <:Money:1473377877239140529> Balance',
        '',
        `### <:User:1473038971398520977> ${targetUser.username}`,
        '',
        `> <:Money:1473377877239140529> **Wallet:** ${formatNumber(wallet)} coins`,
        `> <:Invoice:1473039492217835550> **Bank:** ${formatNumber(bank)} coins`,
    ].join('\n'));

    addSeparator(container, SeparatorSpacingSize.Small);

    addTextDisplay(container, [
        `> <:Sketch:1473038248493453352> **Total Worth:** ${formatNumber(total)} coins`,
        '',
        `-# Use \`deposit\` and \`withdraw\` to manage your bank`,
    ].join('\n'));

    return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your or another user\'s coin balance')
        .addUserOption(o => o.setName('user').setDescription('User to check (defaults to you)').setRequired(false)),
    prefix: 'balance',
    description: 'Check your or another user\'s coin balance',
    usage: 'balance [@user]',
    aliases: ['bal', 'coins', 'money'],
    category: 'economy',

    async executePrefix(message, args) {
        const target = (await resolveUser(message, args)) || message.author;
        return handleBalance(message.reply.bind(message), target);
    },

    async execute(interaction) {
        const target = interaction.options?.getUser('user') || interaction.user;
        return handleBalance(interaction.reply.bind(interaction), target);
    }
};
