'use strict';

/**
 * levelUpCard.js — clean 900×260 level-up announcement card.
 *
 * Restrained redesign (no stacked glows/lattice/gradient noise, and
 * the old FAKE random progress bar is gone — it rendered
 * `0.3 + Math.random()*0.4` which had nothing to do with real XP).
 *
 * Layout
 * ──────
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  ⬭        LEVEL UP                          ┌──────────────┐    │
 *   │ avatar    Username                          │  12  →  13   │    │
 *   │ (120)     Advanced to Level 13              │   LEVEL      │    │
 *   │                                             └──────────────┘    │
 *   │           Rank #5   ·   Total XP 562.3K   ·   +120 XP          │
 *   └────────────────────────────────────────────────────────────────┘
 */

const { createCanvas } = require('@napi-rs/canvas');
const imageCache = require('./imageCache');
const { registerAllFonts, getFontHelpers } = require('./fontRegistry');
const {
    DESIGN, drawRoundedRect, formatNumber, rgba, drawNicoBranding,
} = require('./canvasDesign');
const { drawTextWithEmoji, measureMixedText } = require('./emojiCanvasHelper');

try { registerAllFonts(); } catch {}

const W = 900;
const H = 260;
const RAD = 20;

// Selectable level-up card styles. Each is a clean, minimal palette
// (background gradient + two accents) — the layout stays identical so
// every style stays professional and legible. Admins pick one via
// /leveling-setup → Card Style.
const LEVELUP_STYLES = {
    default:  { label: 'Default',  accent: '#5865f2', accent2: '#a855f7', bgTop: '#26272b', bgBottom: '#1c1d21' },
    midnight: { label: 'Midnight', accent: '#3b82f6', accent2: '#6366f1', bgTop: '#1a1d2b', bgBottom: '#12131c' },
    emerald:  { label: 'Emerald',  accent: '#10b981', accent2: '#34d399', bgTop: '#16241f', bgBottom: '#0f1814' },
    crimson:  { label: 'Crimson',  accent: '#ef4444', accent2: '#f87171', bgTop: '#261a1c', bgBottom: '#1a1113' },
    gold:     { label: 'Gold',     accent: '#f59e0b', accent2: '#fbbf24', bgTop: '#2a2419', bgBottom: '#1c180f' },
    aqua:     { label: 'Aqua',     accent: '#06b6d4', accent2: '#22d3ee', bgTop: '#16242a', bgBottom: '#0f1a1e' },
    mono:     { label: 'Mono',     accent: '#e5e7eb', accent2: '#9ca3af', bgTop: '#1f2023', bgBottom: '#161719' },
};
const LEVELUP_STYLE_KEYS = Object.keys(LEVELUP_STYLES);

function resolveStyle(name) {
    return LEVELUP_STYLES[String(name || '').toLowerCase()] || LEVELUP_STYLES.default;
}

function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toLocaleString();
}

async function generateLevelUpCard(user, data = {}) {
    try {
        return await _renderCard(user, data);
    } catch {
        return _fallbackCard(user, data);
    }
}

function _fallbackCard(user, data) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1e1f22';
    drawRoundedRect(ctx, 0, 0, W, H, RAD);
    ctx.fill();
    const fh = getFontHelpers(data.fontFamily || 'Inter');
    ctx.font = fh.getBoldFont(28);
    ctx.fillStyle = '#5865f2';
    ctx.fillText('LEVEL UP', 40, H / 2 - 8);
    ctx.font = fh.getFont(16);
    ctx.fillStyle = '#b5bac1';
    const name = user.globalName || user.username || 'User';
    ctx.fillText(`${name} reached Level ${data.newLevel || '?'}`, 40, H / 2 + 22);
    return canvas.toBuffer('image/png');
}

