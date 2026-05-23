/**
 * register-commands.js — Manual slash command registration.
 *
 * The bot now auto-registers slash commands on boot whenever the TOKEN,
 * CLIENT_ID, or the command set has changed (see utils/slashRegistrar.js).
 *
 * Run this script manually to FORCE a re-register without rebooting:
 *   node register-commands.js
 *
 * © Rajeev (Rexzy) — xNico
 */

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const { autoRegister, invalidateCache } = require('./utils/slashRegistrar');

const TOKEN     = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
    console.error('ERROR: TOKEN and CLIENT_ID must be set in .env');
    process.exit(1);
}

function loadCommands() {
    const commandFolders = [
        'music', 'voice', 'basic', 'fun', 'action', 'admin', 'automation',
        'utility', 'owner', 'economy', 'leveling', 'image', 'social',
        'backup', 'webhook', 'dm', 'stats',
    ];
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

    return commands;
}

async function main() {
    console.log('Loading commands...');
    const commands = loadCommands();
    console.log(`Found ${commands.length} slash-capable commands.`);

    // Force a fresh registration regardless of cache state.
    invalidateCache();

    // We need a logged-in client to enumerate guilds for guild-specific
    // command pushes.
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    console.log('Logging in to fetch guild list...');
    await client.login(TOKEN);
    await new Promise(resolve => client.once('ready', resolve));
    console.log(`Logged in as ${client.user.tag} (${client.guilds.cache.size} guilds).\n`);

    const result = await autoRegister({
        client,
        token: TOKEN,
        clientId: CLIENT_ID,
        commands,
        force: true,
    });

    if (result.registered) {
        console.log(`\n✓ Done — ${result.global} global + ${result.guild} guild commands registered.`);
    } else {
        console.log(`\n⚠  Skipped — ${result.reason}`);
    }

    client.destroy();
    process.exit(0);
}

main().catch(e => {
    console.error('Registration failed:', e);
    process.exit(1);
});
