'use strict';

const { ButtonBuilder, ActionRowBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { formatCoins, formatCoinsShort } = require('../../utils/currencyHelper');
const { createContainer, addTextDisplay, addSeparator, formatNumber, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const economyManager = require('../../utils/economyManager');
const ph = require('../../utils/petHelpers');
const { resolveUser } = require('../../utils/resolveUser');
const COOLDOWN = 15_000;
const cooldowns = new Map();

const ENEMIES = [
  { name: 'Goblin', emoji: '👺', tier: 1, baseHp: 60, baseAtk: 8, baseDef: 3, baseSpd: 5, skills: ['slash'], loot: { minCoins: 40, maxCoins: 100 } },
  { name: 'Skeleton', emoji: '💀', tier: 1, baseHp: 50, baseAtk: 10, baseDef: 2, baseSpd: 6, skills: ['bone_throw'], loot: { minCoins: 50, maxCoins: 120 } },
  { name: 'Slime', emoji: '<:online:1473369837245042762>', tier: 1, baseHp: 80, baseAtk: 5, baseDef: 5, baseSpd: 3, skills: ['absorb'], loot: { minCoins: 30, maxCoins: 80 } },
  { name: 'Wolf Alpha', emoji: '🐺', tier: 2, baseHp: 100, baseAtk: 18, baseDef: 8, baseSpd: 12, skills: ['slash', 'howl'], loot: { minCoins: 100, maxCoins: 250 } },
  { name: 'Dark Mage', emoji: '🧙', tier: 2, baseHp: 70, baseAtk: 25, baseDef: 5, baseSpd: 8, skills: ['fireball', 'drain'], loot: { minCoins: 120, maxCoins: 300 } },
  { name: 'Stone Golem', emoji: '🗿', tier: 2, baseHp: 180, baseAtk: 12, baseDef: 20, baseSpd: 2, skills: ['slam', 'fortify'], loot: { minCoins: 150, maxCoins: 350 } },
  { name: 'Shadow Knight', emoji: '🖤', tier: 3, baseHp: 200, baseAtk: 30, baseDef: 15, baseSpd: 10, skills: ['slash', 'dark_strike', 'fortify'], loot: { minCoins: 250, maxCoins: 500 } },
  { name: 'Ice Dragon', emoji: '🐲', tier: 3, baseHp: 300, baseAtk: 35, baseDef: 18, baseSpd: 14, skills: ['fireball', 'frost_breath', 'howl'], loot: { minCoins: 400, maxCoins: 800 } },
  { name: 'Demon Lord', emoji: '👿', tier: 4, baseHp: 450, baseAtk: 45, baseDef: 22, baseSpd: 16, skills: ['dark_strike', 'drain', 'inferno'], loot: { minCoins: 600, maxCoins: 1200 } },
  { name: 'Void Entity', emoji: '🌑', tier: 4, baseHp: 500, baseAtk: 50, baseDef: 25, baseSpd: 20, skills: ['dark_strike', 'drain', 'inferno', 'void_collapse'], loot: { minCoins: 800, maxCoins: 1500 } },
];

const SKILLS = {
  slash:          { name: 'Slash', emoji: '⚔', type: 'dmg', mult: 1.0, desc: 'Basic attack' },
  bone_throw:     { name: 'Bone Throw', emoji: '🦴', type: 'dmg', mult: 1.1, desc: 'Throws a bone' },
  absorb:         { name: 'Absorb', emoji: '💚', type: 'heal', amount: 0.15, desc: 'Heals 15% max HP' },
  howl:           { name: 'Howl', emoji: '<:Star:1473038501766369300>', type: 'buff', stat: 'atk', amount: 0.2, desc: '+20% ATK buff' },
  fireball:       { name: 'Fireball', emoji: '<:Fire:1473038604812161218>', type: 'dmg', mult: 1.5, desc: 'Powerful fire attack' },
  drain:          { name: 'Life Drain', emoji: '🩸', type: 'drain', mult: 0.8, desc: 'Deals dmg & heals' },
  slam:           { name: 'Slam', emoji: '💥', type: 'dmg', mult: 1.3, desc: 'Heavy ground slam' },
  fortify:        { name: 'Fortify', emoji: '<:Shield:1473038669831995494>', type: 'buff', stat: 'def', amount: 0.3, desc: '+30% DEF buff' },
  dark_strike:    { name: 'Dark Strike', emoji: '🌑', type: 'dmg', mult: 1.7, desc: 'Shadow-infused strike' },
  frost_breath:   { name: 'Frost Breath', emoji: '❄', type: 'dmg_debuff', mult: 1.2, debuff: 'spd', debuffAmt: 0.2, desc: 'Frost dmg + slow' },
  inferno:        { name: 'Inferno', emoji: '🌋', type: 'dmg', mult: 2.0, desc: 'Devastating fire' },
  void_collapse:  { name: 'Void Collapse', emoji: '🕳', type: 'dmg', mult: 2.5, desc: 'Reality-breaking attack' },
};

function loadPets() { return ph.loadPets(); }
function savePets(data) { ph.savePets(data); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function scaleStats(base, level) {
  return {
    hp: Math.floor(base.baseHp * (1 + (level - 1) * 0.12)),
    atk: Math.floor(base.baseAtk * (1 + (level - 1) * 0.10)),
    def: Math.floor((base.baseDef || 0) * (1 + (level - 1) * 0.08)),
    spd: Math.floor((base.baseSpd || 0) * (1 + (level - 1) * 0.06)),
  };
}

function selectEnemy(petLevel) {
  const tier = petLevel <= 3 ? 1 : petLevel <= 7 ? 2 : petLevel <= 12 ? 3 : 4;
  const pool = ENEMIES.filter(e => e.tier <= tier);
  const selected = clone(pool[rand(0, pool.length - 1)]);
  const enemyLevel = Math.max(1, petLevel + rand(-2, 2));
  const stats = scaleStats(selected, enemyLevel);
  return {
    ...selected, level: enemyLevel,
    hp: stats.hp, maxHp: stats.hp,
    atk: stats.atk, def: stats.def, spd: stats.spd,
  };
}

function preparePet(storedPet) {
  const pet = clone(storedPet);
  const level = pet.level || 1;
  pet.hp = pet.baseHp ? Math.floor(pet.baseHp * (1 + (level - 1) * 0.12)) : (pet.hp || 50);
  pet.atk = pet.baseAtk ? Math.floor(pet.baseAtk * (1 + (level - 1) * 0.10)) : (pet.atk || 10);
  pet.def = pet.baseDef ? Math.floor(pet.baseDef * (1 + (level - 1) * 0.08)) : Math.floor(5 + level * 2);
  pet.spd = pet.baseSpd ? Math.floor(pet.baseSpd * (1 + (level - 1) * 0.06)) : Math.floor(5 + level);
  if (pet.weapon) pet.atk += pet.weapon.baseAtk || 0;
  pet.maxHp = pet.hp;
  pet.skills = pet.skills || ['slash'];
  pet.level = level;
  return pet;
}

function hpBar(current, max, len = 10) {
  const pct = Math.max(0, current) / max;
  const filled = Math.round(pct * len);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(len - filled);
}

function executeTurn(attacker, defender, skillId) {
  const skill = SKILLS[skillId] || SKILLS.slash;
  const log = [];
  let dmg = 0;

  const crit = Math.random() < 0.15;
  const miss = Math.random() < Math.max(0.05, 0.15 - (attacker.spd - defender.spd) * 0.01);

  switch (skill.type) {
    case 'dmg': {
      if (miss) { log.push(skill.emoji + ' ' + attacker.name + ' \u2192 **MISS!**'); break; }
      dmg = Math.max(1, Math.floor(attacker.atk * skill.mult - defender.def * 0.5));
      if (crit) { dmg = Math.floor(dmg * 1.5); log.push(skill.emoji + ' ' + attacker.name + ' \u2192 **' + dmg + ' dmg** \uD83D\uDCA5 CRIT!'); }
      else { log.push(skill.emoji + ' ' + attacker.name + ' \u2192 **' + dmg + ' dmg**'); }
      defender.hp -= dmg;
      break;
    }
    case 'heal': {
      const heal = Math.floor(attacker.maxHp * skill.amount);
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
      log.push(skill.emoji + ' ' + attacker.name + ' \u2192 healed **' + heal + ' HP**');
      break;
    }
    case 'buff': {
      const increase = Math.floor(attacker[skill.stat] * skill.amount);
      attacker[skill.stat] += increase;
      log.push(skill.emoji + ' ' + attacker.name + ' \u2192 **+' + increase + ' ' + skill.stat.toUpperCase() + '**');
      break;
    }
    case 'drain': {
      if (miss) { log.push(skill.emoji + ' ' + attacker.name + ' \u2192 **MISS!**'); break; }
      dmg = Math.max(1, Math.floor(attacker.atk * skill.mult - defender.def * 0.3));
      if (crit) dmg = Math.floor(dmg * 1.5);
      defender.hp -= dmg;
      const healed = Math.floor(dmg * 0.4);
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + healed);
      log.push(skill.emoji + ' ' + attacker.name + ' \u2192 **' + dmg + ' dmg**, healed **' + healed + '**' + (crit ? ' \uD83D\uDCA5' : ''));
      break;
    }
    case 'dmg_debuff': {
      if (miss) { log.push(skill.emoji + ' ' + attacker.name + ' \u2192 **MISS!**'); break; }
      dmg = Math.max(1, Math.floor(attacker.atk * skill.mult - defender.def * 0.4));
      if (crit) dmg = Math.floor(dmg * 1.5);
      defender.hp -= dmg;
      const debuffVal = Math.floor(defender[skill.debuff] * skill.debuffAmt);
      defender[skill.debuff] = Math.max(0, defender[skill.debuff] - debuffVal);
      log.push(skill.emoji + ' ' + attacker.name + ' \u2192 **' + dmg + ' dmg**, -' + debuffVal + ' ' + skill.debuff.toUpperCase() + (crit ? ' \uD83D\uDCA5' : ''));
      break;
    }
  }
  return log;
}

function runBattle(petA, petB) {
  const turnLog = [];
  let round = 0;
  const maxRounds = 20;

  while (petA.hp > 0 && petB.hp > 0 && round < maxRounds) {
    round++;
    const first = petA.spd >= petB.spd ? petA : petB;
    const second = first === petA ? petB : petA;

    const firstSkills = first.skills || ['slash'];
    turnLog.push(...executeTurn(first, second, firstSkills[rand(0, firstSkills.length - 1)]));
    if (second.hp <= 0) break;

    const secondSkills = second.skills || ['slash'];
    turnLog.push(...executeTurn(second, first, secondSkills[rand(0, secondSkills.length - 1)]));
  }
  return { turnLog, petA, petB, rounds: round };
}

function buildBattleContainer(petA, petB, finalA, finalB, won, turnLog, rewards, rounds) {
  const container = createContainer(won ? 0xCAD7E6 : 0xED4245);
  const title = won ? '\uD83C\uDFC6 Victory!' : '\uD83D\uDC80 Defeated!';

  addTextDisplay(container, [
    '# \u2694\uFE0F Battle Result \u2014 ' + title,
    '',
    '**' + (petA.emoji || '\uD83D\uDC3E') + ' ' + petA.name + '** Lv.' + petA.level + ' vs **' + (petB.emoji || '\uD83D\uDC79') + ' ' + petB.name + '** Lv.' + (petB.level || '?'),
  ].join('\n'));

  addSeparator(container, SeparatorSpacingSize.Small);

  addTextDisplay(container, [
    '> ' + (petA.emoji || '\uD83D\uDC3E') + ' HP: `' + hpBar(Math.max(0, finalA.hp), finalA.maxHp) + '` ' + Math.max(0, finalA.hp) + '/' + finalA.maxHp,
    '> ' + (petB.emoji || '\uD83D\uDC79') + ' HP: `' + hpBar(Math.max(0, finalB.hp), finalB.maxHp) + '` ' + Math.max(0, finalB.hp) + '/' + finalB.maxHp,
    '',
    '\u2694\uFE0F **Rounds:** ' + rounds,
  ].join('\n'));

  addSeparator(container, SeparatorSpacingSize.Small);

  addTextDisplay(container, [
    '**Battle Log** (last 5):',
    ...turnLog.slice(-5).map(function(l) { return '> ' + l; }),
  ].join('\n'));

  if (won && rewards) {
    addSeparator(container, SeparatorSpacingSize.Small);
    const rewardLines = [
      '### \uD83C\uDFC6 Rewards',
      '> \uD83E\uDE99 **+' + formatNumber(rewards.coins) + '** coins',
      '> \uD83D\uDCCA **+' + rewards.exp + '** XP',
    ];
    if (rewards.leveledUp) {
      rewardLines.push('> \uD83C\uDF89 **Level Up \u2192 Lv.' + rewards.newLevel + '!**');
    }
    rewardLines.push('', '-# Use `battle` again after the cooldown to keep fighting!');
    addTextDisplay(container, rewardLines.join('\n'));
  } else if (!won) {
    addSeparator(container, SeparatorSpacingSize.Small);
    addTextDisplay(container, '<:Cancel:1473037949187657818> Your pet was defeated. Train harder and try again!\n\n-# Level up your pet with `battle` and `adventure` to get stronger.');
  }

  return container;
}

async function handlePVE(reply, userId, guildId) {
  const now = Date.now();

  if (cooldowns.get(userId) > now) {
    const left = Math.ceil((cooldowns.get(userId) - now) / 1000);
    const c = createContainer(0xED4245);
    addTextDisplay(c, '<:Cancel:1473037949187657818> Battle cooldown: **' + left + 's** remaining.');
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }
  cooldowns.set(userId, now + COOLDOWN);

  const petsData = loadPets();
  const userData = petsData[userId];

  if (!userData || !userData.activeBattlePet) {
    const c = createContainer(0xED4245);
    addTextDisplay(c, '<:Cancel:1473037949187657818> Set an active battle pet first! Use `pets active <petId>`');
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  const storedPet = userData.animals.find(function(p) { return p.id === userData.activeBattlePet; });
  if (!storedPet) {
    const c = createContainer(0xED4245);
    addTextDisplay(c, '<:Cancel:1473037949187657818> Active pet not found.');
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  const petA = preparePet(storedPet);
  const enemy = selectEnemy(storedPet.level || 1);
  const result = runBattle(petA, enemy);
  const turnLog = result.turnLog;
  const finalA = result.petA;
  const finalB = result.petB;
  const rounds = result.rounds;
  const won = finalA.hp > 0;
  var rewards = null;

  if (won) {
    const expGain = 25 + enemy.level * 12 + enemy.tier * 15;
    const coinReward = rand(enemy.loot.minCoins, enemy.loot.maxCoins) + enemy.level * 10;

    storedPet.exp = (storedPet.exp || 0) + expGain;
    const expForLevel = (storedPet.level || 1) * 100;
    if (storedPet.exp >= expForLevel) {
      storedPet.exp -= expForLevel;
      storedPet.level = (storedPet.level || 1) + 1;
      storedPet.baseHp = Math.floor((storedPet.baseHp || 50) * 1.06);
      storedPet.baseAtk = Math.floor((storedPet.baseAtk || 10) * 1.05);
      storedPet.baseDef = Math.floor((storedPet.baseDef || 5) * 1.04);
      storedPet.baseSpd = Math.floor((storedPet.baseSpd || 5) * 1.03);
    }
    savePets(petsData);

    const economy = economyManager.loadEconomy();
    const ecoResult = economyManager.getUser(economy, userId);
    const ecoUser = ecoResult.userData;
    ecoUser.coins += coinReward;
    ecoUser.battlesWon = (ecoUser.battlesWon || 0) + 1;
    const xpResult = economyManager.addXP(economy, userId, 10 + enemy.tier * 5);
    if (ecoUser.battlesWon === 1) economyManager.checkAchievement(economy, userId, 'first_battle');
    if (ecoUser.battlesWon >= 50) economyManager.checkAchievement(economy, userId, 'battle_50');
    economyManager.saveEconomy(economy);

    rewards = { coins: coinReward, exp: expGain, leveledUp: xpResult.leveledUp, newLevel: xpResult.newLevel };
  } else {
    const economy = economyManager.loadEconomy();
    const ecoResult = economyManager.getUser(economy, userId);
    ecoResult.userData.battlesLost = (ecoResult.userData.battlesLost || 0) + 1;
    economyManager.saveEconomy(economy);
  }

  const container = buildBattleContainer(petA, enemy, finalA, finalB, won, turnLog, rewards, rounds);
  return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function handlePVP(message, args, guildId) {
  const target = await resolveUser(message, args);
  if (!target) { var ec = createContainer(0xED4245); addTextDisplay(ec, '<:Cancel:1473037949187657818> **Usage:** `battle pvp @user`'); return message.reply({ components: [ec], flags: MessageFlags.IsComponentsV2 }); }
  if (target.id === message.author.id) { var ec = createContainer(0xED4245); addTextDisplay(ec, '<:Cancel:1473037949187657818> You cannot battle yourself!'); return message.reply({ components: [ec], flags: MessageFlags.IsComponentsV2 }); }
  if (target.bot) { var ec = createContainer(0xED4245); addTextDisplay(ec, '<:Cancel:1473037949187657818> You cannot battle bots!'); return message.reply({ components: [ec], flags: MessageFlags.IsComponentsV2 }); }

  const petsData = loadPets();
  const attacker = petsData[message.author.id];
  const defender = petsData[target.id];

  if (!attacker || !attacker.activeBattlePet) { var ec = createContainer(0xED4245); addTextDisplay(ec, '<:Cancel:1473037949187657818> You don\'t have an active battle pet!'); return message.reply({ components: [ec], flags: MessageFlags.IsComponentsV2 }); }
  if (!defender || !defender.activeBattlePet) { var ec = createContainer(0xED4245); addTextDisplay(ec, '<:Cancel:1473037949187657818> **' + target.username + '** doesn\'t have an active battle pet!'); return message.reply({ components: [ec], flags: MessageFlags.IsComponentsV2 }); }

  var aPet = attacker.animals.find(function(p) { return p.id === attacker.activeBattlePet; });
  var dPet = defender.animals.find(function(p) { return p.id === defender.activeBattlePet; });
  if (!aPet || !dPet) { var ec = createContainer(0xED4245); addTextDisplay(ec, '<:Cancel:1473037949187657818> Active pet not found.'); return message.reply({ components: [ec], flags: MessageFlags.IsComponentsV2 }); }

  var sessId = 'pvp_' + Date.now() + '_' + message.author.id;

  var row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(sessId + '_accept')
      .setLabel('\u2694\uFE0F Accept Battle')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(sessId + '_decline')
      .setLabel('\u2716 Decline')
      .setStyle(ButtonStyle.Secondary)
  );

  var container = createContainer(0xCAD7E6);
  addTextDisplay(container, [
    '# \u2694\uFE0F PvP Challenge!',
    '',
    '**' + message.author.username + '** challenges **' + target.username + '**!',
    '',
    '> ' + (aPet.emoji || '\uD83D\uDC3E') + ' **' + aPet.name + '** Lv.' + (aPet.level || 1) + ' \u2694\uFE0F vs \u2694\uFE0F ' + (dPet.emoji || '\uD83D\uDC3E') + ' **' + dPet.name + '** Lv.' + (dPet.level || 1),
    '',
    target.toString() + ', press **Accept Battle** to fight or **Decline** to refuse.',
  ].join('\n'));

  var msg = await message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });

  var collector = msg.createMessageComponentCollector({ time: 30000 });

  collector.on('collect', async function(i) {
    if (i.user.id !== target.id) {
      await i.reply({
        content: '<:Cancel:1473037949187657818> Only **' + target.username + '** can respond to this battle.',
        ephemeral: true
      });
      return;
    }

    await i.deferUpdate();
    collector.stop();

    if (i.customId === sessId + '_decline') {
      var c = createContainer(0x6b7280);
      addTextDisplay(c, '# <:Cancel:1473037949187657818> PvP Declined\n\n**' + target.username + '** declined the battle challenge.');
      return msg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(function() {});
    }

    var petA = preparePet(aPet);
    var petB = preparePet(dPet);
    var result = runBattle(petA, petB);
    var turnLog = result.turnLog;
    var fA = result.petA;
    var fB = result.petB;
    var rounds = result.rounds;
    var attackerWon = fA.hp > 0;

    var winnerId = attackerWon ? message.author.id : target.id;
    var loserId = attackerWon ? target.id : message.author.id;
    var winnerName = attackerWon ? message.author.username : target.username;
    var coinReward = 100 + Math.floor(Math.random() * 200);

    var economy = economyManager.loadEconomy();
    var winnerResult = economyManager.getUser(economy, winnerId);
    var loserResult = economyManager.getUser(economy, loserId);
    var winner = winnerResult.userData;
    var loser = loserResult.userData;
    winner.coins += coinReward;
    winner.battlesWon = (winner.battlesWon || 0) + 1;
    loser.battlesLost = (loser.battlesLost || 0) + 1;
    var xpResult = economyManager.addXP(economy, winnerId, 15);
    economyManager.addXP(economy, loserId, 5);
    if (winner.battlesWon === 1) economyManager.checkAchievement(economy, winnerId, 'first_battle');
    if (winner.battlesWon >= 50) economyManager.checkAchievement(economy, winnerId, 'battle_50');
    economyManager.saveEconomy(economy);

    var pvpContainer = createContainer(0xCAD7E6);
    addTextDisplay(pvpContainer, [
      '# \u2694\uFE0F PvP Result',
      '',
      '<:Checkedbox:1473038547165384804> \uD83C\uDFC6 **' + winnerName + '** wins!',
    ].join('\n'));

    addSeparator(pvpContainer, SeparatorSpacingSize.Small);

    addTextDisplay(pvpContainer, [
      '> ' + (fA.emoji || '\uD83D\uDC3E') + ' HP: `' + hpBar(Math.max(0, fA.hp), fA.maxHp) + '` ' + Math.max(0, fA.hp) + '/' + fA.maxHp,
      '> ' + (fB.emoji || '\uD83D\uDC3E') + ' HP: `' + hpBar(Math.max(0, fB.hp), fB.maxHp) + '` ' + Math.max(0, fB.hp) + '/' + fB.maxHp,
      '',
      '**Battle Log** (last 5):',
      ...turnLog.slice(-5).map(function(l) { return '> ' + l; }),
    ].join('\n'));

    addSeparator(pvpContainer, SeparatorSpacingSize.Small);

    addTextDisplay(pvpContainer, [
      '### \uD83C\uDFC6 Rewards',
      '> \uD83E\uDE99 **+' + formatNumber(coinReward) + '** coins',
      '> \uD83D\uDCCA **+15** XP',
      xpResult.leveledUp ? '> \uD83C\uDF89 **Level Up \u2192 Lv.' + xpResult.newLevel + '!**' : '',
      '',
      '-# Challenge others with `battle pvp @user`',
    ].filter(Boolean).join('\n'));

    await msg.edit({ components: [pvpContainer], flags: MessageFlags.IsComponentsV2 }).catch(function() {});
  });

  collector.on('end', function(collected, reason) {
    if (reason === 'time' && collected.size === 0) {
      var c = createContainer(0x6b7280);
      addTextDisplay(c, '# \u23F3 PvP Timed Out\n\n**' + target.username + '** didn\'t respond in time.');
      msg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(function() {});
    }
  });
}

module.exports = {
  data: new (require('discord.js').SlashCommandBuilder)()
    .setName('battle')
    .setDescription('Battle enemies or other players with your pet'),
  prefix: 'battle',
  aliases: ['fight', 'bt'],
  category: 'economy',
  description: 'Battle enemies or other players with your pet',

  async executePrefix(message, args) {
    var sub = args[0] ? args[0].toLowerCase() : null;
    if (sub === 'pvp') return handlePVP(message, args.slice(1), message.guild?.id);
    return handlePVE(message.reply.bind(message), message.author.id, message.guild?.id);
  },

  async execute(interaction) {
    return handlePVE(interaction.reply.bind(interaction), interaction.user.id, interaction.guild?.id);
  }
};
