'use strict';

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const imageCache = require('./imageCache');
const { drawTextWithEmoji } = require('./emojiCanvasHelper');
const {
  DESIGN, getFont, getMediumFont, getBoldFont, getSemiBoldFont,
  hexToRgb, drawRoundedRect, drawBox, drawText,
  drawGradientBackground, drawDiagonalLines, drawConicAvatarRing,
  truncateText, fitText, drawNicoBranding
} = require('./canvasDesign');

/* ═══════════════════════════════════════════════════════
   FONT REGISTRATION
   ═══════════════════════════════════════════════════════ */

const { registerAllFonts, getFontHelpers } = require('./fontRegistry');
try {
  registerAllFonts();
} catch (e) { /* already registered */ }

/* ═══════════════════════════════════════════════════════
   SHARED PALETTE
   ═══════════════════════════════════════════════════════ */

const COLORS = {
  bg: '#0d0d1f',
  bgAlt: '#141432',
  card: 'rgba(22, 22, 55, 0.95)',
  cardBorder: 'rgba(80, 80, 160, 0.3)',
  gold: '#fbbf24',
  goldDark: '#d97706',
  green: '#22c55e',
  greenDark: '#16a34a',
  red: '#ef4444',
  redDark: '#dc2626',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  pink: '#ec4899',
  white: '#ffffff',
  muted: '#9ca3af',
  dim: '#6b7280',
  hpGreen: '#4ade80',
  hpYellow: '#facc15',
  hpRed: '#f87171',
  xpBar: '#7c3aed',
  xpBarBg: 'rgba(30, 30, 70, 0.8)',
};

/* ═══════════════════════════════════════════════════════
   HELPER FUNCTIONS
   ═══════════════════════════════════════════════════════ */

function formatNum(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return String(num);
}

function drawProgressBar(ctx, x, y, width, height, progress, colorFg, colorBg, radius = 6) {
  // Background
  ctx.fillStyle = colorBg;
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.fill();

  // Fill
  const fillWidth = Math.max(radius * 2, Math.min(width, width * Math.max(0, Math.min(1, progress))));
  if (fillWidth > 0) {
    const grad = ctx.createLinearGradient(x, y, x + fillWidth, y);
    grad.addColorStop(0, colorFg);
    grad.addColorStop(1, colorFg + 'cc');
    ctx.fillStyle = grad;
    drawRoundedRect(ctx, x, y, fillWidth, height, radius);
    ctx.fill();
  }
}

function drawGlowCircle(ctx, x, y, radius, color, blur = 20) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color + '30';
  ctx.fill();
  ctx.restore();
}

function drawStarField(ctx, width, height, count = 40) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = Math.random() * 1.5 + 0.5;
    const alpha = Math.random() * 0.5 + 0.1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fill();
  }
}

async function loadAvatar(url) {
  try {
    return await imageCache.loadWithCache(url, 5000);
  } catch {
    return null;
  }
}

function drawCircularAvatar(ctx, img, x, y, size) {
  if (!img) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, x, y, size, size);
  ctx.restore();
}

/* ═══════════════════════════════════════════════════════
   BALANCE CARD
   ═══════════════════════════════════════════════════════ */

