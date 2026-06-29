'use strict';

/**
 * Help Menu Category Configuration
 * ─────────────────────────────────
 * Central source-of-truth for all help-menu categories,
 * subcategory groups, dropdown options and metadata.
 *
 * Commands are listed explicitly so every command always
 * lands in the correct bucket regardless of its source folder.
 */

const WEBHOOK_PORTAL_URL = 'https://thenico.vercel.app/webhook';

/* ─────────────────────────────────────────────────────────────
   NEW COMMAND BADGES
   ───────────────────────────────────────────────────────────── */

const NEW_COMMANDS = new Set([
    'abbreviate', 'activities', 'ascii-convert', 'base64', 'calculate',
    'channelstats', 'color', 'define', 'hash', 'hexconvert', 'image',
    'leetspeak', 'morse', 'octal', 'qrcode', 'randomcase', 'reddit',
    'rot13', 'upside-down', 'urbanrandom', 'userstats', 'uuid',
    'weather', 'wordcount', 'zalgo', 'pay', 'work',
    'leveling-announcement', 'leveling-ignore',
    'profile-customize', 'rank-customize',
    'sticky-message', 'autoresponder', 'autoreact', 'reactionroles', 'roletemplate',
    'spotify-link',
    'voicemoveall', 'vclimit', 'vclist', 'vcdisconnectall', 'vcrename', 'vcbitrate', 'vcstatus',
    'servertag', 'guildtag',
    'socialprofile', 'rank',
    'messagestats', 'voicestats', 'memberstats', 'topstats',
    'serveractivity', 'comparestats', 'rankposition',
    'statusrole',
    'wordle', 'akinator', 'trivia',
    'birthday', 'birthday-setup',
    // ── Latest additions ──
    'automeme', 'afk', 'afklist', 'vcmod', 'vcmods',
    // ── New "How X?" personality meters ──
    'howtoxic', 'howweeb', 'howgamer', 'howbroke', 'howsleepy',
    'howannoying', 'howfunny', 'howfriendly', 'howcaring',
    'howbaby', 'howmature', 'howcrazy', 'howlazy', 'howkind',
    'howdramatic', 'howemo',
    // ── Economy stats overview ──
    'economystats',
    // ── Auction marketplace ──
    'auction',
]);

/* ─────────────────────────────────────────────────────────────
   SUBCATEGORY DEFINITIONS — 24 help categories + Owner
   ───────────────────────────────────────────────────────────── */

