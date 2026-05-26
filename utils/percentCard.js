'use strict';

/**
 * percentCard.js — Professional percentage card generator.
 *
 * Used by /howgay, /howlesbian, /howstraight, /howcute, /howsmart,
 * /howsus, /iq, /pp, /ship, /rate and similar percentage-style fun
 * commands.
 *
 * Visual design notes:
 *   • 1100×420 canvas with 28px corner radius and a layered, glassy
 *     dark background (gradient + vignette + accent glow + noise).
 *   • Left-aligned avatar with a two-tone progress ring. The ring has
 *     a soft halo behind it that uses the percent-graded accent
 *     colour, so the entire card feels cohesive.
 *   • Right-side typography stack: small uppercase title, heavy
 *     display name, oversized accent-coloured percent, gradient
 *     progress bar with a subtle "indicator" cap, and an italicised
 *     verdict line ending with a soft brand pill in the corner.
 *   • Fonts: Outfit (display + verdict) + Inter (UI text) — both
 *     already shipped with the bot. Orbitron-style numerals are
 *     simulated through letter-spacing on the heavy weight rather
 *     than swapping families, to avoid extra font registration.
 *
 * © Rajeev (Rexzy) — xNico
 */

const { createCanvas } = require('@napi-rs/canvas');
const imageCache = require('./imageCache');
const { registerAllFonts, getFontHelpers } = require('./fontRegistry');

try { registerAllFonts(); } catch (_) {}

/* ─────────────────────────── canvas size ─────────────────────────── */

const W = 1100;
const H = 420;
const PAD = 32;
const RADIUS = 28;

/* ─────────────────────────── primitives ──────────────────────────── */

function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

/** Draw a single line of text with optional letter-spacing tracking. */
function drawTracked(ctx, text, x, y, tracking = 0) {
    if (!tracking) {
        ctx.fillText(text, x, y);
        return;
    }
    let cursor = x;
    for (const ch of text) {
        ctx.fillText(ch, cursor, y);
        cursor += ctx.measureText(ch).width + tracking;
    }
}

/** Truncate a string with ellipsis to fit a max width. */
function truncate(ctx, text, maxWidth, suffix = '…') {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let out = text;
    while (out.length > 1 && ctx.measureText(out + suffix).width > maxWidth) {
        out = out.slice(0, -1);
    }
    return out + suffix;
}

/* ─────────────────────── colour interpolation ────────────────────── */

/**
 * Returns a colour graded by percent.
 *  0%  → red,   25% → orange, 50% → yellow,
 *  75% → mint,  100% → bright green.
 *
 * Intermediate stops give better perceptual contrast than a
 * pure red→green ramp (which dips through brown/khaki around 50%).
 */
function colorForPercent(p) {
    const stops = [
        { p: 0,   c: [239, 68,  68 ] }, // red-500
        { p: 25,  c: [249, 115, 22 ] }, // orange-500
        { p: 50,  c: [234, 179, 8  ] }, // yellow-500
        { p: 75,  c: [132, 204, 22 ] }, // lime-500
        { p: 100, c: [34,  197, 94 ] }, // green-500
    ];
    const v = Math.max(0, Math.min(100, p));
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
        if (v >= stops[i].p && v <= stops[i + 1].p) {
            lo = stops[i]; hi = stops[i + 1]; break;
        }
    }
    const t = (v - lo.p) / Math.max(1, (hi.p - lo.p));
    const r = Math.round(lo.c[0] + (hi.c[0] - lo.c[0]) * t);
    const g = Math.round(lo.c[1] + (hi.c[1] - lo.c[1]) * t);
    const b = Math.round(lo.c[2] + (hi.c[2] - lo.c[2]) * t);
    return {
        hex: `rgb(${r},${g},${b})`,
        rgb: [r, g, b],
        rgba: (a = 1) => `rgba(${r},${g},${b},${a})`,
    };
}

/* ───────────────────────── background pieces ─────────────────────── */

