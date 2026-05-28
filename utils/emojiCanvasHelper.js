'use strict';

/**
 * emojiCanvasHelper.js — single source of truth for drawing strings
 * that mix plain text with Discord custom emojis (<a?:name:id>) AND
 * Unicode emojis (😀 🏆 🐺 🥇 …).
 *
 * Performance:
 *   • All emoji image loads in a single string are kicked off in
 *     parallel (Promise.all) instead of sequentially. Rendering a
 *     leaderboard with 10 rows × 3 emojis used to wait on 30 round
 *     trips back-to-back; now it waits on the longest single one.
 *   • The underlying imageCache layer dedups concurrent requests for
 *     the same URL and persists Twemoji to disk, so the second card
 *     onwards is essentially free.
 *
 * Layout:
 *   • Emoji size defaults to 1.0 × fontSize so it visually matches
 *     the cap-height of surrounding text (Twemoji glyphs ship with
 *     transparent padding).
 *   • Emoji vertical offset for the alphabetic baseline is
 *       y - 0.32 × fontSize - emojiSize / 2
 *     which centers the emoji on the visual midline of Latin glyphs.
 *   • A 2px inline gap is added on each emoji slot so adjacent text
 *     doesn't crash into the glyph.
 *   • Respects ctx.textAlign ('left' | 'center' | 'right' | 'end' |
 *     'start') and ctx.textBaseline ('alphabetic' | 'middle' | 'top'
 *     | 'hanging' | 'bottom' | 'ideographic').
 */

const emojiRegex = require('emoji-regex');
const imageCache = require('./imageCache');
const { getCanvasEmojiAssetUrl } = require('./canvasEmojiDefaults');

const CUSTOM_EMOJI_REGEX = /<(a?):(\w+):(\d+)>/g;
const EMOJI_GAP = 2;
const EMOJI_LOAD_TIMEOUT = 4000;

/* ─────────────────── loaders ─────────────────── */

async function loadCustomEmoji(emojiId = '', animated = false, emojiName = '') {
    const ext = animated ? 'gif' : 'png';
    const url = emojiId
        ? `https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=128&quality=lossless`
        : getCanvasEmojiAssetUrl(emojiName || 'emoji');
    if (!url) return null;
    return imageCache.loadWithCache(url, EMOJI_LOAD_TIMEOUT).catch(() => null);
}

async function loadUnicodeEmoji(emoji) {
    const url = getCanvasEmojiAssetUrl(emoji || 'emoji');
    if (!url) return null;
    return imageCache.loadWithCache(url, EMOJI_LOAD_TIMEOUT).catch(() => null);
}

/* ─────────────────── parser ─────────────────── */

function parseSegments(text) {
    if (!text) return [];
    const segments = [];
    const customMatches = [];

    // Custom Discord emojis
    const customRegex = new RegExp(CUSTOM_EMOJI_REGEX.source, 'g');
    let match;
    while ((match = customRegex.exec(text)) !== null) {
        customMatches.push({
            type: 'custom',
            index: match.index,
            length: match[0].length,
            animated: match[1] === 'a',
            name: match[2],
            id: match[3],
            content: match[0],
        });
    }

    // Unicode emojis (excluding those inside custom tags)
    const unicodeMatches = [];
    const unicodeRegex = emojiRegex();
    while ((match = unicodeRegex.exec(text)) !== null) {
        const inside = customMatches.some(
            (cm) => match.index >= cm.index && match.index < cm.index + cm.length
        );
        if (!inside) {
            unicodeMatches.push({
                type: 'unicode',
                index: match.index,
                length: match[0].length,
                content: match[0],
            });
        }
    }

    const all = [...customMatches, ...unicodeMatches].sort((a, b) => a.index - b.index);
    let lastIndex = 0;
    for (const m of all) {
        if (m.index > lastIndex) {
            segments.push({ type: 'text', content: text.substring(lastIndex, m.index) });
        }
        segments.push(m);
        lastIndex = m.index + m.length;
    }
    if (lastIndex < text.length) {
        segments.push({ type: 'text', content: text.substring(lastIndex) });
    }
    return segments;
}

/* ─────────────────── geometry helpers ─────────────────── */

function emojiYOffsetForBaseline(baseline, fontSize, emojiSize) {
    switch (baseline) {
        case 'middle':                              return -emojiSize / 2;
        case 'top':
        case 'hanging':                             return (fontSize - emojiSize) / 2;
        case 'bottom':
        case 'ideographic':                         return -emojiSize;
        case 'alphabetic':
        default:
            // Centre the emoji's vertical mid-line on the text's
            // visual mid-line, which sits ~0.32 × fontSize above the
            // alphabetic baseline at `y`.
            return -fontSize * 0.32 - emojiSize / 2;
    }
}

