'use strict';

const { createContainer, addTextDisplay, addSeparator, formatNumber, MessageFlags, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const { formatCoins, formatCoinsShort , coinIcon, formatCoinsAmount } = require('../../utils/currencyHelper');
const economyManager = require('../../utils/economyManager');
const ph = require('../../utils/petHelpers');
const { ITEMS, itemDisplay } = require('../../utils/shopItems');
const jsonStore = require('../../utils/jsonStore');

/* ═══════════════════ HELPERS ═══════════════════ */

function loadInventory() { return jsonStore.read('inventory'); }
function saveInventory(d) { jsonStore.write('inventory', d); }
function loadLottery() { return jsonStore.read('lottery'); }
function saveLottery(d) { jsonStore.write('lottery', d); }

function ensureEconomy(economy, userId) {
  const { userData } = economyManager.getUser(economy, userId);
  userData.bonuses ||= { work: 0, daily: 0, gamble: 0, global: 0, slots: 0 };
  userData.bonuses.slots ||= 0;
  userData.boosts ||= {};
  return userData;
}

/* ═══════════════════ ITEM EFFECTS ═══════════════════ */

/**
 * Apply an item's effect. Returns { success, title, result, extra? } or { error }.
 */
function applyItem(itemId, userId, economy, pets, lottery, inventory, guildId) {
  const userData = ensureEconomy(economy, userId);
  ph.ensureUser(pets, userId);
  lottery.entries ||= {};

  const meta = ITEMS[itemId];
  if (!meta) return { error: 'This item does not exist in the shop.' };

  /* ── Passive / material / plant items cannot be "used" ── */
  if (meta.type === 'passive') {
    return {
      error: `${meta.emoji} **${meta.name}** is a passive item — it works automatically while you mine. No action needed.`,
    };
  }
  if (meta.type === 'material') {
    return {
      error: `${meta.emoji} **${meta.name}** is a crafting material. Use \`sell-item ${itemId}\` to sell it, or save it for crafting.`,
    };
  }
  if (meta.type === 'plant') {
    return {
      error: `${meta.emoji} **${meta.name}** is a seed — plant it with \`farm plant ${itemId}\` to grow crops.`,
    };
  }

  /* ── Pre-checks ── */
  if (meta.requiresPet && !pets[userId].activeBattlePet) {
    return { error: `You need an active battle pet to use ${meta.emoji} **${meta.name}**. Set one with \`pets set <id>\`.` };
  }

  let activePet = null;
  if (meta.requiresPet) {
    activePet = pets[userId].animals.find(p => p.id === pets[userId].activeBattlePet);
    if (!activePet) return { error: 'Active pet not found. Set one with `pets set <id>`.' };
  }

  /* ═══════════════════ SWITCH: ITEM EFFECTS ══════════════════ */
  switch (itemId) {

    /* ── CONSUMABLES ── */

    case 'ticket': {
      lottery.entries[userId] = (lottery.entries[userId] || 0) + 1;
      const entries = lottery.entries[userId];
      return {
        success: true,
        title: '🎫 Lottery Ticket Entered',
        result: `Your ticket has been added to the lottery draw!`,
        extra: `🎯 Your total entries: **${entries}**`,
      };
    }

    case 'gem': {
      activePet.exp = (activePet.exp || 0) + 100;
      return {
        success: true,
        title: '<:Sketch:1473038248493453352> Pet Gem Used',
        result: `${activePet.emoji} **${activePet.name}** gained **+100 EXP**!`,
        extra: `<:Invoice:1473039492217835550> Total EXP: **${activePet.exp}**`,
      };
    }

    case 'xp_potion': {
      activePet.exp = (activePet.exp || 0) + 150;
      return {
        success: true,
        title: '🧪 XP Potion Used',
        result: `${activePet.emoji} **${activePet.name}** gained **+150 EXP**!`,
        extra: `<:Invoice:1473039492217835550> Total EXP: **${activePet.exp}**`,
      };
    }

    case 'coin_bag': {
      const coins = Math.floor(Math.random() * 10001) + 5000;
      userData.coins += coins;
      return {
        success: true,
        title: `${coinIcon(guildId)} Coin Bag Opened`,
        result: `You found **${formatCoins(coins, guildId)}** inside the bag!`,
        extra: `💼 New balance: **${formatCoins(userData.coins, guildId)}**`,
      };
    }

    case 'health_pack': {
      const before = activePet.hp;
      const maxHp = activePet.baseHp || 100;
      activePet.hp = maxHp;
      return {
        success: true,
        title: '🩹 Health Pack Used',
        result: `${activePet.emoji} **${activePet.name}**'s HP fully restored!`,
        extra: `<:Heart:1473038659514007616> HP: **${before}** → **${maxHp}**`,
      };
    }

    case 'energy_drink': {
      userData.lastWork = 0;
      return {
        success: true,
        title: '🥤 Energy Drink Used',
        result: `Your work cooldown has been reset — you can work again right now!`,
        extra: `💼 Use \`work\` to earn coins immediately.`,
      };
    }

    /* ── BOOSTS ── */

    case 'trophy': {
      const before = Math.round(userData.bonuses.work * 100);
      userData.bonuses.work  = Math.min((userData.bonuses.work  || 0) + 0.02, 0.50);
      userData.bonuses.daily = Math.min((userData.bonuses.daily || 0) + 0.02, 0.50);
      const after = Math.round(userData.bonuses.work * 100);
      return {
        success: true,
        title: '<:Award:1473038391632203887> Trophy Activated',
        result: `Permanent **+2% work & daily income** bonus applied!`,
        extra: `📈 Bonus: ${before}% → **${after}%** (cap: 50%)`,
      };
    }

    case 'medal': {
      const before = Math.round((userData.bonuses.gamble || 0) * 100);
      userData.bonuses.gamble = Math.min((userData.bonuses.gamble || 0) + 0.05, 0.25);
      const after = Math.round(userData.bonuses.gamble * 100);
      return {
        success: true,
        title: '🏅 Medal Activated',
        result: `Permanent **+5% gamble bonus** applied to all bets!`,
        extra: `📈 Bonus: ${before}% → **${after}%** (cap: 25%)`,
      };
    }

    case 'crown': {
      const before = Math.round((userData.bonuses.global || 0) * 100);
      userData.bonuses.global = Math.min((userData.bonuses.global || 0) + 0.10, 0.50);
      const after = Math.round(userData.bonuses.global * 100);
      return {
        success: true,
        title: '<:Crown:1506010837368963142> Crown Activated',
        result: `Permanent **+10% global earnings** bonus applied!`,
        extra: `📈 Bonus: ${before}% → **${after}%** (cap: 50%)`,
      };
    }

    case 'star_booster': {
      const before = Math.round((userData.bonuses.slots || 0) * 100);
      userData.bonuses.slots = Math.min((userData.bonuses.slots || 0) + 0.05, 0.25);
      const after = Math.round(userData.bonuses.slots * 100);
      return {
        success: true,
        title: '⭐ Star Booster Activated',
        result: `Permanent **+5% win-rate** on slots & betflip applied!`,
        extra: `📈 Bonus: ${before}% → **${after}%** (cap: 25%)`,
      };
    }

    case 'mining_boost': {
      userData.boosts.miningBoost = true;
      return {
        success: true,
        title: '⛏ Mining Boost Active',
        result: `**+25% rare-ore chance** is active for your next mine run!`,
        extra: `🪨 Use \`mine\` to claim the boosted result — consumed after one run.`,
      };
    }

    case 'farm_boost': {
      userData.boosts.farmBoost = true;
      return {
        success: true,
        title: '🌻 Farm Boost Active',
        result: `**+50% harvest yield** is active for your next harvest!`,
        extra: `🌾 Use \`farm harvest\` to claim the boosted crops — consumed after one harvest.`,
      };
    }

    case 'xp_boost': {
      const expiry = Date.now() + 2 * 3600000;
      userData.boosts.xpBoost = expiry;
      const expiresAt = `<t:${Math.floor(expiry / 1000)}:R>`;
      return {
        success: true,
        title: '📈 XP Boost Active',
        result: `**+50% XP** from all activities for the next **2 hours**!`,
        extra: `⏱️ Expires ${expiresAt}`,
      };
    }

    /* ── LOOT BOXES ── */

    case 'mystery_box': {
      const roll = Math.random();
      if (roll < 0.50) {
        const coins = Math.floor(Math.random() * 30000) + 10000;
        userData.coins += coins;
        return {
          success: true,
          title: '<:Box:1473039115581915256> Mystery Box Opened',
          result: `${coinIcon(guildId)} You found **${formatCoinsAmount(coins, guildId)}** inside!`,
          extra: `💼 New balance: **${formatCoins(userData.coins, guildId)}**`,
        };
      } else if (roll < 0.80) {
        const pet = {
          id: Date.now().toString(36),
          name: 'Mystic Beast', emoji: '🐲', rarity: 'rare',
          level: 1, exp: 0, baseHp: 80, baseAtk: 30, hp: 80, atk: 30,
          value: 500, weapon: null,
        };
        pets[userId].animals.push(pet);
        return {
          success: true,
          title: '<:Box:1473039115581915256> Mystery Box Opened',
          result: `🐲 You found a **Rare Pet — Mystic Beast**!`,
          extra: `🐾 It has been added to your pets collection.`,
        };
      } else {
        inventory[userId].push({ id: 'weapon_box', boughtAt: Date.now() });
        return {
          success: true,
          title: '<:Box:1473039115581915256> Mystery Box Opened',
          result: `🗡️ You found a **Weapon Box** inside!`,
          extra: `<:Box:1473039115581915256> Use \`use weapon_box\` to equip a weapon to your active pet.`,
        };
      }
    }

    case 'weapon_box': {
      const weapons = [
        { id: 'sword', name: '🗡️ Sword',  baseAtk: 10 },
        { id: 'bow',   name: '🏹 Bow',    baseAtk: 8  },
        { id: 'staff', name: '🔮 Staff',  baseAtk: 6  },
      ];
      const weapon = weapons[Math.floor(Math.random() * weapons.length)];
      activePet.weapon = { ...weapon, rarity: activePet.rarity, level: 1, xp: 0 };
      return {
        success: true,
        title: '🗡️ Weapon Equipped',
        result: `${weapon.name} has been equipped to ${activePet.emoji} **${activePet.name}**!`,
        extra: `⚔️ Base ATK bonus: **+${weapon.baseAtk}**`,
      };
    }

    case 'crystal_box': {
      const roll = Math.random();
      if (roll < 0.40) {
        const coins = Math.floor(Math.random() * 50000) + 20000;
        userData.coins += coins;
        return {
          success: true,
          title: '💠 Crystal Box Opened',
          result: `${coinIcon(guildId)} You found **${formatCoinsAmount(coins, guildId)}** sparkling inside!`,
          extra: `💼 New balance: **${formatCoins(userData.coins, guildId)}**`,
        };
      } else if (roll < 0.75) {
        inventory[userId].push({ id: 'gem', boughtAt: Date.now() });
        return {
          success: true,
          title: '💠 Crystal Box Opened',
          result: `<:Sketch:1473038248493453352> You found a **Pet Gem** inside!`,
          extra: `💡 Use \`use gem\` with an active pet to give it +100 EXP.`,
        };
      } else {
        inventory[userId].push({ id: 'weapon_box', boughtAt: Date.now() });
        return {
          success: true,
          title: '💠 Crystal Box Opened',
          result: `🗡️ You found a **Weapon Box** inside!`,
          extra: `<:Box:1473039115581915256> Use \`use weapon_box\` to equip a weapon to your active pet.`,
        };
      }
    }

    case 'dragon_egg': {
      const dragonNames = ['Ignis', 'Frost', 'Shadow', 'Storm', 'Ember'];
      const dragonName = dragonNames[Math.floor(Math.random() * dragonNames.length)] + ' Dragon';
      const dragon = {
        id: `drg_${Date.now().toString(36)}`,
        name: dragonName, emoji: '🐉', rarity: 'legendary',
        level: 1, exp: 0, baseHp: 150, baseAtk: 60, hp: 150, atk: 60,
        value: 2500, weapon: null,
      };
      pets[userId].animals.push(dragon);
      return {
        success: true,
        title: '🥚 Dragon Egg Hatched!',
        result: `🐉 A **Legendary ${dragonName}** has hatched from your egg!`,
        extra: `<:Fire:1473038604812161218> HP: **150** · ATK: **60** · Rarity: **Legendary** — check it with \`pets\`!`,
      };
    }

    /* ── SPECIAL ── */

    case 'lucky_charm': {
      userData.boosts.luckyCharm = Date.now() + 3600000;
      return {
        success: true,
        title: '🍀 Lucky Charm Active',
        result: `**+15% loot quality** on your next hunt or fish!`,
        extra: `⏱️ Expires in **1 hour** or after your next hunt/fish.`,
      };
    }

    case 'shield': {
      userData.boosts.shield = Date.now() + 86400000;
      return {
        success: true,
        title: '<:Shield:1473038669831995494> Shield Active',
        result: `Your coins are now **protected from robbery**!`,
        extra: `⏱️ Protection expires in **24 hours**.`,
      };
    }

    case 'time_skip': {
      userData.lastWork  = 0;
      userData.lastDaily = 0;
      return {
        success: true,
        title: '⏩ Time Skip Used',
        result: `Both your **work** and **daily** cooldowns have been reset!`,
        extra: `💡 Use \`work\` and \`daily\` right now to claim your rewards.`,
      };
    }

    case 'vip_badge': {
      if (userData.vip) {
        return { error: '👑 You already have **VIP status** on your profile.' };
      }
      userData.vip = true;
      return {
        success: true,
        title: '👑 VIP Badge Activated',
        result: `You are now a **VIP member** — your status is displayed on your economy profile!`,
        extra: `✨ VIP is permanent and cannot be removed.`,
      };
    }

    default:
      return { error: `${meta?.emoji || '❓'} **${meta?.name || itemId}** cannot be used.` };
  }
}

/* ═══════════════════ BUILD RESPONSE ═══════════════════ */

function buildUseResponse(effectResult) {
  if (effectResult.error) {
    const c = createContainer(0xED4245);
    addTextDisplay(c, `<:Cancel:1473037949187657818> ${effectResult.error}`);
    return c;
  }

  const c = createContainer(0xCAD7E6);
  let text = `# ${effectResult.title}\n\n${effectResult.result}`;
  if (effectResult.extra) text += `\n\n${effectResult.extra}`;
  addTextDisplay(c, text);
  return c;
}

/* ═══════════════════ CORE USE LOGIC ═══════════════════ */

async function useItem(userId, itemId, guildId) {
  const inventory = loadInventory();
  const economy   = economyManager.loadEconomy();
  const pets      = ph.loadPets();
  const lottery   = loadLottery();

  if (!inventory[userId]?.length) {
    return { container: buildUseResponse({ error: 'Your inventory is empty.' }) };
  }

  const index = inventory[userId].findIndex(i => i.id === itemId);
  if (index === -1) {
    const display = ITEMS[itemId] ? itemDisplay(itemId) : `\`${itemId}\``;
    return { container: buildUseResponse({ error: `You don't own ${display}.` }) };
  }

  const result = applyItem(itemId, userId, economy, pets, lottery, inventory, guildId);

  if (result.error) {
    return { container: buildUseResponse(result) };
  }

  inventory[userId].splice(index, 1);

  saveInventory(inventory);
  economyManager.saveEconomy(economy);
  ph.savePets(pets);
  saveLottery(lottery);

  return { container: buildUseResponse(result) };
}

/* ═══════════════════ COMMAND ═══════════════════ */

module.exports = {
  data: new (require('discord.js').SlashCommandBuilder)()
    .setName('use')
    .setDescription('Use an item from your inventory')
    .addStringOption(o => o.setName('item').setDescription('Item ID to use').setRequired(true)),
  prefix: 'use',
  description: 'Use an item from your inventory',
  usage: 'use <item_id>',
  category: 'economy',
  aliases: ['useitem'],

  async executePrefix(message, args) {
    const itemId = args[0]?.toLowerCase();
    if (!itemId) {
      const c = createContainer(0xED4245);
      addTextDisplay(c, [
        '# ❓ Use Item',
        '',
        'Specify an item to use from your inventory.',
        '',
        '**Usage:** `use <item_id>`',
        '**Example:** `use mystery_box`',
        '',
        '-# Use `inventory` to see your items and their IDs.',
      ].join('\n'));
      return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    const { container } = await useItem(message.author.id, itemId, message.guild?.id);
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },

  async execute(interaction) {
    const itemId = interaction.options?.getString('item');
    if (!itemId) {
      const c = createContainer(0xED4245);
      addTextDisplay(c, '<:Cancel:1473037949187657818> Specify an item to use.');
      return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }
    const { container } = await useItem(interaction.user.id, itemId.toLowerCase(), interaction.guild?.id);
    return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },

  /**
   * Called by inventory quick-use select menu.
   */
  async executeUse(interaction, itemId) {
    const { container } = await useItem(interaction.user.id, itemId, interaction.guild?.id);
    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  },
};
