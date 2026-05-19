const { createCanvas } = require('@napi-rs/canvas');
const imageCache = require('./imageCache');
const { registerAllFonts, getFontHelpers } = require('./fontRegistry');
const {
    drawRoundedRect, drawText, hexToRgb, formatNumber,
    getNicoLogo, drawNicoBranding, loadEmoji: loadCanvasEmoji
} = require('./canvasDesign');

try { registerAllFonts(); } catch {}

const EMOJIS = {
    rank: '<:Award:1473038391632203887>',
    xp: '<:Lightning:1473038797540298792>',
    gained: '<:Checkedbox:1473038547165384804>',
    levelup: '<:Fire:1473038604812161218>'
};

const W = 934;
const H = 290;
const RAD = 24;

function roundRect(ctx, x, y, w, h, r) {
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

function hex(h) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [124, 58, 237];
}

function fmtNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
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
    ctx.fillStyle = '#0c0c1d';
    roundRect(ctx, 0, 0, W, H, RAD);
    ctx.fill();
    const fh = getFontHelpers(data.fontFamily || 'Inter');
    ctx.font = fh.getBoldFont(28);
    ctx.fillStyle = '#a855f7';
    ctx.fillText('LEVEL UP!', 40, H / 2 - 10);
    ctx.font = fh.getFont(16);
    ctx.fillStyle = '#8b8fa3';
    const name = user.globalName || user.username || 'User';
    ctx.fillText(`${name} advanced to Level ${data.newLevel || '?'}`, 40, H / 2 + 20);
    return canvas.toBuffer('image/png');
}

