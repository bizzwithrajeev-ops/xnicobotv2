'use strict';

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
const HEADER_H = 108;
const FOOTER_H = 72;
const PAD      = 28;
const ROW_GAP  = 4;
const BRAD     = 20;
const ROW_BR   = 11;

const BG        = '#0d0d1a';
const BG2       = '#13132a';
const BG3       = '#1a1a35';
const ROW_EVEN  = 'rgba(22,22,52,0.92)';
const ROW_ODD   = 'rgba(17,17,42,0.80)';
const FOOT_BG   = 'rgba(10,10,26,0.97)';
const TEXT_MAIN  = '#f0f0f5';
const TEXT_MUTED = '#8b8fa3';
const TEXT_DIM   = '#3d3f54';

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
    if (n >= 1e6) return (n/1e6).toFixed(2)+'M';
    if (n >= 1e3) return (n/1e3).toFixed(1)+'K';
    return n.toLocaleString();
}

function rrPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r);
    ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r);
    ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
}

// Truncate pure-text (no emojis) to fit maxW
function truncate(ctx, text, maxW) {
    if (!text) return '';
    text = String(text);
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 0 && ctx.measureText(t+'…').width > maxW) t = t.slice(0,-1);
    return t + '…';
}

// Strip Discord custom emoji tags + unicode emoji codepoints for pure-text measurement
function stripEmojis(str) {
    return String(str||'')
        .replace(/<a?:[\w]+:\d+>/g, '')
        .replace(/\p{Emoji_Presentation}/gu, '')
        .replace(/\p{Extended_Pictographic}/gu, '')
        .trim();
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
    const H  = HEADER_H + N*(ROW_H+ROW_GAP) - ROW_GAP + FOOTER_H + 10;

    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    // Global baseline/align defaults
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign    = 'left';

    /* ══ 1. CARD BASE FILL (full canvas, no clip) ══
       Ensures the canvas is never transparent/white even if gradient fails */
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    /* ══ 2. BACKGROUND GRADIENT (inside rounded clip) ══ */
    ctx.save();
    rrPath(ctx, 0, 0, W, H, BRAD);
    ctx.clip();

    const bgG = ctx.createLinearGradient(0, 0, W, H);
    bgG.addColorStop(0,    BG);
    bgG.addColorStop(0.35, BG2);
    bgG.addColorStop(0.7,  BG3);
    bgG.addColorStop(1,    BG);
    ctx.fillStyle = bgG;
    ctx.fillRect(0, 0, W, H);

    // Subtle diagonal texture
    ctx.strokeStyle = rgbA(0.030);
    ctx.lineWidth   = 1;
    for (let i = -H; i < W + H; i += 52) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i+H, H);
        ctx.stroke();
    }

    // Top accent sweep
    const sweepG = ctx.createLinearGradient(0, 0, W, 0);
    sweepG.addColorStop(0,    rgbA(0.00));
    sweepG.addColorStop(0.22, rgbA(0.24));
    sweepG.addColorStop(0.65, rgbA(0.08));
    sweepG.addColorStop(1,    rgbA(0.00));
    ctx.fillStyle = sweepG;
    ctx.fillRect(0, 0, W, 4);

    // Ambient radial glow
    const radG = ctx.createRadialGradient(W*0.38, 0, 0, W*0.38, 0, 310);
    radG.addColorStop(0, rgbA(0.14));
    radG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = radG;
    ctx.fillRect(0, 0, W, HEADER_H + 50);

    ctx.restore();

    /* ══ 3. HEADER ══ */
    const hTX = PAD + 10;

    // Title uses drawTextWithEmoji so the accent emoji (<:Sketch:1473038248493453352>, 🌍 etc.) renders as image
    ctx.font      = FB(30);
    ctx.fillStyle = TEXT_MAIN;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    await drawTextWithEmoji(
        ctx,
        `${opts.accentEmoji}  ${opts.scopeLabel} Economy Leaderboard`,
        hTX, 46, 30
    );

    ctx.font      = FM(13);
    ctx.fillStyle = TEXT_MUTED;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    await drawTextWithEmoji(
        ctx,
        `${opts.scopeEmoji} ${opts.scopeLabel}  ·  ${opts.modeLabel}  ·  ` +
        `${(opts.totalCount||0).toLocaleString()} players  ·  Page ${(opts.page||0)+1} / ${opts.totalPages||1}`,
        hTX, 74, 13
    );

    // Divider
    const divY = HEADER_H - 10;
    const divG = ctx.createLinearGradient(PAD, divY, W-PAD, divY);
    divG.addColorStop(0,    'rgba(0,0,0,0)');
    divG.addColorStop(0.15, rgbA(0.60));
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
            rg.addColorStop(0,    `rgba(${mcRgb.r},${mcRgb.g},${mcRgb.b},0.13)`);
            rg.addColorStop(0.25, i%2===0 ? ROW_EVEN : ROW_ODD);
            rg.addColorStop(1,    i%2===0 ? ROW_EVEN : ROW_ODD);
        } else {
            rg.addColorStop(0, i%2===0 ? ROW_EVEN : ROW_ODD);
            rg.addColorStop(1, i%2===0 ? ROW_EVEN : ROW_ODD);
        }
        ctx.fillStyle = rg;
        ctx.fillRect(ROW_X, rowY, ROW_W, ROW_H);

        if (isPod) {
            ctx.fillStyle = `rgba(${mcRgb.r},${mcRgb.g},${mcRgb.b},0.72)`;
            ctx.fillRect(ROW_X, rowY, 4, ROW_H);
        }
        ctx.restore();

        // "You" highlight ring
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
            ctx.save();
            ctx.shadowColor = mc;
            ctx.shadowBlur  = 14;
            const cg = ctx.createRadialGradient(bdgX, bdgY-4, 2, bdgX, bdgY, 24);
            cg.addColorStop(0, `rgba(${mcRgb.r},${mcRgb.g},${mcRgb.b},0.40)`);
            cg.addColorStop(1, `rgba(${mcRgb.r},${mcRgb.g},${mcRgb.b},0.06)`);
            ctx.fillStyle = cg;
            ctx.beginPath();
            ctx.arc(bdgX, bdgY, 24, 0, Math.PI*2);
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = mc + 'aa';
            ctx.lineWidth   = 1.5;
            ctx.beginPath();
            ctx.arc(bdgX, bdgY, 24, 0, Math.PI*2);
            ctx.stroke();

            ctx.save();
            ctx.font         = FB(17);
            ctx.fillStyle    = mc;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(e.rank), bdgX, bdgY);
            ctx.restore();
        } else {
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
            ctx.save();
            ctx.shadowColor = isPod ? mc : rgbA(0.4);
            ctx.shadowBlur  = isPod ? 14 : 8;
            ctx.beginPath();
            ctx.arc(avCX, avCY, avR+3, 0, Math.PI*2);
            ctx.strokeStyle = 'rgba(0,0,0,0)';
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.beginPath();
            ctx.arc(avCX, avCY, avR, 0, Math.PI*2);
            ctx.clip();
            ctx.drawImage(img, avX, avY, AV, AV);
            ctx.restore();

            ctx.strokeStyle = isPod ? mc+'cc' : rgbA(0.50);
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

        /* ── Name (pure text, no emojis expected) ── */
        const txX   = avX + AV + 16;
        const nameW = ROW_W - (txX - ROW_X) - 210;
        const nameY = rowY + 28;
        const subY  = rowY + 54;

        ctx.font         = FB(17);
        ctx.fillStyle    = e.isRequester ? accentHex : TEXT_MAIN;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'alphabetic';
        const nameStr = truncate(ctx, String(e.name||''), nameW);
        ctx.fillText(nameStr, txX, nameY);

        // "YOU" badge
        if (e.isRequester) {
            const nw = ctx.measureText(nameStr).width;
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

        /* ── Stat line (contains emoji like 💵 <:Bank:1473039150927319192>) — use drawTextWithEmoji ── */
        ctx.font         = FT(12);
        ctx.fillStyle    = TEXT_MUTED;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'alphabetic';
        // Truncate based on stripped text width; then render with emoji images
        const rawStat    = String(e.statLine||'');
        const strippedSt = stripEmojis(rawStat);
        ctx.font = FT(12); // ensure font is set for measureText
        const statStr = truncate(ctx, rawStat, nameW + 90) === rawStat
            ? rawStat
            : truncate(ctx, strippedSt, nameW + 60) + rawStat.slice(strippedSt.length > 0 ? strippedSt.length : rawStat.length);
        await drawTextWithEmoji(ctx, rawStat, txX, subY, 12);

        /* ── Primary stat (right-aligned, pure numbers — no emojis) ── */
        const statX = ROW_X + ROW_W - 14;
        const valY  = rowY + 30;
        const lblY  = rowY + 54;

        ctx.save();
        ctx.shadowColor  = rgbA(0.45);
        ctx.shadowBlur   = 10;
        ctx.font         = FB(23);
        ctx.fillStyle    = accentHex;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(fmtN(e.primaryValue), statX, valY);
        ctx.restore();

        ctx.font         = FT(11);
        ctx.fillStyle    = TEXT_DIM;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(String(e.primaryLabel||''), statX, lblY);

        // Reset for next iteration
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'alphabetic';
    }

    /* ══ 5. FOOTER ══ */
    const footY = HEADER_H + N*(ROW_H+ROW_GAP) - ROW_GAP + 6;
    const footH = FOOTER_H - 6;

    ctx.save();
    rrPath(ctx, PAD, footY, ROW_W, footH, ROW_BR);
    ctx.clip();
    const fg = ctx.createLinearGradient(PAD, footY, PAD, footY+footH);
    fg.addColorStop(0, FOOT_BG);
    fg.addColorStop(1, BG);
    ctx.fillStyle = fg;
    ctx.fillRect(PAD, footY, ROW_W, footH);
    ctx.fillStyle = rgbA(0.65);
    ctx.fillRect(PAD, footY, 4, footH);
    ctx.restore();

    const ftX = PAD + 16;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';

    if (opts.requester && opts.requester.rank) {
        ctx.font      = FB(14);
        ctx.fillStyle = TEXT_MAIN;
        await drawTextWithEmoji(
            ctx,
            `📍  Your Standing — #${opts.requester.rank} of ${(opts.totalCount||0).toLocaleString()}`,
            ftX, footY + 26, 14
        );
        if (opts.requester.gapText) {
            ctx.font      = FT(12);
            ctx.fillStyle = TEXT_MUTED;
            ctx.fillText(opts.requester.gapText, ftX, footY + 50);
        }
    } else {
        ctx.font      = FT(13);
        ctx.fillStyle = TEXT_MUTED;
        await drawTextWithEmoji(
            ctx,
            `📍  Not ranked yet — try work or daily to start earning!`,
            ftX, footY + 34, 13
        );
    }

    /* ══ 6. OUTER BORDER ══ */
    ctx.save();
    ctx.strokeStyle = rgbA(0.14);
    ctx.lineWidth   = 1;
    rrPath(ctx, 0.5, 0.5, W-1, H-1, BRAD);
    ctx.stroke();
    ctx.restore();

    /* ══ 7. BRANDING ══ */
    await drawNicoBranding(ctx, W, H, accentHex).catch(() => {});

    return canvas.toBuffer('image/png');
}

module.exports = { generateLeaderboardCard };
