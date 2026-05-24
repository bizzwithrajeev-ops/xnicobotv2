const { 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    ContainerBuilder, 
    TextDisplayBuilder, 
    MessageFlags,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType
} = require('discord.js');
const { 
    toggleInviteTracking, 
    isTrackingEnabled, 
    preloadGuildInvites,
    getRewards,
    setReward,
    removeReward
} = require('../../utils/inviteManager');

const jsonStore = require('../../utils/jsonStore');
const { checkAndExpire } = require('../../utils/panelExpiration');

function loadConfig() {
    if (!jsonStore.has('invites')) {
        return {};
    }
    return jsonStore.read('invites');
}

function saveConfig(config) {
    jsonStore.write('invites', config);
}

function getGuildConfig(guildId) {
    const config = loadConfig();
    return config[guildId] || { enabled: false, rewards: [], channel: null };
}

function updateGuildConfig(guildId, updates) {
    const config = loadConfig();
    if (!config[guildId]) {
        config[guildId] = { enabled: false, rewards: [], channel: null, totals: {}, members: {}, invites: {} };
    }
    Object.assign(config[guildId], updates);
    saveConfig(config);
    return config[guildId];
}

function buildMainPanel(guildConfig, guild) {
    const enabled = guildConfig.enabled;
    const rewards = guildConfig.rewards || [];
    const logChannel = guildConfig.channel ? guild.channels.cache.get(guildConfig.channel) : null;
    
    let content = `# <:Fire:1473038604812161218> Invite Tracking System\n\n`;
    content += `Track member invites, reward top inviters, and monitor server growth with comprehensive analytics.\n\n`;
    
    content += `### <:Bookopen:1473038576391557130> Current Configuration\n`;
    content += `**Status:** ${enabled ? '<:Toggleon:1473038585501581312> Enabled' : '<:Toggleoff:1473038582813032590> Disabled'}\n`;
    content += `**Log Channel:** ${logChannel ? `<#${logChannel.id}>` : '*Not configured*'}\n`;
    content += `**Reward Roles:** ${rewards.length} configured\n\n`;
    
    content += `### 🎁 Invite Rewards\n`;
    if (rewards.length === 0) {
        content += `*No reward roles configured yet. Click "Rewards" to set up milestone rewards!*\n`;
    } else {
        const sortedRewards = [...rewards].sort((a, b) => a.invites - b.invites);
        for (const reward of sortedRewards.slice(0, 5)) {
            content += `<:Caretright:1473038207221502106> **${reward.invites} invites** → <@&${reward.roleId}>\n`;
        }
        if (rewards.length > 5) {
            content += `*...and ${rewards.length - 5} more rewards*\n`;
        }
    }
    
    content += `\n### <:Chat:1473038936241864865> How to Use\n`;
    content += `**1.** Click  Tracking** to start tracking invites\n`;
    content += `**2.** Set a **Log Channel** to receive join notifications\n`;
    content += `**3.** Add **Rewards** to give roles at invite milestones\n\n`;
    
    content += `### <:Shield:1473038669831995494> Related Commands\n`;
    content += `\`/invite-stats\` - View your invite statistics\n`;
    content += `\`/invite-leaderboard\` - Server invite rankings\n`;
    content += `\`/invite-analytics\` - Detailed invite analytics`;
    
    return content;
}

function buildContainer(guildConfig, guild) {
    const container = new ContainerBuilder()
        .setAccentColor(guildConfig.enabled ? 0x57F287 : 0xED4245);
    
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(buildMainPanel(guildConfig, guild))
    );
    
    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent('### Controls')
    );
    
    container.addActionRowComponents(createControlRow(guildConfig));
    container.addActionRowComponents(createSettingsRow(guildConfig));
    
    return container;
}

function createControlRow(guildConfig) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('invite_toggle')
                .setLabel(guildConfig.enabled ? 'Disable Tracking' : 'Enable Tracking')
                .setStyle(guildConfig.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
                .setEmoji(guildConfig.enabled ? '<:Toggleoff:1473038582813032590>' : '<:Toggleon:1473038585501581312>'),
            new ButtonBuilder()
                .setCustomId('invite_channel')
                .setLabel('Log Channel')
                .setStyle(guildConfig.channel ? ButtonStyle.Success : ButtonStyle.Primary)
                .setEmoji('<:Bullhorn:1473038903157199093>'),
            new ButtonBuilder()
                .setCustomId('invite_rewards')
                .setLabel('Rewards')
                .setStyle((guildConfig.rewards?.length > 0) ? ButtonStyle.Success : ButtonStyle.Primary)
                .setEmoji('🎁')
        );
}

