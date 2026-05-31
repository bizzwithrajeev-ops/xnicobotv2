'use strict';

/**
 * economyCanvas.js — Canvas renderers for the economy commands.
 *
 * This module is intentionally narrow: it ONLY exports the two
 * renderers that the rest of the bot actually uses.
 *
 *   • createEconomyProfileCard — used by /profile
 *   • createBattleCard         — used by /battle (PvE + PvP)
 *
 * Earlier versions of this file shipped half a dozen extra renderers
 * (createBalanceCard, createHuntCard, createFishCard, createSlotsCard,
 * createCoinflipCard, createAdventureCard, createLeaderboardCard) that
 * were never imported anywhere — they were kept "in case" and just
 * accumulated visual debt. They've been removed; if a command needs
 * a card later, build it from scratch against the helpers in
 * utils/canvasDesign.js (which are already shared with the rest of
 * the bot's card pipeline).
 *
 * Both renderers share a common look-and-feel:
 *   • Glassy dark background with star-field + diagonal lattice.
 *   • Accent-tinted glow + outer border for the card frame.
 *   • Inter for UI text, Outfit-style display weights for hero text,
 *     all routed through canvasDesign.fontHelpers so the user's
 *     preferred font (set via /profile-customize) can be honoured.
 *   • drawTextWithEmoji used everywhere usernames or pet names land,
 *     so emoji glyphs render as proper Twemoji images instead of
 *     monochrome system fallbacks.
 */

const { createCanvas } = require('@napi-rs/canvas');
const imageCache = require('./imageCache');
const { drawTextWithEmoji } = require('./emojiCanvasHelper');
const {
    getFont, getMediumFont, getBoldFont, getSemiBoldFont,
    drawRoundedRect, drawGradientBackground, drawDiagonalLines,
    truncateText, fitText, drawNicoBranding,
} = require('./canvasDesign');
const { registerAllFonts, getFontHelpers } = require('./fontRegistry');

try { registerAllFonts(); } catch (e) { /* already registered */ }

/* ═══════════════════════════════════════════════════════
   SHARED PALETTE
   ═══════════════════════════════════════════════════════ */

const COLORS = {
    bg:         '#0d0d1f',
    bgAlt:      '#141432',
    card:       'rgba(22, 22, 55, 0.95)',
    cardBorder: 'rgba(80, 80, 160, 0.3)',
    gold:       '#fbbf24',
    goldDark:   '#d97706',
    green:      '#22c55e',
    greenDark:  '#16a34a',
    red:        '#ef4444',
    redDark:    '#dc2626',
    blue:       '#3b82f6',
    purple:     '#8b5cf6',
    cyan:       '#06b6d4',
    pink:       '#ec4899',
    white:      '#ffffff',
    muted:      '#9ca3af',
    dim:        '#6b7280',
    hpGreen:    '#4ade80',
    hpYellow:   '#facc15',
    hpRed:      '#f87171',
    xpBar:      '#7c3aed',
    xpBarBg:    'rgba(30, 30, 70, 0.8)',
};

/* ═══════════════════════════════════════════════════════
   INTERNAL HELPERS
   ═══════════════════════════════════════════════════════ */

/** Compact 1.2K / 3.4M / 1.5B short-formatter for hero values. */
function formatNum(num) {
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return String(num);
}

/**
 * Pill-shaped progress bar with a subtle inner shadow and a tip-glow
 * gradient. `progress` is 0..1.
 */
function drawProgressBar(ctx, x, y, width, height, progress, colorFg, colorBg, radius = 6) {
    // Background track
    ctx.fillStyle = colorBg;
    drawRoundedRect(ctx, x, y, width, height, radius);
    ctx.fill();

    // Fill
    const clamped = Math.max(0, Math.min(1, progress || 0));
    const fillWidth = clamped <= 0 ? 0 : Math.max(radius * 2, Math.min(width, width * clamped));
    if (fillWidth > 0) {
        const grad = ctx.createLinearGradient(x, y, x + fillWidth, y);
        grad.addColorStop(0, colorFg);
        grad.addColorStop(1, colorFg + 'cc');
        ctx.fillStyle = grad;
        drawRoundedRect(ctx, x, y, fillWidth, height, radius);
        ctx.fill();
    }
}

function drawGlowCircle(ctx, x, y, radius, color, blur = 20) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color + '30';
    ctx.fill();
    ctx.restore();
}

function drawStarField(ctx, width, height, count = 40) {
    for (let i = 0; i < count; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const r = Math.random() * 1.5 + 0.5;
        const alpha = Math.random() * 0.5 + 0.1;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
    }
}

async function loadAvatar(url) {
    if (!url) return null;
    try {
        return await imageCache.loadWithCache(url, 5000);
    } catch {
        return null;
    }
}

function drawCircularAvatar(ctx, img, x, y, size) {
    if (!img) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
}

/* ═══════════════════════════════════════════════════════
   BATTLE CARD — used by /battle (PvE + PvP)
   ═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   BATTLE CARD — used by /battle (PvE + PvP)
   ═══════════════════════════════════════════════════════ */

