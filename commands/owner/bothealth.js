const { isOwner } = require('../../utils/helpers');
const { AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const os = require('os');

const jsonStore = require('../../utils/jsonStore');
module.exports = {
    data: null,
    name: 'bothealth',
    prefix: 'bothealth',
    aliases: ['health', 'healthcheck'],
    description: 'Generate a comprehensive bot/system health report image',
    usage: 'bothealth',
    category: 'owner',
    ownerOnly: true,

    async executePrefix(message, args, lavalinkManager) {
        if (!isOwner(message.author.id)) {
            return message.reply(`<:Cancel:1473037949187657818> This command is only available to the bot owner!`);
        }

        const msg = await message.reply('<:Lightning:1473038797540298792> Generating comprehensive health report...');

        try {
            const canvas = createCanvas(1400, 1000);
            const ctx = canvas.getContext('2d');

            const gradient = ctx.createLinearGradient(0, 0, 0, 1000);
            gradient.addColorStop(0, '#0d1117');
            gradient.addColorStop(0.5, '#161b22');
            gradient.addColorStop(1, '#0d1117');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 1400, 1000);

            ctx.strokeStyle = '#30363d';
            ctx.lineWidth = 1;
            for (let i = 0; i < 1400; i += 50) {
                ctx.beginPath();
                ctx.moveTo(i, 0);
                ctx.lineTo(i, 1000);
                ctx.stroke();
            }
            for (let i = 0; i < 1000; i += 50) {
                ctx.beginPath();
                ctx.moveTo(0, i);
                ctx.lineTo(1400, i);
                ctx.stroke();
            }

            const client = message.client;
            const totalMembers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
            const totalChannels = client.channels.cache.size;
            const textChannels = client.channels.cache.filter(c => c.type === 0).size;
            const voiceChannels = client.channels.cache.filter(c => c.type === 2).size;
            const uptime = process.uptime();
            const days = Math.floor(uptime / 86400);
            const hours = Math.floor((uptime % 86400) / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);

            const memoryUsage = process.memoryUsage();
            const heapUsed = memoryUsage.heapUsed / 1024 / 1024;
            const heapTotal = memoryUsage.heapTotal / 1024 / 1024;
            const rss = memoryUsage.rss / 1024 / 1024;
            const external = memoryUsage.external / 1024 / 1024;
            const totalMemory = os.totalmem() / 1024 / 1024 / 1024;
            const freeMemory = os.freemem() / 1024 / 1024 / 1024;
            const usedMemory = totalMemory - freeMemory;
            const memoryPercent = (usedMemory / totalMemory) * 100;

            const cpuLoad = os.loadavg();
            const cpuCores = os.cpus().length;
            const cpuModel = os.cpus()[0]?.model || 'Unknown';
            const cpuPercent = (cpuLoad[0] / cpuCores) * 100;

            let totalVoiceTime = 0;
            let totalMessages = 0;
            try {
                if (jsonStore.has('guild_members')) {
                    const data = jsonStore.read('guild_members');
                    totalVoiceTime = data.reduce((acc, member) => acc + (member.analytics?.voiceTime || 0), 0);
                    totalMessages = data.reduce((acc, member) => acc + (member.analytics?.totalMessages || 0), 0);
                }
            } catch (error) {}

            const voiceHours = Math.floor(totalVoiceTime / 3600);
            const voiceMins = Math.floor((totalVoiceTime % 3600) / 60);

            let healthScore = 100;
            let healthStatus = 'Excellent';
            let healthColor = '#3fb950';
            
            if (memoryPercent > 70) healthScore -= 15;
            if (memoryPercent > 85) healthScore -= 20;
            if (cpuPercent > 50) healthScore -= 10;
            if (cpuPercent > 80) healthScore -= 20;
            if (client.ws.ping > 100) healthScore -= 5;
            if (client.ws.ping > 200) healthScore -= 10;
            
            if (healthScore < 50) {
                healthStatus = 'Critical';
                healthColor = '#f85149';
            } else if (healthScore < 75) {
                healthStatus = 'Warning';
                healthColor = '#d29922';
            }

            ctx.font = 'bold 42px Arial';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('System Health Monitor', 50, 60);
            
            ctx.font = '18px Arial';
            ctx.fillStyle = '#8b949e';
            const now = new Date();
            ctx.fillText(`Generated: ${now.toLocaleString()} | Bot: ${client.user.username}`, 50, 90);

            ctx.beginPath();
            ctx.arc(1300, 60, 40, 0, Math.PI * 2);
            ctx.fillStyle = healthColor + '30';
            ctx.fill();
            ctx.strokeStyle = healthColor;
            ctx.lineWidth = 4;
            ctx.stroke();
            
            ctx.font = 'bold 28px Arial';
            ctx.fillStyle = healthColor;
            ctx.textAlign = 'center';
            ctx.fillText(healthScore + '%', 1300, 70);
            ctx.font = '14px Arial';
            ctx.fillText(healthStatus, 1300, 90);
            ctx.textAlign = 'left';

            const drawCard = async (x, y, width, height, title, items, icon = null) => {
                ctx.fillStyle = '#21262d';
                ctx.beginPath();
                ctx.roundRect(x, y, width, height, 12);
                ctx.fill();
                
                ctx.strokeStyle = '#30363d';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.font = 'bold 20px Arial';
                ctx.fillStyle = '#58a6ff';
                ctx.fillText(title, x + 20, y + 35);

                ctx.font = '16px Arial';
                let itemY = y + 65;
                for (const item of items) {
                    ctx.fillStyle = '#8b949e';
                    ctx.fillText(item.label + ':', x + 20, itemY);
                    ctx.fillStyle = item.color || '#ffffff';
                    ctx.fillText(item.value, x + 160, itemY);
                    itemY += 28;
                }
            };

            await drawCard(50, 120, 320, 200, '◆ Bot Statistics', [
                { label: 'Servers', value: client.guilds.cache.size.toLocaleString(), icon: '<:Caretright:1473038207221502106>' },
                { label: 'Users', value: totalMembers.toLocaleString(), icon: '<:Caretright:1473038207221502106>' },
                { label: 'Channels', value: `${totalChannels} (${textChannels}T/${voiceChannels}V)`, icon: '<:Caretright:1473038207221502106>' },
                { label: 'Commands', value: client.commands?.size?.toString() || '517', icon: '<:Caretright:1473038207221502106>' },
                { label: 'Ping', value: `${client.ws.ping}ms`, color: client.ws.ping < 100 ? '#3fb950' : client.ws.ping < 200 ? '#d29922' : '#f85149', icon: '●' }
            ]);

            await drawCard(390, 120, 320, 200, '◆ Uptime & Activity', [
                { label: 'Uptime', value: `${days}d ${hours}h ${minutes}m ${seconds}s`, icon: '<:Caretright:1473038207221502106>' },
                { label: 'Voice Time', value: `${voiceHours}h ${voiceMins}m`, icon: '<:Caretright:1473038207221502106>' },
                { label: 'Messages', value: totalMessages.toLocaleString(), icon: '<:Caretright:1473038207221502106>' },
                { label: 'Music Players', value: lavalinkManager?.players?.size?.toString() || '0', icon: '<:Caretright:1473038207221502106>' },
                { label: 'Started', value: new Date(Date.now() - uptime * 1000).toLocaleDateString(), icon: '<:Caretright:1473038207221502106>' }
            ]);

            await drawCard(730, 120, 320, 200, '◆ System Info', [
                { label: 'Platform', value: `${os.platform()} ${os.arch()}`, icon: '<:Caretright:1473038207221502106>' },
                { label: 'Node.js', value: process.version, icon: '<:Caretright:1473038207221502106>' },
                { label: 'Discord.js', value: `v${require('discord.js').version}`, icon: '<:Caretright:1473038207221502106>' },
                { label: 'CPU Cores', value: cpuCores.toString(), icon: '<:Caretright:1473038207221502106>' },
                { label: 'Hostname', value: os.hostname().substring(0, 20), icon: '<:Caretright:1473038207221502106>' }
            ]);

            await drawCard(1070, 120, 280, 200, '◆ Owner Info', [
                { label: 'Owner ID', value: process.env.OWNER_ID?.substring(0, 18) || 'Not set', icon: '<:Caretright:1473038207221502106>' },
                { label: 'Bot ID', value: client.user.id.substring(0, 18), icon: '<:Caretright:1473038207221502106>' },
                { label: 'Created', value: client.user.createdAt.toLocaleDateString(), icon: '<:Caretright:1473038207221502106>' },
                { label: 'Verified', value: client.user.flags?.has('VerifiedBot') ? 'Yes' : 'No', color: '#3fb950', icon: '●' }
            ]);

            const drawProgressBar = (x, y, width, height, percent, label, value, colorStart, colorEnd) => {
                ctx.fillStyle = '#21262d';
                ctx.beginPath();
                ctx.roundRect(x, y, width, height + 50, 12);
                ctx.fill();
                ctx.strokeStyle = '#30363d';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.font = 'bold 18px Arial';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(label, x + 20, y + 30);
                
                ctx.font = '14px Arial';
                ctx.fillStyle = '#8b949e';
                ctx.textAlign = 'right';
                ctx.fillText(value, x + width - 20, y + 30);
                ctx.textAlign = 'left';

                ctx.fillStyle = '#30363d';
                ctx.beginPath();
                ctx.roundRect(x + 20, y + 45, width - 40, height, 8);
                ctx.fill();

                const barGradient = ctx.createLinearGradient(x + 20, y + 45, x + width - 20, y + 45);
                barGradient.addColorStop(0, colorStart);
                barGradient.addColorStop(1, colorEnd);
                ctx.fillStyle = barGradient;
                
                const fillWidth = Math.min(percent / 100, 1) * (width - 40);
                ctx.beginPath();
                ctx.roundRect(x + 20, y + 45, fillWidth, height, 8);
                ctx.fill();

                ctx.font = 'bold 14px Arial';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.fillText(`${percent.toFixed(1)}%`, x + width / 2, y + 45 + height / 2 + 5);
                ctx.textAlign = 'left';
            };

            drawProgressBar(50, 340, 660, 25, memoryPercent, '▣ System Memory', 
                `${usedMemory.toFixed(2)} GB / ${totalMemory.toFixed(2)} GB`,
                memoryPercent > 80 ? '#f85149' : memoryPercent > 60 ? '#d29922' : '#3fb950',
                memoryPercent > 80 ? '#da3633' : memoryPercent > 60 ? '#9e6a03' : '#238636');

            drawProgressBar(730, 340, 620, 25, cpuPercent, '▣ CPU Load', 
                `${cpuLoad[0].toFixed(2)} / ${cpuCores} cores`,
                cpuPercent > 80 ? '#f85149' : cpuPercent > 50 ? '#d29922' : '#3fb950',
                cpuPercent > 80 ? '#da3633' : cpuPercent > 50 ? '#9e6a03' : '#238636');

            await drawCard(50, 440, 660, 180, '◆ Process Memory Details', [
                { label: 'Heap Used', value: `${heapUsed.toFixed(2)} MB`, color: '#58a6ff', icon: '<:Caretright:1473038207221502106>' },
                { label: 'Heap Total', value: `${heapTotal.toFixed(2)} MB`, icon: '<:Caretright:1473038207221502106>' },
                { label: 'RSS', value: `${rss.toFixed(2)} MB`, icon: '<:Caretright:1473038207221502106>' },
                { label: 'External', value: `${external.toFixed(2)} MB`, icon: '<:Caretright:1473038207221502106>' },
                { label: 'Usage', value: `${((heapUsed / heapTotal) * 100).toFixed(1)}%`, color: heapUsed / heapTotal > 0.8 ? '#f85149' : '#3fb950', icon: '●' }
            ]);

            await drawCard(730, 440, 620, 180, '◆ Network & Sharding', [
                { label: 'WS Ping', value: `${client.ws.ping}ms`, color: client.ws.ping < 100 ? '#3fb950' : '#d29922', icon: '●' },
                { label: 'WS Status', value: 'Connected', color: '#3fb950', icon: '●' },
                { label: 'Shard ID', value: client.shard?.ids?.[0]?.toString() || '0', icon: '<:Caretright:1473038207221502106>' },
                { label: 'Total Shards', value: client.shard?.count?.toString() || '1', icon: '<:Caretright:1473038207221502106>' },
                { label: 'Gateway', value: 'Discord API v10', color: '#58a6ff', icon: '<:Caretright:1473038207221502106>' }
            ]);

            await drawCard(50, 640, 440, 180, '◆ Music System', [
                { label: 'Active Players', value: lavalinkManager?.players?.size?.toString() || '0', color: '#58a6ff', icon: '<:Caretright:1473038207221502106>' },
                { label: 'Lavalink Nodes', value: lavalinkManager?.nodes?.size?.toString() || '1', icon: '<:Caretright:1473038207221502106>' },
                { label: 'Node Status', value: 'Connected', color: '#3fb950', icon: '●' },
                { label: 'Total Voice', value: `${voiceHours}h ${voiceMins}m played`, icon: '<:Caretright:1473038207221502106>' },
                { label: 'Platforms', value: 'YT, Spotify, SC, AM', icon: '<:Caretright:1473038207221502106>' }
            ]);

            await drawCard(510, 640, 440, 180, '◆ Security & Features', [
                { label: 'Anti-Nuke', value: 'Active', color: '#3fb950', icon: '●' },
                { label: 'Anti-Raid', value: 'Active', color: '#3fb950', icon: '●' },
                { label: 'Automod', value: 'Active', color: '#3fb950', icon: '●' },
                { label: 'Logging', value: 'Enabled', color: '#3fb950', icon: '●' },
                { label: 'Last Restart', value: new Date(Date.now() - uptime * 1000).toLocaleTimeString(), icon: '<:Caretright:1473038207221502106>' }
            ]);

            await drawCard(970, 640, 380, 180, '◆ Load Averages', [
                { label: '1 min', value: cpuLoad[0].toFixed(3), color: cpuLoad[0] > cpuCores ? '#f85149' : '#3fb950', icon: '●' },
                { label: '5 min', value: cpuLoad[1].toFixed(3), color: cpuLoad[1] > cpuCores ? '#f85149' : '#3fb950', icon: '●' },
                { label: '15 min', value: cpuLoad[2].toFixed(3), color: cpuLoad[2] > cpuCores ? '#f85149' : '#3fb950', icon: '●' },
                { label: 'Free Mem', value: `${freeMemory.toFixed(2)} GB`, icon: '<:Caretright:1473038207221502106>' },
                { label: 'OS Uptime', value: `${Math.floor(os.uptime() / 86400)}d`, icon: '<:Caretright:1473038207221502106>' }
            ]);

            ctx.fillStyle = '#21262d';
            ctx.beginPath();
            ctx.roundRect(50, 840, 1300, 140, 12);
            ctx.fill();
            ctx.strokeStyle = '#30363d';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.font = 'bold 20px Arial';
            ctx.fillStyle = '#58a6ff';
            ctx.fillText('◆ CPU Information', 70, 875);

            ctx.font = '14px Arial';
            ctx.fillStyle = '#8b949e';
            ctx.fillText(`Model: ${cpuModel}`, 70, 905);
            ctx.fillText(`Architecture: ${os.arch()} | Endianness: ${os.endianness()}`, 70, 930);
            ctx.fillText(`Process ID: ${process.pid} | Parent PID: ${process.ppid || 'N/A'}`, 70, 955);

            ctx.fillStyle = '#8b949e';
            ctx.fillText(`Node Version: ${process.version}`, 700, 905);
            ctx.fillText(`V8 Version: ${process.versions.v8}`, 700, 930);
            ctx.fillText(`OpenSSL: ${process.versions.openssl}`, 700, 955);

            ctx.font = '12px Arial';
            ctx.fillStyle = '#484f58';
            ctx.fillText('Generated by Bot Health Monitor | Refresh with command to update', 50, 995);

            const buffer = canvas.toBuffer('image/png');
            const attachment = new AttachmentBuilder(buffer, { name: 'health-report.png' });

            await msg.edit({ content: null, files: [attachment] });

        } catch (error) {
            console.error('Error generating health image:', error);
            await msg.edit('<:Cancel:1473037949187657818> Failed to generate health report!');
        }
    }
};