async function createBalanceCard({ username, avatarURL, wallet, bank, total, level, xp, xpNeeded, streak, rank, fontFamily }) {
  const _fh = getFontHelpers(fontFamily || 'Inter');
  const getFont = (size) => _fh.getFont(size);
  const getMediumFont = (size) => _fh.getMediumFont(size);
  const getBoldFont = (size) => _fh.getBoldFont(size);
  const getSemiBoldFont = (size) => _fh.getSemiBoldFont(size);
  const W = 700, H = 320;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  drawGradientBackground(ctx, W, H, '#0a0a1e', '#12122e');
  drawStarField(ctx, W, H, 30);
  drawDiagonalLines(ctx, W, H, 'rgba(100, 100, 200, 0.03)', 30);

  // Glow
  drawGlowCircle(ctx, 120, H / 2, 80, COLORS.gold, 40);

  // Avatar
  const avatar = await loadAvatar(avatarURL);
  if (avatar) {
    // Ring
    ctx.save();
    ctx.shadowColor = COLORS.gold;
    ctx.shadowBlur = 25;
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(80, H / 2 - 10, 48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawCircularAvatar(ctx, avatar, 34, H / 2 - 56, 90);
  }

  // Username + Level badge
  ctx.font = getBoldFont(26);
  ctx.fillStyle = COLORS.white;
  ctx.fillText(username.length > 18 ? username.slice(0, 18) + '…' : username, 145, H / 2 - 40);

  // Level badge
  const lvlText = `Lv.${level || 1}`;
  ctx.font = getSemiBoldFont(13);
  const lvlW = ctx.measureText(lvlText).width + 16;
  const lvlX = 145 + ctx.measureText(username.length > 18 ? username.slice(0, 18) + '…' : username).width + 10;
  ctx.save();
  drawRoundedRect(ctx, 145, H / 2 - 54, lvlW + 20, 20, 10);
  ctx.fillStyle = COLORS.purple + '80';
  ctx.fill();
  ctx.fillStyle = COLORS.white;
  ctx.font = getSemiBoldFont(11);
  ctx.fillText(lvlText, 155, H / 2 - 40);
  ctx.restore();

  // XP Bar
  const xpBarX = 145, xpBarY = H / 2 - 25, xpBarW = 320, xpBarH = 8;
  drawProgressBar(ctx, xpBarX, xpBarY, xpBarW, xpBarH, (xp || 0) / (xpNeeded || 150), COLORS.xpBar, COLORS.xpBarBg, 4);
  ctx.font = getFont(10);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`${formatNum(xp || 0)} / ${formatNum(xpNeeded || 150)} XP`, xpBarX, xpBarY + 20);

  // Balance cards
  const cards = [
    { label: 'WALLET', value: wallet, icon: '💵', color: COLORS.green },
    { label: 'BANK', value: bank, icon: '<:Bank:1473039150927319192>', color: COLORS.blue },
    { label: 'NET WORTH', value: total, icon: '<:Sketch:1473038248493453352>', color: COLORS.gold },
  ];

  const cardW = 190, cardH = 70, cardY = H / 2 + 10, gap = 16;
  const startX = 35;

  for (let i = 0; i < cards.length; i++) {
    const cx = startX + i * (cardW + gap);
    const c = cards[i];

    // Card bg
    ctx.save();
    ctx.shadowColor = c.color + '40';
    ctx.shadowBlur = 12;
    drawRoundedRect(ctx, cx, cardY, cardW, cardH, 12);
    ctx.fillStyle = 'rgba(18, 18, 48, 0.9)';
    ctx.fill();
    ctx.strokeStyle = c.color + '40';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, cx, cardY, cardW, cardH, 12);
    ctx.stroke();
    ctx.restore();

    // Label
    ctx.font = getSemiBoldFont(10);
    ctx.fillStyle = c.color;
    ctx.fillText(c.label, cx + 14, cardY + 22);

    // Value
    ctx.font = getBoldFont(22);
    ctx.fillStyle = COLORS.white;
    ctx.fillText(formatNum(c.value), cx + 14, cardY + 50);
  }

  // Streak & Rank  (right side)
  if (streak > 0) {
    ctx.font = getSemiBoldFont(12);
    ctx.fillStyle = COLORS.gold;
    await drawTextWithEmoji(ctx, `<:Fire:1473038604812161218> ${streak}-day streak`, W - 150, 30, 12);
  }
  if (rank) {
    ctx.font = getSemiBoldFont(12);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`#${rank} Global`, W - 150, 50);
  }

  // Border
  ctx.strokeStyle = 'rgba(100, 100, 200, 0.15)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 1, 1, W - 2, H - 2, 20);
  ctx.stroke();

  await drawNicoBranding(ctx, W, H);

  return canvas.toBuffer('image/png');
}

/* ═══════════════════════════════════════════════════════
   BATTLE CARD
   ═══════════════════════════════════════════════════════ */

async function createBattleCard({ petA, petB, turnLog, result, rewards }) {
  const W = 750, H = 420;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  drawGradientBackground(ctx, W, H, '#0d0a1a', '#1a0d2e');
  drawStarField(ctx, W, H, 25);

  // Title
  ctx.font = getBoldFont(28);
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = 'center';
  await drawTextWithEmoji(ctx, '⚔️  BATTLE ARENA  ⚔️', W / 2, 40, 28);
  ctx.textAlign = 'left';

  // Divider
  const grad = ctx.createLinearGradient(50, 55, W - 50, 55);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(0.3, COLORS.purple + '60');
  grad.addColorStop(0.7, COLORS.purple + '60');
  grad.addColorStop(1, 'transparent');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(50, 55); ctx.lineTo(W - 50, 55); ctx.stroke();

  // Pet A (left)
  const petABox = { x: 30, y: 75, w: 320, h: 140 };
  await drawPetCard(ctx, petABox, petA, COLORS.cyan, true);

  // VS
  ctx.font = getBoldFont(30);
  ctx.fillStyle = COLORS.gold;
  ctx.textAlign = 'center';
  ctx.fillText('VS', W / 2, 155);
  ctx.textAlign = 'left';

  // Pet B (right)
  const petBBox = { x: W - 350, y: 75, w: 320, h: 140 };
  await drawPetCard(ctx, petBBox, petB, COLORS.red, false);

  // Turn log
  const logY = 230;
  ctx.font = getSemiBoldFont(13);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('BATTLE LOG', 35, logY);

  drawRoundedRect(ctx, 30, logY + 8, W - 60, 110, 10);
  ctx.fillStyle = 'rgba(15, 15, 40, 0.8)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(80, 80, 160, 0.2)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, 30, logY + 8, W - 60, 110, 10);
  ctx.stroke();

  ctx.font = getFont(12);
  const maxLines = Math.min(turnLog.length, 7);
  for (let i = 0; i < maxLines; i++) {
    ctx.fillStyle = turnLog[i].includes('CRIT') ? COLORS.gold :
                    turnLog[i].includes('miss') ? COLORS.dim :
                    COLORS.muted;
    const displayText = turnLog[i].length > 85 ? turnLog[i].slice(0, 82) + '...' : turnLog[i];
    await drawTextWithEmoji(ctx, displayText, 45, logY + 28 + i * 15, 12);
  }

  // Result bar
  const resY = H - 60;
  drawRoundedRect(ctx, 30, resY, W - 60, 45, 12);
  const resColor = result === 'win' ? COLORS.green : result === 'lose' ? COLORS.red : COLORS.gold;
  ctx.fillStyle = resColor + '20';
  ctx.fill();
  ctx.strokeStyle = resColor + '50';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, 30, resY, W - 60, 45, 12);
  ctx.stroke();

  ctx.font = getBoldFont(18);
  ctx.fillStyle = resColor;
  const resText = result === 'win' ? '🏆 VICTORY!' : result === 'lose' ? '💀 DEFEATED' : '⚖️ DRAW';
  await drawTextWithEmoji(ctx, resText, 50, resY + 28, 18);

  if (rewards) {
    ctx.font = getSemiBoldFont(14);
    ctx.fillStyle = COLORS.gold;
    ctx.textAlign = 'right';
    ctx.fillText(`+${formatNum(rewards.coins)} coins  +${rewards.exp} EXP`, W - 50, resY + 28);
    ctx.textAlign = 'left';
  }

  // Border
  ctx.strokeStyle = 'rgba(100, 80, 200, 0.2)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 1, 1, W - 2, H - 2, 18);
  ctx.stroke();

  await drawNicoBranding(ctx, W, H);

  return canvas.toBuffer('image/png');
}

