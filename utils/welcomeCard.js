'use strict';

/**
 * welcomeCard.js — animated-feeling 1024×450 welcome card.
 *
 * Layout (top-down):
 *   <:Caretright:1473038207221502106> 6px accent gradient bar
 *   <:Caretright:1473038207221502106> Centered avatar with conic accent ring + status dot
 *   <:Caretright:1473038207221502106> Big "WELCOME" headline (welcome-green, glow)
 *   <:Caretright:1473038207221502106> Display name + @handle
 *   <:Caretright:1473038207221502106> Custom message OR member-count line
 *   <:Caretright:1473038207221502106> Server-name pill at the bottom
 *   <:Caretright:1473038207221502106> Faint xNico watermark in the corner
 *
 * All text routes through canvasDesign.drawText so emojis (custom +
 * Unicode) render correctly with proper baseline alignment.
 */

const { createCanvas } = require('@napi-rs/canvas');
const imageCache = require('./imageCache');
const {
    DESIGN, drawRoundedRect, drawText, measureText, truncateText,
    drawGradientBackground, drawDiagonalLines, drawAmbientGlow,
    drawBox, hexToRgb, rgba,
    getFont, getMediumFont, getBoldFont, getSemiBoldFont,
    getFontHelpers, drawNicoBranding,
} = require('./canvasDesign');

class WelcomeCard {
    constructor() {
        this.width = 1024;
        this.height = 450;
        this.backgroundColor = DESIGN.colors.bg;
        this.accentColor = DESIGN.colors.accent;
        this.textColor = DESIGN.colors.text;
        this.backgroundImage = null;
        this.backgroundOpacity = 0.35;
        this.fontFamily = 'Inter';
        this._fh = getFontHelpers('Inter');
    }

    /* ─────────── chainable setters ─────────── */
    setFont(family)             { this.fontFamily = family || 'Inter'; this._fh = getFontHelpers(this.fontFamily); return this; }
    setBackground(c)            { this.backgroundColor = c; return this; }
    setBackgroundImage(url)     { this.backgroundImage = url; return this; }
    setAccentColor(c)           { this.accentColor = c; return this; }
    setTextColor(c)             { this.textColor = c; return this; }
    setBackgroundOpacity(o)     { this.backgroundOpacity = Math.max(0, Math.min(1, o)); return this; }

    /* ─────────── per-family font helpers ─────────── */
    _font(s)        { return this._fh.getFont(s); }
    _medium(s)      { return this._fh.getMediumFont(s); }
    _semibold(s)    { return this._fh.getSemiBoldFont(s); }
    _bold(s)        { return this._fh.getBoldFont(s); }

