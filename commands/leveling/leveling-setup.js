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
    TextInputStyle
} = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('../../utils/database');
const { buildPermissionDenied } = require('../../utils/responseBuilder');

const jsonStore = require('../../utils/jsonStore');
const { checkAndExpire } = require('../../utils/panelExpiration');

/** Clamp a string to discord.js TextDisplay limits (1–4000 chars) */
function safeContent(str) {
    if (!str || typeof str !== 'string') return '\u200b';
    if (str.length > 4000) return str.substring(0, 3997) + '...';
    return str;
}

/** Safely update the panel message after a modal reply */
async function refreshPanel(interaction, containerBuilder) {
    try {
        if (interaction.message) {
            await interaction.message.edit({ components: [containerBuilder], flags: MessageFlags.IsComponentsV2 });
        }
    } catch (e) {
        // Panel refresh failed — user will need to re-run the command
    }
}

/** Sync leveling-setup toggle with the file-based toggle used by the XP handler */
function syncToggleFile(guildId, enabled) {
    let data = {};
    try { if (jsonStore.has('levelingtoggle')) data = jsonStore.read('levelingtoggle'); } catch {}
    if (!data[guildId]) data[guildId] = { enabled: false, disabledChannels: [] };
    data[guildId].enabled = enabled;
    jsonStore.write('levelingtoggle', data);
}

function buildMainPanel(config, guild) {
    const levelingConfig = config.leveling || {};
    const xpSettings = levelingConfig.xpSettings || { minXp: 15, maxXp: 25, cooldown: 60 };
    const enabled = levelingConfig.enabled;
    
    let content = `# <:Fire:1473038604812161218> Leveling System\n\n`;
    content += `Reward active members with XP, levels, and role rewards!\n\n`;
    
    content += `### <:Bookopen:1473038576391557130> Current Configuration\n`;
    content += `**Status:** ${enabled ? '<:Toggleon:1473038585501581312> Enabled' : '<:Toggleoff:1473038582813032590> Disabled'}\n`;
    const announceCh = levelingConfig.announcementChannel || levelingConfig.announcements?.customChannelId;
    content += `**Announcement Channel:** ${announceCh ? `<#${announceCh}>` : '*Uses message channel*'}\n\n`;
    
    content += `### <:Lightning:1473038797540298792> XP Settings\n`;
    content += `**XP per Message:** ${xpSettings.minXp} - ${xpSettings.maxXp}\n`;
    content += `**Cooldown:** ${xpSettings.cooldown}s between XP gains\n`;
    content += `**Multiplier:** ${levelingConfig.multiplier || 1}x\n\n`;
    
    content += `### <:Award:1473038391632203887> Role Rewards\n`;
    content += `**Stack Roles:** ${levelingConfig.stackRoles ? '<:Toggleon:1473038585501581312> Yes' : '<:Toggleoff:1473038582813032590> No'}\n`;
    content += `**Level Roles:** ${levelingConfig.roles?.length || 0} configured\n\n`;
    
    content += `### <:Commentblock:1473370739351490794> Exclusions\n`;
    content += `**Ignored Channels:** ${levelingConfig.ignoreChannels?.length || 0}\n`;
    content += `**Ignored Roles:** ${levelingConfig.ignoreRoles?.length || 0}`;
    
    return content;
}

function buildContainer(config, guild) {
    const levelingConfig = config.leveling || {};
    const container = new ContainerBuilder()
        .setAccentColor(levelingConfig.enabled ? 0x57F287 : 0xED4245);
    
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(safeContent(buildMainPanel(config, guild)))
    );
    
    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent('### Controls')
    );
    
    container.addActionRowComponents(createControlRow(levelingConfig));
    container.addActionRowComponents(createSettingsRow(levelingConfig));
    container.addActionRowComponents(createAdvancedRow(levelingConfig));
    
    return container;
}

