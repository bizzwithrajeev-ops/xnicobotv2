const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { COLORS, BRANDING } = require('../../utils/responseBuilder');
const trust = require('../../utils/trustManager');
const jsonStore = require('../../utils/jsonStore');

function loadConfig() {
    if (!jsonStore.has('vanityguard')) {
        jsonStore.write('vanityguard', {});
        return {};
    }
    return jsonStore.read('vanityguard');
}

function saveConfig(config) {
    jsonStore.write('vanityguard', config);
}

function getDefault() {
    return {
        enabled: false,
        whitelistedUsers: []
    };
}

function buildPanel(guildConfig, guildName) {
    const wlCount = guildConfig.whitelistedUsers?.length || 0;
    const wlDisplay = wlCount > 0
        ? guildConfig.whitelistedUsers.slice(0, 5).map(id => `<@${id}>`).join(', ') + (wlCount > 5 ? ` +${wlCount - 5} more` : '')
        : '*None*';

    const statusEmoji = guildConfig.enabled
        ? '<:Toggleon:1473038585501581312>'
        : '<:Toggleoff:1473038582813032590>';
    const statusText = guildConfig.enabled
        ? '**Active** — Vanity URL is protected'
        : '**Inactive** — Vanity URL is not protected';

    const content =
        `# <:Shield:1473038669831995494> Vanity Guard\n` +
        `-# Protect your server's vanity URL for **${guildName}**\n\n` +
        `${statusEmoji} ${statusText}\n\n` +
        `### <:Document:1473039496995143731> What Vanity Guard Does\n` +
        `▸ Monitors vanity URL changes\n` +
        `▸ Reverts unauthorized vanity modifications\n` +
        `▸ Only whitelisted users can change the vanity\n` +
        `▸ Logs all vanity change attempts\n\n` +
        `### <:Userplus:1473038912212435086> Whitelisted Users (${wlCount})\n` +
        `${wlDisplay}\n\n` +
        `### <:Lightningalt:1473038679906844824> Commands\n` +
        `▸ \`vanityguard enable\` — Enable protection\n` +
        `▸ \`vanityguard disable\` — Disable protection\n` +
        `▸ \`vanityguard wl @user\` — Toggle whitelist for a user\n\n` +
        BRANDING;

    const container = new ContainerBuilder()
        .setAccentColor(guildConfig.enabled ? 0x57F287 : 0xED4245);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    return container;
}

module.exports = {
    name: 'vanityguard',
    prefix: 'vanityguard',
    description: 'Protect your server vanity URL from unauthorized changes',
    usage: 'vanityguard [enable|disable|wl @user]',
    category: 'admin',
    aliases: ['vguard', 'vanityprotect'],
    prefixOnly: true,

    async executePrefix(message, args) {
        if (!trust.isServerOwner(message.guild, message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> Only the **server owner** or **extra owner** can use this command.');
        }

        const config = loadConfig();
        const guildId = message.guild.id;
        if (!config[guildId]) config[guildId] = getDefault();
        const guildConfig = config[guildId];

        const sub = args[0]?.toLowerCase();

        if (!sub) {
            const panel = buildPanel(guildConfig, message.guild.name);
            return message.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        }

        if (sub === 'enable') {
            if (guildConfig.enabled) {
                return message.reply('<:Cancel:1473037949187657818> Vanity Guard is already **enabled**.');
            }
            guildConfig.enabled = true;
            saveConfig(config);

            const container = new ContainerBuilder()
                .setAccentColor(0x57F287)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Checkedbox:1473038547165384804> Vanity Guard Enabled\n\n` +
                    `Your server's vanity URL is now protected.\n` +
                    `Only whitelisted users can change it.\n\n` +
                    `-# Use \`vanityguard wl @user\` to whitelist users`
                ));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (sub === 'disable') {
            if (!guildConfig.enabled) {
                return message.reply('<:Cancel:1473037949187657818> Vanity Guard is already **disabled**.');
            }
            guildConfig.enabled = false;
            saveConfig(config);

            const container = new ContainerBuilder()
                .setAccentColor(0xED4245)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Cancel:1473037949187657818> Vanity Guard Disabled\n\n` +
                    `Vanity URL protection has been turned off.\n` +
                    `Anyone with \`MANAGE_GUILD\` can now change the vanity.`
                ));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (sub === 'wl') {
            const user = message.mentions.users.first();
            if (!user) {
                return message.reply('<:Cancel:1473037949187657818> Mention a user to toggle their vanity guard whitelist status.\n**Usage:** `vanityguard wl @user`');
            }

            if (!guildConfig.whitelistedUsers) guildConfig.whitelistedUsers = [];

            if (guildConfig.whitelistedUsers.includes(user.id)) {
                guildConfig.whitelistedUsers = guildConfig.whitelistedUsers.filter(id => id !== user.id);
                saveConfig(config);

                const container = new ContainerBuilder()
                    .setAccentColor(0xED4245)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Vanity Whitelist Removed\n\n` +
                        `**User:** ${user} (\`${user.id}\`)\n\n` +
                        `> This user can no longer change the vanity URL.`
                    ));
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } else {
                guildConfig.whitelistedUsers.push(user.id);
                saveConfig(config);

                const container = new ContainerBuilder()
                    .setAccentColor(0x57F287)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> Vanity Whitelist Added\n\n` +
                        `**User:** ${user} (\`${user.id}\`)\n\n` +
                        `> This user is now allowed to change the vanity URL.`
                    ));
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
        }

        const panel = buildPanel(guildConfig, message.guild.name);
        return message.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
    }
};
