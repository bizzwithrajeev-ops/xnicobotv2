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
    badgeRadius: 10,
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

class ProfileCard {
    constructor() {
        this.width = 934;
        this.height = 540;
        this.backgroundColor = DESIGN.colors.bg;
        this.accentColor = DESIGN.colors.accent;
        this.secondaryAccent = DESIGN.colors.secondary;
        this.textColor = DESIGN.colors.text;
        this.backgroundImage = null;
        this.backgroundOpacity = 0.35;
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

    setCardStyle(style) {
        this.cardStyle = style || 'default';
        this.applyStyleTheme();
        return this;
    }

    applyStyleTheme() {
        const themes = {
            default: { backgroundColor: '#0d0d1a', accentColor: '#7c3aed', secondaryAccent: '#06b6d4', textColor: '#f0f0f5' },
            minimal: { backgroundColor: '#161618', accentColor: '#a1a1aa', secondaryAccent: '#71717a', textColor: '#fafafa' },
            neon: { backgroundColor: '#020617', accentColor: '#a855f7', secondaryAccent: '#22d3ee', textColor: '#e0f2fe' },
            classic: { backgroundColor: '#1a2332', accentColor: '#818cf8', secondaryAccent: '#38bdf8', textColor: '#e2e8f0' },
            modern: { backgroundColor: '#0a0a0a', accentColor: '#4ade80', secondaryAccent: '#2dd4bf', textColor: '#f5f5f4' }
        };
        const normalizedStyle = (this.cardStyle || 'default').toLowerCase();
        const theme = themes[normalizedStyle] || themes.default;
        if (!this.backgroundImage) this.backgroundColor = theme.backgroundColor;
        this.accentColor = theme.accentColor;
        this.secondaryAccent = theme.secondaryAccent;
        this.textColor = theme.textColor;
    }

    setBackground(color) { this.backgroundColor = color; return this; }
    setBackgroundImage(url) { this.backgroundImage = url; return this; }
    setAccentColor(color) { this.accentColor = color; return this; }
    setTextColor(color) { this.textColor = color; return this; }
    setBackgroundOpacity(opacity) { this.backgroundOpacity = Math.max(0, Math.min(1, opacity)); return this; }

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

    measureText(ctx, text) {
        const parts = this.parseText(text);
        const fontSize = parseInt(ctx.font.match(/\d+/)?.[0]) || 20;
        const emojiSize = Math.floor(fontSize * 1.15);
        let width = 0;

        for (const part of parts) {
            if (part.type === 'text') {
                width += ctx.measureText(part.content).width;
            } else {
                width += emojiSize + 2;
            }
        }
        return width;
    }

    async drawText(ctx, text, x, y, centered = false) {
        const parts = this.parseText(text);
        const fontSize = parseInt(ctx.font.match(/\d+/)?.[0]) || 20;
        const emojiSize = Math.floor(fontSize * 1.15);

        let startX = x;
        if (centered) {
            const totalWidth = this.measureText(ctx, text);
            startX = x - totalWidth / 2;
        }

        let currentX = startX;

        for (const part of parts) {
            if (part.type === 'text') {
                ctx.fillText(part.content, currentX, y);
                currentX += ctx.measureText(part.content).width;
            } else {
                const img = await this.loadEmoji(part.content || '', part.type === 'custom', part.id, part.animated, part.name);
                if (img) {
                    const emojiY = y - emojiSize + Math.floor(fontSize * 0.2);
                    ctx.drawImage(img, currentX, emojiY, emojiSize, emojiSize);
                }
                currentX += emojiSize + 2;
            }
        }
        return currentX - startX;
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

    formatVoiceTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    }

    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toLocaleString();
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 124, g: 58, b: 237 };
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

