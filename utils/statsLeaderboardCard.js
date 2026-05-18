'use strict';

const { createCanvas } = require('@napi-rs/canvas');
const imageCache = require('./imageCache');
const { registerAllFonts, getFontHelpers } = require('./fontRegistry');
const {
    DESIGN, getFont: _getFont, getMediumFont: _getMediumFont, getBoldFont: _getBoldFont, getSemiBoldFont: _getSemiBoldFont,
    hexToRgb, formatNumber, formatVoiceTime,
    drawRoundedRect, drawText, drawGradientBackground, drawDiagonalLines,
    drawNicoBranding
} = require('./canvasDesign');

try { registerAllFonts(); } catch {}

const STAT_TYPE_CONFIG = {
    messages: { label: 'Messages', emoji: '<:Bookopen:1473038576391557130>', color: '#5865F2', format: v => `${formatNumber(v)} msgs` },
    voice: { label: 'Voice Time', emoji: '<:Volumeup:1473039290136002844>', color: '#a78bfa', format: v => formatVoiceTime(v) },
    xp: { label: 'XP', emoji: '<a:loading:1506015728871149770>', color: '#fbbf24', format: v => `${formatNumber(v)} XP` },
    invites: { label: 'Invites', emoji: '<:Bullhorn:1473038903157199093>', color: '#34d399', format: v => `${formatNumber(v)} invites` },
    economy: { label: 'Net Worth', emoji: '<:Sketch:1473038248493453352>', color: '#f59e0b', format: v => `${formatNumber(v)} coins` },
    leveling: { label: 'Leveling', emoji: '<:Award:1473038391632203887>', color: '#7c3aed', format: v => `Lv ${Math.floor(0.1 * Math.sqrt(v))}  ·  ${formatNumber(v)} XP` }
};

const MEDAL_COLORS = ['#fbbf24', '#94a3b8', '#f97316'];

