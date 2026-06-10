# Cleanup Deleted Servers

This guide explains how to remove configuration data for servers that have been deleted or where the bot was kicked.

## Problem

When servers are deleted or the bot is removed, their configuration (webhooks, logging settings, etc.) remains in the database. This can cause:
- Webhook send errors in the logs
- Unnecessary database bloat
- Cluttered configuration stores

## Solutions

### 1. In-Bot Command (Recommended)

Use the `/cleanup-webhooks` slash command or `!cleanup-webhooks` prefix command while the bot is running.

**Usage:**
```
/cleanup-webhooks
```

or

```
!cleanup-webhooks
```

**Requirements:**
- Owner-only command
- Bot must be running
- Automatically detects and removes entries for servers the bot is no longer in

**What it does:**
- Scans all JSON stores (logs, logging, automod, welcomer, etc.)
- Identifies entries for servers the bot is no longer in
- Removes those entries from the database
- Clears logger cache to stop webhook errors immediately

### 2. CLI Script (For Manual Cleanup)

Use the cleanup script when you know specific server IDs to remove.

**Usage:**
```bash
node scripts/cleanup-deleted-servers.js <serverId1> <serverId2> ... --force
```

**Example:**
```bash
node scripts/cleanup-deleted-servers.js 1458528532920799376 --force
```

**Options:**
- `--force` - Skip Discord verification and remove immediately (use when you know the server is deleted)

**What it does:**
- Connects to the database
- Removes specified server IDs from all JSON stores
- Shows summary of removed entries

## Affected Stores

Both methods clean the following stores:
- `logs`, `logging` - Logging configurations and webhooks
- `automod`, `antinuke`, `welcomer` - Moderation and welcome settings  
- `tickets`, `applications` - Ticket and application systems
- `levelchannel`, `levelingtoggle` - Leveling configurations
- `reactionroles`, `starboard`, `suggestions` - Interactive features
- `join2create`, `serverstats` - Voice and stats channels
- And 40+ other configuration stores

## Common Error Messages

### Webhook Send Failed
```
Logger: Webhook send failed for voice in 1458528532920799376
Logger: Webhook send failed for server in 1458528532920799376
```

**Solution:** Run `/cleanup-webhooks` to remove the webhook configuration for the deleted server.

### Database Transfer Quota Exceeded
```
[JsonStore] PostgreSQL unavailable (Your project has exceeded the data transfer quota)
[JsonStore] Falling back to local file storage in json_stores/
```

**Solution:** 
1. Upgrade your PostgreSQL plan (Neon database)
2. The bot will continue working with local file storage
3. Run cleanup to reduce data transfer usage

## Best Practices

1. **Regular Cleanup:** Run `/cleanup-webhooks` monthly to keep the database clean
2. **After Leaving Servers:** Run the command whenever you leave multiple servers
3. **Monitor Logs:** Watch for webhook errors and clean up promptly
4. **Backup First:** The bot automatically backs up channel configs before deletion

## Automation

Consider setting up a scheduled task (cron job) to run the cleanup automatically:

```bash
# Run cleanup monthly (example cron)
0 0 1 * * cd /path/to/bot && node scripts/cleanup-deleted-servers.js --auto
```

Note: The `--auto` flag would need to be implemented to scan and remove without manual server ID input.

## Troubleshooting

### Command Not Found
- Make sure the bot has been restarted after adding the cleanup command
- Check that `commands/admin/cleanup-webhooks.js` exists

### Permission Denied
- Only bot owners can run this command
- Check your bot's owner configuration in `config/config.json` or environment variables

### No Entries Removed
- The database might already be clean
- Verify the server IDs are correct
- Check that the stores actually had entries for those servers

## Technical Details

### Store Structure
Each store contains per-guild configurations as JSON objects:
```json
{
  "1234567890": { "enabled": true, "webhooks": {...} },
  "9876543210": { "enabled": true, "webhooks": {...} }
}
```

### Cleanup Process
1. Fetch all active guild IDs from Discord
2. Read each configuration store
3. Compare stored guild IDs with active guilds
4. Remove entries for guilds not in the active list
5. Write updated stores back to database
6. Invalidate logger cache

### Database Modes
- **PostgreSQL Mode:** Stores in Neon database, supports multi-process sync
- **Local File Mode:** Fallback to `json_stores/` directory when PostgreSQL unavailable
- Both modes support the cleanup commands
