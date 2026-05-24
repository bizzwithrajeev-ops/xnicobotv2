'use strict';

/**
 * Join-to-Create Setup
 * ───────────────────────────────────────────────────────────────────
 * Admin command for the J2C system. Free guilds get exactly one
 * interface; premium guilds can run up to MAX_INTERFACES_PREMIUM with
 * different naming, role gating, max-users, etc.
 *
 * Module is **not** marked `premiumOnly` because free guilds still
 * need to enable a single interface. Multi-interface and template
 * features check premium at the action level and surface
 * `buildPremiumGate(...)` when blocked.
 */

const {
    SlashCommandBuilder, PermissionFlagsBits, ChannelType,
    ContainerBuilder, TextDisplayBuilder, MessageFlags,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    SeparatorBuilder, SeparatorSpacingSize,
    ChannelSelectMenuBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

const {
    buildSuccessResponse, buildErrorResponse, buildPermissionDenied,
    buildPremiumGate, BRANDING
} = require('../../utils/responseBuilder');
const { registerPanel, updatePanel } = require('../../utils/panelRegistry');
const mgr = require('../../utils/join2createManager');

/* ═══════════════════════════════════════════════════════════════════
   CONTROL PANEL (rendered in the public interface channel)
   ═══════════════════════════════════════════════════════════════════ */

function buildControlPanel() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('j2c_rename').setEmoji('<:Editalt:1473038138577256670>').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('j2c_limit').setEmoji('<:User:1473038971398520977>').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('j2c_bitrate').setEmoji('<:Volumeup:1473039290136002844>').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('j2c_invite').setEmoji('<:Attach:1473037923979886694>').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('j2c_region').setEmoji('<:rocket:1479780552276967465>').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('j2c_lock').setEmoji('<:Lock:1473038513749491773>').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('j2c_unlock').setEmoji('<:Unlock:1473038516639236269>').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('j2c_hide').setEmoji('<:Eyeclosed:1473038425085972521>').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('j2c_unhide').setEmoji('<:Eye:1473038435056095242>').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('j2c_info').setEmoji('<:Document:1473039496995143731>').setStyle(ButtonStyle.Secondary)
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('j2c_kick').setEmoji('<:dnd:1485248263857639424>').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('j2c_block').setEmoji('<:Commentblock:1473370739351490794>').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('j2c_unblock').setEmoji('<:Checkedbox:1473038547165384804>').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('j2c_permit').setEmoji('<:Userplus:1473038912212435086>').setStyle(ButtonStyle.Success)
    );
    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('j2c_trust').setEmoji('<:trust:1479780674532671673>').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('j2c_untrust').setEmoji('<:untrust:1479780596971737149>').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('j2c_claim').setEmoji('<:Crown:1506010837368963142>').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('j2c_transfer').setEmoji('<:transfer:1479780506718437396>').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('j2c_delete').setEmoji('<:Trash:1473038090074591293>').setStyle(ButtonStyle.Danger)
    );

    const header = `## <:Volumeup:1473039290136002844>  Voice Channel Controls`;
    const intro  = `-# Owner-only · Hover any button for its action`;
    const legend = [
        `<:Settings:1473037894703779851> **Channel** — Rename · Limit · Bitrate · Invite · Region`,
        `<:Key:1473038690606649375> **Privacy** — Lock · Unlock · Hide · Unhide · Info`,
        `<:User:1473038971398520977> **Members** — Kick · Block · Unblock · Permit`,
        `<:Crown:1506010837368963142> **Ownership** — Trust · Untrust · Claim · Transfer · Delete`
    ].join('\n');

    return new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${header}\n${intro}`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(legend))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(row1, row2, row3, row4)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
}

/* ═══════════════════════════════════════════════════════════════════
   ADMIN DASHBOARD
   ═══════════════════════════════════════════════════════════════════ */

function buildAdminDashboard(guild, requesterUserId) {
    const cfg  = mgr.getGuildConfig(guild.id);
    const tier = mgr.getGuildTier(guild.id, requesterUserId);
    const max  = mgr.maxInterfacesFor(tier);
    const ifaces = mgr.listInterfaces(guild.id);
    const enabled = ifaces.filter(i => i.enabled !== false);
    const isPremium = tier === 'premium';

    let header = `# <:Volumeup:1473039290136002844> Join-to-Create — Setup\n`;
    header += `-# ${isPremium ? '<:Crown:1506010837368963142> **Premium Server**' : '<:Star:1473038501766369300> **Free Server**'}`;
    header += `  ·  Interfaces: \`${enabled.length}/${max}\``;
    header += isPremium ? '' : `  ·  [Upgrade for ${mgr.MAX_INTERFACES_PREMIUM} interfaces]`;
    header += `\n`;

    let body;
    if (ifaces.length === 0) {
        body = [
            `### <:Infotriangle:1473038460456800459> No interfaces yet`,
            `> Click **+ New Interface** below to set up your first Join-to-Create channel.`,
            ``,
            `### <:Lightbulbalt:1473038470787240009> What you get`,
            `> ${isPremium ? '<:Crown:1506010837368963142> Up to ' + mgr.MAX_INTERFACES_PREMIUM + ' interfaces with custom names, role gating, and per-template settings.' : `Free servers get **${mgr.MAX_INTERFACES_FREE} interface**. Upgrade unlocks **${mgr.MAX_INTERFACES_PREMIUM}** + role gating + custom templates.`}`
        ].join('\n');
    } else {
        body = `### <:Bookopen:1473038576391557130> Interfaces\n`;
        for (const iface of ifaces) {
            const status = iface.enabled === false
                ? '<:Toggleoff:1473038582813032590>'
                : '<:Toggleon:1473038585501581312>';
            const trigger = iface.triggerChannelId ? `<#${iface.triggerChannelId}>` : '`Not set`';
            body += `${status} ${iface.emoji} **${iface.name}** — ${trigger}\n`;
            body += `-# Limit: \`${iface.maxUsers || '∞'}\`  ·  Bitrate: \`${iface.bitrate}kbps\`  ·  Visibility: \`${iface.visibility}\`  ·  Auto-delete: \`${iface.autoDelete ? 'On' : 'Off'}\`\n`;
        }
    }

    const container = new ContainerBuilder()
        .setAccentColor(isPremium ? 0xF1C40F : 0x5865F2)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(header))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(body));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    // Interface picker (when there's at least one)
    if (ifaces.length > 0) {
        const opts = ifaces.slice(0, 25).map(i => ({
            label: i.name.slice(0, 100),
            description: (i.triggerChannelId ? `Trigger: #${i.triggerChannelId.slice(-6)}` : 'No trigger set').slice(0, 100),
            value: i.id
        }));
        container.addActionRowComponents(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('j2cset_pick')
                .setPlaceholder('Edit an interface…')
                .addOptions(opts)
        ));
    }

    // Action row
    const newDisabled = enabled.length >= max;
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('j2cset_new')
            .setLabel(newDisabled ? `+ New Interface (${isPremium ? 'cap reached' : 'premium only'})` : '+ New Interface')
            .setStyle(newDisabled ? ButtonStyle.Secondary : ButtonStyle.Success)
            .setEmoji('<:Add:1473038100862337035>')
            .setDisabled(newDisabled),
        new ButtonBuilder()
            .setCustomId('j2cset_refresh')
            .setLabel('Refresh')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:History:1473037847568318605>')
    );

    container.addActionRowComponents(row1);
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

    return container;
}

