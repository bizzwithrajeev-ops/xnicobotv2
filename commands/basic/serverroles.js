'use strict';

const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder,
    ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags
} = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');
const { paginate, setupPaginationCollector } = require('../../utils/pagination');

function buildOverview(guild) {
    const allRoles = [...guild.roles.cache.values()]
        .filter(r => r.id !== guild.id)
        .sort((a, b) => b.position - a.position);

    const managed = allRoles.filter(r => r.managed).length;
    const hoisted = allRoles.filter(r => r.hoist).length;
    const mentionable = allRoles.filter(r => r.mentionable).length;
    const adminCount = allRoles.filter(r => r.permissions.has('Administrator')).length;

    const top = allRoles.slice(0, 12).map(r => `${r}`).join('  ');

    const headerSection = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# <:Bookopen:1473038576391557130> Roles in ${guild.name}\n` +
                `-# Quick overview — use the list view for the full directory`
            )
        );
    const iconUrl = guild.iconURL({ size: 256 });
    if (iconUrl) headerSection.setThumbnailAccessory(new ThumbnailBuilder({ media: { url: iconUrl } }));

    const meta =
        `### <:Invoice:1473039492217835550> Server Snapshot\n` +
        `<:Caretright:1473038207221502106> **Total roles:** \`${allRoles.length}\`\n` +
        `<:Caretright:1473038207221502106> **Highest role:** ${guild.roles.highest}\n` +
        `<:Caretright:1473038207221502106> **Hoisted:** \`${hoisted}\` • **Mentionable:** \`${mentionable}\`\n` +
        `<:Caretright:1473038207221502106> **Managed (bots/integrations):** \`${managed}\`\n` +
        `<:Caretright:1473038207221502106> **Administrator-tier:** \`${adminCount}\``;

    const previewLabel = allRoles.length <= 12 ? 'All Roles' : `Top ${Math.min(12, allRoles.length)} Roles`;
    const preview =
        `### <:Award:1473038391632203887> ${previewLabel}\n` +
        (top || '*No custom roles yet.*');

    return new ContainerBuilder()
        .addSectionComponents(headerSection)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(meta))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(preview))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `-# Run \`serverroles list\` to browse every role with pagination`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
}

function buildList(guild) {
    const allRoles = [...guild.roles.cache.values()]
        .filter(r => r.id !== guild.id)
        .sort((a, b) => b.position - a.position);

    if (allRoles.length === 0) return null;

    const lines = allRoles.map((r, i) => {
        const flags = [];
        if (r.permissions.has('Administrator')) flags.push('<:Crown:1506010837368963142>');
        if (r.hoist) flags.push('<:Pin:1473038806612447500>');
        if (r.managed) flags.push('<:bots:1473368718120849500>');
        const tag = flags.length > 0 ? `${flags.join('')} ` : '';
        return `\`${String(i + 1).padStart(3, '0')}.\` ${tag}${r} — \`${r.members.size}\` member${r.members.size === 1 ? '' : 's'}`;
    });

    return paginate({
        header:
            `# <:Bookopen:1473038576391557130> All Roles in ${guild.name}\n` +
            `-# **${allRoles.length}** roles • <:Crown:1506010837368963142> admin • <:Pin:1473038806612447500> hoisted • <:bots:1473368718120849500> managed`,
        lines,
        perPage: 15,
        accentColor: 0xCAD7E6 });
}

module.exports = {
    prefix: 'serverroles',
    description: 'View an overview of server roles or browse the full list',
    usage: 'serverroles [list]',
    category: 'basic',
    aliases: ['rolelist', 'roles', 'allroles'],
    data: new SlashCommandBuilder()
        .setName('serverroles')
        .setDescription('View an overview of server roles or browse the full list')
        .addBooleanOption(opt => opt.setName('list').setDescription('Browse all roles with pagination').setRequired(false)),

    async execute(interaction) {
        try {
            if (interaction.options.getBoolean('list')) {
                const result = buildList(interaction.guild);
                if (!result) {
                    const container = buildErrorResponse('No Roles', 'This server has no custom roles yet.');
                    return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                }
                const reply = await interaction.reply({ ...result, fetchReply: true });
                setupPaginationCollector(reply, result._pageData, interaction.user.id);
                return;
            }
            await interaction.reply({ components: [buildOverview(interaction.guild)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[SERVERROLES] Slash error:', error);
            const container = buildErrorResponse('Failed', 'Could not load roles.', error.message);
            const fn = interaction.replied || interaction.deferred ? interaction.editReply : interaction.reply;
            await fn.call(interaction, { components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    },

    async executePrefix(message, args) {
        try {
            const wantList = (args || []).some(a => /^(list|all|full)$/i.test(a));
            if (wantList) {
                const result = buildList(message.guild);
                if (!result) {
                    const container = buildErrorResponse('No Roles', 'This server has no custom roles yet.');
                    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                }
                const reply = await message.reply(result);
                setupPaginationCollector(reply, result._pageData, message.author.id);
                return;
            }
            await message.reply({ components: [buildOverview(message.guild)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[SERVERROLES] Prefix error:', error);
            const container = buildErrorResponse('Failed', 'Could not load roles.', error.message);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    } };