/**
 * Pure measurement — no drawing. Useful for centering containers that
 * wrap mixed emoji+text strings without doing two render passes.
 */
function measureMixedText(ctx, text, fontSize, emojiSize) {
    if (!emojiSize) {
        // Match the "px" size, NOT the leading font weight (e.g. "700 16px Inter-Bold").
        const fs = fontSize
            || parseInt(String(ctx.font || '').match(/(\d+(?:\.\d+)?)px/)?.[1])
            || 16;
        emojiSize = Math.round(fs * 1.0);
    }
    const segments = parseSegments(text);
    let width = 0;
    for (const seg of segments) {
        if (seg.type === 'text') {
            width += ctx.measureText(seg.content).width;
        } else {
            width += emojiSize + EMOJI_GAP;
        }
    }
    return width;
}

/* ─────────────────── main draw API ─────────────────── */

/**
 * Render a string with custom emojis, Unicode emojis and plain text.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x        Anchor x (interpreted via ctx.textAlign)
 * @param {number} y        Anchor y (interpreted via ctx.textBaseline)
 * @param {number} fontSize Numeric font size used for emoji sizing
 * @param {number} [emojiSize] Optional explicit emoji size (default = fontSize)
 * @returns {Promise<number>} Total width drawn (useful for inline layout)
 */
async function drawTextWithEmoji(ctx, text, x, y, fontSize, emojiSize) {
    if (!text) return 0;
    // Match the "px" size, NOT the leading font weight (e.g. "700 16px Inter-Bold").
    const fs = fontSize
        || parseInt(String(ctx.font || '').match(/(\d+(?:\.\d+)?)px/)?.[1])
        || 16;
    if (!emojiSize) emojiSize = Math.round(fs * 1.0);

    const segments = parseSegments(text);
    if (!segments.length) return 0;
    if (!ctx.font) ctx.font = `${fs}px sans-serif`;

    // ── Pass 1: kick off every emoji load in parallel ──
    // We map segment.index → resolved image so we can stitch results
    // back into the original order without forcing sequential awaits.
    const loadPromises = segments.map((seg) => {
        if (seg.type === 'custom') {
            return loadCustomEmoji(seg.id, seg.animated, seg.name || '');
        }
        if (seg.type === 'unicode') {
            return loadUnicodeEmoji(seg.content);
        }
        return null;
    });
    const images = await Promise.all(loadPromises);

    // ── Pass 2: walk segments left→right collecting widths ──
    const resolved = [];
    let totalWidth = 0;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (seg.type === 'text') {
            const w = ctx.measureText(seg.content).width;
            resolved.push({ kind: 'text', content: seg.content, width: w });
            totalWidth += w;
        } else {
            const img = images[i];
            if (img) {
                resolved.push({ kind: 'image', img, width: emojiSize + EMOJI_GAP });
                totalWidth += emojiSize + EMOJI_GAP;
            } else {
                // Fallback: keep the emoji's name visible so the user can
                // tell something was meant to be there.
                const fb = seg.type === 'custom' ? `:${seg.name}:` : seg.content;
                const w = ctx.measureText(fb).width;
                resolved.push({ kind: 'text', content: fb, width: w });
                totalWidth += w;
            }
        }
    }

    // ── Resolve start-x based on textAlign ──
    const align = ctx.textAlign || 'left';
    let currX = x;
    if (align === 'center')                            currX = x - totalWidth / 2;
    else if (align === 'right' || align === 'end')     currX = x - totalWidth;

    const baseline = ctx.textBaseline || 'alphabetic';
    const emojiYOffset = emojiYOffsetForBaseline(baseline, fs, emojiSize);

    // ── Pass 3: draw left→right with textAlign forced left ──
    const savedAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    for (const item of resolved) {
        if (item.kind === 'text') {
            ctx.fillText(item.content, currX, y);
        } else {
            ctx.drawImage(item.img, currX + EMOJI_GAP / 2, y + emojiYOffset, emojiSize, emojiSize);
        }
        currX += item.width;
    }
    ctx.textAlign = savedAlign;

    return totalWidth;
}

module.exports = {
    drawTextWithEmoji,
    measureMixedText,
    loadCustomEmoji,
    loadUnicodeEmoji,
    parseSegments,
};
