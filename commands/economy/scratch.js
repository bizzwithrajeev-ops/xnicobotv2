'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { formatCoins, formatCoinsShort, formatCoinsAmount, coinIcon } = require('../../utils/currencyHelper');
const { createContainer, addTextDisplay, addSeparator, formatNumber, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const economyManager = require('../../utils/economyManager');
const { EMOJIS } = require('../../utils/economyEmojis');
const { gamblingGuard } = require('../../utils/economyGuards');

const TICKET_COST = 500;
const COOLDOWN = 10 * 1000;
const cooldowns = new Map();

const SYMBOLS = ['🍒', '<:Sketch:1473038248493453352>', '🌟', '🎰', '🍋', '🍇', '🔔', '<:Money:1473377877239140529>'];

const PAYOUTS = {
  '<:Sketch:1473038248493453352><:Sketch:1473038248493453352><:Sketch:1473038248493453352>': 5000,
  '<:Money:1473377877239140529><:Money:1473377877239140529><:Money:1473377877239140529>': 2000,
  '🔔🔔🔔': 1000,
  '🌟🌟🌟': 750,
  '🍇🍇🍇': 500,
  '🍒🍒🍒': 300,
  '🍋🍋🍋': 200,
  '🎰🎰🎰': 1500,
};

function scratchCard() {
  const card = [];
  for (let row = 0; row < 3; row++) {
    const r = [];
    for (let col = 0; col < 3; col++) {
      r.push(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
    }
    card.push(r);
  }
  return card;
}

function calcPrize(card) {
  let prize = 0;
  const wins = [];

  for (const row of card) {
    const key = row.join('');
    if (PAYOUTS[key]) {
      prize += PAYOUTS[key];
      wins.push(`Row: ${row.join(' ')} → +${formatNumber(PAYOUTS[key])}`);
    }
  }

  for (let col = 0; col < 3; col++) {
    const colSymbols = card.map(r => r[col]);
    const key = colSymbols.join('');
    if (PAYOUTS[key]) {
      prize += PAYOUTS[key];
      wins.push(`Col: ${colSymbols.join(' ')} → +${formatNumber(PAYOUTS[key])}`);
    }
  }

  const diag1 = [card[0][0], card[1][1], card[2][2]];
  const diag2 = [card[0][2], card[1][1], card[2][0]];
  const d1key = diag1.join('');
  const d2key = diag2.join('');
  if (PAYOUTS[d1key]) { prize += PAYOUTS[d1key]; wins.push(`Diag: ${diag1.join(' ')} → +${formatNumber(PAYOUTS[d1key])}`); }
  if (PAYOUTS[d2key]) { prize += PAYOUTS[d2key]; wins.push(`Diag: ${diag2.join(' ')} → +${formatNumber(PAYOUTS[d2key])}`); }

  return { prize, wins };
}

async function handleScratch(reply, userId, count, guildId) {
  const now = Date.now();
  const lastUsed = cooldowns.get(userId) || 0;
  const remaining = COOLDOWN - (now - lastUsed);

  if (remaining > 0) {
    const secs = Math.ceil(remaining / 1000);
    const c = createContainer(0xED4245);
    addTextDisplay(c, `# ${EMOJIS.sandwatch} Cooldown\n\n${EMOJIS.alarm} Wait **${secs}s** before scratching again.`);
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  const qty = Math.max(1, Math.min(count || 1, 5));
  const totalCost = TICKET_COST * qty;

  const economy = economyManager.loadEconomy();
  const { userData } = economyManager.getUser(economy, userId);

  if ((userData.coins || 0) < totalCost) {
    const c = createContainer(0xED4245);
    addTextDisplay(c, `${EMOJIS.cancel} You need **${formatCoins(totalCost, guildId)}** to buy ${qty} ticket(s), but you only have **${formatNumber(userData.coins || 0)}**.`);
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  cooldowns.set(userId, now);
  userData.coins -= totalCost;
  userData.totalGambled = (userData.totalGambled || 0) + totalCost;

  let totalPrize = 0;
  const ticketLines = [];

  for (let i = 0; i < qty; i++) {
    const card = scratchCard();
    const { prize, wins } = calcPrize(card);
    totalPrize += prize;

    const cardStr = card.map(row => row.join('  ')).join('\n');
    const result = wins.length > 0 ? wins.map(w => `  ✅ ${w}`).join('\n') : `  ❌ No match`;
    ticketLines.push(`**Ticket #${i + 1}:**\n${cardStr}\n${result}`);
  }

  userData.coins += totalPrize;
  if (totalPrize > 0) userData.totalEarned = (userData.totalEarned || 0) + totalPrize;

  economyManager.checkAllAchievements(economy, userId);
  economyManager.saveEconomy(economy);

  const net = totalPrize - totalCost;
  const netStr = net >= 0 ? `+${formatNumber(net)}` : formatNumber(net);
  const color = totalPrize > totalCost ? 0xCAD7E6 : 0xED4245;

  const c = createContainer(color);
  addTextDisplay(c, [
    `# 🎟️ Scratch Card${qty > 1 ? 's' : ''}`,
    '',
    ticketLines.join('\n\n'),
    '',
    `🎫 **Cost:** -${formatCoins(totalCost, guildId)}`,
    `${EMOJIS.sketch} **Prize:** +${formatCoinsAmount(totalPrize, guildId)}`,
    `<:transfer:1479780506718437396> **Net:** ${netStr} coins`,
    `${coinIcon(guildId)} **Wallet:** ${formatCoinsAmount(userData.coins, guildId)}`,
  ].join('\n'));
  return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('scratch')
    .setDescription(`Buy scratch cards (${TICKET_COST} coins each) and try your luck!`)
    .addIntegerOption(o => o.setName('tickets').setDescription('Number of tickets to scratch (1–5)').setRequired(false).setMinValue(1).setMaxValue(5)),
  prefix: 'scratch',
  aliases: ['scratchcard'],
  category: 'economy',
  description: 'Buy scratch cards and try your luck',
  usage: 'scratch [1-5]',

  async executePrefix(message, args) {
    if (await gamblingGuard(message)) return;
    const qty = parseInt(args[0]) || 1;
    return handleScratch(message.reply.bind(message), message.author.id, qty, message.guild?.id);
  },

  async execute(interaction) {
    if (await gamblingGuard(interaction)) return;
    await interaction.deferReply();
    const qty = interaction.options.getInteger('tickets') || 1;
    return handleScratch(interaction.editReply.bind(interaction), interaction.user.id, qty, interaction.guild?.id);
  },
};
