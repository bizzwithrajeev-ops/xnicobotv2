'use strict';

/**
 * /birthday-setup
 * ────────────────
 * Admin-facing setup panel for the birthday system. Builds an interactive
 * Components V2 panel where staff can:
 *   • Pick the announcement channel
 *   • Pick an optional birthday role (granted on the user's day)
 *   • Choose ping mode (everyone, here, role, user, none)
 *   • Pick the message style (Simple / Embed / Components V2) and edit
 *     it through the shared message builder (utils/actionMessageBuilder)
 *   • Set the announcement hour (UTC)
 *   • Toggle the system on/off
 *   • Send the public "Set Your Birthday" panel into a channel
 *
 * Every setting change refreshes the original panel in-place so admins
 * always see the current state without spawning extra messages.
 */

const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    ChannelType,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder
} = require('discord.js');

const birthdayManager = require('../../utils/birthdayManager');
const messageBuilder = require('../../utils/actionMessageBuilder');

const SETUP_PREFIX = 'bdaysetup';
const BUILDER_PREFIX = 'bdaymsg';

// ── Helpers ────────────────────────────────────────────────────────────

function pingLabel(mode) {
    return ({
        everyone: '@everyone',
        here: '@here',
        role: 'Birthday role',
        user: 'User only',
        none: 'No ping'
    })[mode] || 'User only';
}

function typeLabel(t) {
    return ({
        simple: '💬 Simple',
        embed: '📝 Embed',
        components: '🎨 Components V2'
    })[t] || 'Embed';
}

function hourLabel(h) {
    const hh = Number.isInteger(h) ? h : 9;
    return `${String(hh).padStart(2, '0')}:00 UTC`;
}

function ensureManageGuild(interaction) {
    return interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
}

// ── Setup panel builder ────────────────────────────────────────────────

