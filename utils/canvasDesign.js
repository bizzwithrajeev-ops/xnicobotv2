const { loadImage } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');
const imageCache = require('./imageCache');
const { getCanvasEmojiAssetUrl } = require('./canvasEmojiDefaults');
const { getFontHelpers, registerAllFonts } = require('./fontRegistry');

try { registerAllFonts(); } catch {}

const LOGO_PATH = path.join(__dirname, '../assets/images/nico-avatar.png');
let _cachedLogo = null;

async function getNicoLogo() {
    if (_cachedLogo) return _cachedLogo;
    try {
        if (fs.existsSync(LOGO_PATH)) {
            _cachedLogo = await loadImage(LOGO_PATH);
        }
    } catch {}
    return _cachedLogo;
}

async function drawNicoBranding(ctx, canvasW, canvasH, accentColor = '#7c3aed') {
    const logo = await getNicoLogo();
    const rgb = hexToRgb(accentColor);

    if (logo) {
        ctx.save();
        ctx.globalAlpha = 0.06;
        const wmSize = 160;
        const wmX = canvasW - wmSize - 30;
        const wmY = canvasH - wmSize - 10;
        ctx.beginPath();
        ctx.arc(wmX + wmSize / 2, wmY + wmSize / 2, wmSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(logo, wmX, wmY, wmSize, wmSize);
        ctx.restore();

        const logoSize = 20;
        const logoX = canvasW - 68;
        const logoY = canvasH - 28;

        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
        ctx.restore();

        const ringGrad = ctx.createConicGradient(0, logoX + logoSize / 2, logoY + logoSize / 2);
        ringGrad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`);
        ringGrad.addColorStop(0.5, `rgba(6,182,212,0.3)`);
        ringGrad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0.3)`);
        ctx.strokeStyle = ringGrad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 1, 0, Math.PI * 2);
        ctx.stroke();

        ctx.font = getSemiBoldFont(10);
        ctx.fillStyle = `rgba(255,255,255,0.25)`;
        ctx.textAlign = 'left';
        ctx.fillText('xNico', logoX + logoSize + 5, logoY + 14);
    } else {
        ctx.font = getSemiBoldFont(10);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.textAlign = 'right';
        ctx.fillText('xNico', canvasW - 14, canvasH - 10);
        ctx.textAlign = 'left';
    }
}

const DESIGN = {
    padding: 35,
    borderRadius: 24,
    boxRadius: 14,
    badgeRadius: 10,
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
        welcome: '#22c55e',
        leave: '#ef4444'
    },
    fonts: {
        title: 30,
        titleLarge: 40,
        username: 28,
        subtitle: 13,
        label: 10,
        message: 18,
        value: 18,
        smallValue: 16,
        small: 12,
        tiny: 9
    }
};

function getFont(size) { return `400 ${size}px Inter-Regular, Arial, sans-serif`; }
function getMediumFont(size) { return `500 ${size}px Inter-Medium, Arial, sans-serif`; }
function getBoldFont(size) { return `700 ${size}px Inter-Bold, Arial, sans-serif`; }
function getSemiBoldFont(size) { return `600 ${size}px Inter-SemiBold, Arial, sans-serif`; }

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 124, g: 58, b: 237 };
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
}

function formatVoiceTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function truncateText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (ctx.measureText(t + '...').width > maxWidth && t.length > 0) t = t.slice(0, -1);
    return t + '...';
}

