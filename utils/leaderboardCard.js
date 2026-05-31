'use strict';

/**
 * leaderboardCard.js — Premium economy leaderboard renderer.
 *
 * Visual refresh notes (v2):
 *   • 920px wide responsive-height canvas with a layered glassy
 *     background (gradient + diagonal lattice + radial accent
 *     glow + top sweep + outer border).
 *   • Header now puts the accent emoji inside a glowing chip,
 *     mode label inline with a scope dot indicator, and a
 *     gradient divider that fades into the accent.
 *   • Rows: alternating glass tiles, podium rows (1st/2nd/3rd) get
 *     a tinted left rail + medal-coloured glow halo behind the
 *     rank badge. Avatars get a soft outer glow ring keyed to
 *     either medal colour or accent.
 *   • Stat lines render through emojiCanvasHelper so Discord
 *     custom emojis (`<:Money:…>`) become proper images.
 *   • Footer: requester standing line plus a thin "percentile" bar
 *     showing where the requester sits on the global ladder.
 *
 * © Rajeev (Rexzy) — xNico
 */

const { createCanvas } = require('@napi-rs/canvas');
const imageCache = require('./imageCache');
const { registerAllFonts, getFontHelpers } = require('./fontRegistry');
const { drawNicoBranding } = require('./canvasDesign');
const { drawTextWithEmoji } = require('./emojiCanvasHelper');

try { registerAllFonts(); } catch (_) {}

/* ═══════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════ */
const W        = 920;
const ROW_H    = 80;
const HEADER_H = 116;
const FOOTER_H = 90;
const PAD      = 28;
const ROW_GAP  = 4;
const BRAD     = 22;
const ROW_BR   = 12;

const BG        = '#1c1d21';
const BG2       = '#1a1b1f';
const BG3       = '#161719';
const ROW_EVEN  = 'rgba(255,255,255,0.04)';
const ROW_ODD   = 'rgba(255,255,255,0.02)';
const FOOT_BG   = 'rgba(0,0,0,0.25)';
const TEXT_MAIN  = '#f1f3f8';
const TEXT_MUTED = '#8b8fa3';
const TEXT_DIM   = '#5c6070';

const MEDAL_HEX = ['#FFD700', '#C0C0C0', '#CD7F32'];

/* ═══════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════ */
function h2r(hex) {
    const s = hex.replace('#', '');
    return { r: parseInt(s.slice(0,2),16), g: parseInt(s.slice(2,4),16), b: parseInt(s.slice(4,6),16) };
}
function i2h(n) { return '#' + n.toString(16).padStart(6,'0'); }
function fmtN(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n/1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n/1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
    return n.toLocaleString();
}

function rrPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x+radius, y);
    ctx.lineTo(x+w-radius, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+radius);
    ctx.lineTo(x+w, y+h-radius);
    ctx.quadraticCurveTo(x+w, y+h, x+w-radius, y+h);
    ctx.lineTo(x+radius, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-radius);
    ctx.lineTo(x, y+radius);
    ctx.quadraticCurveTo(x, y, x+radius, y);
    ctx.closePath();
}

function truncate(ctx, text, maxW) {
    if (!text) return '';
    text = String(text);
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 0 && ctx.measureText(t+'…').width > maxW) t = t.slice(0,-1);
    return t + '…';
}

async function loadAvatar(url) {
    if (!url) return null;
    try { return await imageCache.loadWithCache(url, 4000); }
    catch (_) { return null; }
}

