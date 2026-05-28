'use strict';

/**
 * percentCard.js — Premium percentage card generator.
 *
 * Used by /howgay, /howlesbian, /howstraight, /howcute, /howsmart,
 * /howsus, /howsigma, /howcursed, /howsimp, /howlucky, /howevil,
 * /howedgy, /howcool, /howhot, /howbraindead, /howrich,
 * /iq, /pp, /ship, /rate and similar percentage-style commands.
 *
 * Visual design (v2 — professional refresh):
 *   • 1100×420 canvas, 28px corner radius, layered glassy dark
 *     background (gradient + diagonal lattice + accent halo +
 *     vignette). Gives the card a real sense of depth without
 *     being distracting.
 *   • Five-stop accent palette (red → orange → amber → lime →
 *     emerald) interpolated by percentage so the entire card
 *     re-tones in real time. Mid-range (~50%) lands on a warm
 *     amber rather than muddy yellow-brown.
 *   • Avatar block: progress ring around the avatar with a soft
 *     halo, gradient-filled arc, glowing tip dot, and a thin inner
 *     stroke for crispness. Falls back to an initial monogram if
 *     the avatar fails to load.
 *   • Right column: small uppercase tracked title, display-weight
 *     name, oversized hero percent (with shadow + gradient text
 *     fill), value-of-100 helper label, modern segmented progress
 *     bar with tick marks + chip aligned to the tip, italicised
 *     verdict line, and a brand pill in the corner with a colour
 *     dot keyed to the accent.
 *   • Fonts: Outfit for display, Inter for UI. Both already
 *     registered by the bot's font registry.
 *
 * © Rajeev (Rexzy) — xNico
 */

const { createCanvas } = require('@napi-rs/canvas');
const imageCache = require('./imageCache');
const { registerAllFonts, getFontHelpers } = require('./fontRegistry');
const { drawTextWithEmoji, measureMixedText } = require('./emojiCanvasHelper');

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
 *  0%   → red       (danger)
 *  25%  → orange    (warning)
 *  50%  → amber     (caution)
 *  75%  → lime      (good)
 *  100% → emerald   (excellent)
 *
 * Intermediate stops give better perceptual contrast than a pure
 * red→green ramp (which dips through brown/khaki around 50%) and
 * keep the "mid-range" looking warm instead of sickly.
 */
function colorForPercent(p) {
    const stops = [
        { p: 0,   c: [239, 68,  68 ] }, // red-500
        { p: 25,  c: [249, 115, 22 ] }, // orange-500
        { p: 50,  c: [245, 158, 11 ] }, // amber-500
        { p: 75,  c: [132, 204, 22 ] }, // lime-500
        { p: 100, c: [16,  185, 129] }, // emerald-500
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
 *  1. Layered diagonal dark gradient.
 *  2. Soft accent radial glow biased to the avatar side.
 *  3. Cooler glow in the top-right for depth.
 *  4. Diagonal lattice (very low alpha) for premium texture.
 *  5. Bottom vignette pulling focus upward to the percent value.
 */
function paintBackground(ctx, accent) {
    // Base diagonal gradient
    const base = ctx.createLinearGradient(0, 0, W, H);
    base.addColorStop(0,    '#0e1422');
    base.addColorStop(0.5,  '#0a1020');
    base.addColorStop(1,    '#060912');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    // Accent glow — left side, behind avatar
    const glow = ctx.createRadialGradient(220, H / 2 - 20, 30, 220, H / 2 - 20, 480);
    glow.addColorStop(0,    accent.rgba(0.55));
    glow.addColorStop(0.35, accent.rgba(0.18));
    glow.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Secondary cooler glow — top-right, gives depth & balance
    const glow2 = ctx.createRadialGradient(W - 80, 80, 40, W - 80, 80, 380);
    glow2.addColorStop(0, 'rgba(99,102,241,0.20)');
    glow2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, W, H);

    // Diagonal lattice (faint) — adds premium texture without noise
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.018)';
    ctx.lineWidth = 1;
    for (let i = -H; i < W + H; i += 32) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + H, H);
        ctx.stroke();
    }
    ctx.restore();

    // Top accent sweep — 4px highlight at the very top edge
    const sweep = ctx.createLinearGradient(0, 0, W, 0);
    sweep.addColorStop(0,    'rgba(0,0,0,0)');
    sweep.addColorStop(0.22, accent.rgba(0.30));
    sweep.addColorStop(0.65, accent.rgba(0.10));
    sweep.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = sweep;
    ctx.fillRect(0, 0, W, 3);

    // Bottom vignette — pulls focus upward to the hero percent
    const vig = ctx.createLinearGradient(0, H - 220, 0, H);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
}

