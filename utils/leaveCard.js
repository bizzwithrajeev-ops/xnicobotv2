const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const imageCache = require('./imageCache');
const { getCanvasEmojiAssetUrl } = require('./canvasEmojiDefaults');
const { registerAllFonts, getFontHelpers } = require('./fontRegistry');

try { registerAllFonts(); } catch (e) {}

const DESIGN = {
    padding: 40,
    borderRadius: 24,
    boxRadius: 14,
    colors: {
        bg: '#0f0f23',
        bgSecondary: '#1a1a3e',
        boxBg: 'rgba(30, 30, 65, 0.95)',
        boxBorder: '50',
        text: '#ffffff',
        textMuted: '#9ca3af',
        textDim: '#6b7280',
        accent: '#7c3aed',
        secondary: '#06b6d4',
        leave: '#ef4444'
    },
    fonts: {
        title: 40,
        username: 32,
        message: 18,
        label: 14,
        small: 12
    }
};

class LeaveCard {
    constructor() {
        this.width = 1024;
        this.height = 450;
        this.backgroundColor = DESIGN.colors.bg;
        this.accentColor = DESIGN.colors.leave;
        this.textColor = DESIGN.colors.text;
        this.backgroundImage = null;
        this.backgroundOpacity = 0.35;
        this.fontFamily = 'Inter';
        this._fh = getFontHelpers('Inter');
    }

    getFont(size) { return this._fh.getFont(size); }
    getMediumFont(size) { return this._fh.getMediumFont(size); }
    getBoldFont(size) { return this._fh.getBoldFont(size); }
    getSemiBoldFont(size) { return this._fh.getSemiBoldFont(size); }