/**
 * Render the result card for a pet battle. Layout 920 × 540.
 *
 * Visual hierarchy (top → bottom):
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  ⚔  BATTLE ARENA                       [🏆 VICTORY pill, large]   │
 *   │  ──────────────────────────────────────────────────────────────  │
 *   │                                                                  │
 *   │  ┌────────────────────────┐ ╔══════════╗ ┌────────────────────┐ │
 *   │  │ ⬢  Whiskers            │ ║   VS    ║ │ ⬢  Shadow Knight    │ │
 *   │  │   epic · Lv.12         │ ║  badge  ║ │   rare · Lv.10      │ │
 *   │  │ HP ▓▓▓▓▓▓▓░░ 78/100   │ ╚══════════╝ │ HP ░░░░░░░ 0/90    │ │
 *   │  │  ATK   DEF   SPD       │              │  ATK   DEF   SPD    │ │
 *   │  │   45    32    28       │              │   38    25    22    │ │
 *   │  │ 🗡 Iron Sword +12     │              │ 🗡 Cursed Blade +8 │ │
 *   │  └────────────────────────┘              └────────────────────┘ │
 *   │                                                                  │
 *   │  [BATTLE LOG]  ──────────────────────────────────────────────── │
 *   │   ✦ CRIT  Whiskers strikes for 28 damage!                        │
 *   │   • Shadow Knight casts Dark Strike — 14 damage                  │
 *   │   • Whiskers Lightning Slash — 22 damage                         │
 *   │   ○ Shadow Knight misses!                                        │
 *   │   • Whiskers basic attack — 18 damage                            │
 *   │   • Shadow Knight defeated!                                      │
 *   │                                                                  │
 *   │  [+1.3K coins] [+25 XP]                       ⚔  6 rounds       │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * What changed vs the prior pass
 * ──────────────────────────────
 *   • Avatar-style portrait circle uses `drawConicAvatarRing` so the
 *     pet emoji becomes the focal point of each side panel — same
 *     treatment the level/profile cards use, for visual consistency.
 *   • HP bar gets an inner shadow + tip glow via `drawProgressBar`.
 *   • VS badge is now boxed (not a circle) with a glassy gradient and
 *     a thin underline accent — reads as a real divider instead of a
 *     bullet.
 *   • Battle log uses dimensional chips for line types (CRIT / miss /
 *     normal), each with its own accent so scanning the log is easier.
 *   • Background gets the same vignette + glow + diagonal lattice as
 *     the rank card so the whole bot's card system reads as one suite.
 */
