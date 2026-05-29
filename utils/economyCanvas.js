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

/**
 * Render the result card for a pet battle.
 *
 * @param {object}   args
 * @param {object}   args.petA    Player pet (with name, emoji, hp/maxHp, atk, def, spd, level, rarity, weapon?)
 * @param {object}   args.petB    Opponent pet (same shape; PvE uses an enemy generated server-side)
 * @param {string[]} args.turnLog Array of one-line turn descriptions
 * @param {'win'|'lose'|'draw'} args.result
 * @param {object}   [args.rewards] { coins?, exp? } shown in the result strip
 */
async function createBattleCard({ petA, petB, turnLog, result, rewards }) {
    const W = 820, H = 460;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Background — purple-tinted glass to match the bot's standard battle aesthetic.
    drawGradientBackground(ctx, W, H, '#0c0a1c', '#1a0d2e');
    drawStarField(ctx, W, H, 30);
    drawDiagonalLines(ctx, W, H, 'rgba(124, 58, 237, 0.04)', 26);

    // Outer accent glow
    const accent = result === 'win' ? COLORS.green : result === 'lose' ? COLORS.red : COLORS.gold;
    drawGlowCircle(ctx, W / 2, 0, 220, COLORS.purple, 60);

    /* ── Header ── */
    ctx.font = getBoldFont(28);
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'center';
    await drawTextWithEmoji(ctx, '⚔️  BATTLE ARENA  ⚔️', W / 2, 46, 28);
    ctx.textAlign = 'left';

    // Underline divider
    const headerGrad = ctx.createLinearGradient(60, 60, W - 60, 60);
    headerGrad.addColorStop(0,   'transparent');
    headerGrad.addColorStop(0.3, COLORS.purple + '60');
    headerGrad.addColorStop(0.7, COLORS.purple + '60');
    headerGrad.addColorStop(1,   'transparent');
    ctx.strokeStyle = headerGrad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(60, 60);
    ctx.lineTo(W - 60, 60);
    ctx.stroke();

    /* ── Pet panels (left + right) ── */
    const panelW = 340, panelH = 150, panelY = 80;
    await drawPetPanel(ctx, { x: 30,         y: panelY, w: panelW, h: panelH }, petA, COLORS.cyan);
    await drawPetPanel(ctx, { x: W - 30 - panelW, y: panelY, w: panelW, h: panelH }, petB, COLORS.red);

    // VS chip in the middle
    const vsCx = W / 2, vsCy = panelY + panelH / 2;
    ctx.beginPath();
    ctx.arc(vsCx, vsCy, 30, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15,15,40,0.95)';
    ctx.fill();
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = getBoldFont(20);
    ctx.fillStyle = COLORS.gold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VS', vsCx, vsCy + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    /* ── Battle log panel ── */
    const logY = panelY + panelH + 22;
    const logH = 130;
    drawRoundedRect(ctx, 30, logY, W - 60, logH, 12);
    ctx.fillStyle = 'rgba(15,15,40,0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(124,58,237,0.25)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, 30, logY, W - 60, logH, 12);
    ctx.stroke();

    ctx.font = getSemiBoldFont(11);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('BATTLE LOG', 44, logY + 22);

    // Render up to 7 lines of the turn log, colour-coded by event type.
    const lines = Array.isArray(turnLog) ? turnLog : [];
    const maxLines = Math.min(lines.length, 6);
    ctx.font = getFont(12);
    for (let i = 0; i < maxLines; i++) {
        const t = String(lines[i] || '');
        const colour = /CRIT/i.test(t) ? COLORS.gold
            : /miss/i.test(t)          ? COLORS.dim
            : COLORS.muted;
        ctx.fillStyle = colour;
        const display = t.length > 92 ? t.slice(0, 89) + '…' : t;
        await drawTextWithEmoji(ctx, display, 44, logY + 44 + i * 14, 12);
    }

    /* ── Result strip ── */
    const resY = H - 64;
    drawRoundedRect(ctx, 30, resY, W - 60, 46, 12);
    ctx.fillStyle = accent + '20';
    ctx.fill();
    ctx.strokeStyle = accent + '50';
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, 30, resY, W - 60, 46, 12);
    ctx.stroke();

    ctx.font = getBoldFont(18);
    ctx.fillStyle = accent;
    const resText = result === 'win' ? '🏆 VICTORY' : result === 'lose' ? '💀 DEFEAT' : '⚖️ DRAW';
    await drawTextWithEmoji(ctx, resText, 50, resY + 28, 18);

    // Rewards (right-aligned)
    if (rewards) {
        const parts = [];
        if (rewards.coins) parts.push(`+${formatNum(rewards.coins)} coins`);
        if (rewards.exp)   parts.push(`+${rewards.exp} XP`);
        if (parts.length > 0) {
            ctx.font = getSemiBoldFont(14);
            ctx.fillStyle = COLORS.gold;
            ctx.textAlign = 'right';
            ctx.fillText(parts.join('  ·  '), W - 50, resY + 28);
            ctx.textAlign = 'left';
        }
    }

    // Outer border for crispness
    ctx.strokeStyle = 'rgba(124,58,237,0.18)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, 1, 1, W - 2, H - 2, 18);
    ctx.stroke();

    await drawNicoBranding(ctx, W, H);

    return canvas.toBuffer('image/png');
}

