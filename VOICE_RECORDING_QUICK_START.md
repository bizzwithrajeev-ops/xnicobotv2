# Voice Recording - Quick Start Guide 🎤

## 🚀 Ready to Use!

The voice recording system is now fully implemented and pushed to GitHub. Here's how to use it:

---

## ⚡ Quick Commands

### Slash Commands (Recommended)
```
/record start                           → Start recording your current voice channel
/record start channel:#voice            → Record a specific voice channel
/record start minutes:30                → Record for 30 minutes (auto-stop)
/record start mode:Global mix           → Record everyone into one MP3
/record stop                            → Stop recording and get MP3 files
/record status                          → Check if recording is active
```

### Prefix Commands (Alternative)
```
!record start                           → Start recording
!record start #voice 30 global          → Record #voice for 30min in global mode
!record stop                            → Stop recording
!record status                          → Check status
!rec start                              → Using 'rec' alias
```

---

## 📝 Usage Example

**Step 1:** Join a voice channel  
**Step 2:** Run `/record start`  
**Step 3:** Talk with friends  
**Step 4:** Run `/record stop`  
**Step 5:** Bot uploads MP3 files to chat  

---

## 🎯 Two Recording Modes

### 🎵 Separate Tracks (Default)
- Each person gets their own MP3 file
- Best for: Podcasts, interviews, editing
- Files named: `username-userid.mp3`

### 🌐 Global Mix
- Everyone mixed into ONE MP3 file
- Best for: Meetings, simple playback
- File named: `global-mix.mp3`

---

## ⚙️ Settings

| Option | Default | Range | Description |
|--------|---------|-------|-------------|
| `minutes` | 60 | 1-180 | Auto-stop timer |
| `mode` | Separate | Separate/Global | Recording mode |
| `channel` | Your current | Any voice | Channel to record |

---

## 🔐 Permissions Required

### User Permissions
- ✅ **Manage Server** permission

### Bot Permissions (in voice channel)
- ✅ View Channel
- ✅ Connect
- ✅ Speak (optional)

### Bot Permissions (in text channel)
- ✅ Send Messages
- ✅ Attach Files

---

## 💾 File Storage

Recordings saved to: `recordings/{guild-id}/{timestamp}-{userid}/`

**Important:** Files are NOT automatically deleted. Clean up old recordings manually to save disk space.

### Storage Estimates
- 10 minutes, 5 people = ~60 MB (MP3)
- 1 hour, 10 people = ~720 MB (MP3)

---

## 🐛 Common Issues

### "I need Connect permission"
**Fix:** Give bot **Connect** permission in voice channel settings

### "No voice was captured"
**Fix:** Start recording FIRST, then speak (not the other way around)

### "Could not join voice channel"
**Fix:** Bot might be in another voice channel. Make it leave first.

### Files too large to upload
**Fix:** Use `mode:Global mix` for smaller file size, or reduce recording duration

---

## 🎬 Real-World Examples

### Example 1: Record a Meeting
```
/record start minutes:60 mode:Global mix
[Meeting happens]
/record stop
→ Bot uploads one MP3 with everyone's voices
```

### Example 2: Record a Podcast
```
/record start minutes:120 mode:Separate tracks
[Podcast recording]
/record stop
→ Bot uploads separate MP3 for each speaker
```

### Example 3: Check Recording Status
```
/record status
→ Shows: channel, mode, duration, speakers
```

---

## 🎨 Features

✅ Two recording modes (separate/global)  
✅ Auto-stop timer (1-180 minutes)  
✅ Automatic WAV → MP3 conversion  
✅ Respects Discord 24MB upload limit  
✅ Shows which files were too large  
✅ Works with slash + prefix commands  
✅ Real-time status tracking  
✅ Multiple aliases (`!record`, `!rec`)  

---

## ⚠️ Privacy Notice

**Voice recordings contain sensitive user data!**

Before using:
1. ✅ Update your bot's privacy policy
2. ✅ Inform users when recording starts
3. ✅ Implement a data retention policy
4. ✅ Secure the `recordings/` directory
5. ✅ Consider adding recording notifications

---

## 🔄 Next Steps

1. **Restart your bot** to load the new command
2. **Test in a voice channel** with `/record start`
3. **Check the upload** after `/record stop`
4. **Monitor disk space** in `recordings/` directory
5. **Update documentation** with recording feature

---

## 📦 What Was Added

### New Files
- ✅ `commands/voice/record.js` - Recording command
- ✅ `utils/recordings.js` - Recording engine (900+ lines)
- ✅ `utils/hybrid.js` - Command helpers
- ✅ `utils/moderationChecks.js` - Permission checks
- ✅ `VOICE_RECORDING_SETUP.md` - Full documentation

### Dependencies
- ✅ `@discordjs/voice` - Voice connections
- ✅ `opusscript` - Audio codec
- ✅ `prism-media` - Media processing
- ✅ `ffmpeg-static` - MP3 conversion (already installed)

### Configuration
- ✅ Added `recordings/` to `.gitignore`
- ✅ Created `recordings/` directory
- ✅ Updated `package.json` with dependencies

---

## ✨ Command Reference

| Command | Description | Permission |
|---------|-------------|------------|
| `/record start` | Start recording | Manage Server |
| `/record stop` | Stop and upload | Manage Server |
| `/record status` | Show status | Manage Server |
| `!record start` | Prefix version | Manage Server |
| `!rec start` | Alias version | Manage Server |

---

## 🎉 You're All Set!

The voice recording system is ready to use. Just restart your bot and try:

```
/record start
```

Happy recording! 🎤✨

---

**Commit:** `4799822` - feat: Implement voice recording system  
**Branch:** `main`  
**Status:** ✅ Pushed to GitHub
