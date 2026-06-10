# 🎉 New Features & Systems

This document covers all newly added premium features and systems.

---

## 📦 Database Snapshot System (24h Auto-Delete)

**Command:** `/datasnapshot`

### Features
- ✅ **Auto-delete snapshots older than 24 hours**
- ✅ **Full database backup** (all stores in one file)
- ✅ **Gzip compression** for space efficiency
- ✅ **Hourly automatic snapshots**
- ✅ **Manual cleanup available**

### Subcommands
```
/datasnapshot create         - Create manual snapshot
/datasnapshot list          - View all snapshots with age indicators
/datasnapshot cleanup       - Remove old snapshots (24h+)
/datasnapshot inspect <name> - View snapshot details
/datasnapshot restore <name> - Restore from snapshot
```

### Usage Example
```
/datasnapshot create
/datasnapshot list
/datasnapshot cleanup
```

### Storage
- Location: `store_snapshots/`
- Format: `snapshot-YYYY-MM-DDTHH-MM-SS.json.gz`
- Retention: 24 hours (auto-cleanup)
- Cleanup: Runs every hour automatically

---

## ⏰ Timer System (Enhanced)

**Command:** `/timer`

### Features
- ✅ **Message editing** when timer ends (no new message)
- ✅ **Default ping: NO** (changed from yes)
- ✅ **Optional user ping**
- ✅ **Optional role ping** 👑 NEW!
- ✅ **Multiple timers per user**
- ✅ **Natural duration format** (5m, 1h30m, 2d)

### Subcommands
```
/timer set <duration> [reason] [ping:true/false] [pingrole:@Role]
/timer list                  - View your active timers
/timer cancel <id>          - Cancel a timer
```

### Ping Options
- **No Ping (default)** - 🔕 Silent notification
- **User Ping** - 🔔 Mention the user
- **Role Ping** - 🔔👥 Mention a specific role

### Usage Examples
```
/timer set 5m Check pizza                     (no ping - default)
/timer set 5m Check pizza ping:true          (ping user)
/timer set 5m Alert pingrole:@Moderators     (ping role)

!timer set 5m Check pizza                     (no ping)
!timer set 5m --ping Check pizza              (ping user)
!timer set 5m --role @Moderators Alert        (ping role)
```

### Behavior
1. Bot replies with "Timer Set" message
2. Timer counts down
3. When timer ends: **Bot EDITS the same message** to show "Timer Ended!"
4. Optional ping/mention is added if enabled

---

## 🗑️ Deleted Server Cleanup

**Command:** `/cleanup-webhooks`

### Features
- ✅ **Remove configs for deleted servers**
- ✅ **Scans 40+ JSON stores**
- ✅ **Shows freed space**
- ✅ **Automatic detection**

### Usage
```
/cleanup-webhooks
!cleanup-webhooks
```

### What It Does
- Identifies servers the bot is no longer in
- Removes their configurations from all stores
- Clears webhook errors
- Shows summary of deleted entries

### Stores Cleaned
- `logs`, `logging`, `automod`, `antinuke`
- `welcomer`, `tickets`, `reactionroles`
- `leveling`, `economy`, `music` configs
- And 40+ more configuration stores

---

## 🎨 Bot Name Decoration System (Premium) 👑

**Command:** `/bot-decoration`

### Features
- ✅ **10 font styles** (Bold, Italic, Script, Monospace, etc.)
- ✅ **18 decorations** (Crown, Star, Fire, VIP, Premium, etc.)
- ✅ **Custom prefix/suffix**
- ✅ **Live preview**
- ✅ **Easy toggle on/off**

### Font Styles
1. **Normal** 📝 - `xNico Bot`
2. **Bold** 🔤 - `𝘅𝗡𝗶𝗰𝗼 𝗕𝗼𝘁`
3. **Italic** 📐 - `𝑥𝑁𝑖𝑐𝑜 𝐵𝑜𝑡`
4. **Script** ✍️ - `𝓍𝒩𝒾𝒸𝑜 𝐵𝑜𝓉`
5. **Monospace** 💻 - `𝚡𝙽𝚒𝚌𝚘 𝙱𝚘𝚝`
6. **Fraktur** 🎭 - `𝔵𝔑𝔦𝔠𝔬 𝔅𝔬𝔱`
7. **Double-Struck** 🎯 - `𝕩ℕ𝕚𝕔𝕠 𝔹𝕠𝕥`
8. **Small Caps** 🔠 - `ꭙɴɪᴄᴏ ʙᴏᴛ`
9. **Circled** ⭕ - `ⓧⓃⓘⓒⓞ Ⓑⓞⓣ`
10. **Squared** ⬜ - `🆇🅽🅸🅲🅾 🅱🅾🆃`

### Decorations
- **None** ❌ - No decoration
- **Crown** 👑 - `👑 xNico Bot`
- **Star** ⭐ - `⭐ xNico Bot`
- **Fire** 🔥 - `🔥 xNico Bot`
- **Sparkles** ✨ - `✨ xNico Bot ✨`
- **Diamond** 💎 - `💎 xNico Bot`
- **VIP** 👑 - `[VIP] xNico Bot`
- **Premium** ⭐ - `[⭐] xNico Bot`
- **Verified** ✅ - `xNico Bot ✅`
- And 9 more!

### Usage
```
/bot-decoration
```

**Panel Actions:**
- **Change Font** - Select from 10 font styles
- **Change Decoration** - Choose from 18 decorations
- **Custom Text** - Add custom prefix/suffix
- **Enable/Disable** - Toggle decoration on/off
- **Apply Now** - Update bot nickname immediately
- **Reset** - Reset to default settings

