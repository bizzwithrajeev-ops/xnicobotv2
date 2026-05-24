'use strict';

const {
    SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType,
    ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
    ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');
const { buildSuccessResponse, buildErrorResponse } = require('../../utils/responseBuilder');
const jsonStore = require('../../utils/jsonStore');

const STORE = 'confessions';

function getGuildConfig(guildId) { return (jsonStore.peek(STORE) || {})[guildId] || null; }
function saveGuildConfig(guildId, cfg) {
    const all = jsonStore.read(STORE) || {};
    all[guildId] = cfg;
    jsonStore.write(STORE, all);
}

function buildSetupPanel(guild, cfg) {
    const enabled = !!cfg?.channelId;
    const channelText = cfg?.channelId ? `<#${cfg.channelId}>` : '`Not set`';
    const count = cfg?.count || 0;

    const container = new ContainerBuilder()
        .setAccentColor(enabled ? 0x57F287 : 0xCAD7E6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# <:Envelope:1473038885364695113> Confession System\n-# Anonymous confessions for your server`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### <:Settings:1473037894703779851> Configuration\n` +
            `**Status:** ${enabled ? '<:Toggleon:1473038585501581312> Active' : '<:Toggleoff:1473038582813032590> Not configured'}\n` +
            `**Channel:** ${channelText}\n` +
            `**Total Confessions:** \`${count}\`\n\n` +
            `### <:Document:1473039496995143731> How It Works\n` +
            `> Users run \`/confess\` or \`-confess <message>\`\n` +
            `> The confession is posted anonymously in the set channel\n` +
            `> Each confession gets a unique ID for moderation\n` +
            `> Users can reply anonymously via the Reply button\n\n` +
            `-# Admins can view confession authors via \`-confession-log <ID>\``
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confsetup_channel').setLabel('Set Channel').setEmoji('<:Bullhorn:1473038903157199093>').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('confsetup_disable').setLabel('Disable').setEmoji('<:Cancel:1473037949187657818>').setStyle(ButtonStyle.Danger).setDisabled(!enabled),
            new ButtonBuilder().setCustomId('confsetup_log').setLabel('View Log').setEmoji('<:Bookopen:1473038576391557130>').setStyle(ButtonStyle.Secondary).setDisabled(count === 0)
        ));

    return container;
}

module.exports = {
    /**
     * Premium-gated feature. `premiumOnly` is read by the
     * command dispatcher in index.js — non-premium users get a
     * polite message instead of execution.
     */
    premiumOnly: true,

    data: new SlashCommandBuilder()
        .setName('confession-setup')
        .setDescription('Set up the anonymous confession system')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption(o => o
            .setName('channel')
            .setDescription('Channel for confessions')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)),

    prefix: 'confession-setup',
    description: 'Set up the anonymous confession system',
    usage: 'confession-setup [#channel]',
    category: 'admin',
    aliases: ['confessionsetup', 'confess-setup'],

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> You need **Manage Server** permission.', flags: MessageFlags.Ephemeral });
        }

        const channel = interaction.options.getChannel('channel');

        if (channel) {
            // Direct setup with channel
            const cfg = getGuildConfig(interaction.guild.id) || { count: 0, log: {} };
            cfg.channelId = channel.id;
            saveGuildConfig(interaction.guild.id, cfg);

            const container = buildSuccessResponse('Confession System Enabled', `Confessions will be posted in ${channel}.`, {
                'Channel': `${channel}`,
                'Command': '`/confess <message>` or `-confess <message>`'
            });
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // Show setup panel
        const cfg = getGuildConfig(interaction.guild.id);
        const panel = buildSetupPanel(interaction.guild, cfg);
        await interaction.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('<:Cancel:1473037949187657818> You need **Manage Server** permission.');
        }

        // Check for confession-log subcommand
        if (args[0]?.toLowerCase() === 'log' || message.content.includes('confession-log')) {
            const confId = args[1]?.toUpperCase();
            if (!confId) return message.reply('<:Cancel:1473037949187657818> Usage: `-confession-log <ID>`');

            const cfg = getGuildConfig(message.guild.id);
            if (!cfg?.log?.[confId]) return message.reply('<:Cancel:1473037949187657818> Confession not found.');

            const entry = cfg.log[confId];
            const container = new ContainerBuilder()
                .setAccentColor(0x5865F2)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `## <:Bookopen:1473038576391557130> Confession Log\n\n` +
                    `**ID:** \`${confId}\`\n` +
                    `**Author:** <@${entry.userId}> (\`${entry.userId}\`)\n` +
                    `**Number:** #${entry.number}\n` +
                    `**Posted:** <t:${Math.floor(entry.timestamp / 1000)}:R>\n\n` +
                    `-# This information is only visible to moderators`
                ));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const channel = message.mentions.channels.first();
        if (channel) {
            const cfg = getGuildConfig(message.guild.id) || { count: 0, log: {} };
            cfg.channelId = channel.id;
            saveGuildConfig(message.guild.id, cfg);

            const container = buildSuccessResponse('Confession System Enabled', `Confessions will be posted in ${channel}.`, {
                'Channel': `${channel}`,
                'Command': '`/confess <message>` or `-confess <message>`'
            });
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // Show panel
        const cfg = getGuildConfig(message.guild.id);
        const panel = buildSetupPanel(message.guild, cfg);
        await message.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
    },

    // Button handler for setup panel
    async handleButton(interaction) {
        if (!interaction.customId.startsWith('confsetup_')) return false;

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> You need **Manage Server** permission.', flags: MessageFlags.Ephemeral });
        }

        const action = interaction.customId.replace('confsetup_', '');

        if (action === 'disable') {
            const all = jsonStore.read(STORE) || {};
            delete all[interaction.guild.id];
            jsonStore.write(STORE, all);
            const panel = buildSetupPanel(interaction.guild, null);
            await interaction.update({ components: [panel], flags: MessageFlags.IsComponentsV2 });
            return true;
        }

        if (action === 'channel') {
            await interaction.reply({
                content: '<:Bullhorn:1473038903157199093> Mention the channel for confessions (e.g. `#confessions`):',
                flags: MessageFlags.Ephemeral
            });

            const filter = m => m.author.id === interaction.user.id && m.mentions.channels.size > 0;
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000 }).catch(() => null);

            if (!collected?.first()) return true;

            const ch = collected.first().mentions.channels.first();
            collected.first().delete().catch(() => {});

            const cfg = getGuildConfig(interaction.guild.id) || { count: 0, log: {} };
            cfg.channelId = ch.id;
            saveGuildConfig(interaction.guild.id, cfg);

            const panel = buildSetupPanel(interaction.guild, cfg);
            await interaction.message.edit({ components: [panel], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            return true;
        }

        if (action === 'log') {
            const cfg = getGuildConfig(interaction.guild.id);
            if (!cfg?.log || Object.keys(cfg.log).length === 0) {
                return interaction.reply({ content: 'No confessions logged yet.', flags: MessageFlags.Ephemeral });
            }

            const entries = Object.entries(cfg.log).slice(-10).reverse();
            let logText = `## <:Bookopen:1473038576391557130> Recent Confessions\n\n`;
            for (const [id, entry] of entries) {
                logText += `> \`${id}\` — <@${entry.userId}> · <t:${Math.floor(entry.timestamp / 1000)}:R>\n`;
            }
            logText += `\n-# Showing last ${entries.length} confessions`;

            const container = new ContainerBuilder().setAccentColor(0x5865F2)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(logText));
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            return true;
        }

        return false;
    }
};
