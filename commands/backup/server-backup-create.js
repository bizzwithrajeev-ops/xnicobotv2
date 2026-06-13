'use strict';

const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder,
    SeparatorBuilder, SeparatorSpacingSize,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    PermissionFlagsBits, MessageFlags
} = require('discord.js');
const { createServerBackup } = require('../../utils/serverBackupManager');
const { buildExpiredPanel } = require('../../utils/responseBuilder');

const TIMEOUT = 60_000;

const OPTION_META = {
    roles:     { label: 'Roles',      emoji: '<:User:1473038971398520977>', desc: 'All roles & permissions' },
    channels:  { label: 'Channels',   emoji: '<:Edit:1473037903625191580>', desc: 'Categories, text & voice channels' },
    emojis:    { label: 'Emojis',     emoji: '😀', desc: 'Custom server emojis' },
    stickers:  { label: 'Stickers',   emoji: '<:Palette:1473039029476917461>', desc: 'Custom stickers' },
    messages:  { label: 'Messages',   emoji: '<:Chat:1473038936241864865>', desc: 'Full channel message history' },
    bans:      { label: 'Bans',       emoji: '<:banhammer:1473367388597780592>', desc: 'Banned users list' },
    settings:  { label: 'Settings',   emoji: '<:Settings:1473037894703779851>', desc: 'Server name, icon, banner, etc.' },
    botConfig: { label: 'Bot Config', emoji: '<:bots:1473368718120849500>', desc: 'Automod, antinuke, welcomer, leveling…' }
};
const OPTION_KEYS = Object.keys(OPTION_META);
const DEFAULTS = { roles: true, channels: true, emojis: true, stickers: true, messages: false, bans: false, settings: true, botConfig: true };