function createControlRow(levelingConfig) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('leveling_toggle')
                .setLabel(levelingConfig.enabled ? 'Disable' : 'Enable')
                .setStyle(levelingConfig.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
                .setEmoji(levelingConfig.enabled ? '<:Toggleoff:1473038582813032590>' : '<:Toggleon:1473038585501581312>'),
            new ButtonBuilder()
                .setCustomId('leveling_channel')
                .setLabel('Announcement Channel')
                .setStyle((levelingConfig.announcementChannel || levelingConfig.announcements?.customChannelId) ? ButtonStyle.Success : ButtonStyle.Primary)
                .setEmoji('<:Bullhorn:1473038903157199093>'),
            new ButtonBuilder()
                .setCustomId('leveling_xp')
                .setLabel('XP Settings')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('<:Lightning:1473038797540298792>')
        );
}

function createSettingsRow(levelingConfig) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('leveling_multiplier')
                .setLabel('Multiplier')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('✖️'),
            new ButtonBuilder()
                .setCustomId('leveling_stack_toggle')
                .setLabel(levelingConfig.stackRoles ? 'Stack: ON' : 'Stack: OFF')
                .setStyle(levelingConfig.stackRoles ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setEmoji('<:Userplus:1473038912212435086>'),
            new ButtonBuilder()
                .setCustomId('leveling_roles')
                .setLabel('Level Roles')
                .setStyle((levelingConfig.roles?.length > 0) ? ButtonStyle.Success : ButtonStyle.Primary)
                .setEmoji('<:Award:1473038391632203887>')
        );
}

function createAdvancedRow(levelingConfig) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('leveling_ignore')
                .setLabel('Ignore Settings')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:Commentblock:1473370739351490794>'),
            new ButtonBuilder()
                .setCustomId('leveling_reset')
                .setLabel('Reset All XP')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('<:Trash:1473038090074591293>')
        );
}

function buildRolesPanel(levelingConfig, guild) {
    const roles = levelingConfig.roles || [];
    
    let content = `# <:Award:1473038391632203887> Level Role Rewards\n\n`;
    content += `Automatically assign roles when members reach specific levels.\n\n`;
    
    if (roles.length === 0) {
        content += `### No Roles Configured\n`;
        content += `*Click **Add Role** to create your first level reward!*\n\n`;
        content += `### <:Lightbulbalt:1473038470787240009> Suggested Milestones\n`;
        content += `Level 5 → @Newcomer\n`;
        content += `Level 10 → @Active\n`;
        content += `Level 25 → @Regular\n`;
        content += `Level 50 → @Veteran`;
    } else {
        content += `### Current Rewards\n`;
        const sortedRoles = [...roles].sort((a, b) => a.level - b.level);
        for (const roleConfig of sortedRoles) {
            const role = guild.roles.cache.get(roleConfig.roleId);
            content += `<:Caretright:1473038207221502106> **Level ${roleConfig.level}** → ${role ? role.toString() : '*Role not found*'}\n`;
        }
        content += `\n*${roles.length} role reward${roles.length !== 1 ? 's' : ''} configured*`;
    }
    
    return content;
}

function buildRolesContainer(levelingConfig, guild) {
    const container = new ContainerBuilder()
        ;
    
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(safeContent(buildRolesPanel(levelingConfig, guild)))
    );
    
    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    
    container.addActionRowComponents(
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('leveling_add_role')
                    .setLabel('Add Role')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('<:Add:1473038100862337035>'),
                new ButtonBuilder()
                    .setCustomId('leveling_remove_role')
                    .setLabel('Remove Role')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('<:Trash:1473038090074591293>'),
                new ButtonBuilder()
                    .setCustomId('leveling_back')
                    .setLabel('Back')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⬅️')
            )
    );
    
    return container;
}

