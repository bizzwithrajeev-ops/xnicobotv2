'use strict';

const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder,
    MediaGalleryItemBuilder, MessageFlags, AttachmentBuilder,
} = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');
const imageCache = require('../../utils/imageCache');
const { registerAllFonts, getFontHelpers } = require('../../utils/fontRegistry');
const { hashPercent, pickVerdict } = require('../../utils/percentCommandFactory');
const { colorForPercent } = require('../../utils/percentCard');

try { registerAllFonts(); } catch (_) {}

const W = 900;
const H = 380;

function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

async function drawCircleAvatar(ctx, url, cx, cy, r, ringColor) {
    // Glow ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 6;
    ctx.stroke();

    try {
        const img = await imageCache.loadWithCache(url, 8000).catch(() => null);
        if (img) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
            ctx.restore();
            return;
        }
    } catch {}
    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
}

const tiers = [
    { max: 15,  text: 'Not happening… 😬' },
    { max: 35,  text: 'Maybe in another life 🤷' },
    { max: 55,  text: 'Could work out 🤔' },
    { max: 75,  text: 'Pretty solid match 😍' },
    { max: 90,  text: 'Power couple energy 💞' },
    { max: 100, text: 'Soulmates confirmed 💍✨' },
];

async function renderShipCard(user1, user2, name1, name2, percent) {
    const accent = colorForPercent(percent);
    const fonts = getFontHelpers('Inter');

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0f0f23');
    bg.addColorStop(1, '#1a0a30');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Heart-shaped glow in centre
    const glow = ctx.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, 320);
    glow.addColorStop(0, `rgba(${accent.rgb.join(',')},0.45)`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Card frame
    roundedRect(ctx, 16, 16, W - 32, H - 32, 22);
    ctx.fillStyle = 'rgba(20, 20, 50, 0.55)';
    ctx.fill();
    ctx.strokeStyle = `rgba(${accent.rgb.join(',')},0.4)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Two avatars
    const avatarRadius = 80;
    const cy = 150;
    await drawCircleAvatar(ctx, user1.displayAvatarURL({ extension: 'png', size: 256 }), 200, cy, avatarRadius, accent.hex);
    await drawCircleAvatar(ctx, user2.displayAvatarURL({ extension: 'png', size: 256 }), W - 200, cy, avatarRadius, accent.hex);

    // Heart in the middle
    ctx.font = fonts.getBoldFont(72);
    ctx.fillStyle = accent.hex;
    ctx.textAlign = 'center';
    ctx.fillText('💗', W / 2, cy + 24);
    ctx.textAlign = 'left';

    // Names
    ctx.font = fonts.getSemiBoldFont(22);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(truncate(ctx, name1, 220), 200, cy + avatarRadius + 36);
    ctx.fillText(truncate(ctx, name2, 220), W - 200, cy + avatarRadius + 36);

    // Big percent
    ctx.font = fonts.getBoldFont(60);
    ctx.fillStyle = accent.hex;
    ctx.fillText(`${percent}%`, W / 2, 304);

    // Verdict
    ctx.font = fonts.getMediumFont(20);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(pickVerdict(percent, tiers), W / 2, 338);

    // Brand
    ctx.font = fonts.getFont(13);
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'right';
    ctx.fillText('xNico  •  by Rexzy', W - 32, H - 28);
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
}

function truncate(ctx, text, max) {
    let s = text || '';
    while (ctx.measureText(s).width > max && s.length > 1) s = s.slice(0, -1);
    if (s.length < (text || '').length) s = s.slice(0, -1) + '…';
    return s;
}

function shipPercent(a, b) {
    const ids = [a, b].sort();
    return hashPercent(`ship:${ids[0]}:${ids[1]}`);
}

async function buildAndSend(user1, user2, name1, name2) {
    const p = shipPercent(user1.id, user2.id);
    const buffer = await renderShipCard(user1, user2, name1, name2, p);
    const attachment = new AttachmentBuilder(buffer, { name: 'ship.png' });
    const gallery = new MediaGalleryBuilder()
        .addItems(new MediaGalleryItemBuilder({ media: { url: 'attachment://ship.png' } }));

    const container = new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addMediaGalleryComponents(gallery)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            '-# Compatibility is just for fun — chemistry is real life only.'
        ));
    return { container, attachment };
}

module.exports = {
    prefix: 'ship',
    description: 'Ship two users together and see their compatibility',
    usage: 'ship <@user1> [@user2]',
    category: 'fun',
    aliases: ['love', 'compatibility'],
    data: new SlashCommandBuilder()
        .setName('ship')
        .setDescription('Ship two users together')
        .addUserOption(o => o.setName('user1').setDescription('First user').setRequired(true))
        .addUserOption(o => o.setName('user2').setDescription('Second user (defaults to you)')),

    async execute(interaction) {
        await interaction.deferReply().catch(() => {});
        const u1 = interaction.options.getUser('user1');
        const u2 = interaction.options.getUser('user2') || interaction.user;
        const m1 = interaction.guild?.members.cache.get(u1.id);
        const m2 = interaction.guild?.members.cache.get(u2.id);
        try {
            const { container, attachment } = await buildAndSend(
                u1, u2,
                m1?.displayName || u1.username,
                m2?.displayName || u2.username
            );
            await interaction.editReply({ components: [container], files: [attachment], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('[ship] render error:', err);
            await interaction.editReply({ content: '<:Cancel:1473037949187657818> Failed to generate the ship card.' }).catch(() => {});
        }
    },

    async executePrefix(message, args) {
        const mentions = [...message.mentions.users.values()];
        const u1 = mentions[0];
        const u2 = mentions[1] || message.author;
        if (!u1) {
            return message.reply({
                components: [new ContainerBuilder()
                    .setAccentColor(0xCAD7E6)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        '# 💘 Ship\n\n**Usage:** `ship <@user1> [@user2]`\n-# Mention at least one user.'
                    ))],
                flags: MessageFlags.IsComponentsV2,
            });
        }
        const m1 = message.guild?.members.cache.get(u1.id);
        const m2 = message.guild?.members.cache.get(u2.id);
        try {
            const { container, attachment } = await buildAndSend(
                u1, u2,
                m1?.displayName || u1.username,
                m2?.displayName || u2.username
            );
            await message.reply({ components: [container], files: [attachment], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('[ship] render error:', err);
            await message.reply('<:Cancel:1473037949187657818> Failed to generate the ship card.').catch(() => {});
        }
    },
};