async function drawPetCard(ctx, box, pet, accentColor, isLeft) {
  const { x, y, w, h } = box;

  // Card bg
  ctx.save();
  ctx.shadowColor = accentColor + '30';
  ctx.shadowBlur = 15;
  drawRoundedRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = 'rgba(18, 18, 50, 0.9)';
  ctx.fill();
  ctx.strokeStyle = accentColor + '40';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, x, y, w, h, 14);
  ctx.stroke();
  ctx.restore();

  // Pet emoji / name
  ctx.font = getBoldFont(32);
  await drawTextWithEmoji(ctx, pet.emoji || '🐾', x + 15, y + 40, 32);

  ctx.font = getBoldFont(18);
  ctx.fillStyle = COLORS.white;
  ctx.fillText(pet.name, x + 55, y + 30);

  ctx.font = getFont(12);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`Lv.${pet.level}  •  ${pet.rarity || 'common'}`, x + 55, y + 48);

  // HP Bar
  const hpPercent = Math.max(0, pet.hp / pet.maxHp);
  const hpColor = hpPercent > 0.5 ? COLORS.hpGreen : hpPercent > 0.25 ? COLORS.hpYellow : COLORS.hpRed;

  ctx.font = getSemiBoldFont(11);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('HP', x + 15, y + 75);

  drawProgressBar(ctx, x + 40, y + 66, w - 55, 12, hpPercent, hpColor, 'rgba(30, 30, 60, 0.8)', 6);

  ctx.font = getFont(10);
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.max(0, pet.hp)}/${pet.maxHp}`, x + w - 15, y + 76);
  ctx.textAlign = 'left';

  // Stats row
  const statY = y + 95;
  const stats = [
    { label: 'ATK', value: pet.atk, color: COLORS.red },
    { label: 'DEF', value: pet.def || 0, color: COLORS.blue },
    { label: 'SPD', value: pet.spd || 0, color: COLORS.green },
  ];

  stats.forEach((s, i) => {
    const sx = x + 15 + i * 100;
    ctx.font = getSemiBoldFont(10);
    ctx.fillStyle = s.color;
    ctx.fillText(s.label, sx, statY + 10);
    ctx.font = getBoldFont(16);
    ctx.fillStyle = COLORS.white;
    ctx.fillText(String(s.value), sx, statY + 30);
  });

  // Weapon
  if (pet.weapon) {
    ctx.font = getFont(10);
    ctx.fillStyle = COLORS.gold;
    await drawTextWithEmoji(ctx, `🗡️ ${pet.weapon.name} (+${pet.weapon.baseAtk})`, x + 15, y + h - 10, 10);
  }
}

/* ═══════════════════════════════════════════════════════
   PROFILE CARD (ECONOMY)
   ═══════════════════════════════════════════════════════ */

async function createEconomyProfileCard({ username, avatarURL, tag, wallet, bank, total, level, xp, xpNeeded, streak, rank, battlesWon, battlesLost, fishCaught, huntCount, achievements, title, pets, fontFamily }) {
  const _fh = getFontHelpers(fontFamily || 'Inter');
  const getFont = (size) => _fh.getFont(size);
  const getMediumFont = (size) => _fh.getMediumFont(size);
  const getBoldFont = (size) => _fh.getBoldFont(size);
  const getSemiBoldFont = (size) => _fh.getSemiBoldFont(size);
  const W = 800, H = 480;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  drawGradientBackground(ctx, W, H, '#080818', '#0f0f2d');
  drawStarField(ctx, W, H, 40);
  drawDiagonalLines(ctx, W, H, 'rgba(100, 100, 200, 0.02)', 25);

  // Top glow
  drawGlowCircle(ctx, W / 2, 0, 200, COLORS.purple, 60);

  // Header bar
  drawRoundedRect(ctx, 20, 15, W - 40, 80, 14);
  ctx.fillStyle = 'rgba(18, 18, 50, 0.85)';
  ctx.fill();
  ctx.strokeStyle = COLORS.purple + '40';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, 20, 15, W - 40, 80, 14);
  ctx.stroke();

  // Avatar
  const avatar = await loadAvatar(avatarURL);
  if (avatar) {
    ctx.save();
    ctx.shadowColor = COLORS.purple;
    ctx.shadowBlur = 15;
    ctx.strokeStyle = COLORS.purple;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(72, 55, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawCircularAvatar(ctx, avatar, 45, 28, 54);
  }

  // Username + title
  ctx.font = getBoldFont(24);
  ctx.fillStyle = COLORS.white;
  ctx.fillText(username.length > 20 ? username.slice(0, 20) + '…' : username, 115, 50);

  if (title) {
    ctx.font = getFont(12);
    ctx.fillStyle = COLORS.gold;
    ctx.fillText(title, 115, 68);
  }

  // Level + XP
  const lvlBadge = `Level ${level || 1}`;
  ctx.font = getSemiBoldFont(12);
  const badgeW = ctx.measureText(lvlBadge).width + 20;
  drawRoundedRect(ctx, W - 40 - badgeW, 30, badgeW, 24, 12);
  ctx.fillStyle = COLORS.purple + '60';
  ctx.fill();
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = 'center';
  ctx.fillText(lvlBadge, W - 40 - badgeW / 2, 47);
  ctx.textAlign = 'left';

  // XP bar
  drawProgressBar(ctx, W - 200, 62, 160, 8, (xp || 0) / (xpNeeded || 150), COLORS.xpBar, COLORS.xpBarBg, 4);
  ctx.font = getFont(9);
  ctx.fillStyle = COLORS.dim;
  ctx.fillText(`${formatNum(xp || 0)}/${formatNum(xpNeeded || 150)} XP`, W - 200, 82);

  // Row 1: Wealth cards
  const wealthY = 115;
  const wCards = [
    { label: 'WALLET', value: wallet, color: COLORS.green, icon: '💵' },
    { label: 'BANK', value: bank, color: COLORS.blue, icon: '<:Bank:1473039150927319192>' },
    { label: 'NET WORTH', value: total, color: COLORS.gold, icon: '<:Sketch:1473038248493453352>' },
    { label: 'RANK', value: rank ? `#${rank}` : '—', color: COLORS.purple, icon: '🏆' },
  ];

  const wcW = 175, wcH = 65, wcGap = 12;
  const wcStartX = (W - (wcW * 4 + wcGap * 3)) / 2;

  for (let i = 0; i < wCards.length; i++) {
    const c = wCards[i];
    const cx = wcStartX + i * (wcW + wcGap);
    ctx.save();
    ctx.shadowColor = c.color + '20';
    ctx.shadowBlur = 10;
    drawRoundedRect(ctx, cx, wealthY, wcW, wcH, 10);
    ctx.fillStyle = 'rgba(16, 16, 45, 0.9)';
    ctx.fill();
    ctx.strokeStyle = c.color + '30';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, cx, wealthY, wcW, wcH, 10);
    ctx.stroke();
    ctx.restore();

    // Icon
    ctx.font = getFont(14);
    await drawTextWithEmoji(ctx, c.icon, cx + wcW - 28, wealthY + 20, 14);

    ctx.font = getSemiBoldFont(9);
    ctx.fillStyle = c.color;
    ctx.fillText(c.label, cx + 12, wealthY + 18);

    ctx.font = getBoldFont(20);
    ctx.fillStyle = COLORS.white;
    const val = typeof c.value === 'number' ? formatNum(c.value) : c.value;
    ctx.fillText(val, cx + 12, wealthY + 46);
  }

  // Row 2: Stats boxes
  const statsY = 200;
  const statItems = [
    { label: 'BATTLES WON', value: battlesWon || 0, color: COLORS.red },
    { label: 'BATTLES LOST', value: battlesLost || 0, color: COLORS.dim },
    { label: 'FISH CAUGHT', value: fishCaught || 0, color: COLORS.cyan },
    { label: 'ANIMALS HUNTED', value: huntCount || 0, color: COLORS.green },
    { label: 'STREAK', value: `<:Fire:1473038604812161218> ${streak || 0}`, color: COLORS.gold },
  ];

  const stW = 136, stH = 55, stGap = 12;
  const stStartX = (W - (stW * 5 + stGap * 4)) / 2;

  for (let i = 0; i < statItems.length; i++) {
    const s = statItems[i];
    const sx = stStartX + i * (stW + stGap);
    drawRoundedRect(ctx, sx, statsY, stW, stH, 8);
    ctx.fillStyle = 'rgba(15, 15, 40, 0.85)';
    ctx.fill();
    ctx.strokeStyle = s.color + '25';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, sx, statsY, stW, stH, 8);
    ctx.stroke();

    ctx.font = getSemiBoldFont(8);
    ctx.fillStyle = s.color;
    ctx.fillText(s.label, sx + 10, statsY + 16);

    ctx.font = getBoldFont(18);
    ctx.fillStyle = COLORS.white;
    await drawTextWithEmoji(ctx, String(s.value), sx + 10, statsY + 40, 18);
  }

  // Achievements section
  const achY = 280;
  ctx.font = getSemiBoldFont(13);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('ACHIEVEMENTS', 35, achY);

  drawRoundedRect(ctx, 25, achY + 8, W - 50, 80, 10);
  ctx.fillStyle = 'rgba(15, 15, 40, 0.7)';
  ctx.fill();

  if (achievements && achievements.length > 0) {
    const achSlice = achievements.slice(0, 10);
    ctx.font = getFont(22);
    for (const [i, a] of achSlice.entries()) {
      const ax = 40 + i * 35;
      await drawTextWithEmoji(ctx, a.emoji || '🏅', ax, achY + 52, 22);
    }
    if (achievements.length > 10) {
      ctx.font = getFont(12);
      ctx.fillStyle = COLORS.dim;
      ctx.fillText(`+${achievements.length - 10} more`, 40 + 10 * 35 + 10, achY + 52);
    }
  } else {
    ctx.font = getFont(13);
    ctx.fillStyle = COLORS.dim;
    ctx.fillText('No achievements yet — keep playing!', 40, achY + 52);
  }

  // Active Pets section
  const petY = 380;
  ctx.font = getSemiBoldFont(13);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('PETS', 35, petY);

  drawRoundedRect(ctx, 25, petY + 8, W - 50, 75, 10);
  ctx.fillStyle = 'rgba(15, 15, 40, 0.7)';
  ctx.fill();

  if (pets && pets.length > 0) {
    const petSlice = pets.slice(0, 8);
    for (const [i, p] of petSlice.entries()) {
      const px = 40 + i * 90;
      ctx.font = getFont(22);
      await drawTextWithEmoji(ctx, p.emoji || '🐾', px, petY + 38, 22);
      ctx.font = getFont(10);
      ctx.fillStyle = COLORS.white;
      ctx.fillText(p.name, px + 28, petY + 35);
      ctx.fillStyle = COLORS.dim;
      ctx.fillText(`Lv.${p.level}`, px + 28, petY + 48);
    }
    if (pets.length > 8) {
      ctx.font = getFont(11);
      ctx.fillStyle = COLORS.dim;
      ctx.fillText(`+${pets.length - 8} more`, 40 + 8 * 90, petY + 42);
    }
  } else {
    ctx.font = getFont(13);
    ctx.fillStyle = COLORS.dim;
    ctx.fillText('No pets yet — use hunt to catch some!', 40, petY + 48);
  }

  // Outer border
  ctx.strokeStyle = 'rgba(100, 80, 200, 0.15)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 1, 1, W - 2, H - 2, 18);
  ctx.stroke();

  await drawNicoBranding(ctx, W, H);

  return canvas.toBuffer('image/png');
}

