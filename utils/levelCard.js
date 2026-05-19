const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const imageCache = require('./imageCache');
const { registerAllFonts, getFontHelpers } = require('./fontRegistry');
const { getCanvasEmojiAssetUrl } = require('./canvasEmojiDefaults');

try {
    registerAllFonts();
} catch (e) {
    // Font registration failed - cards will use fallback fonts
}

const DESIGN = {
    padding: 35,
    borderRadius: 24,
    boxRadius: 14,
    colors: {
        bg: '#0d0d1a',
        bgSecondary: '#151528',
        bgTertiary: '#1c1c3a',
        boxBg: 'rgba(25, 25, 55, 0.95)',
        boxBorder: '40',
        text: '#f0f0f5',
        textMuted: '#8b8fa3',
        textDim: '#5c6078',
        accent: '#7c3aed',
        secondary: '#06b6d4'
    },
    fonts: {
        title: 28,
        subtitle: 12,
        label: 9,
        value: 18,
        smallValue: 16,
        tiny: 8
    }
};

class LevelCard {
    constructor() {
        this.width = 934;
        this.height = 340;
        this.backgroundColor = DESIGN.colors.bg;
        this.progressBarColor = DESIGN.colors.accent;
        this.progressBarBgColor = 'rgba(30, 30, 60, 0.8)';
        this.textColor = DESIGN.colors.text;
        this.accentColor = DESIGN.colors.accent;
        this.secondaryAccent = DESIGN.colors.secondary;
        this.backgroundImage = null;
        this.backgroundOpacity = 0.35;
        this.bio = null;
        this.cardStyle = 'default';
        this.fontFamily = 'Inter';
        this._fontHelpers = getFontHelpers('Inter');
    }

    getFont(size) { return this._fontHelpers.getFont(size); }
    getMediumFont(size) { return this._fontHelpers.getMediumFont(size); }
    getBoldFont(size) { return this._fontHelpers.getBoldFont(size); }
    getSemiBoldFont(size) { return this._fontHelpers.getSemiBoldFont(size); }

    setFontFamily(familyKey) {
        this.fontFamily = familyKey || 'Inter';
        this._fontHelpers = getFontHelpers(this.fontFamily);
        return this;
    }

    setBackground(color) { this.backgroundColor = color; return this; }
    setBackgroundImage(url) { this.backgroundImage = url; return this; }
    setProgressBarColor(color) { this.progressBarColor = color; this.accentColor = color; return this; }
    setAccentColor(color) { this.accentColor = color; return this; }
    setTextColor(color) { this.textColor = color; return this; }
    setBio(bio) { this.bio = bio; return this; }
    setBackgroundOpacity(opacity) { this.backgroundOpacity = Math.max(0, Math.min(1, opacity)); return this; }

    setCardStyle(style) {
        this.cardStyle = style || 'default';
        this.applyStyleTheme();
        return this;
    }

    applyStyleTheme() {
        const themes = {
            default: { backgroundColor: '#0d0d1a', progressBarColor: '#7c3aed', accentColor: '#7c3aed', secondaryAccent: '#06b6d4', textColor: '#f0f0f5' },
            minimal: { backgroundColor: '#161618', progressBarColor: '#e4e4e7', accentColor: '#a1a1aa', secondaryAccent: '#71717a', textColor: '#fafafa' },
            neon: { backgroundColor: '#020617', progressBarColor: '#22d3ee', accentColor: '#a855f7', secondaryAccent: '#22d3ee', textColor: '#e0f2fe' },
            classic: { backgroundColor: '#1a2332', progressBarColor: '#6366f1', accentColor: '#818cf8', secondaryAccent: '#38bdf8', textColor: '#e2e8f0' },
            modern: { backgroundColor: '#0a0a0a', progressBarColor: '#22c55e', accentColor: '#4ade80', secondaryAccent: '#2dd4bf', textColor: '#f5f5f4' }
        };
        const normalizedStyle = (this.cardStyle || 'default').toLowerCase();
        const theme = themes[normalizedStyle] || themes.default;
        if (!this.backgroundImage) this.backgroundColor = theme.backgroundColor;
        this.progressBarColor = theme.progressBarColor;
        this.accentColor = theme.accentColor;
        this.secondaryAccent = theme.secondaryAccent;
        this.textColor = theme.textColor;
    }

    drawRoundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    async loadEmoji(emojiContent, isCustom = false, emojiId = null, animated = false, emojiName = '') {
        try {
            if (isCustom && emojiId) {
                const url = `https://cdn.discordapp.com/emojis/${emojiId}.${animated ? 'gif' : 'png'}?size=128&quality=lossless`;
                return await imageCache.loadWithCache(url, 3000);
            } else {
                const url = getCanvasEmojiAssetUrl(emojiContent || emojiName || 'emoji');
                return url ? await imageCache.loadWithCache(url, 3000) : null;
            }
        } catch { return null; }
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 124, g: 58, b: 237 };
    }

    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toLocaleString();
    }

    truncateText(ctx, text, maxWidth) {
        if (ctx.measureText(text).width <= maxWidth) return text;
        let t = text;
        while (ctx.measureText(t + '...').width > maxWidth && t.length > 0) t = t.slice(0, -1);
        return t + '...';
    }

    fitText(ctx, text, maxWidth, baseSize, minSize = 10) {
        for (let size = baseSize; size >= minSize; size--) {
            ctx.font = this.getBoldFont(size);
            if (ctx.measureText(text).width <= maxWidth) return size;
        }
        return minSize;
    }

    parseText(text) {
        if (!text) return [];
        const parts = [];
        const customEmojiRegex = /<(a?):([^:]+):(\d+)>/g;
        const unicodeEmojiRegex = /(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/gu;
        let lastIndex = 0;
        const matches = [];

        let match;
        while ((match = customEmojiRegex.exec(text)) !== null) {
            matches.push({ index: match.index, length: match[0].length, type: 'custom', animated: match[1] === 'a', name: match[2], id: match[3], content: match[0] });
        }
        while ((match = unicodeEmojiRegex.exec(text)) !== null) {
            const isInCustom = matches.some(m => match.index >= m.index && match.index < m.index + m.length);
            if (!isInCustom) {
                matches.push({ index: match.index, length: match[0].length, type: 'unicode', content: match[0] });
            }
        }
        matches.sort((a, b) => a.index - b.index);

        for (const m of matches) {
            if (m.index > lastIndex) parts.push({ type: 'text', content: text.substring(lastIndex, m.index) });
            parts.push(m);
            lastIndex = m.index + m.length;
        }
        if (lastIndex < text.length) parts.push({ type: 'text', content: text.substring(lastIndex) });
        return parts;
    }

    async drawText(ctx, text, x, y) {
        const parts = this.parseText(text);
        const fontSize = parseInt(ctx.font.match(/\d+/)?.[0]) || 20;
        const emojiSize = Math.floor(fontSize * 1.15);
        let currentX = x;

        // Force left-align for manual positioning — drawImage uses absolute
        // coords so textAlign must be 'left' or emojis and text drift apart.
        const savedAlign = ctx.textAlign;
        ctx.textAlign = 'left';

        for (const part of parts) {
            if (part.type === 'text') {
                ctx.fillText(part.content, currentX, y);
                currentX += ctx.measureText(part.content).width;
            } else {
                const img = await this.loadEmoji(part.content || '', part.type === 'custom', part.id, part.animated, part.name);
                if (img) {
                    ctx.drawImage(img, currentX, y - emojiSize * 0.8, emojiSize, emojiSize);
                    currentX += emojiSize + 2;
                } else {
                    const fallback = part.type === 'custom' ? `:${part.name || 'emoji'}:` : (part.content || '');
                    if (fallback) {
                        ctx.fillText(fallback, currentX, y);
                        currentX += ctx.measureText(fallback).width;
                    }
                }
            }
        }

        ctx.textAlign = savedAlign;
        return currentX - x;
    }

    drawBox(ctx, x, y, width, height, color, shadowBlur = 10) {
        const rgb = this.hexToRgb(color);

        ctx.save();
        ctx.shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`;
        ctx.shadowBlur = shadowBlur;

        const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
        gradient.addColorStop(0, 'rgba(28, 28, 60, 0.9)');
        gradient.addColorStop(1, 'rgba(18, 18, 42, 0.95)');
        ctx.fillStyle = gradient;
        this.drawRoundedRect(ctx, x, y, width, height, DESIGN.boxRadius);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`;
        ctx.lineWidth = 1;
        this.drawRoundedRect(ctx, x, y, width, height, DESIGN.boxRadius);
        ctx.stroke();

        // Top edge highlight
        ctx.save();
        const topGrad = ctx.createLinearGradient(x + 10, y, x + width - 10, y);
        topGrad.addColorStop(0, 'transparent');
        topGrad.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`);
        topGrad.addColorStop(1, 'transparent');
        ctx.strokeStyle = topGrad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 0.5);
        ctx.lineTo(x + width - 10, y + 0.5);
        ctx.stroke();
        ctx.restore();
    }

    async generate(user, data = {}) {
        data.level = Number(data.level) || 1;
        data.rank = Number(data.rank) || 0;
        data.xpProgress = Number(data.xpProgress) || 0;
        data.xpNeeded = Number(data.xpNeeded) || 100;
        data.totalXp = Number(data.totalXp) || 0;
        data.messagesCount = Number(data.messagesCount) || 0;
        data.voiceTime = Number(data.voiceTime) || 0;

        const canvas = createCanvas(this.width, this.height);
        const ctx = canvas.getContext('2d');

        // === BACKGROUND ===
        ctx.save();
        this.drawRoundedRect(ctx, 0, 0, this.width, this.height, DESIGN.borderRadius);
        ctx.clip();

        // Multi-stop gradient background
        const bgGradient = ctx.createLinearGradient(0, 0, this.width, this.height);
        bgGradient.addColorStop(0, this.backgroundColor);
        bgGradient.addColorStop(0.4, DESIGN.colors.bgSecondary);
        bgGradient.addColorStop(0.7, DESIGN.colors.bgTertiary);
        bgGradient.addColorStop(1, this.backgroundColor);
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, this.width, this.height);

        // Custom background image
        if (this.backgroundImage) {
            try {
                const bgImage = await imageCache.loadWithCache(this.backgroundImage, 5000);
                if (bgImage) {
                    ctx.globalAlpha = this.backgroundOpacity;
                    const scale = Math.max(this.width / bgImage.width, this.height / bgImage.height);
                    const x = (this.width - bgImage.width * scale) / 2;
                    const y = (this.height - bgImage.height * scale) / 2;
                    ctx.drawImage(bgImage, x, y, bgImage.width * scale, bgImage.height * scale);
                    ctx.globalAlpha = 1;
                    // Dark overlay with gradient
                    const overlay = ctx.createLinearGradient(0, 0, 0, this.height);
                    overlay.addColorStop(0, 'rgba(13, 13, 26, 0.7)');
                    overlay.addColorStop(0.5, 'rgba(13, 13, 26, 0.6)');
                    overlay.addColorStop(1, 'rgba(13, 13, 26, 0.8)');
                    ctx.fillStyle = overlay;
                    ctx.fillRect(0, 0, this.width, this.height);
                }
            } catch {}
        }

        const rgb = this.hexToRgb(this.accentColor);
        const rgb2 = this.hexToRgb(this.secondaryAccent);

        // Ambient glow behind avatar area
        ctx.save();
        ctx.globalAlpha = 0.08;
        const glowGradient = ctx.createRadialGradient(140, this.height / 2, 0, 140, this.height / 2, 300);
        glowGradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`);
        glowGradient.addColorStop(0.5, `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, 0.4)`);
        glowGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = glowGradient;
        ctx.fillRect(0, 0, 420, this.height);
        ctx.restore();

        // Secondary glow on right
        ctx.save();
        ctx.globalAlpha = 0.04;
        const glow2 = ctx.createRadialGradient(this.width - 150, 60, 0, this.width - 150, 60, 200);
        glow2.addColorStop(0, `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, 1)`);
        glow2.addColorStop(1, 'transparent');
        ctx.fillStyle = glow2;
        ctx.fillRect(this.width - 350, 0, 350, 200);
        ctx.restore();

        ctx.restore();

        // Diagonal line pattern
        ctx.save();
        this.drawRoundedRect(ctx, 0, 0, this.width, this.height, DESIGN.borderRadius);
        ctx.clip();
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.03)`;
        ctx.lineWidth = 1;
        for (let i = -this.height; i < this.width + this.height; i += 50) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i + this.height, this.height);
            ctx.stroke();
        }
        ctx.restore();

        // === AVATAR ===
        const avatarSize = 130;
        const avatarX = DESIGN.padding + 5;
        const avatarY = (this.height - avatarSize) / 2;
        const avatarCenterX = avatarX + avatarSize / 2;
        const avatarCenterY = avatarY + avatarSize / 2;

        // Avatar glow
        ctx.save();
        ctx.shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`;
        ctx.shadowBlur = 25;
        ctx.beginPath();
        ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2 + 6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
        ctx.fill();
        ctx.restore();

        try {
            const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 512 });
            const avatar = await imageCache.loadWithCache(avatarUrl, 5000);
            if (avatar) {
                // Draw avatar
                ctx.save();
                ctx.beginPath();
                ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
                ctx.restore();

                // Background ring
                ctx.strokeStyle = this.backgroundColor;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2 + 2.5, 0, Math.PI * 2);
                ctx.stroke();

                // Accent ring with conic gradient
                const ringGradient = ctx.createConicGradient(0, avatarCenterX, avatarCenterY);
                ringGradient.addColorStop(0, this.accentColor);
                ringGradient.addColorStop(0.3, this.secondaryAccent);
                ringGradient.addColorStop(0.6, this.accentColor);
                ringGradient.addColorStop(1, this.secondaryAccent);
                ctx.strokeStyle = ringGradient;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2 + 7, 0, Math.PI * 2);
                ctx.stroke();
            }
        } catch {}

        // === TEXT AREA ===
        const textX = avatarX + avatarSize + 28;

        // Username
        ctx.font = this.getBoldFont(DESIGN.fonts.title);
        ctx.fillStyle = this.textColor;
        const username = this.truncateText(ctx, user.globalName || user.username, 290);
        await this.drawText(ctx, username, textX, 48);

        // Handle
        ctx.font = this.getFont(DESIGN.fonts.subtitle);
        ctx.fillStyle = DESIGN.colors.textMuted;
        await this.drawText(ctx, `@${user.username}`, textX, 67);

        // === RANK & LEVEL BADGES ===
        const boxY = 20;
        const boxHeight = 48;
        const boxWidth = 82;
        const boxGap = 10;

        if (data.rank > 0) {
            const rankBoxX = this.width - DESIGN.padding - boxWidth;
            this.drawBox(ctx, rankBoxX, boxY, boxWidth, boxHeight, this.secondaryAccent);

            ctx.font = this.getSemiBoldFont(DESIGN.fonts.label);
            ctx.fillStyle = DESIGN.colors.textMuted;
            ctx.textAlign = 'center';
            ctx.fillText('RANK', rankBoxX + boxWidth / 2, boxY + 16);

            const rankText = `#${data.rank}`;
            const rankSize = this.fitText(ctx, rankText, boxWidth - 16, 19, 13);
            ctx.font = this.getBoldFont(rankSize);
            ctx.fillStyle = this.secondaryAccent;
            ctx.fillText(rankText, rankBoxX + boxWidth / 2, boxY + 38);
            ctx.textAlign = 'left';
        }

        const levelBoxX = this.width - DESIGN.padding - boxWidth - (data.rank > 0 ? boxWidth + boxGap : 0);
        this.drawBox(ctx, levelBoxX, boxY, boxWidth, boxHeight, this.accentColor);

        ctx.font = this.getSemiBoldFont(DESIGN.fonts.label);
        ctx.fillStyle = DESIGN.colors.textMuted;
        ctx.textAlign = 'center';
        ctx.fillText('LEVEL', levelBoxX + boxWidth / 2, boxY + 16);

        const levelText = data.level.toString();
        const levelSize = this.fitText(ctx, levelText, boxWidth - 16, 19, 13);
        ctx.font = this.getBoldFont(levelSize);
        ctx.fillStyle = this.accentColor;
        ctx.fillText(levelText, levelBoxX + boxWidth / 2, boxY + 38);
        ctx.textAlign = 'left';

        // === PROGRESS BAR ===
        const barX = textX;
        const barY = 95;
        const barWidth = this.width - textX - DESIGN.padding;
        const barHeight = 18;
        const radius = barHeight / 2;

        // Labels
        ctx.font = this.getSemiBoldFont(DESIGN.fonts.label);
        ctx.fillStyle = DESIGN.colors.textMuted;
        ctx.fillText('EXPERIENCE', barX, barY - 7);

        const xpText = `${this.formatNumber(data.xpProgress)} / ${this.formatNumber(data.xpNeeded)} XP`;
        ctx.textAlign = 'right';
        ctx.fillText(xpText, barX + barWidth, barY - 7);
        ctx.textAlign = 'left';

        // Bar background
        ctx.fillStyle = this.progressBarBgColor;
        this.drawRoundedRect(ctx, barX, barY, barWidth, barHeight, radius);
        ctx.fill();

        // Progress fill
        const progress = Math.min(Math.max(data.xpProgress / data.xpNeeded, 0), 1);
        const filledWidth = Math.max(barWidth * progress, radius * 2);

        const progressGradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
        progressGradient.addColorStop(0, this.accentColor);
        progressGradient.addColorStop(0.5, this.secondaryAccent);
        progressGradient.addColorStop(1, this.accentColor);
        ctx.fillStyle = progressGradient;

        ctx.save();
        this.drawRoundedRect(ctx, barX, barY, barWidth, barHeight, radius);
        ctx.clip();
        this.drawRoundedRect(ctx, barX, barY, filledWidth, barHeight, radius);
        ctx.fill();

        // Glossy highlight
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(barX, barY, filledWidth, barHeight / 2);
        ctx.globalAlpha = 1;
        ctx.restore();

        // Percentage label
        ctx.font = this.getBoldFont(9);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(progress * 100)}%`, barX + barWidth / 2, barY + barHeight / 2 + 3);
        ctx.textAlign = 'left';

        // === STAT BOXES ===
        const statsY = barY + barHeight + 22;
        const statGap = 10;
        const statWidth = (barWidth - statGap * 2) / 3;
        const statHeight = 62;

        const stats = [
            { label: 'TOTAL XP', value: this.formatNumber(data.totalXp), iconHint: 'xp', color: this.accentColor },
            { label: 'MESSAGES', value: this.formatNumber(data.messagesCount), iconHint: 'message', color: this.secondaryAccent },
            { label: 'VOICE TIME', value: data.voiceTime > 0 ? `${Math.floor(data.voiceTime / 3600)}h ${Math.floor((data.voiceTime % 3600) / 60)}m` : '0h 0m', iconHint: 'voice', color: '#a78bfa' }
        ];

        for (let i = 0; i < stats.length; i++) {
            const statX = barX + i * (statWidth + statGap);
            const stat = stats[i];
            const padding = 12;
            const iconSize = 18;

            this.drawBox(ctx, statX, statsY, statWidth, statHeight, stat.color);

            const iconImg = await this.loadEmoji(stat.iconHint);
            if (iconImg) {
                ctx.drawImage(iconImg, statX + padding, statsY + 10, iconSize, iconSize);
            }

            ctx.font = this.getSemiBoldFont(DESIGN.fonts.tiny);
            ctx.fillStyle = DESIGN.colors.textMuted;
            const labelMaxWidth = statWidth - padding * 2 - iconSize - 8;
            const label = this.truncateText(ctx, stat.label, labelMaxWidth);
            ctx.fillText(label, statX + padding + iconSize + 6, statsY + 21);

            const valueSize = this.fitText(ctx, stat.value, statWidth - padding * 2, DESIGN.fonts.value, 12);
            ctx.font = this.getBoldFont(valueSize);
            ctx.fillStyle = stat.color;
            ctx.fillText(stat.value, statX + padding, statsY + 47);
        }

        // === FOOTER ===
        ctx.font = this.getFont(DESIGN.fonts.tiny);
        ctx.fillStyle = DESIGN.colors.textDim;
        ctx.textAlign = 'right';
        ctx.fillText(`ID: ${user.id}`, this.width - 16, this.height - 10);
        ctx.textAlign = 'left';

        // === OUTER BORDER ===
        ctx.save();
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`;
        ctx.lineWidth = 1;
        this.drawRoundedRect(ctx, 0.5, 0.5, this.width - 1, this.height - 1, DESIGN.borderRadius);
        ctx.stroke();
        ctx.restore();

        const { drawNicoBranding } = require('./canvasDesign');
        await drawNicoBranding(ctx, this.width, this.height);

        return canvas.toBuffer('image/png');
    }
}

module.exports = LevelCard;