const CATEGORY_GROUP_RULES = {

    // ── 1. Music ──────────────────────────────────────────────
    music: [
        { name: 'Playback',            emoji: '<:Play:1473039266081800303>',       cmds: ['play', 'playtop', 'playskip', 'pause', 'resume', 'stop', 'skip', 'previous', 'back', 'replay', 'search', 'join'] },
        { name: 'Queue Management',    emoji: '<:Bookopen:1473038576391557130>',   cmds: ['queue', 'nowplaying', 'shuffle', 'remove', 'clearqueue', 'move', 'skipto', 'save-queue', 'removedupes', 'grab'] },
        { name: 'Audio & Filters',     emoji: '<:Volumeup:1473039290136002844>',   cmds: ['volume', 'seek', 'forward', 'loop', 'autoplay', 'filters', 'bassboost', 'equalizer', 'pitch', 'speed'] },
        { name: 'Library & Playlists', emoji: '<:spotify:1473663456182800446>',    cmds: ['like', 'unlike', 'my-music', 'play-favorites', 'playlists', 'load-playlist', 'delete-playlist', 'spotify-playlist', 'spotify-link', 'recommendations', 'lyrics', 'history'] },
        { name: 'Panel & Sessions',    emoji: '<:Refresh:1473037911581528165>',    cmds: ['247', 'musicpanel', 'removepanel'] },
    ],

    // ── 2. Voice ──────────────────────────────────────────────
    voice: [
        { name: 'Text-to-Speech',      emoji: '<:Bullhorn:1473038903157199093>',   cmds: ['speak', 'speak-config', 'join-greet', 'record'] },
        { name: 'VC Kick & Mute',      emoji: '<:banhammer:1473367388597780592>',  cmds: ['vckick', 'vckickall', 'vcmute', 'vcmuteall', 'vcunmute', 'vcunmuteall', 'vcdeafen', 'vcdeafenall', 'vcundeafen', 'vcundeafenall', 'voiceban', 'voiceunban', 'voicemove', 'voicemoveall', 'vcdisconnectall'] },
        { name: 'VC Lock & Access',    emoji: '<:Shield:1473038669831995494>',     cmds: ['lockall-voice', 'unlockall-voice', 'hideall-voice', 'unhideall-voice'] },
        { name: 'VC Settings',         emoji: '<:Settings:1473037894703779851>',   cmds: ['vclimit', 'vclist', 'vcrename', 'vcbitrate', 'vcstatus', 'vcstatusremove'] },
        { name: 'VC Roles & Setup',    emoji: '<:Caretright:1473038207221502106>', cmds: ['roleallvoice', 'roleallvoice-off', 'join2create-setup'] },
    ],

    // ── 3. Moderation ─────────────────────────────────────────
    moderation: [
        { name: 'Bans & Kicks',        emoji: '<:banhammer:1473367388597780592>',  cmds: ['ban', 'unban', 'kick', 'hackban', 'softban', 'massban', 'masskick', 'banlist', 'unbanall'] },
        { name: 'Mute & Timeout',      emoji: '<:Shield:1473038669831995494>',     cmds: ['mute', 'unmute', 'timeout', 'untimeout'] },
        { name: 'Warnings',            emoji: '<:Bookopen:1473038576391557130>',   cmds: ['warn', 'warnings', 'removewarn', 'warnconfig', 'clearwarnings', 'reason'] },
        { name: 'Cases & Logging',     emoji: '<:Lightning:1473038797540298792>',  cmds: ['cases', 'modhistory', 'delcase', 'audit', 'logging-setup', 'logging'] },
        { name: 'Members & Nicknames', emoji: '<:xnico:1486755083390550036>',       cmds: ['setnick', 'nickreset', 'massnick', 'inactive-members', 'members-without-role'] },
    ],

    // ── 4. Server Security ────────────────────────────────────
    security: [
        { name: 'Auto Protection',     emoji: '<:Shield:1473038669831995494>',     cmds: ['anti', 'antialt', 'antiraid', 'antispam', 'automod', 'antinuke', 'automod-manage', 'blacklistword'] },
        { name: 'Threat Response',      emoji: '<:Lightningalt:1473038679906844824>', cmds: ['threatmode', 'superthreatmode', 'securitycheck', 'config', 'emergency', 'nightmode', 'vanityguard'] },
    ],

    // ── 5. Message Tools ──────────────────────────────────────
    msgmod: [
        { name: 'Clear & Delete',      emoji: '<:banhammer:1473367388597780592>',  cmds: ['clear', 'nuke'] },
        { name: 'Embeds & Messages',   emoji: '<:Envelope:1473038885364695113>',   cmds: ['embed-edit', 'embed-say', 'mention', 'move-messages', 'pin-message'] },
        { name: 'Message History',     emoji: '<:Bookopen:1473038576391557130>',   cmds: ['snipe', 'editsnipe'] },
    ],

    // ── 6. Server Management ──────────────────────────────────
    server: [
        { name: 'Channel Access',      emoji: '<:Shield:1473038669831995494>',     cmds: ['lock', 'unlock', 'lockall', 'unlockall', 'lock-category', 'unlock-category', 'hide', 'unhide', 'hideall', 'unhideall', 'hide-category', 'unhide-category'] },
        { name: 'Channel Speed',       emoji: '<:Lightning:1473038797540298792>',  cmds: ['slowmode', 'slowmode-all'] },
        { name: 'Channel Setup',       emoji: '<:Folder:1473039340425973972>',     cmds: ['create-channel', 'delete-channel', 'channelclone', 'channel-nsfw', 'channel-permissions', 'channel-position', 'channel-rename', 'channel-topic', 'clone-permissions', 'setcategory', 'category-delete', 'category-rename', 'ignore-channels', 'backup-channel'] },
        { name: 'Role Management',     emoji: '<:Settings:1473037894703779851>',   cmds: ['create-role', 'delete-role', 'addrole', 'removerole', 'roleall', 'massrole', 'move-role', 'role-color', 'role-hoist', 'role-icon', 'role-mentionable', 'role-position-set', 'role-rename'] },
    ],

    // ── 7. Server Settings ────────────────────────────────────
    settings: [
        { name: 'Bot Configuration',   emoji: '<:Settings:1473037894703779851>',   cmds: ['setprefix', 'setbotname', 'bot-customize', 'botprofile', 'quicksetup', 'botblock', 'aichat-setup'] },
        { name: 'Server Configuration', emoji: '<:Caretright:1473038207221502106>', cmds: ['reset-permissions', 'resetserver', 'servertag', 'guildtag', 'config-backup', 'dm-user', 'application', 'confession-setup'] },
        { name: 'Emoji & Sticker',     emoji: '<:Gamepad:1473039216429498409>',    cmds: ['deleteemoji', 'renameemoji', 'sticker-delete', 'stealemoji', 'stealsticker', 'extract-emoji', 'remove-duplicates', 'globalemoji', 'globalsticker', 'steal'] },
    ],

    // ── 8. Trust System ───────────────────────────────────────
    trust: [
        { name: 'Owners',              emoji: '<:Lightningalt:1473038679906844824>', cmds: ['add-owner', 'remove-owner', 'show-owner', 'extraowner'] },
        { name: 'Admins',              emoji: '<:Shield:1473038669831995494>',     cmds: ['add-admin', 'removeadmin', 'admins', 'adminreset'] },
        { name: 'Moderators',          emoji: '<:banhammer:1473367388597780592>',  cmds: ['addmod', 'removemod', 'mods', 'modreset'] },
        { name: 'VC Moderators',       emoji: '<:Volumeup:1473039290136002844>',   cmds: ['add-vcmod', 'remove-vcmod', 'vcmod', 'vcmodreset'] },
        { name: 'Whitelist',           emoji: '<:Checkedbox:1473038547165384804>', cmds: ['whitelist', 'unwhitelist', 'showwhitelist'] },
    ],

    // ── 9. Automation ─────────────────────────────────────────
    automation: [
        { name: 'Auto Triggers',       emoji: '<:Refresh:1473037911581528165>',    cmds: ['autoreact', 'autoresponder', 'sticky-message', 'automeme'] },
        { name: 'Auto Membership',     emoji: '<:Settings:1473037894703779851>',   cmds: ['autorole', 'autonick', 'statusrole'] },
        { name: 'Tickets',             emoji: '<:Attach:1473037923979886694>',     cmds: ['ticket-setup', 'ticket-add', 'ticket-close', 'ticket-remove', 'ticket-categories'] },
        { name: 'Welcomer & Leave',    emoji: '<:Shield:1473038669831995494>',     cmds: ['welcomer', 'leave-setup'] },
        { name: 'Verification & Safety', emoji: '<:Checkedbox:1473038547165384804>', cmds: ['verification-setup', 'media-only', 'automodconfig', 'screenshot-verify'] },
        { name: 'Notifications',       emoji: '<:Bullhorn:1473038903157199093>',   cmds: ['booster-notify', 'social-notify', 'youtube-notify'] },
        { name: 'Engagement',          emoji: '<:Gamepad:1473039216429498409>',    cmds: ['giveaway', 'poll', 'reactionroles', 'roletemplate', 'starboard-setup', 'serverstats', 'suggestion', 'feedback', 'birthday', 'birthday-setup'] },
    ],

    // ── 10. Buttons & Selection ───────────────────────────────
    components: [
        { name: 'Message Components',  emoji: '<:Caretright:1473038207221502106>', cmds: ['button-maker', 'select-menu-maker'] },
        { name: 'Message Builders',    emoji: '<:Envelope:1473038885364695113>',   cmds: ['message-builder', 'media-gallery'] },
        { name: 'Custom Commands',     emoji: '<:Settings:1473037894703779851>',   cmds: ['customcmd', 'delcustomcmd'] },
    ],

    // ── 11. Invite System ─────────────────────────────────────
    invites: [
        { name: 'Setup & Config',      emoji: '<:Settings:1473037894703779851>',   cmds: ['invite-setup', 'invite-manage', 'invite-rewards'] },
        { name: 'Stats & Tracking',    emoji: '<:Bookopen:1473038576391557130>',   cmds: ['invite-stats', 'invite-analytics', 'invite-leaderboard', 'invited'] },
    ],

    // ── 12. Members & Info ────────────────────────────────────
    info: [
        { name: 'User Info',           emoji: '<:xnico:1486755083390550036>',       cmds: ['userinfo', 'avatar', 'banner', 'banner-url', 'permissions', 'joined', 'user-flags', 'member-join-position'] },
        { name: 'Server Info',         emoji: '<:Pin:1473038806612447500>',        cmds: ['serverinfo', 'icon', 'boosters', 'server-owner', 'server-boost-info', 'roleinfo', 'rolecount', 'serverroles', 'inrole', 'channellist', 'channelinfo', 'emojis', 'emoji-info', 'bots', 'members', 'guild-features', 'newest-member', 'oldest-member'] },
    ],

    // ── 13. Basic & Misc ─────────────────────────────────────
    basic: [
        { name: 'Bot Core',            emoji: '<:xnico:1486755083390550036>',       cmds: ['help', 'botinfo', 'ping', 'invite', 'uptime', 'vote', 'myvotes', 'support', 'variables'] },
        { name: 'Premium',             emoji: '<:Crown:1506010837368963142>',     cmds: ['premium', 'redeemkey', 'redeemserverkey', 'serverpremium'] },
        { name: 'Reminders & AFK',     emoji: '<:Lightning:1473038797540298792>',  cmds: ['afk', 'reminder', 'timer', 'announce', 'timezone'] },
        { name: 'Lookup & APIs',       emoji: '<:Attach:1473037923979886694>',     cmds: ['github', 'npm', 'define', 'urban', 'urbanrandom', 'wikipedia', 'reddit', 'youtube', 'yt', 'spotify', 'weather', 'color', 'ip', 'stockprice'] },
        { name: 'Media & Tools',       emoji: '<:Pin:1473038806612447500>',        cmds: ['image', 'screenshot', 'qrcode', 'shorten', 'pastebin', 'calculate', 'password', 'uuid', 'download'] },
        { name: 'Misc & Community',    emoji: '<:Fire:1473038604812161218>',       cmds: ['firstmsg', 'pinned-messages', 'snowflake', 'enlarge', 'afklist', 'anime', 'manga', 'crypto', 'covid', 'suggest', 'report', 'apply'] },
    ],

    // ── 14. Stats & Activity ──────────────────────────────────
    stats: [
        { name: 'Activity Tracking',   emoji: '<:Bookopen:1473038576391557130>',   cmds: ['messagestats', 'voicestats', 'memberstats', 'serveractivity', 'channelstats', 'userstats', 'stats'] },
        { name: 'Comparisons',         emoji: '<:Inforect:1473038624172937287>',   cmds: ['comparestats', 'rankposition'] },
        { name: 'Leaderboards & Tools', emoji: '<:Lightning:1473038797540298792>', cmds: ['topstats', 'activities', 'timestamp', 'statboard'] },
    ],

    // ── 15. Image ─────────────────────────────────────────────
    image: [
        { name: 'Color Filters',       emoji: '<:Fire:1473038604812161218>',       cmds: ['blur', 'brighten', 'greyscale', 'sepia', 'invertcolors', 'deepfry', 'charcoal', 'oilpaint'] },
        { name: 'Effects & Transforms', emoji: '<:Lightningalt:1473038679906844824>', cmds: ['pixelate', 'border', 'mirror', 'rotate', 'sketch', 'trigger', 'jpeg'] },
        { name: 'AI Image',            emoji: '<:xnico:1486755083390550036>',       cmds: ['imagine'] },
    ],

    // ── 16. Text & Encoding ───────────────────────────────────
    encoding: [
        { name: 'Encoding & Decoding', emoji: '<:Inforect:1473038624172937287>',   cmds: ['base64', 'morse', 'binary', 'hexconvert', 'octal', 'hash', 'rot13', 'ascii-convert'] },
        { name: 'Text Effects',        emoji: '<:Envelope:1473038885364695113>',   cmds: ['emojify', 'fancy-text', 'case-convert', 'zalgo', 'vaporwave', 'leetspeak', 'randomcase', 'upside-down', 'abbreviate'] },
        { name: 'Analysis & Transform', emoji: '<:Bookopen:1473038576391557130>',  cmds: ['wordcount', 'word-frequency', 'split-text', 'repeat', 'json-format', 'translate'] },
    ],

    // ── 17. Games (skill / no-bet) ─────────────────────────────
    // Bet-based games (blackjack, roulette, rps, tictactoe, hangman,
    // numguess, memory, 2048, battleship, connect4) live under
    // Economy → Gambling now.
    games: [
        { name: 'Word & Puzzle',       emoji: '<:Bookopen:1473038576391557130>',   cmds: ['wordle', 'scramble', 'wordchain', 'trivia'] },
        { name: 'Skill & Speed',       emoji: '<:Lightningalt:1473038679906844824>', cmds: ['fasttype', 'reactionspeed', 'mathgame', 'counting', 'emojiguess'] },
        { name: 'AI & Interactive',    emoji: '<:Inforect:1473038624172937287>',   cmds: ['akinator', '8ball', 'truthdare', 'wouldyourather'] },
    ],

    // ── 18. Fun ───────────────────────────────────────────────
    fun: [
        { name: 'Entertainment',        emoji: '<:Fire:1473038604812161218>',      cmds: ['meme', 'joke', 'fact', 'quote', 'advice', 'gif', 'fortune', 'riddle', 'roast', 'compliment', 'pickup-line', 'pickupline', 'choose', 'roll', 'random-yes-no', 'yesno'] },
        { name: 'Personality Meters',   emoji: '<:Star:1473038501766369300>',      cmds: [
            // Identity / orientation
            'howgay', 'howstraight', 'howlesbian',
            // Social vibes
            'howcute', 'howcool', 'howhot', 'howfunny', 'howkind', 'howcaring', 'howfriendly',
            // Disposition
            'howsmart', 'howmature', 'howbaby', 'howsleepy', 'howlazy', 'howdramatic',
            // Personality archetypes
            'howsigma', 'howedgy', 'howemo', 'howweeb', 'howgamer',
            // Vibe / mood
            'howcursed', 'howevil', 'howcrazy', 'howsus', 'howannoying', 'howtoxic',
            // Status
            'howrich', 'howbroke', 'howlucky', 'howbraindead', 'howsimp',
        ] },
        { name: 'Social Fun',          emoji: '<:Money:1473377877239140529>',      cmds: ['ship', 'rate', 'pp', 'magic-number', 'magicnumber', 'iq'] },
        { name: 'Pranks & Misc',       emoji: '<:Caretright:1473038207221502106>', cmds: ['fkick', 'reaction', 'confession', 'confess', 'nitro', 'faketweet'] },
        { name: 'Text Fun',            emoji: '<:Envelope:1473038885364695113>',   cmds: ['ascii', 'clap', 'mock', 'reverse'] },
    ],

    // ── 19. Action / Roleplay ─────────────────────────────────
    action: [
        { name: 'Affection',           emoji: '<:Money:1473377877239140529>',      cmds: ['hug', 'kiss', 'cuddle', 'pat', 'pet', 'praise', 'feed', 'handhold', 'peck'] },
        { name: 'Expressions',         emoji: '<:Fire:1473038604812161218>',       cmds: ['wave', 'wink', 'smile', 'blush', 'laugh', 'cry', 'dance', 'celebrate', 'yawn', 'stretch', 'salute'] },
        { name: 'Playful',             emoji: '<:Gamepad:1473039216429498409>',    cmds: ['slap', 'punch', 'bite', 'bonk', 'poke', 'tickle', 'highfive', 'facepalm', 'stare'] },
        { name: 'More Reactions',      emoji: '<:Star:1473038501766369300>',       cmds: ['angry', 'baka', 'blowkiss', 'bored', 'bully', 'carry', 'confused', 'handshake', 'happy', 'lappillow', 'nod', 'nom', 'pout', 'shocked', 'shoot', 'shrug', 'sleep', 'smug', 'snuggle', 'spin', 'tableflip', 'think', 'thumbsup', 'yeet'] },
    ],

    // ── 20. Economy ───────────────────────────────────────────
    economy: [
        { name: 'Earning',             emoji: '<:Lightning:1473038797540298792>',  cmds: ['daily', 'weekly', 'work', 'beg', 'crime', 'fish', 'hunt', 'adventure', 'mine', 'farm', 'heist'] },
        { name: 'Classic Gambling',    emoji: '<:Gamepad:1473039216429498409>',    cmds: ['slots', 'betflip', 'gamble', 'rob', 'lottery', 'highlow', 'scratch', 'dice', 'blackjack', 'roulette'] },
        { name: 'Bet Games — Setup',   emoji: '<:Lightning:1473038797540298792>',  cmds: ['mines', 'crash', 'plinko', 'wheel', 'limbo', 'tower', 'keno'] },
        { name: 'PvP & Mini-Games',    emoji: '<:transfer:1479780506718437396>',   cmds: ['rps', 'tictactoe', 'connect4', 'hangman', 'numguess', 'memory', '2048', 'battleship'] },
        { name: 'Balance & Profile',   emoji: '<:Bookopen:1473038576391557130>',   cmds: ['profile', 'balance', 'deposit', 'withdraw', 'pay', 'loan', 'economy-leaderboard', 'economystats'] },
        { name: 'Shop & Inventory',    emoji: '<:Folder:1473039340425973972>',     cmds: ['shop', 'buy', 'sell', 'sell-item', 'inventory', 'trade', 'use', 'craft', 'gift', 'customshop', 'stocks', 'auction'] },
        { name: 'Combat & Pets',       emoji: '<:Fire:1473038604812161218>',       cmds: ['battle', 'weapon', 'skill', 'pets'] },
        { name: 'Admin Controls',      emoji: '<:Shield:1473038669831995494>',     cmds: ['addcoins', 'currency'] },
    ],

    // ── 21. Social ────────────────────────────────────────────
    social: [
        { name: 'Profile & Reputation', emoji: '<:xnico:1486755083390550036>',     cmds: ['socialprofile', 'profile-customize', 'rep', 'badges'] },
        { name: 'Relationships',        emoji: '<:Money:1473377877239140529>',    cmds: ['marry', 'divorce'] },
    ],

    // ── 22. Leveling ──────────────────────────────────────────
    leveling: [
        { name: 'User',                emoji: '<:Bookopen:1473038576391557130>',   cmds: ['rank', 'leaderboard', 'rank-customize'] },
        { name: 'Admin Controls',      emoji: '<:Settings:1473037894703779851>',   cmds: ['setlevel', 'resetlevel', 'levelroles', 'toggleleveling', 'levelmultiplier', 'levelchannel'] },
        { name: 'Setup',               emoji: '<:banhammer:1473367388597780592>',  cmds: ['leveling-setup', 'leveling-announcement', 'leveling-ignore'] },
    ],

    // ── 23. Backup & Database ─────────────────────────────────
    backup: [
        { name: 'Config Backups',      emoji: '<:Bookopen:1473038576391557130>',   cmds: ['backup-create', 'backup-load', 'backup-list', 'backup-delete'] },
        { name: 'Server Backups',      emoji: '<:Pin:1473038806612447500>',        cmds: ['server-backup-create', 'server-backup-load', 'server-backup-list', 'server-backup-delete'] },
        { name: 'Database',            emoji: '<:Settings:1473037894703779851>',   cmds: ['database-set', 'database-get', 'database-list', 'database-delete'] },
    ],

    // ── 24. Webhook ───────────────────────────────────────────
    webhook: [
        { name: 'Manage Webhooks',     emoji: '<:Settings:1473037894703779851>',   cmds: ['webhook-create', 'webhook-delete', 'webhook-info', 'webhook-list', 'webhook-rename'] },
        { name: 'Send Messages',       emoji: '<:Envelope:1473038885364695113>',   cmds: ['webhook-send'] },
    ],

    // ── Owner ─────────────────────────────────────────────────
    owner: [
        { name: 'Runtime Control',     emoji: '<:Settings:1473037894703779851>',   cmds: ['shutdown', 'restart', 'maintenance', 'reload', 'eval', 'exec', 'emit', 'system'] },
        { name: 'Shard & Deploy',      emoji: '<:Refresh:1473037911581528165>',    cmds: ['force-sync', 'shard-status', 'command-stats'] },
        { name: 'Configuration',       emoji: '<:banhammer:1473367388597780592>',  cmds: ['apikeys', 'globalconfig', 'configview', 'configreset', 'lavalinkconfig', 'lavalinkinfo', 'setavatar', 'fetchmsg'] },
        { name: 'Premium & Keys',      emoji: '<:Money:1473377877239140529>',      cmds: ['addpremium', 'removepremium', 'premiumstats', 'premiums', 'transferpremium', 'createkey', 'deletekey', 'listkeys', 'syncpremium'] },
        { name: 'Guild Management',    emoji: '<:Pin:1473038806612447500>',        cmds: ['serverlist', 'leaveguild', 'serverinfo-owner', 'guild-search', 'getinvite'] },
        { name: 'User Management',     emoji: '<:Shield:1473038669831995494>',     cmds: ['globalban', 'globalunban', 'blacklist', 'noprefix', 'dmuser', 'userlookup', 'addowner', 'removeowner', 'listowners'] },
        { name: 'Badge System',        emoji: '<:Fire:1473038604812161218>',       cmds: ['badge-create', 'badge-edit', 'badge-give', 'badge-remove', 'badge-list'] },
        { name: 'Bot Health & Stats',  emoji: '<:Lightning:1473038797540298792>',  cmds: ['botstats', 'bothealth', 'systemlogs', 'botinvite', 'botpanel'] },
        { name: 'Utilities',           emoji: '<:Envelope:1473038885364695113>',   cmds: ['broadcast', 'clearcache', 'activity', 'botnick', 'vote-notify', 'topgg-sync'] },
        { name: 'Developer Tools',     emoji: '<:Lightning:1473038797540298792>',  cmds: ['canvas', 'botsay', 'cleanup-webhooks', 'datasnapshot', 'dmstats', 'errortest', 'flushcache', 'listenerinfo', 'nodecheck', 'ownerbadges', 'purge-mass', 'runtimeflags', 'namestyle', 'presence'] },
    ],
};

