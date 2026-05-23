'use strict';

const {
  ContainerBuilder, TextDisplayBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const ph = require('../../utils/petHelpers');
const { formatCoins, formatCoinsShort } = require('../../utils/currencyHelper');

/* ═══════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════ */

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

/* ═══════════════════════════════════════════════════════
   VIEW 1 — OVERVIEW
   Shows total pets, active pet, rarity breakdown.
   StringSelectMenu to browse by rarity.
   ═══════════════════════════════════════════════════════ */

function viewOverview(user, uid) {
  const { animals } = user;
  const active = user.activeBattlePet ? animals.find(p => p.id === user.activeBattlePet) : null;
  const byR = ph.groupByRarity(animals);

  const lines = ['# <:Fire:1473038604812161218> Your Pets', ''];

  if (active) {
    lines.push(
      `> ⚔️ **Active:** ${active.emoji} **${active.name}** (Lv.${active.level || 1}) \`${active.id}\``,
      ''
    );
  } else {
    lines.push('> <:Infotriangle:1473038460456800459> **No active battle pet** — browse your pets below and click **⚔️ Set Active** on one!', '');
  }

  if (!animals.length) {
    lines.push(
      '<:Cancel:1473037949187657818> No pets yet.',
      '', '> Use `hunt` to catch your first pet!'
    );
    return new ContainerBuilder().setAccentColor(0xCAD7E6)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
  }

  lines.push(`📦 **Total:** ${animals.length} pets`, '');

  const breakdown = ph.RARITY_ORDER
    .filter(r => byR[r]?.length)
    .map(r => `${ph.RARITY_EMOJI[r]} ${cap(r)}: **${byR[r].length}**`);
  lines.push(breakdown.join(' ┊ '), '');
  lines.push('### How to manage your pets:');
  lines.push('1. **Select a rarity** from the dropdown below to browse');
  lines.push('2. Pick a **pet type** to see all your copies');
  lines.push('3. Select a specific **pet** to view stats, equip weapons, or set as active');
  lines.push('');
  lines.push('-# Use `hunt` to catch new pets • `battle` to fight with your active pet');

  const ctr = new ContainerBuilder().setAccentColor(0xCAD7E6)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

  const opts = ph.RARITY_ORDER
    .filter(r => byR[r]?.length)
    .map(r => ({ label: `${cap(r)} (${byR[r].length})`, value: r, description: `View your ${r} pets` }));

  if (opts.length > 1) {
    opts.unshift({ label: `All Pets (${animals.length})`, value: 'all', description: 'View all pets across rarities' });
  }

  ctr.addActionRowComponents(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`pets:rar:${uid}`)
      .setPlaceholder('🐾 Select rarity to browse')
      .addOptions(opts.slice(0, 25))
  ));

  return ctr;
}

/* ═══════════════════════════════════════════════════════
   VIEW 2 — RARITY CATEGORY
   Shows all pet types of chosen rarity, stacked.
   StringSelectMenu to pick a pet type.
   ═══════════════════════════════════════════════════════ */

