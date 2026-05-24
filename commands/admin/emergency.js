const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { COLORS, BRANDING } = require('../../utils/responseBuilder');
const trust = require('../../utils/trustManager');
const jsonStore = require('../../utils/jsonStore');

const DANGEROUS_PERMS = [
    'Administrator',
    'BanMembers',
    'KickMembers',
    'ManageChannels',
    'ManageGuild',
    'ManageRoles',
    'ManageWebhooks',
    'MentionEveryone'
];

function loadConfig() {
    if (!jsonStore.has('emergency')) {
        jsonStore.write('emergency', {});
        return {};
    }
    return jsonStore.read('emergency');
}

function saveConfig(config) {
    jsonStore.write('emergency', config);
}

function getDefault() {
    return {
        enabled: false,
        activatedAt: null,
        activatedBy: null,
        authorisedUsers: [],
        emergencyRoles: [],
        savedRolePerms: {}
    };
}

function isAuthorised(guild, userId, guildConfig) {
    if (trust.isServerOwner(guild, userId)) return true;
    return (guildConfig.authorisedUsers || []).includes(userId);
}

function buildPanel(guildConfig, guildName) {
    const statusEmoji = guildConfig.enabled
        ? '<:Toggleoff:1473038582813032590>'
        : '<:Toggleon:1473038585501581312>';
    const statusText = guildConfig.enabled
        ? '**EMERGENCY MODE ACTIVE** — Server is locked down'
        : '**Inactive** — Server is operating normally';

    let activatedInfo = '';
    if (guildConfig.enabled && guildConfig.activatedAt) {
        activatedInfo = `\nActivated <t:${Math.floor(new Date(guildConfig.activatedAt).getTime() / 1000)}:R> by <@${guildConfig.activatedBy}>`;
    }

    const authCount = guildConfig.authorisedUsers?.length || 0;
    const authDisplay = authCount > 0
        ? guildConfig.authorisedUsers.map(id => `<@${id}>`).join(', ')
        : '*None — only server owner can use emergency*';

    const roleCount = guildConfig.emergencyRoles?.length || 0;
    const roleDisplay = roleCount > 0
        ? guildConfig.emergencyRoles.map(id => `<@&${id}>`).join(', ')
        : '*None — all roles with dangerous perms will be affected*';

    const content =
        `# <:Shield:1473038669831995494> Emergency Mode\n` +
        `-# Critical lockdown system for **${guildName}**\n\n` +
        `${statusEmoji} ${statusText}${activatedInfo}\n\n` +
        `### <:Infotriangle:1473038460456800459> What Emergency Mode Does\n` +
        `▸ Strips dangerous permissions from all roles (or specified roles)\n` +
        `▸ Removes: \`Admin\`, \`Ban\`, \`Kick\`, \`Manage Channels/Guild/Roles/Webhooks\`, \`Mention Everyone\`\n` +
        `▸ Saves all original permissions for restoration\n` +
        `▸ Only authorised users or server owner can activate\n\n` +
        `### <:Userplus:1473038912212435086> Authorised Users (${authCount})\n` +
        `${authDisplay}\n\n` +
        `### <:Bookmark:1473039494604132423> Emergency Roles (${roleCount})\n` +
        `${roleDisplay}\n` +
        `-# ${roleCount === 0 ? 'All roles with dangerous perms will be targeted' : 'Only these roles will be affected'}\n\n` +
        `### <:Lightningalt:1473038679906844824> Commands\n` +
        `▸ \`emergency enable\` — Activate emergency lockdown\n` +
        `▸ \`emergency disable\` — Restore all permissions\n` +
        `▸ \`emergency role add @role\` — Add role to target list\n` +
        `▸ \`emergency role remove @role\` — Remove role from target list\n` +
        `▸ \`emergency role list\` — Show targeted roles\n` +
        `▸ \`emergency authorise add @user\` — Authorise a user\n` +
        `▸ \`emergency authorise remove @user\` — Remove authorisation\n\n` +
        BRANDING;

    const container = new ContainerBuilder()
        .setAccentColor(guildConfig.enabled ? 0xED4245 : 0x57F287);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    return container;
}

