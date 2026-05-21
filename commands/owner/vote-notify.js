const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const jsonStore = require('../../utils/jsonStore');
const { checkAndExpire } = require('../../utils/panelExpiration');

function loadConfig() {
    if (!jsonStore.has('vote-config')) {
        jsonStore.write('vote-config', {});
        return {};
    }
    return jsonStore.read('vote-config');
}

function saveConfig(config) {
    jsonStore.write('vote-config', config);
}

function buildVotePanel(config, client) {
    const container = new ContainerBuilder()
        .setAccentColor(0xCAD7E6);

    let content = `# <:Fire:1473038604812161218> Top.gg Vote Notifications\n\n`;
    content += `**Status:** ${config?.enabled ? '<:Checkedbox:1473038547165384804> Enabled' : '<:Cancel:1473037949187657818> Disabled'}\n`;
    content += `**Channel:** ${config?.channelId ? `<#${config.channelId}>` : '*Not set*'}\n`;
    content += `**Ping Role:** ${config?.pingRoleId ? `<@&${config.pingRoleId}>` : '*None*'}\n\n`;

    content += `### Statistics\n`;
    content += `<:Fire:1473038604812161218> Total Votes: **${config?.totalVotes || 0}**\n`;
    content += `<:Clock:1473039102113878056> Last Vote: ${config?.lastVote ? `<t:${Math.floor(config.lastVote / 1000)}:R>` : '*Never*'}\n\n`;

    content += `### Features\n`;
    content += `• Vote notifications in channel\n`;
    content += `• DM thank you message to voters\n`;
    content += `• Vote reminder after 12 hours\n`;
    content += `• "Voter" badge for supporters\n\n`;

    content += `### Supported Platforms\n`;
    content += `<:topgg:1473546762248523839> **Top.gg** — \`/topgg-webhook\`\n`;
    content += `<:Cursor:1473038064564834544> **DiscordBotList** — \`/dbl-webhook\`\n\n`;

    content += `-# Configure your webhook URLs to: \`https://yourdomain/<endpoint>\``;

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    return container;
}

function createSettingsRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('vote_set_channel')
            .setLabel('Set Channel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Bullhorn:1473038903157199093>'),
        new ButtonBuilder()
            .setCustomId('vote_set_role')
            .setLabel('Ping Role')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Notificationon:1473038417691676784>'),
        new ButtonBuilder()
            .setCustomId('vote_test')
            .setLabel('Test')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🧪')
    );
}