function viewRarity(user, uid, rarity) {
  const list = rarity === 'all' ? user.animals : user.animals.filter(p => (p.rarity || 'common') === rarity);
  const groups = ph.groupByType(list);
  const label = rarity === 'all' ? 'All' : cap(rarity);
  const color = rarity === 'all' ? 0x7c3aed : (ph.RARITY_COLOR[rarity] || 0x7c3aed);

  const lines = [
    `# ${rarity === 'all' ? '📦' : (ph.RARITY_EMOJI[rarity] || '📦')} ${label} Pets`,
    '',
  ];

  if (!groups.length) {
    lines.push(`<:Cancel:1473037949187657818> No ${rarity} pets.`);
  } else {
    for (const g of groups) {
      const best = Math.max(...g.pets.map(p => p.level || 1));
      const armed = g.pets.some(p => p.weapon);
      const here = g.pets.some(p => p.id === user.activeBattlePet);
      lines.push(`${g.emoji} **${g.name}** ×${g.pets.length} — Best Lv.${best}${armed ? ' 🗡️' : ''}${here ? ' ⚔️' : ''}`);
    }
  }

  const ctr = new ContainerBuilder().setAccentColor(color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

  if (groups.length) {
    const opts = groups.map(g => ({
      label: `${g.name} ×${g.pets.length}`.substring(0, 100),
      value: `${g.typeId}|${rarity}`,
      description: `${cap(g.rarity)} — Best Lv.${Math.max(...g.pets.map(p => p.level || 1))}`.substring(0, 100),
      emoji: g.emoji || undefined,
    }));
    ctr.addActionRowComponents(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`pets:grp:${uid}`)
        .setPlaceholder('🐾 Select a pet type')
        .addOptions(opts.slice(0, 25))
    ));
  }

  ctr.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pets:bk:${uid}:main`).setEmoji('<:History:1473037847568318605>').setLabel('Back').setStyle(ButtonStyle.Secondary)
  ));

  return ctr;
}

/* ═══════════════════════════════════════════════════════
   VIEW 3 — PET GROUP  (stacked type view)
   Shows all individual instances of the same pet type.
   StringSelectMenu to pick individual for details.
   ═══════════════════════════════════════════════════════ */

function viewGroup(user, uid, typeId, fromRarity) {
  const groups = ph.groupByType(user.animals);
  const grp = groups.find(g => g.typeId === typeId);
  if (!grp) return viewRarity(user, uid, fromRarity);

  const color = ph.RARITY_COLOR[grp.rarity] || 0x7c3aed;
  const lines = [
    `# ${grp.emoji} ${grp.name}`,
    `${ph.RARITY_EMOJI[grp.rarity]} **${cap(grp.rarity)}** — Owned: **${grp.pets.length}**`,
    '',
  ];

  for (const [i, p] of grp.pets.entries()) {
    const active = user.activeBattlePet === p.id;
    const wpn = p.weapon ? `🗡️ ${p.weapon.name} Lv.${p.weapon.level || 1}` : '—';
    lines.push(
      `${active ? '⚔️' : `**${i + 1}.**`} \`${p.id}\` Lv.${p.level || 1}`,
      `> <:Heart:1473038659514007616> ${p.baseHp || p.hp} ┊ ⚔️ ${p.baseAtk || p.atk} ┊ ${wpn}`,
    );
  }

  const ctr = new ContainerBuilder().setAccentColor(color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

  // Select menu for individual pets
  if (grp.pets.length > 0) {
    const pOpts = grp.pets.map((p, i) => ({
      label: `${p.name} #${i + 1} (Lv.${p.level || 1})`.substring(0, 100),
      value: `${p.id}|${fromRarity}`,
      description: `${p.id}${p.weapon ? ` | ${p.weapon.name}` : ''}${p.id === user.activeBattlePet ? ' | Active' : ''}`.substring(0, 100),
    }));
    ctr.addActionRowComponents(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`pets:sel:${uid}`)
        .setPlaceholder('🐾 Select a pet to manage')
        .addOptions(pOpts.slice(0, 25))
    ));
  }

  ctr.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pets:bk:${uid}:rar:${fromRarity}`).setEmoji('<:History:1473037847568318605>').setLabel('Back').setStyle(ButtonStyle.Secondary)
  ));

  return ctr;
}

/* ═══════════════════════════════════════════════════════
   VIEW 4 — PET DETAIL
   Full info for a single pet instance.
   Buttons: Set Active, Weapon, Back.
   ═══════════════════════════════════════════════════════ */

function viewDetail(user, uid, petId, fromRarity) {
  const pet = user.animals.find(p => p.id === petId);
  if (!pet) return viewOverview(user, uid);

  const isActive = user.activeBattlePet === petId;
  const color = ph.RARITY_COLOR[pet.rarity] || 0x7c3aed;
  const lv = pet.level || 1;
  const skills = (pet.skills || ['slash']).map(s => ph.SKILL_LABEL[s] || s);

  const lines = [
    `# ${pet.emoji} ${pet.name}${isActive ? ' ⚔️' : ''}`,
    `${ph.RARITY_EMOJI[pet.rarity]} **${cap(pet.rarity)}** — \`${pet.id}\``,
    '',
    `<:Heart:1473038659514007616> HP: **${pet.baseHp || pet.hp}** ┊ ⚔️ ATK: **${pet.baseAtk || pet.atk}**`,
    `<:Invoice:1473039492217835550> Level: **${lv}** ┊ XP: **${pet.exp || 0}/${lv * 100}**`,
    '',
    `🗡️ **Weapon:** ${pet.weapon ? `${pet.weapon.name} (Lv.${pet.weapon.level || 1}) +${pet.weapon.baseAtk} ATK` : 'None'}`,
    `<:Lightningalt:1473038679906844824> **Skills:** ${skills.join(', ')}`,
  ];

  const ctr = new ContainerBuilder().setAccentColor(color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

  const btns = [];
  if (!isActive) {
    btns.push(new ButtonBuilder().setCustomId(`pets:act:${uid}:${petId}`).setLabel('⚔️ Set Active').setStyle(ButtonStyle.Primary));
  } else {
    btns.push(new ButtonBuilder().setCustomId(`pets:act:${uid}:${petId}`).setEmoji('<:Checkedbox:1473038547165384804>').setLabel('Active').setStyle(ButtonStyle.Success).setDisabled(true));
  }
  btns.push(
    new ButtonBuilder().setCustomId(`pets:wpn:${uid}:${petId}:${fromRarity}`).setLabel('🗡️ Weapon').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`pets:bk:${uid}:grp:${ph.baseId(pet.rarity, pet.name)}:${fromRarity}`).setEmoji('<:History:1473037847568318605>').setLabel('Back').setStyle(ButtonStyle.Secondary),
  );

  ctr.addActionRowComponents(new ActionRowBuilder().addComponents(...btns));
  return ctr;
}

