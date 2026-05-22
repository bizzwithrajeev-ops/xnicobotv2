const { isOwner } = require('../../utils/helpers');
const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const jsonStore = require('../../utils/jsonStore');

module.exports = {
    name: 'globalconfig',
    description: 'View or modify global bot settings',
    
    async executePrefix(message, args) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const action = args[0];
        const key = args[1];
        const value = args.slice(2).join(' ');

        const configPath = path.join(__dirname, '..', '..', 'config', 'globalconfig.json');

        const loadConfig = () => {
            const data = jsonStore.read('globalconfig');
            if (!data || Object.keys(data).length === 0) {
                const defaultConfig = {
                    defaultPrefix: process.env.PREFIX || '-',
                    maintenanceMode: false,
                    maintenanceMessage: 'Bot is currently under maintenance. Please try again later.',
                    globalAnnouncement: null,
                    maxGuilds: 1000,
                    developerMode: false,
                    autoRestart: true,
                    commandCooldown: 3000,
                    embedColor: '#0099ff',
                    supportServer: null,
                    voteLink: process.env.VOTE_LINK || null
                };
                jsonStore.write('globalconfig', defaultConfig);
                return defaultConfig;
            }
            return data;
        };

        const saveConfig = (config) => {
            jsonStore.write('globalconfig', config);
        };

        try {
            const config = loadConfig();

            if (!action || action === 'view') {
                const container = new ContainerBuilder()
                    .setAccentColor(0xCAD7E6)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`# <:Settings:1473037894703779851> Global Bot Configuration`)
                    )
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `**Default Prefix:** \`${config.defaultPrefix}\`\n` +
                            `**Maintenance Mode:** ${config.maintenanceMode ? '<:Toggleon:1473038585501581312> Enabled' : '<:Toggleoff:1473038582813032590> Disabled'}\n` +
                            `**Developer Mode:** ${config.developerMode ? '<:Toggleon:1473038585501581312> Enabled' : '<:Toggleoff:1473038582813032590> Disabled'}\n` +
                            `**Max Guilds:** ${config.maxGuilds}\n` +
                            `**Command Cooldown:** ${config.commandCooldown}ms\n` +
                            `**Embed Color:** ${config.embedColor}\n\n` +
                            `**Maintenance Message:** ${config.maintenanceMessage.substring(0, 100)}\n` +
                            `**Support Server:** ${config.supportServer || 'Not set'}\n` +
                            `**Vote Link:** ${config.voteLink || 'Not set'}\n\n` +
                            `*Use \`-globalconfig set <key> <value>\` to modify*`
                        )
                    );

                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (action === 'set') {
                if (!key || !value) {
                    return message.reply('<:Cancel:1473037949187657818> Usage: `-globalconfig set <key> <value>`');
                }

                const validKeys = ['defaultPrefix', 'maintenanceMode', 'maintenanceMessage', 'maxGuilds', 'developerMode', 'commandCooldown', 'embedColor', 'supportServer', 'voteLink'];
                
                if (!validKeys.includes(key)) {
                    return message.reply(`<:Cancel:1473037949187657818> Invalid key! Valid keys: ${validKeys.join(', ')}`);
                }

                let parsedValue = value;
                if (key === 'maintenanceMode' || key === 'developerMode') {
                    parsedValue = value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'on';
                } else if (key === 'maxGuilds' || key === 'commandCooldown') {
                    parsedValue = parseInt(value);
                    if (isNaN(parsedValue)) {
                        return message.reply('<:Cancel:1473037949187657818> Value must be a number!');
                    }
                }

                config[key] = parsedValue;
                saveConfig(config);

                message.reply(`<:Checkedbox:1473038547165384804> Successfully set **${key}** to \`${parsedValue}\``);
            } else if (action === 'reset') {
                fs.unlinkSync(configPath);
                message.reply('<:Checkedbox:1473038547165384804> Global configuration has been reset to defaults!');
            } else {
                message.reply('<:Cancel:1473037949187657818> Invalid action! Use: view, set, reset');
            }

        } catch (error) {
            message.reply(`<:Cancel:1473037949187657818> Error managing global config: ${error.message}`);
        }
    }
};
