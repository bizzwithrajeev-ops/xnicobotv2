# Voice Recording System - Implementation Summary

## ✅ What Was Done

### 1. **Dependencies Added**
Added to `package.json`:
- `@discordjs/voice` v0.19.2 - Discord voice connection handling
- `opusscript` v0.0.8 - Opus audio codec for decoding voice packets
- `prism-media` v1.3.5 - Media transcoding utilities
- `ffmpeg-static` v5.3.0 - Already present, used for MP3 conversion

### 2. **Utility Files Created**

#### `utils/recordings.js`
Complete voice recording engine with:
- Session management (start/stop/status)
- Two recording modes:
  - **Separate tracks**: Each speaker saved as individual MP3 file
  - **Global mix**: All speakers mixed into one MP3 file
- Opus packet decoding and PCM audio processing
- WAV to MP3 conversion using ffmpeg
- Auto-stop timer (configurable minutes)
- File size management (24MB Discord upload limit)
- Participant tracking and metadata

#### `utils/hybrid.js`
Command compatibility helpers:
- `componentPayload()` - Creates embed responses
- `getUser()` - User resolution from various contexts
- `sendError()` / `sendSuccess()` - Standardized responses
- `replyWithMessage()` - Smart reply handling

#### `utils/moderationChecks.js`
Permission and validation utilities:
- `requireGuild()` - Ensures command runs in server
- `requireUserPermission()` - Checks user permissions
- `parsePositiveInt()` - Safe integer parsing

### 3. **Command Created**

#### `commands/voice/record.js`
Full-featured recording command with:
- **Slash command**: `/record start|stop|status`
- **Prefix command**: `!record start|stop|status`
- Subcommands:
  - `start [channel] [minutes] [mode]` - Begin recording
  - `stop` - End recording and upload files
  - `status` - Show active recording info
- Bot's custom container/embed format support
- Permission checks (Manage Server required)
- Voice channel validation

### 4. **Output Directory**
- Created `recordings/` directory for output files
- Added to `.gitignore` (voice data is sensitive)
- Created `recordings/README.md` with usage info

### 5. **Dependencies Installed**
Ran `npm install` successfully - 6 new packages added

---

## 🎯 Features

### Recording Modes
1. **Separate Tracks Mode** (default)
   - Each speaker recorded to individual file
   - Files named: `{username}-{userid}.mp3`
   - Best for post-processing, editing

2. **Global Mix Mode**
   - All speakers mixed into one file
   - File named: `global-mix.mp3`
   - Best for simple playback, meetings

### Auto-Stop Timer
- Configurable from 1-180 minutes
- Default: 60 minutes
- Prevents runaway recordings

### File Management
- Automatic WAV → MP3 conversion
- Respects Discord 24MB upload limit
- Shows which files couldn't be uploaded (too large)
- Files saved to `recordings/{guild-id}/{timestamp}-{userid}/`

### Status Tracking
- Shows active recording info
- Displays number of speakers
- Shows time remaining
- Lists recording mode

---

## 📋 Usage Examples

### Slash Commands
```
/record start
/record start channel:#voice minutes:30 mode:Global mix
/record stop
/record status
```

### Prefix Commands
```
!record start
!record start #voice 30 global
!record stop
!record status
!rec start (using alias)
```

---

## ⚙️ Requirements

### Bot Permissions
Already configured in `index.js`:
- ✅ `GuildVoiceStates` intent (for voice state tracking)
- ✅ Guilds intent
- ✅ Voice permissions in channels

### User Permissions
- **Manage Server** permission required
- User should be in voice channel (for default channel)

### Server Setup
1. Bot must have these permissions in voice channels:
   - View Channel
   - Connect
   - Speak (optional, for join sound)

2. Bot must have these permissions in text channel:
   - Send Messages
   - Attach Files (for MP3 uploads)

---

## 🔧 Configuration

### Recording Limits
Set in `commands/voice/record.js`:
```javascript
const MAX_RECORDING_MINUTES = 180;  // Maximum recording duration
```

Recording constants in `utils/recordings.js`:
```javascript
const DEFAULT_MAX_MINUTES = 60;      // Default auto-stop
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;  // 24MB Discord limit
const MAX_UPLOAD_FILES = 10;         // Max files per upload
```

---

## 🚀 Next Steps

### 1. Register Command with Discord
The bot will auto-register the slash command on next restart. If using global commands:
```javascript
// Bot automatically registers commands in index.js
// Just restart the bot
```