/* ─────────────────────────── avatar ring ─────────────────────────── */

/**
 * Glassy avatar tile: halo glow → progress ring (track + filled arc) →
 * avatar circle clipped → inner highlight stroke. Includes a glowing
 * tip dot at the end of the progress arc.
 */
async function drawAvatarBlock(ctx, avatarURL, cx, cy, radius, percent, accent) {
    const ringWidth = 14;
    const trackRadius = radius + ringWidth / 2;

    // Halo behind the ring
    const halo = ctx.createRadialGradient(cx, cy, radius - 4, cx, cy, radius + 64);
    halo.addColorStop(0, accent.rgba(0.42));
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 64, 0, Math.PI * 2);
    ctx.fill();

    // Background track
    ctx.beginPath();
    ctx.arc(cx, cy, trackRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = ringWidth;
    ctx.stroke();

    // Progress arc with gradient
    const start = -Math.PI / 2;
    const end = start + (Math.PI * 2 * percent) / 100;
    if (percent > 0) {
        const arcGrad = ctx.createLinearGradient(
            cx + Math.cos(start) * trackRadius,
            cy + Math.sin(start) * trackRadius,
            cx + Math.cos(end)   * trackRadius,
            cy + Math.sin(end)   * trackRadius,
        );
        arcGrad.addColorStop(0, accent.rgba(0.55));
        arcGrad.addColorStop(1, accent.hex);

        ctx.beginPath();
        ctx.arc(cx, cy, trackRadius, start, end);
        ctx.strokeStyle = arcGrad;
        ctx.lineWidth = ringWidth;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';

        // Glowing tip dot
        const tipX = cx + Math.cos(end) * trackRadius;
        const tipY = cy + Math.sin(end) * trackRadius;
        const dot = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 18);
        dot.addColorStop(0, '#ffffff');
        dot.addColorStop(0.4, accent.rgba(0.9));
        dot.addColorStop(1, accent.rgba(0));
        ctx.fillStyle = dot;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 18, 0, Math.PI * 2);
        ctx.fill();
    }

    // Avatar (clipped to circle) with placeholder fallback
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

    // Inner highlight stroke for crispness
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

/* ─────────────────────────── progress bar ────────────────────────── */