function createControlRow(config) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('vote_toggle')
            .setLabel(config?.enabled ? 'Disable' : 'Enable')
            .setStyle(config?.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
            .setEmoji(config?.enabled ? '<:Cancel:1473037949187657818>' : '<:Checkedbox:1473038547165384804>'),
        new ButtonBuilder()
            .setLabel('Top.gg')
            .setURL('https://top.gg')
            .setStyle(ButtonStyle.Link)
            .setEmoji('<:topgg:1473546762248523839>'),
        new ButtonBuilder()
            .setLabel('DiscordBotList')
            .setURL('https://discordbotlist.com/bots/xnico')
            .setStyle(ButtonStyle.Link)
            .setEmoji('<:Cursor:1473038064564834544>')
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vote-notify')
        .setDescription('Configure Top.gg vote notifications')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const config = loadConfig();
        const guildConfig = config[interaction.guild.id] || {};

        const container = buildVotePanel(guildConfig, interaction.client);
        const settingsRow = createSettingsRow();
        const controlRow = createControlRow(guildConfig);

        await interaction.reply({
            components: [container, settingsRow, controlRow],
            flags: MessageFlags.IsComponentsV2
        });
    },

    async executePrefix(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('<:Cancel:1473037949187657818> You need **Administrator** permission!');
        }

        const config = loadConfig();
        const guildConfig = config[message.guild.id] || {};

        const container = buildVotePanel(guildConfig, message.client);
        const settingsRow = createSettingsRow();
        const controlRow = createControlRow(guildConfig);

        await message.reply({
            components: [container, settingsRow, controlRow],
            flags: MessageFlags.IsComponentsV2
        });
    },

    async handleInteraction(interaction) {
        if (!interaction.isButton()) return false;

        const customId = interaction.customId;
        if (!customId.startsWith('vote_')) return false;

        // Check if config session has expired
        if (await checkAndExpire(interaction, 'config')) return true;

        if (!interaction.guild || !interaction.member) {
            await interaction.reply({ content: '<:Cancel:1473037949187657818> This can only be used in a server.', flags: MessageFlags.Ephemeral });
            return true;
        }
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: '<:Cancel:1473037949187657818> Admin only!', flags: MessageFlags.Ephemeral });
            return true;
        }

        const config = loadConfig();
        const guildId = interaction.guild.id;
        if (!config[guildId]) config[guildId] = {};

        if (customId === 'vote_toggle') {
            config[guildId].enabled = !config[guildId].enabled;
            saveConfig(config);

            const container = buildVotePanel(config[guildId], interaction.client);
            const settingsRow = createSettingsRow();
            const controlRow = createControlRow(config[guildId]);
            await interaction.update({ components: [container, settingsRow, controlRow] });
            return true;
        }

        if (customId === 'vote_set_channel') {
            const modal = new ModalBuilder()
                .setCustomId('vote_channel_modal')
                .setTitle('Set Vote Notification Channel');

            const input = new TextInputBuilder()
                .setCustomId('channel_id')
                .setLabel('Channel ID')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('123456789012345678')
                .setValue(config[guildId].channelId || '')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return true;
        }

        if (customId === 'vote_set_role') {
            const modal = new ModalBuilder()
                .setCustomId('vote_role_modal')
                .setTitle('Set Ping Role');

            const input = new TextInputBuilder()
                .setCustomId('role_id')
                .setLabel('Role ID (leave empty for none)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('123456789012345678')
                .setValue(config[guildId].pingRoleId || '')
                .setRequired(false);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
            return true;
        }

        if (customId === 'vote_test') {
            if (!config[guildId].channelId) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> Set a channel first!', flags: MessageFlags.Ephemeral });
                return true;
            }

            const channel = interaction.guild.channels.cache.get(config[guildId].channelId);
            if (!channel) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> Channel not found!', flags: MessageFlags.Ephemeral });
                return true;
            }

            const clientId = interaction.client.user.id;
            const nextVoteTime = Math.floor(Date.now() / 1000) + 43200;

            const headerSection = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Fire:1473038604812161218> New Vote Received!`
                    )
                )
                .setThumbnailAccessory(
                    new ThumbnailBuilder({ media: { url: interaction.user.displayAvatarURL({ size: 256 }) } })
                );

            let statsContent = `### <:user:1417581304299741184> Voter\n`;
            statsContent += `**${interaction.user.globalName || interaction.user.username}** (\`${interaction.user.username}\`)\n\n`;
            statsContent += `### <:Fire:1473038604812161218> Vote Statistics\n`;
            statsContent += `🗳️ **Streak:** 1 vote in a row\n`;
            statsContent += `<a:loading:1506015728871149770> **Total Votes:** 1\n\n`;
            statsContent += `### 🧪 Test Notification\n`;
            statsContent += `*This is a test vote notification.*\n\n`;
            statsContent += `### <:Clock:1473039102113878056> Next Vote\n`;
            statsContent += `Available <t:${nextVoteTime}:R> (<t:${nextVoteTime}:t>)\n\n`;
            statsContent += `-# Thank you for supporting ${interaction.client.user.username}! Every vote helps us grow.`;

            const testContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addSectionComponents(headerSection)
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(statsContent));

            const voteBtn = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('Vote on Top.gg')
                    .setURL(`https://top.gg/bot/${clientId}/vote`)
                    .setStyle(ButtonStyle.Link)
                    .setEmoji('<:topgg:1473546762248523839>'),
                new ButtonBuilder()
                    .setLabel('Vote on DBL')
                    .setURL('https://discordbotlist.com/bots/xnico')
                    .setStyle(ButtonStyle.Link)
                    .setEmoji('<:Cursor:1473038064564834544>'),
                new ButtonBuilder()
                    .setLabel('View Bot Page')
                    .setURL(`https://top.gg/bot/${clientId}`)
                    .setStyle(ButtonStyle.Link)
                    .setEmoji('<:Attach:1473037923979886694>')
            );

            if (config[guildId].pingRoleId) {
                testContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(`<@&${config[guildId].pingRoleId}>`));
            }
            await channel.send({ components: [testContainer, voteBtn], flags: MessageFlags.IsComponentsV2 });
            await interaction.reply({ content: '<:Checkedbox:1473038547165384804> Test notification sent!', flags: MessageFlags.Ephemeral });
            return true;
        }

        return false;
    },

    async handleModalSubmit(interaction) {
        const customId = interaction.customId;
        if (!customId.startsWith('vote_')) return false;

        const config = loadConfig();
        const guildId = interaction.guild.id;
        if (!config[guildId]) config[guildId] = {};

        if (customId === 'vote_channel_modal') {
            const channelId = interaction.fields.getTextInputValue('channel_id').replace(/[<#>]/g, '');
            const channel = interaction.guild.channels.cache.get(channelId);

            if (!channel) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> Channel not found!', flags: MessageFlags.Ephemeral });
                return true;
            }

            config[guildId].channelId = channelId;
            saveConfig(config);

            const container = buildVotePanel(config[guildId], interaction.client);
            const settingsRow = createSettingsRow();
            const controlRow = createControlRow(config[guildId]);

            try { await interaction.message.edit({ components: [container, settingsRow, controlRow] }); } catch { }
            await interaction.reply({ content: `<:Checkedbox:1473038547165384804> Vote notifications will be sent to ${channel}!`, flags: MessageFlags.Ephemeral });
            return true;
        }

        if (customId === 'vote_role_modal') {
            const roleId = interaction.fields.getTextInputValue('role_id').replace(/[<@&>]/g, '');

            if (roleId) {
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) {
                    await interaction.reply({ content: '<:Cancel:1473037949187657818> Role not found!', flags: MessageFlags.Ephemeral });
                    return true;
                }
                config[guildId].pingRoleId = roleId;
            } else {
                config[guildId].pingRoleId = null;
            }

            saveConfig(config);

            const container = buildVotePanel(config[guildId], interaction.client);
            const settingsRow = createSettingsRow();
            const controlRow = createControlRow(config[guildId]);

            try { await interaction.message.edit({ components: [container, settingsRow, controlRow] }); } catch { }
            await interaction.reply({ content: '<:Checkedbox:1473038547165384804> Ping role updated!', flags: MessageFlags.Ephemeral });
            return true;
        }

        return false;
    },

    loadConfig,
    saveConfig
};
