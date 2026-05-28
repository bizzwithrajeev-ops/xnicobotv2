'use strict';

/**
 * profileCard.js — 934×540 user profile card.
 *
 * Layout (top-down):
 *   <:Caretright:1473038207221502106> Banner (140px, accent gradient over the header area)
 *   <:Caretright:1473038207221502106> Avatar (overlaps banner) + status dot
 *   <:Caretright:1473038207221502106> Display name + handle
 *   <:Caretright:1473038207221502106> RANK + LEVEL badges (top-right, stacked)
 *   <:Caretright:1473038207221502106> EXPERIENCE bar (full width)
 *   <:Caretright:1473038207221502106> Four stat boxes: MESSAGES, VOICE TIME, REPUTATION, BALANCE
 *   <:Caretright:1473038207221502106> BADGES strip (custom badges)
 *   <:Caretright:1473038207221502106> Bio + ID footer + xNico watermark
 */

const { createCanvas } = require('@napi-rs/canvas');
const imageCache = require('./imageCache');
const {
    DESIGN, drawRoundedRect, drawText, truncateText, fitText,
    drawGradientBackground, drawDiagonalLines, drawAmbientGlow,
    drawBox, drawBadgeBox, drawProgressBar, drawStatBox, drawConicAvatarRing,
    formatNumber, formatVoiceTime, hexToRgb, rgba,
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
    messages:   '<:Chat:1473038936241864865>',
    voice:      '<:Volumeup:1473039290136002844>',
    reputation: '<:Award:1473038391632203887>',
    balance:    '<:Money:1473377877239140529>',
};

class ProfileCard {
    constructor() {
        this.width = 934;
        this.height = 540;
        this.backgroundColor = '#0d0d1a';
        this.accentColor = '#7c3aed';
        this.secondaryAccent = '#06b6d4';
        this.textColor = '#f0f0f5';
        this.backgroundImage = null;
        this.backgroundOpacity = 0.35;
        this.cardStyle = 'default';
        this.fontFamily = 'Inter';
        this._fh = getFontHelpers('Inter');
    }

    setFontFamily(family)       { this.fontFamily = family || 'Inter'; this._fh = getFontHelpers(this.fontFamily); return this; }
    setBackground(c)            { this.backgroundColor = c; return this; }
    setBackgroundImage(url)     { this.backgroundImage = url; return this; }
    setAccentColor(c)           { this.accentColor = c; return this; }
    setTextColor(c)             { this.textColor = c; return this; }
    setBackgroundOpacity(o)     { this.backgroundOpacity = Math.max(0, Math.min(1, o)); return this; }
    setCardStyle(style) {
        this.cardStyle = style || 'default';
        const t = STYLE_THEMES[this.cardStyle.toLowerCase()] || STYLE_THEMES.default;
        if (!this.backgroundImage) this.backgroundColor = t.bg;
        this.accentColor = t.accent;
        this.secondaryAccent = t.secondary;
        this.textColor = t.text;
        return this;
    }

    _font(s)   { return this._fh.getFont(s); }
    _medium(s) { return this._fh.getMediumFont(s); }
    _semi(s)   { return this._fh.getSemiBoldFont(s); }
    _bold(s)   { return this._fh.getBoldFont(s); }

