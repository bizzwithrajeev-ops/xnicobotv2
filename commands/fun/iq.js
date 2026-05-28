'use strict';

const { pickVerdict, hashPercent } = require('../../utils/percentCommandFactory');
const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder,
    MediaGalleryItemBuilder, MessageFlags, AttachmentBuilder
} = require('discord.js');
const { renderPercentCard } = require('../../utils/percentCard');

// IQ ranges roughly 60–200 — clamp to a stable per-user value
function userIQ(userId) {
    const p = hashPercent(`iq:${userId}`);   // 0–100
    return 60 + Math.round((p / 100) * 140); // 60–200
}

const tiers = [
    { max: 79,  text: 'Looking confused most days 🤔' },
    { max: 99,  text: 'Solidly average 🙂' },
    { max: 119, text: 'A cut above the rest ⚡' },
    { max: 139, text: 'Sharp thinker 🧠' },
    { max: 159, text: 'Big brain certified 🎓' },
    { max: 200, text: 'Galaxy-brain genius 🌌' },
];

async function buildAndSend(targetUser, displayName) {
    const iq = userIQ(targetUser.id);
    const verdict = pickVerdict(iq, tiers);

    const buffer = await renderPercentCard({
        title: 'IQ Test',
        subjectName: displayName || targetUser.username,
        avatarURL: targetUser.displayAvatarURL({ extension: 'png', size: 256 }),
        percent: iq,             // shown as the big number
        barMax: 200,             // scale ring + bar against an IQ-of-200 cap
        verdict,
        unit: '',
    });

    const attachment = new AttachmentBuilder(buffer, { name: 'iq.png' });
    const gallery = new MediaGalleryBuilder()
        .addItems(new MediaGalleryItemBuilder({ media: { url: 'attachment://iq.png' } }));

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
        .setName('iq')
        .setDescription('Reveal a user\'s IQ score (just for fun)')
        .addUserOption(opt => opt.setName('user').setDescription('Target user (defaults to you)')),
    prefix: 'iq',
    description: 'Reveal a user\'s IQ score (just for fun)',
    usage: 'iq [@user]',
    category: 'fun',
    aliases: ['iqtest'],

    async execute(interaction) {
        await interaction.deferReply().catch(() => {});
        const target = interaction.options.getUser('user') || interaction.user;
        const member = interaction.guild?.members.cache.get(target.id);
        const displayName = member?.displayName || target.username;
        try {
            const { container, attachment } = await buildAndSend(target, displayName);
            await interaction.editReply({ components: [container], files: [attachment], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('[iq] render error:', err);
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
            console.error('[iq] render error:', err);
            await message.reply('<:Cancel:1473037949187657818> Failed to generate the image.').catch(() => {});
        }
    },
};
