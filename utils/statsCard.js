'use strict';

const { createCanvas } = require('@napi-rs/canvas');
const imageCache = require('./imageCache');
const { registerAllFonts, getFontHelpers } = require('./fontRegistry');
const {
    DESIGN, getFont: _getFont, getMediumFont: _getMediumFont, getBoldFont: _getBoldFont, getSemiBoldFont: _getSemiBoldFont,
    hexToRgb, formatNumber, formatVoiceTime,
    drawRoundedRect, drawText, drawGradientBackground, drawDiagonalLines,
    drawConicAvatarRing, drawBox, drawNicoBranding
} = require('./canvasDesign');

try { registerAllFonts(); } catch {}

const STAT_EMOJIS = {
    messages: '<:Bookopen:1473038576391557130>',
    voice: '<:Volumeup:1473039290136002844>',
    xp: '<:Lightning:1473038797540298792>',
    invites: '<:Bullhorn:1473038903157199093>',
    commands: '<:Gamepad:1473039216429498409>',
    rank: '<:Award:1473038391632203887>'
};

async function generateStatsCard({
    username,
    avatarURL,
    totalMessages = 0,
    voiceTime = 0,
    xp = 0,
    level = 0,
    invites = 0,
    commandsUsed = 0,
    rank = 'N/A',
    scope = 'server',
    scopeLabel = '',
    guildsActive = 0,
    fontFamily
}) {
    const _fh = getFontHelpers(fontFamily || 'Inter');
    const getFont = (size) => _fh.getFont(size);
    const getMediumFont = (size) => _fh.getMediumFont(size);
    const getBoldFont = (size) => _fh.getBoldFont(size);
    const getSemiBoldFont = (size) => _fh.getSemiBoldFont(size);
    const width = 880;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.save();
    drawRoundedRect(ctx, 0, 0, width, height, DESIGN.borderRadius);
    ctx.clip();

    drawGradientBackground(ctx, width, height, DESIGN.colors.bg, DESIGN.colors.bgSecondary);

    ctx.save();
    ctx.globalAlpha = 0.03;
    drawDiagonalLines(ctx, width, height, DESIGN.colors.accent, 45);
    ctx.restore();

    const rgb = hexToRgb(DESIGN.colors.accent);
    ctx.save();
    ctx.globalAlpha = 0.08;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 350);
    glow.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 400, 350);
    ctx.restore();

    const rgb2 = hexToRgb(DESIGN.colors.secondary);
    ctx.save();
    ctx.globalAlpha = 0.06;
    const glow2 = ctx.createRadialGradient(width, height, 0, width, height, 300);
    glow2.addColorStop(0, `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, 1)`);
    glow2.addColorStop(1, 'transparent');
    ctx.fillStyle = glow2;
    ctx.fillRect(width - 350, height - 300, 350, 300);
    ctx.restore();

    const pad = DESIGN.padding;
    const avatarSize = 90;
    const avatarX = pad;
    const avatarY = pad;

    let avatar = null;
    if (avatarURL) {
        try { avatar = await imageCache.loadWithCache(avatarURL, 5000); } catch {}
    }
    await drawConicAvatarRing(ctx, avatar, avatarX, avatarY, avatarSize, DESIGN.colors.accent, DESIGN.colors.secondary, DESIGN.colors.bg);

    const nameX = avatarX + avatarSize + 24;
    const nameY = avatarY + 30;

    ctx.font = getBoldFont(26);
    ctx.fillStyle = DESIGN.colors.text;
    let displayName = username || 'Unknown User';
    if (ctx.measureText(displayName).width > 380) {
        while (ctx.measureText(displayName + '...').width > 380 && displayName.length > 0) {
            displayName = displayName.slice(0, -1);
        }
        displayName += '...';
    }
    ctx.fillText(displayName, nameX, nameY);

    ctx.font = getFont(13);
    ctx.fillStyle = DESIGN.colors.textMuted;
    const scopeText = scope === 'global'
        ? `Global Stats${guildsActive > 0 ? ` · Active in ${guildsActive} servers` : ''}`
        : (scopeLabel || 'Server Stats');
    ctx.fillText(scopeText, nameX, nameY + 22);

    const rankBadgeX = width - pad - 80;
    const rankBadgeY = avatarY + 10;
    const rankText = typeof rank === 'number' ? `#${rank}` : rank;

    drawBox(ctx, rankBadgeX, rankBadgeY, 70, 55, DESIGN.colors.accent, 8);
    ctx.font = getFont(9);
    ctx.fillStyle = DESIGN.colors.textDim;
    ctx.textAlign = 'center';
    ctx.fillText('RANK', rankBadgeX + 35, rankBadgeY + 18);
    ctx.font = getBoldFont(18);
    ctx.fillStyle = DESIGN.colors.accent;
    ctx.fillText(rankText, rankBadgeX + 35, rankBadgeY + 42);
    ctx.textAlign = 'left';

    ctx.strokeStyle = DESIGN.colors.accent + '20';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, avatarY + avatarSize + 20);
    ctx.lineTo(width - pad, avatarY + avatarSize + 20);
    ctx.stroke();

    const statsY = avatarY + avatarSize + 40;
    const boxW = (width - pad * 2 - 20) / 3;
    const boxH = 80;
    const gap = 10;

    const stats = [
        { emoji: STAT_EMOJIS.messages, label: 'MESSAGES', value: formatNumber(totalMessages), color: '#5865F2' },
        { emoji: STAT_EMOJIS.voice, label: 'VOICE TIME', value: formatVoiceTime(voiceTime), color: '#a78bfa' },
        { emoji: STAT_EMOJIS.xp, label: 'XP / LEVEL', value: `${formatNumber(xp)} / Lv.${level}`, color: '#fbbf24' }
    ];

    const stats2 = [
        { emoji: STAT_EMOJIS.invites, label: 'INVITES', value: formatNumber(invites), color: '#34d399' },
        { emoji: STAT_EMOJIS.commands, label: 'COMMANDS', value: formatNumber(commandsUsed), color: '#f472b6' }
    ];

    for (let i = 0; i < stats.length; i++) {
        const s = stats[i];
        const bx = pad + i * (boxW + gap);
        drawBox(ctx, bx, statsY, boxW, boxH, s.color, 8);

        ctx.font = getFont(9);
        ctx.fillStyle = DESIGN.colors.textDim;
        await drawText(ctx, `${s.emoji}  ${s.label}`, bx + 14, statsY + 22);

        ctx.font = getBoldFont(22);
        ctx.fillStyle = DESIGN.colors.text;
        ctx.fillText(s.value, bx + 14, statsY + 56);
    }

    const stats2Y = statsY + boxH + gap;
    const box2W = (width - pad * 2 - gap) / 2;

    for (let i = 0; i < stats2.length; i++) {
        const s = stats2[i];
        const bx = pad + i * (box2W + gap);
        drawBox(ctx, bx, stats2Y, box2W, boxH, s.color, 8);

        ctx.font = getFont(9);
        ctx.fillStyle = DESIGN.colors.textDim;
        await drawText(ctx, `${s.emoji}  ${s.label}`, bx + 14, stats2Y + 22);

        ctx.font = getBoldFont(22);
        ctx.fillStyle = DESIGN.colors.text;
        ctx.fillText(s.value, bx + 14, stats2Y + 56);
    }

    ctx.font = getFont(10);
    ctx.fillStyle = DESIGN.colors.textDim;
    ctx.textAlign = 'center';
    const footerScope = scope === 'global' ? 'Global' : 'Server';
    await drawText(ctx, `${footerScope} Statistics`, width / 2, height - 14, true);
    ctx.textAlign = 'left';

    await drawNicoBranding(ctx, width, height);

    ctx.restore();
    return canvas.toBuffer('image/png');
}

module.exports = { generateStatsCard };
