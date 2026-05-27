'use strict';

/**
 * /automeme · -automeme
 * ───────────────────────────────────────────────────────────────────
 * Admin command that drives the AutoMeme scheduled-poster system.
 * The scheduling, fetching, and Reddit logic live in
 * utils/autoMemePoster.js — this module only owns the UI and config
 * mutation surface.
 *
 * Subcommands
 *   setup        <#channel>            — turn on with target channel
 *   disable                            — turn off (config kept)
 *   reset                              — wipe config entirely
 *   interval     <minutes>             — set frequency (free 60..1440, premium 30..1440)
 *   category     <preset>              — english | hindi | anime | gaming | mixed | custom
 *   add-sub      <name>                — add custom subreddit (premium)
 *   remove-sub   <name>                — drop custom subreddit
 *   list-subs                          — list custom subs in use
 *   ping         <none|here|everyone|@role>
 *   nsfw         <on|off>              — only honored when the target channel is NSFW
 *   test                               — fire one post immediately (rate-limited to 1/min)
 *   status                             — pretty status panel + action buttons
 */

const {
    SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType,
    ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');

const {
    PRESETS, getGuildConfig, saveGuildConfig, deleteGuildConfig, postOnce,
} = require('../../utils/autoMemePoster');
const premiumManager = require('../../utils/premiumManager');
const {
    BRANDING, COLORS,
    buildSuccessResponse, buildErrorResponse, buildPermissionDenied, buildPremiumGate,
} = require('../../utils/responseBuilder');

const E = {
    meme:    '<:Lightning:1473038797540298792>',
    on:      '<:Toggleon:1473038585501581312>',
    off:     '<:Toggleoff:1473038582813032590>',
    caret:   '<:Caretright:1473038207221502106>',
    refresh: '<:Refresh:1473037911581528165>',
    settings:'<:Settings:1473037894703779851>',
    pin:     '<:Pin:1473038806612447500>',
    timer:   '<:Timer:1473039056710406204>',
    info:    '<:Inforect:1473038624172937287>',
    cancel:  '<:Cancel:1473037949187657818>',
    check:   '<:Checkedbox:1473038547165384804>',
    crown:   '<:Crown:1506010837368963142>',
    trash:   '<:Trash:1473038090074591293>',
    bulb:    '<:Lightbulbalt:1473038470787240009>',
    play:    '<:Lightning:1473038797540298792>',
};

const VALID_CATEGORIES = ['english', 'hindi', 'anime', 'gaming', 'mixed', 'custom'];
const FREE_MIN_INTERVAL = 60;
const PREMIUM_MIN_INTERVAL = 30;
const MAX_INTERVAL = 1440;          // 24h
const MAX_CUSTOM_SUBS_PREMIUM = 5;
const SUBREDDIT_RE = /^[a-z0-9][a-z0-9_]{1,20}$/i;

const _testCooldowns = new Map(); // guildId → timestamp

/* ───────────────────────────── helpers ─────────────────────────── */

function isPremium(userId, guildId) {
    return premiumManager.hasPremiumAccess(userId, guildId);
}

function minIntervalFor(userId, guildId) {
    return isPremium(userId, guildId) ? PREMIUM_MIN_INTERVAL : FREE_MIN_INTERVAL;
}

function pingLabel(ping) {
    if (!ping || ping.type === 'none') return '`Disabled`';
    if (ping.type === 'everyone') return '`@everyone`';
    if (ping.type === 'here')     return '`@here`';
    if (ping.type === 'role' && ping.id) return `<@&${ping.id}>`;
    return '`None`';
}

function categoryLabel(cfg) {
    if (cfg.category === 'custom') {
        const n = (cfg.customSubs || []).length;
        return `\`Custom\` *(${n} sub${n === 1 ? '' : 's'})*`;
    }
    return `\`${cfg.category}\``;
}

function nextPostLine(cfg) {
    if (!cfg.enabled) return '`—`';
    const next = (cfg.lastPostedAt || 0) + cfg.intervalMinutes * 60_000;
    if (next <= Date.now()) return '*pending next tick*';
    return `<t:${Math.floor(next / 1000)}:R>`;
}

function buildStatusPanel(guild, cfg, viewerHasPremium) {
    const container = new ContainerBuilder().setAccentColor(cfg.enabled ? 0xFF4500 : 0x5865F2);

    const tier = viewerHasPremium ? `${E.crown} Premium` : `${E.info} Free`;
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# ${E.meme} AutoMeme · Setup\n` +
        `-# Auto-posts a fresh meme to your chosen channel on a schedule.  ·  ${tier}`,
    ));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    const status = cfg.enabled ? `${E.on} **Enabled**` : `${E.off} **Disabled**`;
    const channel = cfg.channelId ? `<#${cfg.channelId}>` : '`Not set`';

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `${status}\n` +
        `${E.pin} **Channel** ${channel}\n` +
        `${E.caret} **Category** ${categoryLabel(cfg)}\n` +
        `${E.timer} **Interval** \`${cfg.intervalMinutes}m\` (every ${cfg.intervalMinutes} minute${cfg.intervalMinutes === 1 ? '' : 's'})\n` +
        `${E.bulb} **Ping** ${pingLabel(cfg.ping)}\n` +
        `${E.info} **Allow NSFW** ${cfg.allowNsfw ? '`Yes`' : '`No`'} *(channel must be marked NSFW)*\n` +
        `${E.refresh} **Next post** ${nextPostLine(cfg)}\n` +
        `${E.check} **Posted so far** \`${cfg.totalPosted || 0}\``,
    ));

    if (cfg.lastError) {
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `${E.cancel} **Last error** \`${cfg.lastError.slice(0, 200)}\``,
        ));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('automeme_toggle')
            .setLabel(cfg.enabled ? 'Disable' : 'Enable')
            .setEmoji(cfg.enabled ? E.off : E.on)
            .setStyle(cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
            .setDisabled(!cfg.channelId && !cfg.enabled),
        new ButtonBuilder()
            .setCustomId('automeme_test')
            .setLabel('Post Now')
            .setEmoji(E.play)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!cfg.channelId),
        new ButtonBuilder()
            .setCustomId('automeme_refresh')
            .setLabel('Refresh')
            .setEmoji(E.refresh)
            .setStyle(ButtonStyle.Secondary),
    );
    container.addActionRowComponents(row1);

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

    return container;
}