    async generate(user, guild, memberCount, customMessage = null) {
        const W = this.width, H = this.height;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');

        const accentRgb = hexToRgb(this.accentColor);
        const secondaryRgb = hexToRgb(DESIGN.colors.secondary);

        /* ── 1. Clipped background ── */
        ctx.save();
        drawRoundedRect(ctx, 0, 0, W, H, DESIGN.borderRadius);
        ctx.clip();

        // Base gradient
        drawGradientBackground(ctx, W, H, this.backgroundColor, DESIGN.colors.bgSecondary);

        // Optional bg image
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
                    ctx.fillStyle = 'rgba(15, 15, 35, 0.75)';
                    ctx.fillRect(0, 0, W, H);
                }
            } catch {}
        }

        // Centred glow
        drawAmbientGlow(ctx, W / 2, H / 2, 350, this.accentColor, 0.12);

        // Diagonal texture
        ctx.save();
        ctx.globalAlpha = 0.05;
        drawDiagonalLines(ctx, W, H, this.accentColor, 50);
        ctx.restore();

        // Top accent bar
        const topBar = ctx.createLinearGradient(0, 0, W, 0);
        topBar.addColorStop(0,    this.accentColor);
        topBar.addColorStop(0.5,  DESIGN.colors.secondary);
        topBar.addColorStop(1,    this.accentColor);
        ctx.fillStyle = topBar;
        ctx.fillRect(0, 0, W, 6);

        ctx.restore();

        /* ── 2. Avatar ── */
        const avatarSize = 165;
        const avatarX = (W - avatarSize) / 2;
        const avatarY = 45;
        const avatarCx = avatarX + avatarSize / 2;
        const avatarCy = avatarY + avatarSize / 2;

        // Glow halo
        ctx.save();
        ctx.shadowColor = this.accentColor;
        ctx.shadowBlur = 35;
        ctx.beginPath();
        ctx.arc(avatarCx, avatarCy, avatarSize / 2 + 6, 0, Math.PI * 2);
        ctx.fillStyle = rgba(this.accentColor, 0.2);
        ctx.fill();
        ctx.restore();

        try {
            const avatar = await imageCache.loadWithCache(
                user.displayAvatarURL({ extension: 'png', size: 512 }),
                5000
            );
            if (avatar) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(avatarCx, avatarCy, avatarSize / 2, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
                ctx.restore();

                // Background ring (separates avatar from glow)
                ctx.strokeStyle = this.backgroundColor;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.arc(avatarCx, avatarCy, avatarSize / 2 + 2.5, 0, Math.PI * 2);
                ctx.stroke();

                // Conic accent ring
                const ring = ctx.createConicGradient(0, avatarCx, avatarCy);
                ring.addColorStop(0,   this.accentColor);
                ring.addColorStop(0.5, DESIGN.colors.secondary);
                ring.addColorStop(1,   this.accentColor);
                ctx.strokeStyle = ring;
                ctx.lineWidth = 3.5;
                ctx.beginPath();
                ctx.arc(avatarCx, avatarCy, avatarSize / 2 + 8, 0, Math.PI * 2);
                ctx.stroke();
            }
        } catch {}

        // Status dot (green = welcome)
        const sX = avatarX + avatarSize - 14;
        const sY = avatarY + avatarSize - 14;
        ctx.beginPath();
        ctx.arc(sX, sY, 16, 0, Math.PI * 2);
        ctx.fillStyle = this.backgroundColor;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sX, sY, 10, 0, Math.PI * 2);
        ctx.fillStyle = DESIGN.colors.welcome;
        ctx.fill();

        /* ── 3. Text stack ── */
        const textY = avatarY + avatarSize + 38;

        // Headline
        ctx.font = this._bold(DESIGN.fonts.titleLarge);
        ctx.fillStyle = DESIGN.colors.welcome;
        ctx.textAlign = 'center';
        ctx.shadowColor = DESIGN.colors.welcome;
        ctx.shadowBlur = 15;
        ctx.fillText('WELCOME', W / 2, textY);
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left';

        // Display name
        ctx.font = this._semibold(DESIGN.fonts.username);
        ctx.fillStyle = this.textColor;
        const displayName = truncateText(ctx, user.globalName || user.username, 400);
        await drawText(ctx, displayName, W / 2, textY + 42, true);

        // Handle
        ctx.font = this._font(DESIGN.fonts.label + 4);
        ctx.fillStyle = DESIGN.colors.textMuted;
        await drawText(ctx, `@${user.username}`, W / 2, textY + 68, true);

        // Message line
        ctx.font = this._medium(DESIGN.fonts.message);
        ctx.fillStyle = DESIGN.colors.textMuted;
        const msg = customMessage || `You are member #${memberCount.toLocaleString()}`;
        await drawText(ctx, msg, W / 2, textY + 100, true);

        /* ── 4. Server name pill ── */
        const pillW = 300;
        const pillH = 42;
        const pillX = (W - pillW) / 2;
        const pillY = H - 58;

        drawBox(ctx, pillX, pillY, pillW, pillH, this.accentColor, 8);

        ctx.font = this._semibold(DESIGN.fonts.label + 4);
        ctx.fillStyle = this.textColor;
        const serverName = truncateText(ctx, guild.name, pillW - 30);
        await drawText(ctx, serverName, W / 2, pillY + 27, true);

        await drawNicoBranding(ctx, W, H, this.accentColor);

        return canvas.toBuffer('image/png');
    }
}

module.exports = WelcomeCard;
