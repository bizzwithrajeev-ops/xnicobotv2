const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

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

function getStatus(ms) {
    if (ms < 0 || isNaN(ms)) return { icon: '<:Infotriangle:1473038460456800459>', label: 'Unknown', color: 0x99AAB5 };
    if (ms <= 100) return { icon: '<:Checkedbox:1473038547165384804>', label: 'Excellent', color: 0x57F287 };
    if (ms <= 200) return { icon: '<:Checkedbox:1473038547165384804>', label: 'Good', color: 0x57F287 };
    if (ms <= 400) return { icon: '<:Infotriangle:1473038460456800459>', label: 'Moderate', color: 0xFEE75C };
    return { icon: '<:Cancel:1473037949187657818>', label: 'Poor', color: 0xED4245 };
}

function buildPing(client, roundtripMs) {
    const api = Math.round(client.ws.ping);
    const s = getStatus(api);

    const container = new ContainerBuilder().setAccentColor(s.color);

    let content = `## <:Heartbeat:1473038409961308221> Pong!\n`;
    content += `> <:Lightningalt:1473038817673085010> **API:** \`${api}ms\``;
    if (roundtripMs !== null) content += ` · **Roundtrip:** \`${roundtripMs}ms\``;
    content += `\n> <:Clock:1473039102113878056> **Uptime:** ${formatUptime(process.uptime())} · **Shard:** #${client.shard?.ids?.[0] ?? 0}`;
    content += `\n\n-# ${s.icon} ${s.label} · <t:${Math.floor(Date.now() / 1000)}:T>`;

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

    const utilRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('check_botinfo')
            .setLabel('Bot Info')
            .setEmoji('<:bots:1473368718120849500>')
            .setStyle(ButtonStyle.Secondary)
    );

    return { container, utilRow };
}

module.exports = {
    prefix: 'ping',
    description: 'Check bot latency',
    usage: 'ping',
    category: 'basic',
    aliases: ['pong', 'latency'],
    dmAllowed: true,

    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency'),

    async execute(interaction) {
        try {
            const response = await interaction.deferReply({ withResponse: true, flags: MessageFlags.IsComponentsV2 });
            const sent = response.resource?.message;
            const roundtrip = sent ? (sent.createdTimestamp - interaction.createdTimestamp) : 0;
            const { container, utilRow } = buildPing(interaction.client, roundtrip);
            await interaction.editReply({ components: [container.addActionRowComponents(utilRow)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            const content = '<:Cancel:1473037949187657818> An error occurred.';
            if (interaction.deferred || interaction.replied) await interaction.editReply({ content }).catch(() => {});
            else await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    },

    async executePrefix(message) {
        try {
            const { container, utilRow } = buildPing(message.client, null);
            const sent = await message.reply({ components: [container.addActionRowComponents(utilRow)], flags: MessageFlags.IsComponentsV2 });
            const roundtrip = sent.createdTimestamp - message.createdTimestamp;
            const updated = buildPing(message.client, roundtrip);
            await sent.edit({ components: [updated.container, updated.utilRow], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        } catch (error) {
            await message.reply('<:Cancel:1473037949187657818> An error occurred.').catch(() => {});
        }
    },

    buildPing
};
