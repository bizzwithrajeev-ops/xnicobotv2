'use strict';

/**
 * statsCard.js — 880×420 user stats summary card.
 *
 * Five stat boxes (Messages / Voice / XP / Invites / Commands) plus
 * a header with avatar, username, scope label and a RANK pill.
 *
 * Uses the shared canvasDesign primitives so emoji icons are drawn
 * at the proper size (separate drawImage at 18px) rather than being
 * inlined into the 9px label text — which is what was making the
 * icons appear tiny / displaced before.
 */

const { createCanvas } = require('@napi-rs/canvas');
const imageCache = require('./imageCache');
const { registerAllFonts, getFontHelpers } = require('./fontRegistry');
const {
    DESIGN, hexToRgb, formatNumber, formatVoiceTime,
    drawRoundedRect, drawText, drawGradientBackground, drawDiagonalLines,
    drawAmbientGlow, drawConicAvatarRing, drawBox, drawStatBox,
    drawNicoBranding,
} = require('./canvasDesign');

try { registerAllFonts(); } catch {}

const STAT_ICONS = {
    messages: '<:Bookopen:1473038576391557130>',
    voice:    '<:Volumeup:1473039290136002844>',
    xp:       '<:Lightning:1473038797540298792>',
    invites:  '<:Bullhorn:1473038903157199093>',
    commands: '<:Gamepad:1473039216429498409>',
    rank:     '<:Award:1473038391632203887>',
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
    fontFamily,
}) {
    const fh = getFontHelpers(fontFamily || 'Inter');
    const F  = (s) => fh.getFont(s);
    const FM = (s) => fh.getMediumFont(s);
    const FSB = (s) => fh.getSemiBoldFont(s);
    const FB = (s) => fh.getBoldFont(s);

    const W = 880;
    const H = 420;
    const PAD = DESIGN.padding;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    /* ── Background ── */
    ctx.save();
    drawRoundedRect(ctx, 0, 0, W, H, DESIGN.borderRadius);
    ctx.clip();

    drawGradientBackground(ctx, W, H, DESIGN.colors.bg, DESIGN.colors.bgSecondary);

    ctx.save();
    ctx.globalAlpha = 0.03;
    drawDiagonalLines(ctx, W, H, DESIGN.colors.accent, 45);
    ctx.restore();

    drawAmbientGlow(ctx, 0, 0, 350, DESIGN.colors.accent, 0.08);
    drawAmbientGlow(ctx, W, H, 300, DESIGN.colors.secondary, 0.06);

    /* ── Avatar + name ── */
    const avatarSize = 90;
    const avatarX = PAD;
    const avatarY = PAD;

    let avatar = null;
    if (avatarURL) { try { avatar = await imageCache.loadWithCache(avatarURL, 5000); } catch {} }
    await drawConicAvatarRing(
        ctx, avatar, avatarX, avatarY, avatarSize,
        DESIGN.colors.accent, DESIGN.colors.secondary, DESIGN.colors.bg
    );

    const nameX = avatarX + avatarSize + 24;
    const nameY = avatarY + 30;

    ctx.font = FB(26);
    ctx.fillStyle = DESIGN.colors.text;
    let displayName = username || 'Unknown User';
    if (ctx.measureText(displayName).width > 380) {
        while (ctx.measureText(displayName + '...').width > 380 && displayName.length > 0) {
            displayName = displayName.slice(0, -1);
        }
        displayName += '...';
    }
    ctx.fillText(displayName, nameX, nameY);

    ctx.font = F(13);
    ctx.fillStyle = DESIGN.colors.textMuted;
    const scopeText = scope === 'global'
        ? `Global Stats${guildsActive > 0 ? ` · Active in ${guildsActive} servers` : ''}`
        : (scopeLabel || 'Server Stats');
    ctx.fillText(scopeText, nameX, nameY + 22);

    /* ── Rank pill (top-right) ── */
    const rankBoxX = W - PAD - 80;
    const rankBoxY = avatarY + 10;
    const rankText = typeof rank === 'number' ? `#${rank}` : rank;

    drawBox(ctx, rankBoxX, rankBoxY, 70, 55, DESIGN.colors.accent, 8);
    ctx.font = FSB(9);
    ctx.fillStyle = DESIGN.colors.textDim;
    ctx.textAlign = 'center';
    ctx.fillText('RANK', rankBoxX + 35, rankBoxY + 18);
    ctx.font = FB(18);
    ctx.fillStyle = DESIGN.colors.accent;
    ctx.fillText(rankText, rankBoxX + 35, rankBoxY + 42);
    ctx.textAlign = 'left';

    /* ── Divider ── */
    ctx.strokeStyle = DESIGN.colors.accent + '20';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, avatarY + avatarSize + 20);
    ctx.lineTo(W - PAD, avatarY + avatarSize + 20);
    ctx.stroke();

    /* ── Stat boxes (row 1) ── */
    const statsY = avatarY + avatarSize + 40;
    const boxW = (W - PAD * 2 - 20) / 3;
    const boxH = 80;
    const gap = 10;

    const row1 = [
        { icon: STAT_ICONS.messages, label: 'MESSAGES',  value: formatNumber(totalMessages),         color: '#5865F2' },
        { icon: STAT_ICONS.voice,    label: 'VOICE TIME',value: formatVoiceTime(voiceTime),          color: '#a78bfa' },
        { icon: STAT_ICONS.xp,       label: 'XP / LEVEL',value: `${formatNumber(xp)} / Lv.${level}`, color: '#fbbf24' },
    ];

    for (let i = 0; i < row1.length; i++) {
        const s = row1[i];
        await drawStatBox(ctx, {
            x: PAD + i * (boxW + gap), y: statsY,
            width: boxW, height: boxH, color: s.color,
            icon: s.icon, label: s.label, value: s.value,
            labelFont: FSB(10),
            valueFont: FB(22),
            valueColor: DESIGN.colors.text,
            iconSize: 18,
            iconPadding: 14,
        });
    }

    /* ── Stat boxes (row 2) ── */
    const stats2Y = statsY + boxH + gap;
    const box2W = (W - PAD * 2 - gap) / 2;

    const row2 = [
        { icon: STAT_ICONS.invites,  label: 'INVITES',   value: formatNumber(invites),      color: '#34d399' },
        { icon: STAT_ICONS.commands, label: 'COMMANDS',  value: formatNumber(commandsUsed), color: '#f472b6' },
    ];

    for (let i = 0; i < row2.length; i++) {
        const s = row2[i];
        await drawStatBox(ctx, {
            x: PAD + i * (box2W + gap), y: stats2Y,
            width: box2W, height: boxH, color: s.color,
            icon: s.icon, label: s.label, value: s.value,
            labelFont: FSB(10),
            valueFont: FB(22),
            valueColor: DESIGN.colors.text,
            iconSize: 18,
            iconPadding: 14,
        });
    }

    /* ── Footer ── */
    ctx.font = F(10);
    ctx.fillStyle = DESIGN.colors.textDim;
    ctx.textAlign = 'center';
    const footerScope = scope === 'global' ? 'Global' : 'Server';
    await drawText(ctx, `${footerScope} Statistics`, W / 2, H - 14, true);
    ctx.textAlign = 'left';

    await drawNicoBranding(ctx, W, H);

    ctx.restore();
    return canvas.toBuffer('image/png');
}

module.exports = { generateStatsCard };
