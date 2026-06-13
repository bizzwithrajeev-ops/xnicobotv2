const { isOwner } = require('../../utils/helpers');
const { MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const os = require('os');
const { } = require('../../utils/responseBuilder');

module.exports = {
    name: 'system',
    prefix: 'system',
    aliases: ['sys', 'resources', 'perf'],
    description: 'View system resources and performance metrics',
    usage: 'system',
    category: 'owner',
    ownerOnly: true,

    async executePrefix(message) {
        if (!isOwner(message.author.id)) return;
        await this.showSystem(message, message.client);
    },

    async showSystem(context, client) {
        const mem = process.memoryUsage();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const cpus = os.cpus();
        const uptime = process.uptime();

        const formatBytes = (b) => {
            if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
            if (b >= 1048576) return (b / 1048576).toFixed(2) + ' MB';
            return (b / 1024).toFixed(2) + ' KB';
        };

        const formatUptime = (s) => {
            const d = Math.floor(s / 86400);
            const h = Math.floor((s % 86400) / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sec = Math.floor(s % 60);
            const parts = [];
            if (d > 0) parts.push(`${d}d`);
            if (h > 0) parts.push(`${h}h`);
            if (m > 0) parts.push(`${m}m`);
            parts.push(`${sec}s`);
            return parts.join(' ');
        };

        // CPU load average
        const loadAvg = os.loadavg();

        // Guild/user stats
        const totalGuilds = client.guilds.cache.size;
        const totalUsers = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
        const totalChannels = client.channels.cache.size;

        const memPercent = ((mem.heapUsed / mem.heapTotal) * 100).toFixed(1);
        const sysMemPercent = ((usedMem / totalMem) * 100).toFixed(1);

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`# <:Settings:1473037894703779851> System Monitor`)
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### <:Shield:1473038669831995494> Platform\n` +
                    `> <:Document:1473039496995143731> **OS:** ${os.platform()} ${os.arch()}\n` +
                    `> <:Bookopen:1473038576391557130> **Node.js:** ${process.version}\n` +
                    `> <:Lightning:1473038797540298792> **Uptime:** ${formatUptime(uptime)}`
                )
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### <:Invoice:1473039492217835550> CPU\n` +
                    `> <:Settings:1473037894703779851> **Model:** ${cpus[0]?.model || 'Unknown'}\n` +
                    `> <:Add:1473038100862337035> **Cores:** ${cpus.length}\n` +
                    `> <:Alarm:1473039068546732214> **Load:** ${loadAvg.map(l => l.toFixed(2)).join(' / ')}`
                )
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### <:Editalt:1473038138577256670> Memory\n` +
                    `> <:Star:1473038501766369300> **Heap:** ${formatBytes(mem.heapUsed)} / ${formatBytes(mem.heapTotal)} (${memPercent}%)\n` +
                    `> <:Bookopen:1473038576391557130> **RSS:** ${formatBytes(mem.rss)}  •  **External:** ${formatBytes(mem.external)}\n` +
                    `> <:Invoice:1473039492217835550> **System:** ${formatBytes(usedMem)} / ${formatBytes(totalMem)} (${sysMemPercent}% used)\n` +
                    `> <:Checkedbox:1473038547165384804> **Free:** ${formatBytes(freeMem)} (${((freeMem / totalMem) * 100).toFixed(1)}%)`
                )
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### <:Bookopen:1473038576391557130> Bot Stats\n` +
                    `> <:Fileuser:1473039570630348810> **${totalGuilds}** servers  •  **${totalUsers.toLocaleString()}** users  •  **${totalChannels}** channels\n` +
                    `> <:Lightning:1473038797540298792> **WS Ping:** ${client.ws.ping}ms\n` +
                    `> <:Alarm:1473039068546732214> **Bot Uptime:** ${formatUptime(uptime)}`
                )
            )

        const opts = { components: [container], flags: MessageFlags.IsComponentsV2 };
        return context.editReply ? context.editReply(opts) : context.reply(opts);
    }
};