/**
 * Pet panel — emoji, name, level, HP bar, ATK/DEF/SPD stats, weapon.
 * Used by createBattleCard for both combatants.
 */
async function drawPetPanel(ctx, box, pet, accentColor) {
    const { x, y, w, h } = box;

    // Card background
    ctx.save();
    ctx.shadowColor = accentColor + '30';
    ctx.shadowBlur = 14;
    drawRoundedRect(ctx, x, y, w, h, 14);
    ctx.fillStyle = 'rgba(18,18,50,0.9)';
    ctx.fill();
    ctx.restore();

    // Accent strip on the left
    drawRoundedRect(ctx, x, y, 4, h, 2);
    ctx.fillStyle = accentColor;
    ctx.fill();

    // Outer border
    ctx.strokeStyle = accentColor + '40';
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, x, y, w, h, 14);
    ctx.stroke();

    // Pet emoji
    ctx.font = getBoldFont(34);
    await drawTextWithEmoji(ctx, pet.emoji || '🐾', x + 16, y + 42, 34);

    // Name (display weight) — emoji-aware
    ctx.font = getBoldFont(20);
    ctx.fillStyle = COLORS.white;
    await drawTextWithEmoji(ctx, String(pet.name || 'Pet'), x + 60, y + 30, 20);

    // Level + rarity
    ctx.font = getFont(12);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`Lv.${pet.level || 1}  •  ${pet.rarity || 'common'}`, x + 60, y + 50);

    // HP bar
    const maxHp = Math.max(1, pet.maxHp || pet.hp || 1);
    const hpRatio = Math.max(0, Math.min(1, (pet.hp ?? 0) / maxHp));
    const hpColor = hpRatio > 0.5 ? COLORS.hpGreen
        : hpRatio > 0.25 ? COLORS.hpYellow
        : COLORS.hpRed;

    ctx.font = getSemiBoldFont(11);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('HP', x + 16, y + 78);

    drawProgressBar(ctx, x + 44, y + 68, w - 60, 12, hpRatio, hpColor, 'rgba(30,30,60,0.8)', 6);

    ctx.font = getFont(10);
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.max(0, pet.hp ?? 0)}/${maxHp}`, x + w - 18, y + 78);
    ctx.textAlign = 'left';

    // Stats row
    const statY = y + 100;
    const stats = [
        { label: 'ATK', value: pet.atk ?? 0,         color: COLORS.red   },
        { label: 'DEF', value: pet.def ?? 0,         color: COLORS.blue  },
        { label: 'SPD', value: pet.spd ?? 0,         color: COLORS.green },
    ];
    const colWidth = (w - 32) / stats.length;
    stats.forEach((s, i) => {
        const sx = x + 16 + i * colWidth;
        ctx.font = getSemiBoldFont(10);
        ctx.fillStyle = s.color;
        ctx.fillText(s.label, sx, statY + 10);
        ctx.font = getBoldFont(16);
        ctx.fillStyle = COLORS.white;
        ctx.fillText(String(s.value), sx, statY + 30);
    });

    // Weapon line — only when equipped
    if (pet.weapon) {
        ctx.font = getFont(10);
        ctx.fillStyle = COLORS.gold;
        const wText = `🗡️ ${pet.weapon.name || 'Weapon'} (+${pet.weapon.baseAtk || 0})`;
        await drawTextWithEmoji(ctx, wText, x + 16, y + h - 12, 10);
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
