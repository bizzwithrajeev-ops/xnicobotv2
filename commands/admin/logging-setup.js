const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ContainerBuilder, TextDisplayBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { invalidateCache } = require('../../utils/logger');
const { BRANDING } = require('../../utils/responseBuilder');

const jsonStore = require('../../utils/jsonStore');

function loadLogs() {
    if (!jsonStore.has('logs')) {
        jsonStore.write('logs', {});
    }
    return jsonStore.read('logs');
}

function saveLogs(data) {
    jsonStore.write('logs', data);
}

function buildLoggingPanel(config, guild) {
    const hasAnyLog = config.message || config.member || config.voice || config.server || config.moderation;
    const mode = config.mode || 'bot';
    
    let content = `# <:Document:1473039496995143731> Server Logging System\n\n`;
    content += `Monitor and track all server activities with comprehensive logging. Each log type captures specific events to help you manage your server effectively.\n\n`;
    
    content += `### <:Settings:1473037894703779851> Delivery Mode\n`;
    content += `<a:loading:1506015728871149770> **Mode:** ${mode === 'webhook' ? '<:Attach:1473037923979886694> Webhook' : '<:bots:1473368718120849500> Bot Message'} — *All log messages are sent silently (no pings)*\n\n`;
    
    content += `### <:Fire:1473038604812161218> Log Channels Configuration\n`;
    content += `<:Chat:1473038936241864865> **Message Logs:** ${config.message ? `<#${config.message}>` : '*Not configured*'}`;
    if (mode === 'webhook' && config.webhooks?.message) content += ` <:Attach:1473037923979886694>`;
    content += `\n*Tracks: Message edits, deletions, bulk deletes, reactions*\n\n`;
    
    content += `<:User:1473038971398520977> **Member Logs:** ${config.member ? `<#${config.member}>` : '*Not configured*'}`;
    if (mode === 'webhook' && config.webhooks?.member) content += ` <:Attach:1473037923979886694>`;
    content += `\n*Tracks: Joins, leaves, role changes, nickname updates, bans*\n\n`;
    
    content += `<:Volumeup:1473039290136002844> **Voice Logs:** ${config.voice ? `<#${config.voice}>` : '*Not configured*'}`;
    if (mode === 'webhook' && config.webhooks?.voice) content += ` <:Attach:1473037923979886694>`;
    content += `\n*Tracks: VC joins, leaves, moves, mutes, deafens, streaming*\n\n`;
    
    content += `<:Settings:1473037894703779851> **Server Logs:** ${config.server ? `<#${config.server}>` : '*Not configured*'}`;
    if (mode === 'webhook' && config.webhooks?.server) content += ` <:Attach:1473037923979886694>`;
    content += `\n*Tracks: Channel/role creates, settings changes, emoji updates*\n\n`;
    
    content += `<:Shield:1473038669831995494> **Moderation Logs:** ${config.moderation ? `<#${config.moderation}>` : '*Not configured*'}`;
    if (mode === 'webhook' && config.webhooks?.moderation) content += ` <:Attach:1473037923979886694>`;
    content += `\n*Tracks: Warns, kicks, bans, timeouts, mod actions*\n\n`;
    
    content += `### <:Edit:1473037903625191580> Quick Setup Guide\n`;
    content += `**Slash Commands:**\n`;
    content += `\`/logging set-message #channel\` - Set message logs\n`;
    content += `\`/logging set-member #channel\` - Set member logs\n`;
    content += `\`/logging set-voice #channel\` - Set voice logs\n`;
    content += `\`/logging set-server #channel\` - Set server logs\n`;
    content += `\`/logging set-moderation #channel\` - Set mod logs\n`;
    content += `\`/logging set-all #channel\` - Set all logs to one channel\n`;
    content += `\`/logging disable <type>\` - Disable a log type\n`;
    content += `\`/logging set-mode <bot|webhook>\` - Switch delivery mode\n`;
    content += `\`/logging set-webhook <type> <url>\` - Set webhook URL\n\n`;
    
    content += `**Prefix Commands:**\n`;
    content += `\`-logging message #channel\` - Set message logs\n`;
    content += `\`-logging member #channel\` - Set member logs\n`;
    content += `\`-logging voice #channel\` - Set voice logs\n`;
    content += `\`-logging server #channel\` - Set server logs\n`;
    content += `\`-logging moderation #channel\` - Set mod logs\n`;
    content += `\`-logging all #channel\` - Set all logs to one channel\n`;
    content += `\`-logging disable <type>\` - Disable a log type\n`;
    content += `\`-logging mode <bot|webhook>\` - Switch delivery mode\n`;
    content += `\`-logging webhook <type> <url>\` - Set webhook URL`;
    
    return content;
}

