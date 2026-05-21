'use strict';

const { createContainer, addTextDisplay, addSeparator, formatNumber, MessageFlags, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const economyManager = require('../../utils/economyManager');
const { gamblingGuard } = require('../../utils/economyGuards');

const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '<:Sketch:1473038248493453352>', '7️⃣', '🌟'];
const SYMBOL_NAMES = ['cherry', 'lemon', 'orange', 'grape', 'diamond', 'seven', 'star'];
const WEIGHTS = [25, 20, 18, 15, 10, 8, 4];

const PAYOUTS = {
  '🍒🍒🍒': 3,
  '🍋🍋🍋': 4,
  '🍊🍊🍊': 5,
  '🍇🍇🍇': 7,
  '<:Sketch:1473038248493453352><:Sketch:1473038248493453352><:Sketch:1473038248493453352>': 15,
  '7️⃣7️⃣7️⃣': 30,
  '🌟🌟🌟': 100,
};

const PARTIAL_PAYOUT = 1.5;

const MIN_BET = 100;
const MAX_BET = 2_000_000;
const COOLDOWN = 5_000;
const cooldowns = new Map();

function spinReel() {
  const totalWeight = WEIGHTS.reduce((a, b) => a + b, 0);
  let roll = Math.random() * totalWeight;
  for (let i = 0; i < SYMBOLS.length; i++) {
    roll -= WEIGHTS[i];
    if (roll <= 0) return { emoji: SYMBOLS[i], name: SYMBOL_NAMES[i] };
  }
  return { emoji: SYMBOLS[0], name: SYMBOL_NAMES[0] };
}

function getMultiplier(reelEmojis) {
  const key = reelEmojis.join('');
  if (PAYOUTS[key]) return PAYOUTS[key];

  if (reelEmojis[0] === reelEmojis[1] || reelEmojis[1] === reelEmojis[2] || reelEmojis[0] === reelEmojis[2]) {
    return PARTIAL_PAYOUT;
  }

  return 0;
}

async function handleSlots(reply, userId, args) {
  const now = Date.now();

  if (cooldowns.get(userId) > now) {
    const left = Math.ceil((cooldowns.get(userId) - now) / 1000);
    const c = createContainer(0xCAD7E6);
    addTextDisplay(c, `<:Clock:1473039102113878056> Wait **${left}s** before spinning again.`);
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  const economy = economyManager.loadEconomy();
  const { userData } = economyManager.getUser(economy, userId);

  const betInput = args[0]?.toLowerCase();
  let bet;
  if (betInput === 'all') {
    bet = Math.min(MAX_BET, userData.coins);
  } else {
    bet = parseInt(betInput, 10);
  }

  if (!bet || isNaN(bet) || bet < MIN_BET) {
    const container = createContainer(0xCAD7E6);
    addTextDisplay(container, [
      `# 🎰 Slot Machine`,
      '',
      `**Usage:** \`slots <amount>\``,
      `**Min Bet:** ${formatNumber(MIN_BET)}`,
      `**Max Bet:** ${formatNumber(MAX_BET)}`,
      '',
      `**Payouts:**`,
      `🍒🍒🍒 → 3x | 🍋🍋🍋 → 4x | 🍊🍊🍊 → 5x`,
      `🍇🍇🍇 → 7x | <:Sketch:1473038248493453352><:Sketch:1473038248493453352><:Sketch:1473038248493453352> → 15x | 7️⃣7️⃣7️⃣ → 30x`,
      `🌟🌟🌟 → **100x JACKPOT!**`,
      `2 matching → 1.5x`,
      '',
      `**Examples:** \`slots 5000\` · \`slots all\``,
    ].join('\n'));
    return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  if (bet > MAX_BET) {
    const c = createContainer(0xED4245);
    addTextDisplay(c, `<:Cancel:1473037949187657818> Maximum bet is **${formatNumber(MAX_BET)}** coins.`);
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }
  if (bet > userData.coins) {
    const c = createContainer(0xED4245);
    addTextDisplay(c, `<:Cancel:1473037949187657818> Not enough coins. Balance: **${formatNumber(userData.coins)}**`);
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  cooldowns.set(userId, now + COOLDOWN);

  const spinResults = [spinReel(), spinReel(), spinReel()];
  const reelEmojis = spinResults.map(r => r.emoji);
  const multiplier = getMultiplier(reelEmojis);
  const winnings = Math.floor(bet * multiplier);
  const isJackpot = reelEmojis[0] === '🌟' && reelEmojis[1] === '🌟' && reelEmojis[2] === '🌟';

  if (winnings > 0) {
    userData.coins += winnings - bet;
    userData.totalWon = (userData.totalWon || 0) + winnings;
  } else {
    userData.coins -= bet;
    userData.totalLost = (userData.totalLost || 0) + bet;
  }

  userData.totalGambled = (userData.totalGambled || 0) + bet;
  if ((userData.totalGambled || 0) >= 1_000_000) economyManager.checkAchievement(economy, userId, 'gambler');
  economyManager.addXP(economy, userId, winnings > 0 ? 8 : 3);
  economyManager.saveEconomy(economy);

  const won = winnings > 0;
  const container = createContainer(won ? 0xCAD7E6 : 0xED4245);

  addTextDisplay(container, [
    `# 🎰 Slot Machine`,
    '',
    `## ${reelEmojis.join(' | ')}`,
  ].join('\n'));

  addSeparator(container, SeparatorSpacingSize.Small);

  const resultLines = [];
  if (won) {
    resultLines.push(
      `<:Checkedbox:1473038547165384804> **${isJackpot ? '🌟 JACKPOT! ' : ''}Won ${formatNumber(winnings)} coins!** (${multiplier}x)`,
    );
  } else {
    resultLines.push(`<:Cancel:1473037949187657818> **Lost ${formatNumber(bet)} coins**`);
  }

  resultLines.push(
    '',
    `<:Money:1473377877239140529> **Balance:** ${formatNumber(userData.coins)} coins`,
    '',
    `-# ${won ? 'Spin again for more wins!' : 'Better luck next spin!'}`,
  );

  addTextDisplay(container, resultLines.join('\n'));

  return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
  data: new (require('discord.js').SlashCommandBuilder)()
    .setName('slots')
    .setDescription('Play the slot machine')
    .addStringOption(o => o.setName('amount').setDescription('Amount to bet or "all"').setRequired(true)),
  prefix: 'slots',
  aliases: ['slot'],
  category: 'economy',
  description: 'Play the slot machine',

  async executePrefix(message, args) {
    if (await gamblingGuard(message)) return;
    return handleSlots(message.reply.bind(message), message.author.id, args);
  },

  async execute(interaction) {
    if (await gamblingGuard(interaction)) return;
    const amount = interaction.options?.getString('amount') || interaction.options?.getInteger('amount');
    return handleSlots(interaction.reply.bind(interaction), interaction.user.id, amount ? [String(amount)] : []);
  }
};