/* ═══════════════════════════════════════════════════════
   VIEW 5 — WEAPON EQUIP
   Lets user pick a weapon to equip on the pet.
   ═══════════════════════════════════════════════════════ */

function viewWeapon(user, uid, petId, fromRarity) {
  const pet = user.animals.find(p => p.id === petId);
  if (!pet) return viewOverview(user, uid);

  const color = ph.RARITY_COLOR[pet.rarity] || 0x7c3aed;
  const lines = [`# 🗡️ Weapon — ${pet.emoji} ${pet.name}`, ''];

  if (pet.weapon) {
    lines.push(
      `**Equipped:** ${pet.weapon.name}`,
      `> ⚔️ ATK: +${pet.weapon.baseAtk} ┊ <:Star:1473038501766369300> Level: ${pet.weapon.level || 1}/10`,
      '', '> Select a different weapon below to replace it.',
    );
  } else {
    lines.push('> No weapon equipped. Select one below!', '');
  }

  lines.push('', '**Available:**');
  for (const [, w] of Object.entries(ph.WEAPONS)) lines.push(`> ${w.name}  +${w.baseAtk} ATK`);

  const ctr = new ContainerBuilder().setAccentColor(color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

  const wOpts = Object.entries(ph.WEAPONS).map(([id, w]) => ({
    label: `${w.name.replace(/[^\w\s]/g, '').trim()} (+${w.baseAtk} ATK)`,
    value: `${id}|${petId}|${fromRarity}`,
    description: `Equip to ${pet.name}`,
  }));
  ctr.addActionRowComponents(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`pets:weq:${uid}`)
      .setPlaceholder('🗡️ Select weapon to equip')
      .addOptions(wOpts)
  ));

  ctr.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pets:bk:${uid}:det:${petId}:${fromRarity}`).setEmoji('<:History:1473037847568318605>').setLabel('Back').setStyle(ButtonStyle.Secondary)
  ));

  return ctr;
}

/* ═══════════════════════════════════════════════════════
   COMMAND EXPORT
   ═══════════════════════════════════════════════════════ */

module.exports = {
  data: new (require('discord.js').SlashCommandBuilder)()
    .setName('pets')
    .setDescription('View and manage your pet collection'),
  name: 'pets',
  prefix: 'pets',
  aliases: ['mypets'],
  category: 'economy',
  description: 'View and manage your pet collection',

  async executePrefix(message, args) {
    const data = ph.loadPets();
    const user = ph.ensureUser(data, message.author.id);
    const uid = message.author.id;

    /* ─── pets active [id] ─── */
    if (args[0] === 'active') {
      const petId = args[1];

      if (petId) {
        // Direct set by ID
        const pet = user.animals.find(p => p.id === petId);
        if (!pet) return message.reply('<:Cancel:1473037949187657818> Pet not found. Use `pets` to browse.');
        user.activeBattlePet = petId;
        ph.savePets(data);
        const ctr = new ContainerBuilder()
          .setAccentColor(ph.RARITY_COLOR[pet.rarity] || 0x22c55e)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# <:Checkedbox:1473038547165384804> Battle Pet Set\n\n` +
            `${pet.emoji} **${pet.name}** (Lv.${pet.level || 1}) is now your active battle pet!\n` +
            `> \`${pet.id}\`\n\n> Use \`battle\` to fight enemies or \`battle pvp @user\` to challenge players.`
          ));
        return message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
      }

      // No ID — open interactive overview for selection
    }

    return message.reply({
      components: [viewOverview(user, uid)],
      flags: MessageFlags.IsComponentsV2,
    });
  },

  /* ═══════════════════════════════════════════════════════
     INTERACTION HANDLER
     ═══════════════════════════════════════════════════════ */

  async handleInteraction(interaction) {
    if (!interaction.customId?.startsWith('pets:')) return false;

    const parts = interaction.customId.split(':');
    const action = parts[1];
    const uid = parts[2];

    /* ── deny non-owner ── */
    if (interaction.user.id !== uid) {
      await interaction.reply({
        content: '<:Cancel:1473037949187657818> This menu belongs to someone else.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const data = ph.loadPets();
    const user = ph.ensureUser(data, uid);

    /* ── RARITY SELECT ── */
    if (interaction.isStringSelectMenu() && action === 'rar') {
      const rarity = interaction.values[0];
      await interaction.update({ components: [viewRarity(user, uid, rarity)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    /* ── GROUP SELECT ── */
    if (interaction.isStringSelectMenu() && action === 'grp') {
      const [typeId, fromRarity] = interaction.values[0].split('|');
      await interaction.update({ components: [viewGroup(user, uid, typeId, fromRarity)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    /* ── INDIVIDUAL PET SELECT ── */
    if (interaction.isStringSelectMenu() && action === 'sel') {
      const [petId, fromRarity] = interaction.values[0].split('|');
      await interaction.update({ components: [viewDetail(user, uid, petId, fromRarity)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    /* ── SET ACTIVE ── */
    if (interaction.isButton() && action === 'act') {
      const petId = parts[3];
      const pet = user.animals.find(p => p.id === petId);
      if (!pet) {
        await interaction.reply({ content: '<:Cancel:1473037949187657818> Pet no longer exists.', flags: MessageFlags.Ephemeral });
        return true;
      }
      user.activeBattlePet = petId;
      ph.savePets(data);
      await interaction.update({ components: [viewOverview(user, uid)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    /* ── WEAPON VIEW ── */
    if (interaction.isButton() && action === 'wpn') {
      const petId = parts[3];
      const fromRarity = parts[4] || 'all';
      await interaction.update({ components: [viewWeapon(user, uid, petId, fromRarity)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    /* ── WEAPON EQUIP SELECT ── */
    if (interaction.isStringSelectMenu() && action === 'weq') {
      const [weaponId, petId, fromRarity] = interaction.values[0].split('|');
      const pet = user.animals.find(p => p.id === petId);
      const wpDef = ph.WEAPONS[weaponId];
      if (!pet || !wpDef) {
        await interaction.reply({ content: '<:Cancel:1473037949187657818> Invalid selection.', flags: MessageFlags.Ephemeral });
        return true;
      }
      pet.weapon = { id: weaponId, name: wpDef.name, baseAtk: wpDef.baseAtk, level: 1, rarity: pet.rarity };
      ph.savePets(data);
      await interaction.update({ components: [viewDetail(user, uid, petId, fromRarity)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    /* ── BACK NAVIGATION ── */
    if (interaction.isButton() && action === 'bk') {
      const target = parts[3];
      if (target === 'main') {
        await interaction.update({ components: [viewOverview(user, uid)], flags: MessageFlags.IsComponentsV2 });
      } else if (target === 'rar') {
        const rarity = parts[4] || 'all';
        await interaction.update({ components: [viewRarity(user, uid, rarity)], flags: MessageFlags.IsComponentsV2 });
      } else if (target === 'grp') {
        const typeId = parts[4];
        const fromRarity = parts[5] || 'all';
        await interaction.update({ components: [viewGroup(user, uid, typeId, fromRarity)], flags: MessageFlags.IsComponentsV2 });
      } else if (target === 'det') {
        const petId = parts[4];
        const fromRarity = parts[5] || 'all';
        await interaction.update({ components: [viewDetail(user, uid, petId, fromRarity)], flags: MessageFlags.IsComponentsV2 });
      } else {
        await interaction.update({ components: [viewOverview(user, uid)], flags: MessageFlags.IsComponentsV2 });
      }
      return true;
    }

    return false;
  },

  async execute(interaction) {
        await interaction.deferReply({ flags: 1 << 15 });
    const fakeMessage = {
      author: interaction.user,
      reply: (opts) => interaction.editReply(opts),
    };
    return module.exports.executePrefix(fakeMessage, []);
  },
};
