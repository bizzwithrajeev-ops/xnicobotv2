const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, EmbedBuilder, ChannelType } = require('discord.js');
const { setVerificationConfig, getVerificationConfig, deleteVerificationConfig } = require('../../utils/verificationManager');
const { startMessageBuilderSession, handleButtonInteraction, handleModalSubmit: handleMsgBuilderModal, buildMessageBuilderPanel, buildPreviewEmbed, buildComponentsV2Message, replacePlaceholders: msgReplacePlaceholders, extractPrefixFromCustomId } = require('../../utils/actionMessageBuilder');
const { checkAndExpire } = require('../../utils/panelExpiration');

const captchaTypeNames = {
    math: 'Math Problem',
    text: 'Unscramble Word',
    emoji: 'Emoji Recognition',
    button: 'Button Letter Input',
    random: 'Random (Any Type)'
};

const captchaDescriptions = {
    math: 'Solve a simple math equation (e.g., 5 + 3 = ?)',
    text: 'Unscramble a shuffled word to reveal the answer',
    emoji: 'Identify the correct emoji from a selection',
    button: 'Type letters shown on randomized buttons',
    random: 'Randomly selects from all captcha types'
};

const captchaDifficulty = {
    math: '<:Star:1473038501766369300> Easy',
    text: '<:Star:1473038501766369300><:Star:1473038501766369300> Medium',
    emoji: '<:Star:1473038501766369300> Easy',
    button: '<:Star:1473038501766369300><:Star:1473038501766369300><:Star:1473038501766369300> Hard',
    random: '<:Star:1473038501766369300><:Star:1473038501766369300> Varies'
};

function buildDefaultVerificationPayload(title, description, captchaType, btnRow) {
    const container = new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# ${title}\n\n` +
                `${description}\n\n` +
                `### <:Document:1473039496995143731> How to Verify\n` +
                `**Step 1:** Click the **<:Checkedbox:1473038547165384804> Verify Me** button below\n` +
                `**Step 2:** Complete the captcha challenge that appears\n` +
                `**Step 3:** Submit your answer to get verified!\n\n` +
                `### <:Bookmark:1473038643492028517> Captcha Type: ${captchaTypeNames[captchaType]}\n` +
                `${captchaDescriptions[captchaType]}\n` +
                `**Difficulty:** ${captchaDifficulty[captchaType]}\n\n` +
                `*This verification protects our community from bots and spam*`
            )
        );
    return { components: [container, btnRow], flags: MessageFlags.IsComponentsV2 };
}

