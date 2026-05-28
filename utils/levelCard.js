'use strict';

/**
 * levelCard.js — 934×340 leveling card with avatar, level/rank
 * badges, XP progress bar, and three stat boxes.
 *
 * Layout (top-down):
 *   <:Caretright:1473038207221502106> Layered background (gradient + glow + diagonal lines)
 *   <:Caretright:1473038207221502106> Avatar (left) with conic accent ring
 *   <:Caretright:1473038207221502106> Username + handle (next to avatar)
 *   <:Caretright:1473038207221502106> RANK + LEVEL pills (top-right)
 *   <:Caretright:1473038207221502106> EXPERIENCE bar (full width below header)
 *   <:Caretright:1473038207221502106> Three stat boxes: TOTAL XP, MESSAGES, VOICE TIME
 *   <:Caretright:1473038207221502106> User-ID in the corner + xNico watermark
 */

const { createCanvas } = require('@napi-rs/canvas');
const imageCache = require('./imageCache');
const {
    DESIGN, drawRoundedRect, drawText, truncateText, fitText,
    drawGradientBackground, drawDiagonalLines, drawAmbientGlow,
    drawBox, drawProgressBar, drawStatBox, drawConicAvatarRing,
    formatNumber, hexToRgb, rgba,
    getFontHelpers, drawNicoBranding,
} = require('./canvasDesign');

const STYLE_THEMES = {
    default: { bg: '#0d0d1a', accent: '#7c3aed', secondary: '#06b6d4', text: '#f0f0f5' },
    minimal: { bg: '#161618', accent: '#a1a1aa', secondary: '#71717a', text: '#fafafa' },
    neon:    { bg: '#020617', accent: '#a855f7', secondary: '#22d3ee', text: '#e0f2fe' },
    classic: { bg: '#1a2332', accent: '#818cf8', secondary: '#38bdf8', text: '#e2e8f0' },
    modern:  { bg: '#0a0a0a', accent: '#22c55e', secondary: '#2dd4bf', text: '#f5f5f4' },
};

const STAT_ICONS = {
    xp:      '<:Lightning:1473038797540298792>',
    message: '<:Chat:1473038936241864865>',
    voice:   '<:Volumeup:1473039290136002844>',
};

class LevelCard {
    constructor() {
        this.width = 934;
        this.height = 340;
        this.backgroundColor = '#0d0d1a';
        this.accentColor = '#7c3aed';
        this.secondaryAccent = '#06b6d4';
        this.textColor = '#f0f0f5';
        this.progressBarColor = this.accentColor;
        this.backgroundImage = null;
        this.backgroundOpacity = 0.35;
        this.bio = null;
        this.cardStyle = 'default';
        this.fontFamily = 'Inter';
        this._fh = getFontHelpers('Inter');
    }

    /* ─────────── chainable setters ─────────── */
    setFontFamily(family)       { this.fontFamily = family || 'Inter'; this._fh = getFontHelpers(this.fontFamily); return this; }
    setBackground(c)            { this.backgroundColor = c; return this; }
    setBackgroundImage(url)     { this.backgroundImage = url; return this; }
    setProgressBarColor(c)      { this.progressBarColor = c; this.accentColor = c; return this; }
    setAccentColor(c)           { this.accentColor = c; return this; }
    setTextColor(c)             { this.textColor = c; return this; }
    setBio(b)                   { this.bio = b; return this; }
    setBackgroundOpacity(o)     { this.backgroundOpacity = Math.max(0, Math.min(1, o)); return this; }
    setCardStyle(style) {
        this.cardStyle = style || 'default';
        const t = STYLE_THEMES[this.cardStyle.toLowerCase()] || STYLE_THEMES.default;
        if (!this.backgroundImage) this.backgroundColor = t.bg;
        this.accentColor = t.accent;
        this.progressBarColor = t.accent;
        this.secondaryAccent = t.secondary;
        this.textColor = t.text;
        return this;
    }

    /* ─────────── per-family fonts ─────────── */
    _font(s)     { return this._fh.getFont(s); }
    _medium(s)   { return this._fh.getMediumFont(s); }
    _semi(s)     { return this._fh.getSemiBoldFont(s); }
    _bold(s)     { return this._fh.getBoldFont(s); }

