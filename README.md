<div align="center">

<img src="https://img.shields.io/badge/xNico_Bot-5865F2?style=for-the-badge&logoColor=white" alt="xNico Bot" />

# xNico Bot

**A powerful, feature-rich Discord bot built for scale.**

[![Discord.js](https://img.shields.io/badge/discord.js-v14.25-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.js.org)
[![Node.js](https://img.shields.io/badge/node.js-v18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Commands](https://img.shields.io/badge/commands-535+-ED4245?style=flat-square)]()
[![License](https://img.shields.io/badge/license-ISC-blue?style=flat-square)]()

[Invite Bot](https://discord.com/api/oauth2/authorize?client_id=BOT_CLIENT_ID&permissions=8&scope=bot%20applications.commands) · [Support Server](https://discord.gg/Zs35X7Umak) · [Vote on Top.gg](https://top.gg/bot)

</div>

---

## Overview

xNico is an all-in-one Discord bot with **535+ commands** spanning **14 categories** — moderation, music, economy, leveling, giveaways, tickets, image manipulation, social systems, and more. It uses Discord.js v14 Components V2 for a modern, interactive UI with paginated lists and button navigation throughout.

**Key highlights:**

- **Music** — Lavalink-powered playback from YouTube, Spotify, SoundCloud & Apple Music with filters, lyrics, 24/7 mode, and autoplay
- **Moderation** — Complete toolkit with Anti-Nuke, Anti-Raid, Anti-Alt, AutoMod, verification, and detailed logging
- **Economy** — Full currency system with banking, shops, gambling, fishing, hunting, pets, and PvP battles
- **Leveling** — XP tracking with rank cards, level roles, multipliers, and leaderboards
- **Security** — Threat mode, lockdown, whitelist system, spam protection, and server security audits
- **Premium** — User & server premium tiers with key generation, transfer, and per-server bot customization

---

## Command Categories

| Category | Count | Description |
|:---------|:-----:|:------------|
| Admin | 102+ | Moderation, AutoMod, Anti-Nuke/Raid, verification, logging |
| Utility | 94+ | Welcomer, tickets, giveaways, starboard, polls, invite tracking |
| Owner | 55+ | Bot management, eval, deploy, broadcasting, maintenance |
| Fun | 52+ | Games, trivia, Akinator, memes, calculators |
| Music | 47+ | Full Lavalink player with filters, queue, favorites, panels |
| Basic | 47+ | Server info, user info, roles, permissions, bot list |
| Economy | 29+ | Currency, shop, gambling, fishing, pets, battles |
| Voice | 21+ | Join-to-create, voice roles, voice management |
| Image | 15+ | Blur, greyscale, rotate, border, pixelate, deepfry, sepia |
| Leveling | 12+ | XP, rank cards, level roles, multipliers |
| Backup | 12 | Config backups and full server structure backups |
| DM | 11 | Direct message commands |
| Social | 7 | Profiles, badges, marriage, reputation |
| Webhook | 6 | Create, send, edit, delete, manage webhooks |

> Use `/help` or `-help` for the full interactive command menu with categories and search.

---

## Tech Stack

| Component | Technology |
|:----------|:-----------|
| Runtime | Node.js 18+ |
| Library | discord.js 14.25 |
| Music Engine | Lavalink + lavalink-client |
| Canvas | @napi-rs/canvas |
| Data Storage | JSON file-based |

---

## Self-Hosting

### Prerequisites

- **Node.js** v18+
- **Java 17+** (for Lavalink)
- A Discord Bot Token from the [Developer Portal](https://discord.com/developers/applications)

### Quick Start

```bash
git clone https://github.com/rajeev-0007/xnicobot.git
cd xnicobot
npm install
cp .env.example .env   # Configure your token, owner ID, etc.
npm start               # Starts Lavalink + bot via shard.js
```

### Environment Variables

| Variable | Required | Description |
|:---------|:--------:|:------------|
| `TOKEN` | ✓ | Discord bot token |
| `OWNER_ID` | ✓ | Your Discord user ID |
| `PREFIX` | | Command prefix (default: `-`) |
| `CLIENT_ID` | | Bot client ID (auto-detected) |
| `SUPPORT_SERVER` | | Support server invite URL |
| `WEBHOOK_PORT` | | Top.gg webhook port (default: `3000`) |
| `TOPGG_WEBHOOK_SECRET` | | Top.gg webhook auth secret (for receiving votes) |
| `TOPGG_TOKEN` | | Top.gg API token (for posting server count to your bot's listing) |

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
├── index.js              # Bot entry point
├── shard.js              # Sharding manager
├── commands/
│   ├── admin/            # Moderation, security, automod
│   ├── backup/           # Server & config backups
│   ├── basic/            # Info, role, server commands
│   ├── dm/               # Direct message commands
│   ├── economy/          # Currency, shop, gambling
│   ├── fun/              # Games, trivia, memes
│   ├── image/            # Image manipulation
│   ├── leveling/         # XP & level system
│   ├── music/            # Lavalink music player
│   ├── owner/            # Bot management
│   ├── social/           # Profiles, badges, marriage
│   ├── utility/          # Welcomer, tickets, giveaways
│   ├── voice/            # Voice channel management
│   └── webhook/          # Webhook commands
├── utils/                # Shared utilities
│   ├── pagination.js     # Reusable paginated embeds
│   ├── premiumManager.js # Premium key & tier logic
│   ├── inviteManager.js  # Invite tracking
│   ├── backupManager.js  # Backup utilities
│   └── ...
├── datas/                # JSON data files
├── config/               # Lavalink & bot config
└── assets/               # Fonts, images, badges
```

---

## Recent Changes

- **Pagination System** — All list commands now use interactive ≪ ◀ ▶ ≫ button navigation instead of truncated text
- **Security Commands** — Added `antispam`, `securitycheck` (server audit with grading), enhanced `lockall` with permission preservation
- **Premium Overhaul** — Added `deletekey`, `premiumstats`, `transferpremium`, `premiumperks` commands; fixed key validation and redemption logic
- **Image Commands** — Fixed API helpers, added proper error handling and fallback processing
- **Bug Fixes** — Fixed antilink data paths, antiraid null-safety, threat mode state restoration, whitelist reply handling

---

## Support

- **Discord:** [discord.gg/Zs35X7Umak](https://discord.gg/Zs35X7Umak)
- **Top.gg:** [Vote](https://top.gg/bot)

---

<div align="center">

Built by **Rajeev** · © 2024–2026

</div>