/* ─────────────────────────────────────────────────────────────
   REVERSE MAP: commandName → helpCategory
   ───────────────────────────────────────────────────────────── */

function buildCategoryMap() {
    const map = new Map();
    for (const [cat, groups] of Object.entries(CATEGORY_GROUP_RULES)) {
        for (const group of groups) {
            for (const cmd of group.cmds) {
                map.set(cmd, cat);
            }
        }
    }
    return map;
}

const COMMAND_CATEGORY_MAP = buildCategoryMap();

/** Fallback: map folder-based categories to a help category for unlisted commands */
const FOLDER_FALLBACK = {
    admin: 'moderation',
    utility: 'basic',
};

/* ─────────────────────────────────────────────────────────────
   CATEGORY METADATA (emoji, title, footer)
   ───────────────────────────────────────────────────────────── */

const CATEGORY_META = {
    music:      { title: 'Music Commands',           emoji: '<:Music:1473039311057190972>',        footer: '-# <:YoutubeLive:1507444089292066907> YouTube • <:spotify:1473663456182800446> Spotify • <:soundCloud:1507444310658912438> SoundCloud • <:applemusic:1507444464334147656> Apple Music' },
    voice:      { title: 'Voice Commands',           emoji: '<:Volumeup:1473039290136002844>',      footer: '-# TTS, J2C, VC moderation, limits, bitrate, autorole & more' },
    moderation: { title: 'Moderation',               emoji: '<:banhammer:1473367388597780592>',     footer: '-# Bans, kicks, mutes, warns, cases & audit logging' },
    security:   { title: 'Server Security',          emoji: '<:Shield:1473038669831995494>',        footer: '-# Anti-raid, anti-spam, anti-nuke & threat detection systems' },
    msgmod:     { title: 'Message Tools',            emoji: '<:Chat:1473038936241864865>',          footer: '-# `clear` supports up to **1000** msgs — Filters: `bots` `links` `images` `embeds` `mentions` `invites` `contains:<text>` `@user`' },
    server:     { title: 'Server Management',        emoji: '<:Folder:1473039340425973972>',        footer: '-# Channels, roles, permissions, categories & server structure' },
    settings:   { title: 'Server Settings',          emoji: '<:Settings:1473037894703779851>',      footer: '-# Bot config, prefix, nicknames, emoji & sticker management' },
    trust:      { title: 'Trust System',             emoji: '<:Checkedbox:1473038547165384804>',    footer: '-# Manage trusted owners, admins, moderators & whitelist' },
    automation: { title: 'Automation',               emoji: '<:Refresh:1473037911581528165>',       footer: '-# Welcomer, tickets, giveaways, auto-roles, notifications & more' },
    components: { title: 'Buttons & Selection',      emoji: '<:staff:1476259690315780229>',         footer: '-# Build interactive button rows, select menus, embeds & custom commands' },
    invites:    { title: 'Invite System',            emoji: '<:Bullhorn:1473038903157199093>',      footer: '-# Track invites, set rewards, view analytics & leaderboards' },
    info:       { title: 'Members & Info',           emoji: '<:Pin:1473038806612447500>',           footer: '-# User profiles, server details, roles, channels & member lookup' },
    basic:      { title: 'Basic & Misc',             emoji: '<:Bookopen:1473038576391557130>',      footer: '-# Core commands, premium, lookup, media tools & community features' },
    stats:      { title: 'Stats & Activity',         emoji: '<:Lightning:1473038797540298792>',     footer: '-# Message, voice & member activity tracking across your server' },
    image:      { title: 'Image Commands',           emoji: '<:Image:1473039533112033508>',         footer: '-# AI image generation plus avatar and image effects for attachments, URLs and user avatars' },
    encoding:   { title: 'Text & Encoding',          emoji: '<:Envelope:1473038885364695113>',      footer: '-# Translate, encode, decode, text effects & analysis tools' },
    games:      { title: 'Games',                    emoji: '<:Gamepad:1473039216429498409>',       footer: '-# Card games, word puzzles, speed challenges & AI-powered fun — play solo or with friends' },
    fun:        { title: 'Fun Commands',             emoji: '<:Fire:1473038604812161218>',          footer: '-# Memes, entertainment, pranks, text tricks & social fun' },
    action:     { title: 'Action & Roleplay',        emoji: '<:Money:1473377877239140529>',         footer: '-# Anime GIFs powered by nekos.best & waifu.pics APIs' },
    economy:    { title: 'Economy Commands',         emoji: '<:Money:1473377877239140529>',         footer: '-# <:Caretright:1473038207221502106> Canvas-rendered: fish, hunt, adventure, slots, coinflip, battle, profile' },
    social:     { title: 'Social Commands',          emoji: '<:Inforect:1473038624172937287>',      footer: '-# Custom card styles, fonts, badges & profile bio — personalize your card' },
    leveling:   { title: 'Leveling Commands',        emoji: '<:Lightning:1473038797540298792>',     footer: '-# XP is earned per message with cooldowns — Custom rank cards via `rank-customize`' },
    backup:     { title: 'Backup & Database',        emoji: '<:Folder:1473039340425973972>',        footer: '-# Full server clone — roles, channels, permissions, messages & bot configs' },
    webhook:    { title: 'Webhook Commands',         emoji: '<:Attach:1473037923979886694>',        footer: `-# Requires **Manage Webhooks** permission · [Web Portal](${WEBHOOK_PORTAL_URL})` },
    owner:      { title: 'Owner Commands',           emoji: '<:Lightningalt:1473038679906844824>',  footer: '-# Restricted to bot owners — runtime control, premium, user/guild management' },
};

