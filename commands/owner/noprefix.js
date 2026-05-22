const { isOwner } = require('../../utils/helpers');
const premiumManager = require('../../utils/premiumManager');
const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

const jsonStore = require('../../utils/jsonStore');

/* ------------------ FILE HELPERS ------------------ */

function readConfig() {
    if (!jsonStore.has('noprefix')) {
        jsonStore.write('noprefix', {});
    }
    return jsonStore.read('noprefix');
}

function writeConfig(data) {
    jsonStore.write('noprefix', data);
}

function readGlobalConfig() {
    if (!jsonStore.has('globalnoprefix')) {
        jsonStore.write('globalnoprefix', { users: [] });
        return { users: [] };
    }
    return jsonStore.read('globalnoprefix');
}

function writeGlobalConfig(config) {
    jsonStore.write('globalnoprefix', config);
}

/* ------------------ NORMALIZATION ------------------ */

function normalizeGuildConfig(guildConfig) {
    if (!guildConfig.serverWide) guildConfig.serverWide = false;
    if (!guildConfig.multiCommand) guildConfig.multiCommand = false;

    // Convert old string-array format → object format
    guildConfig.users = (guildConfig.users || []).map(u => {
        if (typeof u === 'string') {
            return { userId: u, expiresAt: null };
        }
        return {
            userId: u.userId,
            expiresAt: typeof u.expiresAt === 'number' ? u.expiresAt : null
        };
    });
}

/* ------------------ TIME PARSER ------------------ */

function parseDuration(input) {
    if (!input) return null;

    const match = input.match(/^(\d{1,4})(m|h|d)$/i);
    if (!match) return null;

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();

    if (value <= 0) return null;

    const ms = {
        m: 60_000,
        h: 3_600_000,
        d: 86_400_000
    }[unit];

    return Date.now() + value * ms;
}

/* ------------------ CLEANUP ------------------ */

async function cleanupExpired(guildId, client, config) {
    const g = config[guildId];
    if (!g) return false;

    const now = Date.now();
    const remaining = [];
    let changed = false;

    for (const u of g.users) {
        if (!u.expiresAt || u.expiresAt > now) {
            remaining.push(u);
        } else {
            changed = true;
            // DM on expiry (safe)
            client.users.fetch(u.userId)
                .then(user => user.send(
                    `<:Lightning:1473038797540298792> **No-Prefix Access Expired**\n\n` +
                    `Your temporary no-prefix access has expired.\n` +
                    `You must now use the command prefix again.`
                ).catch(() => {}))
                .catch(() => {});
        }
    }

    if (changed) g.users = remaining;
    return changed;
}

/* ------------------ MODULE ------------------ */