/**
 * Paint the deep glassy background.
 *   1. Diagonal dark gradient (top-left light, bottom-right deeper).
 *   2. Soft accent radial glow biased to the avatar side.
 *   3. Faint dotted lattice — adds texture without competing for
 *      attention. Drawn at very low alpha.
 *   4. Vignette to anchor the centre.
 */
function paintBackground(ctx, accent) {
    // Base gradient
    const base = ctx.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, '#0e1320');
    base.addColorStop(0.55, '#0b1020');
    base.addColorStop(1, '#070a14');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    // Accent glow — left side, behind avatar
    const glow = ctx.createRadialGradient(220, H / 2 - 20, 30, 220, H / 2 - 20, 480);
    glow.addColorStop(0, accent.rgba(0.55));
    glow.addColorStop(0.35, accent.rgba(0.18));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Secondary cooler glow — top-right, gives depth
    const glow2 = ctx.createRadialGradient(W - 80, 80, 40, W - 80, 80, 360);
    glow2.addColorStop(0, 'rgba(99,102,241,0.18)');
    glow2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, W, H);

    // Dot lattice pattern
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = 16; y < H; y += 22) {
        for (let x = 16; x < W; x += 22) {
            ctx.beginPath();
            ctx.arc(x, y, 0.9, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();

    // Bottom vignette — pulls focus upward to the percent value
    const vig = ctx.createLinearGradient(0, H - 220, 0, H);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
}

/* ─────────────────────────── avatar ring ─────────────────────────── */

/**
 * Glassy avatar tile: halo glow → progress ring (track + filled arc) →
 * avatar circle clipped → inner highlight stroke.
 */
async function drawAvatarBlock(ctx, avatarURL, cx, cy, radius, percent, accent) {
    const ringWidth = 14;
    const trackRadius = radius + ringWidth / 2;

    // ── Halo behind the ring (soft outer glow) ──
    const halo = ctx.createRadialGradient(cx, cy, radius - 4, cx, cy, radius + 60);
    halo.addColorStop(0, accent.rgba(0.42));
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 60, 0, Math.PI * 2);
    ctx.fill();

    // ── Background track ──
    ctx.beginPath();
    ctx.arc(cx, cy, trackRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = ringWidth;
    ctx.stroke();

    // ── Progress arc (gradient along the ring) ──
    const start = -Math.PI / 2;
    const end = start + (Math.PI * 2 * percent) / 100;
    if (percent > 0) {
        const arcGrad = ctx.createLinearGradient(
            cx + Math.cos(start) * trackRadius,
            cy + Math.sin(start) * trackRadius,
            cx + Math.cos(end)   * trackRadius,
            cy + Math.sin(end)   * trackRadius,
        );
        arcGrad.addColorStop(0, accent.rgba(0.65));
        arcGrad.addColorStop(1, accent.hex);

        ctx.beginPath();
        ctx.arc(cx, cy, trackRadius, start, end);
        ctx.strokeStyle = arcGrad;
        ctx.lineWidth = ringWidth;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';

        // Glowing dot at the progress tip
        const tipX = cx + Math.cos(end) * trackRadius;
        const tipY = cy + Math.sin(end) * trackRadius;
        const dot = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 16);
        dot.addColorStop(0, '#ffffff');
        dot.addColorStop(0.4, accent.rgba(0.9));
        dot.addColorStop(1, accent.rgba(0));
        ctx.fillStyle = dot;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 16, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Avatar (clipped to circle) with placeholder fallback ──
    let img = null;
    try { img = await imageCache.loadWithCache(avatarURL, 8000).catch(() => null); } catch {}
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (img) {
        ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
    } else {
        const ph = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
        ph.addColorStop(0, '#1e2434');
        ph.addColorStop(1, '#0f131c');
        ctx.fillStyle = ph;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        ctx.fillStyle = '#374151';
        ctx.font = '600 64px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', cx, cy + 4);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();

    // ── Inner highlight stroke for crispness ──
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

/* ─────────────────────────── progress bar ────────────────────────── */

/**
 * Modern segmented progress bar with a glow tip.
 *  - Track has a faint inner shadow.
 *  - Fill uses a left-to-right accent gradient with the brightest
 *    point at the tip.
 *  - 25/50/75 ticks across the track for visual rhythm.
 */
function drawProgressBar(ctx, x, y, w, h, percent, accent) {
    // Track background
    roundedRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();

    // Track inner highlight (fake inset shadow)
    ctx.save();
    roundedRect(ctx, x, y, w, h, h / 2);
    ctx.clip();
    const inner = ctx.createLinearGradient(0, y, 0, y + h);
    inner.addColorStop(0, 'rgba(0,0,0,0.35)');
    inner.addColorStop(0.4, 'rgba(0,0,0,0)');
    ctx.fillStyle = inner;
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    // Tick marks at 25 / 50 / 75
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (const pct of [25, 50, 75]) {
        const tx = x + (w * pct) / 100;
        ctx.fillRect(tx - 0.5, y + 4, 1, h - 8);
    }
    ctx.restore();

    // Fill
    const fillW = Math.max(h, (w * percent) / 100);
    if (percent > 0) {
        ctx.save();
        roundedRect(ctx, x, y, fillW, h, h / 2);
        ctx.clip();
        const fillGrad = ctx.createLinearGradient(x, 0, x + w, 0);
        fillGrad.addColorStop(0, accent.rgba(0.55));
        fillGrad.addColorStop(0.6, accent.rgba(0.95));
        fillGrad.addColorStop(1, '#ffffff');
        ctx.fillStyle = fillGrad;
        ctx.fillRect(x, y, fillW, h);

        // Subtle shine across the top edge of the fill
        const shine = ctx.createLinearGradient(0, y, 0, y + h / 2);
        shine.addColorStop(0, 'rgba(255,255,255,0.3)');
        shine.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shine;
        ctx.fillRect(x, y, fillW, h / 2);
        ctx.restore();

        // Tip glow
        const tipX = x + fillW;
        const tipGrad = ctx.createRadialGradient(tipX, y + h / 2, 0, tipX, y + h / 2, h * 1.4);
        tipGrad.addColorStop(0, accent.rgba(0.9));
        tipGrad.addColorStop(1, accent.rgba(0));
        ctx.fillStyle = tipGrad;
        ctx.fillRect(tipX - h, y - h / 2, h * 2, h * 2);
    }
}

/* ─────────────────────────── card frame ──────────────────────────── */

function drawCardFrame(ctx, accent) {
    // Outer edge — slight tint of the accent for cohesion
    roundedRect(ctx, PAD / 2, PAD / 2, W - PAD, H - PAD, RADIUS);
    ctx.fillStyle = 'rgba(15,18,28,0.55)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = accent.rgba(0.35);
    ctx.stroke();

    // Inner highlight
    roundedRect(ctx, PAD / 2 + 1, PAD / 2 + 1, W - PAD - 2, H - PAD - 2, RADIUS - 1);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.stroke();
}

/* ─────────────────────────── public API ──────────────────────────── */

/**
 * Render a percentage card image.
 *
 * @param {object} opts
 * @param {string} opts.title       Card title (e.g. "How Gay?")
 * @param {string} opts.subjectName Display name shown next to avatar
 * @param {string} opts.avatarURL   Avatar URL of the subject
 * @param {number} opts.percent     0–100
 * @param {string} opts.verdict     Short verdict line
 * @param {string} [opts.unit]      Suffix for the big value (default '%')
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
        brand = 'xNico',
    } = opts;

    const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    const accent = colorForPercent(p);

    // Outfit reads like a modern UI font; Inter handles secondary copy.
    // Both ship with the bot; the registry will fall back to Inter if a
    // family isn't registered yet (during tests, etc.).
    const display = getFontHelpers('Outfit');
    const ui      = getFontHelpers('Inter');

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // ─── Layered background ───
    paintBackground(ctx, accent);
    drawCardFrame(ctx, accent);

    // ─── Avatar with progress ring (left side) ───
    const avatarRadius = 110;
    const avatarCx = 170;
    const avatarCy = H / 2;
    await drawAvatarBlock(ctx, avatarURL, avatarCx, avatarCy, avatarRadius, p, accent);

    // ─── Right side text stack ───
    const textX = 340;
    const textRight = W - PAD - 16;
    const textWidth = textRight - textX;

    // Eyebrow (uppercase tracked title)
    ctx.fillStyle = accent.rgba(0.85);
    ctx.font = ui.getSemiBoldFont(16);
    ctx.textBaseline = 'alphabetic';
    drawTracked(ctx, (title || '').toUpperCase(), textX, 92, 2.5);

    // Subject name (display weight, big)
    ctx.fillStyle = '#ffffff';
    ctx.font = display.getBoldFont(46);
    const name = truncate(ctx, subjectName || 'Unknown', textWidth);
    ctx.fillText(name, textX, 142);

    // Big percent — this is the hero element
    const valueText = `${p}${unit}`;
    ctx.font = display.getBoldFont(120);
    const valueWidth = ctx.measureText(valueText).width;
    // Soft drop-glow so the number sits against the background
    ctx.save();
    ctx.shadowColor = accent.rgba(0.55);
    ctx.shadowBlur = 26;
    const valueGrad = ctx.createLinearGradient(textX, 180, textX + valueWidth, 260);
    valueGrad.addColorStop(0, '#ffffff');
    valueGrad.addColorStop(1, accent.hex);
    ctx.fillStyle = valueGrad;
    ctx.fillText(valueText, textX, 260);
    ctx.restore();

    // Tiny accent label next to the value
    ctx.font = ui.getMediumFont(13);
    ctx.fillStyle = '#64748b';
    drawTracked(ctx, 'OUT OF 100', textX + valueWidth + 14, 224, 1.5);

    // Progress bar
    const barX = textX;
    const barY = 290;
    const barW = textWidth;
    const barH = 16;
    drawProgressBar(ctx, barX, barY, barW, barH, p, accent);

    // Bar value chip aligned to the tip
    const tipX = Math.min(barX + barW - 8, barX + (barW * p) / 100);
    const chipText = `${p}${unit}`;
    ctx.font = ui.getSemiBoldFont(12);
    const chipPadX = 10;
    const chipW = ctx.measureText(chipText).width + chipPadX * 2;
    const chipH = 22;
    const chipY = barY - chipH - 6;
    let chipX = Math.max(barX, tipX - chipW / 2);
    chipX = Math.min(chipX, barX + barW - chipW);
    roundedRect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
    ctx.fillStyle = accent.rgba(0.18);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = accent.rgba(0.45);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(chipText, chipX + chipPadX, chipY + chipH / 2 + 1);
    ctx.textBaseline = 'alphabetic';

    // Verdict — italic-feeling display medium
    if (verdict) {
        ctx.font = display.getMediumFont(20);
        ctx.fillStyle = '#cbd5e1';
        const verdictText = truncate(ctx, `“${verdict}”`, textWidth);
        ctx.fillText(verdictText, textX, 348);
    }

    // ─── Corner brand pill ───
    const brandText = brand || 'xNico';
    ctx.font = ui.getSemiBoldFont(12);
    const brandTextW = ctx.measureText(brandText.toUpperCase()).width;
    const dotR = 4;
    const padX = 14;
    const padY = 6;
    const pillW = brandTextW + dotR * 2 + 10 + padX * 2;
    const pillH = 24;
    const pillX = W - PAD - pillW;
    const pillY = H - PAD - pillH;
    roundedRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.stroke();
    // Brand dot
    ctx.beginPath();
    ctx.arc(pillX + padX + dotR, pillY + pillH / 2, dotR, 0, Math.PI * 2);
    ctx.fillStyle = accent.hex;
    ctx.fill();
    // Brand text
    ctx.fillStyle = '#9ca3af';
    ctx.textBaseline = 'middle';
    drawTracked(ctx, brandText.toUpperCase(), pillX + padX + dotR * 2 + 10, pillY + pillH / 2 + 1, 1.2);
    ctx.textBaseline = 'alphabetic';

    return canvas.toBuffer('image/png');
}

module.exports = { renderPercentCard, colorForPercent };