async function createBattleCard({ petA, petB, turnLog, result, rewards }) {

    const W = 920, H = 540;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    /* ── 1. Layered background ── */
    ctx.save();
    drawRoundedRect(ctx, 0, 0, W, H, 24);
    ctx.clip();

    drawGradientBackground(ctx, W, H, '#0c0a1c', '#1a0d2e');
    drawStarField(ctx, W, H, 42);
    drawDiagonalLines(ctx, W, H, 'rgba(124, 58, 237, 0.04)', 28);

    const accent = result === 'win' ? COLORS.green : result === 'lose' ? COLORS.red : COLORS.gold;
    // Two ambient glows that hint at the result colour without
    // dominating the underlying purple aesthetic.
    drawGlowCircle(ctx, W / 2, 0, 320, COLORS.purple, 90);
    drawGlowCircle(ctx, W / 2, H, 200, accent,         50);

    // Vignette for depth at the corners
    const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.7);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    /* ── 2. Header band: title + accent result chip ── */
    ctx.font = getBoldFont(28);
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    await drawTextWithEmoji(ctx, '⚔  BATTLE ARENA', 36, 44, 28);

    // Result chip (right-aligned pill, oversized for emphasis)
    const resText = result === 'win' ? '🏆 VICTORY' : result === 'lose' ? '💀 DEFEAT' : '⚖ DRAW';
    ctx.font = getBoldFont(16);
    const chipTextW = ctx.measureText(resText).width;
    const chipW = chipTextW + 50;
    const chipH = 42;
    const chipX = W - 36 - chipW;
    const chipY = 44 - chipH / 2;
    // Outer glow
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 24;
    drawRoundedRect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
    ctx.fillStyle = accent + '28';
    ctx.fill();
    ctx.restore();
    // Gradient inner fill
    const chipGrad = ctx.createLinearGradient(chipX, chipY, chipX, chipY + chipH);
    chipGrad.addColorStop(0, accent + '38');
    chipGrad.addColorStop(1, accent + '18');
    ctx.fillStyle = chipGrad;
    drawRoundedRect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
    ctx.fill();
    // Stroke
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
    ctx.stroke();
    // Text
    ctx.fillStyle = accent;
    ctx.textAlign = 'center';
    await drawTextWithEmoji(ctx, resText, chipX + chipW / 2, chipY + chipH / 2, 16);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Underline divider for the header
    const headerGrad = ctx.createLinearGradient(36, 80, W - 36, 80);
    headerGrad.addColorStop(0,    'transparent');
    headerGrad.addColorStop(0.25, COLORS.purple + '70');
    headerGrad.addColorStop(0.75, COLORS.purple + '70');
    headerGrad.addColorStop(1,    'transparent');
    ctx.strokeStyle = headerGrad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(36, 80);
    ctx.lineTo(W - 36, 80);
    ctx.stroke();

    /* ── 3. Pet panels ── */
    const panelW = 360, panelH = 210, panelY = 100;
    await drawPetPanel(ctx, { x: 32,                y: panelY, w: panelW, h: panelH }, petA, COLORS.cyan);
    await drawPetPanel(ctx, { x: W - 32 - panelW,   y: panelY, w: panelW, h: panelH }, petB, COLORS.red);

    /* ── 4. VS divider — boxed with glassy gradient ── */
    const vsW = 70, vsH = 86;
    const vsX = W / 2 - vsW / 2;
    const vsY = panelY + (panelH - vsH) / 2;

    // Outer halo
    ctx.save();
    ctx.shadowColor = COLORS.gold + '70';
    ctx.shadowBlur = 22;
    drawRoundedRect(ctx, vsX, vsY, vsW, vsH, 14);
    ctx.fillStyle = 'rgba(15,15,40,0.95)';
    ctx.fill();
    ctx.restore();
    // Glassy inner fill
    const vsGrad = ctx.createLinearGradient(vsX, vsY, vsX, vsY + vsH);
    vsGrad.addColorStop(0, 'rgba(40,30,80,0.92)');
    vsGrad.addColorStop(1, 'rgba(20,15,45,0.95)');
    ctx.fillStyle = vsGrad;
    drawRoundedRect(ctx, vsX, vsY, vsW, vsH, 14);
    ctx.fill();
    // Outer stroke
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 2.5;
    drawRoundedRect(ctx, vsX, vsY, vsW, vsH, 14);
    ctx.stroke();
    // Inner highlight stroke
    ctx.strokeStyle = COLORS.gold + '40';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, vsX + 4, vsY + 4, vsW - 8, vsH - 8, 10);
    ctx.stroke();
    // VS letters
    ctx.font = getBoldFont(28);
    ctx.fillStyle = COLORS.gold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VS', vsX + vsW / 2, vsY + vsH / 2 - 1);
    // Tiny "BATTLE" subtitle under the letters
    ctx.font = getBoldFont(8);
    ctx.fillStyle = COLORS.gold + '90';
    ctx.fillText('BATTLE', vsX + vsW / 2, vsY + vsH - 10);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    /* ── 5. Battle log panel ── */
    const logY = panelY + panelH + 22;
    const logH = 142;
    // Card with subtle inner glow
    ctx.save();
    ctx.shadowColor = 'rgba(124,58,237,0.22)';
    ctx.shadowBlur = 16;
    drawRoundedRect(ctx, 32, logY, W - 64, logH, 14);
    ctx.fillStyle = 'rgba(15,15,40,0.90)';
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(124,58,237,0.36)';
    ctx.lineWidth = 1.2;
    drawRoundedRect(ctx, 32, logY, W - 64, logH, 14);
    ctx.stroke();

    // Header chip in top-left
    const lblText = 'BATTLE LOG';
    ctx.font = getBoldFont(11);
    const lblTextW = ctx.measureText(lblText).width;
    const lblW = lblTextW + 24;
    const lblH = 24;
    drawRoundedRect(ctx, 46, logY + 14, lblW, lblH, lblH / 2);
    ctx.fillStyle = COLORS.purple + '38';
    ctx.fill();
    ctx.strokeStyle = COLORS.purple + '80';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, 46, logY + 14, lblW, lblH, lblH / 2);
    ctx.stroke();
    ctx.fillStyle = COLORS.purple;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lblText, 46 + lblW / 2, logY + 14 + lblH / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Lines (up to 5, colour-coded with bullet markers)
    const lines = Array.isArray(turnLog) ? turnLog : [];
    const maxLines = Math.min(lines.length, 5);
    for (let i = 0; i < maxLines; i++) {
        const t = String(lines[i] || '');
        const isCrit = /CRIT/i.test(t);
        const isMiss = /miss/i.test(t);
        const colour = isCrit ? COLORS.gold : isMiss ? COLORS.dim : COLORS.muted;
        const bullet = isCrit ? '✦' : isMiss ? '○' : '•';

        ctx.fillStyle = colour;
        ctx.font = getBoldFont(13);
        ctx.fillText(bullet, 56, logY + 60 + i * 17);

        ctx.font = getFont(12);
        const display = t.length > 105 ? t.slice(0, 102) + '…' : t;
        await drawTextWithEmoji(ctx, display, 72, logY + 60 + i * 17, 12);
    }

    if (maxLines === 0) {
        ctx.font = getFont(12);
        ctx.fillStyle = COLORS.dim;
        ctx.textAlign = 'center';
        ctx.fillText('No turns recorded.', W / 2, logY + logH / 2 + 8);
        ctx.textAlign = 'left';
    }

    /* ── 6. Rewards strip (bottom) ── */
    const rewY = H - 42;
    if (rewards) {
        let cursorX = 38;
        const chipBaseY = rewY - 18;
        const rewardChips = [];
        if (rewards.coins) rewardChips.push({ text: `+${formatNum(rewards.coins)} coins`, color: COLORS.gold });
        if (rewards.exp)   rewardChips.push({ text: `+${rewards.exp} XP`,                  color: COLORS.purple });

        for (const chip of rewardChips) {
            ctx.font = getBoldFont(13);
            const tw = ctx.measureText(chip.text).width;
            const cw = tw + 28;
            const ch = 32;
            // Outer glow
            ctx.save();
            ctx.shadowColor = chip.color + '70';
            ctx.shadowBlur = 12;
            drawRoundedRect(ctx, cursorX, chipBaseY, cw, ch, ch / 2);
            ctx.fillStyle = chip.color + '24';
            ctx.fill();
            ctx.restore();
            // Inner gradient
            const cg = ctx.createLinearGradient(cursorX, chipBaseY, cursorX, chipBaseY + ch);
            cg.addColorStop(0, chip.color + '32');
            cg.addColorStop(1, chip.color + '14');
            ctx.fillStyle = cg;
            drawRoundedRect(ctx, cursorX, chipBaseY, cw, ch, ch / 2);
            ctx.fill();
            // Stroke
            ctx.strokeStyle = chip.color + '70';
            ctx.lineWidth = 1.5;
            drawRoundedRect(ctx, cursorX, chipBaseY, cw, ch, ch / 2);
            ctx.stroke();
            // Text
            ctx.fillStyle = chip.color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(chip.text, cursorX + cw / 2, chipBaseY + ch / 2);
            cursorX += cw + 12;
        }

        // Round count (right-aligned)
        if (rewards.rounds) {
            ctx.font = getSemiBoldFont(13);
            ctx.fillStyle = COLORS.muted;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            await drawTextWithEmoji(ctx, `⚔  ${rewards.rounds} round${rewards.rounds === 1 ? '' : 's'}`, W - 40, chipBaseY + 16, 13);
        }
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }

    // Outer hairline border
    ctx.save();
    ctx.strokeStyle = 'rgba(124,58,237,0.22)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, 1, 1, W - 2, H - 2, 22);
    ctx.stroke();
    ctx.restore();

    await drawNicoBranding(ctx, W, H);

    return canvas.toBuffer('image/png');
}