/* ═══════════════════════════════════════════════════════
   HUNT RESULT CARD
   ═══════════════════════════════════════════════════════ */

async function createHuntCard({ animal, caught, coins, rarity }) {
  const W = 500, H = 200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const rarityColors = {
    common: COLORS.muted,
    uncommon: COLORS.green,
    rare: COLORS.blue,
    epic: COLORS.purple,
    legendary: COLORS.gold,
    mythic: COLORS.pink,
  };

  const color = rarityColors[rarity] || COLORS.muted;

  drawGradientBackground(ctx, W, H, '#0a0a1c', '#141430');
  drawStarField(ctx, W, H, 15);

  // Glow behind animal
  drawGlowCircle(ctx, 80, H / 2, 45, color, 30);

  // Animal emoji big
  ctx.font = getBoldFont(50);
  ctx.textAlign = 'center';
  await drawTextWithEmoji(ctx, animal.emoji, 80, H / 2 + 18, 32);
  ctx.textAlign = 'left';

  // Info
  ctx.font = getBoldFont(22);
  ctx.fillStyle = COLORS.white;
  ctx.fillText(animal.name, 145, 55);

  // Rarity badge
  ctx.font = getSemiBoldFont(11);
  const rarityText = rarity.toUpperCase();
  const rtW = ctx.measureText(rarityText).width + 16;
  drawRoundedRect(ctx, 145, 62, rtW, 20, 10);
  ctx.fillStyle = color + '40';
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = getSemiBoldFont(10);
  ctx.fillText(rarityText, 153, 76);

  // Result
  ctx.font = getBoldFont(18);
  if (caught) {
    ctx.fillStyle = COLORS.green;
    ctx.fillText('✓ CAUGHT!', 145, 115);
    ctx.font = getFont(13);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('Added to your pets collection', 145, 135);
  } else {
    ctx.fillStyle = COLORS.red;
    ctx.fillText('✗ ESCAPED', 145, 115);
    ctx.font = getFont(13);
    ctx.fillStyle = COLORS.gold;
    ctx.fillText(`+${formatNum(coins)} coins earned`, 145, 135);
  }

  // Stats
  ctx.font = getFont(11);
  ctx.fillStyle = COLORS.dim;
  ctx.fillText(`HP: ${animal.baseHp}  ATK: ${animal.baseAtk}`, 145, H - 25);

  // Border
  ctx.strokeStyle = color + '30';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 1, 1, W - 2, H - 2, 16);
  ctx.stroke();

  await drawNicoBranding(ctx, W, H);

  return canvas.toBuffer('image/png');
}

