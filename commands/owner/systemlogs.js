const { isOwner } = require('../../utils/helpers');
const { ContainerBuilder, TextDisplayBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'systemlogs',
    prefix: 'systemlogs',
    aliases: ['logs', 'syslogs', 'syslog'],
    description: 'View bot system logs and errors',
    usage: 'systemlogs [lines] [error|warn|info|all]',
    category: 'owner',
    ownerOnly: true,

    async executePrefix(message, args) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const lines = parseInt(args[0]) || 50;
        const type = args[1] || 'all';

        try {
            const logTypes = {
                error: 'Recent Error Logs',
                warn: 'Recent Warning Logs',
                info: 'Recent Info Logs',
                all: 'Recent System Logs'
            };

            const title = logTypes[type] || logTypes.all;

            const logs = [];
            
            if (message.client.systemLogs && message.client.systemLogs.length > 0) {
                const filteredLogs = type === 'all' 
                    ? message.client.systemLogs 
                    : message.client.systemLogs.filter(log => log.type === type);
                
                logs.push(...filteredLogs.slice(-lines));
            } else {
                logs.push({ type: 'info', message: 'No system logs available', timestamp: new Date() });
            }

            if (logs.length === 0) {
                return message.reply(`<:Cancel:1473037949187657818> No ${type} logs found!`);
            }

            if (logs.length > 20) {
                const logText = logs.map(log => 
                    `[${log.timestamp || new Date().toISOString()}] [${(log.type || 'info').toUpperCase()}] ${log.message}`
                ).join('\n');

                const buffer = Buffer.from(logText, 'utf-8');
                const attachment = new AttachmentBuilder(buffer, { name: 'system-logs.txt' });

                message.reply({ 
                    content: `<:Checkedbox:1473038547165384804> **${title}** (${logs.length} entries)`,
                    files: [attachment] 
                });
            } else {
                const logColor = type === 'error' ? 0xFF0000 : type === 'warn' ? 0xFFAA00 : 0x0099FF;

                const container = new ContainerBuilder()
                    .setAccentColor(logColor)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# <:Bookopen:1473038576391557130> ${title}\n\n` +
                            logs.map(log => 
                                `\`[${(log.type || 'info').toUpperCase()}]\` ${log.message}`
                            ).join('\n').substring(0, 1800) +
                            `\n\n*Total: ${logs.length} entries*`
                        )
                    );

                message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

        } catch (error) {
            message.reply(`<:Cancel:1473037949187657818> Error retrieving logs: ${error.message}`);
        }
    }
};
