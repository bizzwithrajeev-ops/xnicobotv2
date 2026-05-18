const emojiRegex = require('emoji-regex');
const imageCache = require('./imageCache');
const { getCanvasEmojiAssetUrl } = require('./canvasEmojiDefaults');

// Regex for Discord custom emojis: <:name:id> or <a:name:id>
const CUSTOM_EMOJI_REGEX = /<(a?):(\w+):(\d+)>/g;

/**
 * Loads a favicon image to represent custom emoji in canvas rendering.
 * @param {string} emojiName - The custom emoji name
 * @returns {Promise<Image|null>}
 */
async function loadCustomEmoji(emojiId = '', animated = false, emojiName = '') {
  const ext = animated ? 'gif' : 'png';
  const customUrl = emojiId
    ? `https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=128&quality=lossless`
    : getCanvasEmojiAssetUrl(emojiName || 'emoji');
  try {
    return customUrl ? await imageCache.loadWithCache(customUrl, 4000) : null;
  } catch {
    return null;
  }
}

/**
 * Loads a Unicode emoji as a Twemoji image.
 * @param {string} emoji - The unicode emoji character
 * @returns {Promise<Image|null>}
 */
async function loadUnicodeEmoji(emoji) {
  const url = getCanvasEmojiAssetUrl(emoji || 'emoji');
  try {
    return url ? await imageCache.loadWithCache(url, 4000) : null;
  } catch {
    return null;
  }
}

/**
 * Parses text into segments of plain text, custom emojis, and unicode emojis.
 * @param {string} text
 * @returns {Array<{type: string, content: string, index: number, length: number, id?: string, animated?: boolean}>}
 */
function parseSegments(text) {
  if (!text) return [];
  const segments = [];
  const unicodeRegex = emojiRegex();

  // Collect all custom emoji matches
  let match;
  const customMatches = [];
  const customRegex = new RegExp(CUSTOM_EMOJI_REGEX.source, 'g');
  while ((match = customRegex.exec(text)) !== null) {
    customMatches.push({
      type: 'custom',
      index: match.index,
      length: match[0].length,
      animated: match[1] === 'a',
      name: match[2],
      id: match[3],
      content: match[0]
    });
  }

  // Collect all unicode emoji matches (excluding those inside custom emoji tags)
  const unicodeMatches = [];
  while ((match = unicodeRegex.exec(text)) !== null) {
    const isInsideCustom = customMatches.some(
      cm => match.index >= cm.index && match.index < cm.index + cm.length
    );
    if (!isInsideCustom) {
      unicodeMatches.push({
        type: 'unicode',
        index: match.index,
        length: match[0].length,
        content: match[0]
      });
    }
  }

  // Merge and sort all emoji matches by position
  const allMatches = [...customMatches, ...unicodeMatches].sort((a, b) => a.index - b.index);

  // Build segments with text in between
  let lastIndex = 0;
  for (const m of allMatches) {
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

/**
 * Draws a string with emojis on a canvas context.
 * Handles BOTH Discord custom emojis (<:name:id> / <a:name:id>) AND Unicode emojis.
 * Respects ctx.textAlign ('left', 'center', 'right') for proper positioning.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} fontSize
 * @param {number} [emojiSize=fontSize] - Size of emoji images
 */
async function drawTextWithEmoji(ctx, text, x, y, fontSize, emojiSize = fontSize) {
  if (!text) return;

  const segments = parseSegments(text);
  if (!segments.length) return;
  ctx.font = ctx.font || `${fontSize}px sans-serif`;

  // ── First pass: resolve images & calculate true widths ──
  const resolved = [];
  let totalWidth = 0;

  for (const seg of segments) {
    if (seg.type === 'text') {
      const w = ctx.measureText(seg.content).width;
      resolved.push({ kind: 'text', content: seg.content, width: w });
      totalWidth += w;
    } else if (seg.type === 'custom') {
      const img = await loadCustomEmoji(seg.id, seg.animated, seg.name || '');
      if (img) {
        resolved.push({ kind: 'image', img, width: emojiSize });
        totalWidth += emojiSize;
      } else {
        const fb = `:${seg.name}:`;
        const w = ctx.measureText(fb).width;
        resolved.push({ kind: 'text', content: fb, width: w });
        totalWidth += w;
      }
    } else if (seg.type === 'unicode') {
      const img = await loadUnicodeEmoji(seg.content);
      if (img) {
        resolved.push({ kind: 'image', img, width: emojiSize });
        totalWidth += emojiSize;
      } else {
        const w = ctx.measureText(seg.content).width;
        resolved.push({ kind: 'text', content: seg.content, width: w });
        totalWidth += w;
      }
    }
  }

  // ── Compute starting x based on textAlign ──
  const align = ctx.textAlign || 'left';
  let currX = x;
  if (align === 'center')                    currX = x - totalWidth / 2;
  else if (align === 'right' || align === 'end') currX = x - totalWidth;

  // ── Second pass: draw everything left-to-right ──
  const savedAlign = ctx.textAlign;
  ctx.textAlign = 'left';

  for (const item of resolved) {
    if (item.kind === 'text') {
      ctx.fillText(item.content, currX, y);
    } else {
      ctx.drawImage(item.img, currX, y - emojiSize * 0.8, emojiSize, emojiSize);
    }
    currX += item.width;
  }

  ctx.textAlign = savedAlign;
}

module.exports = { drawTextWithEmoji, loadCustomEmoji, loadUnicodeEmoji, parseSegments };