/* ═══════════════════════════════════════════════════════
   FISH RESULT CARD
   ═══════════════════════════════════════════════════════ */

async function createFishCard({ fish, value, streak, rod }) {
  const W = 450, H = 180;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const rarityColors = {
    common: '#9ca3af',
    uncommon: '#22c55e',
    rare: '#3b82f6',
    epic: '#8b5cf6',
    legendary: '#fbbf24',
    mythic: '#ec4899',
  };
  const color = rarityColors[fish.rarity] || '#9ca3af';

  drawGradientBackground(ctx, W, H, '#0a1520', '#0d2035');

  // Waves effect
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    for (let x = 0; x < W; x += 5) {
      ctx.lineTo(x, H / 2 + Math.sin((x + i * 20) * 0.03) * 15 + i * 20);
    }
    ctx.stroke();
  }

  // Fish emoji
  drawGlowCircle(ctx, 70, H / 2, 35, color, 25);
  ctx.font = getBoldFont(40);
  ctx.textAlign = 'center';
  await drawTextWithEmoji(ctx, fish.emoji, 70, H / 2 + 14, 32);
  ctx.textAlign = 'left';

  // Info
  ctx.font = getBoldFont(20);
  ctx.fillStyle = COLORS.white;
  ctx.fillText(fish.name, 130, 45);

  ctx.font = getSemiBoldFont(10);
  const rtW = ctx.measureText(fish.rarity.toUpperCase()).width + 16;
  drawRoundedRect(ctx, 130, 52, rtW, 18, 9);
  ctx.fillStyle = color + '40';
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(fish.rarity.toUpperCase(), 138, 65);

  // Value
  ctx.font = getBoldFont(18);
  ctx.fillStyle = COLORS.gold;
  ctx.fillText(`+${formatNum(value)} coins`, 130, 100);

  // Rod info
  if (rod) {
    ctx.font = getFont(11);
    ctx.fillStyle = COLORS.dim;
    await drawTextWithEmoji(ctx, `🎣 ${rod}`, 130, 120, 11);
  }

  // Streak
  if (streak > 1) {
    ctx.font = getSemiBoldFont(12);
    ctx.fillStyle = COLORS.gold;
    await drawTextWithEmoji(ctx, `<:Fire:1473038604812161218> ${streak}x combo!`, 130, 145, 12);
  }

  // Border
  ctx.strokeStyle = color + '30';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 1, 1, W - 2, H - 2, 14);
  ctx.stroke();

  await drawNicoBranding(ctx, W, H);

  return canvas.toBuffer('image/png');
}