/**
 * Pet panel — portrait circle, name, level pill, HP bar, stats grid,
 * weapon line. Used by createBattleCard for both combatants.
 *
 * Layout (360 × 210):
 *   ┌─────────────────────────────────────┐
 *   │ ╭───╮                          ╭─╮  │   <- portrait circle + level pill
 *   │ │ 🐱│  Whiskers The Brave      │12│  │
 *   │ ╰───╯  epic                    ╰─╯  │
 *   │                                     │
 *   │ HP  ▓▓▓▓▓▓▓░░░░  78/100             │
 *   │                                     │
 *   │  ATK     DEF     SPD                │
 *   │   45      32      28                │
 *   │                                     │
 *   │ 🗡 Iron Sword +12                   │
 *   └─────────────────────────────────────┘
 */
async function drawPetPanel(ctx, box, pet, accentColor) {
    const { x, y, w, h } = box;

    // Card background with subtle accent glow
    ctx.save();
    ctx.shadowColor = accentColor + '38';
    ctx.shadowBlur = 16;
    drawRoundedRect(ctx, x, y, w, h, 16);
    ctx.fillStyle = 'rgba(18,18,50,0.92)';
    ctx.fill();
    ctx.restore();

    // Glassy gradient inner fill
    const innerGrad = ctx.createLinearGradient(x, y, x, y + h);
    innerGrad.addColorStop(0, 'rgba(28,28,72,0.94)');
    innerGrad.addColorStop(1, 'rgba(18,18,52,0.95)');
    ctx.fillStyle = innerGrad;
    drawRoundedRect(ctx, x, y, w, h, 16);
    ctx.fill();

    // Accent strip on the left
    drawRoundedRect(ctx, x, y, 5, h, 2);
    ctx.fillStyle = accentColor;
    ctx.fill();

    // Outer border
    ctx.strokeStyle = accentColor + '50';
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, x, y, w, h, 16);
    ctx.stroke();

    // Top hairline highlight (glassy edge)
    const top = ctx.createLinearGradient(x + 16, y, x + w - 16, y);
    top.addColorStop(0,    'transparent');
    top.addColorStop(0.5,  accentColor + '60');
    top.addColorStop(1,    'transparent');
    ctx.strokeStyle = top;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 16, y + 0.5);
    ctx.lineTo(x + w - 16, y + 0.5);
    ctx.stroke();

    /* ── Portrait circle (emoji as the focal point) ── */
    const portraitSize = 56;
    const portraitX = x + 18;
    const portraitY = y + 16;
    // Background ring
    ctx.save();
    ctx.shadowColor = accentColor + '70';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(portraitX + portraitSize / 2, portraitY + portraitSize / 2, portraitSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15,15,40,0.95)';
    ctx.fill();
    ctx.restore();
    // Gradient fill
    const pg = ctx.createLinearGradient(portraitX, portraitY, portraitX, portraitY + portraitSize);
    pg.addColorStop(0, accentColor + '30');
    pg.addColorStop(1, accentColor + '10');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(portraitX + portraitSize / 2, portraitY + portraitSize / 2, portraitSize / 2, 0, Math.PI * 2);
    ctx.fill();
    // Stroke ring
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(portraitX + portraitSize / 2, portraitY + portraitSize / 2, portraitSize / 2, 0, Math.PI * 2);
    ctx.stroke();
    // Inner subtle stroke
    ctx.strokeStyle = accentColor + '30';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(portraitX + portraitSize / 2, portraitY + portraitSize / 2, portraitSize / 2 - 4, 0, Math.PI * 2);
    ctx.stroke();
    // Emoji centered in the portrait
    ctx.font = getBoldFont(34);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    await drawTextWithEmoji(ctx, pet.emoji || '🐾', portraitX + portraitSize / 2, portraitY + portraitSize / 2 + 1, 34);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    /* ── Name + level pill ── */
    const namePadX = portraitX + portraitSize + 12;
    const lvlPillW = 48;
    const lvlPillH = 26;
    const nameMaxW = w - (namePadX - x) - lvlPillW - 22;
    const rawName = String(pet.name || 'Pet');
    ctx.font = getBoldFont(18);
    ctx.fillStyle = COLORS.white;
    const nameDisplay = truncateText(ctx, rawName, nameMaxW);
    await drawTextWithEmoji(ctx, nameDisplay, namePadX, y + 36, 18);

    // Rarity (subtitle under name)
    ctx.font = getFont(11);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`${pet.rarity || 'common'}`, namePadX, y + 56);

    // Level pill (top-right corner)
    const lvlPillX = x + w - lvlPillW - 14;
    const lvlPillY = y + 18;
    drawRoundedRect(ctx, lvlPillX, lvlPillY, lvlPillW, lvlPillH, lvlPillH / 2);
    const lpg = ctx.createLinearGradient(lvlPillX, lvlPillY, lvlPillX, lvlPillY + lvlPillH);
    lpg.addColorStop(0, accentColor + '40');
    lpg.addColorStop(1, accentColor + '18');
    ctx.fillStyle = lpg;
    drawRoundedRect(ctx, lvlPillX, lvlPillY, lvlPillW, lvlPillH, lvlPillH / 2);
    ctx.fill();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.2;
    drawRoundedRect(ctx, lvlPillX, lvlPillY, lvlPillW, lvlPillH, lvlPillH / 2);
    ctx.stroke();
    ctx.font = getBoldFont(13);
    ctx.fillStyle = accentColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Lv.${pet.level || 1}`, lvlPillX + lvlPillW / 2, lvlPillY + lvlPillH / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    /* ── HP bar ── */
    const maxHp = Math.max(1, pet.maxHp || pet.hp || 1);
    const hpRatio = Math.max(0, Math.min(1, (pet.hp ?? 0) / maxHp));
    const hpColor = hpRatio > 0.5 ? COLORS.hpGreen
        : hpRatio > 0.25 ? COLORS.hpYellow
        : COLORS.hpRed;

    const hpY = y + 92;
    ctx.font = getBoldFont(11);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('HP', x + 18, hpY + 10);

    drawProgressBar(ctx, x + 46, hpY, w - 64, 16, hpRatio, hpColor, 'rgba(30,30,60,0.85)', 8);

    ctx.font = getBoldFont(11);
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.max(0, pet.hp ?? 0)}/${maxHp}`, x + w - 22, hpY + 10);
    ctx.textAlign = 'left';

    /* ── Stats row ── */
    const statY = y + 128;
    const stats = [
        { label: 'ATK', value: pet.atk ?? 0, color: COLORS.red   },
        { label: 'DEF', value: pet.def ?? 0, color: COLORS.blue  },
        { label: 'SPD', value: pet.spd ?? 0, color: COLORS.green },
    ];
    const innerW = w - 36;
    const colWidth = innerW / stats.length;
    stats.forEach((s, i) => {
        const sxCenter = x + 18 + i * colWidth + colWidth / 2;
        ctx.textAlign = 'center';
        ctx.font = getBoldFont(10);
        ctx.fillStyle = s.color;
        ctx.fillText(s.label, sxCenter, statY + 10);
        ctx.font = getBoldFont(20);
        ctx.fillStyle = COLORS.white;
        ctx.fillText(String(s.value), sxCenter, statY + 32);
    });
    ctx.textAlign = 'left';

    /* ── Weapon line — only when equipped, anchored to the bottom ── */
    if (pet.weapon) {
        ctx.font = getSemiBoldFont(11);
        ctx.fillStyle = COLORS.gold;
        const wText = `🗡 ${pet.weapon.name || 'Weapon'} +${pet.weapon.baseAtk || 0}`;
        const fitted = truncateText(ctx, wText, w - 36);
        await drawTextWithEmoji(ctx, fitted, x + 18, y + h - 14, 11);
    }
}

