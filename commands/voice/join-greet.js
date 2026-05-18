const { MessageFlags, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder } = require('discord.js');

const jsonStore = require('../../utils/jsonStore');

function loadConfig() {
    try {
        if (jsonStore.has('join-greet')) return jsonStore.read('join-greet');
    } catch {}
    return {};
}

function saveConfig(config) {
    jsonStore.write('join-greet', config);
}

module.exports = {
    data: null,
    name: 'join-greet',
    prefix: 'join-greet',
    description: 'Configure voice channel join/leave greetings',
    usage: 'join-greet <join|leave|toggle|status> [on|off]',
    category: 'voice',
    aliases: ['joingreet', 'vcgreet'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Cancel:1473037949187657818> Permission Denied\n\nYou need **Manage Server** permission.`)
                );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const action = args[0]?.toLowerCase();
        const config = loadConfig();

        if (action === 'join') {
            const voiceChannel = message.member.voice.channel;
            if (!voiceChannel) {
                const container = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder()
                            .setContent(`# <:Cancel:1473037949187657818> Voice Required\n\nJoin the voice channel where you want greetings, then run this command again.`)
                    );
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            config[message.guildId] = {
                ...config[message.guildId],
                voiceChannelId: voiceChannel.id,
                textChannelId: message.channelId,
                enabled: true
            };
            saveConfig(config);

            try {
                const player = message.client.lavalinkManager.createPlayer({
                    guildId: message.guildId,
                    voiceChannelId: voiceChannel.id,
                    textChannelId: message.channelId,
                    selfDeaf: true
                });
                if (!player.connected) await player.connect();
            } catch (err) {
                console.error('Join-greet connect error:', err);
            }

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(
                            `# <:Checkedbox:1473038547165384804> Join Greet Setup\n\n` +
                            `**Channel:** ${voiceChannel}\n` +
                            `**Status:** Enabled\n\n` +
                            `The bot will now greet users who join **${voiceChannel.name}**.\n\n` +
                            `-# Use \`-join-greet toggle off\` to disable | \`-join-greet leave\` to disconnect`
                        )
                );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        } else if (action === 'leave' || action === 'disconnect') {
            const guildConfig = config[message.guildId];
            if (guildConfig) {
                guildConfig.enabled = false;
                saveConfig(config);
            }

            try {
                const player = message.client.lavalinkManager.getPlayer(message.guildId);
                if (player) {
                    if (player.connected) await player.disconnect();
                    await player.destroy();
                }
            } catch {}

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Disconnected\n\nVoice greetings disabled and bot disconnected.`)
                );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        } else if (action === 'toggle') {
            const state = args[1]?.toLowerCase();
            if (state !== 'on' && state !== 'off') {
                const container = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder()
                            .setContent(`# <:Settings:1473037894703779851> Join Greet Toggle\n\n**Usage:** \`-join-greet toggle <on|off>\``)
                    );
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const enabled = state === 'on';
            config[message.guildId] = { ...config[message.guildId], enabled };
            saveConfig(config);

            if (enabled && config[message.guildId]?.voiceChannelId) {
                try {
                    const player = message.client.lavalinkManager.createPlayer({
                        guildId: message.guildId,
                        voiceChannelId: config[message.guildId].voiceChannelId,
                        textChannelId: config[message.guildId].textChannelId || message.channelId,
                        selfDeaf: true
                    });
                    if (!player.connected) await player.connect();
                } catch {}
            }

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Toggle Updated\n\nVoice greetings have been **${enabled ? 'ENABLED' : 'DISABLED'}**.`)
                );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        } else if (action === 'status') {
            const guildConfig = config[message.guildId];
            if (!guildConfig || !guildConfig.voiceChannelId) {
                const container = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder()
                            .setContent(`# <:Settings:1473037894703779851> Join Greet Status\n\n**Status:** Not configured\n\nUse \`-join-greet join\` while in a voice channel to set up.`)
                    );
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const vc = message.guild.channels.cache.get(guildConfig.voiceChannelId);
            const player = message.client.lavalinkManager.getPlayer(message.guildId);
            const connected = player && player.connected;

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(
                            `# <:Settings:1473037894703779851> Join Greet Status\n\n` +
                            `**Channel:** ${vc || 'Deleted Channel'}\n` +
                            `**Enabled:** ${guildConfig.enabled ? 'Yes' : 'No'}\n` +
                            `**Bot Connected:** ${connected ? 'Yes' : 'No'}\n\n` +
                            (!connected && guildConfig.enabled ? `-# Bot is not connected. Use \`-join-greet join\` to reconnect.` : '')
                        )
                );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        } else {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(
                            `# <:Settings:1473037894703779851> Join Greet\n\n` +
                            `Automatically greet users who join or leave a voice channel.\n\n` +
                            `**Commands:**\n` +
                            `> \`-join-greet join\` — Set current VC & connect\n` +
                            `> \`-join-greet toggle <on|off>\` — Enable or disable\n` +
                            `> \`-join-greet leave\` — Disconnect bot\n` +
                            `> \`-join-greet status\` — Show config\n\n` +
                            `-# Language follows your server's speak-config setting`
                        )
                );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