/* ─────────────────────────────────────────────────────────────
   DROPDOWN OPTIONS (25 max — Home + 24 categories)
   Owner is accessible via -help owner / -help dev (prefix only)
   ───────────────────────────────────────────────────────────── */

const CATEGORY_OPTIONS = [
    { label: 'Home',            description: 'Main menu & overview',                    value: 'home',        emoji: { id: '1473039138868433192' } },
    // ── Music & Voice ──
    { label: 'Music',           description: 'Playback, queue, filters & playlists',    value: 'music',       emoji: { id: '1473039311057190972' } },
    { label: 'Voice',           description: 'TTS, J2C, VC mod & management',           value: 'voice',       emoji: { id: '1473039293088927996' } },
    // ── Moderation & Security ──
    { label: 'Moderation',      description: 'Bans, kicks, warns, cases & logging',     value: 'moderation',  emoji: { id: '1473367388597780592' } },
    { label: 'Security',        description: 'Anti-raid, anti-spam & threat protection', value: 'security',   emoji: { id: '1473038669831995494' } },
    { label: 'Messages',        description: 'Clear, embeds, snipe & message tools',    value: 'msgmod',      emoji: { id: '1473038936241864865' } },
    // ── Server ──
    { label: 'Server Mgmt',     description: 'Channels, roles & permissions',            value: 'server',      emoji: { id: '1473039340425973972' } },
    { label: 'Settings',        description: 'Bot config, prefix & emoji tools',         value: 'settings',    emoji: { id: '1473037894703779851' } },
    { label: 'Trust System',    description: 'Owners, admins, mods & whitelist',         value: 'trust',       emoji: { id: '1473038547165384804' } },
    // ── Automation & Components ──
    { label: 'Automation',      description: 'Welcomer, tickets, giveaways & setup',    value: 'automation',  emoji: { id: '1473037911581528165' } },
    { label: 'Components',      description: 'Buttons, select menus & builders',         value: 'components',  emoji: { id: '1473038207221502106' } },
    { label: 'Invites',         description: 'Invite tracking, stats & rewards',         value: 'invites',     emoji: { id: '1473038903157199093' } },
    // ── Info & Basics ──
    { label: 'Members & Info',  description: 'User, server & channel information',       value: 'info',        emoji: { id: '1473038806612447500' } },
    { label: 'Basic & Misc',    description: 'Core commands, lookup & utilities',        value: 'basic',       emoji: { id: '1473038576391557130' } },
    { label: 'Stats',           description: 'Message, voice & activity statistics',     value: 'stats',       emoji: { id: '1473038580094861545' } },
    // ── Media & Text ──
    { label: 'Images',          description: 'Filters, effects & image transforms',      value: 'image',       emoji: { id: '1473039533112033508' } },
    { label: 'Text & Encoding', description: 'Translate, encode, decode & text fun',     value: 'encoding',    emoji: { id: '1473038885364695113' } },
    // ── Entertainment ──
    { label: 'Games',           description: 'Card, word, speed & AI-powered games',     value: 'games',       emoji: { id: '1473039216429498409' } },
    { label: 'Fun',             description: 'Memes, entertainment & pranks',             value: 'fun',         emoji: { id: '1473038604812161218' } },
    { label: 'Action',          description: 'Anime action & roleplay GIFs',              value: 'action',      emoji: { id: '1473377877239140529' } },
    // ── Progression ──
    { label: 'Economy',         description: 'Currency, shop, gambling & pets',           value: 'economy',     emoji: { id: '1473039150927319192' } },
    { label: 'Social',          description: 'Profiles, badges, rep & marriage',          value: 'social',      emoji: { id: '1473038912212435086' } },
    { label: 'Leveling',        description: 'XP, rank cards & level roles',              value: 'leveling',    emoji: { id: '1473039042760282173' } },
    // ── System ──
    { label: 'Backup & DB',     description: 'Server backups, config & database',        value: 'backup',      emoji: { id: '1473039486727225394' } },
    { label: 'Webhook',         description: 'Create, manage & send webhooks',            value: 'webhook',     emoji: { id: '1473038624172937287' } },
];

