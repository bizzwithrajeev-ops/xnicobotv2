const { isOwner } = require('../../utils/helpers');
const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deploycommands')
        .setDescription('<:Lock:1473038513749491773> Owner Only: Deploy slash commands globally'),

    prefix: 'deploycommands',
    aliases: ['deploy', 'deploycmds'],
    description: 'Clear guild commands & fresh global slash deployment',
    usage: 'deploycommands',
    category: 'owner',

    async execute(interaction) {
        if (!isOwner(interaction.user.id)) {
            return interaction.reply({
                content: '<:Cancel:1473037949187657818> This command is only available to the bot owner!',
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await deploySlashCommands(interaction.client);
        const container = buildResultContainer(result);
        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const msg = await message.reply('<a:Load:1479681956273852607> Clearing guild commands & deploying fresh global slash commands…');
        const result = await deploySlashCommands(message.client);
        const container = buildResultContainer(result);
        await msg.edit({ content: null, components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};

/* ─────────────────────────────────────────────────────────────
   CORE DEPLOYMENT LOGIC
   Mirrors index.js startup registration exactly.
   ───────────────────────────────────────────────────────────── */

async function deploySlashCommands(client) {
    const startTime = Date.now();

    try {
        // ── Step 1: Scan all command folders (same list as index.js) ──
        const commandFolders = [
            'music', 'voice', 'basic', 'fun', 'admin', 'automation',
            'utility', 'owner', 'economy', 'leveling', 'image',
            'social', 'backup', 'webhook', 'dm',
        ];

        const commands = [];
        const seenNames = new Set();
        let skippedDuplicates = 0;
        let prefixOnly = 0;

        for (const folder of commandFolders) {
            const folderPath = path.join(__dirname, '..', folder);
            if (!fs.existsSync(folderPath)) continue;

            const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.js'));

            for (const file of files) {
                const filePath = path.join(folderPath, file);
                // Clear require cache so we pick up any hot-reloaded changes
                delete require.cache[require.resolve(filePath)];

                let command;
                try {
                    command = require(filePath);
                } catch (err) {
                    continue; // skip broken files
                }

                if (command.data && command.data !== null && !command.prefixOnly && typeof command.execute === 'function') {
                    const commandData = command.data.toJSON();
                    if (seenNames.has(commandData.name)) {
                        skippedDuplicates++;
                        continue;
                    }
                    seenNames.add(commandData.name);
                    commandData.category = command.category || folder;
                    commands.push(commandData);
                } else {
                    prefixOnly++;
                }
            }
        }

        // ── Step 2: Enforce Discord's 100-command limit ──
        const DISCORD_COMMAND_LIMIT = 100;
        let commandsToRegister = commands;

        if (commands.length > DISCORD_COMMAND_LIMIT) {
            const priorityOrder = [
                'music', 'automation', 'utility', 'backup', 'admin', 'basic',
                'fun', 'economy', 'leveling', 'owner', 'image', 'social',
                'voice', 'webhook', 'dm',
            ];
            const sorted = [...commands].sort((a, b) => {
                const ai = priorityOrder.indexOf(a.category || 'other');
                const bi = priorityOrder.indexOf(b.category || 'other');
                return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
            });
            commandsToRegister = sorted.slice(0, DISCORD_COMMAND_LIMIT);
        }

        // ── Step 3: Clear ALL guild-specific commands ──
        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
        const appId = client.application.id;
        let clearedGuilds = 0;
        let failedGuilds = 0;
        const totalGuilds = client.guilds.cache.size;

        for (const guild of client.guilds.cache.values()) {
            try {
                const guildCmds = await rest.get(
                    Routes.applicationGuildCommands(appId, guild.id),
                );
                if (guildCmds && guildCmds.length > 0) {
                    await rest.put(
                        Routes.applicationGuildCommands(appId, guild.id),
                        { body: [] },
                    );
                    clearedGuilds++;
                }
            } catch {
                failedGuilds++;
            }
        }

        // ── Step 4: Preserve Entry Point commands ──
        let existingCommands = [];
        try {
            existingCommands = await rest.get(Routes.applicationCommands(appId));
        } catch {}
        const entryPointCommands = existingCommands.filter(cmd => cmd.type === 4);
        const finalCommands = [...commandsToRegister, ...entryPointCommands];

        // ── Step 5: Register globally (fresh) ──
        await rest.put(
            Routes.applicationCommands(appId),
            { body: finalCommands },
        );

        // ── Step 6: Save command hash ──
        const commandHash = crypto.createHash('md5')
            .update(JSON.stringify(commandsToRegister.map(c => ({ name: c.name, options: c.options }))))
            .digest('hex');
        const hashFile = path.join(__dirname, '..', '..', 'datas', 'command-hash.txt');
        fs.writeFileSync(hashFile, commandHash);

        // ── Step 7: Refresh in-memory command map ──
        for (const folder of commandFolders) {
            const folderPath = path.join(__dirname, '..', folder);
            if (!fs.existsSync(folderPath)) continue;
            const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.js'));

            for (const file of files) {
                const filePath = path.join(folderPath, file);
                let command;
                try {
                    command = require(filePath);
                } catch {
                    continue;
                }

                if (command.data && command.data !== null) {
                    const cmdName = command.data.name;
                    command.category = command.category || folder;
                    client.commands.set(cmdName, command);

                    if (command.aliases && Array.isArray(command.aliases)) {
                        for (const alias of command.aliases) {
                            if (!client.commands.has(alias)) {
                                client.commands.set(alias, command);
                            }
                        }
                    }
                } else if (typeof command.executePrefix === 'function') {
                    const cmdName = command.prefix || file.replace('.js', '');
                    command.category = command.category || folder;
                    client.commands.set(cmdName, command);

                    if (command.aliases && Array.isArray(command.aliases)) {
                        for (const alias of command.aliases) {
                            if (!client.commands.has(alias)) {
                                client.commands.set(alias, command);
                            }
                        }
                    }
                }
            }
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        return {
            success: true,
            registered: commandsToRegister.length,
            entryPoints: entryPointCommands.length,
            prefixOnly,
            skippedDuplicates,
            clearedGuilds,
            failedGuilds,
            totalGuilds,
            elapsed,
            hash: commandHash.slice(0, 8),
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/* ─────────────────────────────────────────────────────────────
   RESULT CONTAINER
   ───────────────────────────────────────────────────────────── */

function buildResultContainer(result) {
    const container = new ContainerBuilder().setAccentColor(result.success ? 0x57F287 : 0xED4245);

    if (!result.success) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# <:Cancel:1473037949187657818> Deployment Failed\n\n` +
                `\`\`\`\n${result.error}\n\`\`\``,
            ),
        );
        return container;
    }

    let content = `# <:Checkedbox:1473038547165384804> Slash Commands Deployed\n\n`;
    content += `<:Caretright:1473038207221502106> **Registered:** \`${result.registered}\` global slash commands\n`;

    if (result.entryPoints > 0) {
        content += `<:Caretright:1473038207221502106> **Preserved:** \`${result.entryPoints}\` Entry Point command(s)\n`;
    }

    content += `<:Caretright:1473038207221502106> **Prefix-only:** \`${result.prefixOnly}\` commands\n`;

    if (result.skippedDuplicates > 0) {
        content += `<:Caretright:1473038207221502106> **Duplicates skipped:** \`${result.skippedDuplicates}\`\n`;
    }

    content += `\n<:Trash:1473038090074591293> **Cleared** guild commands from \`${result.clearedGuilds}/${result.totalGuilds}\` servers`;
    if (result.failedGuilds > 0) {
        content += ` (\`${result.failedGuilds}\` failed)`;
    }

    content += `\n<a:loading:1506015728871149770> **Time:** \`${result.elapsed}s\` — **Hash:** \`${result.hash}\``;
    content += `\n\n-# Global commands may take up to 1 hour to propagate to all servers`;

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    return container;
}
