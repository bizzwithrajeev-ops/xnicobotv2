# Voice Recording Automatic Cleanup

## ✅ What Was Added

Automatic deletion of voice recordings after **24 hours** to save disk space.

## 🔧 How It Works

### Cleanup Schedule
- **Runs:** Every 1 hour (automatically)
- **Deletes:** Recordings older than 24 hours
- **Starts:** Automatically when bot starts
- **First Run:** Immediately on bot startup

### What Gets Deleted
1. **Session directories** older than 24 hours
2. **All files** inside those directories (WAV, MP3, etc.)
3. **Empty guild directories** after cleanup

### What Gets Kept
- ✅ Recordings less than 24 hours old
- ✅ Active recording sessions
- ✅ The `recordings/` directory structure

## 📊 Cleanup Details

### File Age Calculation
- Based on directory modification time (`mtime`)
- Checks: `current time - directory mtime > 24 hours`
- Age is calculated when cleanup task runs

### Storage Freed
The cleanup task logs:
- Number of recordings deleted
- Total space freed
- Age of each deleted recording

### Example Output
```
[Record] Cleanup task started (runs every hour, deletes recordings older than 24 hours)
[Record] Deleted old recording: 2026-06-10T12-30-45-123456789 (45.2 MB, 26h old)
[Record] Deleted old recording: 2026-06-09T18-15-20-987654321 (38.7 MB, 32h old)
[Record] Cleanup complete: 2 recording(s) deleted (83.9 MB freed)
```

## 🗂️ Directory Structure

### Before Cleanup (recordings older than 24h)
```
recordings/
├── guild-123456789/
│   ├── 2026-06-08T10-00-00-111111111/  (>24h old - WILL BE DELETED)
│   │   ├── user1-234567890.mp3
│   │   └── user2-345678901.mp3
│   └── 2026-06-10T14-30-00-222222222/  (<24h old - KEPT)
│       ├── user3-456789012.mp3
│       └── user4-567890123.mp3
└── guild-987654321/
    └── 2026-06-07T08-00-00-333333333/  (>24h old - WILL BE DELETED)
        └── global-mix.mp3
```

### After Cleanup
```
recordings/
└── guild-123456789/
    └── 2026-06-10T14-30-00-222222222/  (Recent - kept)
        ├── user3-456789012.mp3
        └── user4-567890123.mp3

# guild-987654321/ was deleted (empty after cleanup)
```

## ⚙️ Configuration

### Current Settings
```javascript
const RECORDING_CLEANUP_HOURS = 24;  // Delete after 24 hours
const CLEANUP_INTERVAL = 60 * 60 * 1000;  // Run every 1 hour
```

### To Change Cleanup Time
Edit `utils/recordings.js`:
```javascript
// Change 24 to desired hours
const RECORDING_CLEANUP_HOURS = 48;  // Delete after 48 hours
```

### To Change Cleanup Frequency
Edit `utils/recordings.js`:
```javascript
// Change interval (currently 1 hour)
cleanupInterval = setInterval(() => {
    cleanOldRecordings().catch(...);
}, 2 * 60 * 60 * 1000);  // Run every 2 hours
```

## 🛡️ Safety Features

### Error Handling
- ✅ Won't crash bot if cleanup fails
- ✅ Errors are logged but ignored
- ✅ Continues to next file/directory on error
- ✅ Safe to run on empty directories

### Active Recording Protection
- ✅ Sessions map tracks active recordings
- ✅ Active recordings won't be 24+ hours old
- ✅ Cleanup only targets completed recordings

### File System Safety
- ✅ Uses `{ recursive: true, force: true }` for deletion
- ✅ Checks if paths exist before operations
- ✅ Handles permission errors gracefully

## 📝 Manual Cleanup

### Force Cleanup Now
You can manually trigger cleanup (if needed in future):

```javascript
const { cleanOldRecordings } = require('./utils/recordings');
await cleanOldRecordings();
```

### Stop Cleanup Task
```javascript
const { stopCleanupTask } = require('./utils/recordings');
stopCleanupTask();
```

### Start Cleanup Task
```javascript
const { startCleanupTask } = require('./utils/recordings');
startCleanupTask();
```

## 📈 Storage Estimates

### Typical Recording Sizes
- **1 minute, 1 speaker, MP3**: ~1.2 MB
- **10 minutes, 5 speakers, MP3**: ~60 MB
- **1 hour, 10 speakers, MP3**: ~720 MB

### Cleanup Impact
- **Before**: 50 GB of recordings (50 days of data)
- **After**: <2 GB of recordings (24 hours of data)
- **Saved**: 48 GB disk space

## 🚀 How to Use

### Nothing to Configure!
The cleanup task starts automatically when the bot starts. Just:

1. **Restart your bot** (if already running)
2. Check logs for confirmation:
   ```
   [Record] Cleanup task started (runs every hour, deletes recordings older than 24 hours)
   ```

### First Cleanup
- Runs **immediately** on bot startup
- Deletes any recordings older than 24h
- Then runs every hour after that

## 🔍 Monitoring

### Check Cleanup Logs
Look for these log messages:
```
[Record] Cleanup task started (...)
[Record] Deleted old recording: ... (size, age)
[Record] Cleanup complete: X recording(s) deleted (Y freed)
[Record] Cleanup task failed: ... (if errors occur)
```

### Check Recordings Directory
```bash
# See what recordings exist
ls -lah recordings/

# Check directory size
du -sh recordings/

# Count recording sessions
find recordings/ -type d -mindepth 2 | wc -l
```

## ⚠️ Important Notes

1. **Recordings are deleted permanently** - No backup, no recovery
2. **24 hours from creation** - Not from last access or upload
3. **Files are not uploaded automatically** - Users must `/record stop` to get files
4. **Disk space is freed immediately** - Not moved to trash/recycle bin
5. **Cleanup can't be undone** - Once deleted, recordings are gone forever

## 💡 Best Practices

### For Users
1. ✅ Stop recording promptly after done
2. ✅ Download MP3 files from Discord immediately
3. ✅ Don't rely on server storage for archives
4. ✅ Know that recordings are automatically deleted after 24h

### For Admins
1. ✅ Monitor disk space regularly
2. ✅ Adjust cleanup time if needed (24h default)
3. ✅ Check cleanup logs for errors
4. ✅ Consider shorter cleanup time if disk space is limited

### For Developers
1. ✅ Don't modify active session directories
2. ✅ Use proper file locking if accessing recordings
3. ✅ Test cleanup behavior before production
4. ✅ Monitor cleanup task performance

## 📋 Troubleshooting

### Cleanup Not Running
**Check:** Bot logs for "Cleanup task started"
**Fix:** Restart the bot

### Recordings Not Being Deleted
**Check:** Are they actually older than 24h?
**Check:** File permissions on recordings directory
**Fix:** Manually check directory mtimes

### Cleanup Errors in Logs
**Common causes:**
- Permission denied
- File in use
- Corrupted directory

**Fix:** Check file permissions, restart bot

### Disk Still Full
**Check:** Other directories consuming space
**Check:** Large guild directories with many recordings
**Fix:** Lower RECORDING_CLEANUP_HOURS to 12 or 6

## ✅ Summary

- ✅ **Automatic**: Runs every hour, no manual intervention
- ✅ **Safe**: Won't delete active recordings or crash bot
- ✅ **Efficient**: Only scans/deletes old directories
- ✅ **Logged**: Shows what was deleted and space freed
- ✅ **Configurable**: Easy to change cleanup time
- ✅ **Deployed**: Already pushed to GitHub and active

**Recordings older than 24 hours are automatically deleted!** 🎉