async function _renderCard(user, data = {}) {
    const fh = getFontHelpers(data.fontFamily || 'Inter');
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    const oldLevel = Number(data.oldLevel) || 0;
    const newLevel = Number(data.newLevel) || 1;
    const totalXp  = Number(data.totalXp)  || 0;
    const rank     = Number(data.rank)     || 0;
    const xpGain   = Number(data.xpGain)   || 0;

    const accent = resolveStyle(data.style).accent;
    const accent2 = resolveStyle(data.style).accent2;
    const _style = resolveStyle(data.style);

    /* ── 1. Background (single flat gradient + optional user image) ── */
    ctx.save();
    drawRoundedRect(ctx, 0, 0, W, H, RAD);
    ctx.clip();
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, _style.bgTop);
    bg.addColorStop(1, _style.bgBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Optional custom background image (the only thing the user can
    // customize on the level-up card). Drawn as a cover image with a
    // single readability scrim so the text stays legible.
    if (data.backgroundImage) {
        try {
            const img = await imageCache.loadWithCache(data.backgroundImage, 5000);
            if (img) {
                const scale = Math.max(W / img.width, H / img.height);
                const ix = (W - img.width * scale) / 2;
                const iy = (H - img.height * scale) / 2;
                ctx.drawImage(img, ix, iy, img.width * scale, img.height * scale);
                const scrim = ctx.createLinearGradient(0, 0, W, 0);
                scrim.addColorStop(0, 'rgba(16,16,22,0.82)');
                scrim.addColorStop(0.55, 'rgba(16,16,22,0.62)');
                scrim.addColorStop(1, 'rgba(16,16,22,0.78)');
                ctx.fillStyle = scrim;
                ctx.fillRect(0, 0, W, H);
            }
        } catch {}
    }

    // One quiet accent band along the bottom.
    ctx.fillStyle = rgba(accent, 0.9);
    ctx.fillRect(0, H - 4, W, 4);
    ctx.restore();

    /* ── 2. Avatar (single ring) ── */
    const avSize = 120;
    const avX = 40;
    const avY = (H - avSize) / 2 - 8;
    const cx = avX + avSize / 2;
    const cy = avY + avSize / 2;

    ctx.fillStyle = rgba('#000000', 0.25);
    ctx.beginPath();
    ctx.arc(cx, cy, avSize / 2 + 5, 0, Math.PI * 2);
    ctx.fill();

    try {
        const avatar = await imageCache.loadWithCache(
            user.displayAvatarURL({ extension: 'png', size: 256 }), 5000
        );
        if (avatar) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, avSize / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatar, avX, avY, avSize, avSize);
            ctx.restore();
        } else {
            ctx.fillStyle = rgba(accent, 0.3);
            ctx.beginPath();
            ctx.arc(cx, cy, avSize / 2, 0, Math.PI * 2);
            ctx.fill();
        }
    } catch {}

    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, avSize / 2 + 2.5, 0, Math.PI * 2);
    ctx.stroke();

    /* ── 3. From → To level badge (right side) ── */
    const badgeW = 200;
    const badgeH = 96;
    const badgeX = W - 40 - badgeW;
    const badgeY = (H - badgeH) / 2 - 6;

    drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 14);
    ctx.fillStyle = rgba(accent, 0.12);
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.45);
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 14);
    ctx.stroke();

    // "LEVEL" label
    ctx.font = fh.getSemiBoldFont(12);
    ctx.fillStyle = DESIGN.colors.textMuted;
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL', badgeX + badgeW / 2, badgeY + 24);

    // old → new
    const midX = badgeX + badgeW / 2;
    const numY = badgeY + 68;
    ctx.font = fh.getBoldFont(34);
    // old level (dim)
    ctx.fillStyle = DESIGN.colors.textDim;
    ctx.textAlign = 'right';
    const oldStr = String(oldLevel);
    ctx.fillText(oldStr, midX - 24, numY);
    // arrow
    ctx.fillStyle = accent2;
    ctx.font = fh.getBoldFont(22);
    ctx.textAlign = 'center';
    ctx.fillText('→', midX, numY - 3);
    // new level (accent)
    ctx.font = fh.getBoldFont(34);
    ctx.fillStyle = accent;
    ctx.textAlign = 'left';
    ctx.fillText(String(newLevel), midX + 24, numY);
    ctx.textAlign = 'left';

    /* ── 4. Text block (between avatar and badge) ── */
    const tx = avX + avSize + 30;
    const textRight = badgeX - 24;
    const tw = textRight - tx;

    // "LEVEL UP" eyebrow — a compact accent pill for a polished look.
    ctx.font = fh.getBoldFont(12);
    const eyebrow = 'LEVEL UP';
    const eyebrowW = ctx.measureText(eyebrow).width;
    const pillPadX = 10;
    const pillH = 22;
    const pillY = avY + 8;
    drawRoundedRect(ctx, tx, pillY, eyebrowW + pillPadX * 2, pillH, 7);
    ctx.fillStyle = rgba(accent2, 0.16);
    ctx.fill();
    ctx.strokeStyle = rgba(accent2, 0.5);
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, tx, pillY, eyebrowW + pillPadX * 2, pillH, 7);
    ctx.stroke();
    ctx.fillStyle = accent2;
    ctx.textAlign = 'left';
    ctx.fillText(eyebrow, tx + pillPadX, pillY + 15);

    // Username (fitted, emoji-aware)
    let username = String(user.globalName || user.username);
    ctx.font = fh.getBoldFont(30);
    while (measureMixedText(ctx, username, 30) > tw && username.length > 1) {
        username = username.slice(0, -1);
    }
    if (username !== String(user.globalName || user.username)) username += '…';
    await drawTextWithEmoji(ctx, username, tx, avY + 64, 30);

    // Subtitle line: either the admin's custom message (rendered ON the
    // card when placement = "inside") or the default "Advanced to Level N".
    if (data.customLine) {
        let line = String(data.customLine);
        ctx.font = fh.getMediumFont ? fh.getMediumFont(15) : fh.getFont(15);
        while (measureMixedText(ctx, line, 15) > tw && line.length > 1) {
            line = line.slice(0, -1);
        }
        if (line !== String(data.customLine)) line += '…';
        ctx.fillStyle = DESIGN.colors.textMuted;
        await drawTextWithEmoji(ctx, line, tx, avY + 90, 15);
    } else {
        // "Advanced to Level N"
        ctx.font = fh.getMedium ? fh.getMediumFont(15) : fh.getFont(15);
        ctx.fillStyle = DESIGN.colors.textMuted;
        ctx.fillText('Advanced to ', tx, avY + 90);
        const advW = ctx.measureText('Advanced to ').width;
        ctx.font = fh.getBoldFont(15);
        ctx.fillStyle = accent;
        ctx.fillText(`Level ${newLevel}`, tx + advW, avY + 90);
    }

    /* ── 5. Stats row (single baseline, dotted separators) ── */
    const statY = avY + avSize - 2;
    const stats = [];
    if (rank > 0) stats.push({ label: 'Rank', value: `#${formatNumber(rank)}` });
    stats.push({ label: 'Total XP', value: fmtNum(totalXp) });
    if (xpGain > 0) stats.push({ label: 'Gained', value: `+${fmtNum(xpGain)}` });

    let sx = tx;
    for (let i = 0; i < stats.length; i++) {
        const part = stats[i];
        ctx.font = fh.getMediumFont(13);
        ctx.fillStyle = DESIGN.colors.textMuted;
        ctx.fillText(part.label, sx, statY);
        const lw = ctx.measureText(part.label).width;
        ctx.font = fh.getSemiBoldFont(13);
        ctx.fillStyle = '#ffffff';
        const vx = sx + lw + 8;
        ctx.fillText(part.value, vx, statY);
        const vw = ctx.measureText(part.value).width;
        sx = vx + vw + 22;
        if (i < stats.length - 1) {
            ctx.fillStyle = DESIGN.colors.textDim;
            ctx.fillText('·', sx - 13, statY);
        }
    }

    /* ── 6. Border + branding ── */
    ctx.strokeStyle = rgba(accent, 0.18);
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, 0.75, 0.75, W - 1.5, H - 1.5, RAD);
    ctx.stroke();

    await drawNicoBranding(ctx, W, H, accent);

    return canvas.toBuffer('image/png');
}

module.exports = { generateLevelUpCard, LEVELUP_STYLES, LEVELUP_STYLE_KEYS };