function buildLoggingContainer(config, guild) {
    const hasAnyLog = config.message || config.member || config.voice || config.server || config.moderation;
    const configuredCount = [config.message, config.member, config.voice, config.server, config.moderation].filter(Boolean).length;
    
    return new ContainerBuilder()
        .setAccentColor(configuredCount === 5 ? 0x57F287 : configuredCount > 0 ? 0xFEE75C : 0xED4245)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(buildLoggingPanel(config, guild))
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
}

module.exports = {
    description: 'Logging Setup',
    usage: 'logging-setup',
    category: 'admin',
    aliases: ['logs', 'logging-setup', 'log', 'setlogs'],
    data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('Configure server logging channels for comprehensive activity tracking')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand.setName('set-message').setDescription('Set channel for message logs (edits, deletions, reactions)')
                .addChannelOption(option =>
                    option.setName('channel').setDescription('The channel for message logs').addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('set-member').setDescription('Set channel for member logs (joins, leaves, role changes)')
                .addChannelOption(option =>
                    option.setName('channel').setDescription('The channel for member logs').addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('set-voice').setDescription('Set channel for voice logs (VC activity, streaming)')
                .addChannelOption(option =>
                    option.setName('channel').setDescription('The channel for voice logs').addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('set-server').setDescription('Set channel for server logs (settings, channels, roles)')
                .addChannelOption(option =>
                    option.setName('channel').setDescription('The channel for server logs').addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('set-moderation').setDescription('Set channel for moderation logs (warns, bans, kicks)')
                .addChannelOption(option =>
                    option.setName('channel').setDescription('The channel for moderation logs').addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('set-all').setDescription('Set all log types to a single channel')
                .addChannelOption(option =>
                    option.setName('channel').setDescription('The channel for all logs').addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('view').setDescription('View current logging configuration and setup guide'))
        .addSubcommand(subcommand =>
            subcommand.setName('disable').setDescription('Disable a specific log type or all logging')
                .addStringOption(option =>
                    option.setName('type').setDescription('The log type to disable').setRequired(true)
                        .addChoices(
                            { name: 'Message Logs', value: 'message' },
                            { name: 'Member Logs', value: 'member' },
                            { name: 'Voice Logs', value: 'voice' },
                            { name: 'Server Logs', value: 'server' },
                            { name: 'Moderation Logs', value: 'moderation' },
                            { name: 'All Logs', value: 'all' }
                        )))
        .addSubcommand(subcommand =>
            subcommand.setName('set-mode').setDescription('Set log delivery mode (bot message or webhook)')
                .addStringOption(option =>
                    option.setName('mode').setDescription('Delivery mode for log messages').setRequired(true)
                        .addChoices(
                            { name: 'Bot Message (default)', value: 'bot' },
                            { name: 'Webhook', value: 'webhook' }
                        )))
        .addSubcommand(subcommand =>
            subcommand.setName('set-webhook').setDescription('Set a webhook URL for a specific log type')
                .addStringOption(option =>
                    option.setName('type').setDescription('The log type to set webhook for').setRequired(true)
                        .addChoices(
                            { name: 'Message Logs', value: 'message' },
                            { name: 'Member Logs', value: 'member' },
                            { name: 'Voice Logs', value: 'voice' },
                            { name: 'Server Logs', value: 'server' },
                            { name: 'Moderation Logs', value: 'moderation' },
                            { name: 'All Logs', value: 'all' }
                        ))
                .addStringOption(option =>
                    option.setName('url').setDescription('The webhook URL (from channel settings > Integrations > Webhooks)').setRequired(true))),
    
    async execute(interaction) {
        try {
        const logs = loadLogs();
        const guildId = interaction.guild.id;
        
        if (!logs[guildId]) {
            logs[guildId] = {};
        }

        const subcommand = interaction.options.getSubcommand();
        const logTypeNames = {
            message: { name: 'Message', emoji: '<:Chat:1473038936241864865>', desc: 'message edits, deletions, and reactions' },
            member: { name: 'Member', emoji: '<:User:1473038971398520977>', desc: 'joins, leaves, role changes, and bans' },
            voice: { name: 'Voice', emoji: '<:Volumeup:1473039290136002844>', desc: 'VC joins, leaves, and streaming activity' },
            server: { name: 'Server', emoji: '<:Settings:1473037894703779851>', desc: 'channel/role changes and server settings' },
            moderation: { name: 'Moderation', emoji: '<:Shield:1473038669831995494>', desc: 'warns, kicks, bans, and mod actions' }
        };

        if (subcommand.startsWith('set-') && !['set-mode', 'set-webhook'].includes(subcommand)) {
            const channel = interaction.options.getChannel('channel');
            const type = subcommand.replace('set-', '');
            
            if (type === 'all') {
                logs[guildId].message = channel.id;
                logs[guildId].member = channel.id;
                logs[guildId].voice = channel.id;
                logs[guildId].server = channel.id;
                logs[guildId].moderation = channel.id;
                saveLogs(logs);
                invalidateCache();
                
                const container = new ContainerBuilder()
                    .setAccentColor(0xCAD7E6)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# <:Checkedbox:1473038547165384804> All Logging Channels Configured\n\n` +
                            `All 5 log types have been set to ${channel}\n\n` +
                            `### Logs Now Active\n` +
                            `<:Chat:1473038936241864865> **Message Logs** - Edits, deletions, reactions\n` +
                            `<:User:1473038971398520977> **Member Logs** - Joins, leaves, role changes\n` +
                            `<:Volumeup:1473039290136002844> **Voice Logs** - VC activity, streaming\n` +
                            `<:Settings:1473037894703779851> **Server Logs** - Settings, channels, roles\n` +
                            `<:Shield:1473038669831995494> **Moderation Logs** - Warns, bans, kicks\n\n` +
                            `*Use \`/logging view\` to see your full configuration*`
                        )
                    )
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
                await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } else {
                const info = logTypeNames[type];
                logs[guildId][type] = channel.id;
                saveLogs(logs);
                invalidateCache();
                
                const container = new ContainerBuilder()
                    .setAccentColor(0xCAD7E6)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# <:Checkedbox:1473038547165384804> ${info.name} Logs Configured\n\n` +
                            `**Channel:** ${channel}\n` +
                            `**Type:** ${info.emoji} ${info.name} Logs\n\n` +
                            `### What Will Be Logged\n` +
                            `This channel will now receive logs for ${info.desc}.\n\n` +
                            `*Use \`/logging view\` to see your full configuration*`
                        )
                    )
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
                await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

        } else if (subcommand === 'view') {
            const config = logs[guildId] || {};
            const container = buildLoggingContainer(config, interaction.guild);
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        } else if (subcommand === 'disable') {
            const type = interaction.options.getString('type');
            
            if (type === 'all') {
                delete logs[guildId];
                saveLogs(logs);
                
                const container = new ContainerBuilder()
                    .setAccentColor(0xED4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# <:Cancel:1473037949187657818> All Logging Disabled\n\n` +
                            `All logging has been disabled for this server.\n\n` +
                            `No events will be logged until you configure logging channels again.\n\n` +
                            `*Use \`/logging set-all #channel\` to quickly re-enable all logging*`
                        )
                    )
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
                await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } else {
                const info = logTypeNames[type];
                if (logs[guildId] && logs[guildId][type]) {
                    delete logs[guildId][type];
                    saveLogs(logs);
                    
                    const container = new ContainerBuilder()
                        .setAccentColor(0xED4245)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `# <:Cancel:1473037949187657818> ${info.name} Logging Disabled\n\n` +
                                `${info.emoji} **${info.name} Logs** have been disabled.\n\n` +
                                `Events related to ${info.desc} will no longer be logged.\n\n` +
                                `*Use \`/logging set-${type} #channel\` to re-enable*`
                            )
                        )
                        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
                    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                } else {
                    await interaction.reply({ 
                        content: `<:Cancel:1473037949187657818> ${info.name} logging is not currently enabled!`, 
                        flags: MessageFlags.Ephemeral 
                    });
                }
            }

        } else if (subcommand === 'set-mode') {
            const mode = interaction.options.getString('mode');
            logs[guildId].mode = mode;
            saveLogs(logs);
            invalidateCache();
            
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> Log Delivery Mode Updated\n\n` +
                        `<a:loading:1506015728871149770> **Mode:** ${mode === 'webhook' ? '<:Attach:1473037923979886694> Webhook' : '<:bots:1473368718120849500> Bot Message'}\n\n` +
                        (mode === 'webhook'
                            ? `Logs will be sent via webhooks. Make sure to set webhook URLs:\n\`/logging set-webhook <type> <url>\`\n\n`
                            : `Logs will be sent as bot messages in the configured channels.\n\n`) +
                        `*All log messages are always sent silently (no user pings)*`
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        } else if (subcommand === 'set-webhook') {
            const type = interaction.options.getString('type');
            const url = interaction.options.getString('url');
            
            // Validate webhook URL format
            const webhookUrlRegex = /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/.+$/;
            if (!webhookUrlRegex.test(url)) {
                return interaction.reply({
                    content: `<:Cancel:1473037949187657818> Invalid webhook URL! It should look like:\n\`https://discord.com/api/webhooks/123456789/abcdef...\`\n\nYou can create a webhook in **Channel Settings → Integrations → Webhooks**`,
                    flags: MessageFlags.Ephemeral
                });
            }
            
            if (!logs[guildId].webhooks) logs[guildId].webhooks = {};
            
            const allTypes = ['message', 'member', 'voice', 'server', 'moderation'];
            if (type === 'all') {
                for (const t of allTypes) {
                    logs[guildId].webhooks[t] = url;
                }
            } else {
                logs[guildId].webhooks[type] = url;
            }
            saveLogs(logs);
            invalidateCache();
            
            const typeName = type === 'all' ? 'All Log Types' : logTypeNames[type].name + ' Logs';
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> Webhook URL Configured\n\n` +
                        `<:Attach:1473037923979886694> **Type:** ${typeName}\n` +
                        `<a:loading:1506015728871149770> **URL:** ||${url.substring(0, 50)}...||  *(hidden for security)*\n\n` +
                        (logs[guildId].mode !== 'webhook'
                            ? `<:Infotriangle:1473038460456800459> **Note:** Webhook mode is not active yet! Use \`/logging set-mode webhook\` to enable webhook delivery.\n\n`
                            : '') +
                        `*Use \`/logging view\` to see your full configuration*`
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        } catch (error) {
            console.error('[LoggingSetup] Error:', error);
            const { buildErrorResponse } = require('../../utils/responseBuilder');
            const container = buildErrorResponse('Error', 'An error occurred while executing this command.', error.message);
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('<:Cancel:1473037949187657818> You need **Administrator** permission to use this command!');
        }

        try {
        const logs = loadLogs();
        const guildId = message.guild.id;
        
        if (!logs[guildId]) {
            logs[guildId] = {};
        }

        const action = args[0]?.toLowerCase();
        const channel = message.mentions.channels.first();

        const logTypeNames = {
            message: { name: 'Message', emoji: '<:Chat:1473038936241864865>', desc: 'message edits, deletions, and reactions' },
            member: { name: 'Member', emoji: '<:User:1473038971398520977>', desc: 'joins, leaves, role changes, and bans' },
            voice: { name: 'Voice', emoji: '<:Volumeup:1473039290136002844>', desc: 'VC joins, leaves, and streaming activity' },
            server: { name: 'Server', emoji: '<:Settings:1473037894703779851>', desc: 'channel/role changes and server settings' },
            moderation: { name: 'Moderation', emoji: '<:Shield:1473038669831995494>', desc: 'warns, kicks, bans, and mod actions' }
        };

        if (!action || action === 'view') {
            const config = logs[guildId] || {};
            const container = buildLoggingContainer(config, message.guild);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (action === 'disable') {
            const type = args[1]?.toLowerCase();
            if (!type) {
                return message.reply('<:Cancel:1473037949187657818> Please specify a log type to disable: `message`, `member`, `voice`, `server`, `moderation`, or `all`');
            }
            
            if (type === 'all') {
                delete logs[guildId];
                saveLogs(logs);
                invalidateCache();
                
                const container = new ContainerBuilder()
                    .setAccentColor(0xED4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# <:Cancel:1473037949187657818> All Logging Disabled\n\n` +
                            `All logging has been disabled for this server.`
                        )
                    )
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            
            if (logTypeNames[type]) {
                if (logs[guildId] && logs[guildId][type]) {
                    delete logs[guildId][type];
                    saveLogs(logs);
                    invalidateCache();
                    
                    const container = new ContainerBuilder()
                        .setAccentColor(0xED4245)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `# <:Cancel:1473037949187657818> ${logTypeNames[type].name} Logging Disabled`
                            )
                        )
                        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
                    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                } else {
                    return message.reply(`<:Cancel:1473037949187657818> ${logTypeNames[type].name} logging is not currently enabled!`);
                }
            } else {
                return message.reply('<:Cancel:1473037949187657818> Invalid log type! Use: `message`, `member`, `voice`, `server`, `moderation`, or `all`');
            }
        }

        if (action === 'mode') {
            const mode = args[1]?.toLowerCase();
            if (!mode || !['bot', 'webhook'].includes(mode)) {
                return message.reply('<:Cancel:1473037949187657818> Please specify a mode: `bot` or `webhook`\nExample: `-logging mode webhook`');
            }
            logs[guildId].mode = mode;
            saveLogs(logs);
            invalidateCache();
            
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> Log Delivery Mode Updated\n\n` +
                        `<a:loading:1506015728871149770> **Mode:** ${mode === 'webhook' ? '<:Attach:1473037923979886694> Webhook' : '<:bots:1473368718120849500> Bot Message'}\n\n` +
                        (mode === 'webhook'
                            ? `Logs will be sent via webhooks. Set webhook URLs:\n\`-logging webhook <type> <url>\`\n\n`
                            : `Logs will be sent as bot messages in the configured channels.\n\n`) +
                        `*All log messages are always sent silently (no user pings)*`
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (action === 'webhook') {
            const type = args[1]?.toLowerCase();
            const url = args[2];
            
            if (!type || !url) {
                return message.reply('<:Cancel:1473037949187657818> Usage: `-logging webhook <type> <url>`\nTypes: `message`, `member`, `voice`, `server`, `moderation`, `all`');
            }
            
            const allTypes = ['message', 'member', 'voice', 'server', 'moderation'];
            if (type !== 'all' && !allTypes.includes(type)) {
                return message.reply('<:Cancel:1473037949187657818> Invalid log type! Use: `message`, `member`, `voice`, `server`, `moderation`, or `all`');
            }
            
            const webhookUrlRegex = /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/.+$/;
            if (!webhookUrlRegex.test(url)) {
                return message.reply('<:Cancel:1473037949187657818> Invalid webhook URL! It should look like:\n`https://discord.com/api/webhooks/123456789/abcdef...`\n\nCreate a webhook in **Channel Settings → Integrations → Webhooks**');
            }
            
            if (!logs[guildId].webhooks) logs[guildId].webhooks = {};
            
            if (type === 'all') {
                for (const t of allTypes) {
                    logs[guildId].webhooks[t] = url;
                }
            } else {
                logs[guildId].webhooks[type] = url;
            }
            saveLogs(logs);
            invalidateCache();
            
            const typeName = type === 'all' ? 'All Log Types' : logTypeNames[type].name + ' Logs';
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> Webhook URL Configured\n\n` +
                        `<:Attach:1473037923979886694> **Type:** ${typeName}\n` +
                        `<a:loading:1506015728871149770> **URL:** ||${url.substring(0, 50)}...||  *(hidden for security)*\n\n` +
                        (logs[guildId].mode !== 'webhook'
                            ? `<:Infotriangle:1473038460456800459> **Note:** Webhook mode is not active! Use \`-logging mode webhook\` to enable.\n\n`
                            : '') +
                        `*Use \`-logging view\` to see your full configuration*`
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (!channel) {
            return message.reply('<:Cancel:1473037949187657818> Please mention a channel! Example: `-logging message #logs`');
        }

        if (action === 'all') {
            logs[guildId].message = channel.id;
            logs[guildId].member = channel.id;
            logs[guildId].voice = channel.id;
            logs[guildId].server = channel.id;
            logs[guildId].moderation = channel.id;
            saveLogs(logs);
            invalidateCache();
            
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> All Logging Channels Configured\n\n` +
                        `All 5 log types have been set to ${channel}`
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (logTypeNames[action]) {
            logs[guildId][action] = channel.id;
            saveLogs(logs);
            invalidateCache();
            
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> ${logTypeNames[action].name} Logs Configured\n\n` +
                        `**Channel:** ${channel}\n` +
                        `**Type:** ${logTypeNames[action].emoji} ${logTypeNames[action].name} Logs`
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        return message.reply('<:Cancel:1473037949187657818> Invalid usage! Use:\n`-logging <type> #channel` — Set log channel\n`-logging mode <bot|webhook>` — Set delivery mode\n`-logging webhook <type> <url>` — Set webhook URL\n`-logging disable <type>` — Disable a log type');
        } catch (error) {
            console.error('[LoggingSetup] Error:', error);
            const { buildErrorResponse } = require('../../utils/responseBuilder');
            const container = buildErrorResponse('Error', 'An error occurred while executing this command.', error.message);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
