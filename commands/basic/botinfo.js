'use strict';

const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const os = require('os');
const botCustomize = require('../../utils/botCustomize');

// ─── Emojis ────────────────────────────────────────────────────────────────────
const E = {
    bot:       '<:bots:1473368718120849500>',
    server:    '<:Folderopen:1473039552783323348>',
    members:   '<:members:1473038912212435086>',
    commands:  '<:Bookopen:1473038576391557130>',
    ping:      '<:Heartbeat:1473038409961308221>',
    clock:     '<:Clock:1473039102113878056>',
    memory:    '<:Cursor:1473038064564834544>',
    music:     '<:Music:1473039311057190972>',
    node:      '<:Lightningalt:1473038679906844824>',
    shield:    '<:Shield:1473038669831995494>',
    dev:       '<:Crown:1506010837368963142>',
    fire:      '<:Fire:1473038604812161218>',
    code:      '<:developer:1485248261492178995>',
    link:      '<:Link:1473038786530316298>',
    star:      '<:Star:1473038501766369300>',
    topgg:     '<:topgg:1473546762248523839>',
    check:     '<:Checkedbox:1473038547165384804>',
    cpu:       '<:Lightning:1473038797540298792>',
    database:  '<:Document:1473039496995143731>',
    globe:     '<:Globe:1473039496995143731>',
    channel:   '<:Chat:1473038936241864865>',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor(seconds / 3600) % 24;
    const m = Math.floor(seconds / 60) % 60;
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function countCommands(baseDir) {
    let total = 0;
    try {
        for (const folder of fs.readdirSync(baseDir)) {
            const full = path.join(baseDir, folder);
            if (fs.statSync(full).isDirectory()) {
                total += fs.readdirSync(full).filter(f => f.endsWith('.js')).length;
            }
        }
    } catch {}
    return total;
}

function getCpuUsage() {
    const cpus = os.cpus();
    let totalIdle = 0, totalTick = 0;
    for (const cpu of cpus) {
        for (const type in cpu.times) totalTick += cpu.times[type];
        totalIdle += cpu.times.idle;
    }
    return ((1 - totalIdle / totalTick) * 100).toFixed(1);
}

function getSystemUptime() {
    const sec = os.uptime();
    const d = Math.floor(sec / 86400);
    const h = Math.floor(sec / 3600) % 24;
    if (d > 0) return `${d}d ${h}h`;
    const m = Math.floor(sec / 60) % 60;
    return `${h}h ${m}m`;
}

// ─── Build the professional botinfo panel ──────────────────────────────────────

function buildBotInfo(client, guild) {
    const guildId = guild?.id;
    const accentColor = botCustomize.getEmbedColor(guildId);
    const guildCustom = botCustomize.getConfig(guildId);
    const prefix = guildCustom.prefix || process.env.PREFIX || '-';

    const totalMembers = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
    const totalChannels = client.channels.cache.size;
    const totalCommands = countCommands(path.join(__dirname, '..'));
    const uptime = formatUptime(process.uptime());
    const mem = process.memoryUsage();
    const heapUsed = formatBytes(mem.heapUsed);
    const heapTotal = formatBytes(mem.heapTotal);
    const rss = formatBytes(mem.rss);
    const apiPing = Math.round(client.ws.ping);
    const cpuUsage = getCpuUsage();
    const platform = `${os.type()} ${os.arch()}`;
    const nodeVersion = process.version;
    const djsVersion = require('discord.js').version;

    // Music engine — the manager is attached as `client.lavalinkManager`
    // by utils/lavalinkSetup.js. The previous version of this file read
    // `client.lavalink`, which is undefined, so node and session counts
    // always rendered as 0. We also count totals (not just connected)
    // so admins can spot when half the cluster is offline.
    const lm = client.lavalinkManager;
    const totalNodes = lm?.nodeManager?.nodes?.size || 0;
    const connectedNodes = lm?.nodeManager?.nodes
        ? [...lm.nodeManager.nodes.values()].filter(n => n.connected).length
        : 0;
    const lavalinkPlayers = lm?.players?.size || 0;
    const playingPlayers = lm?.players
        ? [...lm.players.values()].filter(p => p?.playing && !p?.paused).length
        : 0;

    const shardId = guild?.shardId ?? 0;
    const createdTs = Math.floor(client.user.createdTimestamp / 1000);

    const container = new ContainerBuilder().setAccentColor(accentColor);

    // ── Header ──
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `## ${E.bot} ${client.user.username}\n` +
                    `-# All-in-one Discord bot · **${totalCommands}** commands · **${client.guilds.cache.size.toLocaleString()}** servers`
                )
            )
            .setThumbnailAccessory(
                new ThumbnailBuilder({ media: { url: client.user.displayAvatarURL({ size: 256 }) } })
            )
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // ── Overview Stats ──
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `### ${E.globe} Overview\n` +
        `${E.server} **Servers:** ${client.guilds.cache.size.toLocaleString()}  ·  ` +
        `${E.members} **Users:** ${totalMembers.toLocaleString()}  ·  ` +
        `${E.channel} **Channels:** ${totalChannels.toLocaleString()}\n` +
        `${E.commands} **Commands:** ${totalCommands}  ·  ` +
        `${E.shield} **Shard:** #${shardId}  ·  ` +
        `${E.dev} **Prefix:** \`${prefix}\``
    ));

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // ── Performance ──
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `### ${E.cpu} Performance\n` +
        `${E.ping} **API Latency:** ${apiPing}ms  ·  ` +
        `${E.clock} **Uptime:** ${uptime}\n` +
        `${E.memory} **Memory:** ${heapUsed} / ${heapTotal} (RSS: ${rss})\n` +
        `${E.fire} **CPU:** ${cpuUsage}%  ·  ` +
        `**Platform:** ${platform}`
    ));

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // ── Music Engine ──
    const nodeStateLine = totalNodes === 0
        ? '`No nodes configured`'
        : connectedNodes === totalNodes
            ? `\`${connectedNodes}/${totalNodes}\` online`
            : connectedNodes === 0
                ? `\`0/${totalNodes}\` offline`
                : `\`${connectedNodes}/${totalNodes}\` online (degraded)`;

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `### ${E.music} Music Engine\n` +
        `${E.node} **Nodes:** ${nodeStateLine}  ·  ` +
        `${E.music} **Sessions:** ${lavalinkPlayers}  ·  ` +
        `${E.fire} **Playing:** ${playingPlayers}`
    ));

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // ── Technical ──
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `### ${E.code} Technical\n` +
        `${E.fire} **Node.js:** ${nodeVersion}  ·  ` +
        `**Discord.js:** v${djsVersion}\n` +
        `${E.dev} **Developer:** <@${process.env.OWNER_ID}>\n` +
        `${E.clock} **Created:** <t:${createdTs}:D> (<t:${createdTs}:R>)`
    ));

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // ── Branding footer ──
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ${E.star} Thank you for using ${client.user.username} · Trusted by ${client.guilds.cache.size.toLocaleString()} communities`
    ));

    // ── Link Buttons ──
    const linkRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('check_ping')
            .setLabel('Ping')
            .setEmoji(E.ping)
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setLabel('Invite')
            .setURL(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`)
            .setStyle(ButtonStyle.Link)
            .setEmoji(E.bot),
        new ButtonBuilder()
            .setLabel('Support')
            .setURL(process.env.SUPPORT_SERVER || 'https://discord.gg/Zs35X7Umak')
            .setStyle(ButtonStyle.Link)
            .setEmoji(E.members),
        new ButtonBuilder()
            .setLabel('Vote')
            .setURL(`https://top.gg/bot/${client.user.id}/vote`)
            .setStyle(ButtonStyle.Link)
            .setEmoji(E.topgg),
        new ButtonBuilder()
            .setLabel('Website')
            .setURL(process.env.BOT_WEBSITE || 'https://thenico.vercel.app')
            .setStyle(ButtonStyle.Link)
            .setEmoji(E.globe)
    );

    return { container, linkRow };
}

// ─── Module Export ─────────────────────────────────────────────────────────────

module.exports = {
    aliases: ['bi', 'about', 'botstat', 'info'],
    category: 'basic',
    prefix: 'botinfo',
    description: 'Display detailed bot information, stats, and performance metrics',
    usage: 'botinfo',
    dmAllowed: true,

    data: new SlashCommandBuilder()
        .setName('botinfo')
        .setDescription('Display detailed bot information, stats, and performance metrics'),

    async execute(interaction) {
        const { container, linkRow } = buildBotInfo(interaction.client, interaction.guild);
        await interaction.reply({ components: [container, linkRow], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message) {
        const { container, linkRow } = buildBotInfo(message.client, message.guild);
        await message.reply({ components: [container, linkRow], flags: MessageFlags.IsComponentsV2 });
    },

    buildBotInfo
};