### Requirements
- 👑 **Premium Only** (Server Premium or User Premium)
- 🔧 **Manage Guild** permission required
- 📝 Bot needs **Manage Nicknames** permission

### Examples
```
Original: xNico Bot
Bold + Crown: 👑 𝘅𝗡𝗶𝗰𝗼 𝗕𝗼𝘁
Script + Sparkles: ✨ 𝓍𝒩𝒾𝒸𝑜 𝐵𝑜𝓉 ✨
Monospace + VIP: [VIP] 𝚡𝙽𝚒𝚌𝚘 𝙱𝚘𝚝
Custom: ⚡ 𝕩ℕ𝕚𝕔𝕠 𝔹𝕠𝕥 ⚡
```

---

## 📋 CLI Scripts

### Cleanup Deleted Servers
```bash
node scripts/cleanup-deleted-servers.js <serverId> --force
```

**Options:**
- `--force` - Skip Discord verification

**Usage:**
```bash
node scripts/cleanup-deleted-servers.js 1234567890 --force
```

---

## 🔐 Premium Features Summary

### Included in Premium
- ✅ Bot name decoration & styling
- ✅ Custom bot avatar per server
- ✅ Custom bot profile & banner
- ✅ Custom embed colors & footers
- ✅ Custom prefix per server
- ✅ No command cooldowns
- ✅ Access to premium-only commands

### How to Get Premium
```
/redeemkey <KEY>          - Activate user premium
/redeemserverkey <KEY>    - Activate server premium
```

### How to Generate Keys (Owner Only)
```
/genkey                   - Generate user premium key
/genserverkey             - Generate server premium key
```

---

## 📊 Technical Details

### Database Structure
- **Snapshots:** `store_snapshots/` (gzipped JSON)
- **Bot Decorations:** `bot-decorations` store
- **Timers:** In-memory Map (not persisted)
- **Premium:** `premium`, `server-premium`, `premium-keys` stores

### Auto-Cleanup Tasks
1. **Snapshot Cleanup:** Every 1 hour (removes 24h+ old files)
2. **Recording Cleanup:** Every 1 hour (removes 24h+ old recordings)
3. **Timer Cleanup:** On timeout/cancellation

### Performance
- ✅ Optimized for large servers
- ✅ Immediate writes for critical data
- ✅ Debounced writes for frequent data
- ✅ Cache invalidation for instant updates

---

## 🐛 Bug Fixes Included

### Timer System
- ✅ Fixed message editing not working
- ✅ Changed default ping to NO
- ✅ Added role ping support
- ✅ Fixed message fetching errors
- ✅ Better error handling

### Snapshot System
- ✅ 24-hour auto-deletion now works
- ✅ Proper cleanup logging
- ✅ Shows freed space
- ✅ Fixed retention issues

### Bot Decoration
- ✅ Fixed interaction handling
- ✅ Added missing modal handlers
- ✅ Fixed select menu options
- ✅ Proper error messages

---

## 📖 Command List

### Admin Commands
- `/bot-decoration` - Customize bot name style (Premium)
- `/cleanup-webhooks` - Remove deleted server configs
- `/datasnapshot` - Manage database snapshots

### Utility Commands
- `/timer set` - Set a timer with notifications
- `/timer list` - View active timers
- `/timer cancel` - Cancel a timer

---

## 🎯 Best Practices

### Snapshots
1. Create manual snapshots before major changes
2. Run cleanup monthly to free space
3. Keep at least 24 hours of snapshots
4. Test restore in a dev environment first

### Timers
1. Use role ping for important server alerts
2. Keep timer reasons descriptive
3. Use list command to track multiple timers
4. Cancel unused timers to free memory

### Bot Decoration
1. Enable only when you want styling active
2. Test with "Preview" before applying
3. Keep names under 32 characters
4. Disable if causing nickname issues

### Cleanup
1. Run webhook cleanup after leaving servers
2. Check database size regularly
3. Monitor snapshot directory size
4. Clean up unused recordings

---

## 💡 Tips & Tricks

### Timer Shortcuts
```
5s, 30s, 45s    - Seconds
1m, 5m, 30m     - Minutes
1h, 2h30m, 12h  - Hours
1d, 7d          - Days
```

### Bot Name Examples
```
Gaming Server: 🎮 𝔾𝕒𝕞𝕖𝕣 𝔹𝕠𝕥 🎮
Music Server: 🎵 𝓜𝓾𝓼𝓲𝓬 𝓑𝓸𝓽 🎵
VIP Server: [VIP] 𝕏ℕ𝕚𝕔𝕠 𝔹𝕠𝕥
Premium: ⭐ 𝒫𝓇𝑒𝓂𝒾𝓊𝓂 𝐵𝑜𝓉 ⭐
```

### Font Combinations
- **Professional:** Bold + Crown
- **Fun:** Script + Sparkles
- **Gaming:** Monospace + Fire
- **VIP:** Fraktur + Diamond
- **Modern:** Double-Struck + Star

---

## ❓ FAQ

**Q: Do timers persist across bot restarts?**  
A: No, timers are in-memory only. They are lost on restart.

**Q: How many snapshots are kept?**  
A: Maximum 48, and all older than 24 hours are deleted.

**Q: Can I use bot decoration without premium?**  
A: No, bot decoration is a premium-only feature.

**Q: Do decorations affect bot performance?**  
A: No, decorations are client-side text transformations only.

**Q: How do I restore my bot name?**  
A: Disable decoration and apply, or reset to defaults.

---

## 🔗 Related Commands

- `/bot-customize` - Full bot profile customization
- `/premium` - View premium features & benefits
- `/redeemkey` - Activate premium access
- `/genkey` - Generate premium keys (owner only)

---

**Last Updated:** June 11, 2026  
**Version:** 2.0.0
