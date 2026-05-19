/**
 * register-commands.js — One-shot slash command registration.
 *
 * Run this manually whenever you add/remove/change slash commands:
 *   node register-commands.js
 *
 * It registers 100 global + 100 guild-specific commands to ALL guilds.
 * The bot no longer registers on every boot — this script is the
 * single source of truth for slash command state.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const { Client, GatewayIntentBits } = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
    console.error('ERROR: TOKEN and CLIENT_ID must be set in .env');
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function main() {
    console.log('Loading commands...');

    const commandFolders = ['music', 'voice', 'basic', 'fun', 'action', 'admin', 'automation', 'utility', 'owner', 'economy', 'leveling', 'image', 'social', 'backup', 'webhook', 'dm', 'stats'];
    const commands = [];
    const seenNames = new Set();

    for (const folder of commandFolders) {
        const commandsPath = path.join(__dirname, 'commands', folder);
        if (!fs.existsSync(commandsPath)) continue;
        const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

        for (const file of commandFiles) {
            try {
                const command = require(path.join(commandsPath, file));
                if (command.data && !command.prefixOnly && command.execute) {
                    const json = command.data.toJSON();
                    if (!seenNames.has(json.name)) {
                        seenNames.add(json.name);
                        commands.push(json);
                    }
                }
            } catch (e) {
                console.warn(`  Skipped ${folder}/${file}: ${e.message}`);
            }
        }
    }

    console.log(`Found ${commands.length} slash-capable commands.`);

    const DISCORD_GLOBAL_LIMIT = 100;
    const DISCORD_GUILD_LIMIT = 100;

    // Priority list — these go global (available everywhere instantly)
    const prioritySet = new Set([
        'help', 'botinfo', 'ping', 'userinfo', 'avatar', 'serverinfo',
        'ban', 'kick', 'mute', 'unmute', 'timeout', 'untimeout', 'warn', 'clear', 'unban',
        'antispam', 'antinuke', 'antiraid', 'antialt', 'config', 'logging', 'setprefix',
        'lock', 'unlock', 'hide', 'unhide', 'addrole', 'removerole', 'slowmode',
        'play', 'pause', 'resume', 'stop', 'skip', 'queue', 'nowplaying', 'volume',
        'seek', 'loop', 'shuffle', 'autoplay', 'filters', 'lyrics', 'musicpanel',
        'welcomer', 'autorole', 'ticket-setup', 'giveaway', 'reactionroles', 'autoresponder',
        'autoreact', 'starboard-setup', 'poll', 'sticky-message', 'youtube-notify', 'social-notify',
        'snipe', 'editsnipe', 'afk', 'reminder', 'announce', 'automod', 'invite-setup',
        'button-maker', 'select-menu-maker', 'embed-quick', 'translate', 'calculate',
        'premium', 'customcmd', 'github',
        'balance', 'daily', 'weekly', 'shop', 'profile', 'pay', 'deposit', 'withdraw',
        'slots', 'betflip', 'gamble', 'rob', 'lottery', 'highlow', 'scratch', 'dice',
        'blackjack', 'roulette', 'rps',
        'tictactoe', 'connect4', 'hangman', 'numguess', 'memory', '2048', 'battleship',
        'work', 'beg', 'crime', 'fish', 'hunt', 'adventure', 'mine', 'mines', 'farm', 'heist',
        'buy', 'sell', 'inventory', 'trade', 'craft', 'gift', 'loan', 'economy-leaderboard',
        'battle', 'pets',
        'rank', 'levels', 'leveling-setup', 'levelroles',
        'socialprofile', 'badges',
        'trivia', 'wordle', 'akinator', 'scramble', 'mathgame', 'fasttype',
        'meme', 'joke', 'gif', 'fact', 'riddle', 'ship', 'rate', '8ball',
        'backup-create', 'backup-load', 'backup-list', 'server-backup-create',
        'botpanel', 'eval', 'shutdown',
    ]);

    const priorityCmds = [];
    const overflowCmds = [];
    for (const cmd of commands) {
        if (prioritySet.has(cmd.name)) priorityCmds.push(cmd);
        else overflowCmds.push(cmd);
    }

    // Fill global up to 100
    const globalCmds = priorityCmds.slice(0, DISCORD_GLOBAL_LIMIT);
    if (globalCmds.length < DISCORD_GLOBAL_LIMIT) {
        globalCmds.push(...overflowCmds.splice(0, DISCORD_GLOBAL_LIMIT - globalCmds.length));
    }

    // Guild-specific: everything not in global, up to 100
    const globalNames = new Set(globalCmds.map(c => c.name));
    const guildCmds = commands.filter(c => !globalNames.has(c.name)).slice(0, DISCORD_GUILD_LIMIT);

    console.log(`\nRegistering ${globalCmds.length} GLOBAL commands...`);

    // Preserve entry point commands
    let existing = [];
    try { existing = await rest.get(Routes.applicationCommands(CLIENT_ID)); } catch {}
    const entryPoints = existing.filter(cmd => cmd.type === 4);

    await rest.put(Routes.applicationCommands(CLIENT_ID), {
        body: [...globalCmds, ...entryPoints]
    });
    console.log(`✓ ${globalCmds.length} global commands registered.`);

    if (guildCmds.length === 0) {
        console.log('No guild-specific commands to register.');
        console.log('\nDone!');
        process.exit(0);
    }

    // Need guild list — use a minimal client login
    console.log(`\nRegistering ${guildCmds.length} GUILD-SPECIFIC commands to all guilds...`);
    console.log('(Logging in to fetch guild list...)');

    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await client.login(TOKEN);

    // Wait for ready
    await new Promise(resolve => client.once('ready', resolve));
    const guilds = [...client.guilds.cache.values()];
    console.log(`Bot is in ${guilds.length} guilds. Registering in batches...`);

    const BATCH = 5;
    const DELAY = 2000;
    let success = 0;
    let failed = 0;

    for (let i = 0; i < guilds.length; i += BATCH) {
        const batch = guilds.slice(i, i + BATCH);
        const results = await Promise.allSettled(
            batch.map(g => rest.put(Routes.applicationGuildCommands(CLIENT_ID, g.id), { body: guildCmds }))
        );
        for (const r of results) {
            if (r.status === 'fulfilled') success++;
            else {
                failed++;
                console.error(`    Guild fail: ${r.reason?.message || r.reason}`);
            }
        }
        process.stdout.write(`\r  Progress: ${success + failed}/${guilds.length} (${success} ok, ${failed} failed)`);
        if (i + BATCH < guilds.length) await new Promise(r => setTimeout(r, DELAY));
    }

    console.log(`\n✓ Guild registration complete: ${success}/${guilds.length} guilds.`);
    console.log(`\nTotal: ${globalCmds.length} global + ${guildCmds.length} guild = ${globalCmds.length + guildCmds.length} slash commands.`);
    console.log(`Remaining ${commands.length - globalCmds.length - guildCmds.length} commands are prefix-only (Discord 200 cap).`);

    client.destroy();
    process.exit(0);
}

main().catch(e => {
    console.error('Registration failed:', e);
    process.exit(1);
});