function createSettingsRow(guildConfig) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('invite_add_reward')
                .setLabel('Add Reward')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:Add:1473038100862337035>'),
            new ButtonBuilder()
                .setCustomId('invite_remove_reward')
                .setLabel('Remove Reward')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:Trash:1473038090074591293>'),
            new ButtonBuilder()
                .setCustomId('invite_reset')
                .setLabel('Reset Stats')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('<:Trash:1473038090074591293>')
        );
}

function buildRewardsPanel(guildConfig, guild) {
    const rewards = guildConfig.rewards || [];
    
    let content = `# 🎁 Invite Rewards\n\n`;
    
    if (rewards.length === 0) {
        content += `No reward roles configured yet.\n\nClick **Add Reward** to create invite milestones!`;
    } else {
        const sortedRewards = [...rewards].sort((a, b) => a.invites - b.invites);
        for (const reward of sortedRewards) {
            const role = guild.roles.cache.get(reward.roleId);
            content += `• **${reward.invites} invites** → ${role ? role.toString() : 'Unknown Role'}\n`;
        }
    }
    
    return content;
}

function buildRewardsContainer(guildConfig, guild) {
    const container = new ContainerBuilder()
        .setAccentColor(0xCAD7E6);
    
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(buildRewardsPanel(guildConfig, guild))
    );
    
    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    
    container.addActionRowComponents(
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('invite_add_reward')
                    .setLabel('Add Reward')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('<:Add:1473038100862337035>'),
                new ButtonBuilder()
                    .setCustomId('invite_remove_reward')
                    .setLabel('Remove Reward')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('<:Trash:1473038090074591293>'),
                new ButtonBuilder()
                    .setCustomId('invite_back')
                    .setLabel('Back')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⬅️')
            )
    );
    
    return container;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite-setup')
        .setDescription('Configure invite tracking system')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    
    async execute(interaction) {
        const guildConfig = getGuildConfig(interaction.guild.id);
        const container = buildContainer(guildConfig, interaction.guild);
        
        await interaction.reply({ 
            components: [container], 
            flags: MessageFlags.IsComponentsV2 
        });
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('<:Cancel:1473037949187657818> You need Manage Guild permission to use this command!');
        }

        const guildConfig = getGuildConfig(message.guild.id);
        const container = buildContainer(guildConfig, message.guild);
        
        message.reply({ 
            components: [container], 
            flags: MessageFlags.IsComponentsV2 
        });
    },

    async handleInteraction(interaction) {
        if (!interaction.isButton() && !interaction.isModalSubmit()) return false;
        
        const customId = interaction.customId;
        if (!customId.startsWith('invite_')) return false;
        
        // Check if config session has expired
        if (await checkAndExpire(interaction, 'config')) return true;
        
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({ 
                content: '<:Cancel:1473037949187657818> You need Manage Server permission to use these controls!', 
                flags: MessageFlags.Ephemeral 
            });
            return true;
        }
        
        const guildId = interaction.guild.id;
        let guildConfig = getGuildConfig(guildId);
        
        if (interaction.isButton()) {
            if (customId === 'invite_toggle') {
                const newState = !guildConfig.enabled;
                toggleInviteTracking(guildId, newState);
                guildConfig = getGuildConfig(guildId);
                
                if (newState) {
                    await preloadGuildInvites(interaction.guild);
                }
                
                const container = buildContainer(guildConfig, interaction.guild);
                await interaction.update({ components: [container] });
                return true;
            }
            
            if (customId === 'invite_channel') {
                const modal = new ModalBuilder()
                    .setCustomId('invite_modal_channel')
                    .setTitle('Set Log Channel');
                
                const channelInput = new TextInputBuilder()
                    .setCustomId('channel_id')
                    .setLabel('Channel ID (or leave empty to disable)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('123456789012345678')
                    .setValue(guildConfig.channel || '')
                    .setRequired(false);
                
                modal.addComponents(new ActionRowBuilder().addComponents(channelInput));
                await interaction.showModal(modal);
                return true;
            }
            
            if (customId === 'invite_rewards') {
                const container = buildRewardsContainer(guildConfig, interaction.guild);
                await interaction.update({ components: [container] });
                return true;
            }
            
            if (customId === 'invite_add_reward') {
                const modal = new ModalBuilder()
                    .setCustomId('invite_modal_add_reward')
                    .setTitle('Add Invite Reward');
                
                const invitesInput = new TextInputBuilder()
                    .setCustomId('invites')
                    .setLabel('Number of Invites Required')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('10')
                    .setRequired(true);
                
                const roleInput = new TextInputBuilder()
                    .setCustomId('role_id')
                    .setLabel('Role ID')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('123456789012345678')
                    .setRequired(true);
                
                modal.addComponents(
                    new ActionRowBuilder().addComponents(invitesInput),
                    new ActionRowBuilder().addComponents(roleInput)
                );
                await interaction.showModal(modal);
                return true;
            }
            
            if (customId === 'invite_remove_reward') {
                const modal = new ModalBuilder()
                    .setCustomId('invite_modal_remove_reward')
                    .setTitle('Remove Invite Reward');
                
                const invitesInput = new TextInputBuilder()
                    .setCustomId('invites')
                    .setLabel('Invite Count to Remove')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('10')
                    .setRequired(true);
                
                modal.addComponents(new ActionRowBuilder().addComponents(invitesInput));
                await interaction.showModal(modal);
                return true;
            }
            
            if (customId === 'invite_reset') {
                const config = loadConfig();
                if (config[guildId]) {
                    config[guildId].totals = {};
                    config[guildId].members = {};
                    saveConfig(config);
                }
                
                await interaction.reply({ 
                    content: '<:Checkedbox:1473038547165384804> All invite statistics have been reset!', 
                    flags: MessageFlags.Ephemeral 
                });
                
                guildConfig = getGuildConfig(guildId);
                const container = buildContainer(guildConfig, interaction.guild);
                await interaction.message.edit({ components: [container] });
                return true;
            }
            
            if (customId === 'invite_back') {
                guildConfig = getGuildConfig(guildId);
                const container = buildContainer(guildConfig, interaction.guild);
                await interaction.update({ components: [container] });
                return true;
            }
        }
        
        if (interaction.isModalSubmit()) {
            if (customId === 'invite_modal_channel') {
                const channelId = interaction.fields.getTextInputValue('channel_id').trim();
                
                if (channelId) {
                    const channel = interaction.guild.channels.cache.get(channelId);
                    if (!channel || channel.type !== ChannelType.GuildText) {
                        await interaction.reply({ 
                            content: '<:Cancel:1473037949187657818> Invalid channel ID! Please provide a valid text channel ID.', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return true;
                    }
                    updateGuildConfig(guildId, { channel: channelId });
                } else {
                    updateGuildConfig(guildId, { channel: null });
                }
                
                await interaction.reply({ 
                    content: channelId ? '<:Checkedbox:1473038547165384804> Log channel updated!' : '<:Checkedbox:1473038547165384804> Log channel disabled!', 
                    flags: MessageFlags.Ephemeral 
                });
                
                guildConfig = getGuildConfig(guildId);
                const container = buildContainer(guildConfig, interaction.guild);
                await interaction.message.edit({ components: [container] });
                return true;
            }
            
            if (customId === 'invite_modal_add_reward') {
                const invites = parseInt(interaction.fields.getTextInputValue('invites'));
                const roleId = interaction.fields.getTextInputValue('role_id').trim();
                
                if (isNaN(invites) || invites < 1) {
                    await interaction.reply({ 
                        content: '<:Cancel:1473037949187657818> Please enter a valid number of invites!', 
                        flags: MessageFlags.Ephemeral 
                    });
                    return true;
                }
                
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) {
                    await interaction.reply({ 
                        content: '<:Cancel:1473037949187657818> Invalid role ID! Please provide a valid role ID.', 
                        flags: MessageFlags.Ephemeral 
                    });
                    return true;
                }
                
                setReward(guildId, invites, roleId);
                
                await interaction.reply({ 
                    content: `<:Checkedbox:1473038547165384804> Reward added! Users will receive ${role} at **${invites} invites**.`, 
                    flags: MessageFlags.Ephemeral 
                });
                
                guildConfig = getGuildConfig(guildId);
                const container = buildRewardsContainer(guildConfig, interaction.guild);
                await interaction.message.edit({ components: [container] });
                return true;
            }
            
            if (customId === 'invite_modal_remove_reward') {
                const invites = parseInt(interaction.fields.getTextInputValue('invites'));
                
                if (isNaN(invites)) {
                    await interaction.reply({ 
                        content: '<:Cancel:1473037949187657818> Please enter a valid number!', 
                        flags: MessageFlags.Ephemeral 
                    });
                    return true;
                }
                
                removeReward(guildId, invites);
                
                await interaction.reply({ 
                    content: `<:Checkedbox:1473038547165384804> Reward for **${invites} invites** has been removed.`, 
                    flags: MessageFlags.Ephemeral 
                });
                
                guildConfig = getGuildConfig(guildId);
                const container = buildRewardsContainer(guildConfig, interaction.guild);
                await interaction.message.edit({ components: [container] });
                return true;
            }
        }
        
        return false;
    }
};