    drawBadgeBox(ctx, x, y, size, color) {
        const rgb = this.hexToRgb(color);

        ctx.save();
        ctx.shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`;
        ctx.shadowBlur = 6;

        const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
        gradient.addColorStop(0, 'rgba(32, 32, 68, 0.92)');
        gradient.addColorStop(1, 'rgba(20, 20, 48, 0.95)');
        ctx.fillStyle = gradient;
        this.drawRoundedRect(ctx, x, y, size, size, DESIGN.badgeRadius);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`;
        ctx.lineWidth = 1;
        this.drawRoundedRect(ctx, x, y, size, size, DESIGN.badgeRadius);
        ctx.stroke();
    }

    async generate(user, data = {}) {
        data.reputation = Number(data.reputation) || 0;
        data.level = Number(data.level) || 1;
        data.totalXp = Number(data.totalXp) || 0;
        data.currentXp = Number(data.currentXp) || 0;
        data.requiredXp = Number(data.requiredXp) || 100;
        data.commandsUsed = Number(data.commandsUsed) || 0;
        data.messageCount = Number(data.messageCount) || 0;
        data.voiceTime = Number(data.voiceTime) || 0;
        data.rank = Number(data.rank) || 0;
        data.balance = Number(data.balance) || 0;
        data.bio = data.bio ? String(data.bio) : '';

        const canvas = createCanvas(this.width, this.height);
        const ctx = canvas.getContext('2d');

        const rgb = this.hexToRgb(this.accentColor);
        const rgb2 = this.hexToRgb(this.secondaryAccent);

        // === BACKGROUND ===
        ctx.save();
        this.drawRoundedRect(ctx, 0, 0, this.width, this.height, DESIGN.borderRadius);
        ctx.clip();

        // Multi-stop gradient
        const bgGradient = ctx.createLinearGradient(0, 0, this.width, this.height);
        bgGradient.addColorStop(0, this.backgroundColor);
        bgGradient.addColorStop(0.3, DESIGN.colors.bgSecondary);
        bgGradient.addColorStop(0.6, DESIGN.colors.bgTertiary);
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
                    const overlay = ctx.createLinearGradient(0, 0, 0, this.height);
                    overlay.addColorStop(0, 'rgba(13, 13, 26, 0.65)');
                    overlay.addColorStop(0.5, 'rgba(13, 13, 26, 0.55)');
                    overlay.addColorStop(1, 'rgba(13, 13, 26, 0.8)');
                    ctx.fillStyle = overlay;
                    ctx.fillRect(0, 0, this.width, this.height);
                }
            } catch {}
        }

        // Ambient glow left
        ctx.save();
        ctx.globalAlpha = 0.08;
        const glowGradient = ctx.createRadialGradient(150, 180, 0, 150, 180, 340);
        glowGradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`);
        glowGradient.addColorStop(0.5, `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, 0.4)`);
        glowGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = glowGradient;
        ctx.fillRect(0, 0, 500, 400);
        ctx.restore();

        // Ambient glow right
        ctx.save();
        ctx.globalAlpha = 0.04;
        const glow2 = ctx.createRadialGradient(this.width - 120, 50, 0, this.width - 120, 50, 200);
        glow2.addColorStop(0, `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, 1)`);
        glow2.addColorStop(1, 'transparent');
        ctx.fillStyle = glow2;
        ctx.fillRect(this.width - 320, 0, 320, 200);
        ctx.restore();

        ctx.restore();

        // === BANNER ===
        ctx.save();
        this.drawRoundedRect(ctx, 0, 0, this.width, this.height, DESIGN.borderRadius);
        ctx.clip();

        const bannerHeight = 140;
        const bannerGradient = ctx.createLinearGradient(0, 0, this.width, bannerHeight);
        bannerGradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`);
        bannerGradient.addColorStop(0.4, `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, 0.1)`);
        bannerGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = bannerGradient;
        ctx.fillRect(0, 0, this.width, bannerHeight);

        // Diagonal line pattern in banner
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.04)`;
        ctx.lineWidth = 1;
        for (let i = -bannerHeight; i < this.width + bannerHeight; i += 50) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i + bannerHeight * 1.5, bannerHeight);
            ctx.stroke();
        }

        ctx.restore();

        // === AVATAR ===
        const avatarSize = 150;
        const avatarX = DESIGN.padding;
        const avatarY = bannerHeight - avatarSize / 2 - 10;
        const avatarCenterX = avatarX + avatarSize / 2;
        const avatarCenterY = avatarY + avatarSize / 2;

        // Avatar glow
        ctx.save();
        ctx.shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`;
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2 + 7, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
        ctx.fill();
        ctx.restore();

        try {
            const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 512 });
            const avatar = await imageCache.loadWithCache(avatarUrl, 5000);
            if (avatar) {
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

                // Accent ring
                const ringGradient = ctx.createConicGradient(0, avatarCenterX, avatarCenterY);
                ringGradient.addColorStop(0, this.accentColor);
                ringGradient.addColorStop(0.3, this.secondaryAccent);
                ringGradient.addColorStop(0.6, this.accentColor);
                ringGradient.addColorStop(1, this.secondaryAccent);
                ctx.strokeStyle = ringGradient;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2 + 8, 0, Math.PI * 2);
                ctx.stroke();
            }
        } catch {}

        // Status indicator
        const statusX = avatarX + avatarSize - 14;
        const statusY = avatarY + avatarSize - 14;
        ctx.beginPath();
        ctx.arc(statusX, statusY, 14, 0, Math.PI * 2);
        ctx.fillStyle = this.backgroundColor;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(statusX, statusY, 9, 0, Math.PI * 2);
        ctx.fillStyle = '#22c55e';
        ctx.fill();

        // === NAME TEXT ===
        const infoX = avatarX + avatarSize + 24;
        let infoY = avatarY + 46;

        ctx.font = this.getBoldFont(DESIGN.fonts.title);
        ctx.fillStyle = this.textColor;
        const displayName = this.truncateText(ctx, user.globalName || user.username, 340);
        await this.drawText(ctx, displayName, infoX, infoY);

        ctx.font = this.getFont(DESIGN.fonts.subtitle);
        ctx.fillStyle = DESIGN.colors.textMuted;
        await this.drawText(ctx, `@${user.username}`, infoX, infoY + 20);

        // === RANK & LEVEL BADGES ===
        const topBoxY = 18;
        const topBoxHeight = 46;
        const topBoxWidth = 82;
        const boxGap = 10;

        if (data.rank > 0) {
            const rankBoxX = this.width - DESIGN.padding - topBoxWidth;
            this.drawBox(ctx, rankBoxX, topBoxY, topBoxWidth, topBoxHeight, this.secondaryAccent);

            ctx.font = this.getSemiBoldFont(DESIGN.fonts.label);
            ctx.fillStyle = DESIGN.colors.textMuted;
            ctx.textAlign = 'center';
            ctx.fillText('RANK', rankBoxX + topBoxWidth / 2, topBoxY + 15);

            const rankText = `#${data.rank}`;
            const rankSize = this.fitText(ctx, rankText, topBoxWidth - 16, 19, 13);
            ctx.font = this.getBoldFont(rankSize);
            ctx.fillStyle = this.secondaryAccent;
            ctx.fillText(rankText, rankBoxX + topBoxWidth / 2, topBoxY + 36);
            ctx.textAlign = 'left';
        }

        const levelBoxX = this.width - DESIGN.padding - topBoxWidth - (data.rank > 0 ? topBoxWidth + boxGap : 0);
        const levelBoxY = topBoxY + topBoxHeight + boxGap;
        const levelBoxWidth = data.rank > 0 ? topBoxWidth * 2 + boxGap : topBoxWidth;
        const levelBoxHeight = 50;

        this.drawBox(ctx, levelBoxX, levelBoxY, levelBoxWidth, levelBoxHeight, this.accentColor);

        ctx.font = this.getSemiBoldFont(DESIGN.fonts.label);
        ctx.fillStyle = DESIGN.colors.textMuted;
        ctx.textAlign = 'center';
        ctx.fillText('LEVEL', levelBoxX + levelBoxWidth / 2, levelBoxY + 16);

        const levelText = data.level.toString();
        const levelSize = this.fitText(ctx, levelText, levelBoxWidth - 20, 22, 14);
        ctx.font = this.getBoldFont(levelSize);
        ctx.fillStyle = this.accentColor;
        ctx.fillText(levelText, levelBoxX + levelBoxWidth / 2, levelBoxY + 40);
        ctx.textAlign = 'left';

        // === PROGRESS BAR ===
        const progressY = avatarY + avatarSize + 20;
        const progressX = DESIGN.padding;
        const progressWidth = this.width - DESIGN.padding * 2;
        const progressHeight = 14;
        const progressRadius = progressHeight / 2;

        ctx.font = this.getSemiBoldFont(DESIGN.fonts.label);
        ctx.fillStyle = DESIGN.colors.textMuted;
        ctx.fillText('EXPERIENCE', progressX, progressY - 7);

        const xpText = `${this.formatNumber(data.currentXp)} / ${this.formatNumber(data.requiredXp)} XP`;
        ctx.textAlign = 'right';
        ctx.fillText(xpText, progressX + progressWidth, progressY - 7);
        ctx.textAlign = 'left';

        // Bar background
        ctx.fillStyle = 'rgba(30, 30, 60, 0.8)';
        this.drawRoundedRect(ctx, progressX, progressY, progressWidth, progressHeight, progressRadius);
        ctx.fill();

        // Progress fill
        const progress = Math.min(data.currentXp / data.requiredXp, 1);
        const filledWidth = Math.max(progressWidth * progress, progressHeight);

        const progressGradient = ctx.createLinearGradient(progressX, 0, progressX + progressWidth, 0);
        progressGradient.addColorStop(0, this.accentColor);
        progressGradient.addColorStop(0.5, this.secondaryAccent);
        progressGradient.addColorStop(1, this.accentColor);
        ctx.fillStyle = progressGradient;
        this.drawRoundedRect(ctx, progressX, progressY, filledWidth, progressHeight, progressRadius);
        ctx.fill();

        // Glossy highlight
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(progressX, progressY, filledWidth, progressHeight / 2);
        ctx.restore();

        // Percentage
        ctx.font = this.getBoldFont(8);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(progress * 100)}%`, progressX + progressWidth / 2, progressY + progressHeight / 2 + 3);
        ctx.textAlign = 'left';

        // === STAT BOXES ===
        const statsY = progressY + 34;
        const statGap = 10;
        const statWidth = (this.width - DESIGN.padding * 2 - statGap * 3) / 4;
        const statHeight = 64;

        const stats = [
            { label: 'MESSAGES', value: this.formatNumber(data.messageCount), iconId: '1473038936241864865', color: this.secondaryAccent },
            { label: 'VOICE TIME', value: this.formatVoiceTime(data.voiceTime), iconId: '1473039068546732214', color: '#a78bfa' },
            { label: 'REPUTATION', value: data.reputation.toString(), iconId: '1473038501766369300', color: this.accentColor },
            { label: 'BALANCE', value: this.formatNumber(data.balance), iconId: '1473377877239140529', color: '#fbbf24' }
        ];

        for (let i = 0; i < stats.length; i++) {
            const statX = DESIGN.padding + i * (statWidth + statGap);
            const stat = stats[i];
            const padding = 12;
            const iconSize = 16;

            this.drawBox(ctx, statX, statsY, statWidth, statHeight, stat.color);

            const iconImg = await this.loadEmoji('', true, stat.iconId, stat.animated);
            if (iconImg) {
                ctx.drawImage(iconImg, statX + padding, statsY + 10, iconSize, iconSize);
            }

            ctx.font = this.getSemiBoldFont(DESIGN.fonts.tiny);
            ctx.fillStyle = DESIGN.colors.textMuted;
            const labelMaxWidth = statWidth - padding * 2 - iconSize - 6;
            const label = this.truncateText(ctx, stat.label, labelMaxWidth);
            ctx.fillText(label, statX + padding + iconSize + 6, statsY + 20);

            const valueSize = this.fitText(ctx, stat.value, statWidth - padding * 2, DESIGN.fonts.smallValue, 11);
            ctx.font = this.getBoldFont(valueSize);
            ctx.fillStyle = stat.color;
            ctx.fillText(stat.value, statX + padding, statsY + 47);
        }

        // === BADGES ===
        if (data.customBadges && data.customBadges.length > 0) {
            const badgesY = statsY + statHeight + 16;
            const badgeSize = 34;
            const badgeSpacing = 7;
            const availableWidth = this.width - DESIGN.padding * 2;
            const maxBadges = Math.floor(availableWidth / (badgeSize + badgeSpacing));
            const displayBadges = data.customBadges.slice(0, Math.min(maxBadges, 18));

            ctx.font = this.getSemiBoldFont(DESIGN.fonts.label);
            ctx.fillStyle = DESIGN.colors.textMuted;
            ctx.fillText('BADGES', DESIGN.padding, badgesY - 5);

            let badgeX = DESIGN.padding;
            for (let i = 0; i < displayBadges.length; i++) {
                const badge = displayBadges[i];
                const badgeColor = badge.color || this.accentColor;

                this.drawBadgeBox(ctx, badgeX, badgesY, badgeSize, badgeColor);

                const iconPadding = 5;
                const iconSize = badgeSize - iconPadding * 2;

                let badgeRendered = false;

                if (badge.imageUrl && badge.imageUrl.startsWith('http')) {
                    try {
                        const badgeImg = await imageCache.loadWithCache(badge.imageUrl, 3000);
                        if (badgeImg) {
                            ctx.save();
                            this.drawRoundedRect(ctx, badgeX + iconPadding, badgesY + iconPadding, iconSize, iconSize, 5);
                            ctx.clip();
                            ctx.drawImage(badgeImg, badgeX + iconPadding, badgesY + iconPadding, iconSize, iconSize);
                            ctx.restore();
                            badgeRendered = true;
                        }
                    } catch {}
                }

                if (!badgeRendered && badge.emoji) {
                    const isCustomEmoji = badge.emoji.startsWith('<');
                    const emojiId = badge.emoji.match(/:(\d+)>/)?.[1];
                    const isAnimated = badge.emoji.startsWith('<a:');
                    const badgeImg = await this.loadEmoji(badge.emoji, isCustomEmoji, emojiId, isAnimated);
                    if (badgeImg) {
                        ctx.drawImage(badgeImg, badgeX + iconPadding, badgesY + iconPadding, iconSize, iconSize);
                    }
                }

                badgeX += badgeSize + badgeSpacing;
            }

            if (data.customBadges.length > displayBadges.length) {
                const moreCount = data.customBadges.length - displayBadges.length;
                ctx.font = this.getSemiBoldFont(10);
                ctx.fillStyle = DESIGN.colors.textDim;
                ctx.fillText(`+${moreCount}`, badgeX + 4, badgesY + badgeSize / 2 + 4);
            }
        }

        // === BIO ===
        if (data.bio) {
            const bioY = this.height - 36;
            ctx.font = this.getFont(DESIGN.fonts.subtitle);
            ctx.fillStyle = DESIGN.colors.textMuted;
            const bioText = `"${data.bio}"`;
            await this.drawText(ctx, bioText, DESIGN.padding, bioY);
        }

        // === FOOTER ===
        ctx.font = this.getFont(DESIGN.fonts.tiny);
        ctx.fillStyle = DESIGN.colors.textDim;
        ctx.textAlign = 'right';
        ctx.fillText(`ID: ${user.id}`, this.width - 18, this.height - 10);
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

module.exports = ProfileCard;
