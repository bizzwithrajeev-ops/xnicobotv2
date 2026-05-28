'use strict';

/**
 * /pp — Visual PP-size card. Uses the shared percent card so every
 * fun "measurement" command shares the same look-and-feel. Random
 * 1–15 inches mapped to a 0–100% bar fill for the visual.
 */

const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder,
    MediaGalleryItemBuilder, MessageFlags, AttachmentBuilder,
} = require('discord.js');
const { renderPercentCard } = require('../../utils/percentCard');
const { hashPercent, pickVerdict } = require('../../utils/percentCommandFactory');

const tiers = [
    { max: 10,  text: 'Microscope required 🔬' },
    { max: 30,  text: 'A modest specimen 🐛' },
    { max: 55,  text: 'Solid average 🍌' },
    { max: 75,  text: 'Above the curve 📈' },
    { max: 90,  text: 'Anaconda territory 🐍' },
    { max: 100, text: 'Legendary unit 🐉✨' },
];

function userInches(userId) {
    // 1–15 inch range from a stable hash so the same user always
    // gets the same number for /pp.
    const p = hashPercent(`pp:${userId}`);   // 0–100
    return 1 + Math.round((p / 100) * 14);   // 1–15
}

async function buildAndSend(targetUser, displayName) {
    const inches = userInches(targetUser.id);
    const barFill = Math.round((inches / 15) * 100);
    const verdict = pickVerdict(barFill, tiers);

    const buffer = await renderPercentCard({
        title: 'PP Inspector',
        subjectName: displayName || targetUser.username,
        avatarURL: targetUser.displayAvatarURL({ extension: 'png', size: 256 }),
        percent: inches,
        barMax: 15,
        unit: '"',
        verdict,
    });

    const attachment = new AttachmentBuilder(buffer, { name: 'pp.png' });
    const gallery = new MediaGalleryBuilder()
        .addItems(new MediaGalleryItemBuilder({ media: { url: 'attachment://pp.png' } }));

    const container = new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addMediaGalleryComponents(gallery)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            '-# Just a fun random number — please don\'t take it seriously.'
        ));

    return { container, attachment };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pp')
        .setDescription('Check PP size for a user')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('The user to check')
                .setRequired(false)),
    prefix: 'pp',
    description: 'Check PP size for a user',
    usage: 'pp [@user]',
    category: 'fun',
    aliases: ['ppsize', 'dick'],

    async execute(interaction) {
        await interaction.deferReply().catch(() => {});
        const target = interaction.options.getUser('user') || interaction.user;
        const member = interaction.guild?.members.cache.get(target.id);
        const displayName = member?.displayName || target.username;
        try {
            const { container, attachment } = await buildAndSend(target, displayName);
            await interaction.editReply({ components: [container], files: [attachment], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('[pp] render error:', err);
            await interaction.editReply({ content: '<:Cancel:1473037949187657818> Failed to generate the image.' }).catch(() => {});
        }
    },

    async executePrefix(message) {
        const target = message.mentions.users.first() || message.author;
        const member = message.guild?.members.cache.get(target.id);
        const displayName = member?.displayName || target.username;
        try {
            const { container, attachment } = await buildAndSend(target, displayName);
            await message.reply({ components: [container], files: [attachment], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('[pp] render error:', err);
            await message.reply('<:Cancel:1473037949187657818> Failed to generate the image.').catch(() => {});
        }
    }
};
