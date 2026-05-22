'use strict';

/**
 * percentCard.js — Reusable percentage card generator.
 *
 * Used by /howgay, /howlesbian, /howstraight, /howcute, /howsmart,
 * /howsus, /iq, /pp, /ship, /rate and similar percentage-style fun
 * commands.  Renders a polished canvas image with the user's avatar,
 * a circular progress ring around it, the percentage value, a custom
 * label, a colour-graded progress bar, a verdict line, and bot
 * branding.
 *
 * © Rajeev (Rexzy) — xNico
 */

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const imageCache = require('./imageCache');
const { registerAllFonts, getFontHelpers } = require('./fontRegistry');

try { registerAllFonts(); } catch (_) {}

const W = 900;
const H = 360;

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

/**
 * Pick a colour for a given percentage. 0% = red, 50% = orange,
 * 100% = green. Smooth gradient between stops.
 */
function colorForPercent(p) {
    const stops = [
        { p: 0,   c: [239, 68, 68]  },  // red
        { p: 50,  c: [251, 146, 60] },  // orange
        { p: 100, c: [34, 197, 94]  },  // green
    ];
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
        if (p >= stops[i].p && p <= stops[i + 1].p) {
            lo = stops[i]; hi = stops[i + 1]; break;
        }
    }
    const t = (p - lo.p) / Math.max(1, (hi.p - lo.p));
    const r = Math.round(lo.c[0] + (hi.c[0] - lo.c[0]) * t);
    const g = Math.round(lo.c[1] + (hi.c[1] - lo.c[1]) * t);
    const b = Math.round(lo.c[2] + (hi.c[2] - lo.c[2]) * t);
    return { hex: `rgb(${r},${g},${b})`, rgb: [r, g, b] };
}

/**
 * Draw a circular avatar with a coloured progress ring.
 */
async function drawAvatarRing(ctx, avatarURL, cx, cy, radius, percent, ringColor) {
    const ringWidth = 12;

    // Outer track (background ring)
    ctx.beginPath();
    ctx.arc(cx, cy, radius + ringWidth / 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = ringWidth;
    ctx.stroke();

    // Progress ring
    const start = -Math.PI / 2;
    const end = start + (Math.PI * 2 * percent) / 100;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + ringWidth / 2, start, end);
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = ringWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Avatar
    try {
        const img = await imageCache.loadWithCache(avatarURL, 8000).catch(() => null);
        if (img) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
            ctx.restore();
        } else {
            ctx.fillStyle = '#1f2937';
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    } catch (_) {
        ctx.fillStyle = '#1f2937';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * Render a percentage card image.
 *
 * @param {object} opts
 * @param {string} opts.title       Card title (e.g. "How Gay?")
 * @param {string} opts.subjectName Display name shown next to avatar
 * @param {string} opts.avatarURL   Avatar URL of the subject
 * @param {number} opts.percent     0–100
 * @param {string} opts.verdict     Short verdict line (e.g. "Pretty straight")
 * @param {string} [opts.unit]      Suffix for the big value, default '%'
 * @param {string} [opts.brand]     Branding text in the corner
 * @returns {Promise<Buffer>} PNG buffer
 */
async function renderPercentCard(opts) {
    const {
        title,
        subjectName,
        avatarURL,
        percent,
        verdict,
        unit = '%',
        brand = 'xNico  •  by Rexzy',
    } = opts;

    const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    const accent = colorForPercent(p);
    const fonts = getFontHelpers('Inter');

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // ─── Background ───
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#0f0f23');
    bgGrad.addColorStop(1, '#1a1a3e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Soft accent glow blob (top-right)
    const glow = ctx.createRadialGradient(W - 120, 80, 20, W - 120, 80, 320);
    glow.addColorStop(0, `rgba(${accent.rgb.join(',')},0.35)`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Card frame
    roundedRect(ctx, 16, 16, W - 32, H - 32, 22);
    ctx.fillStyle = 'rgba(20, 20, 50, 0.6)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(${accent.rgb.join(',')},0.4)`;
    ctx.stroke();

    // ─── Avatar with progress ring (left side) ───
    const avatarRadius = 88;
    const avatarCx = 140;
    const avatarCy = H / 2;
    await drawAvatarRing(ctx, avatarURL, avatarCx, avatarCy, avatarRadius, p, accent.hex);

    // ─── Right side text ───
    const rightX = 270;
    const rightWidth = W - rightX - 40;

    // Title
    ctx.fillStyle = '#9ca3af';
    ctx.font = fonts.getMediumFont(22);
    ctx.fillText(title.toUpperCase(), rightX, 80);

    // Subject name (truncate if too long)
    let nameText = subjectName || 'Unknown';
    ctx.font = fonts.getBoldFont(36);
    while (ctx.measureText(nameText).width > rightWidth && nameText.length > 1) {
        nameText = nameText.slice(0, -1);
    }
    if (nameText !== (subjectName || 'Unknown')) nameText = nameText.slice(0, -1) + '…';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(nameText, rightX, 122);

    // Big percent value
    ctx.font = fonts.getBoldFont(96);
    ctx.fillStyle = accent.hex;
    const valueText = `${p}${unit}`;
    ctx.fillText(valueText, rightX, 220);

    // ─── Progress bar ───
    const barX = rightX;
    const barY = 248;
    const barW = rightWidth;
    const barH = 18;
    // Track
    roundedRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    // Fill
    const fillW = Math.max(barH, (barW * p) / 100);
    roundedRect(ctx, barX, barY, fillW, barH, barH / 2);
    const barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    barGrad.addColorStop(0, `rgba(${accent.rgb.join(',')},0.7)`);
    barGrad.addColorStop(1, accent.hex);
    ctx.fillStyle = barGrad;
    ctx.fill();

    // ─── Verdict ───
    if (verdict) {
        ctx.font = fonts.getMediumFont(18);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(verdict, rightX, 296);
    }

    // ─── Footer brand ───
    ctx.font = fonts.getFont(13);
    ctx.fillStyle = '#6b7280';
    const brandText = brand;
    const brandW = ctx.measureText(brandText).width;
    ctx.fillText(brandText, W - 32 - brandW, H - 28);

    return canvas.toBuffer('image/png');
}

module.exports = { renderPercentCard, colorForPercent };
