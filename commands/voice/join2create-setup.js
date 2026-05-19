const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ContainerBuilder, TextDisplayBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildSuccessResponse, buildErrorResponse, BRANDING } = require('../../utils/responseBuilder');

const jsonStore = require('../../utils/jsonStore');
// --- Shared control panel builder ---
function buildControlPanel() {
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('j2c_rename').setLabel('Rename').setEmoji('<:Editalt:1473038138577256670>').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('j2c_limit').setLabel('Limit').setEmoji('<:User:1473038971398520977>').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('j2c_bitrate').setLabel('Bitrate').setEmoji('<:Volumeup:1473039290136002844>').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('j2c_invite').setLabel('Invite').setEmoji('<:Attach:1473037923979886694>').setStyle(ButtonStyle.Primary)
        );

    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('j2c_lock').setLabel('Lock').setEmoji('<:Lock:1473038513749491773>').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('j2c_unlock').setLabel('Unlock').setEmoji('<:Unlock:1473038516639236269>').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('j2c_hide').setLabel('Hide').setEmoji('<:Eyeclosed:1473038425085972521>').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('j2c_unhide').setLabel('Unhide').setEmoji('<:Eye:1473038435056095242>').setStyle(ButtonStyle.Secondary)
        );

    const row3 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('j2c_kick').setLabel('Kick').setEmoji('<:dnd:1473370101427343403>').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('j2c_block').setLabel('Block').setEmoji('<:Commentblock:1473370739351490794>').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('j2c_unblock').setLabel('Unblock').setEmoji('<:Checkedbox:1473038547165384804>').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('j2c_permit').setLabel('Permit').setEmoji('<:Userplus:1473038912212435086>').setStyle(ButtonStyle.Success)
        );

    const row4 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('j2c_trust').setLabel('Trust').setEmoji('<:trust:1479780674532671673>').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('j2c_untrust').setLabel('Untrust').setEmoji('<:untrust:1479780596971737149>').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('j2c_region').setLabel('Region').setEmoji('<:rocket:1479780552276967465>').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('j2c_info').setLabel('Info').setEmoji('<:Document:1473039496995143731>').setStyle(ButtonStyle.Secondary)
        );

    const row5 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('j2c_claim').setLabel('Claim').setEmoji('<:Crown:1506010837368963142>').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('j2c_transfer').setLabel('Transfer').setEmoji('<:transfer:1479780506718437396>').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('j2c_delete').setLabel('Delete').setEmoji('<:Trash:1473038090074591293>').setStyle(ButtonStyle.Danger)
        );

    const headerText = `# <:Volumeup:1473039290136002844> Voice Channel Controls\n-# Create and manage your own private voice channels`;

    const startText = `### <:Chat:1473038936241864865> Getting Started\n` +
        `**1.** Join the **<:Add:1473038100862337035> Join to Create** voice channel\n` +
        `**2.** Your personal voice channel is created automatically\n` +
        `**3.** Use the buttons below to customize it`;

    const settingsText = `### <:Settings:1473037894703779851> Channel Settings\n` +
        `<:Editalt:1473038138577256670> **Rename** — Change channel name\n` +
        `<:User:1473038971398520977> **Limit** — Set max users (0 = unlimited)\n` +
        `<:Volumeup:1473039290136002844> **Bitrate** — Audio quality (8-384 kbps)\n` +
        `<:Attach:1473037923979886694> **Invite** — Get invite link`;

    const privacyText = `### <:Key:1473038690606649375> Privacy & Access\n` +
        `<:Lock:1473038513749491773> **Lock** / <:Unlock:1473038516639236269> **Unlock** — Allow or block new joins\n` +
        `<:Eyeclosed:1473038425085972521> **Hide** / <:Eye:1473038435056095242> **Unhide** — Toggle visibility\n` +
        `<:dnd:1473370101427343403> **Kick** — Remove a user from channel\n` +
        `<:Commentblock:1473370739351490794> **Block** / **Unblock** — Ban user from channel\n` +
        `<:Userplus:1473038912212435086> **Permit** — Allow specific users to bypass lock`;

    const advancedText = `### <:trust:1479780674532671673> Advanced Controls\n` +
        `<:trust:1479780674532671673> **Trust** / <:untrust:1479780596971737149> **Untrust** — Add or remove co-owners\n` +
        `<:rocket:1479780552276967465> **Region** — Change voice server region\n` +
        `<:Document:1473039496995143731> **Info** — View channel details & members`;

    const ownershipText = `### <:Crown:1506010837368963142> Ownership\n` +
        `<:Crown:1506010837368963142> **Claim** — Take ownership if owner left\n` +
        `<:transfer:1479780506718437396> **Transfer** — Give channel to another user`;

    const container = new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(startText))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(settingsText))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(privacyText))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(advancedText))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(ownershipText))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(row1, row2, row3, row4, row5)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Only the channel owner can use these controls\n${BRANDING}`));

    return container;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join2create-setup')
        .setDescription('Setup join-to-create voice channels')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable join-to-create system (auto-creates trigger channel)'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable join-to-create system'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View join-to-create configuration')),

    name: 'join2create-setup',
    prefix: 'join2create-setup',
    description: 'Setup join-to-create voice channels',
    usage: 'join2create-setup <enable|disable|status>',
    category: 'voice',
    aliases: ['j2c', 'j2csetup'],

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        let config = {};
        if (jsonStore.has('join2create')) {
            config = jsonStore.read('join2create');
        }

        if (subcommand === 'enable') {
            if (config[interaction.guild.id]?.enabled) {
                const container = buildErrorResponse('Already Enabled', 'Join-to-create is already enabled! Use `/join2create-setup disable` first.');
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            await interaction.deferReply();

            try {
                const triggerChannel = await interaction.guild.channels.create({
                    name: 'Join to Create',
                    type: ChannelType.GuildVoice,
                    position: 0
                });

                const interfaceChannel = await interaction.guild.channels.create({
                    name: 'voice-controls',
                    type: ChannelType.GuildText,
                    topic: 'Control your temporary voice channels here. Only channel owners can use the controls.',
                    position: 0
                });

                const controlContainer = buildControlPanel();
                const controlMessage = await interfaceChannel.send({
                    components: [controlContainer],
                    flags: MessageFlags.IsComponentsV2
                });

                config[interaction.guild.id] = {
                    triggerChannelId: triggerChannel.id,
                    interfaceChannelId: interfaceChannel.id,
                    controlPanelMessageId: controlMessage.id,
                    enabled: true,
                    activeChannels: {}
                };

                jsonStore.write('join2create', config);

                const successText = `# <:Checkedbox:1473038547165384804> Join-to-Create Enabled\n-# Temporary voice channels are now available`;
                const configText = `### <:Document:1473039496995143731> Configuration\n` +
                    `**Trigger Channel:** ${triggerChannel}\n` +
                    `**Control Panel:** ${interfaceChannel}`;
                const howText = `### <:Chat:1473038936241864865> How It Works\n` +
                    `**1.** Members join the **<:Add:1473038100862337035> Join to Create** channel\n` +
                    `**2.** A private voice channel is automatically created\n` +
                    `**3.** Channel owner uses the control panel to customize\n` +
                    `**4.** Channel is deleted when everyone leaves`;
                const featuresText = `### <:Settings:1473037894703779851> Available Controls (18 Features)\n` +
                    `**Settings:** Rename, User Limit, Bitrate, Invite Link\n` +
                    `**Privacy:** Lock/Unlock, Hide/Unhide, Kick, Block/Unblock, Permit\n` +
                    `**Advanced:** Trust/Untrust (co-owners), Voice Region, Info\n` +
                    `**Ownership:** Claim, Transfer, Delete`;

                const container = new ContainerBuilder()
                    .setAccentColor(0x57F287)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(successText))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(configText))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(howText))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(featuresText))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

                await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch (error) {
                const container = buildErrorResponse('Setup Failed', `Failed to create channels: ${error.message}`);
                await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

        } else if (subcommand === 'disable') {
            if (!config[interaction.guild.id]) {
                const container = buildErrorResponse('Not Enabled', 'Join-to-create is not enabled in this server!');
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const triggerChannel = interaction.guild.channels.cache.get(config[interaction.guild.id].triggerChannelId);
            const interfaceChannel = interaction.guild.channels.cache.get(config[interaction.guild.id].interfaceChannelId);

            if (triggerChannel) try { await triggerChannel.delete(); } catch {}
            if (interfaceChannel) try { await interfaceChannel.delete(); } catch {}

            delete config[interaction.guild.id];
            jsonStore.write('join2create', config);

            const container = buildSuccessResponse('System Disabled', 'Join-to-create has been disabled and channels deleted.');
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        } else if (subcommand === 'status') {
            const guildConfig = config[interaction.guild.id];

            if (!guildConfig || !guildConfig.enabled) {
                const container = buildErrorResponse('Not Enabled', 'Join-to-create is not enabled in this server!');
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const triggerChannel = interaction.guild.channels.cache.get(guildConfig.triggerChannelId);
            const interfaceChannel = interaction.guild.channels.cache.get(guildConfig.interfaceChannelId);
            const activeCount = Object.keys(guildConfig.activeChannels || {}).length;

            const headerText = `# <:Volumeup:1473039290136002844> Join-to-Create Status\n-# Temporary voice channels for your server members`;
            const configText = `### <:Document:1473039496995143731> Configuration\n` +
                `**Status:** <:online:1473369837245042762> Enabled\n` +
                `**Trigger Channel:** ${triggerChannel || '*Not found*'}\n` +
                `**Control Panel:** ${interfaceChannel || '*Not found*'}\n` +
                `**Active Channels:** \`${activeCount}\``;
            const cmdsText = `### <:Chat:1473038936241864865> Commands\n` +
                `\`/join2create-setup enable\` — Set up the system\n` +
                `\`/join2create-setup disable\` — Remove the system\n` +
                `\`/join2create-setup status\` — View this panel`;

            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(configText))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(cmdsText))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            const container = buildErrorResponse('Permission Denied', 'You need **Administrator** permission to use this command.');
            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let config = {};
        if (jsonStore.has('join2create')) {
            config = jsonStore.read('join2create');
        }

        const subcommand = args[0]?.toLowerCase();

        if (subcommand === 'enable') {
            if (config[message.guild.id]?.enabled) {
                const container = buildErrorResponse('Already Enabled', 'Join-to-create is already enabled! Use `join2create-setup disable` first.');
                return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const loadingContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('### <a:loading:1506015728871149770> Setting Up...\nCreating join-to-create system...'));
            const loadingMsg = await message.reply({ components: [loadingContainer], flags: MessageFlags.IsComponentsV2 });

            try {
                const triggerChannel = await message.guild.channels.create({
                    name: 'Join to Create',
                    type: ChannelType.GuildVoice,
                    position: 0
                });

                const interfaceChannel = await message.guild.channels.create({
                    name: 'voice-controls',
                    type: ChannelType.GuildText,
                    topic: 'Control your temporary voice channels here. Only channel owners can use the controls.',
                    position: 0
                });

                const controlContainer = buildControlPanel();
                const controlMessage = await interfaceChannel.send({
                    components: [controlContainer],
                    flags: MessageFlags.IsComponentsV2
                });

                config[message.guild.id] = {
                    triggerChannelId: triggerChannel.id,
                    interfaceChannelId: interfaceChannel.id,
                    controlPanelMessageId: controlMessage.id,
                    enabled: true,
                    activeChannels: {}
                };

                jsonStore.write('join2create', config);

                const container = buildSuccessResponse('Join-to-Create Enabled', `**Trigger Channel:** ${triggerChannel}\n**Interface Channel:** ${interfaceChannel}\n\nWhen users join the trigger channel, a temporary voice channel will be automatically created. Control panel is available in the interface channel.`);
                await loadingMsg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch (error) {
                const container = buildErrorResponse('Setup Failed', `Failed to create channels: ${error.message}`);
                await loadingMsg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

        } else if (subcommand === 'disable') {
            if (!config[message.guild.id]) {
                const container = buildErrorResponse('Not Enabled', 'Join-to-create is not enabled in this server!');
                return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const triggerChannel = message.guild.channels.cache.get(config[message.guild.id].triggerChannelId);
            const interfaceChannel = message.guild.channels.cache.get(config[message.guild.id].interfaceChannelId);

            if (triggerChannel) try { await triggerChannel.delete(); } catch {}
            if (interfaceChannel) try { await interfaceChannel.delete(); } catch {}

            delete config[message.guild.id];
            jsonStore.write('join2create', config);

            const container = buildSuccessResponse('System Disabled', 'Join-to-create has been disabled and channels deleted.');
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        } else if (subcommand === 'status') {
            const guildConfig = config[message.guild.id];

            if (!guildConfig || !guildConfig.enabled) {
                const container = buildErrorResponse('Not Enabled', 'Join-to-create is not enabled in this server!');
                return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const triggerChannel = message.guild.channels.cache.get(guildConfig.triggerChannelId);
            const interfaceChannel = message.guild.channels.cache.get(guildConfig.interfaceChannelId);
            const activeCount = Object.keys(guildConfig.activeChannels || {}).length;

            const headerText = `# <:Volumeup:1473039290136002844> Join-to-Create Status\n-# Temporary voice channels for your server members`;
            const configText = `### <:Document:1473039496995143731> Configuration\n` +
                `**Status:** <:online:1473369837245042762> Enabled\n` +
                `**Trigger Channel:** ${triggerChannel || '*Not found*'}\n` +
                `**Control Panel:** ${interfaceChannel || '*Not found*'}\n` +
                `**Active Channels:** \`${activeCount}\``;

            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(configText))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        } else {
            const container = buildErrorResponse('Invalid Subcommand', 'Use: `enable`, `disable`, or `status`');
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
