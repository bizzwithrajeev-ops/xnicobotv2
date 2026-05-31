'use strict';

/**
 * levelCard.js — 950×320 leveling card (ProBot-style).
 *
 * Layout
 * ──────
 *   ╔══════════════════════════════════════════════════════════════════════╗
 *   ║ [layered gradient + glow + diagonal lattice]                         ║
 *   ║                                                                      ║
 *   ║   ⬢ Avatar 130px      Username TheBrave                  ┌────────┐  ║
 *   ║    (conic ring)       @username · #1234                  │ LEVEL  │  ║
 *   ║                                                          │   42   │  ║
 *   ║                                                          ├────────┤  ║
 *   ║                       ▌  EXPERIENCE                      │  RANK  │  ║
 *   ║                       ▌  ▓▓▓▓▓▓▓▓░░░░  62%               │   #5   │  ║
 *   ║                       ▌  62,300 / 100,000 XP             └────────┘  ║
 *   ║                                                                      ║
 *   ║  ╭───────────╮ ╭───────────╮ ╭───────────╮                           ║
 *   ║  │ TOTAL XP  │ │ MESSAGES  │ │ VOICE     │                           ║
 *   ║  │  62.3K    │ │  1,284    │ │  12h 34m  │                           ║
 *   ║  ╰───────────╯ ╰───────────╯ ╰───────────╯                           ║
 *   ║                                                                      ║
 *   ║  -# ID:1234567890  ·  xNico                                          ║
 *   ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Goals vs the previous version
 * ─────────────────────────────
 *   • Bigger LEVEL/RANK badges, stacked vertically on the right so the
 *     two most-important stats read as the "score" of the card.
 *   • XP bar gets its own labelled row with both percent + raw XP shown,
 *     and a tip-glow that traces along the fill so the bar doesn't read
 *     flat at 100%.
 *   • Stats bar becomes three identical rounded chips with subtle accent
 *     borders + iconified labels — much cleaner than the previous square
 *     boxes that drew attention away from the username.
 *   • Username is allowed up to 380px width with a real truncation pass.
 *     Long display names no longer crowd into the level pill.
 *   • Optional VIP/streak chip rendered above the username when present.
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
        this.width = 950;
        this.height = 320;
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
        for (const k of ['level','rank','xpProgress','xpNeeded','totalXp','messagesCount','voiceTime']) {
            data[k] = Number(data[k]) || 0;
        }

        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');

        /* ── 1. Clipped background ── */
        ctx.save();
        drawRoundedRect(ctx, 0, 0, W, H, DESIGN.borderRadius);
        ctx.clip();

        const bgGrad = ctx.createLinearGradient(0, 0, W, H);
        bgGrad.addColorStop(0,    this.backgroundColor);
        bgGrad.addColorStop(0.45, DESIGN.colors.bgSecondary);
        bgGrad.addColorStop(0.75, DESIGN.colors.bgTertiary);
        bgGrad.addColorStop(1,    this.backgroundColor);
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
                    overlay.addColorStop(0,    'rgba(13, 13, 26, 0.72)');
                    overlay.addColorStop(0.5,  'rgba(13, 13, 26, 0.62)');
                    overlay.addColorStop(1,    'rgba(13, 13, 26, 0.82)');
                    ctx.fillStyle = overlay;
                    ctx.fillRect(0, 0, W, H);
                }
            } catch {}
        }

        // Two ambient glows: one anchored on the avatar, one on the
        // top-right level/rank badge cluster. Slightly stronger than
        // the previous version for more depth.
        drawAmbientGlow(ctx, 150, H / 2, 320, this.accentColor, 0.13);
        drawAmbientGlow(ctx, W - 130, 80, 220, this.secondaryAccent, 0.08);

        // Diagonal lattice — kept low-alpha so it reads as texture not noise.
        ctx.save();
        ctx.globalAlpha = 0.045;
        drawDiagonalLines(ctx, W, H, this.accentColor, 48);
        ctx.restore();

        // Soft inner vignette for a touch of depth at the corners.
        const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, W, H);

        ctx.restore();

        /* ── 2. Avatar ── */
        const avatarSize = 138;
        const avatarX = PAD + 5;
        const avatarY = (H - avatarSize) / 2 - 10;

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

        /* ── 3. Right-side LEVEL + RANK stack (the headline of the card) ── */
        // Stacked vertically with a shared accent column on the left edge.
        const badgeW = 130;
        const badgeH = 52;
        const badgeGap = 6;
        const badgeX = W - PAD - badgeW;
        const levelBadgeY = 32;
        const rankBadgeY  = levelBadgeY + badgeH + badgeGap;

        // LEVEL badge
        drawBox(ctx, badgeX, levelBadgeY, badgeW, badgeH, this.accentColor, 14);
        ctx.font = this._semi(11);
        ctx.fillStyle = DESIGN.colors.textMuted;
        ctx.textAlign = 'center';
        ctx.fillText('LEVEL', badgeX + badgeW / 2, levelBadgeY + 18);

        const lvlText = String(data.level);
        const lvlSize = fitText(ctx, lvlText, badgeW - 16, 26, 16);
        ctx.font = this._bold(lvlSize);
        ctx.fillStyle = this.accentColor;
        ctx.fillText(lvlText, badgeX + badgeW / 2, levelBadgeY + 42);

        // RANK badge (only if known)
        if (data.rank > 0) {
            drawBox(ctx, badgeX, rankBadgeY, badgeW, badgeH, this.secondaryAccent, 14);
            ctx.font = this._semi(11);
            ctx.fillStyle = DESIGN.colors.textMuted;
            ctx.fillText('RANK', badgeX + badgeW / 2, rankBadgeY + 18);

            const rankText = `#${data.rank}`;
            const rsize = fitText(ctx, rankText, badgeW - 16, 26, 16);
            ctx.font = this._bold(rsize);
            ctx.fillStyle = this.secondaryAccent;
            ctx.fillText(rankText, badgeX + badgeW / 2, rankBadgeY + 42);
        }
        ctx.textAlign = 'left';

        /* ── 4. Header text (username + handle) ── */
        const textX = avatarX + avatarSize + 28;
        const headerMaxW = badgeX - textX - 30;

        // Username - oversize bold, fitted to available width
        const rawName = String(user.globalName || user.username);
        const nameSize = fitText(ctx, rawName, headerMaxW, 30, 18);
        ctx.font = this._bold(nameSize);
        ctx.fillStyle = this.textColor;
        await drawText(ctx, truncateText(ctx, rawName, headerMaxW), textX, 50);

        // Handle row
        ctx.font = this._medium(13);
        ctx.fillStyle = DESIGN.colors.textMuted;
        const handle = `@${user.username}`;
        await drawText(ctx, truncateText(ctx, handle, headerMaxW), textX, 70);

        /* ── 5. XP progress bar ── */
        const barX = textX;
        const barY = 110;
        const barW = headerMaxW;
        const barH = 22;

        // Label row (label + raw XP) above the bar
        ctx.font = this._semi(11);
        ctx.fillStyle = DESIGN.colors.textMuted;
        ctx.fillText('EXPERIENCE', barX, barY - 10);

        const xpText = `${formatNumber(data.xpProgress)} / ${formatNumber(data.xpNeeded)} XP`;
        ctx.textAlign = 'right';
        ctx.fillStyle = this.textColor;
        ctx.font = this._semi(12);
        ctx.fillText(xpText, barX + barW, barY - 10);
        ctx.textAlign = 'left';

        const progress = data.xpNeeded > 0 ? data.xpProgress / data.xpNeeded : 0;
        drawProgressBar(ctx, barX, barY, barW, barH, progress, this.accentColor, this.secondaryAccent);

        // Percent label centered on the bar
        ctx.font = this._bold(11);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(Math.min(progress, 1) * 100)}%`, barX + barW / 2, barY + barH / 2 + 4);
        ctx.textAlign = 'left';

        /* ── 6. Stat chips (3 across, full-width) ── */
        // The chips span avatar-left to right margin so the eye reads
        // them as one strip rather than three disconnected boxes.
        const statsY = barY + barH + 30;
        const statGap = 14;
        const statStrip = W - PAD * 2;
        const statW = (statStrip - statGap * 2) / 3;
        const statH = 70;
        const statBaseX = PAD;

        const stats = [
            { label: 'TOTAL XP',   value: formatNumber(data.totalXp),       icon: STAT_ICONS.xp,      color: this.accentColor },
            { label: 'MESSAGES',   value: formatNumber(data.messagesCount), icon: STAT_ICONS.message, color: this.secondaryAccent },
            { label: 'VOICE TIME', value: formatVoiceTime(data.voiceTime),  icon: STAT_ICONS.voice,   color: '#a78bfa' },
        ];

        for (let i = 0; i < stats.length; i++) {
            const s = stats[i];
            await drawStatBox(ctx, {
                x: statBaseX + i * (statW + statGap), y: statsY,
                width: statW, height: statH, color: s.color,
                icon: s.icon, label: s.label, value: s.value,
                labelFont: this._semi(10),
                valueFont: this._bold(20),
            });
        }

        /* ── 7. Footer ── */
        ctx.font = this._font(10);
        ctx.fillStyle = DESIGN.colors.textDim;
        ctx.textAlign = 'right';
        ctx.fillText(`ID: ${user.id}`, W - 16, H - 12);
        ctx.textAlign = 'left';

        // Outer hairline border
        ctx.save();
        ctx.strokeStyle = rgba(this.accentColor, 0.10);
        ctx.lineWidth = 1.2;
        drawRoundedRect(ctx, 0.5, 0.5, W - 1, H - 1, DESIGN.borderRadius);
        ctx.stroke();
        ctx.restore();

        await drawNicoBranding(ctx, W, H, this.accentColor);

        return canvas.toBuffer('image/png');
    }
}

/**
 * Compact voice-time formatter so the stat chip stays single-line at
 * any duration. Skips zero components.
 */
function formatVoiceTime(seconds) {
    seconds = Math.max(0, Number(seconds) || 0);
    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h >= 1) return m > 0 ? `${h}h ${m}m` : `${h}h`;
    return `${m}m`;
}

module.exports = LevelCard;
