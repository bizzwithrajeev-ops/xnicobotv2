<div align="center">

<img src="https://img.shields.io/badge/xNico_Bot-5865F2?style=for-the-badge&logoColor=white" alt="xNico Bot" />

# xNico Bot

**A powerful, feature-rich Discord bot built for scale.**

[![Discord.js](https://img.shields.io/badge/discord.js-v14.25-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.js.org)
[![Node.js](https://img.shields.io/badge/node.js-v18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Commands](https://img.shields.io/badge/commands-540+-ED4245?style=flat-square)]()
[![Components](https://img.shields.io/badge/UI-Components_V2-CAD7E6?style=flat-square)]()
[![License](https://img.shields.io/badge/license-ISC-blue?style=flat-square)]()

[Invite Bot](https://discord.com/api/oauth2/authorize?client_id=BOT_CLIENT_ID&permissions=8&scope=bot%20applications.commands) · [Support Server](https://discord.gg/Zs35X7Umak) · [Vote on Top.gg](https://top.gg/bot)

</div>

---

## Overview

xNico is an all-in-one Discord bot with **540+ commands** spanning **14 categories** — moderation, music, economy, leveling, giveaways, tickets, image manipulation, social systems, and more. It uses Discord.js v14 Components V2 throughout for a modern, button-driven UI with paginated lists wherever output could overflow.

**Key highlights:**

- **Music** — Lavalink-powered playback from YouTube, Spotify, SoundCloud & Apple Music with filters, lyrics, 24/7 mode, autoplay, and saved playlists
- **Moderation** — Anti-Nuke, Anti-Raid, Anti-Alt, AutoMod, verification, threat-mode, and detailed audit logging
- **Economy** — Per-guild custom currency, banking, shops, gambling games (wheel, plinko, mines, tower, keno, limbo, crash and more), fishing, hunting, pets, PvP battles
- **Leveling** — XP tracking with custom rank cards, level roles, multipliers, and leaderboards
- **Engagement** — Welcomer, tickets, giveaways, starboard, polls, social-notify (YouTube/Twitch/Twitter/etc.), suggestion & feedback boards, AutoMeme scheduled poster
- **Premium** — User and server premium tiers with key generation, transfer, audit webhooks, and per-guild bot customization (prefix, embed color, branding)

---

## Command Categories

| Category | Count | Description |
|:---------|:-----:|:------------|
| Admin | 102+ | Moderation, AutoMod, Anti-Nuke/Raid, verification, logging |
| Utility | 95+ | Welcomer, tickets, giveaways, starboard, polls, invite tracking, AFK |
| Owner | 55+ | Bot management, eval, deploy, broadcasting, maintenance |
| Fun | 52+ | Games, trivia, Akinator, memes, calculators |
| Music | 47+ | Full Lavalink player with filters, queue, favorites, panels |
| Basic | 47+ | Server info, user info, roles, permissions, bot list |
| Economy | 30+ | Currency, shop, gambling, fishing, pets, battles, custom shop |
| Voice | 21+ | Join-to-create, voice roles, voice management |
| Image | 15+ | Blur, greyscale, rotate, border, pixelate, deepfry, sepia |
| Leveling | 12+ | XP, rank cards, level roles, multipliers |
| Backup | 12 | Config backups and full server structure backups |
| DM | 11 | Direct message commands |
| Social | 7 | Profiles, badges, marriage, reputation |
| Webhook | 6 | Create, send, edit, delete, manage webhooks |
| Automation | * | AutoMeme, autoresponder, autoreact, social-notify, ticket panels |

> Use `/help` or `-help` for the full interactive command menu — it has a dropdown per category, in-place pagination, and a search modal.

---

## Premium Features

xNico has both **user-tier** and **server-tier** premium. Either tier unlocks the full feature set within its scope. Owners can mint redeemable keys and gift, transfer, or audit them.

| Feature | Free | Premium |
|:--------|:----:|:-------:|
| Core music, moderation, economy, leveling | ✓ | ✓ |
| Bot customization (prefix, color, branding) | — | ✓ |
| Custom server currency (`/currency`) | — | ✓ |
| Custom shop (`/customshop`) | — | ✓ |
| Loans | — | ✓ |
| Profile customize (rank & profile cards) | — | ✓ |
| Suggestion & Feedback boards | — | ✓ |
| Confession system | — | ✓ |
| AI chat setup, Vanity Guard, Threat Mode (Super) | — | ✓ |
| Ticket setup with custom panels & welcome messages | — | ✓ |
| AutoMeme presets | basic | custom subreddits + 30m intervals |
| Join-to-Create interfaces | 1 | up to 10 + role gating |
| Music 24/7 mode | — | ✓ |
| Download command | — | ✓ |
| Command cooldown bypass | — | ✓ |

Activate with `/redeemkey <KEY>` (user) or `/redeemserverkey <KEY>` (server). Owners generate keys with `/genkey`.

---

## Tech Stack

| Component | Technology |
|:----------|:-----------|
| Runtime | Node.js 18+ |
| Library | discord.js 14.25 |
| Music Engine | Lavalink + lavalink-client |
| Canvas | @napi-rs/canvas |
| Storage | PostgreSQL via jsonStore (with file fallback) |
| Sharding | discord.js ShardingManager |

---

## Self-Hosting

### Prerequisites

- **Node.js** v18+
- **Java 17+** (for Lavalink)
- A Discord Bot Token from the [Developer Portal](https://discord.com/developers/applications)
- (Optional) PostgreSQL — falls back to local JSON files when no database is configured

### Quick Start

```bash
git clone https://github.com/rajeev-0007/xnicobot.git
cd xnicobot
npm install
cp .env.example .env   # Configure your token, owner ID, etc.
npm start              # Starts Lavalink + bot via shard.js
```

### Environment Variables

| Variable | Required | Description |
|:---------|:--------:|:------------|
| `TOKEN` | ✓ | Discord bot token |
| `OWNER_ID` | ✓ | Your Discord user ID |
| `PREFIX` | | Default command prefix (per-guild override via `/setprefix`) |
| `CLIENT_ID` | | Bot client ID (auto-detected from token) |
| `SUPPORT_SERVER` | | Support server invite URL |
| `BOT_WEBSITE` | | Public website URL (shown in `/botinfo`) |
| `WEBHOOK_PORT` | | Top.gg webhook port (default: `3000`) |
| `TOPGG_WEBHOOK_SECRET` | | Top.gg webhook auth secret (for receiving votes) |
| `TOPGG_TOKEN` | | Top.gg API token (for posting server count) |
| `PREMIUM_AUDIT_WEBHOOK` | | Optional Discord webhook for premium activation logs |

### Lavalink

Edit `config/lavalink-nodes.json` or use the runtime command:

```bash
-lavalinkconfig add <host> <port> <password> [name] [secure]
-lavalinkconfig list
-lavalinkconfig test
```

---

## Project Structure

```
xnicobot/
├── index.js              # Main entry point
├── shard.js              # Sharding manager
├── commands/
│   ├── admin/            # Moderation, security, automod, premium-gated panels
│   ├── automation/       # Welcomer, tickets, autoresponder, automeme, social-notify
│   ├── backup/           # Server & config backups
│   ├── basic/            # Info, role, server commands, help
│   ├── dm/               # Direct message commands
│   ├── economy/          # Currency, shop, gambling, pets, battles
│   ├── fun/              # Games, trivia, memes
│   ├── games/            # Trivia, Akinator, hangman, wordle
│   ├── image/            # Image manipulation
│   ├── leveling/         # XP, rank cards, level roles
│   ├── music/            # Lavalink music player
│   ├── owner/            # Bot management
│   ├── social/           # Profiles, badges, marriage
│   ├── stats/            # Activity tracking, leaderboards
│   ├── utility/          # AFK, reminder, snipe, premium tools, downloads
│   ├── voice/            # Join-to-create, VC management
│   └── webhook/          # Webhook commands
├── utils/                # Shared utilities
│   ├── pagination.js     # Reusable Components V2 pagination
│   ├── premiumManager.js # Premium key & tier logic
│   ├── currencyHelper.js # Per-guild currency overrides
│   ├── inviteManager.js  # Invite tracking
│   ├── backupManager.js  # Backup utilities
│   ├── autoMemePoster.js # Scheduled meme posting engine
│   ├── socialNotifyPoller.js  # YouTube/Twitch RSS poller
│   ├── interactionGuards.js   # Premium guards & safe-reply
│   └── ...
├── config/               # Lavalink & bot config
└── assets/               # Fonts, images, badges
```

---

## What's New

### Components V2 polish
- `botinfo` Music Engine block now shows real **Nodes**, **Sessions**, and **Playing** counts (previously read the wrong field and always showed `0`).
- Bot `@mention` reply rebuilt with avatar section, separators, live latency/uptime stats, and quick-action buttons (Commands, Invite, Support, Vote, Website).
- Help home page expanded with feature highlights and command/server stats.

### AutoMeme
- New `/automeme` system — admin-configurable scheduled meme poster.
- Subcommands: `setup`, `disable`, `reset`, `interval`, `category`, `add-sub`, `remove-sub`, `list-subs`, `ping`, `nsfw`, `test`, `status`.
- Pulls from curated category presets (English, Hindi, Anime, Gaming, Mixed) with image-only filtering, NSFW gating, and dedup against the last 50 posts per guild.
- Premium servers can add up to 5 custom subreddits and use intervals as low as 30 minutes; free tier is preset-only with a 60-minute floor.
- Per-post buttons: Source, Another, Settings.

### AFK rewrite
- New polished panel with **End AFK**, **Toggle DMs**, **Stats**, and **Help** buttons.
- Owner-only buttons (other users see a polite "you're not AFK" reply).
- Fixed double-count bug — sessions now increment exactly once per AFK.
- `afklist` now shows the actual reason instead of always `"AFK"` (was reading the wrong field).

### Currency sync
- Eight gambling commands (`wheel`, `tower`, `plinko`, `mines`, `limbo`, `keno`, `crash`, `customshop`) had a hardcoded coin emoji that ignored `/currency set`. They now follow the per-guild override at every render.
- `/currency reset` description and success message now match the helper's actual default.

### Premium gating polish
- New premium commands: `feedback`, `suggestion`, `ticket-categories setup`, `ticket-setup`, `customshop`, `currency`, `bot-customize`, `rank-customize`, `profile-customize`, `247`, `download`.
- Component-level guards on customize panels and ticket setup so panels fail closed when premium expires while a panel is still open.
- Modal-level gates on rank/profile customize submits.

### Pagination upgrades
- `vclist`, `vcmod`, `media-only list`, `leveling-ignore list` now paginate with the standard ≪ ◀ ▶ ≫ controls instead of overflowing the Components V2 4 000-char container cap.

### Bug fixes
- `birthday-setup` panel crashed (`Received one or more errors`) because the Hour select used empty-string descriptions for 22 of 24 options. Now omits the field except for Midnight/Noon markers.
- AutoMeme custom-font modal handler now respects premium gates.

---

## Support

- **Discord:** [discord.gg/Zs35X7Umak](https://discord.gg/Zs35X7Umak)
- **Top.gg:** [Vote](https://top.gg/bot)

---

<div align="center">

Built by **Rajeev** · © 2024–2026

</div>