/**
 * Modern segmented progress bar with a glow tip.
 *  - Track has a faint inset shadow.
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
    inner.addColorStop(0,   'rgba(0,0,0,0.35)');
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
        fillGrad.addColorStop(0,   accent.rgba(0.55));
        fillGrad.addColorStop(0.6, accent.rgba(0.95));
        fillGrad.addColorStop(1,   '#ffffff');
        ctx.fillStyle = fillGrad;
        ctx.fillRect(x, y, fillW, h);

        // Subtle shine across the top edge of the fill
        const shine = ctx.createLinearGradient(0, y, 0, y + h / 2);
        shine.addColorStop(0, 'rgba(255,255,255,0.30)');
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
    // Outer glassy edge — tinted with the accent for cohesion
    roundedRect(ctx, PAD / 2, PAD / 2, W - PAD, H - PAD, RADIUS);
    ctx.fillStyle = 'rgba(15,18,28,0.55)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = accent.rgba(0.35);
    ctx.stroke();

    // Inner highlight stroke for depth
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
 * @param {number} opts.percent     0–100 (or any number when unit !== '%')
 * @param {string} opts.verdict     Short verdict line
 * @param {string} [opts.unit]      Suffix for the big value (default '%')
 * @param {string} [opts.brand]     Branding text in the corner (default 'xNico')
 * @param {number} [opts.barMax]    Override the bar's 100%-equivalent
 *                                  (e.g. 200 for IQ — keeps the bar
 *                                  from overflowing for non-percent
 *                                  metrics).
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
        barMax = unit === '%' ? 100 : Math.max(100, Math.abs(Number(percent) || 0)),
    } = opts;

    const rawValue = Number(percent) || 0;
    // Bar/ring fill ratio — clamp to 0–100 even for non-percentage units (IQ etc.)
    const barFill = Math.max(0, Math.min(100, Math.round((rawValue / barMax) * 100)));
    // Hero number — just clamp to >= 0 and round
    const hero = Math.max(0, Math.round(rawValue));
    // Accent always grades against the visual fill (so a 60% IQ bar feels "amber")
    const accent = colorForPercent(barFill);

    const display = getFontHelpers('Outfit');
    const ui      = getFontHelpers('Inter');

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // ─── Layered background ───
    paintBackground(ctx, accent);
    drawCardFrame(ctx, accent);

    // ─── Avatar with progress ring (left) ───
    const avatarRadius = 110;
    const avatarCx = 170;
    const avatarCy = H / 2;
    await drawAvatarBlock(ctx, avatarURL, avatarCx, avatarCy, avatarRadius, barFill, accent);

    // ─── Right side text stack ───
    const textX = 340;
    const textRight = W - PAD - 16;
    const textWidth = textRight - textX;

    // Eyebrow (uppercase tracked title)
    ctx.fillStyle = accent.rgba(0.85);
    ctx.font = ui.getSemiBoldFont(16);
    ctx.textBaseline = 'alphabetic';
    drawTracked(ctx, (title || '').toUpperCase(), textX, 92, 2.5);

    // Subject name (display weight, big) — routed through emoji
    // helper so usernames containing emojis (e.g. "Rexzy 🚀") render
    // as proper Twemoji images instead of monochrome glyphs.
    ctx.fillStyle = '#ffffff';
    ctx.font = display.getBoldFont(46);
    let name = subjectName || 'Unknown';
    while (measureMixedText(ctx, name, 46) > textWidth && name.length > 0) {
        name = name.slice(0, -1);
    }
    if (name !== (subjectName || 'Unknown')) name += '…';
    await drawTextWithEmoji(ctx, name, textX, 142, 46);

    // Hero percent — gradient text + drop shadow
    const valueText = `${hero}${unit}`;
    ctx.font = display.getBoldFont(120);
    const valueWidth = ctx.measureText(valueText).width;
    ctx.save();
    ctx.shadowColor = accent.rgba(0.55);
    ctx.shadowBlur = 26;
    const valueGrad = ctx.createLinearGradient(textX, 180, textX + valueWidth, 260);
    valueGrad.addColorStop(0, '#ffffff');
    valueGrad.addColorStop(1, accent.hex);
    ctx.fillStyle = valueGrad;
    ctx.fillText(valueText, textX, 260);
    ctx.restore();

    // Helper label next to the value ("OUT OF 100" / "OUT OF 200")
    ctx.font = ui.getMediumFont(13);
    ctx.fillStyle = '#64748b';
    drawTracked(ctx, `OUT OF ${barMax}`, textX + valueWidth + 14, 224, 1.5);

    // Progress bar
    const barX = textX;
    const barY = 290;
    const barW = textWidth;
    const barH = 16;
    drawProgressBar(ctx, barX, barY, barW, barH, barFill, accent);

    // Bar value chip aligned to the tip
    const tipX = Math.min(barX + barW - 8, barX + (barW * barFill) / 100);
    const chipText = `${hero}${unit}`;
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

    // Verdict — display medium weight, quoted. Routed through the
    // emoji helper because verdicts often carry emoji (😬 🤷 🤔 😍 💞 💍✨)
    // that would otherwise render as monochrome glyphs.
    if (verdict) {
        ctx.font = display.getMediumFont(20);
        ctx.fillStyle = '#cbd5e1';
        let verdictText = `\u201C${verdict}\u201D`;
        while (measureMixedText(ctx, verdictText, 20) > textWidth && verdictText.length > 2) {
            verdictText = verdictText.slice(0, -2) + '\u201D';
        }
        await drawTextWithEmoji(ctx, verdictText, textX, 348, 20);
    }

    // ─── Corner brand pill ───
    const brandText = brand || 'xNico';
    ctx.font = ui.getSemiBoldFont(12);
    const brandTextW = ctx.measureText(brandText.toUpperCase()).width;
    const dotR = 4;
    const padX = 14;
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