/* ─── Build the interactive options panel ─── */
function buildPanel(opts, uid, sid) {
    const on = '<:Checkedbox:1473038547165384804>';
    const off = '<:Cancel:1473037949187657818>';

    let lines = '';
    for (const k of OPTION_KEYS) {
        const m = OPTION_META[k];
        lines += `${opts[k] ? on : off} ${m.emoji} **${m.label}** — ${m.desc}\n`;
    }

    const ctr = new ContainerBuilder();
    ctr.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# <:Box:1473039115581915256> Server Backup Options\n\nSelect what to include in your backup:\n\n${lines.trim()}\n\n-# Toggle items with the buttons below.`
    ));

    ctr.addActionRowComponents(new ActionRowBuilder().addComponents(
        ...['roles', 'channels', 'emojis', 'stickers'].map(k =>
            new ButtonBuilder()
                .setCustomId(`sbkc:t:${sid}:${k}`)
                .setEmoji(opts[k] ? '1473038547165384804' : '1473037949187657818')
                .setLabel(OPTION_META[k].label)
                .setStyle(opts[k] ? ButtonStyle.Success : ButtonStyle.Secondary)
        )
    ));

    ctr.addActionRowComponents(new ActionRowBuilder().addComponents(
        ...['messages', 'bans', 'settings', 'botConfig'].map(k =>
            new ButtonBuilder()
                .setCustomId(`sbkc:t:${sid}:${k}`)
                .setEmoji(opts[k] ? '1473038547165384804' : '1473037949187657818')
                .setLabel(OPTION_META[k].label)
                .setStyle(opts[k] ? ButtonStyle.Success : ButtonStyle.Secondary)
        )
    ));

    ctr.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sbkc:all:${sid}`).setEmoji('<:Checkedbox:1473038547165384804>').setLabel('Select All').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`sbkc:none:${sid}`).setEmoji('<:Cancel:1473037949187657818>').setLabel('Deselect All').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`sbkc:confirm:${sid}`).setLabel('<:Box:1473039115581915256> Create Backup').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`sbkc:cancel:${sid}`).setEmoji('<:Cancel:1473037949187657818>').setLabel('Cancel').setStyle(ButtonStyle.Danger)
    ));

    return ctr;
}

/* ─── Pretty result card ─── */
function buildResult(r) {
    const on = '<:Checkedbox:1473038547165384804>';
    const off = '<:Cancel:1473037949187657818>';
    const ctr = new ContainerBuilder();
    ctr.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# <:Checkedbox:1473038547165384804> Server Backup Created\n\n` +
        `**Backup ID:** \`${r.backupId}\`\n**Secure Token:** \`${r.secureToken}\`\n\n` +
        `> <:Inforect:1473038624172937287> **Save both!** Token is needed for cross-server restores.`
    ));
    ctr.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    const s = r.stats;
    const lines = [];
    lines.push(`**<:Bookopen:1473038576391557130> Server:** ${r.serverName}`);
    if (s.roles > 0) lines.push(`**<:User:1473038971398520977> Roles:** ${s.roles}`);
    if (s.categories > 0) lines.push(`**<:Folderopen:1473039552783323348> Categories:** ${s.categories}`);
    if (s.channels > 0) lines.push(`**<:Edit:1473037903625191580> Channels:** ${s.channels}`);
    if (s.emojis > 0) lines.push(`**😀 Emojis:** ${s.emojis}`);
    if (s.stickers > 0) lines.push(`**<:Palette:1473039029476917461> Stickers:** ${s.stickers}`);
    if (s.bans > 0) lines.push(`**<:banhammer:1473367388597780592> Bans:** ${s.bans}`);
    if (s.botConfigs > 0) lines.push(`**<:bots:1473368718120849500> Bot Configs:** ${s.botConfigs}`);
    lines.push(`**<:Chat:1473038936241864865> Messages:** ${s.includesMessages ? `${on} ${s.messages.toLocaleString()} backed up` : `${off} Not included`}`);

    ctr.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
    return ctr;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('server-backup-create')
        .setDescription('Create a complete backup of the Discord server')
        .addBooleanOption(o => o.setName('roles').setDescription('Backup roles & permissions (default: true)'))
        .addBooleanOption(o => o.setName('channels').setDescription('Backup categories & channels (default: true)'))
        .addBooleanOption(o => o.setName('emojis').setDescription('Backup custom emojis (default: true)'))
        .addBooleanOption(o => o.setName('stickers').setDescription('Backup custom stickers (default: true)'))
        .addBooleanOption(o => o.setName('messages').setDescription('Backup ALL channel messages (default: false)'))
        .addBooleanOption(o => o.setName('bans').setDescription('Backup banned users list (default: false)'))
        .addBooleanOption(o => o.setName('settings').setDescription('Backup server settings/icon/banner (default: true)'))
        .addBooleanOption(o => o.setName('bot-config').setDescription('Backup bot configs: automod, antinuke, welcomer, etc. (default: true)'))
        .addIntegerOption(o => o.setName('message-limit').setDescription('Max messages per channel (0 = all, default: 0)').setMinValue(0).setMaxValue(10000))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    prefix: 'server-backup-create',
    description: 'Create a complete backup of the Discord server with selectable components',
    usage: 'server-backup-create',
    category: 'backup',
    aliases: ['sbk-create', 'sbackup-create'],
    permissions: ['Administrator'],

    /* ═══ Slash Command ═══ */
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const opts = {
            roles: interaction.options.getBoolean('roles') ?? true,
            channels: interaction.options.getBoolean('channels') ?? true,
            emojis: interaction.options.getBoolean('emojis') ?? true,
            stickers: interaction.options.getBoolean('stickers') ?? true,
            messages: interaction.options.getBoolean('messages') ?? false,
            bans: interaction.options.getBoolean('bans') ?? false,
            settings: interaction.options.getBoolean('settings') ?? true,
            botConfig: interaction.options.getBoolean('bot-config') ?? true
        };
        const msgLimit = interaction.options.getInteger('message-limit') ?? 0;

        const selected = OPTION_KEYS.filter(k => opts[k]).map(k => OPTION_META[k].label).join(', ') || 'Nothing';
        const progress = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# <:Lightning:1473038797540298792> Creating Server Backup…\n\nThis may take a few minutes${opts.messages ? ' (backing up all messages)' : ''}.\n\n` +
                `**Included:** ${selected}`
            ));
        await interaction.editReply({ components: [progress], flags: MessageFlags.IsComponentsV2 });

        try {
            const r = await createServerBackup(interaction.guild, interaction.user.id, {
                includeRoles: opts.roles,
                includeChannels: opts.channels,
                includeEmojis: opts.emojis,
                includeStickers: opts.stickers,
                includeMessages: opts.messages,
                messageLimit: msgLimit,
                includeBans: opts.bans,
                includeSettings: opts.settings,
                includeBotConfig: opts.botConfig
            });

            if (!r.success) {
                return interaction.editReply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Backup Failed\n\nCould not create server backup.'))], flags: MessageFlags.IsComponentsV2 });
            }
            return interaction.editReply({ components: [buildResult(r)], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('Error creating server backup:', err);
            return interaction.editReply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Error\n\n${err.message}`))], flags: MessageFlags.IsComponentsV2 });
        }
    },

    /* ═══ Prefix Command — interactive toggle panel ═══ */
    async executePrefix(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Missing Permission\n\nYou need **Administrator** permission.'))], flags: MessageFlags.IsComponentsV2 });
        }

        const uid = message.author.id;
        const sid = `${uid}_${Date.now().toString(36)}`;
        const opts = { ...DEFAULTS };

        const sent = await message.reply({ components: [buildPanel(opts, uid, sid)], flags: MessageFlags.IsComponentsV2 });
        const collector = sent.createMessageComponentCollector({ time: TIMEOUT });

        collector.on('collect', async (i) => {
            if (i.user.id !== uid) return i.reply({ content: '<:Cancel:1473037949187657818> Only the command invoker can use this.', flags: MessageFlags.Ephemeral });

            const parts = i.customId.split(':');
            const action = parts[1];

            /* Toggle individual option */
            if (action === 't') {
                const key = parts[3];
                if (OPTION_KEYS.includes(key)) opts[key] = !opts[key];
                return i.update({ components: [buildPanel(opts, uid, sid)], flags: MessageFlags.IsComponentsV2 });
            }

            /* Select all */
            if (action === 'all') {
                for (const k of OPTION_KEYS) opts[k] = true;
                return i.update({ components: [buildPanel(opts, uid, sid)], flags: MessageFlags.IsComponentsV2 });
            }

            /* Deselect all */
            if (action === 'none') {
                for (const k of OPTION_KEYS) opts[k] = false;
                return i.update({ components: [buildPanel(opts, uid, sid)], flags: MessageFlags.IsComponentsV2 });
            }

            /* Cancel */
            if (action === 'cancel') {
                collector.stop('handled');
                return i.update({ components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Cancelled. No backup was created.'))], flags: MessageFlags.IsComponentsV2 });
            }

            /* Confirm — create backup */
            if (action === 'confirm') {
                collector.stop('handled');

                const selected = OPTION_KEYS.filter(k => opts[k]).map(k => OPTION_META[k].label).join(', ') || 'Nothing';
                await i.update({ components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Lightning:1473038797540298792> Creating Server Backup…\n\nThis may take a few minutes${opts.messages ? ' (backing up all messages)' : ''}.\n\n**Included:** ${selected}`
                ))], flags: MessageFlags.IsComponentsV2 });

                try {
                    const r = await createServerBackup(message.guild, uid, {
                        includeRoles: opts.roles,
                        includeChannels: opts.channels,
                        includeEmojis: opts.emojis,
                        includeStickers: opts.stickers,
                        includeMessages: opts.messages,
                        messageLimit: 0,
                        includeBans: opts.bans,
                        includeSettings: opts.settings,
                        includeBotConfig: opts.botConfig
                    });
                    if (!r.success) {
                        return sent.edit({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Backup Failed'))], flags: MessageFlags.IsComponentsV2 });
                    }
                    return sent.edit({ components: [buildResult(r)], flags: MessageFlags.IsComponentsV2 });
                } catch (err) {
                    console.error('Error creating server backup:', err);
                    return sent.edit({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Error\n\n${err.message}`))], flags: MessageFlags.IsComponentsV2 });
                }
            }
        });

        collector.on('end', (_, reason) => {
            if (reason === 'handled') return;
            sent.edit({ components: [buildExpiredPanel('server-backup-create', 'No backup was created.')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        });
    }
};