### 2. Test the System
```bash
# Start the bot
npm start

# In Discord:
1. Join a voice channel
2. Run: /record start
3. Speak for a few seconds
4. Run: /record stop
5. Check uploaded MP3 files
```

### 3. Monitor Storage
```bash
# Check recording directory size
du -sh recordings/

# Clean up old recordings (manual)
rm -rf recordings/{guild-id}/{old-timestamp}
```

---

## 🐛 Troubleshooting

### "I need Connect permission"
Grant bot **Connect** permission in voice channel settings

### "No voice was captured"
- Start recording FIRST, then speak
- Check bot has **View Channel** permission
- Ensure users aren't server muted

### "Could not join voice channel"
- Check bot isn't already in another voice channel
- Verify voice region is supported
- Check bot's voice connection limit

### MP3 conversion fails
- Ensure `ffmpeg-static` package is installed
- Falls back to WAV if ffmpeg unavailable
- Check console for ffmpeg errors

### Files too large to upload
- Use Global Mix mode (smaller file size)
- Reduce recording duration
- Files are still saved to `recordings/` directory

---

## 📁 File Structure

```
xnicobotv2-main/
├── commands/
│   └── voice/
│       └── record.js           # Recording command
├── utils/
│   ├── recordings.js           # Recording engine
│   ├── hybrid.js               # Command helpers
│   └── moderationChecks.js     # Permission checks
├── recordings/                 # Output directory (gitignored)
│   ├── README.md
│   └── {guild-id}/
│       └── {timestamp}-{userid}/
│           ├── speaker1-id.mp3
│           ├── speaker2-id.mp3
│           └── global-mix.mp3
└── package.json                # Dependencies updated
```

---

## 🔐 Privacy Considerations

**IMPORTANT**: Voice recordings contain sensitive user data

1. **Inform Users**: Update bot's privacy policy
2. **User Consent**: Announce when recording starts
3. **Data Retention**: Implement automatic cleanup policy
4. **Access Control**: Restrict who can start recordings
5. **Secure Storage**: Recordings directory is gitignored
6. **Deletion**: Implement `/record delete` command (optional)

### Suggested Privacy Command (not implemented)
```javascript
// Future enhancement: /record delete <session-id>
// Allows authorized users to delete recording sessions
```

---

## ✨ Optional Enhancements (Not Implemented)

1. **Recording Persistence**: Save metadata to database
2. **Notification System**: DM users when recorded
3. **Auto-Cleanup**: Delete recordings after N days
4. **Cloud Upload**: Upload to S3/CDN instead of Discord
5. **Transcription**: Use Whisper API for voice-to-text
6. **Recording History**: List past recordings per guild
7. **Permission Override**: Guild-specific recording roles

---

## 📊 Technical Details

### Audio Specifications
- Sample Rate: 48,000 Hz (Discord standard)
- Channels: 2 (Stereo)
- Bit Depth: 16-bit
- Codec: Opus → PCM → WAV → MP3
- MP3 Bitrate: 128kbps

### Performance
- ~11MB per minute per speaker (WAV)
- ~1.2MB per minute per speaker (MP3)
- Memory: ~5MB per active speaker (buffering)
- CPU: Low (decoding only), High during MP3 conversion

### Storage Estimates
- 10 min, 5 speakers, WAV: ~550MB
- 10 min, 5 speakers, MP3: ~60MB
- 1 hour, 10 speakers, MP3: ~720MB

---

## ✅ Implementation Checklist

- [x] Add dependencies to package.json
- [x] Create utils/recordings.js
- [x] Create utils/hybrid.js
- [x] Create utils/moderationChecks.js
- [x] Create commands/voice/record.js
- [x] Create recordings/ directory
- [x] Add recordings/ to .gitignore
- [x] Install npm packages
- [x] Verify bot intents (GuildVoiceStates)
- [ ] Test /record start command
- [ ] Test /record stop command
- [ ] Test !record prefix command
- [ ] Verify MP3 conversion
- [ ] Test upload to Discord
- [ ] Update bot documentation
- [ ] Update privacy policy

---

## 🎉 Complete!

The voice recording system is now fully implemented and ready for testing. Restart your bot and try the `/record` command in any voice channel!

**Command**: `/record start`  
**Result**: Bot joins voice channel and records all speakers to separate MP3 files

---

## 📞 Support

If you encounter issues:
1. Check console logs for errors
2. Verify bot permissions in voice/text channels
3. Ensure all dependencies installed (`npm install`)
4. Check `recordings/` directory exists
5. Verify ffmpeg-static package present

**Enjoy your new voice recording feature! 🎤🎵**
