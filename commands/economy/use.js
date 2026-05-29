'use strict';

/**
 * use.js — `use <item_id>` and the inventory quick-use select menu.
 *
 * Three guarantees the new flow enforces:
 *
 *   1. Per-item cooldowns (utils/itemCooldowns.js).
 *      Loot boxes, time-skip, energy-drink and coin-bag are gated
 *      so a user with a stack can't trigger 50 effects in a row.
 *
 *   2. The coin-bag is no longer a money glitch.
 *      Old: cost 3,000, paid 5,000–15,000 → guaranteed +7k profit.
 *      New: cost 5,000, pays 4,000–7,500 random → expected ~+750
 *      with a real chance of net loss. Combined with a 15-minute
 *      cooldown there's no way to use it as a printer.
 *
 *   3. The item is consumed AND the cooldown stamped only after the
 *      effect succeeds. Pre-flight checks (no active pet, on
 *      cooldown, …) abort cleanly without losing the item.
 */

const { createContainer, addTextDisplay, addSeparator, formatNumber, MessageFlags, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const { formatCoins, formatCoinsShort, coinIcon, formatCoinsAmount } = require('../../utils/currencyHelper');
const economyManager = require('../../utils/economyManager');
const ph = require('../../utils/petHelpers');
const { ITEMS, itemDisplay } = require('../../utils/shopItems');
const itemCooldowns = require('../../utils/itemCooldowns');
const jsonStore = require('../../utils/jsonStore');

/* ═══════════════════ HELPERS ═══════════════════ */

function loadInventory() { return jsonStore.read('inventory'); }
function saveInventory(d) { jsonStore.write('inventory', d); }
function loadLottery()    { return jsonStore.read('lottery'); }
function saveLottery(d)   { jsonStore.write('lottery', d); }

function ensureEconomy(economy, userId) {
    const { userData } = economyManager.getUser(economy, userId);
    userData.bonuses ||= { work: 0, daily: 0, gamble: 0, global: 0, slots: 0 };
    userData.bonuses.slots ||= 0;
    userData.boosts ||= {};
    return userData;
}

/** Random integer in [min, max] inclusive. */
function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/* ═══════════════════ ITEM EFFECTS ═══════════════════ */

/**
 * Apply an item's effect.
 * Returns `{ success, title, result, extra }` on success or
 * `{ error }` to abort.
 */
function applyItem(itemId, userId, economy, pets, lottery, inventory, guildId) {
    const userData = ensureEconomy(economy, userId);
    ph.ensureUser(pets, userId);
    lottery.entries ||= {};

    const meta = ITEMS[itemId];
    if (!meta) return { error: 'This item does not exist in the shop.' };

    /* ── Items that can't be "used" directly ── */
    if (meta.type === 'passive') {
        return { error: `${meta.emoji} **${meta.name}** is a passive item — it works automatically while you mine. No action needed.` };
    }
    if (meta.type === 'material') {
        return { error: `${meta.emoji} **${meta.name}** is a crafting material. Use \`sell-item ${itemId}\` to sell it, or save it for crafting.` };
    }
    if (meta.type === 'plant') {
        return { error: `${meta.emoji} **${meta.name}** is a seed — plant it with \`farm plant ${itemId}\` to grow crops.` };
    }

    /* ── Per-item cooldown ── */
    const remaining = itemCooldowns.getRemaining(userId, itemId);
    if (remaining > 0) {
        return {
            error: [
                `<:Clock:1473039102113878056> **${meta.name}** is on cooldown.`,
                `Ready ${itemCooldowns.formatReadyAt(remaining)} (in ${itemCooldowns.formatRemaining(remaining)}).`,
            ].join(' '),
        };
    }

    /* ── Active-pet pre-check ── */
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

        /* ────────── CONSUMABLES ────────── */

        case 'ticket': {
            // Shop-ticket entries should kick off a lottery draw if one
            // isn't already running, the same way the /lottery panel's
            // Buy button does. Without this the entry would sit in the
            // map but never count toward an active round.
            const LOTTERY_DURATION = 60 * 60 * 1000;
            if (!lottery.active || (lottery.endsAt || 0) < Date.now()) {
                lottery.active = true;
                lottery.endsAt = Date.now() + LOTTERY_DURATION;
                lottery.entries = lottery.entries || {};
            }
            lottery.entries[userId] = (lottery.entries[userId] || 0) + 1;
            return {
                success: true,
                title: `${meta.emoji} Lottery Ticket Entered`,
                result: 'Your ticket has been added to the next lottery draw.',
                extra: `<:Caretright:1473038207221502106> Your total entries: **${lottery.entries[userId]}**`,
            };
        }

        case 'gem': {
            activePet.exp = (activePet.exp || 0) + 100;
            return {
                success: true,
                title: `${meta.emoji} Pet Gem Used`,
                result: `${activePet.emoji} **${activePet.name}** gained **+100 EXP**.`,
                extra: `<:Lightning:1473038797540298792> Total EXP: **${activePet.exp}**`,
            };
        }

        case 'xp_potion': {
            activePet.exp = (activePet.exp || 0) + 150;
            return {
                success: true,
                title: `${meta.emoji} XP Potion Used`,
                result: `${activePet.emoji} **${activePet.name}** gained **+150 EXP**.`,
                extra: `<:Lightning:1473038797540298792> Total EXP: **${activePet.exp}**`,
            };
        }

        case 'coin_bag': {
            // Rebalanced payout (see file header). Cost 5,000 → payout
            // 4,000–7,500. Mean ~5,750, std ~1,000. ~28% chance of net
            // loss on any given use. Combined with the 15-minute
            // cooldown enforced above this is no longer a glitch.
            const coins = rand(4000, 7500);
            const cost  = meta.price;
            const profit = coins - cost;

            userData.coins += coins;

            const verdict = profit > 0
                ? `<:Caretright:1473038207221502106> Net profit: **+${formatCoins(profit, guildId)}**`
                : profit < 0
                    ? `<:Cancel:1473037949187657818> Net loss: **${formatCoins(profit, guildId)}** — better luck next time`
                    : `<:Inforect:1473038624172937287> You broke even.`;

            return {
                success: true,
                title: `${meta.emoji} Coin Bag Opened`,
                result: `You found **${formatCoins(coins, guildId)}** inside.\n${verdict}`,
                extra: `<:Money:1473377877239140529> New balance: **${formatCoins(userData.coins, guildId)}**`,
            };
        }

        case 'health_pack': {
            const before = activePet.hp;
            const maxHp = activePet.baseHp || 100;
            activePet.hp = maxHp;
            return {
                success: true,
                title: `${meta.emoji} Health Pack Used`,
                result: `${activePet.emoji} **${activePet.name}**'s HP fully restored.`,
                extra: `<:Heart:1473038659514007616> HP: **${before}** → **${maxHp}**`,
            };
        }

        case 'energy_drink': {
            userData.lastWork = 0;
            return {
                success: true,
                title: `${meta.emoji} Energy Drink Used`,
                result: 'Your work cooldown has been reset — you can work again right now.',
                extra: '<:Caretright:1473038207221502106> Run `work` to claim your reward.',
            };
        }

        /* ────────── BOOSTS ────────── */

        case 'trophy': {
            const before = Math.round(userData.bonuses.work * 100);
            userData.bonuses.work  = Math.min((userData.bonuses.work  || 0) + 0.02, 0.50);
            userData.bonuses.daily = Math.min((userData.bonuses.daily || 0) + 0.02, 0.50);
            const after = Math.round(userData.bonuses.work * 100);
            return {
                success: true,
                title: `${meta.emoji} Trophy Activated`,
                result: 'Permanent **+2% work & daily income** bonus applied.',
                extra: `<:Lightning:1473038797540298792> Bonus: **${before}% → ${after}%** (cap 50%)`,
            };
        }

        case 'medal': {
            const before = Math.round((userData.bonuses.gamble || 0) * 100);
            userData.bonuses.gamble = Math.min((userData.bonuses.gamble || 0) + 0.05, 0.25);
            const after = Math.round(userData.bonuses.gamble * 100);
            return {
                success: true,
                title: `${meta.emoji} Medal Activated`,
                result: 'Permanent **+5% gamble bonus** applied to all bets.',
                extra: `<:Lightning:1473038797540298792> Bonus: **${before}% → ${after}%** (cap 25%)`,
            };
        }

        case 'crown': {
            const before = Math.round((userData.bonuses.global || 0) * 100);
            userData.bonuses.global = Math.min((userData.bonuses.global || 0) + 0.10, 0.50);
            const after = Math.round(userData.bonuses.global * 100);
            return {
                success: true,
                title: `${meta.emoji} Crown Activated`,
                result: 'Permanent **+10% global earnings** bonus applied.',
                extra: `<:Lightning:1473038797540298792> Bonus: **${before}% → ${after}%** (cap 50%)`,
            };
        }

        case 'star_booster': {
            const before = Math.round((userData.bonuses.slots || 0) * 100);
            userData.bonuses.slots = Math.min((userData.bonuses.slots || 0) + 0.05, 0.25);
            const after = Math.round(userData.bonuses.slots * 100);
            return {
                success: true,
                title: `${meta.emoji} Star Booster Activated`,
                result: 'Permanent **+5% win-rate** on slots & betflip applied.',
                extra: `<:Lightning:1473038797540298792> Bonus: **${before}% → ${after}%** (cap 25%)`,
            };
        }

        case 'mining_boost': {
            userData.boosts.miningBoost = true;
            return {
                success: true,
                title: `${meta.emoji} Mining Boost Active`,
                result: '**+25% rare-ore chance** queued for your next mine run.',
                extra: '<:Caretright:1473038207221502106> Use `mine` to claim — consumed after one run.',
            };
        }

        case 'farm_boost': {
            userData.boosts.farmBoost = true;
            return {
                success: true,
                title: `${meta.emoji} Farm Boost Active`,
                result: '**+50% harvest yield** queued for your next harvest.',
                extra: '<:Caretright:1473038207221502106> Use `farm harvest` to claim — consumed after one harvest.',
            };
        }

        case 'xp_boost': {
            const expiry = Date.now() + 2 * 3600000;
            userData.boosts.xpBoost = expiry;
            return {
                success: true,
                title: `${meta.emoji} XP Boost Active`,
                result: '**+50% XP** from all activities for the next **2 hours**.',
                extra: `<:Clock:1473039102113878056> Expires <t:${Math.floor(expiry / 1000)}:R>`,
            };
        }

        /* ────────── LOOT BOXES ────────── */

        case 'mystery_box': {
            const roll = Math.random();
            if (roll < 0.50) {
                const coins = rand(10000, 40000);
                userData.coins += coins;
                return {
                    success: true,
                    title: `${meta.emoji} Mystery Box Opened`,
                    result: `${coinIcon(guildId)} You found **${formatCoinsAmount(coins, guildId)}** inside!`,
                    extra: `<:Money:1473377877239140529> New balance: **${formatCoins(userData.coins, guildId)}**`,
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
                    title: `${meta.emoji} Mystery Box Opened`,
                    result: '🐲 You found a **Rare Pet — Mystic Beast**!',
                    extra: '<:Caretright:1473038207221502106> It has been added to your pets collection.',
                };
            } else {
                inventory[userId].push({ id: 'weapon_box', boughtAt: Date.now() });
                return {
                    success: true,
                    title: `${meta.emoji} Mystery Box Opened`,
                    result: '<:Caretright:1473038207221502106> You found a **Weapon Box** inside!',
                    extra: '<:Box:1473039115581915256> Use `use weapon_box` to equip a weapon to your active pet.',
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
                title: `${meta.emoji} Weapon Equipped`,
                result: `${weapon.name} has been equipped to ${activePet.emoji} **${activePet.name}**.`,
                extra: `<:Award:1473038391632203887> Base ATK bonus: **+${weapon.baseAtk}**`,
            };
        }

        case 'crystal_box': {
            const roll = Math.random();
            if (roll < 0.40) {
                const coins = rand(20000, 70000);
                userData.coins += coins;
                return {
                    success: true,
                    title: `${meta.emoji} Crystal Box Opened`,
                    result: `${coinIcon(guildId)} You found **${formatCoinsAmount(coins, guildId)}** sparkling inside!`,
                    extra: `<:Money:1473377877239140529> New balance: **${formatCoins(userData.coins, guildId)}**`,
                };
            } else if (roll < 0.75) {
                inventory[userId].push({ id: 'gem', boughtAt: Date.now() });
                return {
                    success: true,
                    title: `${meta.emoji} Crystal Box Opened`,
                    result: '<:Sketch:1473038248493453352> You found a **Pet Gem** inside!',
                    extra: '<:Lightbulbalt:1473038470787240009> Use `use gem` with an active pet for +100 EXP.',
                };
            } else {
                inventory[userId].push({ id: 'weapon_box', boughtAt: Date.now() });
                return {
                    success: true,
                    title: `${meta.emoji} Crystal Box Opened`,
                    result: '<:Caretright:1473038207221502106> You found a **Weapon Box** inside!',
                    extra: '<:Box:1473039115581915256> Use `use weapon_box` to equip a weapon to your active pet.',
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
                title: `${meta.emoji} Dragon Egg Hatched`,
                result: `🐉 A **Legendary ${dragonName}** has hatched from your egg!`,
                extra: `<:Heart:1473038659514007616> HP **150** · <:Award:1473038391632203887> ATK **60** · Rarity **Legendary** — see it in \`pets\`.`,
            };
        }

        /* ────────── SPECIAL ────────── */

        case 'lucky_charm': {
            userData.boosts.luckyCharm = Date.now() + 3600000;
            return {
                success: true,
                title: `${meta.emoji} Lucky Charm Active`,
                result: '**+15% loot quality** on your next hunt or fish.',
                extra: '<:Clock:1473039102113878056> Expires in **1 hour** or after your next hunt/fish.',
            };
        }

        case 'shield': {
            userData.boosts.shield = Date.now() + 86400000;
            return {
                success: true,
                title: `${meta.emoji} Shield Active`,
                result: 'Your coins are now **protected from robbery**.',
                extra: '<:Clock:1473039102113878056> Protection expires in **24 hours**.',
            };
        }

        case 'time_skip': {
            userData.lastWork  = 0;
            userData.lastDaily = 0;
            return {
                success: true,
                title: `${meta.emoji} Time Skip Used`,
                result: 'Both your **work** and **daily** cooldowns have been reset.',
                extra: '<:Caretright:1473038207221502106> Run `work` and `daily` right now to claim.',
            };
        }

        case 'vip_badge': {
            // Permanent flag — if already VIP we DON'T consume the badge.
            // Returning an error here aborts the consume+save flow in
            // useItem(), so the user keeps the item (and can re-sell or
            // gift it via the shop).
            if (userData.vip) {
                return { error: `${meta.emoji} You already have **VIP status** on your profile. The badge wasn't consumed.` };
            }
            userData.vip = true;
            userData.vipSince = Date.now();
            return {
                success: true,
                title: `${meta.emoji} VIP Badge Activated`,
                result: 'You are now a **VIP member** — your status is displayed on your economy profile.',
                extra: '<:Star:1473038501766369300> VIP is permanent and cannot be removed.',
            };
        }

        default:
            return { error: `${meta?.emoji || '<:Cancel:1473037949187657818>'} **${meta?.name || itemId}** cannot be used.` };
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

    // Consume + persist + stamp cooldown only after a successful effect.
    inventory[userId].splice(index, 1);
    saveInventory(inventory);
    economyManager.saveEconomy(economy);
    ph.savePets(pets);
    saveLottery(lottery);
    itemCooldowns.markUsed(userId, itemId);

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
                '# <:Inforect:1473038624172937287> Use Item',
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
     * Called by the inventory quick-use select menu.
     */
    async executeUse(interaction, itemId) {
        const { container } = await useItem(interaction.user.id, itemId, interaction.guild?.id);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },
};