function buildInterfaceEditor(guild, iface, requesterUserId) {
    const tier = mgr.getGuildTier(guild.id, requesterUserId);
    const isPremium = tier === 'premium';

    let body = `# ${iface.emoji} ${iface.name}\n`;
    body += `-# Interface ID \`${iface.id}\`\n\n`;
    body += `### <:Settings:1473037894703779851> Trigger\n`;
    body += `> ${iface.triggerChannelId ? `<#${iface.triggerChannelId}>` : '`Not set`'}\n\n`;
    body += `### <:Document:1473039496995143731> Behavior\n`;
    body += `> Limit: \`${iface.maxUsers || '∞'}\`  ·  Bitrate: \`${iface.bitrate}kbps\`\n`;
    body += `> Naming: \`${iface.namingTemplate}\`\n`;
    body += `> Visibility: \`${iface.visibility}\`  ·  Auto-delete: \`${iface.autoDelete ? 'On' : 'Off'}\`\n`;
    if (iface.allowedRoles?.length) body += `> Allowed roles: ${iface.allowedRoles.map(r => `<@&${r}>`).join(', ')}\n`;
    if (iface.deniedRoles?.length)  body += `> Denied roles:  ${iface.deniedRoles.map(r => `<@&${r}>`).join(', ')}\n`;

    const container = new ContainerBuilder()
        .setAccentColor(iface.enabled === false ? 0xED4245 : (isPremium ? 0xF1C40F : 0x5865F2))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`j2cset_trigger_${iface.id}`).setLabel('Set Trigger').setStyle(ButtonStyle.Primary).setEmoji('<:Add:1473038100862337035>'),
        new ButtonBuilder().setCustomId(`j2cset_edit_${iface.id}`).setLabel('Edit Details').setStyle(ButtonStyle.Primary).setEmoji('<:Editalt:1473038138577256670>'),
        new ButtonBuilder().setCustomId(`j2cset_panel_${iface.id}`).setLabel('Send Control Panel').setStyle(ButtonStyle.Success).setEmoji('<:Document:1473039496995143731>').setDisabled(!iface.triggerChannelId),
        new ButtonBuilder().setCustomId(`j2cset_toggle_${iface.id}`).setLabel(iface.enabled === false ? 'Enable' : 'Disable').setStyle(iface.enabled === false ? ButtonStyle.Success : ButtonStyle.Danger).setEmoji(iface.enabled === false ? '<:Toggleon:1473038585501581312>' : '<:Toggleoff:1473038582813032590>')
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`j2cset_roles_${iface.id}`).setLabel(isPremium ? 'Allowed Roles' : 'Allowed Roles (Premium)').setStyle(ButtonStyle.Secondary).setEmoji('<:Crown:1506010837368963142>').setDisabled(!isPremium),
        new ButtonBuilder().setCustomId(`j2cset_visibility_${iface.id}`).setLabel(iface.visibility === 'private' ? 'Make Public' : 'Make Private').setStyle(ButtonStyle.Secondary).setEmoji(iface.visibility === 'private' ? '<:Eye:1473038435056095242>' : '<:Eyeclosed:1473038425085972521>'),
        new ButtonBuilder().setCustomId(`j2cset_back`).setLabel('Back').setStyle(ButtonStyle.Secondary).setEmoji('<:Caretright:1473038207221502106>'),
        new ButtonBuilder().setCustomId(`j2cset_delete_${iface.id}`).setLabel('Delete').setStyle(ButtonStyle.Danger).setEmoji('<:Trash:1473038090074591293>')
    );

    container.addActionRowComponents(row1, row2);
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
    return container;
}