function fitText(ctx, text, maxWidth, baseSize, minSize = 10) {
    for (let size = baseSize; size >= minSize; size--) {
        ctx.font = getBoldFont(size);
        if (ctx.measureText(text).width <= maxWidth) return size;
    }
    return minSize;
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
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

async function loadEmoji(emojiContent, isCustom = false, emojiId = null, animated = false, emojiName = '') {
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

function parseText(text) {
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

function measureText(ctx, text) {
    const parts = parseText(text);
    const fontSize = parseInt(ctx.font.match(/\d+/)?.[0]) || 20;
    const emojiSize = Math.round(fontSize * 1.3);
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

async function drawText(ctx, text, x, y, centered = false) {
    const parts = parseText(text);
    const fontSize = parseInt(ctx.font.match(/\d+/)?.[0]) || 20;
    const emojiSize = Math.round(fontSize * 1.3);

    let startX = x;
    if (centered) {
        const totalWidth = measureText(ctx, text);
        startX = x - totalWidth / 2;
    }

    // Force left-align so drawImage and fillText stay in sync
    const savedAlign = ctx.textAlign;
    ctx.textAlign = 'left';

    let currentX = startX;

    for (const part of parts) {
        if (part.type === 'text') {
            ctx.fillText(part.content, currentX, y);
            currentX += ctx.measureText(part.content).width;
        } else {
            const img = await loadEmoji(part.content || '', part.type === 'custom', part.id, part.animated, part.name);
            if (img) {
                ctx.drawImage(img, currentX, y - emojiSize * 0.75, emojiSize, emojiSize);
                currentX += emojiSize + 2;
            } else {
                // Emoji failed to load — render the name as text fallback
                // instead of leaving a blank gap
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

function drawBox(ctx, x, y, width, height, color, shadowBlur = 12) {
    const rgb = hexToRgb(color);
    
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = shadowBlur;
    ctx.fillStyle = 'rgba(20, 20, 45, 0.95)';
    drawRoundedRect(ctx, x, y, width, height, DESIGN.boxRadius);
    ctx.fill();
    ctx.restore();

    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, 'rgba(35, 35, 75, 0.92)');
    gradient.addColorStop(1, 'rgba(22, 22, 52, 0.95)');
    ctx.fillStyle = gradient;
    drawRoundedRect(ctx, x, y, width, height, DESIGN.boxRadius);
    ctx.fill();

    ctx.strokeStyle = color + DESIGN.colors.boxBorder;
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, x, y, width, height, DESIGN.boxRadius);
    ctx.stroke();
}

function drawBadgeBox(ctx, x, y, size, color) {
    const rgb = hexToRgb(color);
    
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(22, 22, 50, 0.95)';
    drawRoundedRect(ctx, x, y, size, size, DESIGN.badgeRadius);
    ctx.fill();
    ctx.restore();

    const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
    gradient.addColorStop(0, 'rgba(38, 38, 78, 0.92)');
    gradient.addColorStop(1, 'rgba(22, 22, 52, 0.95)');
    ctx.fillStyle = gradient;
    drawRoundedRect(ctx, x, y, size, size, DESIGN.badgeRadius);
    ctx.fill();

    ctx.strokeStyle = color + '55';
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, x, y, size, size, DESIGN.badgeRadius);
    ctx.stroke();
}

async function drawConicAvatarRing(ctx, avatar, x, y, size, primaryColor, secondaryColor, bgColor) {
    const rgb = hexToRgb(primaryColor);
    
    ctx.save();
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 + 6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`;
    ctx.fill();
    ctx.restore();

    if (avatar) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, x, y, size, size);
        ctx.restore();

        ctx.strokeStyle = bgColor;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2 + 2.5, 0, Math.PI * 2);
        ctx.stroke();

        const ringGradient = ctx.createConicGradient(0, x + size / 2, y + size / 2);
        ringGradient.addColorStop(0, primaryColor);
        ringGradient.addColorStop(0.5, secondaryColor);
        ringGradient.addColorStop(1, primaryColor);
        ctx.strokeStyle = ringGradient;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2 + 8, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function drawDiagonalLines(ctx, width, height, color, spacing = 45) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    for (let i = -height; i < width + height; i += spacing) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + height, height);
        ctx.stroke();
    }
}

function drawGradientBackground(ctx, width, height, primaryColor, secondaryColor) {
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, primaryColor);
    bgGradient.addColorStop(0.5, secondaryColor);
    bgGradient.addColorStop(1, primaryColor);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);
}

module.exports = {
    DESIGN,
    getFont,
    getMediumFont,
    getBoldFont,
    getSemiBoldFont,
    getFontHelpers,
    hexToRgb,
    formatNumber,
    formatVoiceTime,
    truncateText,
    fitText,
    drawRoundedRect,
    loadEmoji,
    parseText,
    measureText,
    drawText,
    drawBox,
    drawBadgeBox,
    drawConicAvatarRing,
    drawDiagonalLines,
    drawGradientBackground,
    getNicoLogo,
    drawNicoBranding
};