module.exports = {
    name: 'emergency',
    prefix: 'emergency',
    description: 'Emergency lockdown — strip dangerous permissions from roles to protect the server',
    usage: 'emergency [enable|disable|role add/remove/list|authorise add/remove]',
    category: 'admin',
    aliases: ['emgs', 'emergencymode'],
    prefixOnly: true,

    async executePrefix(message, args) {
        const config = loadConfig();
        const guildId = message.guild.id;
        if (!config[guildId]) config[guildId] = getDefault();
        const guildConfig = config[guildId];

        const sub = args[0]?.toLowerCase();

        if (!sub) {
            if (!isAuthorised(message.guild, message.author.id, guildConfig)) {
                return message.reply('<:Cancel:1473037949187657818> You are not authorised to use emergency commands.');
            }
            const panel = buildPanel(guildConfig, message.guild.name);
            return message.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        }

        if (sub === 'enable') {
            if (!isAuthorised(message.guild, message.author.id, guildConfig)) {
                return message.reply('<:Cancel:1473037949187657818> You are not authorised to activate emergency mode.');
            }

            if (guildConfig.enabled) {
                return message.reply('<:Cancel:1473037949187657818> Emergency Mode is already **active**. Use `emergency disable` to restore.');
            }

            const statusMsg = await message.reply('<a:Load:1479681956273852607> Activating Emergency Mode — stripping dangerous permissions...');

            const guild = message.guild;
            const botMember = guild.members.me;
            const botHighestRole = botMember.roles.highest;
            const savedPerms = {};
            let stripped = 0;

            const targetRoles = guildConfig.emergencyRoles?.length > 0
                ? guild.roles.cache.filter(r => guildConfig.emergencyRoles.includes(r.id))
                : guild.roles.cache.filter(r =>
                    !r.managed &&
                    r.id !== guild.id &&
                    r.position < botHighestRole.position &&
                    DANGEROUS_PERMS.some(p => r.permissions.has(PermissionFlagsBits[p]))
                );

            for (const [roleId, role] of targetRoles) {
                try {
                    savedPerms[roleId] = role.permissions.bitfield.toString();

                    const newPerms = role.permissions.remove(DANGEROUS_PERMS.map(p => PermissionFlagsBits[p]));
                    await role.setPermissions(newPerms, `Emergency Mode activated by ${message.author.tag}`);
                    stripped++;
                } catch (err) {
                    // Skip roles we can't modify
                }
            }

            if (stripped === 0) {
                try { await statusMsg.delete(); } catch {}
                return message.reply('<:Cancel:1473037949187657818> Could not strip permissions from any roles. Make sure the bot\'s role is positioned above the target roles.');
            }

            guildConfig.enabled = true;
            guildConfig.activatedAt = new Date().toISOString();
            guildConfig.activatedBy = message.author.id;
            guildConfig.savedRolePerms = savedPerms;
            saveConfig(config);

            const container = new ContainerBuilder()
                .setAccentColor(0xED4245)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Toggleoff:1473038582813032590> Emergency Mode Activated\n\n` +
                    `<:Checkedbox:1473038547165384804> Stripped permissions from **${stripped}** roles\n` +
                    `<:Checkedbox:1473038547165384804> Dangerous permissions removed\n` +
                    `<:Checkedbox:1473038547165384804> Original permissions saved for restoration\n\n` +
                    `**Removed permissions:**\n` +
                    `> Admin, Ban, Kick, Manage Channels/Guild/Roles/Webhooks, Mention Everyone\n\n` +
                    `-# Use \`emergency disable\` to restore all permissions`
                ));

            try {
                await statusMsg.edit({ content: null, components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch {
                await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            return;
        }

        if (sub === 'disable') {
            if (!isAuthorised(message.guild, message.author.id, guildConfig)) {
                return message.reply('<:Cancel:1473037949187657818> You are not authorised to disable emergency mode.');
            }

            if (!guildConfig.enabled) {
                return message.reply('<:Cancel:1473037949187657818> Emergency Mode is not currently active.');
            }

            const statusMsg = await message.reply('<a:Load:1479681956273852607> Disabling Emergency Mode — restoring permissions...');

            const guild = message.guild;
            const savedPerms = guildConfig.savedRolePerms || {};
            let restored = 0;

            for (const [roleId, permBits] of Object.entries(savedPerms)) {
                try {
                    const role = guild.roles.cache.get(roleId);
                    if (!role) continue;

                    await role.setPermissions(BigInt(permBits), `Emergency Mode disabled by ${message.author.tag}`);
                    restored++;
                } catch (err) {
                    // Skip roles we can't modify
                }
            }

            guildConfig.enabled = false;
            guildConfig.savedRolePerms = {};
            guildConfig.activatedAt = null;
            guildConfig.activatedBy = null;
            saveConfig(config);

            const container = new ContainerBuilder()
                .setAccentColor(0x57F287)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Checkedbox:1473038547165384804> Emergency Mode Disabled\n\n` +
                    `<:Checkedbox:1473038547165384804> Restored permissions for **${restored}** roles\n` +
                    `<:Checkedbox:1473038547165384804> Original permissions re-applied\n` +
                    `<:Checkedbox:1473038547165384804> Server is operating normally\n\n` +
                    `-# All role permissions have been restored to their pre-emergency state`
                ));

            try {
                await statusMsg.edit({ content: null, components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch {
                await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            return;
        }

        if (sub === 'role') {
            if (!trust.isServerOwner(message.guild, message.author.id)) {
                return message.reply('<:Cancel:1473037949187657818> Only the **server owner** or **extra owner** can manage emergency roles.');
            }

            const action = args[1]?.toLowerCase();

            if (action === 'add') {
                const role = message.mentions.roles.first();
                if (!role) {
                    return message.reply('<:Cancel:1473037949187657818> Mention a role to add.\n**Usage:** `emergency role add @role`');
                }

                if (!guildConfig.emergencyRoles) guildConfig.emergencyRoles = [];
                if (guildConfig.emergencyRoles.includes(role.id)) {
                    return message.reply(`<:Cancel:1473037949187657818> **${role.name}** is already in the emergency role list.`);
                }

                guildConfig.emergencyRoles.push(role.id);
                saveConfig(config);

                const container = new ContainerBuilder()
                    .setAccentColor(0x57F287)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> Emergency Role Added\n\n` +
                        `**Role:** ${role} (\`${role.id}\`)\n\n` +
                        `> This role will be targeted when emergency mode is activated.\n` +
                        `-# Total emergency roles: ${guildConfig.emergencyRoles.length}`
                    ));
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (action === 'remove') {
                const role = message.mentions.roles.first();
                if (!role) {
                    return message.reply('<:Cancel:1473037949187657818> Mention a role to remove.\n**Usage:** `emergency role remove @role`');
                }

                if (!guildConfig.emergencyRoles?.includes(role.id)) {
                    return message.reply(`<:Cancel:1473037949187657818> **${role.name}** is not in the emergency role list.`);
                }

                guildConfig.emergencyRoles = guildConfig.emergencyRoles.filter(id => id !== role.id);
                saveConfig(config);

                const container = new ContainerBuilder()
                    .setAccentColor(0xED4245)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Emergency Role Removed\n\n` +
                        `**Role:** ${role} (\`${role.id}\`)\n\n` +
                        `> This role will no longer be targeted during emergency mode.\n` +
                        `-# Remaining emergency roles: ${guildConfig.emergencyRoles.length}`
                    ));
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (action === 'list') {
                const roles = guildConfig.emergencyRoles || [];
                const roleDisplay = roles.length > 0
                    ? roles.map((id, i) => `\`${i + 1}.\` <@&${id}>`).join('\n')
                    : '*No roles configured — all roles with dangerous perms will be targeted*';

                const container = new ContainerBuilder()
                    .setAccentColor(null)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Shield:1473038669831995494> Emergency Roles\n\n` +
                        `### <:Bookmark:1473039494604132423> Targeted Roles (${roles.length})\n` +
                        `${roleDisplay}\n\n` +
                        `-# Use \`emergency role add @role\` or \`emergency role remove @role\` to manage`
                    ));
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            return message.reply(
                '<:Cancel:1473037949187657818> Invalid subcommand.\n' +
                '**Usage:** `emergency role add @role` | `emergency role remove @role` | `emergency role list`'
            );
        }

        if (sub === 'authorise' || sub === 'authorize' || sub === 'auth') {
            if (!trust.isServerOwner(message.guild, message.author.id)) {
                return message.reply('<:Cancel:1473037949187657818> Only the **server owner** or **extra owner** can manage authorised users.');
            }

            const action = args[1]?.toLowerCase();

            if (action === 'add') {
                const user = message.mentions.users.first();
                if (!user) {
                    return message.reply('<:Cancel:1473037949187657818> Mention a user to authorise.\n**Usage:** `emergency authorise add @user`');
                }

                if (user.bot) {
                    return message.reply('<:Cancel:1473037949187657818> You cannot authorise a bot.');
                }

                if (!guildConfig.authorisedUsers) guildConfig.authorisedUsers = [];
                if (guildConfig.authorisedUsers.includes(user.id)) {
                    return message.reply(`<:Cancel:1473037949187657818> **${user.username}** is already authorised.`);
                }

                guildConfig.authorisedUsers.push(user.id);
                saveConfig(config);

                const container = new ContainerBuilder()
                    .setAccentColor(0x57F287)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> User Authorised\n\n` +
                        `**User:** ${user} (\`${user.id}\`)\n\n` +
                        `> This user can now activate and deactivate emergency mode.\n` +
                        `-# Total authorised users: ${guildConfig.authorisedUsers.length}`
                    ));
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (action === 'remove') {
                const user = message.mentions.users.first();
                if (!user) {
                    return message.reply('<:Cancel:1473037949187657818> Mention a user to remove.\n**Usage:** `emergency authorise remove @user`');
                }

                if (!guildConfig.authorisedUsers?.includes(user.id)) {
                    return message.reply(`<:Cancel:1473037949187657818> **${user.username}** is not authorised.`);
                }

                guildConfig.authorisedUsers = guildConfig.authorisedUsers.filter(id => id !== user.id);
                saveConfig(config);

                const container = new ContainerBuilder()
                    .setAccentColor(0xED4245)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Authorisation Removed\n\n` +
                        `**User:** ${user} (\`${user.id}\`)\n\n` +
                        `> This user can no longer use emergency mode.\n` +
                        `-# Remaining authorised users: ${guildConfig.authorisedUsers.length}`
                    ));
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            return message.reply(
                '<:Cancel:1473037949187657818> Invalid subcommand.\n' +
                '**Usage:** `emergency authorise add @user` | `emergency authorise remove @user`'
            );
        }

        if (!isAuthorised(message.guild, message.author.id, guildConfig)) {
            return message.reply('<:Cancel:1473037949187657818> You are not authorised to use emergency commands.');
        }

        const panel = buildPanel(guildConfig, message.guild.name);
        return message.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
    }
};