function buildSetupPanel(guild, opts = {}) {
    const cfg = birthdayManager.getGuildConfig(guild.id);
    const enabled = !!cfg.enabled;
    const notice = opts.notice;

    const channelTxt = cfg.channelId ? `<#${cfg.channelId}>` : '`Not set`';
    const roleTxt = cfg.roleId ? `<@&${cfg.roleId}>` : '`None`';
    const userCount = Object.keys(cfg.users || {}).length;
    const panelTxt = cfg.panel?.channelId
        ? `Posted in <#${cfg.panel.channelId}>`
        : '`Not posted yet`';

    // Components-V2 containers are capped at 10 child components, so we keep
    // header + body collapsed into a single text display + one separator
    // so the 5 interactive rows always fit (1 + 1 + 5 = 7 base components).
    const headerBlock =
        `# 🎂  Birthday System\n` +
        `-# Schedule birthday wishes for **${guild.name}**\n\n` +
        `### <:Settings:1473037894703779851> Configuration\n` +
        `**Status:** ${enabled
            ? '<:Toggleon:1473038585501581312> Enabled'
            : '<:Toggleoff:1473038582813032590> Disabled'}\n` +
        `**Announcement Channel:** ${channelTxt}\n` +
        `**Birthday Role:** ${roleTxt}\n` +
        `**Ping Mode:** \`${pingLabel(cfg.pingMode)}\`\n` +
        `**Send Hour:** \`${hourLabel(cfg.hour)}\`\n` +
        `**Message Style:** ${typeLabel(cfg.messageType)}\n\n` +
        `### <:User:1473038971398520977> Member Stats\n` +
        `**Saved Birthdays:** \`${userCount}\`\n` +
        `**Public Panel:** ${panelTxt}\n` +
        (notice ? `\n${notice}\n` : '') +
        `\n-# Members save their birthday with \`/birthday set\` or via the public panel.`;

    const container = new ContainerBuilder()
        .setAccentColor(enabled ? 0xFF6FA3 : 0x5865F2)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerBlock))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // Row 1 — Channel select (live, in-panel)
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId(`${SETUP_PREFIX}_channelpick`)
                .setPlaceholder(cfg.channelId ? 'Change announcement channel…' : 'Pick announcement channel…')
                .setMinValues(1)
                .setMaxValues(1)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
    );

    // Row 2 — Role select (live)
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
                .setCustomId(`${SETUP_PREFIX}_rolepick`)
                .setPlaceholder(cfg.roleId ? 'Change birthday role…' : 'Pick optional birthday role…')
                .setMinValues(0)
                .setMaxValues(1)
        )
    );

    // Row 3 — Ping / hour / style
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`${SETUP_PREFIX}_ping`)
                .setLabel(`Ping: ${pingLabel(cfg.pingMode)}`)
                .setEmoji('🔔')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`${SETUP_PREFIX}_hour`)
                .setLabel(`Hour: ${hourLabel(cfg.hour)}`)
                .setEmoji('🕒')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`${SETUP_PREFIX}_msgstyle`)
                .setLabel(`Style: ${(cfg.messageType || 'embed').replace(/^\w/, c => c.toUpperCase())}`)
                .setEmoji('<:Palette:1473039029476917461>')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`${SETUP_PREFIX}_clearrole`)
                .setLabel('Clear Role')
                .setEmoji('<:Trash:1473038090074591293>')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!cfg.roleId)
        )
    );

    // Row 4 — Edit / Preview / Test / Public Panel
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`${SETUP_PREFIX}_msgedit`)
                .setLabel('Edit Message')
                .setEmoji('<:Editalt:1473038138577256670>')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`${SETUP_PREFIX}_preview`)
                .setLabel('Preview')
                .setEmoji('<:Eye:1473038435056095242>')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`${SETUP_PREFIX}_test`)
                .setLabel('Test Send')
                .setEmoji('<:Fire:1473038604812161218>')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!cfg.channelId),
            new ButtonBuilder()
                .setCustomId(`${SETUP_PREFIX}_panel`)
                .setLabel('Send Public Panel')
                .setEmoji('<:Add:1473038100862337035>')
                .setStyle(ButtonStyle.Primary)
        )
    );

    // Row 5 — Toggle / reset / refresh
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`${SETUP_PREFIX}_toggle`)
                .setLabel(enabled ? 'Disable System' : 'Enable System')
                .setEmoji(enabled
                    ? '<:Toggleoff:1473038582813032590>'
                    : '<:Toggleon:1473038585501581312>')
                .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success)
                .setDisabled(!cfg.channelId),
            new ButtonBuilder()
                .setCustomId(`${SETUP_PREFIX}_refresh`)
                .setLabel('Refresh')
                .setEmoji('<:Refresh:1473037911581528165>')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`${SETUP_PREFIX}_reset`)
                .setLabel('Reset Settings')
                .setEmoji('<:Trash:1473038090074591293>')
                .setStyle(ButtonStyle.Danger)
        )
    );

    return container;
}

// ── Public "Set Your Birthday" panel ───────────────────────────────────

function buildPublicPanel(guild) {
    const container = new ContainerBuilder()
        .setAccentColor(0xFF6FA3)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 🎂  Birthday Setup\n` +
            `-# Save your birthday for **${guild.name}** and join the celebration list.`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### <:Lightbulbalt:1473038470787240009> How it works\n` +
            `> <:Caretright:1473038207221502106>  Click **Set Birthday** below\n` +
            `> <:Caretright:1473038207221502106>  Enter your birthday as \`DD-MM\` or \`DD-MM-YYYY\`\n` +
            `> <:Caretright:1473038207221502106>  We'll wish you in the announcement channel on your day\n\n` +
            `### <:Document:1473039496995143731> Privacy\n` +
            `Your birthday is stored only for this server and used solely to ` +
            `send you a wish on the day. You can clear it anytime with **Remove**.`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('bdaypanel_set')
                    .setLabel('Set Birthday')
                    .setEmoji('🎂')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('bdaypanel_view')
                    .setLabel('View Mine')
                    .setEmoji('<:Eye:1473038435056095242>')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('bdaypanel_remove')
                    .setLabel('Remove')
                    .setEmoji('<:Trash:1473038090074591293>')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('bdaypanel_upcoming')
                    .setLabel('Upcoming')
                    .setEmoji('📅')
                    .setStyle(ButtonStyle.Secondary)
            )
        );

    return container;
}