/* ═══════════════════════════════════════════════════════
   SLOTS CARD
   ═══════════════════════════════════════════════════════ */

async function createSlotsCard({ reels, bet, winnings, multiplier, jackpot }) {
  const W = 500, H = 220;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawGradientBackground(ctx, W, H, '#1a0a0a', '#2d0d1a');

  // Title
  ctx.font = getBoldFont(22);
  ctx.fillStyle = COLORS.gold;
  ctx.textAlign = 'center';
  await drawTextWithEmoji(ctx, '🎰  S L O T S  🎰', W / 2, 35, 22);

  // Slot machine frame
  const frameX = 80, frameY = 50, frameW = W - 160, frameH = 80;
  drawRoundedRect(ctx, frameX, frameY, frameW, frameH, 14);
  ctx.fillStyle = 'rgba(25, 10, 35, 0.9)';
  ctx.fill();
  ctx.strokeStyle = COLORS.gold + '60';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, frameX, frameY, frameW, frameH, 14);
  ctx.stroke();

  // Reels
  const reelW = frameW / 3;
  for (let i = 0; i < reels.length; i++) {
    const symbol = reels[i];
    const rx = frameX + i * reelW;

    // Dividers
    if (i > 0) {
      ctx.strokeStyle = COLORS.gold + '30';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rx, frameY + 10);
      ctx.lineTo(rx, frameY + frameH - 10);
      ctx.stroke();
    }

    ctx.font = getBoldFont(38);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.white;
    await drawTextWithEmoji(ctx, symbol, rx + reelW / 2, frameY + 55, 32);
  }
  ctx.textAlign = 'left';

  // Result
  const resY = 155;
  const won = winnings > 0;

  ctx.font = getBoldFont(18);
  ctx.fillStyle = won ? COLORS.green : COLORS.red;
  ctx.textAlign = 'center';
  await drawTextWithEmoji(ctx, won ? '<:Present:1473038450465706076> YOU WON!' : '💔 You lost', W / 2, resY, 18);

  ctx.font = getSemiBoldFont(14);
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = 'center';
  ctx.fillText(`Bet: ${formatNum(bet)}  •  ${won ? 'Won' : 'Lost'}: ${formatNum(won ? winnings : bet)}${multiplier > 1 ? `  •  ${multiplier}x` : ''}`, W / 2, resY + 22);

  if (jackpot) {
    ctx.font = getSemiBoldFont(12);
    ctx.fillStyle = COLORS.gold;
    await drawTextWithEmoji(ctx, `🏆 JACKPOT! +${formatNum(jackpot)}`, W / 2, resY + 42, 12);
  }
  ctx.textAlign = 'left';

  // Border
  ctx.strokeStyle = COLORS.gold + '20';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 1, 1, W - 2, H - 2, 14);
  ctx.stroke();

  await drawNicoBranding(ctx, W, H);

  return canvas.toBuffer('image/png');
}