/* ═══════════════════════════════════════════════════════
   PROFILE CARD — used by /profile
   ═══════════════════════════════════════════════════════ */

/**
 * Render the economy profile card.
 *
 * Sections (top → bottom):
 *   Header     — avatar, username + VIP chip, optional title, level
 *                badge with XP bar.
 *   Wealth     — Wallet · Bank · Net Worth · Rank.
 *   Stats      — Battles W/L · Fish · Hunt · Streak · Earned.
 *   Achievements — Up to 6 unlocked badges with names + tooltip line.
 *   Pets       — Up to 5 pets with emoji + name + level + rarity.
 *
 * Falls back gracefully when fields are missing (e.g. fresh user
 * with no pets / achievements / streak).
 */
async function createEconomyProfileCard({
    username, avatarURL, tag,
    wallet, bank, total,
    level, xp, xpNeeded,
    streak, rank,
    battlesWon, battlesLost, fishCaught, huntCount,
    achievements, title, vip,
    totalEarned, totalGambled, totalWon,
    pets, fontFamily,
}) {
    const _fh = getFontHelpers(fontFamily || 'Inter');
    const f = {
        font:      (s) => _fh.getFont(s),
        med:       (s) => _fh.getMediumFont(s),
        bold:      (s) => _fh.getBoldFont(s),
        semibold:  (s) => _fh.getSemiBoldFont(s),
    };

    const W = 820, H = 560;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    /* ── Background ── */
    drawGradientBackground(ctx, W, H, '#080818', '#10103a');
    drawStarField(ctx, W, H, 60);
    drawDiagonalLines(ctx, W, H, 'rgba(124,58,237,0.04)', 28);
    drawGlowCircle(ctx, W / 2, 0, 240, COLORS.purple, 80);

    /* ─────────── HEADER ─────────── */
    const headerY = 18, headerH = 110;
    drawRoundedRect(ctx, 18, headerY, W - 36, headerH, 16);
    ctx.fillStyle = 'rgba(20,20,55,0.92)';
    ctx.fill();
    ctx.strokeStyle = COLORS.purple + '40';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, 18, headerY, W - 36, headerH, 16);
    ctx.stroke();

    // Avatar with VIP gold ring or default purple ring
    const avatar = await loadAvatar(avatarURL);
    const ringColor = vip ? COLORS.gold : COLORS.purple;
    const avatarCx = 78, avatarCy = headerY + headerH / 2;
    if (avatar) {
        ctx.save();
        ctx.shadowColor = ringColor;
        ctx.shadowBlur = 18;
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(avatarCx, avatarCy, 36, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        drawCircularAvatar(ctx, avatar, avatarCx - 32, avatarCy - 32, 64);
    }

    // Username — fitText so very long usernames shrink instead of overflowing
    const nameStartX = 130;
    const nameMaxW = W - nameStartX - 230; // reserve for level badge
    const safeName = String(username || 'User');
    const nameSize = fitText(ctx, safeName, nameMaxW, 26, 16);
    ctx.font = f.bold(nameSize);
    ctx.fillStyle = COLORS.white;
    await drawTextWithEmoji(ctx, safeName, nameStartX, headerY + 38, nameSize);

    /* ── Sub-row under the username ──
     * Layout: [VIP chip] · title text · @tag
     * Drawn left-to-right at a single Y so nothing overlaps. The
     * previous version placed the chip above the username and used
     * the wrong font when measuring the username width, which
     * stacked the chip on top of the title text and made the badge
     * look like it wasn't rendering at all.
     */
    const subRowY    = headerY + 70;       // baseline for sub-row text
    const subChipY   = subRowY - 14;       // chip top so its centre matches the text
    let subCursor    = nameStartX;

    // VIP chip (gold pill) — only when active.
    if (vip) {
        const chipText = 'VIP';
        ctx.font = f.bold(11);
        const chipPad = 9;
        const chipW = ctx.measureText(chipText).width + chipPad * 2;
        const chipH = 20;

        drawRoundedRect(ctx, subCursor, subChipY, chipW, chipH, 10);
        ctx.fillStyle = COLORS.gold + '28';
        ctx.fill();
        ctx.strokeStyle = COLORS.gold;
        ctx.lineWidth = 1.2;
        drawRoundedRect(ctx, subCursor, subChipY, chipW, chipH, 10);
        ctx.stroke();

        ctx.fillStyle = COLORS.gold;
        ctx.textBaseline = 'middle';
        ctx.fillText(chipText, subCursor + chipPad, subChipY + chipH / 2 + 1);
        ctx.textBaseline = 'alphabetic';

        subCursor += chipW + 10;
    }

    // Title text — only render when present (and remove a duplicate
    // "VIP Member" label that the slash command tacks on, since the
    // chip already communicates VIP status).
    const cleanedTitle = String(title || '')
        .replace(/^\s*VIP\s+Member\s*(·|-|·\s*)?/i, '')
        .replace(/\s*·\s*VIP\s+Member\s*$/i, '')
        .trim();
    if (cleanedTitle) {
        ctx.font = f.med(13);
        ctx.fillStyle = vip ? COLORS.gold : COLORS.muted;
        const remaining = nameMaxW - (subCursor - nameStartX);
        const safeTitle = truncateText(ctx, cleanedTitle, remaining);
        ctx.fillText(safeTitle, subCursor, subRowY);
        subCursor += ctx.measureText(safeTitle).width + 10;
    }

    // Tag / @username — sits at the same Y as the title when there's
    // room, otherwise wraps to the next line. Keeps the header tidy.
    if (tag) {
        ctx.font = f.font(11);
        ctx.fillStyle = COLORS.dim;
        const tagText = `@${truncateText(ctx, tag, nameMaxW)}`;
        const tagW = ctx.measureText(tagText).width;
        const remaining = nameMaxW - (subCursor - nameStartX);
        if (tagW <= remaining) {
            ctx.fillText(tagText, subCursor, subRowY);
        } else if (cleanedTitle || vip) {
            // No room on the sub-row; put the tag on a third line.
            ctx.fillText(tagText, nameStartX, subRowY + 18);
        } else {
            // Nothing else on the sub-row — own it.
            ctx.fillText(tagText, nameStartX, subRowY);
        }
    }

    // Level badge — top-right
    const lvlText = `LEVEL ${level || 1}`;
    ctx.font = f.bold(13);
    const badgeW = ctx.measureText(lvlText).width + 24;
    const badgeX = W - 30 - badgeW;
    drawRoundedRect(ctx, badgeX, headerY + 18, badgeW, 26, 13);
    ctx.fillStyle = COLORS.purple + '60';
    ctx.fill();
    ctx.strokeStyle = COLORS.purple + 'cc';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, badgeX, headerY + 18, badgeW, 26, 13);
    ctx.stroke();
    ctx.fillStyle = COLORS.white;
    ctx.fillText(lvlText, badgeX + 12, headerY + 36);

    // XP bar under the level badge
    const xpBarX = W - 30 - 200;
    const xpBarY = headerY + 56;
    const xpBarW = 200;
    const xpBarH = 10;
    const xpProgress = (xp || 0) / Math.max(1, xpNeeded || 150);
    drawProgressBar(ctx, xpBarX, xpBarY, xpBarW, xpBarH, xpProgress, COLORS.xpBar, COLORS.xpBarBg, 5);
    ctx.font = f.med(10);
    ctx.fillStyle = COLORS.muted;
    const xpLabel = `${formatNum(xp || 0)} / ${formatNum(xpNeeded || 150)} XP`;
    ctx.textAlign = 'right';
    ctx.fillText(xpLabel, xpBarX + xpBarW, xpBarY + 24);
    ctx.textAlign = 'left';

    /* ─────────── WEALTH ROW ─────────── */
    const wealthY = headerY + headerH + 14;
    const wCards = [
        { label: 'WALLET',    value: wallet,                    color: COLORS.green   },
        { label: 'BANK',      value: bank,                      color: COLORS.blue    },
        { label: 'NET WORTH', value: total,                     color: COLORS.gold    },
        { label: 'RANK',      value: rank ? `#${rank}` : '—',   color: COLORS.purple  },
    ];

    const wcGap = 12;
    const wcW = (W - 36 - wcGap * (wCards.length - 1)) / wCards.length;
    const wcH = 70;
    const wcStartX = 18;

    for (let i = 0; i < wCards.length; i++) {
        const c = wCards[i];
        const cx = wcStartX + i * (wcW + wcGap);

        ctx.save();
        ctx.shadowColor = c.color + '30';
        ctx.shadowBlur = 12;
        drawRoundedRect(ctx, cx, wealthY, wcW, wcH, 12);
        ctx.fillStyle = 'rgba(18,18,50,0.92)';
        ctx.fill();
        ctx.restore();

        drawRoundedRect(ctx, cx, wealthY, 4, wcH, 2);
        ctx.fillStyle = c.color;
        ctx.fill();

        ctx.font = f.semibold(10);
        ctx.fillStyle = c.color;
        ctx.fillText(c.label, cx + 14, wealthY + 22);

        const valStr = typeof c.value === 'number' ? formatNum(c.value) : String(c.value);
        const valSize = fitText(ctx, valStr, wcW - 28, 24, 14);
        ctx.font = f.bold(valSize);
        ctx.fillStyle = COLORS.white;
        ctx.fillText(valStr, cx + 14, wealthY + 54);

        ctx.strokeStyle = c.color + '30';
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, cx, wealthY, wcW, wcH, 12);
        ctx.stroke();
    }

    /* ─────────── STATS ROW ─────────── */
    const statsY = wealthY + wcH + 14;
    const statItems = [
        { label: 'BATTLES W',  value: formatNum(battlesWon  || 0), color: COLORS.red    },
        { label: 'BATTLES L',  value: formatNum(battlesLost || 0), color: COLORS.dim    },
        { label: 'FISH',       value: formatNum(fishCaught  || 0), color: COLORS.cyan   },
        { label: 'HUNT',       value: formatNum(huntCount   || 0), color: COLORS.green  },
        { label: 'STREAK',     value: `${streak || 0}d`,           color: COLORS.gold   },
        { label: 'EARNED',     value: formatNum(totalEarned || 0), color: COLORS.gold   },
    ];
    const stGap = 10;
    const stW = (W - 36 - stGap * (statItems.length - 1)) / statItems.length;
    const stH = 60;

    for (let i = 0; i < statItems.length; i++) {
        const s = statItems[i];
        const sx = 18 + i * (stW + stGap);

        drawRoundedRect(ctx, sx, statsY, stW, stH, 10);
        ctx.fillStyle = 'rgba(15,15,40,0.88)';
        ctx.fill();
        ctx.strokeStyle = s.color + '30';
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, sx, statsY, stW, stH, 10);
        ctx.stroke();

        ctx.font = f.semibold(9);
        ctx.fillStyle = s.color;
        ctx.textAlign = 'center';
        ctx.fillText(s.label, sx + stW / 2, statsY + 18);

        const valSize = fitText(ctx, s.value, stW - 14, 18, 11);
        ctx.font = f.bold(valSize);
        ctx.fillStyle = COLORS.white;
        ctx.fillText(s.value, sx + stW / 2, statsY + 44);
        ctx.textAlign = 'left';
    }

    /* ─────────── ACHIEVEMENTS ─────────── */
    const achY = statsY + stH + 18;
    const achPanelH = 90;
    const achList = Array.isArray(achievements) ? achievements : [];

    ctx.font = f.semibold(11);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`ACHIEVEMENTS  ·  ${achList.length}`, 24, achY);

    drawRoundedRect(ctx, 18, achY + 8, W - 36, achPanelH, 12);
    ctx.fillStyle = 'rgba(15,15,40,0.78)';
    ctx.fill();
    ctx.strokeStyle = COLORS.purple + '30';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, 18, achY + 8, W - 36, achPanelH, 12);
    ctx.stroke();

    if (achList.length === 0) {
        ctx.font = f.font(13);
        ctx.fillStyle = COLORS.dim;
        ctx.fillText('No achievements yet — play more to unlock badges.', 32, achY + 52);
    } else {
        const visible = achList.slice(0, 6);
        const remaining = Math.max(0, achList.length - visible.length);
        const chipPaddingX = 12;
        const chipH = 30;
        const chipGap = 10;
        let cx = 28;
        const cy = achY + 24;

        for (const a of visible) {
            ctx.font = f.med(12);
            const labelText = a.name || a.id || 'Achievement';
            const textW = ctx.measureText(labelText).width;
            const chipW = textW + chipPaddingX * 2 + 22;
            if (cx + chipW > W - 28) break;

            drawRoundedRect(ctx, cx, cy, chipW, chipH, 8);
            ctx.fillStyle = COLORS.purple + '22';
            ctx.fill();
            ctx.strokeStyle = COLORS.purple + '60';
            ctx.lineWidth = 1;
            drawRoundedRect(ctx, cx, cy, chipW, chipH, 8);
            ctx.stroke();

            ctx.font = f.font(16);
            await drawTextWithEmoji(ctx, a.emoji || '🏅', cx + chipPaddingX, cy + 21, 16);

            ctx.font = f.med(12);
            ctx.fillStyle = COLORS.white;
            ctx.fillText(labelText, cx + chipPaddingX + 22, cy + 20);

            cx += chipW + chipGap;
        }

        if (visible.length > 0) {
            ctx.font = f.font(11);
            ctx.fillStyle = COLORS.muted;
            const last = visible[visible.length - 1];
            const descText = last.desc || `Unlocked ${visible.length} of ${achList.length}`;
            ctx.fillText(truncateText(ctx, descText, W - 72), 28, achY + 78);
        }

        if (remaining > 0) {
            ctx.font = f.semibold(11);
            ctx.fillStyle = COLORS.gold;
            ctx.textAlign = 'right';
            ctx.fillText(`+${remaining} more`, W - 28, achY + 78);
            ctx.textAlign = 'left';
        }
    }

    /* ─────────── PETS ─────────── */
    const petY = achY + achPanelH + 22;
    const petPanelH = 90;
    const petList = Array.isArray(pets) ? pets : [];

    ctx.font = f.semibold(11);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`PETS  ·  ${petList.length}`, 24, petY);

    drawRoundedRect(ctx, 18, petY + 8, W - 36, petPanelH, 12);
    ctx.fillStyle = 'rgba(15,15,40,0.78)';
    ctx.fill();
    ctx.strokeStyle = COLORS.cyan + '30';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, 18, petY + 8, W - 36, petPanelH, 12);
    ctx.stroke();

    if (petList.length === 0) {
        ctx.font = f.font(13);
        ctx.fillStyle = COLORS.dim;
        ctx.fillText('No pets yet — use `hunt` to catch wild animals.', 32, petY + 52);
    } else {
        const visiblePets = petList.slice(0, 5);
        const remaining = Math.max(0, petList.length - visiblePets.length);
        const chipPaddingX = 14;
        const chipH = 60;
        const chipGap = 10;
        const totalGap = chipGap * (visiblePets.length - 1);
        const reserved = remaining > 0 ? 100 : 0;
        const chipW = (W - 36 - 24 - totalGap - reserved) / visiblePets.length;
        const startX = 28;
        const startY = petY + 22;

        for (let i = 0; i < visiblePets.length; i++) {
            const p = visiblePets[i];
            const px = startX + i * (chipW + chipGap);

            drawRoundedRect(ctx, px, startY, chipW, chipH, 10);
            ctx.fillStyle = 'rgba(20,20,60,0.85)';
            ctx.fill();
            ctx.strokeStyle = COLORS.cyan + '40';
            ctx.lineWidth = 1;
            drawRoundedRect(ctx, px, startY, chipW, chipH, 10);
            ctx.stroke();

            ctx.font = f.font(24);
            await drawTextWithEmoji(ctx, p.emoji || '🐾', px + chipPaddingX, startY + 36, 24);

            ctx.font = f.semibold(12);
            ctx.fillStyle = COLORS.white;
            const namePx = px + chipPaddingX + 32;
            const nameMaxWidth = chipW - (chipPaddingX + 32) - chipPaddingX;
            ctx.fillText(truncateText(ctx, p.name || 'Pet', nameMaxWidth), namePx, startY + 26);

            ctx.font = f.font(10);
            ctx.fillStyle = COLORS.muted;
            ctx.fillText(`Lv.${p.level || 1} · ${p.rarity || 'common'}`, namePx, startY + 44);
        }

        if (remaining > 0) {
            const morePx = startX + visiblePets.length * (chipW + chipGap);
            ctx.font = f.semibold(13);
            ctx.fillStyle = COLORS.gold;
            ctx.fillText(`+${remaining}`, morePx + 20, startY + 30);
            ctx.font = f.font(10);
            ctx.fillStyle = COLORS.muted;
            ctx.fillText('more pets', morePx + 12, startY + 50);
        }
    }

    /* ─────────── BORDER + WATERMARK ─────────── */
    ctx.strokeStyle = 'rgba(124,58,237,0.18)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, 1, 1, W - 2, H - 2, 20);
    ctx.stroke();

    await drawNicoBranding(ctx, W, H);

    return canvas.toBuffer('image/png');
}

/* ═══════════════════════════════════════════════════════
   EXPORTS — only what's actually used by the bot
   ═══════════════════════════════════════════════════════ */

module.exports = {
    createBattleCard,
    createEconomyProfileCard,
};