    async generate(user, data = {}) {
        const W = this.width, H = this.height;
        const PAD = DESIGN.padding;

        data = {
            reputation: 0, level: 1, totalXp: 0, currentXp: 0, requiredXp: 100,
            commandsUsed: 0, messageCount: 0, voiceTime: 0, rank: 0, balance: 0,
            bio: '', customBadges: [],
            ...data,
        };
        for (const k of ['reputation','level','totalXp','currentXp','requiredXp','commandsUsed','messageCount','voiceTime','rank','balance']) {
            data[k] = Number(data[k]) || 0;
        }
        data.bio = data.bio ? String(data.bio) : '';

        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');

        /* ── 1. Background ── */
        ctx.save();
        drawRoundedRect(ctx, 0, 0, W, H, DESIGN.borderRadius);
        ctx.clip();

        const bgGrad = ctx.createLinearGradient(0, 0, W, H);
        bgGrad.addColorStop(0,   this.backgroundColor);
        bgGrad.addColorStop(0.3, DESIGN.colors.bgSecondary);
        bgGrad.addColorStop(0.6, DESIGN.colors.bgTertiary);
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
                    overlay.addColorStop(0,    'rgba(13, 13, 26, 0.65)');
                    overlay.addColorStop(0.5,  'rgba(13, 13, 26, 0.55)');
                    overlay.addColorStop(1,    'rgba(13, 13, 26, 0.8)');
                    ctx.fillStyle = overlay;
                    ctx.fillRect(0, 0, W, H);
                }
            } catch {}
        }

        drawAmbientGlow(ctx, 150, 180, 340, this.accentColor, 0.10);
        drawAmbientGlow(ctx, W - 120, 50, 200, this.secondaryAccent, 0.05);
        ctx.restore();

        /* ── 2. Banner ── */
        ctx.save();
        drawRoundedRect(ctx, 0, 0, W, H, DESIGN.borderRadius);
        ctx.clip();

        const bannerH = 140;
        const bannerGrad = ctx.createLinearGradient(0, 0, W, bannerH);
        bannerGrad.addColorStop(0,    rgba(this.accentColor, 0.25));
        bannerGrad.addColorStop(0.4,  rgba(this.secondaryAccent, 0.10));
        bannerGrad.addColorStop(1,    'transparent');
        ctx.fillStyle = bannerGrad;
        ctx.fillRect(0, 0, W, bannerH);

        ctx.save();
        ctx.globalAlpha = 0.05;
        drawDiagonalLines(ctx, W, bannerH, this.accentColor, 50);
        ctx.restore();
        ctx.restore();

        /* ── 3. Avatar ── */
        const avatarSize = 150;
        const avatarX = PAD;
        const avatarY = bannerH - avatarSize / 2 - 10;

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

        // Status dot (always green for profile)
        const sX = avatarX + avatarSize - 14;
        const sY = avatarY + avatarSize - 14;
        ctx.beginPath();
        ctx.arc(sX, sY, 14, 0, Math.PI * 2);
        ctx.fillStyle = this.backgroundColor;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sX, sY, 9, 0, Math.PI * 2);
        ctx.fillStyle = '#22c55e';
        ctx.fill();

        /* ── 4. Name + handle ── */
        const infoX = avatarX + avatarSize + 24;
        const infoY = avatarY + 46;

        ctx.font = this._bold(DESIGN.fonts.title);
        ctx.fillStyle = this.textColor;
        const displayName = truncateText(ctx, user.globalName || user.username, 340);
        await drawText(ctx, displayName, infoX, infoY);

        ctx.font = this._font(DESIGN.fonts.subtitle);
        ctx.fillStyle = DESIGN.colors.textMuted;
        await drawText(ctx, `@${user.username}`, infoX, infoY + 20);

        /* ── 5. Rank + level pills (top-right, stacked) ── */
        const topY = 18;
        const topH = 46;
        const pillW = 82;
        const gap = 10;

        if (data.rank > 0) {
            const rx = W - PAD - pillW;
            drawBox(ctx, rx, topY, pillW, topH, this.secondaryAccent, 8);

            ctx.font = this._semi(DESIGN.fonts.label);
            ctx.fillStyle = DESIGN.colors.textMuted;
            ctx.textAlign = 'center';
            ctx.fillText('RANK', rx + pillW / 2, topY + 15);

            const rankText = `#${data.rank}`;
            const rsize = fitText(ctx, rankText, pillW - 16, 19, 13);
            ctx.font = this._bold(rsize);
            ctx.fillStyle = this.secondaryAccent;
            ctx.fillText(rankText, rx + pillW / 2, topY + 36);
            ctx.textAlign = 'left';
        }

        const lx = W - PAD - pillW - (data.rank > 0 ? pillW + gap : 0);
        const ly = topY + topH + gap;
        const lw = data.rank > 0 ? pillW * 2 + gap : pillW;
        const lh = 50;
        drawBox(ctx, lx, ly, lw, lh, this.accentColor, 8);

        ctx.font = this._semi(DESIGN.fonts.label);
        ctx.fillStyle = DESIGN.colors.textMuted;
        ctx.textAlign = 'center';
        ctx.fillText('LEVEL', lx + lw / 2, ly + 16);

        const lvlText = String(data.level);
        const lsize = fitText(ctx, lvlText, lw - 20, 22, 14);
        ctx.font = this._bold(lsize);
        ctx.fillStyle = this.accentColor;
        ctx.fillText(lvlText, lx + lw / 2, ly + 40);
        ctx.textAlign = 'left';

        /* ── 6. XP bar ── */
        const progY = avatarY + avatarSize + 20;
        const progX = PAD;
        const progW = W - PAD * 2;
        const progH = 14;

        ctx.font = this._semi(DESIGN.fonts.label);
        ctx.fillStyle = DESIGN.colors.textMuted;
        ctx.fillText('EXPERIENCE', progX, progY - 7);

        const xpText = `${formatNumber(data.currentXp)} / ${formatNumber(data.requiredXp)} XP`;
        ctx.textAlign = 'right';
        ctx.fillText(xpText, progX + progW, progY - 7);
        ctx.textAlign = 'left';

        const pct = data.requiredXp > 0 ? data.currentXp / data.requiredXp : 0;
        drawProgressBar(ctx, progX, progY, progW, progH, pct, this.accentColor, this.secondaryAccent);

        ctx.font = this._bold(8);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(Math.min(pct, 1) * 100)}%`, progX + progW / 2, progY + progH / 2 + 3);
        ctx.textAlign = 'left';

        /* ── 7. Stat boxes ── */
        const statsY = progY + 34;
        const statGap = 10;
        const statW = (W - PAD * 2 - statGap * 3) / 4;
        const statH = 64;

        const stats = [
            { label: 'MESSAGES',   value: formatNumber(data.messageCount), icon: STAT_ICONS.messages,   color: this.secondaryAccent },
            { label: 'VOICE TIME', value: formatVoiceTime(data.voiceTime), icon: STAT_ICONS.voice,      color: '#a78bfa' },
            { label: 'REPUTATION', value: String(data.reputation),         icon: STAT_ICONS.reputation, color: this.accentColor },
            { label: 'BALANCE',    value: formatNumber(data.balance),      icon: STAT_ICONS.balance,    color: '#fbbf24' },
        ];

        for (let i = 0; i < stats.length; i++) {
            const s = stats[i];
            await drawStatBox(ctx, {
                x: PAD + i * (statW + statGap), y: statsY,
                width: statW, height: statH, color: s.color,
                icon: s.icon, label: s.label, value: s.value,
                labelFont: this._semi(DESIGN.fonts.tiny),
                valueFont: this._bold(DESIGN.fonts.smallValue),
            });
        }

        /* ── 8. Custom badges ── */
        if (data.customBadges && data.customBadges.length > 0) {
            const badgesY = statsY + statH + 16;
            const badgeSize = 34;
            const badgeSpace = 7;
            const availW = W - PAD * 2;
            const maxBadges = Math.floor(availW / (badgeSize + badgeSpace));
            const visible = data.customBadges.slice(0, Math.min(maxBadges, 18));

            ctx.font = this._semi(DESIGN.fonts.label);
            ctx.fillStyle = DESIGN.colors.textMuted;
            ctx.fillText('BADGES', PAD, badgesY - 5);

            let bx = PAD;
            for (const badge of visible) {
                const badgeColor = badge.color || this.accentColor;
                drawBadgeBox(ctx, bx, badgesY, badgeSize, badgeColor);

                const innerPad = 5;
                const innerSize = badgeSize - innerPad * 2;
                let rendered = false;

                // 1. Try imageUrl
                if (badge.imageUrl && badge.imageUrl.startsWith('http')) {
                    try {
                        const img = await imageCache.loadWithCache(badge.imageUrl, 5000);
                        if (img) {
                            ctx.save();
                            drawRoundedRect(ctx, bx + innerPad, badgesY + innerPad, innerSize, innerSize, 5);
                            ctx.clip();
                            ctx.drawImage(img, bx + innerPad, badgesY + innerPad, innerSize, innerSize);
                            ctx.restore();
                            rendered = true;
                        }
                    } catch {}
                }

                // 2. Try emoji
                if (!rendered && badge.emoji) {
                    const isCustom = badge.emoji.startsWith('<');
                    const id = badge.emoji.match(/:(\d+)>/)?.[1];
                    const animated = badge.emoji.startsWith('<a:');
                    const url = isCustom && id
                        ? `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=128&quality=lossless`
                        : require('./canvasEmojiDefaults').getCanvasEmojiAssetUrl(badge.emoji);
                    if (url) {
                        try {
                            const img = await imageCache.loadWithCache(url, 5000);
                            if (img) {
                                ctx.drawImage(img, bx + innerPad, badgesY + innerPad, innerSize, innerSize);
                                rendered = true;
                            }
                        } catch {}
                    }
                }

                // 3. Initial fallback
                if (!rendered) {
                    const initial = ((badge.name && String(badge.name).trim()) || '?')[0].toUpperCase();
                    ctx.font = this._bold(14);
                    ctx.fillStyle = badgeColor;
                    ctx.textAlign = 'center';
                    ctx.fillText(initial, bx + badgeSize / 2, badgesY + badgeSize / 2 + 5);
                    ctx.textAlign = 'left';
                }

                bx += badgeSize + badgeSpace;
            }

            if (data.customBadges.length > visible.length) {
                const more = data.customBadges.length - visible.length;
                ctx.font = this._semi(10);
                ctx.fillStyle = DESIGN.colors.textDim;
                ctx.fillText(`+${more}`, bx + 4, badgesY + badgeSize / 2 + 4);
            }
        }

        /* ── 9. Bio ── */
        // Bio sits one line above the footer. We reserve ~30px at the
        // bottom for the ID label + watermark so the strings don't
        // collide with the corner branding.
        if (data.bio) {
            const bioY = H - 44;
            ctx.font = this._font(DESIGN.fonts.subtitle);
            ctx.fillStyle = DESIGN.colors.textMuted;
            const bioMaxW = W - PAD * 2 - 110; // leave room for the corner brand
            await drawText(ctx, `"${truncateText(ctx, data.bio, bioMaxW)}"`, PAD, bioY);
        }

        /* ── 10. Footer ── */
        // ID is left-aligned so it never crashes into the right-side
        // xNico watermark + wordmark drawn by drawNicoBranding.
        ctx.font = this._font(DESIGN.fonts.tiny);
        ctx.fillStyle = DESIGN.colors.textDim;
        ctx.textAlign = 'left';
        ctx.fillText(`ID: ${user.id}`, PAD, H - 14);

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

module.exports = ProfileCard;