    setFont(familyKey) { this.fontFamily = familyKey || 'Inter'; this._fh = getFontHelpers(this.fontFamily); return this; }
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

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 239, g: 68, b: 68 };
    }

    async loadEmoji(emojiContent, isCustom = false, emojiId = null, animated = false, emojiName = '') {
        try {
            if (isCustom && emojiId) {
                const url = `https://cdn.discordapp.com/emojis/${emojiId}.${animated ? 'gif' : 'png'}?size=128&quality=lossless`;
                return await imageCache.loadWithCache(url, 8000);
            } else {
                const url = getCanvasEmojiAssetUrl(emojiContent || emojiName || 'emoji');
                return url ? await imageCache.loadWithCache(url, 8000) : null;
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
        const emojiSize = Math.round(fontSize * 1.2);
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
        const emojiSize = Math.round(fontSize * 1.2);

        let startX = x;
        if (centered) {
            const totalWidth = this.measureText(ctx, text);
            startX = x - totalWidth / 2;
        }

        // Force left-align for manual positioning — drawImage uses absolute
        // coords so textAlign must be 'left' or emojis and text drift apart.
        const savedAlign = ctx.textAlign;
        ctx.textAlign = 'left';

        let currentX = startX;

        for (const part of parts) {
            if (part.type === 'text') {
                ctx.fillText(part.content, currentX, y);
                currentX += ctx.measureText(part.content).width;
            } else {
                const img = await this.loadEmoji(part.content || '', part.type === 'custom', part.id, part.animated, part.name);
                if (img) {
                    ctx.drawImage(img, currentX, y - emojiSize * 0.85, emojiSize, emojiSize);
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
        return currentX - startX;
    }

    truncateText(ctx, text, maxWidth) {
        if (ctx.measureText(text).width <= maxWidth) return text;
        let t = text;
        while (ctx.measureText(t + '...').width > maxWidth && t.length > 0) t = t.slice(0, -1);
        return t + '...';
    }

    drawBox(ctx, x, y, width, height, color, shadowBlur = 10) {
        const rgb = this.hexToRgb(color);
        
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = shadowBlur;
        ctx.fillStyle = 'rgba(20, 20, 45, 0.95)';
        this.drawRoundedRect(ctx, x, y, width, height, DESIGN.boxRadius);
        ctx.fill();
        ctx.restore();

        const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
        gradient.addColorStop(0, 'rgba(35, 35, 75, 0.92)');
        gradient.addColorStop(1, 'rgba(22, 22, 52, 0.95)');
        ctx.fillStyle = gradient;
        this.drawRoundedRect(ctx, x, y, width, height, DESIGN.boxRadius);
        ctx.fill();

        ctx.strokeStyle = color + DESIGN.colors.boxBorder;
        ctx.lineWidth = 1.5;
        this.drawRoundedRect(ctx, x, y, width, height, DESIGN.boxRadius);
        ctx.stroke();
    }

    async generate(user, guild, memberCount, customMessage = null) {
        const canvas = createCanvas(this.width, this.height);
        const ctx = canvas.getContext('2d');

        ctx.save();
        this.drawRoundedRect(ctx, 0, 0, this.width, this.height, DESIGN.borderRadius);
        ctx.clip();

        const bgGradient = ctx.createLinearGradient(0, 0, this.width, this.height);
        bgGradient.addColorStop(0, this.backgroundColor);
        bgGradient.addColorStop(0.5, DESIGN.colors.bgSecondary);
        bgGradient.addColorStop(1, this.backgroundColor);
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, this.width, this.height);

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
                    ctx.fillStyle = 'rgba(15, 15, 35, 0.75)';
                    ctx.fillRect(0, 0, this.width, this.height);
                }
            } catch {}
        }

        const rgb = this.hexToRgb(this.accentColor);
        const rgb2 = this.hexToRgb(DESIGN.colors.accent);

        ctx.save();
        ctx.globalAlpha = 0.08;
        const glowGradient = ctx.createRadialGradient(this.width / 2, this.height / 2, 0, this.width / 2, this.height / 2, 350);
        glowGradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`);
        glowGradient.addColorStop(0.5, `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, 0.2)`);
        glowGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = glowGradient;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.restore();

        ctx.restore();
        ctx.save();
        this.drawRoundedRect(ctx, 0, 0, this.width, this.height, DESIGN.borderRadius);
        ctx.clip();

        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.04)`;
        ctx.lineWidth = 1;
        for (let i = -this.height; i < this.width + this.height; i += 50) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i + this.height, this.height);
            ctx.stroke();
        }

        ctx.restore();

        const topBarGradient = ctx.createLinearGradient(0, 0, this.width, 0);
        topBarGradient.addColorStop(0, this.accentColor);
        topBarGradient.addColorStop(0.5, DESIGN.colors.accent);
        topBarGradient.addColorStop(1, this.accentColor);
        ctx.fillStyle = topBarGradient;
        ctx.save();
        this.drawRoundedRect(ctx, 0, 0, this.width, this.height, DESIGN.borderRadius);
        ctx.clip();
        ctx.fillRect(0, 0, this.width, 6);
        ctx.restore();

        const avatarSize = 165;
        const avatarX = (this.width - avatarSize) / 2;
        const avatarY = 45;

        ctx.save();
        ctx.shadowColor = this.accentColor;
        ctx.shadowBlur = 35;
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`;
        ctx.fill();
        ctx.restore();

        try {
            const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 512 });
            const avatar = await imageCache.loadWithCache(avatarUrl, 5000);
            if (avatar) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
                ctx.clip();
                ctx.filter = 'grayscale(40%)';
                ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
                ctx.filter = 'none';
                ctx.restore();

                ctx.strokeStyle = this.backgroundColor;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 2.5, 0, Math.PI * 2);
                ctx.stroke();

                const ringGradient = ctx.createConicGradient(0, avatarX + avatarSize / 2, avatarY + avatarSize / 2);
                ringGradient.addColorStop(0, this.accentColor);
                ringGradient.addColorStop(0.5, DESIGN.colors.accent);
                ringGradient.addColorStop(1, this.accentColor);
                ctx.strokeStyle = ringGradient;
                ctx.lineWidth = 3.5;
                ctx.beginPath();
                ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 8, 0, Math.PI * 2);
                ctx.stroke();
            }
        } catch {}

        const statusX = avatarX + avatarSize - 14;
        const statusY = avatarY + avatarSize - 14;
        ctx.beginPath();
        ctx.arc(statusX, statusY, 16, 0, Math.PI * 2);
        ctx.fillStyle = this.backgroundColor;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(statusX, statusY, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#6b7280';
        ctx.fill();

        const textY = avatarY + avatarSize + 38;

        ctx.font = this.getBoldFont(DESIGN.fonts.title);
        ctx.fillStyle = this.accentColor;
        ctx.textAlign = 'center';
        ctx.shadowColor = this.accentColor;
        ctx.shadowBlur = 15;
        ctx.fillText('GOODBYE', this.width / 2, textY);
        ctx.shadowBlur = 0;

        ctx.font = this.getSemiBoldFont(DESIGN.fonts.username);
        ctx.fillStyle = this.textColor;
        ctx.textAlign = 'left';
        const username = this.truncateText(ctx, user.globalName || user.username, 400);
        await this.drawText(ctx, username, this.width / 2, textY + 42, true);

        ctx.font = this.getFont(DESIGN.fonts.label);
        ctx.fillStyle = DESIGN.colors.textMuted;
        await this.drawText(ctx, `@${user.username}`, this.width / 2, textY + 68, true);

        if (customMessage) {
            ctx.font = this.getMediumFont(DESIGN.fonts.message);
            ctx.fillStyle = DESIGN.colors.textMuted;
            ctx.textAlign = 'left';
            await this.drawText(ctx, customMessage, this.width / 2, textY + 100, true);
        } else {
            ctx.font = this.getMediumFont(DESIGN.fonts.message);
            ctx.fillStyle = DESIGN.colors.textMuted;
            await this.drawText(ctx, `We now have ${memberCount.toLocaleString()} members`, this.width / 2, textY + 100, true);
        }

        const boxWidth = 300;
        const boxHeight = 42;
        const boxX = (this.width - boxWidth) / 2;
        const boxY = this.height - 58;

        this.drawBox(ctx, boxX, boxY, boxWidth, boxHeight, DESIGN.colors.accent, 8);

        ctx.font = this.getSemiBoldFont(DESIGN.fonts.label);
        ctx.fillStyle = this.textColor;
        ctx.textAlign = 'left';
        const serverName = this.truncateText(ctx, guild.name, boxWidth - 30);
        await this.drawText(ctx, serverName, this.width / 2, boxY + 27, true);

        const { drawNicoBranding } = require('./canvasDesign');
        await drawNicoBranding(ctx, this.width, this.height);

        return canvas.toBuffer('image/png');
    }
}

module.exports = LeaveCard;