/* ─────────────────────────────────────────────────────────────
   HOME PAGE CATEGORY ROWS
   ───────────────────────────────────────────────────────────── */

const HOME_CATEGORY_ROWS = [
    ['<:Music:1473039311057190972>',       'Music',       'music'],
    ['<:Volumeup:1473039290136002844>',     'Voice',       'voice'],
    ['<:banhammer:1473367388597780592>',    'Moderation',  'moderation'],
    ['<:Shield:1473038669831995494>',       'Security',    'security'],
    ['<:Chat:1473038936241864865>',         'Messages',    'msgmod'],
    ['<:Folder:1473039340425973972>',       'Server Mgmt', 'server'],
    ['<:Settings:1473037894703779851>',     'Settings',    'settings'],
    ['<:Checkedbox:1473038547165384804>',   'Trust',       'trust'],
    ['<:Refresh:1473037911581528165>',      'Automation',  'automation'],
    ['<:Caretright:1473038207221502106>',   'Components',  'components'],
    ['<:Bullhorn:1473038903157199093>',     'Invites',     'invites'],
    ['<:Pin:1473038806612447500>',          'Info',        'info'],
    ['<:Bookopen:1473038576391557130>',     'Basic',       'basic'],
    ['<:Lightning:1473038797540298792>',    'Stats',       'stats'],
    ['<:Caretright:1473038207221502106>',   'Images',      'image'],
    ['<:Envelope:1473038885364695113>',     'Encoding',    'encoding'],
    ['<:Gamepad:1473039216429498409>',      'Games',       'games'],
    ['<:Fire:1473038604812161218>',         'Fun',         'fun'],
    ['<:Money:1473377877239140529>',        'Action',      'action'],
    ['<:Money:1473377877239140529>',        'Economy',     'economy'],
    ['<:Inforect:1473038624172937287>',     'Social',      'social'],
    ['<:Lightning:1473038797540298792>',    'Leveling',    'leveling'],
    ['<:Folder:1473039340425973972>',       'Backup',      'backup'],
    ['<:Attach:1473037923979886694>',       'Webhook',     'webhook'],
    ['<:Lightningalt:1473038679906844824>', 'Owner',       'owner'],
];

