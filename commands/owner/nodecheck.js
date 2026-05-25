'use strict';

/**
 * nodecheck.js — Owner-only: ping every Lavalink node and report
 * connection state, latency and current player counts. Lighter and
 * faster than `lavalinkinfo` for ad-hoc health checks.
 */

const { isOwner } = require('../../utils/helpers');
const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

module.exports = {
    name: 'nodecheck',
    prefix: 'nodecheck',
    aliases: ['llping', 'lavaping', 'nodes'],
    description: 'Owner-only: quick health check on every Lavalink node',
    usage: 'nodecheck',
    category: 'owner',
    ownerOnly: true,

    async executePrefix(message, args, lavalinkManager) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        if (!lavalinkManager?.nodeManager?.nodes) {
            return message.reply('<:Cancel:1473037949187657818> Lavalink manager not initialised.');
        }

        const nodes = [...lavalinkManager.nodeManager.nodes.values()];
        if (nodes.length === 0) {
            return message.reply('<:Cancel:1473037949187657818> No Lavalink nodes configured.');
        }

        let content = `# <:Music:1473039311057190972> Lavalink Node Check\n\n`;
        let connectedCount = 0;
        let totalPing = 0;

        for (const node of nodes) {
            const id = node.id || node.options?.id || 'unknown';
            const host = node.options?.host || 'unknown';
            const isConnected = node.socket?.readyState === 1;
            const ping = Number.isFinite(node.ping) ? node.ping : null;

            if (isConnected) connectedCount++;
            if (ping != null) totalPing += ping;

            const stateIcon = isConnected ? '<:online:1485248286653943900>' : '<:offline:1485248289690616041>';
            const pingText = ping != null ? `${ping}ms` : 'n/a';
            const players = node.stats?.playingPlayers ?? '?';
            const total = node.stats?.players ?? '?';

            content += `${stateIcon} **${id}** \`${host}\`\n`;
            content += `> ping: \`${pingText}\` · players: \`${players}/${total}\`\n\n`;
        }

        const avgPing = nodes.length ? Math.round(totalPing / nodes.length) : 0;
        content += `### Summary\n`;
        content += `> Connected: **${connectedCount}/${nodes.length}**\n`;
        content += `> Average ping: **${avgPing}ms**`;

        const container = new ContainerBuilder()
            .setAccentColor(connectedCount === nodes.length ? 0x57F287 : connectedCount === 0 ? 0xED4245 : 0xFEE75C)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