async function generateStatsLeaderboard({
    title = 'Leaderboard',
    iconURL = null,
    entries = [],
    statType = 'messages',
    scope = 'server',
    page = 0,
    totalPages = 1,
    fontFamily
}) {
    const _fh = getFontHelpers(fontFamily || 'Inter');
    const getFont = (size) => _fh.getFont(size);
    const getMediumFont = (size) => _fh.getMediumFont(size);
    const getBoldFont = (size) => _fh.getBoldFont(size);
    const getSemiBoldFont = (size) => _fh.getSemiBoldFont(size);
    const cfg = STAT_TYPE_CONFIG[statType] || STAT_TYPE_CONFIG.messages;
    const count = entries.length;
    const rowHeight = 68;
    const rowGap = 6;
    const headerHeight = 100;
    const footerHeight = 45;
    const pad = 40;
    const width = 880;
    const height = headerHeight + (count * (rowHeight + rowGap)) + footerHeight + pad;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.save();
    drawRoundedRect(ctx, 0, 0, width, height, 24);
    ctx.clip();

    drawGradientBackground(ctx, width, height, DESIGN.colors.bg, DESIGN.colors.bgSecondary);

    ctx.save();
    ctx.globalAlpha = 0.03;
    drawDiagonalLines(ctx, width, height, cfg.color, 45);
    ctx.restore();

    const rgb = hexToRgb(cfg.color);
    ctx.save();
    ctx.globalAlpha = 0.08;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 400);
    glow.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 500, 400);
    ctx.restore();

    const headerY = pad - 10;
    let iconX = pad;

    if (iconURL) {
        try {
            const icon = await imageCache.loadWithCache(iconURL, 5000);
            if (icon) {
                const iconSize = 42;
                ctx.save();
                ctx.beginPath();
                ctx.arc(iconX + iconSize / 2, headerY + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(icon, iconX, headerY, iconSize, iconSize);
                ctx.restore();

                ctx.strokeStyle = cfg.color + '60';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(iconX + iconSize / 2, headerY + iconSize / 2, iconSize / 2 + 3, 0, Math.PI * 2);
                ctx.stroke();

                iconX += iconSize + 14;
            }
        } catch {}
    }

    ctx.font = getBoldFont(24);
    ctx.fillStyle = DESIGN.colors.text;
    await drawText(ctx, `${cfg.emoji}  ${title}`, iconX, headerY + 26);

    const scopeIcon = scope === 'global' ? '🌍' : '🏠';
    ctx.font = getFont(12);
    ctx.fillStyle = DESIGN.colors.textMuted;
    ctx.fillText(`${scopeIcon} ${scope === 'global' ? 'Global' : 'Server'} · Sorted by ${cfg.label} · Page ${page + 1}/${totalPages}`, iconX, headerY + 46);

    const colHeaderY = headerHeight - 4;
    ctx.font = getSemiBoldFont(10);
    ctx.fillStyle = DESIGN.colors.textDim;
    ctx.fillText('RANK', pad + 4, colHeaderY);
    ctx.fillText('USER', pad + 74, colHeaderY);
    ctx.textAlign = 'right';
    ctx.fillText(cfg.label.toUpperCase(), width - pad, colHeaderY);
    ctx.textAlign = 'left';

    ctx.strokeStyle = 'rgba(124, 58, 237, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, colHeaderY + 8);
    ctx.lineTo(width - pad, colHeaderY + 8);
    ctx.stroke();

    for (let i = 0; i < count; i++) {
        const entry = entries[i];
        const globalIdx = page * 10 + i;
        const rowY = headerHeight + 10 + i * (rowHeight + rowGap);
        const rowX = pad - 10;
        const rowW = width - (pad * 2) + 20;
        const isTop3 = globalIdx < 3;

        const rowBg = isTop3 ? 'rgba(35, 35, 80, 0.8)' : (i % 2 === 0 ? 'rgba(25, 25, 55, 0.7)' : 'rgba(30, 30, 65, 0.5)');
        ctx.fillStyle = rowBg;
        drawRoundedRect(ctx, rowX, rowY, rowW, rowHeight, 12);
        ctx.fill();

        if (isTop3) {
            const medalColor = MEDAL_COLORS[globalIdx];
            ctx.strokeStyle = medalColor + '40';
            ctx.lineWidth = 1.5;
            drawRoundedRect(ctx, rowX, rowY, rowW, rowHeight, 12);
            ctx.stroke();

            const medalRgb = hexToRgb(medalColor);
            ctx.save();
            ctx.globalAlpha = 0.04;
            const medalGlow = ctx.createRadialGradient(rowX + 35, rowY + rowHeight / 2, 0, rowX + 35, rowY + rowHeight / 2, 80);
            medalGlow.addColorStop(0, `rgba(${medalRgb.r}, ${medalRgb.g}, ${medalRgb.b}, 1)`);
            medalGlow.addColorStop(1, 'transparent');
            ctx.fillStyle = medalGlow;
            drawRoundedRect(ctx, rowX, rowY, rowW, rowHeight, 12);
            ctx.fill();
            ctx.restore();
        }

        const rankCenterX = pad + 18;
        const rankCenterY = rowY + rowHeight / 2;

        if (isTop3) {
            const medalColor = MEDAL_COLORS[globalIdx];
            const medalRgb = hexToRgb(medalColor);

            ctx.save();
            ctx.shadowColor = medalColor;
            ctx.shadowBlur = 10;
            const circleGrad = ctx.createRadialGradient(rankCenterX, rankCenterY, 0, rankCenterX, rankCenterY, 16);
            circleGrad.addColorStop(0, `rgba(${medalRgb.r}, ${medalRgb.g}, ${medalRgb.b}, 0.3)`);
            circleGrad.addColorStop(1, `rgba(${medalRgb.r}, ${medalRgb.g}, ${medalRgb.b}, 0.1)`);
            ctx.fillStyle = circleGrad;
            ctx.beginPath();
            ctx.arc(rankCenterX, rankCenterY, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = medalColor + '80';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(rankCenterX, rankCenterY, 16, 0, Math.PI * 2);
            ctx.stroke();

            ctx.font = getBoldFont(15);
            ctx.fillStyle = medalColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${globalIdx + 1}`, rankCenterX, rankCenterY);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        } else {
            ctx.font = getSemiBoldFont(14);
            ctx.fillStyle = DESIGN.colors.textDim;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${globalIdx + 1}`, rankCenterX, rankCenterY);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        }

        const avatarX = pad + 48;
        const avatarY = rowY + (rowHeight - 44) / 2;
        const avatarR = 22;

        if (entry.avatarURL) {
            try {
                const av = await imageCache.loadWithCache(entry.avatarURL, 3000);
                if (av) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(avatarX + avatarR, avatarY + avatarR, avatarR, 0, Math.PI * 2);
                    ctx.clip();
                    ctx.drawImage(av, avatarX, avatarY, 44, 44);
                    ctx.restore();

                    if (isTop3) {
                        ctx.strokeStyle = MEDAL_COLORS[globalIdx] + '70';
                        ctx.lineWidth = 2;
                    } else {
                        ctx.strokeStyle = cfg.color + '30';
                        ctx.lineWidth = 1.5;
                    }
                    ctx.beginPath();
                    ctx.arc(avatarX + avatarR, avatarY + avatarR, avatarR + 2, 0, Math.PI * 2);
                    ctx.stroke();
                }
            } catch {}
        } else {
            ctx.fillStyle = cfg.color + '30';
            ctx.beginPath();
            ctx.arc(avatarX + avatarR, avatarY + avatarR, avatarR, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = getBoldFont(18);
            ctx.fillStyle = DESIGN.colors.textMuted;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', avatarX + avatarR, avatarY + avatarR);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        }

        const nameX = avatarX + 44 + 14;
        ctx.font = getSemiBoldFont(15);
        ctx.fillStyle = isTop3 ? DESIGN.colors.text : '#e5e7eb';
        let name = entry.username || 'Unknown User';
        if (ctx.measureText(name).width > 350) {
            while (ctx.measureText(name + '...').width > 350 && name.length > 0) name = name.slice(0, -1);
            name += '...';
        }
        ctx.fillText(name, nameX, rowY + rowHeight / 2 + 5);

        ctx.font = getBoldFont(16);
        ctx.fillStyle = cfg.color;
        ctx.textAlign = 'right';
        ctx.fillText(cfg.format(entry.value), width - pad - 10, rowY + rowHeight / 2 + 5);
        ctx.textAlign = 'left';
    }

    const footerY = height - footerHeight + 10;
    ctx.font = getFont(10);
    ctx.fillStyle = DESIGN.colors.textDim;
    ctx.textAlign = 'center';
    ctx.fillText(`${scope === 'global' ? 'Global' : 'Server'} ${cfg.label} Leaderboard`, width / 2, footerY + 10);
    ctx.textAlign = 'left';

    await drawNicoBranding(ctx, width, height);

    ctx.restore();
    return canvas.toBuffer('image/png');
}

module.exports = { generateStatsLeaderboard, STAT_TYPE_CONFIG };