/* ═══════════════════════════════════════════════════════════════════
   ENTRY POINTS
   ═══════════════════════════════════════════════════════════════════ */

async function showDashboard(replyTarget, guild, requesterUserId) {
    const container = buildAdminDashboard(guild, requesterUserId);
    const sent = await replyTarget.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    let msg = sent;
    if (typeof replyTarget.fetchReply === 'function') {
        try { msg = await replyTarget.fetchReply(); } catch {}
    }
    if (msg?.id && msg?.channel?.id) {
        registerPanel(guild.id, 'join2create-setup', msg.channel.id, msg.id);
    }
    return msg;
}

async function refreshDashboard(client, guild, requesterUserId) {
    return updatePanel(client, guild.id, 'join2create-setup', async (m) => {
        await m.edit({ components: [buildAdminDashboard(guild, requesterUserId)] });
    }).catch(() => null);
}

/* ═══════════════════════════════════════════════════════════════════
   COMMAND
   ═══════════════════════════════════════════════════════════════════ */

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join2create-setup')
        .setDescription('Setup join-to-create voice channels (free + premium)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(s => s.setName('panel').setDescription('Open the admin dashboard'))
        .addSubcommand(s => s.setName('quick-enable').setDescription('Quick-enable: creates one default interface like the legacy command'))
        .addSubcommand(s => s.setName('disable').setDescription('Disable + remove every interface'))
        .addSubcommand(s => s.setName('status').setDescription('Show a quick status summary')),

    name: 'join2create-setup',
    prefix: 'join2create-setup',
    description: 'Setup join-to-create voice channels (premium-aware)',
    usage: 'join2create-setup [panel|quick-enable|disable|status]',
    category: 'voice',
    aliases: ['j2c', 'j2csetup'],

    // Re-export panel builder so the runtime handler can re-render it
    buildControlPanel,

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'quick-enable') return quickEnable(interaction);
        if (sub === 'disable')      return disableAll(interaction);
        if (sub === 'status')       return statusSummary(interaction);
        return showDashboard(interaction, interaction.guild, interaction.user.id);
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({ components: [buildPermissionDenied('Administrator')], flags: MessageFlags.IsComponentsV2 });
        }
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'enable' || sub === 'quick-enable') return quickEnable(message);
        if (sub === 'disable')                          return disableAll(message);
        if (sub === 'status')                           return statusSummary(message);
        return showDashboard(message, message.guild, message.author.id);
    },

    async handleInteraction(interaction) {
        if (!interaction.guild || !interaction.member) return false;
        const id = interaction.customId;
        if (!id.startsWith('j2cset_')) return false;

        // Admin guard for every dashboard interaction
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ components: [buildPermissionDenied('Administrator')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            return true;
        }

        // ── Refresh / Back ─────────────────────────────────────────
        if (id === 'j2cset_refresh' || id === 'j2cset_back') {
            await interaction.update({ components: [buildAdminDashboard(interaction.guild, interaction.user.id)], flags: MessageFlags.IsComponentsV2 });
            return true;
        }

        // ── Pick interface from select ─────────────────────────────
        if (id === 'j2cset_pick' && interaction.isStringSelectMenu()) {
            const ifaceId = interaction.values[0];
            const cfg = mgr.getGuildConfig(interaction.guild.id);
            const iface = cfg.interfaces[ifaceId];
            if (!iface) {
                await interaction.update({ components: [buildErrorResponse('Not Found', 'That interface no longer exists.')], flags: MessageFlags.IsComponentsV2 });
                return true;
            }
            await interaction.update({ components: [buildInterfaceEditor(interaction.guild, iface, interaction.user.id)], flags: MessageFlags.IsComponentsV2 });
            return true;
        }

        // ── New interface ──────────────────────────────────────────
        if (id === 'j2cset_new') {
            const gateCheck = mgr.canAddInterface(interaction.guild.id, interaction.user.id);
            if (!gateCheck.ok) {
                if (gateCheck.tier !== 'premium') {
                    await interaction.reply({ components: [buildPremiumGate('multiple Join-to-Create interfaces')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                    return true;
                }
                await interaction.reply({ components: [buildErrorResponse('Cap Reached', gateCheck.reason)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                return true;
            }
            return openCreateModal(interaction);
        }

        // ── Per-interface buttons (id format: j2cset_<action>_<ifaceId>) ──
        const segs = id.split('_');
        if (segs.length >= 3) {
            const action = segs[1];
            const ifaceId = segs.slice(2).join('_');
            const cfg = mgr.getGuildConfig(interaction.guild.id);
            const iface = cfg.interfaces[ifaceId];
            if (!iface) {
                await interaction.reply({ components: [buildErrorResponse('Not Found', 'That interface no longer exists.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                return true;
            }

            if (action === 'trigger') return openTriggerSelect(interaction, iface);
            if (action === 'edit')    return openEditModal(interaction, iface);
            if (action === 'panel')   return sendControlPanel(interaction, iface);
            if (action === 'toggle')  return toggleInterface(interaction, iface);
            if (action === 'roles')   return openRolesSelect(interaction, iface);
            if (action === 'visibility') return toggleVisibility(interaction, iface);
            if (action === 'delete')  return deleteIfaceConfirm(interaction, iface);
            if (action === 'deleteyes') return doDeleteIface(interaction, iface);
        }

        // ── Channel select results ─────────────────────────────────
        if (interaction.isChannelSelectMenu?.() && id.startsWith('j2cset_chan_')) {
            return saveTrigger(interaction, id.replace('j2cset_chan_', ''));
        }
        if (interaction.isRoleSelectMenu?.() && id.startsWith('j2cset_roles_select_')) {
            return saveAllowedRoles(interaction, id.replace('j2cset_roles_select_', ''));
        }

        return false;
    },

    async handleModalSubmit(interaction) {
        if (!interaction.isModalSubmit?.()) return false;
        if (!interaction.customId.startsWith('j2cset_modal_')) return false;
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ components: [buildPermissionDenied('Administrator')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            return true;
        }

        const id = interaction.customId;

        if (id === 'j2cset_modal_create') {
            const name        = interaction.fields.getTextInputValue('name').trim();
            const slug        = interaction.fields.getTextInputValue('slug').trim().toLowerCase();
            const naming      = interaction.fields.getTextInputValue('naming').trim();
            const limit       = interaction.fields.getTextInputValue('limit').trim();
            const bitrate     = interaction.fields.getTextInputValue('bitrate').trim();

            const result = mgr.createInterface(interaction.guild.id, interaction.user.id, {
                name, slug, namingTemplate: naming,
                maxUsers: limit, bitrate
            });
            if (!result.ok) {
                if (result.tier !== 'premium') {
                    await interaction.reply({ components: [buildPremiumGate('multiple Join-to-Create interfaces')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ components: [buildErrorResponse('Could Not Create', result.error)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                }
                return true;
            }
            await interaction.reply({ components: [buildInterfaceEditor(interaction.guild, result.iface, interaction.user.id)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            refreshDashboard(interaction.client, interaction.guild, interaction.user.id);
            return true;
        }

        if (id.startsWith('j2cset_modal_edit_')) {
            const ifaceId = id.replace('j2cset_modal_edit_', '');
            const partial = {
                name:           interaction.fields.getTextInputValue('name').trim(),
                slug:           interaction.fields.getTextInputValue('slug').trim().toLowerCase(),
                namingTemplate: interaction.fields.getTextInputValue('naming').trim(),
                maxUsers:       interaction.fields.getTextInputValue('limit').trim(),
                bitrate:        interaction.fields.getTextInputValue('bitrate').trim()
            };
            const r = mgr.updateInterface(interaction.guild.id, ifaceId, partial);
            if (!r.ok) {
                await interaction.reply({ components: [buildErrorResponse('Update Failed', r.error)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                return true;
            }
            await interaction.reply({ components: [buildInterfaceEditor(interaction.guild, r.iface, interaction.user.id)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            refreshDashboard(interaction.client, interaction.guild, interaction.user.id);
            return true;
        }

        return false;
    }
};

/* ═══════════════════════════════════════════════════════════════════
   ACTION HELPERS
   ═══════════════════════════════════════════════════════════════════ */

async function quickEnable(target) {
    const guild = target.guild;
    const requesterId = target.user?.id || target.author?.id;

    const gateCheck = mgr.canAddInterface(guild.id, requesterId);
    if (!gateCheck.ok) {
        // Free guild already has one — show the dashboard instead.
        if (gateCheck.tier !== 'premium') {
            return showDashboard(target, guild, requesterId);
        }
        const reply = { components: [buildErrorResponse('Cap Reached', gateCheck.reason)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
        return target.reply ? target.reply(reply) : null;
    }

    let triggerChannel, interfaceChannel;
    try {
        triggerChannel = await guild.channels.create({
            name: 'Join to Create',
            type: ChannelType.GuildVoice,
            position: 0
        });
        interfaceChannel = await guild.channels.create({
            name: 'voice-controls',
            type: ChannelType.GuildText,
            topic: 'Use these controls inside the temp voice channel you own.',
            position: 0
        });
        const controlMsg = await interfaceChannel.send({
            components: [buildControlPanel()],
            flags: MessageFlags.IsComponentsV2
        });

        const result = mgr.createInterface(guild.id, requesterId, {
            name: 'Default Room',
            slug: 'default',
            triggerChannelId: triggerChannel.id,
            interfaceChannelId: interfaceChannel.id,
            controlPanelMessageId: controlMsg.id,
            namingTemplate: "{user}'s Channel"
        });
        if (!result.ok) throw new Error(result.error);
    } catch (e) {
        try { triggerChannel?.delete(); } catch {}
        try { interfaceChannel?.delete(); } catch {}
        const reply = { components: [buildErrorResponse('Setup Failed', e.message || 'Failed to create channels.')], flags: MessageFlags.IsComponentsV2 };
        return target.reply ? target.reply(reply) : null;
    }

    const reply = {
        components: [buildSuccessResponse(
            'Join-to-Create Enabled',
            `**Trigger:** ${triggerChannel}\n**Controls:** ${interfaceChannel}\n\nMembers join the trigger channel and a private temp VC is created automatically. Open \`/join2create-setup panel\` for the full dashboard.`
        )],
        flags: MessageFlags.IsComponentsV2
    };
    return target.reply ? target.reply(reply) : null;
}

async function disableAll(target) {
    const guild = target.guild;
    const cfg = mgr.getGuildConfig(guild.id);
    const ifaces = Object.values(cfg.interfaces || {});

    for (const iface of ifaces) {
        if (iface.triggerChannelId) {
            const ch = guild.channels.cache.get(iface.triggerChannelId);
            if (ch) try { await ch.delete('J2C: disabled'); } catch {}
        }
        if (iface.interfaceChannelId) {
            const ch = guild.channels.cache.get(iface.interfaceChannelId);
            if (ch) try { await ch.delete('J2C: disabled'); } catch {}
        }
    }
    const all = require('../../utils/jsonStore').read('join2create') || {};
    delete all[guild.id];
    require('../../utils/jsonStore').write('join2create', all);

    const reply = {
        components: [buildSuccessResponse('System Disabled', `${ifaces.length} interface${ifaces.length === 1 ? '' : 's'} removed and channels deleted.`)],
        flags: MessageFlags.IsComponentsV2
    };
    return target.reply ? target.reply(reply) : null;
}

async function statusSummary(target) {
    const guild = target.guild;
    const requesterId = target.user?.id || target.author?.id;
    const tier = mgr.getGuildTier(guild.id, requesterId);
    const ifaces = mgr.listInterfaces(guild.id);
    const active = Object.keys(mgr.getGuildConfig(guild.id).activeChannels || {}).length;

    const lines = [
        `# <:Volumeup:1473039290136002844> Join-to-Create Status`,
        `-# ${tier === 'premium' ? '<:Crown:1506010837368963142> Premium server' : '<:Star:1473038501766369300> Free server'}`,
        ``,
        `**Interfaces:** \`${ifaces.length}/${mgr.maxInterfacesFor(tier)}\``,
        `**Active temp channels:** \`${active}\``
    ];
    if (ifaces.length > 0) {
        lines.push(``, `### Interfaces`);
        for (const i of ifaces) {
            const trigger = i.triggerChannelId ? `<#${i.triggerChannelId}>` : '`Not set`';
            lines.push(`> ${i.enabled === false ? '<:Toggleoff:1473038582813032590>' : '<:Toggleon:1473038585501581312>'} ${i.emoji} **${i.name}** — ${trigger}`);
        }
    }

    const container = new ContainerBuilder()
        .setAccentColor(tier === 'premium' ? 0xF1C40F : 0x5865F2)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

    const reply = { components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
    return target.reply ? target.reply(reply) : null;
}

async function openCreateModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('j2cset_modal_create')
        .setTitle('New J2C Interface')
        .addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder()
                .setCustomId('name').setLabel('Interface Name').setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g. Duo Rooms').setMaxLength(50).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder()
                .setCustomId('slug').setLabel('Slug (lowercase, used in template)').setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g. duo').setMaxLength(20).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder()
                .setCustomId('naming').setLabel('Naming Template').setStyle(TextInputStyle.Short)
                .setPlaceholder("{user}'s Duo Room").setMaxLength(80).setValue("{user}'s {kind} Room").setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder()
                .setCustomId('limit').setLabel('Default User Limit (0 = unlimited)').setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g. 2 for Duo, 4 for Squad').setMaxLength(2).setValue('0').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder()
                .setCustomId('bitrate').setLabel('Bitrate (kbps, 8-384)').setStyle(TextInputStyle.Short)
                .setPlaceholder('96').setMaxLength(3).setValue('96').setRequired(true))
        );
    return interaction.showModal(modal);
}

async function openEditModal(interaction, iface) {
    const modal = new ModalBuilder()
        .setCustomId(`j2cset_modal_edit_${iface.id}`)
        .setTitle(`Edit ${iface.name}`)
        .addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder()
                .setCustomId('name').setLabel('Interface Name').setStyle(TextInputStyle.Short)
                .setValue(iface.name).setMaxLength(50).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder()
                .setCustomId('slug').setLabel('Slug').setStyle(TextInputStyle.Short)
                .setValue(iface.slug).setMaxLength(20).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder()
                .setCustomId('naming').setLabel('Naming Template').setStyle(TextInputStyle.Short)
                .setValue(iface.namingTemplate).setMaxLength(80).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder()
                .setCustomId('limit').setLabel('User Limit (0-99, 0 = unlimited)').setStyle(TextInputStyle.Short)
                .setValue(String(iface.maxUsers)).setMaxLength(2).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder()
                .setCustomId('bitrate').setLabel('Bitrate (8-384)').setStyle(TextInputStyle.Short)
                .setValue(String(iface.bitrate)).setMaxLength(3).setRequired(true))
        );
    return interaction.showModal(modal);
}

async function openTriggerSelect(interaction, iface) {
    const c = new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### <:Volumeup:1473039290136002844> Pick Trigger Voice Channel\n-# Members who join this VC will spawn a new temp channel.`
        ))
        .addActionRowComponents(new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId(`j2cset_chan_${iface.id}`)
                .setPlaceholder('Select a voice channel…')
                .setChannelTypes(ChannelType.GuildVoice)
        ));
    return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

async function saveTrigger(interaction, ifaceId) {
    const channelId = interaction.values[0];
    const r = mgr.updateInterface(interaction.guild.id, ifaceId, { triggerChannelId: channelId });
    if (!r.ok) {
        await interaction.update({ components: [buildErrorResponse('Update Failed', r.error)], flags: MessageFlags.IsComponentsV2 });
        return true;
    }
    await interaction.update({
        components: [buildSuccessResponse('Trigger Saved', `New trigger: <#${channelId}>`)],
        flags: MessageFlags.IsComponentsV2
    });
    refreshDashboard(interaction.client, interaction.guild, interaction.user.id);
    return true;
}

async function openRolesSelect(interaction, iface) {
    const tier = mgr.getGuildTier(interaction.guild.id, interaction.user.id);
    if (tier !== 'premium') {
        await interaction.reply({ components: [buildPremiumGate('role gating')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        return true;
    }
    const c = new ContainerBuilder()
        .setAccentColor(0xF1C40F)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### <:Crown:1506010837368963142> Allowed Roles (Premium)\n-# Only members with one of the selected roles can spawn a channel from this trigger.\n-# Pick **none** to allow everyone.`
        ))
        .addActionRowComponents(new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
                .setCustomId(`j2cset_roles_select_${iface.id}`)
                .setPlaceholder('Select roles…')
                .setMinValues(0)
                .setMaxValues(10)
        ));
    return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

async function saveAllowedRoles(interaction, ifaceId) {
    const roleIds = interaction.values || [];
    const r = mgr.updateInterface(interaction.guild.id, ifaceId, { allowedRoles: roleIds });
    if (!r.ok) {
        await interaction.update({ components: [buildErrorResponse('Update Failed', r.error)], flags: MessageFlags.IsComponentsV2 });
        return true;
    }
    await interaction.update({
        components: [buildSuccessResponse('Allowed Roles Saved', roleIds.length ? `Restricted to: ${roleIds.map(id => `<@&${id}>`).join(', ')}` : 'Open to everyone.')],
        flags: MessageFlags.IsComponentsV2
    });
    refreshDashboard(interaction.client, interaction.guild, interaction.user.id);
    return true;
}

async function toggleVisibility(interaction, iface) {
    const next = iface.visibility === 'private' ? 'public' : 'private';
    mgr.updateInterface(interaction.guild.id, iface.id, { visibility: next });
    const fresh = mgr.getGuildConfig(interaction.guild.id).interfaces[iface.id];
    await interaction.update({ components: [buildInterfaceEditor(interaction.guild, fresh, interaction.user.id)], flags: MessageFlags.IsComponentsV2 });
    return true;
}

async function toggleInterface(interaction, iface) {
    const next = !(iface.enabled === false);
    mgr.updateInterface(interaction.guild.id, iface.id, { enabled: !next });
    const fresh = mgr.getGuildConfig(interaction.guild.id).interfaces[iface.id];
    await interaction.update({ components: [buildInterfaceEditor(interaction.guild, fresh, interaction.user.id)], flags: MessageFlags.IsComponentsV2 });
    refreshDashboard(interaction.client, interaction.guild, interaction.user.id);
    return true;
}

async function sendControlPanel(interaction, iface) {
    if (!iface.triggerChannelId) {
        await interaction.reply({ components: [buildErrorResponse('No Trigger', 'Set a trigger channel first.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        return true;
    }
    try {
        const sent = await interaction.channel.send({
            components: [buildControlPanel()],
            flags: MessageFlags.IsComponentsV2
        });
        mgr.updateInterface(interaction.guild.id, iface.id, {
            interfaceChannelId: interaction.channel.id,
            controlPanelMessageId: sent.id
        });
        await interaction.reply({ components: [buildSuccessResponse('Control Panel Sent', `Posted in ${interaction.channel}.`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    } catch (e) {
        await interaction.reply({ components: [buildErrorResponse('Send Failed', e.message || 'Could not send the panel here.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
    return true;
}

async function deleteIfaceConfirm(interaction, iface) {
    const c = new ContainerBuilder()
        .setAccentColor(0xED4245)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### <:Infotriangle:1473038460456800459> Delete \`${iface.name}\`?\n-# This removes the interface configuration. Existing temp channels stay until empty.`
        ))
        .addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`j2cset_deleteyes_${iface.id}`).setLabel('Confirm Delete').setStyle(ButtonStyle.Danger).setEmoji('<:Trash:1473038090074591293>'),
            new ButtonBuilder().setCustomId('j2cset_back').setLabel('Cancel').setStyle(ButtonStyle.Secondary).setEmoji('<:Cancel:1473037949187657818>')
        ));
    return interaction.update({ components: [c], flags: MessageFlags.IsComponentsV2 });
}

async function doDeleteIface(interaction, iface) {
    mgr.deleteInterface(interaction.guild.id, iface.id);
    await interaction.update({ components: [buildAdminDashboard(interaction.guild, interaction.user.id)], flags: MessageFlags.IsComponentsV2 });
    refreshDashboard(interaction.client, interaction.guild, interaction.user.id);
    return true;
}