async function _renderCard(user, data = {}) {
    const h = getFontHelpers(data.fontFamily || 'Poppins');
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    const oldLevel = data.oldLevel || 0;
    const newLevel = data.newLevel || 1;
    const totalXp = data.totalXp || 0;
    const rank = data.rank || 0;
    const xpGain = data.xpGain || 0;

    const ac = '#7c3aed';
    const ac2 = '#a855f7';
    const cyan = '#06b6d4';
    const gold = '#fbbf24';
    const green = '#22c55e';
    const [ar, ag, ab] = hex(ac);

    const logo = await getNicoLogo();

    ctx.save();
    roundRect(ctx, 0, 0, W, H, RAD);
    ctx.clip();

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#08081a');
    bg.addColorStop(0.3, '#0e0e28');
    bg.addColorStop(0.6, '#0c0c22');
    bg.addColorStop(1, '#08081a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = 0.02;
    ctx.strokeStyle = `rgba(${ar},${ag},${ab},1)`;
    ctx.lineWidth = 0.5;
    for (let i = -H; i < W + H; i += 32) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i, H); ctx.lineTo(i + H, 0); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const g1 = ctx.createRadialGradient(140, H / 2, 0, 140, H / 2, 280);
    g1.addColorStop(0, `rgba(${ar},${ag},${ab},0.14)`);
    g1.addColorStop(0.5, `rgba(${ar},${ag},${ab},0.04)`);
    g1.addColorStop(1, 'transparent');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, 400, H);

    const g2 = ctx.createRadialGradient(W - 110, H / 2, 0, W - 110, H / 2, 220);
    g2.addColorStop(0, `rgba(6,182,212,0.1)`);
    g2.addColorStop(0.6, `rgba(${ar},${ag},${ab},0.03)`);
    g2.addColorStop(1, 'transparent');
    ctx.fillStyle = g2;
    ctx.fillRect(W - 340, 0, 340, H);

    const topBar = ctx.createLinearGradient(0, 0, W, 0);
    topBar.addColorStop(0, 'transparent');
    topBar.addColorStop(0.1, `rgba(${ar},${ag},${ab},0.6)`);
    topBar.addColorStop(0.35, ac);
    topBar.addColorStop(0.5, cyan);
    topBar.addColorStop(0.65, ac);
    topBar.addColorStop(0.9, `rgba(${ar},${ag},${ab},0.6)`);
    topBar.addColorStop(1, 'transparent');
    ctx.fillStyle = topBar;
    ctx.fillRect(0, 0, W, 3);

    const botBar = ctx.createLinearGradient(0, 0, W, 0);
    botBar.addColorStop(0, 'transparent');
    botBar.addColorStop(0.25, `rgba(${ar},${ag},${ab},0.25)`);
    botBar.addColorStop(0.5, `rgba(6,182,212,0.25)`);
    botBar.addColorStop(0.75, `rgba(${ar},${ag},${ab},0.25)`);
    botBar.addColorStop(1, 'transparent');
    ctx.fillStyle = botBar;
    ctx.fillRect(0, H - 2, W, 2);

    ctx.restore();

    const avSize = 116;
    const avX = 38;
    const avY = (H - avSize) / 2;
    const cx = avX + avSize / 2;
    const cy = avY + avSize / 2;

    ctx.save();
    ctx.shadowColor = `rgba(${ar},${ag},${ab},0.7)`;
    ctx.shadowBlur = 40;
    ctx.beginPath();
    ctx.arc(cx, cy, avSize / 2 + 8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${ar},${ag},${ab},0.12)`;
    ctx.fill();
    ctx.restore();

    try {
        const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
        const avatar = await imageCache.loadWithCache(avatarUrl, 5000);
        if (avatar) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, avSize / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatar, avX, avY, avSize, avSize);
            ctx.restore();

            ctx.strokeStyle = '#08081a';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(cx, cy, avSize / 2 + 2.5, 0, Math.PI * 2);
            ctx.stroke();

            const ring = ctx.createConicGradient(-Math.PI / 2, cx, cy);
            ring.addColorStop(0, ac);
            ring.addColorStop(0.2, ac2);
            ring.addColorStop(0.4, cyan);
            ring.addColorStop(0.6, ac2);
            ring.addColorStop(0.8, ac);
            ring.addColorStop(1, ac);
            ctx.strokeStyle = ring;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, cy, avSize / 2 + 7, 0, Math.PI * 2);
            ctx.stroke();
        }
    } catch {}

    const stR = 13;
    const stX = cx + avSize / 2 * Math.cos(Math.PI / 4) - 1;
    const stY = cy + avSize / 2 * Math.sin(Math.PI / 4) - 1;

    ctx.beginPath();
    ctx.arc(stX, stY, stR + 3, 0, Math.PI * 2);
    ctx.fillStyle = '#08081a';
    ctx.fill();

    if (logo) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(stX, stY, stR, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(logo, stX - stR, stY - stR, stR * 2, stR * 2);
        ctx.restore();

        const stBorder = ctx.createConicGradient(0, stX, stY);
        stBorder.addColorStop(0, ac);
        stBorder.addColorStop(0.5, cyan);
        stBorder.addColorStop(1, ac);
        ctx.strokeStyle = stBorder;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(stX, stY, stR + 0.5, 0, Math.PI * 2);
        ctx.stroke();
    }

    const tX = avX + avSize + 32;
    const tW = W - tX - 210;

    const bdgW = 130;
    const bdgH = 26;
    const bdgX = tX;
    const bdgY = 30;

    ctx.save();
    ctx.shadowColor = `rgba(${ar},${ag},${ab},0.4)`;
    ctx.shadowBlur = 12;
    const bdgGrad = ctx.createLinearGradient(bdgX, bdgY, bdgX + bdgW, bdgY + bdgH);
    bdgGrad.addColorStop(0, ac);
    bdgGrad.addColorStop(0.5, ac2);
    bdgGrad.addColorStop(1, '#c084fc');
    ctx.fillStyle = bdgGrad;
    roundRect(ctx, bdgX, bdgY, bdgW, bdgH, bdgH / 2);
    ctx.fill();
    ctx.restore();

    ctx.font = h.getBoldFont(12);
    ctx.fillStyle = '#fff';
    // Draw the LEVEL UP badge text with emoji placed precisely
    {
        const badgeEmojiSize = 14;
        const emojiImg = await loadCanvasEmoji(EMOJIS.levelup, true, '1473038604812161218', false, 'Fire');
        let bx = bdgX + 10;
        if (emojiImg) {
            // Center emoji vertically in the badge pill
            const emojiY = bdgY + (bdgH - badgeEmojiSize) / 2;
            ctx.drawImage(emojiImg, bx, emojiY, badgeEmojiSize, badgeEmojiSize);
            bx += badgeEmojiSize + 5;
        }
        ctx.textAlign = 'left';
        ctx.fillText('LEVEL UP!', bx, bdgY + 17);
    }

    ctx.font = h.getBoldFont(30);
    ctx.fillStyle = '#f0f0f5';
    let username = user.globalName || user.username;
    if (ctx.measureText(username).width > tW) {
        while (ctx.measureText(username + '...').width > tW && username.length > 0) username = username.slice(0, -1);
        username += '...';
    }
    ctx.fillText(username, tX, bdgY + bdgH + 34);

    ctx.font = h.getFont(15);
    ctx.fillStyle = '#8b8fa3';
    ctx.fillText('Advanced to ', tX, bdgY + bdgH + 56);
    const advW = ctx.measureText('Advanced to ').width;
    ctx.font = h.getBoldFont(15);
    ctx.fillStyle = ac2;
    ctx.fillText(`Level ${newLevel}`, tX + advW, bdgY + bdgH + 56);

    const statsY = bdgY + bdgH + 86;
    const stats = [];
    if (rank > 0) stats.push({ emoji: EMOJIS.rank, label: 'RANK', value: `#${rank}`, color: gold });
    stats.push({ emoji: EMOJIS.xp, label: 'TOTAL XP', value: fmtNum(totalXp), color: cyan });
    if (xpGain > 0) stats.push({ emoji: EMOJIS.gained, label: 'GAINED', value: `+${fmtNum(xpGain)}`, color: green });

    let sX = tX;
    for (let i = 0; i < stats.length; i++) {
        const s = stats[i];
        if (i > 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            ctx.fillRect(sX + 6, statsY - 12, 1, 24);
            sX += 18;
        }

        ctx.font = h.getSemiBoldFont(9);
        const labelW = ctx.measureText(s.label).width;
        ctx.font = h.getBoldFont(12);
        const valueW = ctx.measureText(s.value).width;

        const emojiW = 16;
        const pillW = 10 + emojiW + 4 + labelW + 8 + valueW + 12;

        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 0.5;
        roundRect(ctx, sX, statsY - 14, pillW, 30, 8);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Draw emoji directly at the correct position (vertically centered in pill)
        {
            const emojiMatch = s.emoji.match(/<a?:(\w+):(\d+)>/);
            if (emojiMatch) {
                const emojiImg = await loadCanvasEmoji(s.emoji, true, emojiMatch[2], false, emojiMatch[1]);
                if (emojiImg) {
                    // Center emoji vertically in the 30px pill (pill top = statsY-14)
                    const emojiDrawY = statsY - 14 + (30 - emojiW) / 2;
                    ctx.drawImage(emojiImg, sX + 8, emojiDrawY, emojiW, emojiW);
                }
            }
        }

        ctx.font = h.getSemiBoldFont(9);
        ctx.fillStyle = '#6b7085';
        ctx.fillText(s.label, sX + 10 + emojiW + 4, statsY + 2);

        ctx.font = h.getBoldFont(12);
        ctx.fillStyle = s.color;
        ctx.fillText(s.value, sX + 10 + emojiW + 4 + labelW + 8, statsY + 3);

        sX += pillW + 8;
    }

    const progY = statsY + 30;
    const progW = Math.min(tW + 100, W - tX - 190);
    const progH = 8;

    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    roundRect(ctx, tX, progY, progW, progH, progH / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    roundRect(ctx, tX, progY, progW, progH, progH / 2);
    ctx.stroke();

    const fillPct = Math.min(0.75, 0.3 + Math.random() * 0.4);
    const fillW = progW * fillPct;
    const progFill = ctx.createLinearGradient(tX, 0, tX + fillW, 0);
    progFill.addColorStop(0, ac);
    progFill.addColorStop(0.4, ac2);
    progFill.addColorStop(1, cyan);
    ctx.fillStyle = progFill;
    roundRect(ctx, tX, progY, fillW, progH, progH / 2);
    ctx.fill();

    ctx.save();
    ctx.shadowColor = cyan;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(tX + fillW - 1, progY + progH / 2, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(tX + fillW - 1, progY + progH / 2, 3, 0, Math.PI * 2);
    ctx.fillStyle = cyan;
    ctx.fill();

    ctx.font = h.getFont(9);
    ctx.fillStyle = '#4a4e65';
    ctx.fillText('Keep chatting to reach the next level!', tX, progY + 22);

    const bxW = 155;
    const bxH = 210;
    const bxX = W - 38 - bxW;
    const bxY = (H - bxH) / 2;

    ctx.save();
    ctx.shadowColor = `rgba(${ar},${ag},${ab},0.3)`;
    ctx.shadowBlur = 35;
    const bxBg = ctx.createLinearGradient(bxX, bxY, bxX + bxW, bxY + bxH);
    bxBg.addColorStop(0, 'rgba(18,18,45,0.97)');
    bxBg.addColorStop(0.5, 'rgba(14,14,38,0.98)');
    bxBg.addColorStop(1, 'rgba(10,10,28,0.99)');
    ctx.fillStyle = bxBg;
    roundRect(ctx, bxX, bxY, bxW, bxH, 18);
    ctx.fill();
    ctx.restore();

    const bxBorder = ctx.createLinearGradient(bxX, bxY, bxX + bxW, bxY + bxH);
    bxBorder.addColorStop(0, `rgba(${ar},${ag},${ab},0.35)`);
    bxBorder.addColorStop(0.3, `rgba(6,182,212,0.2)`);
    bxBorder.addColorStop(0.7, `rgba(${ar},${ag},${ab},0.2)`);
    bxBorder.addColorStop(1, `rgba(6,182,212,0.35)`);
    ctx.strokeStyle = bxBorder;
    ctx.lineWidth = 1.5;
    roundRect(ctx, bxX, bxY, bxW, bxH, 18);
    ctx.stroke();

    const bxTopHL = ctx.createLinearGradient(bxX + 20, bxY, bxX + bxW - 20, bxY);
    bxTopHL.addColorStop(0, 'transparent');
    bxTopHL.addColorStop(0.5, `rgba(${ar},${ag},${ab},0.6)`);
    bxTopHL.addColorStop(1, 'transparent');
    ctx.strokeStyle = bxTopHL;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bxX + 20, bxY + 0.5);
    ctx.lineTo(bxX + bxW - 20, bxY + 0.5);
    ctx.stroke();

    ctx.textAlign = 'center';

    ctx.font = h.getSemiBoldFont(10);
    ctx.fillStyle = '#5c6078';
    ctx.fillText('FROM', bxX + bxW / 2, bxY + 30);

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 6;
    ctx.font = h.getBoldFont(36);
    ctx.fillStyle = '#555870';
    ctx.fillText(String(oldLevel), bxX + bxW / 2, bxY + 68);
    ctx.restore();

    const arrY = bxY + 82;
    const arrMid = bxX + bxW / 2;

    const divLine = ctx.createLinearGradient(bxX + 20, arrY, bxX + bxW - 20, arrY);
    divLine.addColorStop(0, 'transparent');
    divLine.addColorStop(0.5, `rgba(${ar},${ag},${ab},0.3)`);
    divLine.addColorStop(1, 'transparent');
    ctx.strokeStyle = divLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bxX + 20, arrY);
    ctx.lineTo(bxX + bxW - 20, arrY);
    ctx.stroke();

    ctx.save();
    ctx.shadowColor = ac2;
    ctx.shadowBlur = 12;
    const arrGrad = ctx.createLinearGradient(arrMid - 10, arrY + 6, arrMid + 10, arrY + 20);
    arrGrad.addColorStop(0, ac);
    arrGrad.addColorStop(1, cyan);
    ctx.fillStyle = arrGrad;
    ctx.beginPath();
    ctx.moveTo(arrMid - 10, arrY + 6);
    ctx.lineTo(arrMid + 10, arrY + 6);
    ctx.lineTo(arrMid, arrY + 20);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.font = h.getSemiBoldFont(10);
    ctx.fillStyle = ac2;
    ctx.fillText('TO', bxX + bxW / 2, arrY + 38);

    ctx.save();
    ctx.shadowColor = `rgba(${ar},${ag},${ab},0.9)`;
    ctx.shadowBlur = 20;
    ctx.font = h.getBoldFont(46);
    const newLvlGrad = ctx.createLinearGradient(arrMid - 25, arrY + 44, arrMid + 25, arrY + 80);
    newLvlGrad.addColorStop(0, '#c084fc');
    newLvlGrad.addColorStop(0.5, ac2);
    newLvlGrad.addColorStop(1, cyan);
    ctx.fillStyle = newLvlGrad;
    ctx.fillText(String(newLevel), bxX + bxW / 2, arrY + 78);
    ctx.restore();

    if (logo) {
        const bxLogoSize = 22;
        const bxLogoX = bxX + bxW / 2 - bxLogoSize / 2;
        const bxLogoY = arrY + 88;
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(bxLogoX + bxLogoSize / 2, bxLogoY + bxLogoSize / 2, bxLogoSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(logo, bxLogoX, bxLogoY, bxLogoSize, bxLogoSize);
        ctx.restore();
    }

    ctx.textAlign = 'left';

    await drawNicoBranding(ctx, W, H, ac);

    ctx.save();
    ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.05)`;
    ctx.lineWidth = 1;
    roundRect(ctx, 0.5, 0.5, W - 1, H - 1, RAD);
    ctx.stroke();
    ctx.restore();

    return canvas.toBuffer('image/png');
}

module.exports = { generateLevelUpCard };
