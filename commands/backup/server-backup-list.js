'use strict';

const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder,
    SeparatorBuilder, SeparatorSpacingSize,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder,
    PermissionFlagsBits, MessageFlags
} = require('discord.js');
const { listServerBackups } = require('../../utils/serverBackupManager');
const { buildExpiredPanel } = require('../../utils/responseBuilder');

const PER_PAGE = 3;
const TIMEOUT = 120_000;

function fmtDate(ts) {
    const ms = typeof ts === 'string' ? new Date(ts).getTime() : (typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : Date.now());
    return `<t:${Math.floor(ms / 1000)}:f>`;
}

function buildList(backups, page, uid) {
    const total = backups.length;
    const pages = Math.max(1, Math.ceil(total / PER_PAGE));
    page = Math.max(0, Math.min(page, pages - 1));
    const slice = backups.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
    const sid = `${uid}_${Date.now().toString(36)}`;

    const ctr = new ContainerBuilder();
    ctr.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# <:Checkedbox:1473038547165384804> Server Backups\n-# ${total} backup${total !== 1 ? 's' : ''} · Page ${page + 1}/${pages}`
    ));
    ctr.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

    if (slice.length === 0) {
        ctr.addTextDisplayComponents(new TextDisplayBuilder().setContent('No server backups found.\n> Use `server-backup-create` to create one.'));
    } else {
        for (const b of slice) {
            const on = '<:Checkedbox:1473038547165384804>';
            const off = '<:Cancel:1473037949187657818>';
            const msgInfo = b.includesMessages ? `${on} ${(b.stats.messages || 0).toLocaleString()} msgs` : `${off} No messages`;
            const banInfo = (b.stats.bans || 0) > 0 ? ` · <:banhammer:1473367388597780592> ${b.stats.bans} bans` : '';
            const cfgInfo = (b.stats.botConfigs || 0) > 0 ? ` · <:bots:1473368718120849500> ${b.stats.botConfigs} configs` : '';
            ctr.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**<:Box:1473039115581915256> \`${b.id}\`** — ${b.serverName}\n` +
                `> <:Clock:1473039102113878056> ${fmtDate(b.createdAt)}\n` +
                `> <:User:1473038971398520977> ${b.stats.roles} roles · <:Folderopen:1473039552783323348> ${b.stats.categories} cats · <:Edit:1473037903625191580> ${b.stats.channels} ch${banInfo}${cfgInfo}\n` +
                `> <:Chat:1473038936241864865> ${msgInfo}`
            ));
        }
    }

    if (total > 0) {
        const opts = backups.map((b, i) => ({
            label: `${b.id} — ${b.serverName}`.slice(0, 100),
            description: `${new Date(b.createdAt).toLocaleDateString()} · ${b.stats.roles}r/${b.stats.channels}ch`.slice(0, 100),
            value: String(i)
        })).slice(0, 25);
        ctr.addActionRowComponents(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId(`sbkl:sel:${sid}`).setPlaceholder('Select a backup to view details…').addOptions(opts)
        ));
    }

    ctr.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sbkl:prev:${sid}`).setEmoji('<:History:1473037847568318605>').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`sbkl:next:${sid}`).setEmoji('<:Caretright:1473038207221502106>').setStyle(ButtonStyle.Secondary).setDisabled(page >= pages - 1),
        new ButtonBuilder().setCustomId(`sbkl:refresh:${sid}`).setEmoji('<:History:1473037847568318605>').setLabel('Refresh').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`sbkl:new:${sid}`).setEmoji('<:Add:1473038100862337035>').setLabel('New Backup').setStyle(ButtonStyle.Success)
    ));
    return { ctr, page, pages, sid };
}

function buildDetail(b, idx, uid) {
    const sid = `${uid}_${Date.now().toString(36)}`;
    const on = '<:Checkedbox:1473038547165384804>';
    const off = '<:Cancel:1473037949187657818>';

    const lines = [
        `# <:Box:1473039115581915256> Backup Detail\n`,
        `**ID:** \`${b.id}\``,
        `**Server:** ${b.serverName}`,
        `**Created:** ${fmtDate(b.createdAt)}\n`,
        `**<:User:1473038971398520977> Roles:** ${b.stats.roles}`,
        `**<:Folderopen:1473039552783323348> Categories:** ${b.stats.categories}`,
        `**<:Edit:1473037903625191580> Channels:** ${b.stats.channels}`,
        `**😀 Emojis:** ${b.stats.emojis || 0}`,
        `**<:Palette:1473039029476917461> Stickers:** ${b.stats.stickers || 0}`,
        `**<:banhammer:1473367388597780592> Bans:** ${b.stats.bans || 0}`,
        `**<:bots:1473368718120849500> Bot Configs:** ${b.stats.botConfigs || 0}`,
        `**<:Chat:1473038936241864865> Messages:** ${b.includesMessages ? `${on} ${(b.stats.messages || 0).toLocaleString()} backed up` : `${off} Not included`}`
    ];

    if (b.options) {
        lines.push(`\n-# **Included:** ${['roles','channels','emojis','stickers','messages','bans','settings','botConfig'].filter(k => b.options[k]).map(k => k === 'botConfig' ? 'Bot Config' : k.charAt(0).toUpperCase() + k.slice(1)).join(', ') || 'None'}`);
    }

    const ctr = new ContainerBuilder();
    ctr.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
    ctr.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    ctr.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sbkl:back:${sid}`).setEmoji('<:History:1473037847568318605>').setLabel('Back').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`sbkl:load:${sid}:${idx}`).setEmoji('<:Download:1473039486727225394>').setLabel('Restore').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`sbkl:del:${sid}:${idx}`).setEmoji('<:Trash:1473038090074591293>').setLabel('Delete').setStyle(ButtonStyle.Danger)
    ));
    return { ctr, sid };
}

async function collectLoop(sent, userId, backups, startPage) {
    let page = startPage;
    const collector = sent.createMessageComponentCollector({ time: TIMEOUT });

    collector.on('collect', async (i) => {
        if (i.user.id !== userId) return i.reply({ content: '<:Cancel:1473037949187657818> Only the command invoker can use this.', flags: MessageFlags.Ephemeral });
        const parts = i.customId.split(':');
        const action = parts[1];

        try {
            if (action === 'sel') {
                const idx = parseInt(i.values[0], 10);
                const { ctr } = buildDetail(backups[idx], idx, userId);
                return i.update({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
            }
            if (action === 'back') {
                const { ctr } = buildList(backups, page, userId);
                return i.update({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
            }
            if (action === 'prev') page = Math.max(0, page - 1);
            if (action === 'next') page++;
            if (action === 'refresh') {
                try { backups = (await listServerBackups(userId)).filter(b => b.createdBy === userId); } catch {}
            }
            if (action === 'new') {
                const tip = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Fire:1473038604812161218> Create Server Backup\n\nUse:\n> `server-backup-create` or `/server-backup-create`'))
                    .addActionRowComponents(new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`sbkl:back:${userId}_${Date.now().toString(36)}`).setEmoji('<:History:1473037847568318605>').setLabel('Back').setStyle(ButtonStyle.Secondary)
                    ));
                return i.update({ components: [tip], flags: MessageFlags.IsComponentsV2 });
            }
            if (action === 'del') {
                const idx = parseInt(parts[3], 10);
                const b = backups[idx];
                if (!b) { const { ctr } = buildList(backups, page, userId); return i.update({ components: [ctr], flags: MessageFlags.IsComponentsV2 }); }
                const cfm = new ContainerBuilder().setAccentColor(0xED4245)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Infotriangle:1473038460456800459> Confirm Delete\n\nPermanently delete backup **\`${b.id}\`** (${b.serverName})?`))
                    .addActionRowComponents(new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`sbkl:cfDel:${userId}_${Date.now().toString(36)}:${idx}`).setEmoji('<:Trash:1473038090074591293>').setLabel('Yes, Delete').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId(`sbkl:back:${userId}_${Date.now().toString(36)}`).setEmoji('<:Cancel:1473037949187657818>').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
                    ));
                return i.update({ components: [cfm], flags: MessageFlags.IsComponentsV2 });
            }
            if (action === 'cfDel') {
                const idx = parseInt(parts[3], 10);
                const b = backups[idx];
                if (!b) { const { ctr } = buildList(backups, page, userId); return i.update({ components: [ctr], flags: MessageFlags.IsComponentsV2 }); }
                const { deleteServerBackup } = require('../../utils/serverBackupManager');
                const res = await deleteServerBackup(userId, b.id);
                if (res.success) {
                    backups.splice(idx, 1);
                    const ok = new ContainerBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Checkedbox:1473038547165384804> Deleted\n\nBackup \`${b.id}\` removed.`))
                        .addActionRowComponents(new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`sbkl:back:${userId}_${Date.now().toString(36)}`).setEmoji('<:History:1473037847568318605>').setLabel('Back to List').setStyle(ButtonStyle.Secondary)
                        ));
                    return i.update({ components: [ok], flags: MessageFlags.IsComponentsV2 });
                }
                return i.update({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Failed\n\n${res.error}`)).addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`sbkl:back:${userId}_${Date.now().toString(36)}`).setEmoji('<:History:1473037847568318605>').setLabel('Back').setStyle(ButtonStyle.Secondary)))], flags: MessageFlags.IsComponentsV2 });
            }
            if (action === 'load') {
                const idx = parseInt(parts[3], 10);
                const b = backups[idx];
                if (!b) { const { ctr } = buildList(backups, page, userId); return i.update({ components: [ctr], flags: MessageFlags.IsComponentsV2 }); }
                const warn = new ContainerBuilder().setAccentColor(0xED4245)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Infotriangle:1473038460456800459> Server Restore\n\n**This is extremely destructive!**\n\n` +
                        `Restoring \`${b.id}\` will:\n> <:Trash:1473038090074591293> **Delete** all current roles, channels & categories\n> <:Download:1473039486727225394> **Recreate** them from backup\n> <:Infotriangle:1473038460456800459> **Cannot be undone**\n\n` +
                        `To proceed, use:\n> \`server-backup-load ${b.id}\``
                    ))
                    .addActionRowComponents(new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`sbkl:back:${userId}_${Date.now().toString(36)}`).setEmoji('<:History:1473037847568318605>').setLabel('Back').setStyle(ButtonStyle.Secondary)
                    ));
                return i.update({ components: [warn], flags: MessageFlags.IsComponentsV2 });
            }

            // Default: re-render list
            const { ctr } = buildList(backups, page, userId);
            return i.update({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('server-backup-list collector error:', err);
            if (!i.replied && !i.deferred) i.reply({ content: 'An error occurred.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    });

    collector.on('end', (_, reason) => {
        if (reason === 'time') {
            sent.edit({ components: [buildExpiredPanel('server-backup-list')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('server-backup-list')
        .setDescription('List all your server backups')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    prefix: 'server-backup-list',
    description: 'List all your server backups',
    usage: 'server-backup-list',
    category: 'backup',
    aliases: ['sbk-list', 'sbackup-list'],
    permissions: ['Administrator'],

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            let backups = (await listServerBackups(interaction.user.id)).filter(b => b.createdBy === interaction.user.id);
            const { ctr } = buildList(backups, 0, interaction.user.id);
            const sent = await interaction.editReply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
            await collectLoop(sent, interaction.user.id, backups, 0);
        } catch (err) {
            console.error('Error listing server backups:', err);
            await interaction.editReply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Error\n\n${err.message}`))], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async executePrefix(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Missing Permission\n\nYou need **Administrator** permission.'))], flags: MessageFlags.IsComponentsV2 });
        }
        try {
            let backups = (await listServerBackups(message.author.id)).filter(b => b.createdBy === message.author.id);
            const { ctr } = buildList(backups, 0, message.author.id);
            const sent = await message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
            await collectLoop(sent, message.author.id, backups, 0);
        } catch (err) {
            console.error('Error listing server backups:', err);
            await message.reply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Error\n\n${err.message}`))], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
