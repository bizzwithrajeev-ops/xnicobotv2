const { createContainer, addTextDisplay, formatNumber, MessageFlags } = require('../../utils/componentHelpers');
const { formatCoins, formatCoinsShort } = require('../../utils/currencyHelper');
const economyManager = require('../../utils/economyManager');
const ph = require('../../utils/petHelpers');

const MAX_WEAPON_LEVEL = 10;

// Use shared WEAPONS catalog from petHelpers
const WEAPONS = ph.WEAPONS;

const RARITY_MULT = {
  common: 1,
  uncommon: 1.3,
  rare: 1.6,
  epic: 2,
  legendary: 2.5
};

/* ---------------- HELPERS ---------------- */

function load(file) { return ph.loadPets(); }
function save(file, data) { ph.savePets(data); }

/* ---------------- COMMAND ---------------- */

module.exports = {
  data: new (require('discord.js').SlashCommandBuilder)()
    .setName('weapon')
    .setDescription('Manage your pet weapons — equip, upgrade, or view info')
    .addStringOption(o => o.setName('action').setDescription('Action: list, equip, upgrade, info').setRequired(false)
      .addChoices(
        { name: 'List weapons', value: 'list' },
        { name: 'Equip weapon', value: 'equip' },
        { name: 'Upgrade weapon', value: 'upgrade' },
        { name: 'Weapon info', value: 'info' },
      ))
    .addStringOption(o => o.setName('id').setDescription('Weapon ID (for equip/upgrade/info)').setRequired(false)),
  prefix: 'weapon',
  description: 'Manage your pet weapons — equip, upgrade, or view info',
  usage: 'weapon <list|equip|upgrade|info> [id]',
  category: 'economy',
  aliases: ['weap'],

  async executePrefix(message, args) {
        const guildId = message.guild?.id;
    const pets = ph.loadPets();
    const userId = message.author.id;
    const sub = args[0];

    if (!pets[userId] || !pets[userId].activeBattlePet) {
      const c = createContainer(0xED4245); addTextDisplay(c, '<:Cancel:1473037949187657818> You don\'t have an active pet.');
      return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    const pet = pets[userId].animals.find(p => p.id === pets[userId].activeBattlePet);
    if (!pet) {
      const c = createContainer(0xED4245); addTextDisplay(c, '<:Cancel:1473037949187657818> Active pet not found.');
      return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    /* ---------- LIST ---------- */
    if (!sub || sub === "list") {
      const list = Object.entries(WEAPONS)
        .map(([id, w]) => `• **${id}** — ${w.name} (+${w.baseAtk} ATK)`)
        .join("\n");

      const container = createContainer();
      addTextDisplay(container, `# 🗡️ Weapons\n\n${list}\n\nUse \`weapon equip <id>\``);
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    /* ---------- EQUIP ---------- */
    if (sub === "equip") {
      const id = args[1];
      if (!WEAPONS[id]) {
        const c = createContainer(0xED4245); addTextDisplay(c, '<:Cancel:1473037949187657818> Weapon not found. Use `weapon list` to see available weapons.');
        return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
      }

      pet.weapon = {
        id,
        name: WEAPONS[id].name,
        baseAtk: WEAPONS[id].baseAtk,
        level: 1,
        rarity: pet.rarity
      };

      ph.savePets(pets);

      const container = createContainer();
      addTextDisplay(container, `# 🗡️ Weapon Equipped\n\n<:Checkedbox:1473038547165384804> Equipped **${WEAPONS[id].name}** to ${pet.emoji} **${pet.name}**`);
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    /* ---------- UPGRADE ---------- */
    if (sub === "upgrade") {
      if (!pet.weapon) {
        const c = createContainer(0xED4245); addTextDisplay(c, '<:Cancel:1473037949187657818> No weapon equipped. Use `weapon equip <id>` first.');
        return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
      }
      if (pet.weapon.level >= MAX_WEAPON_LEVEL) {
        const c = createContainer(0xFEE75C); addTextDisplay(c, '<:Infotriangle:1473038460456800459> Weapon already at max level!');
        return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
      }

      const rarityMult = RARITY_MULT[pet.weapon.rarity] || 1;
      const cost = Math.floor(5000 * pet.weapon.level * rarityMult);

      const economy = economyManager.loadEconomy();
      const { userData: wUser } = economyManager.getUser(economy, userId);
      if (wUser.coins < cost) {
        const c = createContainer(0xED4245); addTextDisplay(c, `<:Cancel:1473037949187657818> You need **${formatCoins(cost, guildId)}** to upgrade.`);
        return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
      }

      wUser.coins -= cost;
      pet.weapon.level++;
      pet.weapon.baseAtk += 2;

      ph.savePets(pets);
      economyManager.saveEconomy(economy);

      const container = createContainer();
      addTextDisplay(container, `# 🗡️ Weapon Upgraded!\n\n` +
        `<:Star:1473038501766369300> Level: **${pet.weapon.level}/${MAX_WEAPON_LEVEL}**\n` +
        `⚔️ ATK: **${pet.weapon.baseAtk}**\n` +
        `<:Money:1473377877239140529> Cost: ${formatCoins(cost, guildId)}`);

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    /* ---------- INFO ---------- */
    if (sub === "info") {
      if (!pet.weapon) {
        const c = createContainer(0xED4245); addTextDisplay(c, '<:Cancel:1473037949187657818> No weapon equipped.');
        return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
      }

      const container = createContainer();
      addTextDisplay(container, `# 🗡️ Weapon Info\n\n` +
        `**${pet.weapon.name}**\n` +
        `<:Star:1473038501766369300> Rarity: ${pet.weapon.rarity}\n` +
        `📈 Level: ${pet.weapon.level}/${MAX_WEAPON_LEVEL}\n` +
        `⚔️ ATK: ${pet.weapon.baseAtk}`);
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const c = createContainer(0xED4245); addTextDisplay(c, '<:Cancel:1473037949187657818> Invalid subcommand. Use `weapon list`, `weapon equip`, `weapon upgrade`, or `weapon info`.');
    return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  },

  async execute(interaction) {
        await interaction.deferReply({ flags: 1 << 15 });
    const sub = interaction.options?.getString('action') || 'list';
    const weaponId = interaction.options?.getString('id');
    const fakeArgs = [sub, weaponId].filter(Boolean);
    const fakeMessage = {
      author: interaction.user,
      reply: (opts) => interaction.editReply(opts),
    };
    return module.exports.executePrefix(fakeMessage, fakeArgs);
  }
};