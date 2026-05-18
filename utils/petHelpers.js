'use strict';

const path = require('path');

const jsonStore = require('./jsonStore');
const PETS_PATH = path.join(__dirname, '../data/pets.json');

/* ═══════════════════════════════════════════════════════
   RARITY CONFIG
   ═══════════════════════════════════════════════════════ */

const RARITY_PREFIX = {
  common: 'cmn', uncommon: 'ucm', rare: 'rar',
  epic: 'epc', legendary: 'lgd', mythic: 'myc',
};

const RARITY_EMOJI = {
  common: '⬜', uncommon: '🟩', rare: '🟦',
  epic: '🟪', legendary: '🟨', mythic: '🟥',
};

const RARITY_COLOR = {
  common: 0x9ca3af, uncommon: 0x22c55e, rare: 0x3b82f6,
  epic: 0x8b5cf6, legendary: 0xfbbf24, mythic: 0xef4444,
};

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

/* ═══════════════════════════════════════════════════════
   WEAPONS CATALOG  (single source of truth)
   ═══════════════════════════════════════════════════════ */

const WEAPONS = {
  sword: { name: '🗡️ Sword', baseAtk: 10 },
  bow:   { name: '🏹 Bow',   baseAtk: 8 },
  staff: { name: '🔮 Staff', baseAtk: 6 },
};

/* ═══════════════════════════════════════════════════════
   SKILL CATALOG  (mirrors battle.js)
   ═══════════════════════════════════════════════════════ */

const SKILL_LABEL = {
  slash: '⚔️ Slash', bone_throw: '🦴 Bone Throw', absorb: '💚 Absorb',
  howl: '<:Star:1473038501766369300> Howl', fireball: '<:Fire:1473038604812161218> Fireball', drain: '🩸 Life Drain',
  slam: '💥 Slam', fortify: '<:Shield:1473038669831995494> Fortify', dark_strike: '🌑 Dark Strike',
  frost_breath: '❄️ Frost Breath', inferno: '🌋 Inferno', void_collapse: '🕳️ Void Collapse',
};

/* ═══════════════════════════════════════════════════════
   FILE I/O
   ═══════════════════════════════════════════════════════ */

function rawLoad() {
  if (!jsonStore.has('pets')) return {};
  try { return jsonStore.read('pets'); }
  catch { return {}; }
}

function savePets(data) {
  jsonStore.write('pets', data);
}

function ensureUser(data, uid) {
  if (!data[uid]) data[uid] = { animals: [], activeBattlePet: null };
  if (!Array.isArray(data[uid].animals)) data[uid].animals = [];
  return data[uid];
}

/* ═══════════════════════════════════════════════════════
   PET ID GENERATION
   ═══════════════════════════════════════════════════════

   Format:  {rarityPrefix}{name}_{counter}
   Example: cmnmouse_1, ucmwolf_3, lgddragon_1
   ═══════════════════════════════════════════════════════ */

const NEW_ID_RE = /^(cmn|ucm|rar|epc|lgd|myc)[a-z0-9]+_\d+$/;

function baseId(rarity, name) {
  return (RARITY_PREFIX[rarity] || 'cmn') + (name || 'pet').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function nextId(rarity, name, animals) {
  const base = baseId(rarity, name);
  let max = 0;
  for (const p of animals) {
    if (p.id?.startsWith(base + '_')) {
      const n = parseInt(p.id.slice(base.length + 1));
      if (n > max) max = n;
    }
  }
  return `${base}_${max + 1}`;
}

/* ═══════════════════════════════════════════════════════
   DATA MIGRATION  (old random IDs → new format)
   ═══════════════════════════════════════════════════════ */

function migrate(data) {
  let changed = false;
  for (const uid in data) {
    const u = data[uid];
    if (!Array.isArray(u?.animals)) continue;
    for (const pet of u.animals) {
      if (NEW_ID_RE.test(pet.id)) continue;          // already migrated
      const old = pet.id;
      pet.id = nextId(pet.rarity || 'common', pet.name || 'pet', u.animals);
      if (u.activeBattlePet === old) u.activeBattlePet = pet.id;
      // normalize missing fields
      pet.baseHp  ??= pet.hp  || 20;
      pet.baseAtk ??= pet.atk || 5;
      pet.maxHp   ??= pet.baseHp;
      pet.hp      ??= pet.maxHp;
      pet.atk     ??= pet.baseAtk;
      pet.level   ??= 1;
      pet.exp     ??= 0;
      pet.weapon  ??= null;
      changed = true;
    }
  }
  return changed;
}

/**
 * Load pets with automatic migration of old IDs.
 * Safe to call from any file — migration is idempotent.
 */
function loadPets() {
  const data = rawLoad();
  if (migrate(data)) {
    savePets(data);
  }
  return data;
}

/* ═══════════════════════════════════════════════════════
   GROUPING  (for stacked display)
   ═══════════════════════════════════════════════════════ */

/** Group by base type ID → stacked entries */
function groupByType(animals) {
  const m = new Map();
  for (const p of animals) {
    const k = baseId(p.rarity || 'common', p.name || 'pet');
    if (!m.has(k)) m.set(k, { typeId: k, name: p.name, emoji: p.emoji || '🐾', rarity: p.rarity || 'common', pets: [] });
    m.get(k).pets.push(p);
  }
  return [...m.values()];
}

/** Group by rarity name */
function groupByRarity(animals) {
  const m = {};
  for (const p of animals) { const r = p.rarity || 'common'; (m[r] ??= []).push(p); }
  return m;
}

/* ═══════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════ */

module.exports = {
  PETS_PATH,
  RARITY_PREFIX, RARITY_EMOJI, RARITY_COLOR, RARITY_ORDER,
  WEAPONS, SKILL_LABEL, NEW_ID_RE,
  loadPets, savePets, ensureUser,
  baseId, nextId, migrate,
  groupByType, groupByRarity,
};
