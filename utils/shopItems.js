'use strict';

const CATEGORIES = {
  consumable: { label: 'Consumables', emoji: '🧪', color: 0x22c55e },
  boost:      { label: 'Boosts',      emoji: '⚡', color: 0xfbbf24 },
  loot:       { label: 'Loot Boxes',  emoji: '📦', color: 0x8b5cf6 },
  special:    { label: 'Special',     emoji: '<:Star:1473038501766369300>', color: 0xec4899 },
  seeds:      { label: 'Seeds',       emoji: '🌱', color: 0x16a34a },
  mining:     { label: 'Mining Gear', emoji: '⛏', color: 0x78716c },
  materials:  { label: 'Materials',   emoji: '🪨', color: 0x57534e },
};

const ITEMS = {

  /* ═══════════════ CONSUMABLES ═══════════════
   * type: 'use' — consumed on use, give an immediate effect
   * ═══════════════════════════════════════════ */

  ticket: {
    name: 'Lottery Ticket',
    emoji: '🎫',
    price: 500,
    sellPrice: 250,
    description: 'Enter the weekly lottery draw — more tickets = higher chance to win',
    category: 'consumable',
    type: 'use',
    stackable: true,
    maxOwn: 50,
  },
  gem: {
    name: 'Pet Gem',
    emoji: '<:Sketch:1473038248493453352>',
    price: 10000,
    sellPrice: 5000,
    description: 'Feeds your active pet +100 EXP instantly',
    category: 'consumable',
    type: 'use',
    stackable: true,
    maxOwn: 99,
    requiresPet: true,
  },
  xp_potion: {
    name: 'XP Potion',
    emoji: '🧪',
    price: 8000,
    sellPrice: 3000,
    description: 'Supercharges your active pet with +150 EXP immediately',
    category: 'consumable',
    type: 'use',
    stackable: true,
    maxOwn: 99,
    requiresPet: true,
  },
  coin_bag: {
    name: 'Coin Bag',
    emoji: '💰',
    price: 3000,
    sellPrice: 1500,
    description: 'Open it to receive 5,000–15,000 random coins — luck decides',
    category: 'consumable',
    type: 'use',
    stackable: true,
    maxOwn: 50,
  },
  health_pack: {
    name: 'Health Pack',
    emoji: '🩹',
    price: 5000,
    sellPrice: 2000,
    description: 'Fully restores your active pet\'s HP to its maximum',
    category: 'consumable',
    type: 'use',
    stackable: true,
    maxOwn: 20,
    requiresPet: true,
  },
  energy_drink: {
    name: 'Energy Drink',
    emoji: '🥤',
    price: 6000,
    sellPrice: 2500,
    description: 'Instantly resets your work cooldown — work again right now',
    category: 'consumable',
    type: 'use',
    stackable: true,
    maxOwn: 10,
  },

  /* ═══════════════ BOOSTS ═══════════════════
   * type: 'stat' — permanent stacking stat increase (capped)
   * ════════════════════════════════════════== */

  trophy: {
    name: 'Trophy',
    emoji: '<:Award:1473038391632203887>',
    price: 5000,
    sellPrice: 2500,
    description: 'Permanent +2% work & daily income bonus (stacks up to 50%)',
    category: 'boost',
    type: 'stat',
    stackable: true,
    maxOwn: 25,
  },
  medal: {
    name: 'Medal',
    emoji: '🏅',
    price: 3000,
    sellPrice: 1500,
    description: 'Permanent +5% gamble bonus on all bets (stacks up to 25%)',
    category: 'boost',
    type: 'stat',
    stackable: true,
    maxOwn: 5,
  },
  crown: {
    name: 'Crown',
    emoji: '<a:Crown:1473366446984663123>',
    price: 25000,
    sellPrice: 12500,
    description: 'Permanent +10% bonus on all coin earnings (stacks up to 50%)',
    category: 'boost',
    type: 'stat',
    stackable: true,
    maxOwn: 5,
  },
  star_booster: {
    name: 'Star Booster',
    emoji: '⭐',
    price: 10000,
    sellPrice: 5000,
    description: 'Permanent +5% win-rate bonus on slots & betflip (stacks up to 25%)',
    category: 'boost',
    type: 'stat',
    stackable: true,
    maxOwn: 5,
  },
  mining_boost: {
    name: 'Mining Boost',
    emoji: '⛏',
    price: 8000,
    sellPrice: 4000,
    description: '+25% rare-ore chance on your very next mine run (single use)',
    category: 'boost',
    type: 'use',
    stackable: true,
    maxOwn: 10,
  },
  farm_boost: {
    name: 'Farm Boost',
    emoji: '🌻',
    price: 6000,
    sellPrice: 3000,
    description: '+50% crop yield on your very next harvest (single use)',
    category: 'boost',
    type: 'use',
    stackable: true,
    maxOwn: 10,
  },
  xp_boost: {
    name: 'XP Boost',
    emoji: '📈',
    price: 15000,
    sellPrice: 7000,
    description: '+50% XP from ALL activities for the next 2 hours (timed)',
    category: 'boost',
    type: 'timed',
    stackable: true,
    maxOwn: 3,
  },

  /* ═══════════════ LOOT BOXES ════════════════
   * type: 'loot' — opened for random rewards
   * ════════════════════════════════════════== */

  mystery_box: {
    name: 'Mystery Box',
    emoji: '📦',
    price: 20000,
    sellPrice: 10000,
    description: 'Random reward: coins (50%) · Rare pet (30%) · Weapon Box (20%)',
    category: 'loot',
    type: 'loot',
    stackable: true,
    maxOwn: 99,
  },
  weapon_box: {
    name: 'Weapon Box',
    emoji: '🗡',
    price: 15000,
    sellPrice: 7500,
    description: 'Grants a random weapon (Sword / Bow / Staff) to your active pet',
    category: 'loot',
    type: 'loot',
    stackable: true,
    maxOwn: 99,
    requiresPet: true,
  },
  crystal_box: {
    name: 'Crystal Box',
    emoji: '💠',
    price: 30000,
    sellPrice: 15000,
    description: 'Premium loot box: coins (40%) · Pet Gem (35%) · Weapon Box (25%)',
    category: 'loot',
    type: 'loot',
    stackable: true,
    maxOwn: 20,
  },
  dragon_egg: {
    name: 'Dragon Egg',
    emoji: '🥚',
    price: 50000,
    sellPrice: 25000,
    description: 'Hatches a powerful Dragon pet and adds it to your collection',
    category: 'loot',
    type: 'loot',
    stackable: true,
    maxOwn: 5,
  },

  /* ═══════════════ SPECIAL ════════════════════
   * type: 'special' — unique timed or permanent effects
   * ════════════════════════════════════════════ */

  lucky_charm: {
    name: 'Lucky Charm',
    emoji: '🍀',
    price: 8000,
    sellPrice: 4000,
    description: '+15% loot quality on your next hunt or fish (expires after 1 use or 1 hour)',
    category: 'special',
    type: 'timed',
    stackable: true,
    maxOwn: 10,
  },
  shield: {
    name: 'Shield Token',
    emoji: '<:Shield:1473038669831995494>',
    price: 12000,
    sellPrice: 6000,
    description: 'Protects all your coins from robbery for the next 24 hours',
    category: 'special',
    type: 'timed',
    stackable: true,
    maxOwn: 5,
  },
  time_skip: {
    name: 'Time Skip',
    emoji: '⏩',
    price: 12000,
    sellPrice: 5000,
    description: 'Instantly resets BOTH your work AND daily cooldowns — use anytime',
    category: 'special',
    type: 'use',
    stackable: true,
    maxOwn: 5,
  },
  vip_badge: {
    name: 'VIP Badge',
    emoji: '👑',
    price: 100000,
    sellPrice: 0,
    description: 'Grants permanent VIP status — displayed on your economy profile',
    category: 'special',
    type: 'use',
    stackable: false,
    maxOwn: 1,
  },

  /* ═══════════════ SEEDS ══════════════════════
   * type: 'plant' — planted via /farm, not used directly
   * ════════════════════════════════════════════ */

  wheat_seed: {
    name: 'Wheat Seed',
    emoji: '🌾',
    price: 200,
    sellPrice: 50,
    description: 'Plant with `farm plant wheat_seed`. Grows in 10 min → yields 300–500 coins',
    category: 'seeds',
    type: 'plant',
    stackable: true,
    maxOwn: 50,
    growTime: 10 * 60 * 1000,
    yield: [300, 500],
  },
  carrot_seed: {
    name: 'Carrot Seed',
    emoji: '🥕',
    price: 500,
    sellPrice: 150,
    description: 'Plant with `farm plant carrot_seed`. Grows in 20 min → yields 700–1,200 coins',
    category: 'seeds',
    type: 'plant',
    stackable: true,
    maxOwn: 30,
    growTime: 20 * 60 * 1000,
    yield: [700, 1200],
  },
  pumpkin_seed: {
    name: 'Pumpkin Seed',
    emoji: '🎃',
    price: 1500,
    sellPrice: 500,
    description: 'Plant with `farm plant pumpkin_seed`. Grows in 60 min → yields 3,000–5,000 coins',
    category: 'seeds',
    type: 'plant',
    stackable: true,
    maxOwn: 10,
    growTime: 60 * 60 * 1000,
    yield: [3000, 5000],
  },

  /* ═══════════════ MINING GEAR ════════════════
   * type: 'passive' — equip once, works automatically while mining
   * ════════════════════════════════════════════ */

  iron_pickaxe: {
    name: 'Iron Pickaxe',
    emoji: '⛏',
    price: 5000,
    sellPrice: 2000,
    description: 'Passive: +10% rare-ore chance every time you mine (no action needed)',
    category: 'mining',
    type: 'passive',
    stackable: false,
    maxOwn: 1,
    miningBonus: 0.10,
  },
  gold_pickaxe: {
    name: 'Gold Pickaxe',
    emoji: '🪙',
    price: 15000,
    sellPrice: 6000,
    description: 'Passive: +25% rare-ore chance every time you mine (no action needed)',
    category: 'mining',
    type: 'passive',
    stackable: false,
    maxOwn: 1,
    miningBonus: 0.25,
  },
  diamond_pickaxe: {
    name: 'Diamond Pickaxe',
    emoji: '💎',
    price: 50000,
    sellPrice: 20000,
    description: 'Passive: +50% rare-ore chance every time you mine — the best pickaxe',
    category: 'mining',
    type: 'passive',
    stackable: false,
    maxOwn: 1,
    miningBonus: 0.50,
  },

  /* ═══════════════ MATERIALS ══════════════════
   * type: 'material' — crafting/sell items, cannot be used
   * ════════════════════════════════════════════ */

  stone: {
    name: 'Stone',
    emoji: '🪨',
    price: 50,
    sellPrice: 20,
    description: 'Common crafting material obtained while mining. Sell or use in crafting.',
    category: 'materials',
    type: 'material',
    stackable: true,
    maxOwn: 500,
  },
  wood: {
    name: 'Wood',
    emoji: '🪵',
    price: 80,
    sellPrice: 30,
    description: 'Basic crafting material. Sell or use in crafting recipes.',
    category: 'materials',
    type: 'material',
    stackable: true,
    maxOwn: 500,
  },
  iron_ore: {
    name: 'Iron Ore',
    emoji: '🔩',
    price: 200,
    sellPrice: 100,
    description: 'Uncommon ore found while mining. A key crafting ingredient.',
    category: 'materials',
    type: 'material',
    stackable: true,
    maxOwn: 200,
  },
  gold_ore: {
    name: 'Gold Ore',
    emoji: '✨',
    price: 800,
    sellPrice: 400,
    description: 'Rare ore found while mining. High-value crafting material.',
    category: 'materials',
    type: 'material',
    stackable: true,
    maxOwn: 100,
  },
  diamond_ore: {
    name: 'Diamond',
    emoji: '💎',
    price: 5000,
    sellPrice: 3000,
    description: 'Extremely rare gem found while mining. Highly valuable.',
    category: 'materials',
    type: 'material',
    stackable: true,
    maxOwn: 50,
  },
  emerald_ore: {
    name: 'Emerald',
    emoji: '<:Sketch:1473038248493453352>',
    price: 8000,
    sellPrice: 5000,
    description: 'Mythic-rarity gem. Extremely valuable — sell for a fortune.',
    category: 'materials',
    type: 'material',
    stackable: true,
    maxOwn: 20,
  },
};

function getItem(id) {
  return ITEMS[id] ? { id, ...ITEMS[id] } : null;
}

function getItems(category = null) {
  return Object.entries(ITEMS)
    .filter(([, item]) => !category || item.category === category)
    .map(([id, item]) => ({ id, ...item }));
}

function itemDisplay(id) {
  const item = ITEMS[id];
  if (!item) return id;
  return `${item.emoji} ${item.name}`;
}

module.exports = { CATEGORIES, ITEMS, getItem, getItems, itemDisplay };
