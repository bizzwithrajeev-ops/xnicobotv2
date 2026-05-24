const { PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { updateGuildConfig } = require('../../utils/database');
const { buildPermissionDenied, buildInvalidUsage, buildSuccessResponse, EMOJIS } = require('../../utils/responseBuilder');

const jsonStore = require('../../utils/jsonStore');

function getToggle() {
    if (!jsonStore.has('levelingtoggle')) {
        jsonStore.write('levelingtoggle', {});
        return {};
    }
    return jsonStore.read('levelingtoggle');
}

function saveToggle(data) {
    jsonStore.write('levelingtoggle', data);
}

module.exports = {
    data: null, // Prefix-only
    name: 'toggleleveling',
    prefix: 'toggleleveling',
    description: 'Toggle leveling on or off for channels',
    usage: 'toggleleveling <on|off|enable|disable|list> [#channel]',
    category: 'leveling',
    aliases: ['togglelevel', 'togglexp'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await message.reply({ components: [buildPermissionDenied('Administrator')], flags: MessageFlags.IsComponentsV2 });
        }

        const subcommand = args[0]?.toLowerCase();

        if (subcommand === 'on') {
            const toggle = getToggle();
            if (!toggle[message.guild.id]) {
                toggle[message.guild.id] = { enabled: true, disabledChannels: [] };
            }

            toggle[message.guild.id].enabled = true;
            saveToggle(toggle);
            await updateGuildConfig(message.guild.id, { 'leveling.enabled': true }).catch(() => {});

            const container = buildSuccessResponse('Leveling System Enabled', 'Users will now gain XP when chatting in this server.', {
                'Status': '<:Toggleon:1473038585501581312> Active',
                'XP Gain': 'All eligible channels'
            });
            container.setAccentColor(0x57F287);
            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# <:Lightbulbalt:1473038470787240009> Use \`-toggleleveling disable #channel\` to disable XP in specific channels`));
            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'off') {
            const toggle = getToggle();
            if (!toggle[message.guild.id]) {
                toggle[message.guild.id] = { enabled: false, disabledChannels: [] };
            }

            toggle[message.guild.id].enabled = false;
            saveToggle(toggle);
            await updateGuildConfig(message.guild.id, { 'leveling.enabled': false }).catch(() => {});

            const container = new ContainerBuilder()
                .setAccentColor(0xED4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Microphoneoff:1473039278438219984> Leveling System Disabled\n\nUsers will no longer gain XP in this server.\n\n> **Status:** <:Toggleoff:1473038582813032590> Inactive`)
                );
            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'disable') {
            const channel = message.mentions.channels.first();

            if (!channel) {
                return await message.reply({
                    components: [buildInvalidUsage('toggleleveling', '-toggleleveling disable #channel', ['-toggleleveling disable #general', '-toggleleveling disable #bot-spam'])],
                    flags: MessageFlags.IsComponentsV2
                });
            }

            const toggle = getToggle();
            if (!toggle[message.guild.id]) {
                toggle[message.guild.id] = { enabled: true, disabledChannels: [] };
            }

            if (toggle[message.guild.id].disabledChannels.includes(channel.id)) {
                const container = new ContainerBuilder()
                    .setAccentColor(0xFEE75C)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`# ${EMOJIS.WARNING} Already Disabled\n\nXP gain is already disabled in ${channel}.`)
                    );
                return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            toggle[message.guild.id].disabledChannels.push(channel.id);
            saveToggle(toggle);

            const container = buildSuccessResponse('Channel XP Disabled', `XP gain has been disabled in ${channel}.`, {
                'Channel': `${channel}`,
                'Disabled Channels': `${toggle[message.guild.id].disabledChannels.length} total`
            });
            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'enable') {
            const channel = message.mentions.channels.first();

            if (!channel) {
                const toggle = getToggle();
                if (!toggle[message.guild.id]) {
                    toggle[message.guild.id] = { enabled: true, disabledChannels: [] };
                }

                toggle[message.guild.id].enabled = true;
                saveToggle(toggle);
                await updateGuildConfig(message.guild.id, { 'leveling.enabled': true }).catch(() => {});

                const container = buildSuccessResponse('Leveling System Enabled', 'Users will now gain XP when chatting in this server.', {
                    'Status': '<:Toggleon:1473038585501581312> Active'
                });
                container.setAccentColor(0x57F287);
                return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const toggle = getToggle();
            if (!toggle[message.guild.id]) {
                toggle[message.guild.id] = { enabled: true, disabledChannels: [] };
            }

            const before = toggle[message.guild.id].disabledChannels.length;
            toggle[message.guild.id].disabledChannels = toggle[message.guild.id].disabledChannels.filter(id => id !== channel.id);
            saveToggle(toggle);

            if (before === toggle[message.guild.id].disabledChannels.length) {
                const container = new ContainerBuilder()
                    .setAccentColor(0xFEE75C)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`# ${EMOJIS.WARNING} Not in List\n\n${channel} was not in the disabled channels list.`)
                    );
                return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const container = buildSuccessResponse('Channel XP Enabled', `XP gain has been re-enabled in ${channel}.`, {
                'Channel': `${channel}`,
                'Disabled Channels': `${toggle[message.guild.id].disabledChannels.length} remaining`
            });
            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'list') {
            const toggle = getToggle();
            const guildToggle = toggle[message.guild.id];
            const isEnabled = guildToggle?.enabled !== false;
            const disabledChannels = guildToggle?.disabledChannels || [];

            let content = `# <:Settings:1473037894703779851> Leveling Toggle Status\n\n`;
            content += `**System Status:** ${isEnabled ? '<:Toggleon:1473038585501581312> Enabled' : '<:Toggleoff:1473038582813032590> Disabled'}\n\n`;

            if (disabledChannels.length === 0) {
                content += `### Disabled Channels\nNo channels are disabled — XP is active in all channels.`;
            } else {
                content += `### Disabled Channels (${disabledChannels.length})\n`;
                for (const channelId of disabledChannels) {
                    const ch = message.guild.channels.cache.get(channelId);
                    content += `> <:Caretright:1473038207221502106> ${ch || `\`${channelId}\` (deleted)`}\n`;
                }
            }

            const container = new ContainerBuilder()
                .setAccentColor(isEnabled ? 0x57F287 : 0xED4245)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# <:Lightbulbalt:1473038470787240009> Use \`-toggleleveling on/off\` to toggle the system`));

            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // No subcommand - toggle the system and show help
        const toggleConfig = getToggle();
        const guildId = message.guild.id;

        if (!toggleConfig[guildId]) {
            toggleConfig[guildId] = { enabled: false, disabledChannels: [] };
        }

        const isEnabled = toggleConfig[guildId].enabled === true;

        if (isEnabled) {
            toggleConfig[guildId].enabled = false;
            saveToggle(toggleConfig);
            await updateGuildConfig(guildId, { 'leveling.enabled': false }).catch(() => {});
        } else {
            toggleConfig[guildId].enabled = true;
            saveToggle(toggleConfig);
            await updateGuildConfig(guildId, { 'leveling.enabled': true }).catch(() => {});
        }

        const newState = !isEnabled;
        let content = `# <:Fire:1473038604812161218> Leveling System\n\n`;
        content += `**Status:** ${newState ? '<:Toggleon:1473038585501581312> Enabled' : '<:Toggleoff:1473038582813032590> Disabled'}\n\n`;
        content += `### <:Document:1473039496995143731> Available Commands\n`;
        content += `> \`-toggleleveling on\` — Enable leveling system\n`;
        content += `> \`-toggleleveling off\` — Disable leveling system\n`;
        content += `> \`-toggleleveling enable #channel\` — Re-enable XP in a channel\n`;
        content += `> \`-toggleleveling disable #channel\` — Disable XP in a channel\n`;
        content += `> \`-toggleleveling list\` — View disabled channels`;

        const container = new ContainerBuilder()
            .setAccentColor(newState ? 0x57F287 : 0xED4245)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('toggleleveling_list')
                        .setLabel('View Disabled Channels')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('<:Document:1473039496995143731>'),
                    new ButtonBuilder()
                        .setCustomId('toggleleveling_toggle')
                        .setLabel(newState ? 'Disable' : 'Enable')
                        .setStyle(newState ? ButtonStyle.Danger : ButtonStyle.Success)
                        .setEmoji(newState ? '<:Toggleoff:1473038582813032590>' : '<:Toggleon:1473038585501581312>')
                )
            );

        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};