    async generate(user, data = {}) {
        const W = this.width, H = this.height;
        const PAD = DESIGN.padding;

        data = {
            level: 1, rank: 0, xpProgress: 0, xpNeeded: 100,
            totalXp: 0, messagesCount: 0, voiceTime: 0, ...data,
        };
        for (const k of Object.keys(data)) {
            if (typeof data[k] === 'number' || ['level','rank','xpProgress','xpNeeded','totalXp','messagesCount','voiceTime'].includes(k)) {
                data[k] = Number(data[k]) || 0;
            }
        }

        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');

        /* ── 1. Clipped background ── */
        ctx.save();
        drawRoundedRect(ctx, 0, 0, W, H, DESIGN.borderRadius);
        ctx.clip();

        const bgGrad = ctx.createLinearGradient(0, 0, W, H);
        bgGrad.addColorStop(0,   this.backgroundColor);
        bgGrad.addColorStop(0.4, DESIGN.colors.bgSecondary);
        bgGrad.addColorStop(0.7, DESIGN.colors.bgTertiary);
        bgGrad.addColorStop(1,   this.backgroundColor);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        if (this.backgroundImage) {
            try {
                const bg = await imageCache.loadWithCache(this.backgroundImage, 5000);
                if (bg) {
                    ctx.globalAlpha = this.backgroundOpacity;
                    const scale = Math.max(W / bg.width, H / bg.height);
                    const x = (W - bg.width * scale) / 2;
                    const y = (H - bg.height * scale) / 2;
                    ctx.drawImage(bg, x, y, bg.width * scale, bg.height * scale);
                    ctx.globalAlpha = 1;

                    const overlay = ctx.createLinearGradient(0, 0, 0, H);
                    overlay.addColorStop(0,    'rgba(13, 13, 26, 0.7)');
                    overlay.addColorStop(0.5,  'rgba(13, 13, 26, 0.6)');
                    overlay.addColorStop(1,    'rgba(13, 13, 26, 0.8)');
                    ctx.fillStyle = overlay;
                    ctx.fillRect(0, 0, W, H);
                }
            } catch {}
        }

        // Two ambient glows (left over avatar, right over level badge)
        drawAmbientGlow(ctx, 140, H / 2, 300, this.accentColor, 0.10);
        drawAmbientGlow(ctx, W - 150, 60, 200, this.secondaryAccent, 0.06);

        ctx.save();
        ctx.globalAlpha = 0.04;
        drawDiagonalLines(ctx, W, H, this.accentColor, 50);
        ctx.restore();

        ctx.restore();

        /* ── 2. Avatar ── */
        const avatarSize = 130;
        const avatarX = PAD + 5;
        const avatarY = (H - avatarSize) / 2;

        let avatar = null;
        try {
            avatar = await imageCache.loadWithCache(
                user.displayAvatarURL({ extension: 'png', size: 512 }),
                5000
            );
        } catch {}
        await drawConicAvatarRing(
            ctx, avatar, avatarX, avatarY, avatarSize,
            this.accentColor, this.secondaryAccent, this.backgroundColor
        );

        /* ── 3. Header text ── */
        const textX = avatarX + avatarSize + 28;

        ctx.font = this._bold(DESIGN.fonts.title);
        ctx.fillStyle = this.textColor;
        const username = truncateText(ctx, user.globalName || user.username, 290);
        await drawText(ctx, username, textX, 48);

        ctx.font = this._font(DESIGN.fonts.subtitle);
        ctx.fillStyle = DESIGN.colors.textMuted;
        await drawText(ctx, `@${user.username}`, textX, 67);

        /* ── 4. Rank + Level pills (top-right) ── */
        const pillY = 20;
        const pillH = 48;
        const pillW = 82;
        const pillGap = 10;

        if (data.rank > 0) {
            const rx = W - PAD - pillW;
            drawBox(ctx, rx, pillY, pillW, pillH, this.secondaryAccent, 8);

            ctx.font = this._semi(DESIGN.fonts.label);
            ctx.fillStyle = DESIGN.colors.textMuted;
            ctx.textAlign = 'center';
            ctx.fillText('RANK', rx + pillW / 2, pillY + 16);

            const rankText = `#${data.rank}`;
            const rsize = fitText(ctx, rankText, pillW - 16, 19, 13);
            ctx.font = this._bold(rsize);
            ctx.fillStyle = this.secondaryAccent;
            ctx.fillText(rankText, rx + pillW / 2, pillY + 38);
            ctx.textAlign = 'left';
        }

        const lx = W - PAD - pillW - (data.rank > 0 ? pillW + pillGap : 0);
        drawBox(ctx, lx, pillY, pillW, pillH, this.accentColor, 8);

        ctx.font = this._semi(DESIGN.fonts.label);
        ctx.fillStyle = DESIGN.colors.textMuted;
        ctx.textAlign = 'center';
        ctx.fillText('LEVEL', lx + pillW / 2, pillY + 16);

        const lvlText = String(data.level);
        const lsize = fitText(ctx, lvlText, pillW - 16, 19, 13);
        ctx.font = this._bold(lsize);
        ctx.fillStyle = this.accentColor;
        ctx.fillText(lvlText, lx + pillW / 2, pillY + 38);
        ctx.textAlign = 'left';

        /* ── 5. XP progress bar ── */
        const barX = textX;
        const barY = 95;
        const barW = W - textX - PAD;
        const barH = 18;

        ctx.font = this._semi(DESIGN.fonts.label);
        ctx.fillStyle = DESIGN.colors.textMuted;
        ctx.fillText('EXPERIENCE', barX, barY - 7);

        const xpText = `${formatNumber(data.xpProgress)} / ${formatNumber(data.xpNeeded)} XP`;
        ctx.textAlign = 'right';
        ctx.fillText(xpText, barX + barW, barY - 7);
        ctx.textAlign = 'left';

        const progress = data.xpNeeded > 0 ? data.xpProgress / data.xpNeeded : 0;
        drawProgressBar(ctx, barX, barY, barW, barH, progress, this.accentColor, this.secondaryAccent);

        // Percentage label
        ctx.font = this._bold(9);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(Math.min(progress, 1) * 100)}%`, barX + barW / 2, barY + barH / 2 + 3);
        ctx.textAlign = 'left';

        /* ── 6. Stat boxes ── */
        const statsY = barY + barH + 22;
        const statGap = 10;
        const statW = (barW - statGap * 2) / 3;
        const statH = 62;

        const stats = [
            { label: 'TOTAL XP',   value: formatNumber(data.totalXp),      icon: STAT_ICONS.xp,      color: this.accentColor },
            { label: 'MESSAGES',   value: formatNumber(data.messagesCount),icon: STAT_ICONS.message, color: this.secondaryAccent },
            { label: 'VOICE TIME', value: data.voiceTime > 0
                ? `${Math.floor(data.voiceTime / 3600)}h ${Math.floor((data.voiceTime % 3600) / 60)}m`
                : '0h 0m',
              icon: STAT_ICONS.voice, color: '#a78bfa' },
        ];

        for (let i = 0; i < stats.length; i++) {
            const s = stats[i];
            await drawStatBox(ctx, {
                x: barX + i * (statW + statGap), y: statsY,
                width: statW, height: statH, color: s.color,
                icon: s.icon, label: s.label, value: s.value,
                labelFont: this._semi(DESIGN.fonts.tiny),
                valueFont: this._bold(DESIGN.fonts.value),
            });
        }

        /* ── 7. Footer ── */
        ctx.font = this._font(DESIGN.fonts.tiny);
        ctx.fillStyle = DESIGN.colors.textDim;
        ctx.textAlign = 'right';
        ctx.fillText(`ID: ${user.id}`, W - 16, H - 10);
        ctx.textAlign = 'left';

        // Outer hairline border
        ctx.save();
        ctx.strokeStyle = rgba(this.accentColor, 0.08);
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, 0.5, 0.5, W - 1, H - 1, DESIGN.borderRadius);
        ctx.stroke();
        ctx.restore();

        await drawNicoBranding(ctx, W, H, this.accentColor);

        return canvas.toBuffer('image/png');
    }
}

module.exports = LevelCard;