// ── Refresh helper ─────────────────────────────────────────────────────

async function refreshPanel(interaction, notice) {
    const panel = buildSetupPanel(interaction.guild, { notice });
    const payload = {
        components: [panel],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    };
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => {});
    } else {
        await interaction.update(payload).catch(async () => {
            // update() fails when interaction is already in a different state.
            await interaction.reply(payload).catch(() => {});
        });
    }
}

// ── Command export ─────────────────────────────────────────────────────

module.exports = {
    data: new SlashCommandBuilder()
        .setName('birthday-setup')
        .setDescription('Configure the server birthday system')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    prefix: 'birthday-setup',
    description: 'Configure the server birthday system (channel, role, message)',
    usage: 'birthday-setup',
    category: 'admin',
    aliases: ['birthdaysetup', 'bdaysetup', 'bday-setup'],

    buildSetupPanel,
    buildPublicPanel,
    SETUP_PREFIX,
    BUILDER_PREFIX,

    async execute(interaction) {
        if (!ensureManageGuild(interaction)) {
            return interaction.reply({
                content: '<:Cancel:1473037949187657818> You need **Manage Server** permission.',
                flags: MessageFlags.Ephemeral
            });
        }
        const panel = buildSetupPanel(interaction.guild);
        await interaction.reply({
            components: [panel],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
    },

    async executePrefix(message) {
        if (!message.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('<:Cancel:1473037949187657818> You need **Manage Server** permission.');
        }
        const panel = buildSetupPanel(message.guild);
        await message.reply({
            components: [panel],
            flags: MessageFlags.IsComponentsV2
        });
    },

    /**
     * Master button/select/modal handler for the setup panel and
     * the message builder spawned from it.
     */
    async handleInteraction(interaction) {
        const id = interaction.customId;
        if (!id) return false;

        // Message builder bridge — handles both button + modal events
        if (id.startsWith(BUILDER_PREFIX + '_')) {
            return handleMessageBuilderRouting(interaction);
        }

        if (!id.startsWith(SETUP_PREFIX + '_')) return false;

        if (!ensureManageGuild(interaction)) {
            await interaction.reply({
                content: '<:Cancel:1473037949187657818> You need **Manage Server** permission.',
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return true;
        }

        const action = id.replace(SETUP_PREFIX + '_', '');
        const guildId = interaction.guild.id;

        try {
            // ── Channel pick (in-panel select) ───────────────────────
            if (interaction.isChannelSelectMenu() && action === 'channelpick') {
                const channelId = interaction.values[0];
                const cfg = birthdayManager.getGuildConfig(guildId);
                cfg.channelId = channelId;
                birthdayManager.saveGuildConfig(guildId, cfg);
                await refreshPanel(interaction, `<:Checkedbox:1473038547165384804> Announcement channel set to <#${channelId}>.`);
                return true;
            }

            // ── Role pick (in-panel select) ──────────────────────────
            if (interaction.isRoleSelectMenu() && action === 'rolepick') {
                const roleId = interaction.values[0] || null;
                const cfg = birthdayManager.getGuildConfig(guildId);

                if (roleId) {
                    // Sanity-check we can actually assign this role.
                    const role = interaction.guild.roles.cache.get(roleId);
                    const me = interaction.guild.members.me;
                    if (role && me && me.roles.highest.comparePositionTo(role) <= 0) {
                        await refreshPanel(interaction,
                            `<:Cancel:1473037949187657818> I can't assign **${role.name}** — it's higher than my top role. ` +
                            `Pick a lower role or move my role above it.`);
                        return true;
                    }
                    if (role && role.managed) {
                        await refreshPanel(interaction,
                            `<:Cancel:1473037949187657818> **${role.name}** is a managed/integration role and can't be auto-assigned.`);
                        return true;
                    }
                }

                cfg.roleId = roleId;
                birthdayManager.saveGuildConfig(guildId, cfg);
                await refreshPanel(interaction, roleId
                    ? `<:Checkedbox:1473038547165384804> Birthday role set to <@&${roleId}>.`
                    : `<:Checkedbox:1473038547165384804> Birthday role cleared.`);
                return true;
            }

            if (interaction.isButton() && action === 'clearrole') {
                const cfg = birthdayManager.getGuildConfig(guildId);
                cfg.roleId = null;
                birthdayManager.saveGuildConfig(guildId, cfg);
                await refreshPanel(interaction, '<:Checkedbox:1473038547165384804> Birthday role cleared.');
                return true;
            }

            // ── Ping picker — shows secondary panel ──────────────────
            if (interaction.isButton() && action === 'ping') {
                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`${SETUP_PREFIX}_pingpick`)
                        .setPlaceholder('Pick how to ping on birthdays')
                        .addOptions(
                            { label: 'User only', value: 'user', description: 'Mention only the birthday user', emoji: '<:User:1473038971398520977>' },
                            { label: 'Birthday role', value: 'role', description: 'Ping the configured role', emoji: '<:Pin:1473038806612447500>' },
                            { label: '@here', value: 'here', description: 'Ping online members in the channel', emoji: '🔔' },
                            { label: '@everyone', value: 'everyone', description: 'Ping every member', emoji: '<:Bullhorn:1473038903157199093>' },
                            { label: 'No ping', value: 'none', description: 'Send the message silently', emoji: '<:Toggleoff:1473038582813032590>' }
                        )
                );
                await interaction.reply({
                    content: '🔔 Pick the ping behavior for birthday messages:',
                    components: [row],
                    flags: MessageFlags.Ephemeral
                });
                return true;
            }
            if (interaction.isStringSelectMenu() && action === 'pingpick') {
                const val = interaction.values[0];
                const cfg = birthdayManager.getGuildConfig(guildId);
                cfg.pingMode = val;
                birthdayManager.saveGuildConfig(guildId, cfg);
                await interaction.update({
                    content: `<:Checkedbox:1473038547165384804> Ping mode set to **${pingLabel(val)}**. ` +
                             `Return to the panel to see updated settings.`,
                    components: []
                });
                return true;
            }

            // ── Hour picker ──────────────────────────────────────────
            if (interaction.isButton() && action === 'hour') {
                const opts = [];
                for (let h = 0; h < 24; h++) {
                    opts.push({
                        label: `${String(h).padStart(2, '0')}:00 UTC`,
                        value: String(h),
                        description: h === 0 ? 'Midnight UTC' : (h === 12 ? 'Noon UTC' : '')
                    });
                }
                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`${SETUP_PREFIX}_hourpick`)
                        .setPlaceholder('Pick the announcement hour (UTC)')
                        .addOptions(opts)
                );
                await interaction.reply({
                    content: '🕒 Pick the **UTC** hour to send birthday wishes:',
                    components: [row],
                    flags: MessageFlags.Ephemeral
                });
                return true;
            }
            if (interaction.isStringSelectMenu() && action === 'hourpick') {
                const hour = parseInt(interaction.values[0], 10);
                const cfg = birthdayManager.getGuildConfig(guildId);
                cfg.hour = isNaN(hour) ? 9 : Math.max(0, Math.min(23, hour));
                birthdayManager.saveGuildConfig(guildId, cfg);
                await interaction.update({
                    content: `<:Checkedbox:1473038547165384804> Send hour set to **${hourLabel(cfg.hour)}**. ` +
                             `Return to the panel to see updated settings.`,
                    components: []
                });
                return true;
            }

            // ── Message style picker ─────────────────────────────────
            if (interaction.isButton() && action === 'msgstyle') {
                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`${SETUP_PREFIX}_msgstylepick`)
                        .setPlaceholder('Pick the message style')
                        .addOptions(
                            { label: 'Simple', value: 'simple', description: 'Plain text message', emoji: '<:Chat:1473038936241864865>' },
                            { label: 'Embed', value: 'embed', description: 'Rich embed with title, color, and fields', emoji: '<:Document:1473039496995143731>' },
                            { label: 'Components V2', value: 'components', description: 'Modern card-style layout', emoji: '<:Fire:1473038604812161218>' }
                        )
                );
                await interaction.reply({
                    content: '<:Palette:1473039029476917461> Pick a message style. The matching template will be loaded — fine-tune it with **Edit Message**.',
                    components: [row],
                    flags: MessageFlags.Ephemeral
                });
                return true;
            }
            if (interaction.isStringSelectMenu() && action === 'msgstylepick') {
                const t = interaction.values[0];
                if (!['simple', 'embed', 'components'].includes(t)) return true;
                const cfg = birthdayManager.getGuildConfig(guildId);
                cfg.messageType = t;
                cfg.messageData = birthdayManager.cloneTemplate(t);
                birthdayManager.saveGuildConfig(guildId, cfg);
                await interaction.update({
                    content: `<:Checkedbox:1473038547165384804> Style set to **${typeLabel(t)}** — default template loaded. Edit it with **Edit Message**.`,
                    components: []
                });
                return true;
            }

            // ── Edit Message (spawn shared message builder) ──────────
            if (interaction.isButton() && action === 'msgedit') {
                const cfg = birthdayManager.getGuildConfig(guildId);
                const seed = cfg.messageData && Object.keys(cfg.messageData).length
                    ? cfg.messageData
                    : birthdayManager.cloneTemplate(cfg.messageType || 'embed');
                const sessionData = {
                    ...messageBuilder.getDefaultMessageData(),
                    ...seed,
                    mode: cfg.messageType || seed.mode || 'embed',
                    context: 'Birthday Wish'
                };
                messageBuilder.setSession(interaction.user.id, 'birthday', guildId, '', sessionData);
                const panel = messageBuilder.buildMessageBuilderPanel(sessionData, BUILDER_PREFIX, 'Birthday Wish');
                await interaction.reply({
                    components: [panel],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
                });
                return true;
            }

            // ── Preview ──────────────────────────────────────────────
            if (interaction.isButton() && action === 'preview') {
                const cfg = birthdayManager.getGuildConfig(guildId);
                const data = cfg.messageData || birthdayManager.cloneTemplate(cfg.messageType || 'embed');
                const mode = data.mode || cfg.messageType || 'embed';
                const member = interaction.member;

                if (mode === 'components') {
                    const container = messageBuilder.buildComponentsV2Message(
                        data, member.user, interaction.guild, interaction.channel
                    );
                    await interaction.reply({
                        components: [container],
                        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
                    });
                } else if (mode === 'embed') {
                    const embed = messageBuilder.buildPreviewEmbed(
                        data, member.user, interaction.guild, interaction.channel
                    );
                    const content = messageBuilder.replacePlaceholders(
                        data.content || '', member.user, interaction.guild, interaction.channel
                    );
                    await interaction.reply({
                        content: content || undefined,
                        embeds: [embed],
                        flags: MessageFlags.Ephemeral,
                        allowedMentions: { parse: [] }
                    });
                } else {
                    const content = messageBuilder.replacePlaceholders(
                        data.content || '*No content yet — use Edit Message.*',
                        member.user, interaction.guild, interaction.channel
                    );
                    await interaction.reply({
                        content,
                        flags: MessageFlags.Ephemeral,
                        allowedMentions: { parse: [] }
                    });
                }
                return true;
            }

            // ── Test Send ────────────────────────────────────────────
            if (interaction.isButton() && action === 'test') {
                const cfg = birthdayManager.getGuildConfig(guildId);
                if (!cfg.channelId) {
                    await refreshPanel(interaction,
                        '<:Cancel:1473037949187657818> Set the announcement channel first.');
                    return true;
                }
                let channel = interaction.guild.channels.cache.get(cfg.channelId);
                if (!channel) channel = await interaction.guild.channels.fetch(cfg.channelId).catch(() => null);
                if (!channel || !channel.isTextBased?.()) {
                    await refreshPanel(interaction,
                        '<:Cancel:1473037949187657818> Configured channel is missing or not a text channel.');
                    return true;
                }
                const me = interaction.guild.members.me;
                const perms = channel.permissionsFor(me);
                if (!perms?.has(['ViewChannel', 'SendMessages'])) {
                    await refreshPanel(interaction,
                        `<:Cancel:1473037949187657818> I don't have **View Channel + Send Messages** in ${channel}.`);
                    return true;
                }
                try {
                    await birthdayManager.sendBirthdayMessage(
                        interaction.client,
                        interaction.guild,
                        channel,
                        interaction.member,
                        { month: new Date().getUTCMonth() + 1, day: new Date().getUTCDate(), year: null },
                        cfg
                    );
                    await refreshPanel(interaction,
                        `<:Checkedbox:1473038547165384804> Test wish sent to ${channel}.`);
                } catch (e) {
                    await refreshPanel(interaction,
                        `<:Cancel:1473037949187657818> Test send failed: ${e.message || e}`);
                }
                return true;
            }

            // ── Send public Set-Birthday panel ───────────────────────
            if (interaction.isButton() && action === 'panel') {
                const row = new ActionRowBuilder().addComponents(
                    new ChannelSelectMenuBuilder()
                        .setCustomId(`${SETUP_PREFIX}_panelpick`)
                        .setPlaceholder('Pick the channel for the public Set-Birthday panel')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                );
                await interaction.reply({
                    content: '<:Add:1473038100862337035> Pick the channel where the public Set-Birthday panel should be posted:',
                    components: [row],
                    flags: MessageFlags.Ephemeral
                });
                return true;
            }
            if (interaction.isChannelSelectMenu() && action === 'panelpick') {
                const channelId = interaction.values[0];
                const channel = interaction.guild.channels.cache.get(channelId)
                    || await interaction.guild.channels.fetch(channelId).catch(() => null);
                if (!channel) {
                    await interaction.update({ content: '<:Cancel:1473037949187657818> Channel not found.', components: [] });
                    return true;
                }
                const me = interaction.guild.members.me;
                const perms = channel.permissionsFor(me);
                if (!perms?.has(['ViewChannel', 'SendMessages'])) {
                    await interaction.update({
                        content: `<:Cancel:1473037949187657818> I don't have **View Channel + Send Messages** in ${channel}.`,
                        components: []
                    });
                    return true;
                }
                try {
                    const cfg = birthdayManager.getGuildConfig(guildId);
                    // If a panel was previously posted, try to delete the old one.
                    if (cfg.panel?.channelId && cfg.panel?.messageId) {
                        const oldCh = interaction.guild.channels.cache.get(cfg.panel.channelId)
                            || await interaction.guild.channels.fetch(cfg.panel.channelId).catch(() => null);
                        if (oldCh) {
                            const oldMsg = await oldCh.messages.fetch(cfg.panel.messageId).catch(() => null);
                            if (oldMsg) await oldMsg.delete().catch(() => {});
                        }
                    }
                    const panel = buildPublicPanel(interaction.guild);
                    const sent = await channel.send({
                        components: [panel],
                        flags: MessageFlags.IsComponentsV2
                    });
                    cfg.panel = { channelId: channel.id, messageId: sent.id };
                    birthdayManager.saveGuildConfig(guildId, cfg);
                    await interaction.update({
                        content: `<:Checkedbox:1473038547165384804> Public panel posted in ${channel}.`,
                        components: []
                    });
                } catch (e) {
                    await interaction.update({
                        content: `<:Cancel:1473037949187657818> Could not post panel: ${e.message || e}`,
                        components: []
                    });
                }
                return true;
            }

            // ── Toggle ───────────────────────────────────────────────
            if (interaction.isButton() && action === 'toggle') {
                const cfg = birthdayManager.getGuildConfig(guildId);
                if (!cfg.channelId) {
                    await refreshPanel(interaction,
                        '<:Cancel:1473037949187657818> Set the announcement channel first.');
                    return true;
                }
                cfg.enabled = !cfg.enabled;
                birthdayManager.saveGuildConfig(guildId, cfg);
                await refreshPanel(interaction, cfg.enabled
                    ? '<:Toggleon:1473038585501581312> Birthday system **enabled**.'
                    : '<:Toggleoff:1473038582813032590> Birthday system **disabled**.');
                return true;
            }

            // ── Refresh ──────────────────────────────────────────────
            if (interaction.isButton() && action === 'refresh') {
                await refreshPanel(interaction);
                return true;
            }

            // ── Reset (asks for confirmation) ────────────────────────
            if (interaction.isButton() && action === 'reset') {
                const confirmRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`${SETUP_PREFIX}_resetconfirm`)
                        .setLabel('Yes, reset settings')
                        .setEmoji('<:Trash:1473038090074591293>')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`${SETUP_PREFIX}_resetcancel`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );
                await interaction.reply({
                    content: '<:Cancel:1473037949187657818> Reset will clear channel, role, ping mode, hour, and message template.\n' +
                             '**Saved member birthdays are preserved.** Continue?',
                    components: [confirmRow],
                    flags: MessageFlags.Ephemeral
                });
                return true;
            }
            if (interaction.isButton() && action === 'resetconfirm') {
                const all = birthdayManager.loadAll();
                const preserveUsers = all[guildId]?.users || {};
                all[guildId] = { ...birthdayManager.getDefaultGuildConfig(), users: preserveUsers };
                birthdayManager.saveAll(all);
                await interaction.update({
                    content: '<:Checkedbox:1473038547165384804> Settings reset. Member birthdays were preserved.',
                    components: []
                });
                return true;
            }
            if (interaction.isButton() && action === 'resetcancel') {
                await interaction.update({
                    content: '<:Checkedbox:1473038547165384804> Reset cancelled.',
                    components: []
                });
                return true;
            }
        } catch (err) {
            require('../../utils/logger-styled').error('[birthday-setup] handler error:', err);
            const msg = `<:Cancel:1473037949187657818> Something went wrong: ${err.message || err}`;
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
            } else {
                await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            return true;
        }

        return false;
    }
};

