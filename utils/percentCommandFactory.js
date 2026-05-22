'use strict';

/**
 * percentCommandFactory.js — Factory for "How X?"-style percentage
 * commands.  Produces a complete command module (slash + prefix +
 * canvas image + verdict) from a small config object.
 *
 * © Rajeev (Rexzy) — xNico
 */

const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    AttachmentBuilder,
} = require('discord.js');
const { renderPercentCard } = require('./percentCard');

/**
 * Pick a verdict tier based on percentage.
 * @param {number} p – percentage 0–100
 * @param {Array<{max:number, text:string}>} tiers – sorted ascending by max
 */
function pickVerdict(p, tiers) {
    for (const t of tiers) {
        if (p <= t.max) return t.text;
    }
    return tiers[tiers.length - 1]?.text || '';
}

/**
 * Stable hash for (commandName, userId) → 0–100. Same user always
 * gets the same percentage for the same command, but different
 * commands give different results.  Pass `random: true` to use
 * Math.random() instead.
 */
function hashPercent(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return Math.abs(h) % 101;
}

/**
 * Build a percentage command module.
 *
 * @param {object} cfg
 * @param {string} cfg.name        Slash command name (lowercase, no spaces)
 * @param {string} cfg.title       Card title (e.g. "How Gay?")
 * @param {string} cfg.description Slash + prefix description
 * @param {string} [cfg.usage]     Usage hint
 * @param {string[]} [cfg.aliases] Prefix aliases
 * @param {Array<{max:number,text:string}>} cfg.tiers  Verdict tiers
 * @param {string} [cfg.unit='%']  Unit shown after value
 * @param {boolean} [cfg.random]   Use Math.random() per call instead of hash
 * @param {string} [cfg.fileName]  Output PNG name
 * @param {string} [cfg.footerNote] Small note below the image
 */
function createPercentCommand(cfg) {
    const {
        name,
        title,
        description,
        usage,
        aliases = [],
        tiers,
        unit = '%',
        random = false,
        fileName = `${cfg.name}.png`,
        footerNote = '-# Just a fun random number — please don\'t take it seriously.',
    } = cfg;

    async function run(targetUser, displayName) {
        const seed = `${name}:${targetUser.id}`;
        const percent = random ? Math.floor(Math.random() * 101) : hashPercent(seed);
        const verdict = pickVerdict(percent, tiers);

        const buffer = await renderPercentCard({
            title,
            subjectName: displayName || targetUser.username || 'Unknown',
            avatarURL: targetUser.displayAvatarURL({ extension: 'png', size: 256 }),
            percent,
            verdict,
            unit,
        });

        const attachment = new AttachmentBuilder(buffer, { name: fileName });
        const gallery = new MediaGalleryBuilder()
            .addItems(new MediaGalleryItemBuilder({ media: { url: `attachment://${fileName}` } }));

        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addMediaGalleryComponents(gallery)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(footerNote));

        return { container, attachment };
    }

    return {
        data: new SlashCommandBuilder()
            .setName(name)
            .setDescription(description)
            .addUserOption(opt => opt.setName('user').setDescription('Target user (defaults to you)')),
        prefix: name,
        description,
        usage: usage || `${name} [@user]`,
        category: 'fun',
        aliases,

        async execute(interaction) {
            await interaction.deferReply().catch(() => {});
            const target = interaction.options.getUser('user') || interaction.user;
            const member = interaction.guild?.members.cache.get(target.id);
            const displayName = member?.displayName || target.displayName || target.username;
            try {
                const { container, attachment } = await run(target, displayName);
                await interaction.editReply({ components: [container], files: [attachment], flags: MessageFlags.IsComponentsV2 });
            } catch (err) {
                console.error(`[${name}] render error:`, err);
                await interaction.editReply({ content: '<:Cancel:1473037949187657818> Failed to generate the image.' }).catch(() => {});
            }
        },

        async executePrefix(message, args) {
            const target = message.mentions.users.first() || message.author;
            const member = message.guild?.members.cache.get(target.id);
            const displayName = member?.displayName || target.username;
            try {
                const { container, attachment } = await run(target, displayName);
                await message.reply({ components: [container], files: [attachment], flags: MessageFlags.IsComponentsV2 });
            } catch (err) {
                console.error(`[${name}] render error:`, err);
                await message.reply('<:Cancel:1473037949187657818> Failed to generate the image.').catch(() => {});
            }
        },
    };
}

module.exports = { createPercentCommand, pickVerdict, hashPercent };