module.exports = {
    data: null,
    ownerOnly: true,
    aliases: ['gnp', 'globalnoprefix'],

    async executePrefix(message, args) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> Bot owner only.');
        }

        const action = args[0]?.toLowerCase();
        const config = readConfig();
        const globalConfig = readGlobalConfig();

        // Server-wide features need a guild
        const guildId = message.guild?.id;
        let guildConfig = null;

        if (guildId) {
            if (!config[guildId]) {
                config[guildId] = { serverWide: false, users: [], multiCommand: false };
            }
            normalizeGuildConfig(config[guildId]);
            if (await cleanupExpired(guildId, message.client, config)) {
                writeConfig(config);
            }
            guildConfig = config[guildId];
        }

        /* -------- STATUS -------- */
        if (!action || action === 'list') {
            const globalList = globalConfig.users.length > 0
                ? globalConfig.users.map(id => `• <@${id}>`).join('\n')
                : 'None';

            const serverWideStatus = guildConfig
                ? (guildConfig.serverWide ? '<:Toggleon:1473038585501581312>' : '<:Toggleoff:1473038582813032590>')
                : 'N/A (DMs)';
            const multiStatus = guildConfig
                ? (guildConfig.multiCommand ? '<:Toggleon:1473038585501581312>' : '<:Toggleoff:1473038582813032590>')
                : 'N/A (DMs)';

            const container = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
`# No-Prefix Configuration

**Server-Wide:** ${serverWideStatus}
**Multi-Command:** ${multiStatus}

**Global Users** (all servers)
${globalList}

**Usage**
\`noprefix add @user/ID\` - Grant global no-prefix access
\`noprefix remove @user/ID\` - Revoke global no-prefix access
\`noprefix list\` - List global users
\`noprefix on/off\` - Toggle server-wide no-prefix
\`noprefix multi on/off\` - Toggle multi-command
`
                )
            );

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        /* -------- SERVER WIDE -------- */
        if (['on', 'enable'].includes(action)) {
            if (!guildConfig) return message.reply('<:Cancel:1473037949187657818> This must be used in a server.');
            guildConfig.serverWide = true;
            writeConfig(config);
            return message.reply('<:Checkedbox:1473038547165384804> No-prefix enabled server-wide.');
        }

        if (['off', 'disable'].includes(action)) {
            if (!guildConfig) return message.reply('<:Cancel:1473037949187657818> This must be used in a server.');
            guildConfig.serverWide = false;
            writeConfig(config);
            return message.reply('<:Cancel:1473037949187657818> No-prefix disabled server-wide.');
        }

        /* -------- ADD USER (GLOBAL) -------- */
        if (action === 'add') {
            let user = message.mentions.users.first();
            if (!user && args[1] && /^\d{17,20}$/.test(args[1])) {
                try { user = await message.client.users.fetch(args[1]); } catch {}
            }
            if (!user) return message.reply('<:Cancel:1473037949187657818> Mention a user or provide a valid user ID.');

            if (globalConfig.users.includes(user.id)) {
                return message.reply(`<:Cancel:1473037949187657818> **${user.username}** already has global no-prefix access.`);
            }

            globalConfig.users.push(user.id);
            writeGlobalConfig(globalConfig);

            const container = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Checkedbox:1473038547165384804> Global No-Prefix Access Granted\n\n**User:** **${user.username}** (\`${user.id}\`)\n\nThey can now run commands without the prefix in **ALL** servers.`
                )
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        /* -------- REMOVE USER (GLOBAL) -------- */
        if (action === 'remove') {
            let user = message.mentions.users.first();
            if (!user && args[1] && /^\d{17,20}$/.test(args[1])) {
                try { user = await message.client.users.fetch(args[1]); } catch {}
            }
            if (!user) return message.reply('<:Cancel:1473037949187657818> Mention a user or provide a valid user ID.');

            if (!globalConfig.users.includes(user.id)) {
                return message.reply(`<:Cancel:1473037949187657818> **${user.username}** doesn't have global no-prefix access.`);
            }

            globalConfig.users = globalConfig.users.filter(id => id !== user.id);
            writeGlobalConfig(globalConfig);

            const container = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Cancel:1473037949187657818> Global No-Prefix Access Removed\n\n**User:** **${user.username}** (\`${user.id}\`)\n\nThey must now use the prefix for commands.`
                )
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        /* -------- MULTI -------- */
        if (action === 'multi') {
            if (!guildConfig) return message.reply('<:Cancel:1473037949187657818> This must be used in a server.');
            const opt = args[1]?.toLowerCase();
            if (!['on', 'off', 'enable', 'disable'].includes(opt)) {
                return message.reply('<:Cancel:1473037949187657818> Use `noprefix multi on/off`');
            }

            guildConfig.multiCommand = ['on', 'enable'].includes(opt);
            writeConfig(config);
            return message.reply(
                guildConfig.multiCommand
                    ? '<:Checkedbox:1473038547165384804> Multi-command enabled.'
                    : '<:Cancel:1473037949187657818> Multi-command disabled.'
            );
        }

        return message.reply('<:Cancel:1473037949187657818> Invalid option. Use `noprefix` to see available commands.');
    },

    /* -------- RUNTIME CHECKS (READ-ONLY) -------- */

    /**
     * Check if a user has per-server no-prefix access.
     * Returns false if the user is not premium/owner, even if listed.
     */
    isNoPrefixEnabled(guildId, userId) {
        if (!premiumManager.hasPremiumAccess(userId, guildId)) return false;

        const config = readConfig();
        const g = config[guildId];
        if (!g) return false;

        normalizeGuildConfig(g);
        const now = Date.now();

        return g.serverWide || g.users.some(u =>
            u.userId === userId && (!u.expiresAt || u.expiresAt > now)
        );
    },

    /** Check if multi-command mode is enabled for a guild. */
    isMultiCommandEnabled(guildId) {
        const config = readConfig();
        return Boolean(config[guildId]?.multiCommand);
    },

    /**
     * Check if a user has global no-prefix access.
     * Returns false if the user is not premium/owner, even if listed.
     */
    isGlobalNoPrefixEnabled(userId) {
        if (!premiumManager.hasPremiumAccess(userId, null)) return false;

        const globalConfig = readGlobalConfig();
        return globalConfig.users.includes(userId);
    }
};