/* ═══════════════════════════════════════════════════
   MAIN GENERATOR
═══════════════════════════════════════════════════ */
async function generateLeaderboardCard(entries, opts) {
    registerAllFonts();

    const fh  = getFontHelpers('Inter');
    const FT  = (s) => fh.getFont(s);
    const FM  = (s) => fh.getMediumFont(s);
    const FSB = (s) => fh.getSemiBoldFont(s);
    const FB  = (s) => fh.getBoldFont(s);

    const accentHex = i2h(opts.accentInt || 0x7c3aed);
    const acc       = h2r(accentHex);
    const rgbA      = (a) => `rgba(${acc.r},${acc.g},${acc.b},${a})`;

    const N  = entries.length;
    const H  = HEADER_H + N*(ROW_H+ROW_GAP) - ROW_GAP + FOOTER_H + 14;

    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign    = 'left';

    /* ══ 1. CARD BASE FILL ══ */
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    /* ══ 2. BACKGROUND (inside rounded clip) ══ */
    ctx.save();
    rrPath(ctx, 0, 0, W, H, BRAD);
    ctx.clip();

    // Flat vertical gradient — clean, no lattice/radial noise.
    const bgG = ctx.createLinearGradient(0, 0, 0, H);
    bgG.addColorStop(0,  BG);
    bgG.addColorStop(1,  BG3);
    ctx.fillStyle = bgG;
    ctx.fillRect(0, 0, W, H);

    // One quiet accent band along the bottom edge.
    ctx.fillStyle = rgbA(0.9);
    ctx.fillRect(0, H - 4, W, 4);

    ctx.restore();

    /* ══ 3. HEADER ══ */
    const hTX = PAD + 10;

    // Title row — accent emoji rendered via the emoji helper so custom
    // Discord IDs become real images instead of unstyled glyphs.
    ctx.font      = FB(30);
    ctx.fillStyle = TEXT_MAIN;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    await drawTextWithEmoji(
        ctx,
        `${opts.accentEmoji}  ${opts.scopeLabel} Economy Leaderboard`,
        hTX, 50, 30
    );

    // Sub-line — small UI text with chips for scope/mode/players
    ctx.font      = FM(13);
    ctx.fillStyle = TEXT_MUTED;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    await drawTextWithEmoji(
        ctx,
        `${opts.scopeEmoji} ${opts.scopeLabel}  ·  ${opts.modeLabel}  ·  ` +
        `${(opts.totalCount||0).toLocaleString()} players  ·  Page ${(opts.page||0)+1} / ${opts.totalPages||1}`,
        hTX, 80, 13
    );

    // Divider — accent gradient that fades at both edges
    const divY = HEADER_H - 6;
    const divG = ctx.createLinearGradient(PAD, divY, W-PAD, divY);
    divG.addColorStop(0,    'rgba(0,0,0,0)');
    divG.addColorStop(0.15, rgbA(0.65));
    divG.addColorStop(0.85, rgbA(0.30));
    divG.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.strokeStyle = divG;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(PAD, divY);
    ctx.lineTo(W-PAD, divY);
    ctx.stroke();

    /* ══ 4. ROWS ══ */
    const ROW_X = PAD;
    const ROW_W = W - PAD*2;
    const AV    = 52;

    for (let i = 0; i < N; i++) {
        const e    = entries[i];
        const rowY = HEADER_H + i*(ROW_H+ROW_GAP);
        const isPod = e.rank <= 3;
        const mc    = isPod ? MEDAL_HEX[e.rank-1] : null;
        const mcRgb = mc ? h2r(mc) : null;

        /* ── Row background (clipped) ── */
        ctx.save();
        rrPath(ctx, ROW_X, rowY, ROW_W, ROW_H, ROW_BR);
        ctx.clip();

        const rg = ctx.createLinearGradient(ROW_X, rowY, ROW_X+ROW_W, rowY);
        if (isPod) {
            rg.addColorStop(0,    `rgba(${mcRgb.r},${mcRgb.g},${mcRgb.b},0.16)`);
            rg.addColorStop(0.30, i%2===0 ? ROW_EVEN : ROW_ODD);
            rg.addColorStop(1,    i%2===0 ? ROW_EVEN : ROW_ODD);
        } else {
            rg.addColorStop(0, i%2===0 ? ROW_EVEN : ROW_ODD);
            rg.addColorStop(1, i%2===0 ? ROW_EVEN : ROW_ODD);
        }
        ctx.fillStyle = rg;
        ctx.fillRect(ROW_X, rowY, ROW_W, ROW_H);

        // Top edge highlight — tiny shine for premium feel
        const shineG = ctx.createLinearGradient(0, rowY, 0, rowY + 12);
        shineG.addColorStop(0, 'rgba(255,255,255,0.04)');
        shineG.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shineG;
        ctx.fillRect(ROW_X, rowY, ROW_W, 12);

        // Podium left rail
        if (isPod) {
            ctx.fillStyle = `rgba(${mcRgb.r},${mcRgb.g},${mcRgb.b},0.78)`;
            ctx.fillRect(ROW_X, rowY, 4, ROW_H);
        }
        ctx.restore();

        // "You" highlight ring — accent stroke
        if (e.isRequester) {
            ctx.save();
            ctx.strokeStyle = rgbA(0.65);
            ctx.lineWidth   = 1.5;
            rrPath(ctx, ROW_X+0.75, rowY+0.75, ROW_W-1.5, ROW_H-1.5, ROW_BR);
            ctx.stroke();
            ctx.restore();
        }

        /* ── Rank badge ── */
        const bdgX = ROW_X + 36;
        const bdgY = rowY + ROW_H/2;

        if (isPod) {
            // Flat medal coin — single fill + ring, no glow.
            ctx.beginPath();
            ctx.arc(bdgX, bdgY, 22, 0, Math.PI*2);
            ctx.fillStyle = `rgba(${mcRgb.r},${mcRgb.g},${mcRgb.b},0.18)`;
            ctx.fill();
            ctx.strokeStyle = mc + 'cc';
            ctx.lineWidth   = 2;
            ctx.beginPath();
            ctx.arc(bdgX, bdgY, 22, 0, Math.PI*2);
            ctx.stroke();

            ctx.save();
            ctx.font         = FB(17);
            ctx.fillStyle    = mc;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(e.rank), bdgX, bdgY);
            ctx.restore();
        } else {
            // Plain numbered badge
            ctx.save();
            ctx.beginPath();
            ctx.arc(bdgX, bdgY, 18, 0, Math.PI*2);
            ctx.fillStyle = 'rgba(28,28,58,0.78)';
            ctx.fill();
            ctx.strokeStyle = TEXT_DIM;
            ctx.lineWidth   = 1;
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.font         = FSB(12);
            ctx.fillStyle    = TEXT_MUTED;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`#${e.rank}`, bdgX, bdgY);
            ctx.restore();
        }

        /* ── Avatar ── */
        const avX  = ROW_X + 72;
        const avY  = rowY + (ROW_H-AV)/2;
        const avCX = avX + AV/2;
        const avCY = avY + AV/2;
        const avR  = AV/2;

        const img = await loadAvatar(e.avatar);

        if (img) {
            // Image clipped to circle
            ctx.save();
            ctx.beginPath();
            ctx.arc(avCX, avCY, avR, 0, Math.PI*2);
            ctx.clip();
            ctx.drawImage(img, avX, avY, AV, AV);
            ctx.restore();

            // Single outer ring
            ctx.strokeStyle = isPod ? mc + 'cc' : rgbA(0.55);
            ctx.lineWidth   = isPod ? 2.5 : 1.5;
            ctx.beginPath();
            ctx.arc(avCX, avCY, avR+2, 0, Math.PI*2);
            ctx.stroke();
        } else {
            // Fallback: accent circle + initial letter
            ctx.save();
            ctx.beginPath();
            ctx.arc(avCX, avCY, avR, 0, Math.PI*2);
            ctx.fillStyle = rgbA(0.22);
            ctx.fill();
            ctx.strokeStyle = rgbA(0.40);
            ctx.lineWidth   = 1.5;
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.font         = FB(20);
            ctx.fillStyle    = accentHex;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((String(e.name||'?')[0]).toUpperCase(), avCX, avCY);
            ctx.restore();
        }

        /* ── Name (pure text) ── */
        const txX   = avX + AV + 16;
        const nameW = ROW_W - (txX - ROW_X) - 210;
        const nameY = rowY + 28;
        const subY  = rowY + 54;

        ctx.font         = FB(17);
        ctx.fillStyle    = e.isRequester ? accentHex : TEXT_MAIN;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'alphabetic';
        // Display names may contain emojis; truncate using mixed-text
        // width and render through drawTextWithEmoji.
        let nameStr = String(e.name || '');
        while (require('./emojiCanvasHelper').measureMixedText(ctx, nameStr, 17) > nameW && nameStr.length > 0) {
            nameStr = nameStr.slice(0, -1);
        }
        if (nameStr !== String(e.name || '')) nameStr += '\u2026';
        await drawTextWithEmoji(ctx, nameStr, txX, nameY, 17);

        // "YOU" badge — placed right after the name. Use the mixed-
        // text width because the name may have emojis that took more
        // horizontal space than measureText reports.
        if (e.isRequester) {
            const nw = require('./emojiCanvasHelper').measureMixedText(ctx, nameStr, 17);
            ctx.save();
            const bx = txX + nw + 10;
            const by = nameY - 13;
            const bw = 36;
            const bh = 16;
            rrPath(ctx, bx, by, bw, bh, 4);
            ctx.fillStyle = rgbA(0.30);
            ctx.fill();
            ctx.strokeStyle = rgbA(0.60);
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.font         = FSB(10);
            ctx.fillStyle    = accentHex;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('YOU', bx + bw/2, by + bh/2);
            ctx.restore();
        }

        /* ── Stat line (may contain custom emojis) — drawTextWithEmoji ── */
        ctx.font         = FT(12);
        ctx.fillStyle    = TEXT_MUTED;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'alphabetic';
        await drawTextWithEmoji(ctx, String(e.statLine||''), txX, subY, 12);

        /* ── Primary stat (right-aligned, no emojis) ── */
        const statX = ROW_X + ROW_W - 14;
        const valY  = rowY + 30;
        const lblY  = rowY + 54;

        ctx.save();
        ctx.font         = FB(23);
        ctx.fillStyle    = isPod ? mc : accentHex;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(fmtN(e.primaryValue), statX, valY);
        ctx.restore();

        ctx.font         = FT(11);
        ctx.fillStyle    = TEXT_DIM;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(String(e.primaryLabel||''), statX, lblY);

        // Reset
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'alphabetic';
    }

    /* ══ 5. FOOTER ══ */
    const footY = HEADER_H + N*(ROW_H+ROW_GAP) - ROW_GAP + 10;
    const footH = FOOTER_H - 10;

    ctx.save();
    rrPath(ctx, PAD, footY, ROW_W, footH, ROW_BR);
    ctx.clip();
    const fg = ctx.createLinearGradient(PAD, footY, PAD, footY+footH);
    fg.addColorStop(0, FOOT_BG);
    fg.addColorStop(1, BG);
    ctx.fillStyle = fg;
    ctx.fillRect(PAD, footY, ROW_W, footH);
    // Left rail keyed to accent
    ctx.fillStyle = rgbA(0.65);
    ctx.fillRect(PAD, footY, 4, footH);

    // Top-edge shine
    const fShine = ctx.createLinearGradient(0, footY, 0, footY + 8);
    fShine.addColorStop(0, 'rgba(255,255,255,0.05)');
    fShine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fShine;
    ctx.fillRect(PAD, footY, ROW_W, 8);
    ctx.restore();

    const ftX = PAD + 16;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';

    if (opts.requester && opts.requester.rank) {
        // Standing line
        ctx.font      = FB(14);
        ctx.fillStyle = TEXT_MAIN;
        await drawTextWithEmoji(
            ctx,
            `📍  Your Standing — #${opts.requester.rank} of ${(opts.totalCount||0).toLocaleString()}`,
            ftX, footY + 26, 14
        );

        // Mini percentile bar — visual "where you sit on the ladder"
        const barX = ftX;
        const barY = footY + 42;
        const barW = ROW_W - 32;
        const barH = 6;
        const total = Math.max(1, opts.totalCount || 1);
        // Higher rank (closer to #1) = fill closer to 100%
        const pct = Math.max(0, Math.min(1, 1 - (opts.requester.rank - 1) / total));

        rrPath(ctx, barX, barY, barW, barH, barH/2);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fill();

        const fillW = Math.max(barH, barW * pct);
        ctx.save();
        rrPath(ctx, barX, barY, fillW, barH, barH/2);
        ctx.clip();
        const barG = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        barG.addColorStop(0, rgbA(0.55));
        barG.addColorStop(0.6, rgbA(0.95));
        barG.addColorStop(1, '#ffffff');
        ctx.fillStyle = barG;
        ctx.fillRect(barX, barY, fillW, barH);
        ctx.restore();

        // Right-aligned percentile chip + optional gap text
        ctx.font      = FT(11);
        ctx.fillStyle = TEXT_MUTED;
        ctx.textAlign = 'left';
        if (opts.requester.gapText) {
            ctx.fillText(opts.requester.gapText, ftX, footY + 70);
        } else {
            ctx.fillText(`Top ${Math.max(1, Math.round((1 - pct) * 100 + 0.5))}% of all ranked players`, ftX, footY + 70);
        }
    } else {
        ctx.font      = FT(13);
        ctx.fillStyle = TEXT_MUTED;
        await drawTextWithEmoji(
            ctx,
            `📍  Not ranked yet — try \`work\` or \`daily\` to start earning!`,
            ftX, footY + 38, 13
        );
        // Empty placeholder bar
        const barX = ftX;
        const barY = footY + 56;
        const barW = ROW_W - 32;
        const barH = 6;
        rrPath(ctx, barX, barY, barW, barH, barH/2);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fill();
    }

    /* ══ 6. OUTER BORDER ══ */
    ctx.save();
    ctx.strokeStyle = rgbA(0.16);
    ctx.lineWidth   = 1;
    rrPath(ctx, 0.5, 0.5, W-1, H-1, BRAD);
    ctx.stroke();
    ctx.restore();

    /* ══ 7. BRANDING ══ */
    await drawNicoBranding(ctx, W, H, accentHex).catch(() => {});

    return canvas.toBuffer('image/png');
}

module.exports = { generateLeaderboardCard };