/* ═══════════════════════════════════════════════════════
   COINFLIP CARD
   ═══════════════════════════════════════════════════════ */

async function createCoinflipCard({ choice, result, won, bet, winnings }) {
  const W = 400, H = 180;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawGradientBackground(ctx, W, H, '#0a0a1c', '#1a1a30');

  // Coin
  const coinEmoji = result === 'heads' ? '🪙' : '💿';
  drawGlowCircle(ctx, W / 2, 65, 35, won ? COLORS.gold : COLORS.red, 30);
  ctx.font = getBoldFont(45);
  ctx.textAlign = 'center';
  await drawTextWithEmoji(ctx, coinEmoji, W / 2, 80, 40);

  // Result text
  ctx.font = getBoldFont(20);
  ctx.fillStyle = won ? COLORS.green : COLORS.red;
  await drawTextWithEmoji(ctx, won ? '<:Present:1473038450465706076> YOU WON!' : '💔 YOU LOST', W / 2, 125, 20);

  ctx.font = getSemiBoldFont(13);
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = 'center';
  ctx.fillText(`Flipped: ${result.toUpperCase()}  •  Your pick: ${choice.toUpperCase()}`, W / 2, 148);

  ctx.font = getSemiBoldFont(14);
  ctx.fillStyle = won ? COLORS.gold : COLORS.red;
  ctx.fillText(won ? `+${formatNum(winnings)} coins` : `-${formatNum(bet)} coins`, W / 2, 168);
  ctx.textAlign = 'left';

  // Border
  ctx.strokeStyle = (won ? COLORS.gold : COLORS.red) + '25';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 1, 1, W - 2, H - 2, 14);
  ctx.stroke();

  await drawNicoBranding(ctx, W, H);

  return canvas.toBuffer('image/png');
}

/* ═══════════════════════════════════════════════════════
   ADVENTURE CARD
   ═══════════════════════════════════════════════════════ */

async function createAdventureCard({ scene, stages, currentStage, pet, rewards, result }) {
  const W = 600, H = 300;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const biomeColors = {
    forest: ['#0a1a0a', '#0d2d0d'],
    cave: ['#0a0a1a', '#1a0a2a'],
    ocean: ['#0a1520', '#0d2535'],
    volcano: ['#1a0a0a', '#2d0d0d'],
    sky: ['#0a0a2a', '#0d1a3d'],
  };
  const [c1, c2] = biomeColors[scene.biome] || biomeColors.forest;
  drawGradientBackground(ctx, W, H, c1, c2);
  drawStarField(ctx, W, H, 20);

  // Title
  ctx.font = getBoldFont(20);
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = 'center';
  await drawTextWithEmoji(ctx, `🗺️ ${scene.name}`, W / 2, 30, 20);
  ctx.textAlign = 'left';

  // Progress bar
  ctx.font = getSemiBoldFont(10);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('PROGRESS', 30, 55);
  drawProgressBar(ctx, 30, 60, W - 60, 10, currentStage / stages, COLORS.green, COLORS.xpBarBg, 5);
  ctx.font = getFont(9);
  ctx.fillStyle = COLORS.dim;
  ctx.fillText(`Stage ${currentStage}/${stages}`, W - 100, 55);

  // Pet section
  if (pet) {
    drawRoundedRect(ctx, 25, 85, 160, 80, 10);
    ctx.fillStyle = 'rgba(15, 15, 40, 0.8)';
    ctx.fill();

    ctx.font = getBoldFont(24);
    await drawTextWithEmoji(ctx, pet.emoji || '🐾', 40, 120, 24);
    ctx.font = getSemiBoldFont(14);
    ctx.fillStyle = COLORS.white;
    ctx.fillText(pet.name, 70, 110);
    ctx.font = getFont(11);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`Lv.${pet.level}  HP: ${pet.hp}/${pet.maxHp}`, 70, 128);

    // Mini HP bar
    drawProgressBar(ctx, 40, 145, 130, 6, pet.hp / pet.maxHp, COLORS.hpGreen, COLORS.xpBarBg, 3);
  }

  // Event area
  drawRoundedRect(ctx, 200, 85, W - 225, 80, 10);
  ctx.fillStyle = 'rgba(15, 15, 40, 0.6)';
  ctx.fill();
  ctx.font = getFont(13);
  ctx.fillStyle = COLORS.white;
  const eventText = scene.event || 'Exploring...';
  const words = eventText.split(' ');
  let line = '', ly = 110;
  for (const word of words) {
    if (ctx.measureText(line + word).width > W - 260) {
      ctx.fillText(line, 215, ly);
      ly += 18;
      line = '';
    }
    line += word + ' ';
  }
  ctx.fillText(line, 215, ly);

  // Rewards
  if (result) {
    const resY = 190;
    drawRoundedRect(ctx, 25, resY, W - 50, 90, 12);
    const resColor = result === 'success' ? COLORS.green : COLORS.red;
    ctx.fillStyle = resColor + '15';
    ctx.fill();
    ctx.strokeStyle = resColor + '40';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, 25, resY, W - 50, 90, 12);
    ctx.stroke();

    ctx.font = getBoldFont(16);
    ctx.fillStyle = resColor;
    await drawTextWithEmoji(ctx, result === 'success' ? '🏆 Adventure Complete!' : '💀 Adventure Failed', 40, resY + 25, 16);

    if (rewards) {
      ctx.font = getSemiBoldFont(13);
      ctx.fillStyle = COLORS.gold;
      ctx.fillText(`+${formatNum(rewards.coins)} coins`, 40, resY + 48);
      ctx.fillStyle = COLORS.purple;
      ctx.fillText(`+${rewards.exp} XP`, 180, resY + 48);
      if (rewards.item) {
        ctx.fillStyle = COLORS.cyan;
        await drawTextWithEmoji(ctx, `<:Box:1473039115581915256> ${rewards.item}`, 280, resY + 48, 13);
      }
    }
  }

  // Border
  ctx.strokeStyle = 'rgba(80, 160, 80, 0.15)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 1, 1, W - 2, H - 2, 16);
  ctx.stroke();

  await drawNicoBranding(ctx, W, H);

  return canvas.toBuffer('image/png');
}

