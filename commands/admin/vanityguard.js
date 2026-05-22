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
        whitelistedUsers: [],
        logChannelId: null,
        action: 'none' // 'none' | 'kick' | 'ban'
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
    const logChDisplay = guildConfig.logChannelId ? `<#${guildConfig.logChannelId}>` : '*Not set*';
    const actionDisplay = (guildConfig.action || 'none') === 'none'
        ? 'Revert only'
        : (guildConfig.action === 'kick' ? 'Revert + Kick' : 'Revert + Ban');

    const content =
        `# <:Shield:1473038669831995494> Vanity Guard\n` +
        `-# Protect your server's vanity URL for **${guildName}**\n\n` +
        `${statusEmoji} ${statusText}\n` +
        `<:Document:1473039496995143731> **Log channel:** ${logChDisplay}\n` +
        `<:Lightningalt:1473038679906844824> **Action on violation:** ${actionDisplay}\n\n` +
        `### What Vanity Guard Does\n` +
        `▸ Monitors vanity URL changes via guildUpdate + audit log\n` +
        `▸ Reverts unauthorized changes (boost tier 3 required)\n` +
        `▸ Optionally kicks/bans the offender\n` +
        `▸ Sends an alert to your log channel\n\n` +
        `### <:Userplus:1473038912212435086> Whitelisted Users (${wlCount})\n` +
        `${wlDisplay}\n\n` +
        `### Commands\n` +
        `▸ \`vanityguard enable / disable\`\n` +
        `▸ \`vanityguard wl @user\` — Toggle whitelist\n` +
        `▸ \`vanityguard log #channel\` — Set alert channel\n` +
        `▸ \`vanityguard action none|kick|ban\` — Punishment on violation\n\n` +
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

        if (sub === 'log') {
            const channel = message.mentions.channels.first();
            if (!channel) {
                guildConfig.logChannelId = null;
                saveConfig(config);
                return message.reply('<:Checkedbox:1473038547165384804> Vanity Guard log channel cleared.');
            }
            guildConfig.logChannelId = channel.id;
            saveConfig(config);
            return message.reply(`<:Checkedbox:1473038547165384804> Vanity Guard alerts will be sent to ${channel}.`);
        }

        if (sub === 'action') {
            const choice = (args[1] || '').toLowerCase();
            if (!['none', 'kick', 'ban'].includes(choice)) {
                return message.reply('<:Cancel:1473037949187657818> Action must be one of: `none`, `kick`, `ban`.');
            }
            guildConfig.action = choice;
            saveConfig(config);
            return message.reply(`<:Checkedbox:1473038547165384804> Action set to **${choice}**.`);
        }

        const panel = buildPanel(guildConfig, message.guild.name);
        return message.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
    }
};
