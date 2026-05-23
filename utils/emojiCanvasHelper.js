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
 * Respects ctx.textAlign ('left', 'center', 'right') AND ctx.textBaseline
 * ('alphabetic', 'middle', 'top', 'bottom') for proper positioning.
 *
 * Emoji size defaults to fontSize × 1.15 to match the visual cap-height
 * of the rendered text (Twemoji's PNGs have built-in padding so 1:1
 * sizing makes them look smaller than the surrounding glyphs).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} fontSize
 * @param {number} [emojiSize] - Size of emoji images. Defaults to ~1.15× fontSize.
 */
async function drawTextWithEmoji(ctx, text, x, y, fontSize, emojiSize) {
  if (!text) return;
  if (!emojiSize) emojiSize = Math.round(fontSize * 1.15);

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

  // ── Compute emoji vertical offset based on textBaseline ──
  // We want the emoji centered on the same visual line as the text.
  // - alphabetic (default): text baseline sits at `y`; the cap-height
  //   above is roughly fontSize × 0.75. Center the emoji on that.
  // - middle: y is the vertical center of the line; emoji top = y - emojiSize/2.
  // - top:    y is the line top; emoji top = y + (fontSize - emojiSize) / 2.
  // - bottom: y is the line bottom; emoji top = y - emojiSize - (lineHeight - fontSize)/2.
  const baseline = ctx.textBaseline || 'alphabetic';
  let emojiYOffset;
  switch (baseline) {
    case 'middle':
      emojiYOffset = -emojiSize / 2;
      break;
    case 'top':
    case 'hanging':
      emojiYOffset = (fontSize - emojiSize) / 2;
      break;
    case 'bottom':
    case 'ideographic':
      emojiYOffset = -emojiSize;
      break;
    case 'alphabetic':
    default:
      // Center the emoji on the text's visual midline, which sits
      // about 0.35 × fontSize above the baseline for most fonts.
      emojiYOffset = -emojiSize * 0.85;
      break;
  }

  // ── Second pass: draw everything left-to-right ──
  const savedAlign = ctx.textAlign;
  ctx.textAlign = 'left';

  for (const item of resolved) {
    if (item.kind === 'text') {
      ctx.fillText(item.content, currX, y);
    } else {
      ctx.drawImage(item.img, currX, y + emojiYOffset, emojiSize, emojiSize);
    }
    currX += item.width;
  }

  ctx.textAlign = savedAlign;
}

module.exports = { drawTextWithEmoji, loadCustomEmoji, loadUnicodeEmoji, parseSegments };