/* ─────────────────────────────────────────────────────────────
   PREFIX → HELP CATEGORY ALIASES
   ───────────────────────────────────────────────────────────── */

const CATEGORY_ALIASES = {
    // Moderation
    mod: 'moderation', moderate: 'moderation', bans: 'moderation', ban: 'moderation',
    kick: 'moderation', kicks: 'moderation', warn: 'moderation', warns: 'moderation',
    mute: 'moderation', cases: 'moderation', logs: 'moderation', logging: 'moderation',
    // Security
    secure: 'security', sec: 'security', antiraid: 'security', raid: 'security',
    antispam: 'security', antinuke: 'security', automod: 'security', threat: 'security',
    // Message Tools
    msg: 'msgmod', messages: 'msgmod', message: 'msgmod', embeds: 'msgmod',
    embed: 'msgmod', snipe: 'msgmod', clear: 'msgmod',
    // Server Management
    channels: 'server', channel: 'server', roles: 'server', role: 'server',
    permissions: 'server', perms: 'server',
    // Settings
    config: 'settings', prefix: 'settings', setup: 'settings', emoji: 'settings',
    emojis: 'settings', sticker: 'settings', stickers: 'settings',
    // Trust System
    trusted: 'trust', whitelist: 'trust', admins: 'trust', mods: 'trust',
    owners: 'trust', admin: 'trust',
    // Automation
    auto: 'automation', welcome: 'automation', welcomes: 'automation', welcomer: 'automation',
    ticket: 'automation', tickets: 'automation',
    giveaway: 'automation', giveaways: 'automation', gaway: 'automation',
    reaction: 'automation', reactions: 'automation', reactionrole: 'automation',
    reactionroles: 'automation', rr: 'automation',
    roletemplate: 'automation', roletemplates: 'automation', rolepreset: 'automation', rt: 'automation',
    starboard: 'automation', stars: 'automation',
    autorole: 'automation', autoroles: 'automation',
    verify: 'automation', verification: 'automation',
    notifications: 'automation',
    // Components
    buttons: 'components', button: 'components', builder: 'components',
    builders: 'components', selectmenu: 'components',
    // Invites
    invite: 'invites', inviter: 'invites', invitetracker: 'invites',
    // Info
    info: 'info', userinfo: 'info', serverinfo: 'info', members: 'info',
    member: 'info', channelinfo: 'info',
    // Basic
    general: 'basic', bot: 'basic', misc: 'basic', lookup: 'basic',
    api: 'basic', tools: 'basic', util: 'basic', utils: 'basic', utility: 'basic',
    // Stats
    stat: 'stats', statistics: 'stats', activity: 'stats', leaderboard: 'stats',
    memberstats: 'stats', voicestats: 'stats',
    // Images
    img: 'image', images: 'image', filter: 'image', filters: 'image',
    // Encoding
    encode: 'encoding', decode: 'encoding', text: 'encoding', translate: 'encoding',
    morse: 'encoding', binary: 'encoding', base64: 'encoding',
    // Music
    songs: 'music', song: 'music', play: 'music',
    // Voice
    vc: 'voice', tts: 'voice',
    // Games (skill / no-bet)
    game: 'games', trivia: 'games', wordle: 'games',
    // Fun
    meme: 'fun', memes: 'fun', entertainment: 'fun',
    // Economy
    eco: 'economy', money: 'economy', coins: 'economy',
    highlow: 'economy', mine: 'economy', farm: 'economy', heist: 'economy',
    scratch: 'economy', dice: 'economy', loan: 'economy', craft: 'economy',
    gift: 'economy', 'economy-leaderboard': 'economy', eleaderboard: 'economy',
    blackjack: 'economy', bj: 'economy', roulette: 'economy', wheel: 'economy', rps: 'economy',
    tictactoe: 'economy', ttt: 'economy', connect4: 'economy', c4: 'economy',
    hangman: 'economy', numguess: 'economy', memory: 'economy', '2048': 'economy', battleship: 'economy',
    // Leveling
    lvl: 'leveling', xp: 'leveling', level: 'leveling', rank: 'leveling',
    // Social
    profile: 'social', rep: 'social', badges: 'social', marriage: 'social',
    // Action
    actions: 'action', roleplay: 'action', anime: 'action',
    // Backup
    backups: 'backup', db: 'backup', database: 'backup',
    // Webhook
    webhooks: 'webhook',
    // Owner
    dev: 'owner', bot_owner: 'owner', owner: 'owner',
};

/* ─────────────────────────────────────────────────────────────
   EXPORTS
   ───────────────────────────────────────────────────────────── */

module.exports = {
    NEW_COMMANDS,
    CATEGORY_GROUP_RULES,
    COMMAND_CATEGORY_MAP,
    FOLDER_FALLBACK,
    CATEGORY_META,
    CATEGORY_OPTIONS,
    HOME_CATEGORY_ROWS,
    CATEGORY_ALIASES,
};
