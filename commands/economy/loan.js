'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { formatCoins, formatCoinsShort , coinIcon, formatCoinsAmount } = require('../../utils/currencyHelper');
const { createContainer, addTextDisplay, formatNumber } = require('../../utils/componentHelpers');
const economyManager = require('../../utils/economyManager');
const { EMOJIS } = require('../../utils/economyEmojis');

const MAX_LOAN = 50000;
const INTEREST_RATE = 0.10;

async function handleLoan(reply, userId, subcommand, amount, guildId) {
  const economy = economyManager.loadEconomy();
  const { userData } = economyManager.getUser(economy, userId);

  /* ── STATUS ── */
  if (!subcommand || subcommand === 'status') {
    const loans = Array.isArray(userData.loans) ? userData.loans : [];
    const active = loans.filter(l => !l.cleared);

    const c = createContainer(0xCAD7E6);
    if (active.length === 0) {
      addTextDisplay(c, [
        `# <:Invoice:1473039492217835550> Loan Office`,
        '',
        `You have no outstanding loans.`,
        '',
        `**Max loan:** ${formatCoins(MAX_LOAN, guildId)}  ·  **Interest:** ${INTEREST_RATE * 100}% per day`,
        '',
        `**Commands:**`,
        `\`/loan take <amount>\` — Borrow coins`,
        `\`/loan repay <amount|all>\` — Repay your loan`,
        `\`/loan status\` — View outstanding loans`,
      ].join('\n'));
    } else {
      const daysElapsed = d => Math.max(0, Math.floor((Date.now() - (d.takenAt || Date.now())) / 86400000));
      const lines = active.map((l, i) => {
        const days = daysElapsed(l);
        const owed = Math.floor(l.amount * Math.pow(1 + INTEREST_RATE, days));
        const accrued = owed - l.amount;
        return `> **Loan #${i + 1}:** ${formatNumber(l.amount)} principal  ·  +${formatNumber(accrued)} interest (${days}d)  ·  **Total owed: ${formatNumber(owed)}**`;
      });
      const totalOwed = active.reduce((s, l) => {
        const days = daysElapsed(l);
        return s + Math.floor(l.amount * Math.pow(1 + INTEREST_RATE, days));
      }, 0);
      addTextDisplay(c, [
        `# <:Invoice:1473039492217835550> Your Loans`,
        '',
        ...lines,
        '',
        `${EMOJIS.invoice} **Total owed:** ${formatCoins(totalOwed, guildId)}`,
        `-# Interest compounds daily at ${INTEREST_RATE * 100}%`,
      ].join('\n'));
    }
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  /* ── TAKE ── */
  if (subcommand === 'take') {
    const loans = Array.isArray(userData.loans) ? userData.loans.filter(l => !l.cleared) : [];
    const totalOwed = loans.reduce((s, l) => s + (l.amount || 0), 0);

    if (loans.length >= 3) {
      const c = createContainer(0xED4245);
      addTextDisplay(c, `${EMOJIS.cancel} You already have **${loans.length}** active loans. Repay them first.`);
      return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    if (!amount || amount < 100 || amount > MAX_LOAN) {
      const c = createContainer(0xED4245);
      addTextDisplay(c, `${EMOJIS.cancel} Enter an amount between **100** and **${formatCoins(MAX_LOAN, guildId)}**.`);
      return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    if (totalOwed + amount > MAX_LOAN) {
      const c = createContainer(0xED4245);
      addTextDisplay(c, `${EMOJIS.cancel} Borrowing **${formatNumber(amount)}** would exceed your total debt limit of **${formatNumber(MAX_LOAN)}**.`);
      return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    economyManager.addLoan(economy, userId, amount);
    economyManager.saveEconomy(economy);

    const dayOwed = Math.floor(amount * (1 + INTEREST_RATE));
    const c = createContainer(0xCAD7E6);
    addTextDisplay(c, [
      `# <:Invoice:1473039492217835550> Loan Approved!`,
      '',
      `${coinIcon(guildId)} **Borrowed:** +${formatCoinsAmount(amount, guildId)}`,
      `📋 **After 1 day:** ${formatCoins(dayOwed, guildId)} owed (${INTEREST_RATE * 100}% daily interest)`,
      '',
      `💳 **Wallet:** ${formatCoins(userData.coins, guildId)}`,
      `-# Use \`/loan repay\` to pay back your loan.`,
    ].join('\n'));
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  /* ── REPAY ── */
  if (subcommand === 'repay') {
    const loans = Array.isArray(userData.loans) ? userData.loans.filter(l => !l.cleared) : [];
    if (loans.length === 0) {
      const c = createContainer(0xED4245);
      addTextDisplay(c, `${EMOJIS.cancel} You have no active loans to repay!`);
      return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    // Sum compounding interest across ALL active loans (not just
    // loans[0]). The previous version only computed totalOwed for
    // the first loan, so a user with 2-3 active loans could `repay
    // all` and only ever target the first one.
    const totalOwed = loans.reduce((acc, l) => {
      const days = Math.max(0, Math.floor((Date.now() - (l.takenAt || Date.now())) / 86400000));
      const rate = Number(l.interest) || INTEREST_RATE;
      return acc + Math.floor((l.amount || 0) * Math.pow(1 + rate, days));
    }, 0);
    const repayAmt = (!amount || amount < 0) ? totalOwed : Math.min(amount, totalOwed);

    if ((userData.coins || 0) < repayAmt) {
      const c = createContainer(0xED4245);
      addTextDisplay(c, `${EMOJIS.cancel} You need **${formatCoins(repayAmt, guildId)}** but only have **${formatNumber(userData.coins || 0)}**.`);
      return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    const result = economyManager.repayLoan(economy, userId, repayAmt);
    economyManager.saveEconomy(economy);

    const stillOwed = (Array.isArray(userData.loans) ? userData.loans.filter(l => !l.cleared) : [])
      .reduce((s, l) => s + (l.amount || 0), 0);

    const c = createContainer(0xCAD7E6);
    addTextDisplay(c, [
      `# <:Checkedbox:1473038547165384804> Loan Repaid!`,
      '',
      `${coinIcon(guildId)} **Paid:** ${formatCoinsAmount(result.paid || repayAmt, guildId)}`,
      result.cleared ? `${EMOJIS.check} All loans fully cleared!` : `${EMOJIS.invoice} **Still owed:** ${formatCoins(stillOwed, guildId)}`,
      `${coinIcon(guildId)} **Wallet:** ${formatCoinsAmount(userData.coins, guildId)}`,
    ].join('\n'));
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  const c = createContainer(0xED4245);
  addTextDisplay(c, `${EMOJIS.cancel} Unknown subcommand. Use \`take\`, \`repay\`, or \`status\`.`);
  return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
    /**
     * Premium-gated feature. `premiumOnly` is read by the
     * command dispatcher in index.js — non-premium users get a
     * polite message instead of execution.
     */
    premiumOnly: true,

  data: new SlashCommandBuilder()
    .setName('loan')
    .setDescription('Take or repay a loan — interest compounds daily at 10%')
    .addSubcommand(sub => sub.setName('status').setDescription('View your current loans'))
    .addSubcommand(sub => sub.setName('take')
      .setDescription('Take a loan from the bank')
      .addIntegerOption(o => o.setName('amount').setDescription('Amount to borrow (100–50000)').setRequired(true).setMinValue(100).setMaxValue(50000)))
    .addSubcommand(sub => sub.setName('repay')
      .setDescription('Repay your loan')
      .addStringOption(o => o.setName('amount').setDescription('Amount to repay or "all"').setRequired(false))),
  prefix: 'loan',
  aliases: ['borrow'],
  category: 'economy',
  description: 'Take or repay a loan with daily compounding interest',
  usage: 'loan <status|take|repay> [amount]',

  async executePrefix(message, args) {
    const sub = args[0]?.toLowerCase() || 'status';
    const rawAmt = args[1];
    const amt = rawAmt === 'all' ? -1 : parseInt(rawAmt);
    return handleLoan(message.reply.bind(message), message.author.id, sub, isNaN(amt) ? null : amt, message.guild?.id);
  },

  async execute(interaction) {
    await interaction.deferReply();
    const sub = interaction.options.getSubcommand();
    let amt = null;
    if (sub === 'take') {
      amt = interaction.options.getInteger('amount');
    } else if (sub === 'repay') {
      const raw = interaction.options.getString('amount');
      amt = raw === 'all' ? -1 : (parseInt(raw) || -1);
    }
    return handleLoan(interaction.editReply.bind(interaction), interaction.user.id, sub, amt, interaction.guild?.id);
  },
};