function buildVerificationPanelPayload(panelConfig, guild, btnRow) {
    if (panelConfig.mode === 'components') {
        const container = buildComponentsV2Message(panelConfig, null, guild, null);
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addActionRowComponents(btnRow);
        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    } else if (panelConfig.mode === 'embed') {
        const embed = new EmbedBuilder();
        if (panelConfig.title) embed.setTitle(msgReplacePlaceholders(panelConfig.title, null, guild));
        if (panelConfig.description) embed.setDescription(msgReplacePlaceholders(panelConfig.description, null, guild));
        if (panelConfig.color) embed.setColor(panelConfig.color);
        if (panelConfig.image) embed.setImage(panelConfig.image);
        if (panelConfig.thumbnail) embed.setThumbnail(panelConfig.thumbnail);
        if (panelConfig.author) embed.setAuthor({ name: msgReplacePlaceholders(panelConfig.author, null, guild), iconURL: panelConfig.authorIcon || undefined });
        if (panelConfig.footer) embed.setFooter({ text: msgReplacePlaceholders(panelConfig.footer, null, guild), iconURL: panelConfig.footerIcon || undefined });
        if (panelConfig.fields?.length) {
            for (const f of panelConfig.fields.slice(0, 25)) {
                embed.addFields({ name: msgReplacePlaceholders(f.name, null, guild), value: msgReplacePlaceholders(f.value, null, guild), inline: f.inline || false });
            }
        }
        return { embeds: [embed], components: [btnRow] };
    } else {
        const content = msgReplacePlaceholders(panelConfig.content || '', null, guild);
        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
        return { components: [container, btnRow], flags: MessageFlags.IsComponentsV2 };
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verification-setup')
        .setDescription('Setup a captcha verification system to protect your server from bots')
        .addSubcommand(subcommand =>
            subcommand.setName('enable').setDescription('Enable the verification system with captcha protection')
                .addChannelOption(option => option.setName('channel').setDescription('Channel where the verification panel will be displayed').setRequired(true))
                .addRoleOption(option => option.setName('role').setDescription('Role to give members after successful verification').setRequired(true))
                .addStringOption(option => option.setName('title').setDescription('Custom title for the verification message').setRequired(false))
                .addStringOption(option => option.setName('description').setDescription('Custom description for the verification message').setRequired(false))
                .addStringOption(option =>
                    option.setName('captcha-type').setDescription('Type of captcha challenge to use')
                        .addChoices(
                            { name: 'Math Problem - Solve equations', value: 'math' },
                            { name: 'Unscramble Word - Rearrange letters', value: 'text' },
                            { name: 'Emoji Recognition - Identify emojis', value: 'emoji' },
                            { name: 'Button Letter Input - Click letters', value: 'button' },
                            { name: 'Random (Any Type) - Varies each time', value: 'random' }
                        ).setRequired(false)))
        .addSubcommand(subcommand => subcommand.setName('disable').setDescription('Disable the verification system'))
        .addSubcommand(subcommand => subcommand.setName('status').setDescription('View current verification system configuration'))
        .addSubcommand(subcommand => subcommand.setName('help').setDescription('View detailed guide on how to use the verification system'))
        .addSubcommand(subcommand => subcommand.setName('panel').setDescription('Customize the verification panel message displayed in the channel'))
        .addSubcommand(subcommand => subcommand.setName('reset-panel').setDescription('Reset the verification panel message to default'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    prefix: 'verification-setup',
    description: 'Setup a captcha verification system to protect your server from bots',
    category: 'automation',
    aliases: ['verify-setup', 'captcha-setup'],
    usage: 'verification-setup <enable/disable/status/help>',

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'panel') {
            return this.handlePanel(interaction);
        }

        if (subcommand === 'reset-panel') {
            return this.handleResetPanel(interaction);
        }
        
        if (subcommand === 'enable') {
            const channel = interaction.options.getChannel('channel');
            const role = interaction.options.getRole('role');
            const title = interaction.options.getString('title') || '<:Shield:1473038669831995494> Server Verification';
            const description = interaction.options.getString('description') || 'Complete a quick captcha to verify you are human and gain access to the server!';
            const captchaType = interaction.options.getString('captcha-type') || 'random';

            // Count channels that will be affected
            const allChannels = interaction.guild.channels.cache.filter(c => c.id !== channel.id);
            const channelCount = allChannels.filter(c => c.type !== ChannelType.GuildCategory).size;
            const categoryCount = allChannels.filter(c => c.type === ChannelType.GuildCategory).size;

            // Build confirmation prompt
            const confirmContainer = new ContainerBuilder()
                .setAccentColor(0xFEE75C)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Infotriangle:1473038460456800459> Confirmation Required\n\n` +
                        `You are about to activate the **Verification System** for this server.\n\n` +
                        `### <:Shield:1473038669831995494> What Will Happen\n` +
                        `• **All channels** will be **hidden** from \`@everyone\` (${channelCount} channels, ${categoryCount} categories)\n` +
                        `• Only members with the ${role} role will be able to see channels\n` +
                        `• The verification channel ${channel} will remain **visible** to everyone\n` +
                        `• A captcha verification panel will be sent in ${channel}\n` +
                        `• New members must complete a **${captchaTypeNames[captchaType]}** captcha to gain access\n\n` +
                        `### <:Key:1473038690606649375> Permission Changes\n` +
                        `\`@everyone\` → **ViewChannel: ✘ Denied** on all channels\n` +
                        `${role} → **ViewChannel: ✔ Allowed** on all channels\n` +
                        `${channel} → **ViewChannel: ✔ Allowed** for \`@everyone\`\n\n` +
                        `### <:Infotriangle:1473038460456800459> Important\n` +
                        `• This will make your server **fully private and secured**\n` +
                        `• Unverified members will **only** see the verification channel\n` +
                        `• Existing members without ${role} will lose channel access until verified\n\n` +
                        `**Are you sure you want to activate this?**`
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('verify_setup_confirm')
                            .setLabel('Activate Verification System')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('<:Shield:1473038669831995494>'),
                        new ButtonBuilder()
                            .setCustomId('verify_setup_cancel')
                            .setLabel('Cancel')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('<:Cancel:1473037949187657818>')
                    )
                );

            const reply = await interaction.reply({ components: [confirmContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, fetchReply: true });

            const collector = reply.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 60000
            });

            collector.on('collect', async (btn) => {
                if (btn.customId === 'verify_setup_cancel') {
                    const cancelContainer = new ContainerBuilder()
                        .setAccentColor(0xED4245)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `# <:Cancel:1473037949187657818> Setup Cancelled\n\n` +
                                `Verification system setup has been cancelled. No changes were made.\n\n` +
                                `Use \`/verification-setup enable\` to try again.`
                            )
                        );
                    await btn.update({ components: [cancelContainer] });
                    collector.stop();
                    return;
                }

                if (btn.customId === 'verify_setup_confirm') {
                    // Show loading state
                    const loadingContainer = new ContainerBuilder()
                        .setAccentColor(0xCAD7E6)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `# <a:Loading:1485248248720658472> Activating Verification System\n\n` +
                                `Setting up channel permissions and securing your server...\n` +
                                `This may take a moment depending on the number of channels.`
                            )
                        );
                    await btn.update({ components: [loadingContainer] });

                    try {
                        // Apply permissions to all channels
                        let hiddenCount = 0;
                        let failedCount = 0;
                        const guildChannels = interaction.guild.channels.cache;

                        for (const [, ch] of guildChannels) {
                            if (ch.id === channel.id) continue;
                            try {
                                await ch.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
                                await ch.permissionOverwrites.edit(role.id, { ViewChannel: true });
                                hiddenCount++;
                            } catch (err) {
                                console.error(`Verification setup: Failed to set permissions on channel ${ch.name} (${ch.id}):`, err.message);
                                failedCount++;
                            }
                        }

                        // Make verification channel visible to @everyone with restricted messaging
                        try {
                            await channel.permissionOverwrites.edit(interaction.guild.id, {
                                ViewChannel: true,
                                SendMessages: false
                            });
                            await channel.permissionOverwrites.edit(role.id, { ViewChannel: true });
                        } catch (err) {
                            console.error(`Verification setup: Failed to set verification channel permissions:`, err.message);
                        }

                        // Send verification panel
                        const existingCfg = getVerificationConfig(interaction.guild.id);
                        const panelConfig = existingCfg?.panelMessage || null;

                        const button = new ButtonBuilder()
                            .setCustomId('verification_start')
                            .setLabel('Verify Me')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('<:Checkedbox:1473038547165384804>');
                        const btnRow = new ActionRowBuilder().addComponents(button);

                        let sendPayload;
                        if (panelConfig && panelConfig.mode) {
                            sendPayload = buildVerificationPanelPayload(panelConfig, interaction.guild, btnRow);
                        } else {
                            sendPayload = buildDefaultVerificationPayload(title, description, captchaType, btnRow);
                        }

                        const message = await channel.send(sendPayload);

                        // Save config
                        const cfgData = {
                            enabled: true,
                            channelId: channel.id,
                            roleId: role.id,
                            messageId: message.id,
                            title: title,
                            description: description,
                            captchaType: captchaType
                        };
                        if (panelConfig) cfgData.panelMessage = panelConfig;
                        setVerificationConfig(interaction.guild.id, cfgData);

                        // Show success
                        const successContainer = new ContainerBuilder()
                            .setAccentColor(0x57F287)
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(
                                    `# <:Checkedbox:1473038547165384804> Verification System Activated\n\n` +
                                    `Your server is now **fully private and secured** with captcha verification!\n\n` +
                                    `### <:Shield:1473038669831995494> Security Applied\n` +
                                    `**Channels Secured:** ${hiddenCount} channels hidden from \`@everyone\`\n` +
                                    (failedCount > 0 ? `**Failed:** ${failedCount} *(check bot permissions for these channels)*\n` : '') +
                                    `**Verification Channel:** ${channel} *(visible to everyone)*\n` +
                                    `**Verified Role:** ${role}\n\n` +
                                    `### <:Invoice:1473039492217835550> Configuration\n` +
                                    `**Captcha Type:** ${captchaTypeNames[captchaType]}\n` +
                                    `**Difficulty:** ${captchaDifficulty[captchaType]}\n\n` +
                                    `### <:Settings:1473037894703779851> How It Works Now\n` +
                                    `**1.** New members join → They can **only** see ${channel}\n` +
                                    `**2.** They click **Verify Me** → Captcha challenge appears\n` +
                                    `**3.** ${captchaDescriptions[captchaType]}\n` +
                                    `**4.** After verification → They receive ${role} and can see all channels\n\n` +
                                    `### <:Document:1473039496995143731> Management Commands\n` +
                                    `\`/verification-setup status\` - View current configuration\n` +
                                    `\`/verification-setup disable\` - Turn off verification\n` +
                                    `\`/verification-setup help\` - View detailed guide`
                                )
                            );
                        await reply.edit({ components: [successContainer] });
                    } catch (error) {
                        console.error('Error setting up verification:', error);
                        const errorContainer = new ContainerBuilder()
                            .setAccentColor(0xED4245)
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(
                                    `# <:Cancel:1473037949187657818> Setup Failed\n\n` +
                                    `Failed to set up the verification system.\n\n` +
                                    `### <:Infotriangle:1473038460456800459> Possible Causes\n` +
                                    `• Bot lacks **Manage Channels** permission\n` +
                                    `• Bot lacks **Manage Roles** permission\n` +
                                    `• Bot's role is below the verified role in the hierarchy\n` +
                                    `• Missing access to the verification channel\n\n` +
                                    `Please check bot permissions and try again.`
                                )
                            );
                        await reply.edit({ components: [errorContainer] });
                    }
                    collector.stop();
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    const expiredContainer = new ContainerBuilder()
                        .setAccentColor(0x95A5A6)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `# <:History:1473037847568318605> Setup Timed Out\n\n` +
                                `The verification setup confirmation has expired. No changes were made.\n\n` +
                                `Use \`/verification-setup enable\` to try again.`
                            )
                        );
                    await reply.edit({ components: [expiredContainer] }).catch(() => {});
                }
            });
        } else if (subcommand === 'disable') {
            const config = getVerificationConfig(interaction.guild.id);
            
            if (!config) {
                return await interaction.reply({ content: '<:Cancel:1473037949187657818> Verification system is not enabled.', flags: MessageFlags.Ephemeral });
            }

            const verifyChannel = interaction.guild.channels.cache.get(config.channelId);
            const verifyRole = interaction.guild.roles.cache.get(config.roleId);

            // Count channels affected
            const affectedChannels = interaction.guild.channels.cache.filter(c => c.id !== config.channelId);
            const channelCount = affectedChannels.filter(c => c.type !== ChannelType.GuildCategory).size;

            // Build confirmation prompt
            const confirmContainer = new ContainerBuilder()
                .setAccentColor(0xFEE75C)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Infotriangle:1473038460456800459> Disable Verification System?\n\n` +
                        `You are about to **disable** the verification system for this server.\n\n` +
                        `### <:Settings:1473037894703779851> What Will Happen\n` +
                        `• The verification panel will **stop working**\n` +
                        `• New members will **no longer** need to verify\n` +
                        `• Existing verified members keep their ${verifyRole || 'verified'} role\n\n` +
                        `### <:Key:1473038690606649375> Channel Permissions\n` +
                        `Choose whether to **revert channel permissions** (make all ${channelCount} channels visible to \`@everyone\` again) or keep the current restricted permissions.\n\n` +
                        `**Are you sure you want to disable verification?**`
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('verify_disable_revert')
                            .setLabel('Disable & Revert Permissions')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('<:History:1473037847568318605>'),
                        new ButtonBuilder()
                            .setCustomId('verify_disable_keep')
                            .setLabel('Disable Only')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('<:Cancel:1473037949187657818>'),
                        new ButtonBuilder()
                            .setCustomId('verify_disable_cancel')
                            .setLabel('Cancel')
                            .setStyle(ButtonStyle.Secondary)
                    )
                );

            const reply = await interaction.reply({ components: [confirmContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, fetchReply: true });

            const collector = reply.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 60000
            });

            collector.on('collect', async (btn) => {
                if (btn.customId === 'verify_disable_cancel') {
                    const cancelContainer = new ContainerBuilder()
                        .setAccentColor(0xCAD7E6)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `# <:Cancel:1473037949187657818> Cancelled\n\n` +
                                `Verification system remains **active**. No changes were made.`
                            )
                        );
                    await btn.update({ components: [cancelContainer] });
                    collector.stop();
                    return;
                }

                const shouldRevert = btn.customId === 'verify_disable_revert';

                if (shouldRevert) {
                    // Show loading state
                    const loadingContainer = new ContainerBuilder()
                        .setAccentColor(0xCAD7E6)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `# <a:Loading:1485248248720658472> Disabling Verification System\n\n` +
                                `Reverting channel permissions and cleaning up...\n` +
                                `This may take a moment.`
                            )
                        );
                    await btn.update({ components: [loadingContainer] });

                    // Revert permissions on all channels
                    let revertedCount = 0;
                    let revertFailedCount = 0;
                    const roleId = config.roleId;

                    for (const [, ch] of interaction.guild.channels.cache) {
                        try {
                            // Reset @everyone ViewChannel to default (null)
                            const permsToReset = { ViewChannel: null };
                            // Also reset SendMessages on the verification channel
                            if (ch.id === config.channelId) permsToReset.SendMessages = null;
                            await ch.permissionOverwrites.edit(interaction.guild.id, permsToReset);
                            // Remove verified role overwrite if it exists
                            const roleOverwrite = ch.permissionOverwrites.cache.get(roleId);
                            if (roleOverwrite) {
                                await roleOverwrite.delete('Verification system disabled - reverting permissions');
                            }
                            revertedCount++;
                        } catch (err) {
                            console.error(`Verification disable: Failed to revert permissions on channel ${ch.name} (${ch.id}):`, err.message);
                            revertFailedCount++;
                        }
                    }

                    deleteVerificationConfig(interaction.guild.id);

                    const container = new ContainerBuilder()
                        .setAccentColor(0xED4245)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `# <:Toggleoff:1473038582813032590> Verification System Disabled\n\n` +
                                `The verification system has been disabled and channel permissions have been reverted.\n\n` +
                                `### <:Settings:1473037894703779851> Permissions Reverted\n` +
                                `**Channels Restored:** ${revertedCount} channels made visible to \`@everyone\`\n` +
                                (revertFailedCount > 0 ? `**Failed:** ${revertFailedCount} *(check bot permissions)*\n` : '') +
                                `**Verified Role Overwrites:** Removed from all channels\n\n` +
                                `### <:Infotriangle:1473038460456800459> Notes\n` +
                                `• Existing verified members keep their role\n` +
                                `• The verification panel in the channel will stop working\n\n` +
                                `### <:History:1473037847568318605> Re-enable Verification\n` +
                                `Use \`/verification-setup enable #channel @role\` to set up verification again.`
                            )
                        );

                    await reply.edit({ components: [container] });
                } else {
                    // Disable only - keep permissions
                    deleteVerificationConfig(interaction.guild.id);

                    const container = new ContainerBuilder()
                        .setAccentColor(0xED4245)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `# <:Toggleoff:1473038582813032590> Verification System Disabled\n\n` +
                                `The verification system has been disabled for this server.\n\n` +
                                `### <:Infotriangle:1473038460456800459> Important Notes\n` +
                                `• New members will no longer need to complete captcha verification\n` +
                                `• The verification panel in the channel will stop working\n` +
                                `• Existing verified members keep their role\n` +
                                `• **Channel permissions were kept as-is** — channels may still be hidden from \`@everyone\`\n\n` +
                                `### <:Lightbulbalt:1473038470787240009> Tip\n` +
                                `If you want to make all channels visible again, use \`/verification-setup enable\` and then disable with **Revert Permissions**.\n\n` +
                                `### <:History:1473037847568318605> Re-enable Verification\n` +
                                `Use \`/verification-setup enable #channel @role\` to set up verification again.`
                            )
                        );

                    await btn.update({ components: [container] });
                }
                collector.stop();
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    const expiredContainer = new ContainerBuilder()
                        .setAccentColor(0x95A5A6)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `# <:History:1473037847568318605> Timed Out\n\n` +
                                `The disable confirmation has expired. Verification system remains **active**.\n\n` +
                                `Use \`/verification-setup disable\` to try again.`
                            )
                        );
                    await reply.edit({ components: [expiredContainer] }).catch(() => {});
                }
            });
        } else if (subcommand === 'status') {
            const config = getVerificationConfig(interaction.guild.id);
            
            if (!config) {
                const noConfigContainer = new ContainerBuilder()
                    .setAccentColor(0xCAD7E6)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# <:Infotriangle:1473038460456800459> Verification Not Configured\n\n` +
                            `The verification system is not enabled on this server.\n\n` +
                            `### 🚀 Get Started\n` +
                            `Use \`/verification-setup enable #channel @role\` to set up verification.\n\n` +
                            `### <:Document:1473039496995143731> Required Parameters\n` +
                            `**#channel** - Where the verification panel will be displayed\n` +
                            `**@role** - Role to give members after successful verification\n\n` +
                            `### <:Lightbulbalt:1473038470787240009> Tip\n` +
                            `Use \`/verification-setup help\` for a detailed setup guide.`
                        )
                    );
                return await interaction.reply({ components: [noConfigContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            
            const channel = interaction.guild.channels.cache.get(config.channelId);
            const role = interaction.guild.roles.cache.get(config.roleId);
            
            const captchaTypeDisplay = captchaTypeNames[config.captchaType] || 'Random (Any Type)';
            const captchaDesc = captchaDescriptions[config.captchaType] || captchaDescriptions.random;
            const difficulty = captchaDifficulty[config.captchaType] || captchaDifficulty.random;
            
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Shield:1473038669831995494> Verification System Status\n\n` +
                        `Protect your server from bots with captcha verification.\n\n` +
                        `### <:Invoice:1473039492217835550> Current Configuration\n` +
                        `**Status:** <:Toggleon:1473038585501581312> Enabled\n` +
                        `**Verification Channel:** ${channel ? `${channel}` : '*<:Infotriangle:1473038460456800459> Channel not found*'}\n` +
                        `**Verified Role:** ${role ? `${role}` : '*<:Infotriangle:1473038460456800459> Role not found*'}\n` +
                        `**Captcha Type:** ${captchaTypeDisplay}\n` +
                        `**Difficulty:** ${difficulty}\n\n` +
                        `### <:Bookmark:1473038643492028517> Challenge Description\n` +
                        `${captchaDesc}\n\n` +
                        `### <:Document:1473039496995143731> Management Commands\n` +
                        `\`/verification-setup enable\` - Reconfigure verification\n` +
                        `\`/verification-setup disable\` - Turn off verification\n` +
                        `\`/verification-setup help\` - View detailed guide`
                    )
                );
            
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        } else if (subcommand === 'help') {
            const helpContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Clipboard:1473039573037617162> Verification System Guide\n\n` +
                        `Complete guide to setting up and using the captcha verification system.\n\n` +
                        `### <:Settings:1473037894703779851> Initial Setup (Step-by-Step)\n` +
                        `**Step 1:** Create a verification channel (e.g., #verify)\n` +
                        `**Step 2:** Create a "Verified" role with server access\n` +
                        `**Step 3:** Set \`@everyone\` to only see #verify channel\n` +
                        `**Step 4:** Run \`/verification-setup enable #verify @Verified\`\n` +
                        `**Step 5:** Test the verification yourself!\n\n` +
                        `### <:Bookmark:1473038643492028517> Captcha Types Explained\n` +
                        `**Math Problem** <:Star:1473038501766369300> - Solve: \`5 + 3 = ?\` (Easy, fast)\n` +
                        `**Unscramble Word** <:Star:1473038501766369300><:Star:1473038501766369300> - Rearrange: \`LHEOL → HELLO\`\n` +
                        `**Emoji Recognition** <:Star:1473038501766369300> - Select the matching emoji\n` +
                        `**Button Letters** <:Star:1473038501766369300><:Star:1473038501766369300><:Star:1473038501766369300> - Type letters from buttons (Most secure)\n` +
                        `**Random** <:Star:1473038501766369300><:Star:1473038501766369300> - Randomly picks from above types\n\n` +
                        `### <:Key:1473038690606649375> Security Recommendations\n` +
                        `• Use \`button\` type for maximum bot protection\n` +
                        `• Use \`math\` or \`emoji\` for user-friendly verification\n` +
                        `• Keep verification channel clean - delete old messages\n` +
                        `• Periodically check if the system is working\n\n` +
                        `### <:Infotriangle:1473038460456800459> Common Issues\n` +
                        `**Bot can't send messages:** Check bot permissions in channel\n` +
                        `**Role not assigned:** Ensure bot role is above the verified role\n` +
                        `**Users can't see button:** Ensure they can view the channel\n\n` +
                        `### <:Document:1473039496995143731> All Commands\n` +
                        `\`/verification-setup enable\` - Enable with custom settings\n` +
                        `\`/verification-setup disable\` - Disable the system\n` +
                        `\`/verification-setup status\` - View current config\n` +
                        `\`/verification-setup help\` - This guide`
                    )
                );
            
            await interaction.reply({ components: [helpContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('<:Cancel:1473037949187657818> You need Administrator permission to use this command!');
        }

        const subcommand = args[0]?.toLowerCase();

        if (!subcommand || subcommand === 'help') {
            const helpContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Clipboard:1473039573037617162> Verification System Guide\n\n` +
                        `Complete guide to setting up the captcha verification system.\n\n` +
                        `### <:Settings:1473037894703779851> Quick Setup\n` +
                        `**1.** Create a verification channel (e.g., #verify)\n` +
                        `**2.** Create a "Verified" role with server access\n` +
                        `**3.** Use the slash command: \`/verification-setup enable\`\n\n` +
                        `### <:Bookmark:1473038643492028517> Captcha Types\n` +
                        `**Math Problem** <:Star:1473038501766369300> - Solve simple equations\n` +
                        `**Unscramble Word** <:Star:1473038501766369300><:Star:1473038501766369300> - Rearrange shuffled letters\n` +
                        `**Emoji Recognition** <:Star:1473038501766369300> - Select matching emoji\n` +
                        `**Button Letters** <:Star:1473038501766369300><:Star:1473038501766369300><:Star:1473038501766369300> - Type letters (Most secure)\n` +
                        `**Random** <:Star:1473038501766369300><:Star:1473038501766369300> - Varies each time\n\n` +
                        `### <:Document:1473039496995143731> Commands\n` +
                        `\`/verification-setup enable #channel @role\`\n` +
                        `\`/verification-setup disable\`\n` +
                        `\`/verification-setup status\`\n\n` +
                        `*Use slash commands for full functionality*`
                    )
                );
            
            return message.reply({ components: [helpContainer], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'status') {
            const config = getVerificationConfig(message.guild.id);
            
            if (!config) {
                return message.reply('<:Cancel:1473037949187657818> Verification system is not enabled. Use `/verification-setup enable` to set it up.');
            }
            
            const channel = message.guild.channels.cache.get(config.channelId);
            const role = message.guild.roles.cache.get(config.roleId);
            const captchaTypeDisplay = captchaTypeNames[config.captchaType] || 'Random';
            
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Shield:1473038669831995494> Verification Status\n\n` +
                        `**Status:** <:Toggleon:1473038585501581312> Enabled\n` +
                        `**Channel:** ${channel || '*Not found*'}\n` +
                        `**Role:** ${role || '*Not found*'}\n` +
                        `**Captcha:** ${captchaTypeDisplay}\n\n` +
                        `*Use \`/verification-setup\` for full management*`
                    )
                );
            
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'disable') {
            const config = getVerificationConfig(message.guild.id);
            
            if (!config) {
                return message.reply('<:Cancel:1473037949187657818> Verification system is not enabled.');
            }
            
            deleteVerificationConfig(message.guild.id);
            return message.reply('<:Checkedbox:1473038547165384804> Verification system has been disabled.');
        }

        return message.reply('<:Lightbulbalt:1473038470787240009> Unknown subcommand. Use `verification-setup help` for usage information.');
    },

    async handlePanel(interaction) {
        const config = getVerificationConfig(interaction.guild.id);
        if (!config) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> Verification system is not set up yet! Use `/verification-setup enable` first.', flags: MessageFlags.Ephemeral });
        }

        const prefix = `verifypanel:${interaction.guild.id}`;
        const data = startMessageBuilderSession(interaction.user.id, 'verifypanel', interaction.guild.id, 'panel', 'Verification Panel Message');

        if (config.panelMessage) {
            const pm = config.panelMessage;
            data.mode = pm.mode || 'simple';
            data.content = pm.content || '';
            data.title = pm.title || '';
            data.description = pm.description || '';
            data.color = pm.color || '#5865F2';
            data.image = pm.image || '';
            data.thumbnail = pm.thumbnail || '';
            data.footer = pm.footer || '';
            data.footerIcon = pm.footerIcon || '';
            data.author = pm.author || '';
            data.authorIcon = pm.authorIcon || '';
            data.fields = pm.fields || [];
        }

        const container = buildMessageBuilderPanel(data, prefix, 'Verification Panel Message');
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async handleResetPanel(interaction) {
        const config = getVerificationConfig(interaction.guild.id);
        if (!config) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> Verification system is not set up yet!', flags: MessageFlags.Ephemeral });
        }

        delete config.panelMessage;
        setVerificationConfig(interaction.guild.id, config);

        // Update the live panel message
        try {
            const channel = await interaction.guild.channels.fetch(config.channelId).catch(() => null);
            if (channel && config.messageId) {
                const oldMsg = await channel.messages.fetch(config.messageId).catch(() => null);
                if (oldMsg) {
                    const button = new ButtonBuilder()
                        .setCustomId('verification_start')
                        .setLabel('Verify Me')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('<:Checkedbox:1473038547165384804>');
                    const btnRow = new ActionRowBuilder().addComponents(button);
                    const payload = buildDefaultVerificationPayload(
                        config.title || '<:Shield:1473038669831995494> Server Verification',
                        config.description || 'Complete a quick captcha to verify you are human and gain access to the server!',
                        config.captchaType || 'random',
                        btnRow
                    );
                    await oldMsg.edit(payload);
                }
            }
        } catch {}

        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Checkedbox:1473038547165384804> Panel Message Reset\n\n` +
                    `The verification panel message has been reset to the default.\n\n` +
                    `Use \`/verification-setup panel\` to customize it again.`
                )
            );
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async handleInteraction(interaction) {
        if (!interaction.isButton()) return false;
        if (await checkAndExpire(interaction, 'config')) return true;
        const prefix = extractPrefixFromCustomId(interaction.customId);
        if (!prefix.startsWith('verifypanel:')) return false;

        const guildId = prefix.replace('verifypanel:', '');

        const onSave = async (btnInteraction, data) => {
            const config = getVerificationConfig(guildId);
            if (!config) {
                return btnInteraction.update({ content: '<:Cancel:1473037949187657818> Verification config not found!', components: [], flags: MessageFlags.Ephemeral });
            }

            config.panelMessage = {
                mode: data.mode,
                content: data.content || '',
                title: data.title || '',
                description: data.description || '',
                color: data.color || '#5865F2',
                image: data.image || '',
                thumbnail: data.thumbnail || '',
                footer: data.footer || '',
                footerIcon: data.footerIcon || '',
                author: data.author || '',
                authorIcon: data.authorIcon || '',
                fields: data.fields || []
            };
            setVerificationConfig(guildId, config);

            // Update the live panel message
            try {
                const guild = btnInteraction.guild;
                const channel = await guild.channels.fetch(config.channelId).catch(() => null);
                if (channel && config.messageId) {
                    const oldMsg = await channel.messages.fetch(config.messageId).catch(() => null);
                    if (oldMsg) {
                        const button = new ButtonBuilder()
                            .setCustomId('verification_start')
                            .setLabel('Verify Me')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('<:Checkedbox:1473038547165384804>');
                        const btnRow = new ActionRowBuilder().addComponents(button);
                        const payload = buildVerificationPanelPayload(config.panelMessage, guild, btnRow);
                        await oldMsg.edit(payload);
                    }
                }
            } catch {}

            const confirmContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> Panel Message Saved!\n\n` +
                        `Your custom verification panel message has been saved and applied.\n\n` +
                        `**Mode:** ${data.mode === 'embed' ? '<:Document:1473039496995143731> Embed' : data.mode === 'components' ? '<:Settings:1473037894703779851> Components V2' : '<:Chat:1473038936241864865> Simple'}\n\n` +
                        `The panel in the verification channel has been updated.\n\n` +
                        `Use \`/verification-setup reset-panel\` to revert to default.`
                    )
                );
            await btnInteraction.update({ components: [confirmContainer], flags: MessageFlags.IsComponentsV2 });
        };

        const onCancel = async (btnInteraction) => {
            await btnInteraction.update({ content: '<:Cancel:1473037949187657818> Panel builder cancelled.', components: [], flags: MessageFlags.Ephemeral });
        };

        return await handleButtonInteraction(interaction, prefix, 'verifypanel', guildId, 'panel', onSave, onCancel);
    },

    async handleModalSubmit(interaction) {
        const prefix = extractPrefixFromCustomId(interaction.customId);
        if (!prefix.startsWith('verifypanel:')) return false;

        const guildId = prefix.replace('verifypanel:', '');
        return await handleMsgBuilderModal(interaction, prefix, 'verifypanel', guildId, 'panel');
    }
};