// ── Internal: route message-builder interactions back to setup ────────

async function handleMessageBuilderRouting(interaction) {
    const guildId = interaction.guild.id;

    if (!interaction.isButton() && !interaction.isModalSubmit()) return false;

    const onSave = async (i, data) => {
        const cfg = birthdayManager.getGuildConfig(guildId);
        cfg.messageData = {
            mode: data.mode,
            content: data.content || '',
            title: data.title || '',
            description: data.description || '',
            color: data.color || '#FF6FA3',
            image: data.image || '',
            thumbnail: data.thumbnail || '',
            footer: data.footer || '',
            footerIcon: data.footerIcon || '',
            author: data.author || '',
            authorIcon: data.authorIcon || '',
            fields: Array.isArray(data.fields) ? data.fields : []
        };
        cfg.messageType = data.mode || cfg.messageType || 'embed';
        birthdayManager.saveGuildConfig(guildId, cfg);
        const okMsg = '<:Checkedbox:1473038547165384804> Birthday message saved!';
        if (i.deferred || i.replied) {
            await i.editReply({ content: okMsg, components: [], embeds: [] }).catch(() => {});
        } else {
            await i.update({ content: okMsg, components: [], embeds: [] }).catch(async () => {
                await i.reply({ content: okMsg, flags: MessageFlags.Ephemeral }).catch(() => {});
            });
        }
    };

    const onCancel = async (i) => {
        const cancelMsg = '<:Cancel:1473037949187657818> Edit cancelled.';
        if (i.deferred || i.replied) {
            await i.editReply({ content: cancelMsg, components: [], embeds: [] }).catch(() => {});
        } else {
            await i.update({ content: cancelMsg, components: [], embeds: [] }).catch(async () => {
                await i.reply({ content: cancelMsg, flags: MessageFlags.Ephemeral }).catch(() => {});
            });
        }
    };

    if (interaction.isModalSubmit()) {
        return await messageBuilder.handleModalSubmit(interaction, BUILDER_PREFIX, 'birthday', guildId, '');
    }
    return await messageBuilder.handleButtonInteraction(
        interaction, BUILDER_PREFIX, 'birthday', guildId, '', onSave, onCancel
    );
}