/* ═══════════════════════════════════════════════════════
   LEADERBOARD CARD
   ═══════════════════════════════════════════════════════ */

async function createLeaderboardCard({ entries, type, title: lbTitle }) {
  const rowH = 42;
  const headerH = 70;
  const padding = 25;
  const W = 700;
  const H = headerH + entries.length * rowH + padding * 2 + 20;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawGradientBackground(ctx, W, H, '#0a0a1e', '#12122e');
  drawStarField(ctx, W, H, 20);

  // Title
  ctx.font = getBoldFont(24);
  ctx.fillStyle = COLORS.gold;
  ctx.textAlign = 'center';
  await drawTextWithEmoji(ctx, lbTitle || `🏆 ${type === 'local' ? 'Server' : 'Global'} Leaderboard`, W / 2, 40, 24);
  ctx.textAlign = 'left';

  // Divider
  const divGrad = ctx.createLinearGradient(50, 55, W - 50, 55);
  divGrad.addColorStop(0, 'transparent');
  divGrad.addColorStop(0.3, COLORS.gold + '50');
  divGrad.addColorStop(0.7, COLORS.gold + '50');
  divGrad.addColorStop(1, 'transparent');
  ctx.strokeStyle = divGrad;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(50, 55); ctx.lineTo(W - 50, 55); ctx.stroke();

  const medals = ['🥇', '🥈', '🥉'];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const ry = headerH + i * rowH;

    // Row bg (alternating)
    if (i % 2 === 0) {
      drawRoundedRect(ctx, padding, ry, W - padding * 2, rowH - 4, 8);
      ctx.fillStyle = 'rgba(18, 18, 48, 0.5)';
      ctx.fill();
    }

    // Rank
    ctx.font = getBoldFont(18);
    ctx.fillStyle = i < 3 ? COLORS.gold : COLORS.muted;
    await drawTextWithEmoji(ctx, medals[i] || `#${i + 1}`, padding + 10, ry + 26, 18);

    // Avatar
    if (entry.avatar) {
      drawCircularAvatar(ctx, entry.avatar, padding + 55, ry + 4, 30);
    }

    // Name
    ctx.font = getSemiBoldFont(15);
    ctx.fillStyle = COLORS.white;
    const name = entry.name.length > 18 ? entry.name.slice(0, 18) + '…' : entry.name;
    ctx.fillText(name, padding + 95, ry + 22);

    // Coins
    ctx.font = getBoldFont(15);
    ctx.fillStyle = COLORS.gold;
    ctx.textAlign = 'right';
    ctx.fillText(`${formatNum(entry.total)} coins`, W - padding - 15, ry + 22);
    ctx.textAlign = 'left';

    // Wallet / Bank
    ctx.font = getFont(10);
    ctx.fillStyle = COLORS.dim;
    await drawTextWithEmoji(ctx, `💵 ${formatNum(entry.wallet)} | <:Bank:1473039150927319192> ${formatNum(entry.bank)}`, padding + 95, ry + 36, 10);
  }

  // Border
  ctx.strokeStyle = COLORS.gold + '15';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 1, 1, W - 2, H - 2, 16);
  ctx.stroke();

  await drawNicoBranding(ctx, W, H);

  return canvas.toBuffer('image/png');
}

/* ═══════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════ */

module.exports = {
  createBalanceCard,
  createBattleCard,
  createEconomyProfileCard,
  createHuntCard,
  createFishCard,
  createSlotsCard,
  createCoinflipCard,
  createAdventureCard,
  createLeaderboardCard,
  COLORS,
  formatNum,
  drawProgressBar,
  drawGlowCircle,
  drawCircularAvatar,
  loadAvatar,
};
