const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const botCustomize = require('../../utils/botCustomize');

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

function buildBotInfo(client, guild) {
    const guildId = guild?.id;
    const accentColor = botCustomize.getEmbedColor(guildId);
    const guildCustom = botCustomize.getConfig(guildId);
    const prefix = guildCustom.prefix || process.env.PREFIX || '-';

    const totalMembers = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
    const totalCommands = countCommands(path.join(__dirname, '..'));
    const uptime = formatUptime(process.uptime());
    const heap = formatBytes(process.memoryUsage().heapUsed);
    const api = Math.round(client.ws.ping);

    const lavalinkPlayers = client.lavalink?.players?.size || 0;
    const lavalinkNodes = client.lavalink?.nodeManager?.nodes ? [...client.lavalink.nodeManager.nodes.values()].filter(n => n.connected).length : 0;

    const container = new ContainerBuilder().setAccentColor(accentColor);

    // Header with avatar
    const header = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# <:bots:1473368718120849500> ${client.user.username}\nAll-in-one Discord bot with **${totalCommands}+** commands`
            )
        )
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: client.user.displayAvatarURL({ size: 256 }) } }));
    container.addSectionComponents(header);
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // Stats
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> <:Folderopen:1473039552783323348> **${client.guilds.cache.size.toLocaleString()}** servers · <:members:1473038912212435086> **${totalMembers.toLocaleString()}** users · <:Bookopen:1473038576391557130> **${totalCommands}** commands\n` +
        `> <:Heartbeat:1473038409961308221> **${api}ms** latency · <:Clock:1473039102113878056> **${uptime}** uptime · <:Cursor:1473038064564834544> **${heap}** memory\n` +
        `> <:Music:1473039311057190972> **${lavalinkPlayers}** active players · <:Lightningalt:1473038679906844824> **${lavalinkNodes}** node(s) · <:Shield:1473038669831995494> Shard **#${guild?.shardId ?? 0}**`
    ));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // Info
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> <:Shield:1473038669831995494> **Developer:** <@${process.env.OWNER_ID}> · **Prefix:** \`${prefix}\`\n` +
        `> <:Fire:1473038604812161218> **Node.js:** ${process.version} · **Discord.js:** v${require('discord.js').version}\n` +
        `> <:Clock:1473039102113878056> **Created:** <t:${Math.floor(client.user.createdTimestamp / 1000)}:D> (<t:${Math.floor(client.user.createdTimestamp / 1000)}:R>)`
    ));

    // Link buttons
    const linkRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('check_ping')
            .setLabel('Ping')
            .setEmoji('<:Heartbeat:1473038409961308221>')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setLabel('Invite')
            .setURL(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`)
            .setStyle(ButtonStyle.Link)
            .setEmoji('<:bots:1473368718120849500>'),
        new ButtonBuilder()
            .setLabel('Support')
            .setURL(process.env.SUPPORT_SERVER || 'https://discord.gg/Zs35X7Umak')
            .setStyle(ButtonStyle.Link)
            .setEmoji('<:members:1473038912212435086>'),
        new ButtonBuilder()
            .setLabel('Vote')
            .setURL(`https://top.gg/bot/${client.user.id}/vote`)
            .setStyle(ButtonStyle.Link)
            .setEmoji('<:topgg:1473546762248523839>')
    );

    return { container, linkRow };
}

module.exports = {
    aliases: ['bi', 'about', 'botstat'],
    category: 'basic',
    prefix: 'botinfo',
    description: 'Display bot information',
    usage: 'botinfo',
    dmAllowed: true,

    data: new SlashCommandBuilder()
        .setName('botinfo')
        .setDescription('Display bot information'),

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
