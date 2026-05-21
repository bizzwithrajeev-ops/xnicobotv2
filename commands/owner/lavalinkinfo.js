const { isOwner } = require('../../utils/helpers');
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0) parts.push(`${secs}s`);

    return parts.join(' ') || '0s';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lavalinkinfo')
        .setDescription('View Lavalink node information (Owner only)'),

    async execute(interaction, lavalinkManager) {
        if (!isOwner(interaction.user.id)) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> This command is only available to the bot owner!', flags: MessageFlags.Ephemeral });
        }

        if (!lavalinkManager || !lavalinkManager.nodeManager || !lavalinkManager.nodeManager.nodes) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> Lavalink manager is not initialized!', flags: MessageFlags.Ephemeral });
        }

        const nodes = Array.from(lavalinkManager.nodeManager.nodes.values());
        const container = buildLavalinkContainer(nodes, lavalinkManager);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async executePrefix(message, args, lavalinkManager) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        if (!lavalinkManager) {
            return message.reply('<:Cancel:1473037949187657818> Lavalink manager is not initialized!');
        }

        if (!lavalinkManager.nodeManager || !lavalinkManager.nodeManager.nodes) {
            return message.reply('<:Cancel:1473037949187657818> No Lavalink nodes are configured!');
        }

        const nodes = Array.from(lavalinkManager.nodeManager.nodes.values());

        if (nodes.length === 0) {
            return message.reply('<:Cancel:1473037949187657818> No Lavalink nodes are configured or connected!');
        }

        const container = buildLavalinkContainer(nodes, lavalinkManager);
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};

function buildLavalinkContainer(nodes, lavalinkManager) {
    let content = `# <:Music:1473039311057190972> Lavalink Node Information\n\n`;

    nodes.forEach((node, index) => {
        const stats = node.stats || {};
        const uptime = stats.uptime ? formatUptime(stats.uptime) : 'N/A';
        const memory = stats.memory ? `${(stats.memory.used / 1024 / 1024).toFixed(2)} MB / ${(stats.memory.reservable / 1024 / 1024).toFixed(2)} MB` : 'N/A';
        const cpu = stats.cpu ? `${(stats.cpu.systemLoad * 100).toFixed(2)}% (System) / ${(stats.cpu.lavalinkLoad * 100).toFixed(2)}% (Lavalink)` : 'N/A';
        const players = stats.players !== undefined ? stats.players : 'N/A';
        const playingPlayers = stats.playingPlayers !== undefined ? stats.playingPlayers : 'N/A';

        const isConnected = node.socket && node.socket.readyState === 1;
        
        content += `**📡 Node ${index + 1}: ${node.id || node.options?.id || 'Unknown'}**\n`;
        content += `Status: ${isConnected ? '<:online:1455550955679387743> Connected' : '<:offline:1455550933508333662> Disconnected'}\n`;
        content += `Host: \`${node.options?.host || 'Unknown'}\`\n`;
        content += `Port: \`${node.options?.port || 'Unknown'}\`\n`;
        content += `Secure: ${node.options?.secure ? 'Yes' : 'No'}\n`;
        content += `Uptime: ${uptime}\n`;
        content += `Memory: ${memory}\n`;
        content += `CPU: ${cpu}\n`;
        content += `Players: ${playingPlayers}/${players}\n\n`;
    });

    const connectedNodes = nodes.filter(n => n.socket && n.socket.readyState === 1);
    const totalPlayers = lavalinkManager.players ? lavalinkManager.players.size : 0;
    const activePlayers = lavalinkManager.players ? Array.from(lavalinkManager.players.values()).filter(p => p.playing).length : 0;

    content += `**<:Invoice:1473039492217835550> Total Statistics**\n`;
    content += `Total Nodes: ${nodes.length}\n`;
    content += `Connected Nodes: ${connectedNodes.length}\n`;
    content += `Total Players: ${totalPlayers}\n`;
    content += `Active Players: ${activePlayers}`;

    return new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}