function buildIgnorePanel(levelingConfig) {
    const ignoreChannels = levelingConfig.ignoreChannels || [];
    const ignoreRoles = levelingConfig.ignoreRoles || [];
    
    let content = `# <:Commentblock:1473370739351490794> Ignore Settings\n\n`;
    
    content += `### Ignored Channels (${ignoreChannels.length})\n`;
    if (ignoreChannels.length === 0) {
        content += `None configured\n`;
    } else {
        for (const channelId of ignoreChannels.slice(0, 5)) {
            content += `• <#${channelId}>\n`;
        }
        if (ignoreChannels.length > 5) {
            content += `*...and ${ignoreChannels.length - 5} more*\n`;
        }
    }
    
    content += `\n### Ignored Roles (${ignoreRoles.length})\n`;
    if (ignoreRoles.length === 0) {
        content += `None configured\n`;
    } else {
        for (const roleId of ignoreRoles.slice(0, 5)) {
            content += `• <@&${roleId}>\n`;
        }
        if (ignoreRoles.length > 5) {
            content += `*...and ${ignoreRoles.length - 5} more*\n`;
        }
    }
    
    return content;
}

function buildIgnoreContainer(levelingConfig) {
    const container = new ContainerBuilder()
        ;
    
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(safeContent(buildIgnorePanel(levelingConfig)))
    );
    
    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    
    container.addActionRowComponents(
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('leveling_ignore_channel')
                    .setLabel('Add/Remove Channel')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('<:Bullhorn:1473038903157199093>'),
                new ButtonBuilder()
                    .setCustomId('leveling_ignore_role')
                    .setLabel('Add/Remove Role')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('<:Userplus:1473038912212435086>'),
                new ButtonBuilder()
                    .setCustomId('leveling_back')
                    .setLabel('Back')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⬅️')
            )
    );
    
    return container;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leveling-setup')
        .setDescription('Configure the leveling system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    name: 'leveling-setup',
    prefix: 'leveling-setup',
    description: 'Configure the leveling system',
    usage: 'leveling-setup',
    category: 'leveling',
    aliases: ['lvlsetup', 'levelsetup'],

    async execute(interaction) {
        const guildConfig = await getGuildConfig(interaction.guild.id);
        const container = buildContainer(guildConfig, interaction.guild);
        
        await interaction.reply({ 
            components: [container], 
            flags: MessageFlags.IsComponentsV2 
        });
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            const container = buildPermissionDenied('Administrator');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const guildConfig = await getGuildConfig(message.guild.id);
        const container = buildContainer(guildConfig, message.guild);
        
        message.reply({ 
            components: [container], 
            flags: MessageFlags.IsComponentsV2 
        });
    },

    async handleInteraction(interaction) {
        if (!interaction.isButton() && !interaction.isModalSubmit()) return false;
        
        const customId = interaction.customId;
        if (!customId.startsWith('leveling_')) return false;
        
        // Check if config session has expired
        if (await checkAndExpire(interaction, 'config')) return true;
        
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ 
                content: '<:Cancel:1473037949187657818> You need Administrator permission to use these controls!', 
                flags: MessageFlags.Ephemeral 
            });
            return true;
        }
        
        const guildId = interaction.guild.id;
        let guildConfig = await getGuildConfig(guildId);
        let levelingConfig = guildConfig.leveling || {};
        
        if (interaction.isButton()) {
            if (customId === 'leveling_toggle') {
                levelingConfig.enabled = !levelingConfig.enabled;
                await updateGuildConfig(guildId, { leveling: levelingConfig });
                syncToggleFile(guildId, levelingConfig.enabled);
                
                guildConfig = await getGuildConfig(guildId);
                const container = buildContainer(guildConfig, interaction.guild);
                await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                return true;
            }
            
            if (customId === 'leveling_channel') {
                const modal = new ModalBuilder()
                    .setCustomId('leveling_modal_channel')
                    .setTitle('Set Announcement Channel');
                
                const channelInput = new TextInputBuilder()
                    .setCustomId('channel_id')
                    .setLabel('Channel ID (empty = message channel)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('123456789012345678')
                    .setValue(levelingConfig.announcementChannel || levelingConfig.announcements?.customChannelId || '')
                    .setRequired(false);
                
                modal.addComponents(new ActionRowBuilder().addComponents(channelInput));
                await interaction.showModal(modal);
                return true;
            }
            
            if (customId === 'leveling_xp') {
                const xpSettings = levelingConfig.xpSettings || { minXp: 15, maxXp: 25, cooldown: 60 };
                const modal = new ModalBuilder()
                    .setCustomId('leveling_modal_xp')
                    .setTitle('XP Settings');
                
                const minInput = new TextInputBuilder()
                    .setCustomId('min_xp')
                    .setLabel('Minimum XP per message')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('15')
                    .setValue(String(xpSettings.minXp))
                    .setRequired(true);
                
                const maxInput = new TextInputBuilder()
                    .setCustomId('max_xp')
                    .setLabel('Maximum XP per message')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('25')
                    .setValue(String(xpSettings.maxXp))
                    .setRequired(true);
                
                const cooldownInput = new TextInputBuilder()
                    .setCustomId('cooldown')
                    .setLabel('Cooldown (seconds)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('60')
                    .setValue(String(xpSettings.cooldown))
                    .setRequired(true);
                
                modal.addComponents(
                    new ActionRowBuilder().addComponents(minInput),
                    new ActionRowBuilder().addComponents(maxInput),
                    new ActionRowBuilder().addComponents(cooldownInput)
                );
                await interaction.showModal(modal);
                return true;
            }
            
            if (customId === 'leveling_multiplier') {
                const modal = new ModalBuilder()
                    .setCustomId('leveling_modal_multiplier')
                    .setTitle('Set XP Multiplier');
                
                const multiplierInput = new TextInputBuilder()
                    .setCustomId('multiplier')
                    .setLabel('XP Multiplier (e.g., 1.5, 2)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('1')
                    .setValue(String(levelingConfig.multiplier || 1))
                    .setRequired(true);
                
                modal.addComponents(new ActionRowBuilder().addComponents(multiplierInput));
                await interaction.showModal(modal);
                return true;
            }
            
            if (customId === 'leveling_stack_toggle') {
                levelingConfig.stackRoles = !levelingConfig.stackRoles;
                await updateGuildConfig(guildId, { leveling: levelingConfig });
                
                guildConfig = await getGuildConfig(guildId);
                const container = buildContainer(guildConfig, interaction.guild);
                await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                await interaction.followUp({ 
                    content: `<:Checkedbox:1473038547165384804> Role stacking is now **${levelingConfig.stackRoles ? 'enabled' : 'disabled'}**!`, 
                    flags: MessageFlags.Ephemeral 
                }).catch(() => {});
                return true;
            }
            
            if (customId === 'leveling_roles') {
                const container = buildRolesContainer(levelingConfig, interaction.guild);
                await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                return true;
            }
            
            if (customId === 'leveling_add_role') {
                const modal = new ModalBuilder()
                    .setCustomId('leveling_modal_add_role')
                    .setTitle('Add Level Role');
                
                const levelInput = new TextInputBuilder()
                    .setCustomId('level')
                    .setLabel('Level Required')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('5')
                    .setRequired(true);
                
                const roleInput = new TextInputBuilder()
                    .setCustomId('role_id')
                    .setLabel('Role ID')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('123456789012345678')
                    .setRequired(true);
                
                modal.addComponents(
                    new ActionRowBuilder().addComponents(levelInput),
                    new ActionRowBuilder().addComponents(roleInput)
                );
                await interaction.showModal(modal);
                return true;
            }
            
            if (customId === 'leveling_remove_role') {
                const modal = new ModalBuilder()
                    .setCustomId('leveling_modal_remove_role')
                    .setTitle('Remove Level Role');
                
                const levelInput = new TextInputBuilder()
                    .setCustomId('level')
                    .setLabel('Level to Remove')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('5')
                    .setRequired(true);
                
                modal.addComponents(new ActionRowBuilder().addComponents(levelInput));
                await interaction.showModal(modal);
                return true;
            }
            
            if (customId === 'leveling_ignore') {
                const container = buildIgnoreContainer(levelingConfig);
                await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                return true;
            }
            
            if (customId === 'leveling_ignore_channel') {
                const modal = new ModalBuilder()
                    .setCustomId('leveling_modal_ignore_channel')
                    .setTitle('Toggle Ignore Channel');
                
                const channelInput = new TextInputBuilder()
                    .setCustomId('channel_id')
                    .setLabel('Channel ID (toggle add/remove)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('123456789012345678')
                    .setRequired(true);
                
                modal.addComponents(new ActionRowBuilder().addComponents(channelInput));
                await interaction.showModal(modal);
                return true;
            }
            
            if (customId === 'leveling_ignore_role') {
                const modal = new ModalBuilder()
                    .setCustomId('leveling_modal_ignore_role')
                    .setTitle('Toggle Ignore Role');
                
                const roleInput = new TextInputBuilder()
                    .setCustomId('role_id')
                    .setLabel('Role ID (toggle add/remove)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('123456789012345678')
                    .setRequired(true);
                
                modal.addComponents(new ActionRowBuilder().addComponents(roleInput));
                await interaction.showModal(modal);
                return true;
            }
            
            if (customId === 'leveling_reset') {
                if (jsonStore.has('leveling')) {
                    const data = jsonStore.read('leveling');
                    if (data[guildId]) {
                        data[guildId] = {};
                        jsonStore.write('leveling', data);
                    }
                }
                
                await interaction.reply({ 
                    content: '<:Checkedbox:1473038547165384804> All XP and levels have been reset for this server!', 
                    flags: MessageFlags.Ephemeral 
                });
                return true;
            }
            
            if (customId === 'leveling_back') {
                guildConfig = await getGuildConfig(guildId);
                const container = buildContainer(guildConfig, interaction.guild);
                await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                return true;
            }
        }
        
        if (interaction.isModalSubmit()) {
            if (customId === 'leveling_modal_channel') {
                const channelId = interaction.fields.getTextInputValue('channel_id').trim();
                
                if (channelId) {
                    let channel;
                    try {
                        channel = await interaction.guild.channels.fetch(channelId);
                    } catch (e) {
                        channel = null;
                    }
                    if (!channel) {
                        await interaction.reply({ 
                            content: '<:Cancel:1473037949187657818> Invalid channel ID!', 
                            flags: MessageFlags.Ephemeral 
                        });
                        return true;
                    }
                    levelingConfig.announcementChannel = channelId;
                    // Also update announcements sub-object for XP handler compatibility
                    if (!levelingConfig.announcements) levelingConfig.announcements = {};
                    levelingConfig.announcements.channel = 'custom';
                    levelingConfig.announcements.customChannelId = channelId;
                } else {
                    levelingConfig.announcementChannel = null;
                    if (!levelingConfig.announcements) levelingConfig.announcements = {};
                    levelingConfig.announcements.channel = 'same';
                    levelingConfig.announcements.customChannelId = null;
                }
                await updateGuildConfig(guildId, { leveling: levelingConfig });
                
                await interaction.reply({ 
                    content: channelId ? '<:Checkedbox:1473038547165384804> Announcement channel updated!' : '<:Checkedbox:1473038547165384804> Will use message channel for announcements!', 
                    flags: MessageFlags.Ephemeral 
                });
                
                guildConfig = await getGuildConfig(guildId);
                await refreshPanel(interaction, buildContainer(guildConfig, interaction.guild));
                return true;
            }
            
            if (customId === 'leveling_modal_xp') {
                const minXp = parseInt(interaction.fields.getTextInputValue('min_xp'));
                const maxXp = parseInt(interaction.fields.getTextInputValue('max_xp'));
                const cooldown = parseInt(interaction.fields.getTextInputValue('cooldown'));
                
                if (isNaN(minXp) || isNaN(maxXp) || isNaN(cooldown)) {
                    await interaction.reply({ 
                        content: '<:Cancel:1473037949187657818> Please enter valid numbers!', 
                        flags: MessageFlags.Ephemeral 
                    });
                    return true;
                }
                
                if (minXp > maxXp) {
                    await interaction.reply({ 
                        content: '<:Cancel:1473037949187657818> Minimum XP cannot be greater than maximum!', 
                        flags: MessageFlags.Ephemeral 
                    });
                    return true;
                }
                
                if (!levelingConfig.xpSettings) levelingConfig.xpSettings = {};
                levelingConfig.xpSettings.minXp = minXp;
                levelingConfig.xpSettings.maxXp = maxXp;
                levelingConfig.xpSettings.cooldown = cooldown;
                await updateGuildConfig(guildId, { leveling: levelingConfig });
                
                await interaction.reply({ 
                    content: `<:Checkedbox:1473038547165384804> XP settings updated! Range: ${minXp}-${maxXp}, Cooldown: ${cooldown}s`, 
                    flags: MessageFlags.Ephemeral 
                });
                
                guildConfig = await getGuildConfig(guildId);
                await refreshPanel(interaction, buildContainer(guildConfig, interaction.guild));
                return true;
            }
            
            if (customId === 'leveling_modal_multiplier') {
                const multiplier = parseFloat(interaction.fields.getTextInputValue('multiplier'));
                
                if (isNaN(multiplier) || multiplier <= 0) {
                    await interaction.reply({ 
                        content: '<:Cancel:1473037949187657818> Please enter a valid positive number!', 
                        flags: MessageFlags.Ephemeral 
                    });
                    return true;
                }
                
                levelingConfig.multiplier = multiplier;
                await updateGuildConfig(guildId, { leveling: levelingConfig });
                
                await interaction.reply({ 
                    content: `<:Checkedbox:1473038547165384804> XP multiplier set to **${multiplier}x**!`, 
                    flags: MessageFlags.Ephemeral 
                });
                
                guildConfig = await getGuildConfig(guildId);
                await refreshPanel(interaction, buildContainer(guildConfig, interaction.guild));
                return true;
            }
            
            if (customId === 'leveling_modal_add_role') {
                const level = parseInt(interaction.fields.getTextInputValue('level'));
                const roleId = interaction.fields.getTextInputValue('role_id').trim();
                
                if (isNaN(level) || level < 1) {
                    await interaction.reply({ 
                        content: '<:Cancel:1473037949187657818> Please enter a valid level (1 or higher)!', 
                        flags: MessageFlags.Ephemeral 
                    });
                    return true;
                }
                
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) {
                    await interaction.reply({ 
                        content: '<:Cancel:1473037949187657818> Invalid role ID!', 
                        flags: MessageFlags.Ephemeral 
                    });
                    return true;
                }
                
                guildConfig = await getGuildConfig(guildId);
                levelingConfig = guildConfig.leveling || {};
                const roles = levelingConfig.roles || [];
                
                const existingIndex = roles.findIndex(r => r.level === level);
                if (existingIndex >= 0) {
                    roles[existingIndex].roleId = roleId;
                } else {
                    roles.push({ level, roleId });
                }
                
                levelingConfig.roles = roles;
                await updateGuildConfig(guildId, { leveling: levelingConfig });
                
                await interaction.reply({ 
                    content: `<:Checkedbox:1473038547165384804> Level ${level} will now reward ${role}!`, 
                    flags: MessageFlags.Ephemeral 
                });
                
                guildConfig = await getGuildConfig(guildId);
                await refreshPanel(interaction, buildRolesContainer(guildConfig.leveling || {}, interaction.guild));
                return true;
            }
            
            if (customId === 'leveling_modal_remove_role') {
                const level = parseInt(interaction.fields.getTextInputValue('level'));
                
                if (isNaN(level)) {
                    await interaction.reply({ 
                        content: '<:Cancel:1473037949187657818> Please enter a valid level!', 
                        flags: MessageFlags.Ephemeral 
                    });
                    return true;
                }
                
                guildConfig = await getGuildConfig(guildId);
                levelingConfig = guildConfig.leveling || {};
                levelingConfig.roles = (levelingConfig.roles || []).filter(r => r.level !== level);
                
                await updateGuildConfig(guildId, { leveling: levelingConfig });
                
                await interaction.reply({ 
                    content: `<:Checkedbox:1473038547165384804> Level ${level} role reward removed!`, 
                    flags: MessageFlags.Ephemeral 
                });
                
                guildConfig = await getGuildConfig(guildId);
                await refreshPanel(interaction, buildRolesContainer(guildConfig.leveling || {}, interaction.guild));
                return true;
            }
            
            if (customId === 'leveling_modal_ignore_channel') {
                const channelId = interaction.fields.getTextInputValue('channel_id').trim();
                
                const channel = interaction.guild.channels.cache.get(channelId);
                if (!channel) {
                    await interaction.reply({ 
                        content: '<:Cancel:1473037949187657818> Invalid channel ID!', 
                        flags: MessageFlags.Ephemeral 
                    });
                    return true;
                }
                
                guildConfig = await getGuildConfig(guildId);
                levelingConfig = guildConfig.leveling || {};
                let ignoreChannels = levelingConfig.ignoreChannels || [];
                
                if (ignoreChannels.includes(channelId)) {
                    ignoreChannels = ignoreChannels.filter(id => id !== channelId);
                    await interaction.reply({ 
                        content: `<:Checkedbox:1473038547165384804> ${channel} is no longer ignored!`, 
                        flags: MessageFlags.Ephemeral 
                    });
                } else {
                    ignoreChannels.push(channelId);
                    await interaction.reply({ 
                        content: `<:Checkedbox:1473038547165384804> ${channel} will now be ignored for XP!`, 
                        flags: MessageFlags.Ephemeral 
                    });
                }
                
                levelingConfig.ignoreChannels = ignoreChannels;
                await updateGuildConfig(guildId, { leveling: levelingConfig });
                
                guildConfig = await getGuildConfig(guildId);
                await refreshPanel(interaction, buildIgnoreContainer(guildConfig.leveling || {}));
                return true;
            }
            
            if (customId === 'leveling_modal_ignore_role') {
                const roleId = interaction.fields.getTextInputValue('role_id').trim();
                
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) {
                    await interaction.reply({ 
                        content: '<:Cancel:1473037949187657818> Invalid role ID!', 
                        flags: MessageFlags.Ephemeral 
                    });
                    return true;
                }
                
                guildConfig = await getGuildConfig(guildId);
                levelingConfig = guildConfig.leveling || {};
                let ignoreRoles = levelingConfig.ignoreRoles || [];
                
                if (ignoreRoles.includes(roleId)) {
                    ignoreRoles = ignoreRoles.filter(id => id !== roleId);
                    await interaction.reply({ 
                        content: `<:Checkedbox:1473038547165384804> ${role} is no longer ignored!`, 
                        flags: MessageFlags.Ephemeral 
                    });
                } else {
                    ignoreRoles.push(roleId);
                    await interaction.reply({ 
                        content: `<:Checkedbox:1473038547165384804> Users with ${role} will now be ignored for XP!`, 
                        flags: MessageFlags.Ephemeral 
                    });
                }
                
                levelingConfig.ignoreRoles = ignoreRoles;
                await updateGuildConfig(guildId, { leveling: levelingConfig });
                
                guildConfig = await getGuildConfig(guildId);
                await refreshPanel(interaction, buildIgnoreContainer(guildConfig.leveling || {}));
                return true;
            }
        }
        
        return false;
    }
};