function ok(title, body, details) {
    return buildSuccessResponse(title, body, details);
}

function err(title, body, suggestion) {
    return buildErrorResponse(title, body, suggestion);
}

/* ───────────────────────── subcommand handlers ─────────────────── */

async function handleSetup({ guild, member, userId, channel, send }) {
    if (!channel) {
        return send({ components: [err('Channel Required', 'Pick a text channel to receive memes.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
        return send({ components: [err('Unsupported Channel', 'AutoMeme can only post to text or announcement channels.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
    const me = guild.members.me;
    const need = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles];
    if (!channel.permissionsFor(me)?.has(need)) {
        return send({ components: [err('Missing Permissions', `I need **View Channel**, **Send Messages**, **Embed Links**, and **Attach Files** in ${channel}.`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }

    const next = saveGuildConfig(guild.id, { enabled: true, channelId: channel.id, lastError: null });
    return send({
        components: [buildStatusPanel(guild, next, isPremium(userId, guild.id))],
        flags: MessageFlags.IsComponentsV2,
    });
}

async function handleDisable({ guild, send }) {
    const next = saveGuildConfig(guild.id, { enabled: false });
    return send({
        components: [ok('AutoMeme Disabled', 'Scheduled posting paused. Run `/automeme setup` to re-enable.', {
            'Channel': next.channelId ? `<#${next.channelId}>` : '`Not set`',
            'Posted so far': `\`${next.totalPosted}\``,
        })],
        flags: MessageFlags.IsComponentsV2,
    });
}

async function handleReset({ guild, send }) {
    deleteGuildConfig(guild.id);
    return send({
        components: [ok('AutoMeme Reset', 'All AutoMeme settings for this server have been cleared.')],
        flags: MessageFlags.IsComponentsV2,
    });
}

async function handleInterval({ guild, userId, minutes, send }) {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_INTERVAL) {
        return send({ components: [err('Invalid Interval', `Pick a whole number of minutes between 1 and ${MAX_INTERVAL}.`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }

    const min = minIntervalFor(userId, guild.id);
    if (minutes < min) {
        if (!isPremium(userId, guild.id) && minutes >= PREMIUM_MIN_INTERVAL) {
            return send({ components: [buildPremiumGate(`/automeme interval ${minutes}`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        return send({ components: [err('Interval Too Short', `The minimum interval is **${min} minutes**.`, isPremium(userId, guild.id) ? null : `Premium servers can post as often as every **${PREMIUM_MIN_INTERVAL}m**.`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }

    const next = saveGuildConfig(guild.id, { intervalMinutes: minutes });
    return send({
        components: [ok('Interval Updated', `AutoMeme will now post every **${minutes} minutes**.`, {
            'Status': next.enabled ? '`Enabled`' : '`Disabled`',
            'Next post': nextPostLine(next),
        })],
        flags: MessageFlags.IsComponentsV2,
    });
}

async function handleCategory({ guild, userId, category, send }) {
    const cat = String(category || '').toLowerCase();
    if (!VALID_CATEGORIES.includes(cat)) {
        return send({ components: [err('Invalid Category', `Pick one of: \`${VALID_CATEGORIES.join('`, `')}\``)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
    if (cat === 'custom' && !isPremium(userId, guild.id)) {
        return send({ components: [buildPremiumGate('/automeme category custom')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }

    const cur = getGuildConfig(guild.id);
    const patch = { category: cat };
    if (cat === 'custom' && !cur.customSubs?.length) {
        // Allow switching to custom even with no subs yet — they just need to add some.
    }
    const next = saveGuildConfig(guild.id, patch);
    return send({
        components: [ok('Category Updated', `Set to ${categoryLabel(next)}.`, cat === 'custom' && !next.customSubs?.length ? {
            'Tip': 'Add subreddits with `/automeme add-sub <name>`.',
        } : undefined)],
        flags: MessageFlags.IsComponentsV2,
    });
}

async function handleAddSub({ guild, userId, sub, send }) {
    if (!isPremium(userId, guild.id)) {
        return send({ components: [buildPremiumGate('/automeme add-sub')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
    const name = String(sub || '').replace(/^r\//i, '').trim();
    if (!SUBREDDIT_RE.test(name)) {
        return send({ components: [err('Invalid Subreddit', 'Subreddits use letters, numbers, and underscores only (3–21 chars).')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }

    const cur = getGuildConfig(guild.id);
    const subs = [...(cur.customSubs || [])];
    if (subs.some(s => s.toLowerCase() === name.toLowerCase())) {
        return send({ components: [err('Already Added', `\`r/${name}\` is already in your custom list.`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
    if (subs.length >= MAX_CUSTOM_SUBS_PREMIUM) {
        return send({ components: [err('Limit Reached', `Premium servers can track up to **${MAX_CUSTOM_SUBS_PREMIUM}** custom subreddits.`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
    subs.push(name);
    const next = saveGuildConfig(guild.id, { customSubs: subs, category: 'custom' });
    return send({
        components: [ok('Subreddit Added', `Now pulling memes from \`r/${name}\`.`, {
            'Total custom subs': `\`${next.customSubs.length}/${MAX_CUSTOM_SUBS_PREMIUM}\``,
            'Category': '`custom`',
        })],
        flags: MessageFlags.IsComponentsV2,
    });
}

async function handleRemoveSub({ guild, sub, send }) {
    const name = String(sub || '').replace(/^r\//i, '').trim();
    if (!name) {
        return send({ components: [err('Subreddit Required', 'Tell me which sub to remove.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
    const cur = getGuildConfig(guild.id);
    const before = cur.customSubs || [];
    const next = before.filter(s => s.toLowerCase() !== name.toLowerCase());
    if (next.length === before.length) {
        return send({ components: [err('Not Found', `\`r/${name}\` isn't in your custom list.`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
    const saved = saveGuildConfig(guild.id, { customSubs: next });
    return send({
        components: [ok('Subreddit Removed', `Stopped pulling from \`r/${name}\`.`, {
            'Remaining custom subs': `\`${saved.customSubs.length}\``,
        })],
        flags: MessageFlags.IsComponentsV2,
    });
}

async function handleListSubs({ guild, send }) {
    const cur = getGuildConfig(guild.id);
    const subs = cur.customSubs || [];
    if (!subs.length) {
        return send({
            components: [buildSuccessResponse('Custom Subreddits', 'No custom subreddits yet.', { 'Tip': 'Premium servers can add up to 5 with `/automeme add-sub <name>`.' })],
            flags: MessageFlags.IsComponentsV2,
        });
    }
    return send({
        components: [buildSuccessResponse(
            `Custom Subreddits — ${subs.length}`,
            subs.map((s, i) => `${E.caret} \`${String(i + 1).padStart(2, '0')}.\` r/${s}`).join('\n'),
        )],
        flags: MessageFlags.IsComponentsV2,
    });
}

async function handlePing({ guild, value, role, send }) {
    let ping;
    if (role) {
        ping = { type: 'role', id: role.id };
    } else {
        const v = String(value || '').toLowerCase();
        if (v === 'none')          ping = { type: 'none' };
        else if (v === 'here')     ping = { type: 'here' };
        else if (v === 'everyone') ping = { type: 'everyone' };
        else return send({ components: [err('Invalid Ping', 'Use one of `none`, `here`, `everyone`, or pass a role.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
    const next = saveGuildConfig(guild.id, { ping });
    return send({
        components: [ok('Ping Updated', `AutoMeme posts will now ping ${pingLabel(next.ping)}.`)],
        flags: MessageFlags.IsComponentsV2,
    });
}

async function handleNsfw({ guild, on, send }) {
    const next = saveGuildConfig(guild.id, { allowNsfw: !!on });
    return send({
        components: [ok(
            next.allowNsfw ? 'NSFW Allowed' : 'NSFW Filtered',
            next.allowNsfw
                ? 'NSFW memes may be posted **only** when the configured channel is marked NSFW. Otherwise they\'re still filtered out.'
                : 'NSFW posts are filtered out completely.',
        )],
        flags: MessageFlags.IsComponentsV2,
    });
}

async function handleTest({ guild, userId, client, send }) {
    const cur = getGuildConfig(guild.id);
    if (!cur.channelId) {
        return send({ components: [err('Not Configured', 'Run `/automeme setup #channel` first.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
    const last = _testCooldowns.get(guild.id) || 0;
    if (Date.now() - last < 60_000) {
        const wait = Math.ceil((60_000 - (Date.now() - last)) / 1000);
        return send({ components: [err('Slow Down', `You can run \`/automeme test\` once per minute. Try again in **${wait}s**.`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
    _testCooldowns.set(guild.id, Date.now());

    const okPosted = await postOnce(client, guild.id, cur, { manual: true });
    const fresh = getGuildConfig(guild.id);
    if (!okPosted) {
        return send({
            components: [err('Test Post Failed', fresh.lastError || 'Could not fetch or send a meme.', 'Check the bot\'s permissions in the configured channel and try again.')],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }
    return send({
        components: [ok('Test Posted', `Sent one meme to <#${cur.channelId}>.`, {
            'Posted so far': `\`${fresh.totalPosted}\``,
        })],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
}

async function handleStatus({ guild, userId, send }) {
    const cur = getGuildConfig(guild.id);
    return send({
        components: [buildStatusPanel(guild, cur, isPremium(userId, guild.id))],
        flags: MessageFlags.IsComponentsV2,
    });
}

/* ───────────────────────── slash dispatcher ────────────────────── */

async function executeSlash(interaction) {
    const sub = interaction.options.getSubcommand(false);

    // Subcommands that do network I/O need a deferred reply so the
    // interaction token doesn't expire while we hit Reddit.
    const NEEDS_DEFER = new Set(['test']);
    if (NEEDS_DEFER.has(sub)) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    const ctx = {
        guild:  interaction.guild,
        member: interaction.member,
        userId: interaction.user.id,
        client: interaction.client,
        send:   (payload) => interaction.replied || interaction.deferred
            ? interaction.editReply(payload).catch(() => {})
            : interaction.reply(payload).catch(() => {}),
    };

    switch (sub) {
        case 'setup':       return handleSetup({ ...ctx, channel: interaction.options.getChannel('channel') });
        case 'disable':     return handleDisable(ctx);
        case 'reset':       return handleReset(ctx);
        case 'interval':    return handleInterval({ ...ctx, minutes: interaction.options.getInteger('minutes') });
        case 'category':    return handleCategory({ ...ctx, category: interaction.options.getString('preset') });
        case 'add-sub':     return handleAddSub({ ...ctx, sub: interaction.options.getString('name') });
        case 'remove-sub':  return handleRemoveSub({ ...ctx, sub: interaction.options.getString('name') });
        case 'list-subs':   return handleListSubs(ctx);
        case 'ping':        return handlePing({ ...ctx, value: interaction.options.getString('value'), role: interaction.options.getRole('role') });
        case 'nsfw':        return handleNsfw({ ...ctx, on: interaction.options.getBoolean('enabled') });
        case 'test':        return handleTest(ctx);
        case 'status':
        default:            return handleStatus(ctx);
    }
}

/* ───────────────────────── prefix dispatcher ───────────────────── */

function parseChannelArg(message, raw) {
    if (!raw) return null;
    const idMatch = raw.match(/(\d{17,20})/);
    if (idMatch) return message.guild.channels.cache.get(idMatch[1]) || null;
    return message.guild.channels.cache.find(c => c.name?.toLowerCase() === raw.toLowerCase()) || null;
}

function parseRoleArg(message, raw) {
    if (!raw) return null;
    const idMatch = raw.match(/(\d{17,20})/);
    if (idMatch) return message.guild.roles.cache.get(idMatch[1]) || null;
    return message.guild.roles.cache.find(r => r.name?.toLowerCase() === raw.toLowerCase()) || null;
}

async function executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return message.reply({ components: [buildPermissionDenied('Manage Server')], flags: MessageFlags.IsComponentsV2 });
    }

    const ctx = {
        guild:  message.guild,
        member: message.member,
        userId: message.author.id,
        client: message.client,
        send:   (payload) => message.reply(payload).catch(() => {}),
    };

    const sub = (args[0] || 'status').toLowerCase();
    switch (sub) {
        case 'setup': {
            const channel = parseChannelArg(message, args[1]) || message.channel;
            return handleSetup({ ...ctx, channel });
        }
        case 'disable': case 'off': return handleDisable(ctx);
        case 'reset':               return handleReset(ctx);
        case 'interval': {
            const minutes = parseInt(args[1], 10);
            return handleInterval({ ...ctx, minutes });
        }
        case 'category': case 'cat':
            return handleCategory({ ...ctx, category: args[1] });
        case 'add-sub': case 'addsub': case 'add':
            return handleAddSub({ ...ctx, sub: args[1] });
        case 'remove-sub': case 'removesub': case 'remove': case 'del':
            return handleRemoveSub({ ...ctx, sub: args[1] });
        case 'list-subs': case 'listsubs': case 'subs':
            return handleListSubs(ctx);
        case 'ping': {
            const v = (args[1] || '').toLowerCase();
            const role = ['none', 'here', 'everyone'].includes(v) ? null : parseRoleArg(message, args[1]);
            return handlePing({ ...ctx, value: role ? null : v, role });
        }
        case 'nsfw':
            return handleNsfw({ ...ctx, on: ['on', 'yes', 'true', 'enable'].includes((args[1] || '').toLowerCase()) });
        case 'test': case 'now': case 'post':
            return handleTest(ctx);
        case 'status': case 'show': default:
            return handleStatus(ctx);
    }
}

/* ───────────────────────── component handlers ──────────────────── */

async function handleButton(interaction) {
    const id = interaction.customId;
    if (!id?.startsWith('automeme_')) return false;

    if (!interaction.guild) return false;
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ components: [buildPermissionDenied('Manage Server')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    const guild = interaction.guild;
    const userId = interaction.user.id;

    if (id === 'automeme_toggle') {
        const cur = getGuildConfig(guild.id);
        if (!cur.channelId && !cur.enabled) {
            await interaction.reply({ components: [err('Not Configured', 'Run `/automeme setup` first.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
            return true;
        }
        const next = saveGuildConfig(guild.id, { enabled: !cur.enabled });
        await interaction.update({
            components: [buildStatusPanel(guild, next, isPremium(userId, guild.id))],
            flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
        return true;
    }

    if (id === 'automeme_test') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        await handleTest({ guild, userId, client: interaction.client, send: (p) => interaction.editReply(p).catch(() => {}) });
        return true;
    }

    if (id === 'automeme_refresh' || id === 'automeme_settings') {
        const next = getGuildConfig(guild.id);
        await interaction.update({
            components: [buildStatusPanel(guild, next, isPremium(userId, guild.id))],
            flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
        return true;
    }

    if (id.startsWith('automeme_next_')) {
        // "Another" button on a posted meme — anyone in the channel
        // sees this, so we gate it behind Manage Server + a 1-minute
        // per-guild cooldown to prevent button-spam bypassing the
        // configured interval.
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({ components: [buildPermissionDenied('Manage Server')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
            return true;
        }
        const last = _testCooldowns.get(guild.id) || 0;
        if (Date.now() - last < 60_000) {
            const wait = Math.ceil((60_000 - (Date.now() - last)) / 1000);
            await interaction.reply({ components: [err('Slow Down', `Wait **${wait}s** before requesting another meme.`)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
            return true;
        }
        _testCooldowns.set(guild.id, Date.now());

        const cur = getGuildConfig(guild.id);
        if (!cur.channelId) return false;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        const okPosted = await postOnce(interaction.client, guild.id, cur, { manual: true });
        const fresh = getGuildConfig(guild.id);
        if (!okPosted) {
            await interaction.editReply({ components: [err('No Meme Found', fresh.lastError || 'Try again in a moment.')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        } else {
            await interaction.editReply({ components: [ok('Posted', `Sent another meme to <#${cur.channelId}>.`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
        return true;
    }

    return false;
}

/* ───────────────────────── exports ─────────────────────────────── */

module.exports = {
    name:        'automeme',
    prefix:      'automeme',
    description: 'Auto-post fresh memes to a channel on a schedule',
    usage:       'automeme <setup|disable|interval|category|add-sub|remove-sub|ping|nsfw|test|status>',
    category:    'automation',
    aliases:     ['memepost', 'memeposter'],

    data: new SlashCommandBuilder()
        .setName('automeme')
        .setDescription('Auto-post fresh memes to a channel on a schedule')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand(s => s
            .setName('setup')
            .setDescription('Enable AutoMeme and pick the target channel')
            .addChannelOption(o => o
                .setName('channel')
                .setDescription('Where to post')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)))
        .addSubcommand(s => s
            .setName('disable')
            .setDescription('Pause AutoMeme (config kept)'))
        .addSubcommand(s => s
            .setName('reset')
            .setDescription('Wipe all AutoMeme settings for this server'))
        .addSubcommand(s => s
            .setName('interval')
            .setDescription('How often to post (minutes)')
            .addIntegerOption(o => o
                .setName('minutes')
                .setDescription('Free: 60–1440  ·  Premium: 30–1440')
                .setMinValue(1)
                .setMaxValue(MAX_INTERVAL)
                .setRequired(true)))
        .addSubcommand(s => s
            .setName('category')
            .setDescription('Pick a preset category')
            .addStringOption(o => o
                .setName('preset')
                .setDescription('Which pool to draw from')
                .addChoices(
                    { name: '🌍 English',  value: 'english' },
                    { name: '🇮🇳 Hindi',    value: 'hindi'   },
                    { name: '🎌 Anime',    value: 'anime'   },
                    { name: '🎮 Gaming',   value: 'gaming'  },
                    { name: '✨ Mixed',    value: 'mixed'   },
                    { name: '🛠️ Custom (Premium)', value: 'custom' },
                )
                .setRequired(true)))
        .addSubcommand(s => s
            .setName('add-sub')
            .setDescription('Add a custom subreddit (Premium)')
            .addStringOption(o => o.setName('name').setDescription('e.g. wholesomememes').setRequired(true).setMaxLength(50)))
        .addSubcommand(s => s
            .setName('remove-sub')
            .setDescription('Remove a custom subreddit')
            .addStringOption(o => o.setName('name').setDescription('Name to remove').setRequired(true).setMaxLength(50)))
        .addSubcommand(s => s
            .setName('list-subs')
            .setDescription('List your custom subreddits'))
        .addSubcommand(s => s
            .setName('ping')
            .setDescription('Configure pings on each post')
            .addStringOption(o => o
                .setName('value')
                .setDescription('Ping mode')
                .addChoices(
                    { name: 'None',     value: 'none' },
                    { name: '@here',    value: 'here' },
                    { name: '@everyone',value: 'everyone' },
                ))
            .addRoleOption(o => o.setName('role').setDescription('Or pick a specific role')))
        .addSubcommand(s => s
            .setName('nsfw')
            .setDescription('Allow NSFW posts (only in NSFW-marked channels)')
            .addBooleanOption(o => o.setName('enabled').setDescription('On or off').setRequired(true)))
        .addSubcommand(s => s
            .setName('test')
            .setDescription('Fire one post immediately to verify setup'))
        .addSubcommand(s => s
            .setName('status')
            .setDescription('Show current AutoMeme settings')),

    async execute(interaction) {
        try {
            return await executeSlash(interaction);
        } catch (e) {
            console.error('[AutoMeme] slash error:', e);
            const payload = { components: [err('Something Went Wrong', e.message || 'Unexpected error.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(payload).catch(() => {});
            } else {
                await interaction.reply(payload).catch(() => {});
            }
        }
    },

    executePrefix,
    handleButton,
};
