const { isOwner } = require('../../utils/helpers');
const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: null,

    async executePrefix(message, args, lavalinkManager) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const subcommand = args[0]?.toLowerCase();

        if (!subcommand || subcommand === 'help') {
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Music:1473039311057190972> Lavalink Configuration Help\n\n` +
                        `**<:Document:1473039496995143731> Commands:**\n` +
                        `\`lavalinkconfig add <id> <host> <port> <password> [secure]\`\n` +
                        `└ Add a new Lavalink node\n\n` +
                        `\`lavalinkconfig remove <id>\`\n` +
                        `└ Remove a Lavalink node\n\n` +
                        `\`lavalinkconfig list\`\n` +
                        `└ List all configured nodes\n\n` +
                        `\`lavalinkconfig test <id>\`\n` +
                        `└ Test connection to a node\n\n` +
                        `\`lavalinkconfig reload\`\n` +
                        `└ Reload Lavalink configuration (restart required)\n\n` +
                        `**<:Edit:1473037903625191580> Examples:**\n` +
                        `\`lavalinkconfig add my-node lavalink.example.com 2333 youshallnotpass true\`\n` +
                        `\`lavalinkconfig remove my-node\`\n` +
                        `\`lavalinkconfig test main-node\``
                    )
                );

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const configPath = path.join(__dirname, '../../config/lavalink-nodes.json');

        let config = { nodes: [] };
        if (fs.existsSync(configPath)) {
            try {
                config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            } catch (error) {
                console.error('Error loading Lavalink config:', error);
            }
        }

        if (subcommand === 'add') {
            const [, id, host, port, password, secure] = args;

            if (!id || !host || !port || !password) {
                return message.reply('<:Cancel:1473037949187657818> Usage: `lavalinkconfig add <id> <host> <port> <password> [secure]`');
            }

            const existingIndex = config.nodes.findIndex(n => n.id === id);
            
            const newNode = {
                id,
                host,
                port: parseInt(port),
                authorization: password,
                secure: secure === 'true' || secure === 'yes'
            };

            if (existingIndex !== -1) {
                config.nodes[existingIndex] = newNode;
            } else {
                config.nodes.push(newNode);
            }

            const configDir = path.dirname(configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> Lavalink Node Added\n\n` +
                        `**<:Fileuser:1473039570630348810> Node ID:** \`${id}\`\n` +
                        `**<:Bookopen:1473038576391557130> Host:** \`${host}\`\n` +
                        `**🔌 Port:** \`${port}\`\n` +
                        `**<:Lock:1473038513749491773> Secure:** ${newNode.secure ? 'Yes' : 'No'}\n\n` +
                        `<:Inforect:1473038624172937287> **Restart the bot** to apply changes!`
                    )
                );

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'remove') {
            const id = args[1];

            if (!id) {
                return message.reply('<:Cancel:1473037949187657818> Usage: `lavalinkconfig remove <id>`');
            }

            const index = config.nodes.findIndex(n => n.id === id);

            if (index === -1) {
                return message.reply(`<:Cancel:1473037949187657818> Node with ID \`${id}\` not found!`);
            }

            config.nodes.splice(index, 1);
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            return message.reply(`<:Checkedbox:1473038547165384804> Successfully removed node \`${id}\`!\n\n<:Inforect:1473038624172937287> **Restart the bot** to apply changes!`);
        }

        if (subcommand === 'list') {
            if (config.nodes.length === 0) {
                return message.reply('<:Cancel:1473037949187657818> No Lavalink nodes configured in config file!');
            }

            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Music:1473039311057190972> Configured Lavalink Nodes\n\n` +
                        config.nodes.map((node, i) => 
                            `**${i + 1}. ${node.id}**\n` +
                            `└ Host: \`${node.host}:${node.port}\`\n` +
                            `└ Secure: ${node.secure ? 'Yes' : 'No'}`
                        ).join('\n\n') +
                        `\n\n*Total: ${config.nodes.length} node(s)*`
                    )
                );

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'test') {
            const id = args[1];

            if (!id) {
                return message.reply('<:Cancel:1473037949187657818> Usage: `lavalinkconfig test <id>`');
            }

            if (!lavalinkManager || !lavalinkManager.nodeManager) {
                return message.reply('<:Cancel:1473037949187657818> Lavalink manager is not initialized!');
            }

            const node = lavalinkManager.nodeManager.nodes.get(id);

            if (!node) {
                return message.reply(`<:Cancel:1473037949187657818> Node \`${id}\` not found in active nodes!`);
            }

            const isConnected = node.socket && node.socket.readyState === 1;
            const stats = node.stats || {};

            let content = `# 🧪 Node Test: ${id}\n\n` +
                `**<:Invoice:1473039492217835550> Status:** ${isConnected ? '<:online:1455550955679387743> Connected' : '<:offline:1430999565011648512> Disconnected'}\n` +
                `**<:Bookopen:1473038576391557130> Host:** \`${node.options?.host || 'Unknown'}:${node.options?.port || 'Unknown'}\`\n` +
                `**<:Lock:1473038513749491773> Secure:** ${node.options?.secure ? 'Yes' : 'No'}\n` +
                `**<:Fileuser:1473039570630348810> Session ID:** \`${node.sessionId || 'N/A'}\`\n` +
                `**<:Timer:1473039056710406204> Ping:** ${node.ping ? `${node.ping}ms` : 'N/A'}\n` +
                `**<:Music:1473039311057190972> Players:** ${stats.playingPlayers !== undefined ? `${stats.playingPlayers}/${stats.players}` : 'N/A'}`;

            if (isConnected && stats.memory) {
                content += `\n**<:Save:1473038120030306386> Memory:** ${(stats.memory.used / 1024 / 1024).toFixed(2)} MB / ${(stats.memory.reservable / 1024 / 1024).toFixed(2)} MB`;
            }

            if (isConnected && stats.cpu) {
                content += `\n**<:Settings:1473037894703779851> CPU:** System: ${(stats.cpu.systemLoad * 100).toFixed(2)}% | Lavalink: ${(stats.cpu.lavalinkLoad * 100).toFixed(2)}%`;
            }

            const container = new ContainerBuilder()
                .setAccentColor(isConnected ? 0x00FF00 : 0xFF0000)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'reload') {
            return message.reply('<:Inforect:1473038624172937287> To reload Lavalink configuration, you need to **restart the bot**.');
        }

        return message.reply(`<:Cancel:1473037949187657818> Unknown subcommand: \`${subcommand}\`\n\nUse \`lavalinkconfig help\` to see available commands.`);
    }
};
