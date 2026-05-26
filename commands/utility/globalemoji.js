'use strict';

const {
    SlashCommandBuilder, PermissionFlagsBits, MessageFlags,
    ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const {
    buildErrorResponse, buildPermissionDenied, buildExpiredPanel,
    BRANDING, COLORS,
} = require('../../utils/responseBuilder');
const {
    flattenEmojis, fetchEmojiById, parseEmojiIdInput,
    explainEmojiError, sanitizeName,
    setScan, getScan, clearScan, TIMEOUT_MS,
} = require('../../utils/globalAssetBrowser');

const PAGE_SIZE = 10;
const ID_PREFIX = 'gemoji';
const STEAL_LIMIT = 10;

/* ───────────────────────── Helpers ───────────────────────── */

function escapeMd(text) {
    return String(text || '').replace(/[*_~`|>\\]/g, m => `\\${m}`);
}

function checkExpressionPerms(member) {
    return !!(
        member?.permissions?.has(PermissionFlagsBits.ManageGuildExpressions) ||
        member?.permissions?.has(PermissionFlagsBits.Administrator)
    );
}

/* ─────────────────────── Page rendering ─────────────────────── */

function buildBrowserPayload(state) {
    const { items, page, totalPages, opts, guildsScanned } = state;
    const start = page * PAGE_SIZE;
    const slice = items.slice(start, start + PAGE_SIZE);

    const container = new ContainerBuilder().setAccentColor(COLORS.INFO);

    let header = `# 🌐 Global Emoji Library\n`;
    if (items.length === 0) {
        header += `-# No emojis matched your filters across **${guildsScanned}** server${guildsScanned === 1 ? '' : 's'}.`;
    } else {
        header += `-# Showing **${start + 1}-${start + slice.length}** of **${items.length}** emojis across **${guildsScanned}** server${guildsScanned === 1 ? '' : 's'}`;
    }
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(header));

    const filterChips = [];
    if (opts.search) filterChips.push(`\`search: ${opts.search}\``);
    if (opts.animatedOnly) filterChips.push('`animated only`');
    if (opts.staticOnly) filterChips.push('`static only`');
    if (opts.guildFilter) filterChips.push(`\`guild: ${opts.guildFilter}\``);
    if (filterChips.length > 0) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Filters: ${filterChips.join(' • ')}`));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    if (slice.length === 0) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `*Nothing matches the current filters.*\n\n` +
            `Try **🔎 Search** below with a different keyword, or **♻️ Reset** to clear filters and start over.`
        ));
    } else {
        const lines = slice.map((e, i) => {
            const idx = String(start + i + 1).padStart(3, '0');
            const flag = e.animated
                ? '<:Lightning:1473038797540298792> animated'
                : '<:Bookopen:1473038576391557130> static';
            return `\`${idx}.\` ${e.tag} **\`:${e.name}:\`**\n` +
                `> ${flag} • from **${escapeMd(e.guildName)}** • \`${e.id}\``;
        });
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // Nav row
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${ID_PREFIX}_first`).setLabel('≪').setStyle(ButtonStyle.Secondary).setDisabled(page === 0 || items.length === 0),
        new ButtonBuilder().setCustomId(`${ID_PREFIX}_prev`).setLabel('◀').setStyle(ButtonStyle.Primary).setDisabled(page === 0 || items.length === 0),
        new ButtonBuilder().setCustomId(`${ID_PREFIX}_indicator`).setLabel(`${items.length === 0 ? 0 : page + 1} / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`${ID_PREFIX}_next`).setLabel('▶').setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1 || items.length === 0),
        new ButtonBuilder().setCustomId(`${ID_PREFIX}_last`).setLabel('≫').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1 || items.length === 0),
    ));

    // Action row: search / by-id / reset / help
    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${ID_PREFIX}_search`).setLabel('Search').setStyle(ButtonStyle.Primary).setEmoji('🔎'),
        new ButtonBuilder().setCustomId(`${ID_PREFIX}_byid`).setLabel('Steal by ID').setStyle(ButtonStyle.Success).setEmoji('🆔'),
        new ButtonBuilder().setCustomId(`${ID_PREFIX}_reset`).setLabel('Reset').setStyle(ButtonStyle.Secondary).setEmoji('♻️').setDisabled(!hasFilters(opts)),
        new ButtonBuilder().setCustomId(`${ID_PREFIX}_help`).setLabel('Help').setStyle(ButtonStyle.Secondary).setEmoji('❓'),
    );
    container.addActionRowComponents(actionRow);

    // Steal-from-page select
    if (slice.length > 0) {
        const select = new StringSelectMenuBuilder()
            .setCustomId(`${ID_PREFIX}_steal`)
            .setPlaceholder('Pick one or more emojis on this page to steal')
            .setMinValues(1)
            .setMaxValues(Math.min(slice.length, STEAL_LIMIT))
            .addOptions(slice.map((e, i) => ({
                label: `:${e.name}:`.slice(0, 100),
                description: `from ${e.guildName}`.slice(0, 100),
                value: String(start + i),
                emoji: { id: e.id, name: e.name, animated: e.animated },
            })));
        container.addActionRowComponents(new ActionRowBuilder().addComponents(select));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# Tip: tap **🔎 Search** to filter, **🆔 Steal by ID** to grab any emoji you have an ID for • ${BRANDING}`
    ));

    return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

function hasFilters(opts) {
    return !!(opts.search || opts.animatedOnly || opts.staticOnly || opts.guildFilter);
}

/* ─────────────────────── Help / instructions ─────────────────────── */

function buildHelpPayload(browserPage) {
    const container = new ContainerBuilder().setAccentColor(COLORS.INFO);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 🌐 Global Emoji — How to Use`
    ));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `### <:Bookopen:1473038576391557130> Browse\n` +
        `<:Caretright:1473038207221502106> Use the **◀ ▶** buttons to flip through pages\n` +
        `<:Caretright:1473038207221502106> Each entry shows the emoji preview, name, server, and ID\n\n` +
        `### <:Search:1473038053219106847> Search\n` +
        `<:Caretright:1473038207221502106> Click **🔎 Search** to open a search box\n` +
        `<:Caretright:1473038207221502106> Match by **emoji name** (e.g. \`heart\`, \`fire\`, \`pepe\`)\n` +
        `<:Caretright:1473038207221502106> Or filter to a specific server (\`-g <name or id>\`)\n` +
        `<:Caretright:1473038207221502106> Click **♻️ Reset** to clear all filters\n\n` +
        `### <:Toggleon:1473038585501581312> Steal from this page\n` +
        `<:Caretright:1473038207221502106> Pick one or more emojis from the dropdown — they are added to **this server**\n` +
        `<:Caretright:1473038207221502106> Up to **${STEAL_LIMIT}** at a time\n\n` +
        `### 🆔 Steal by ID\n` +
        `<:Caretright:1473038207221502106> Click **🆔 Steal by ID** and paste one or more values:\n` +
        `> • Bare emoji IDs: \`123456789012345678\`\n` +
        `> • Emoji tags: \`<:name:123>\` or \`<a:name:123>\`\n` +
        `> • Mix and match, separated by **spaces, commas, or new lines**\n` +
        `<:Caretright:1473038207221502106> Works even for emojis from servers the bot isn't in (as long as the ID is valid)\n` +
        `<:Caretright:1473038207221502106> Optionally rename in the same modal using the format \`123456789012345678 newname\`\n\n` +
        `### <:Settings:1473037894703779851> Slash equivalents\n` +
        `<:Caretright:1473038207221502106> \`/globalemoji browse search:<text> animated:true\` — search & filter\n` +
        `<:Caretright:1473038207221502106> \`/globalemoji steal-id ids:<id1 id2 …>\` — steal by ID\n\n` +
        `### <:Lightbulbalt:1473038470787240009> Notes\n` +
        `<:Caretright:1473038207221502106> Bot's internal emoji servers are hidden — only public, real servers show up\n` +
        `<:Caretright:1473038207221502106> You need **Manage Expressions** to add emojis to this server\n` +
        `<:Caretright:1473038207221502106> Sessions expire after **5 minutes** of inactivity`
    ));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${ID_PREFIX}_back:${browserPage}`).setLabel('Back to browser').setStyle(ButtonStyle.Secondary).setEmoji('◀'),
    ));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
    return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

/* ─────────────────────── Steal results ─────────────────────── */

function buildStealResultPayload(ok, fail, browserPage) {
    const lines = [];
    if (ok.length > 0) {
        lines.push(`### <:Checkedbox:1473038547165384804> Added (${ok.length})`);
        for (const { emoji, source } of ok) {
            const provenance = source.guildName === 'Direct ID' ? 'via direct ID' : `from **${escapeMd(source.guildName)}**`;
            lines.push(`> ${emoji} \`:${emoji.name}:\` — ${provenance}`);
        }
    }
    if (fail.length > 0) {
        if (lines.length > 0) lines.push('');
        lines.push(`### <:Cancel:1473037949187657818> Failed (${fail.length})`);
        for (const { source, reason } of fail) {
            lines.push(`> \`:${source.name || 'unknown'}:\` (\`${source.id}\`) — ${reason}`);
        }
    }

    const accent = ok.length > 0 ? 0x57F287 : (COLORS.ERROR || 0xED4245);
    const container = new ContainerBuilder().setAccentColor(accent);

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 🌐 Emoji Steal Results\n` +
        `-# ${ok.length} succeeded, ${fail.length} failed`
    ));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n') || '*No emojis were processed.*'));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${ID_PREFIX}_back:${browserPage}`).setLabel('Back to browser').setStyle(ButtonStyle.Secondary).setEmoji('◀'),
    ));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
    return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

/* ─────────────────────── Steal logic ─────────────────────── */

async function performSteal(guild, actor, picks) {
    const ok = [];
    const fail = [];
    for (const source of picks) {
        try {
            const created = await guild.emojis.create({
                attachment: source.url,
                name: sanitizeName(source.name, 'stolen_emoji'),
                reason: `Stolen via globalemoji by ${actor.username}`,
            });
            ok.push({ emoji: created, source });
        } catch (err) {
            fail.push({ source, reason: explainEmojiError(err) });
        }
    }
    return { ok, fail };
}

/**
 * Resolve every entry in `parsedIds` to a real emoji source object.
 * Looks up the in-cache emoji first (if the ID happens to belong to a
 * guild the bot can already see), otherwise probes the CDN.
 */
async function resolveByIds(client, parsedIds) {
    const resolved = [];
    const missing = [];
    for (const entry of parsedIds.slice(0, STEAL_LIMIT)) {
        // Try the in-memory cache first — preserves animated flag, real name, guild attribution.
        let cached = null;
        for (const guild of client.guilds.cache.values()) {
            const e = guild.emojis.cache.get(entry.id);
            if (e) { cached = { e, guild }; break; }
        }
        if (cached) {
            resolved.push({
                id: cached.e.id,
                name: sanitizeName(entry.name || cached.e.name, 'stolen_emoji'),
                animated: !!cached.e.animated,
                guildId: cached.guild.id,
                guildName: cached.guild.name,
                url: cached.e.imageURL({ size: 128 }) || `https://cdn.discordapp.com/emojis/${cached.e.id}.${cached.e.animated ? 'gif' : 'png'}`,
                tag: cached.e.toString(),
            });
            continue;
        }
        const probed = await fetchEmojiById(entry.id, entry.name);
        if (probed) resolved.push(probed);
        else missing.push({ id: entry.id, name: entry.name || null });
    }
    return { resolved, missing };
}

/* ─────────────────────── Modal handlers ─────────────────────── */

function buildSearchModal() {
    return new ModalBuilder()
        .setCustomId(`${ID_PREFIX}_search_modal`)
        .setTitle('Search Global Emojis')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q')
                    .setLabel('Emoji name (partial match)')
                    .setPlaceholder('e.g. heart, fire, pepe — leave blank to clear')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(100),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('guild')
                    .setLabel('Server name or ID (optional)')
                    .setPlaceholder('e.g. xnico, 123456789012345678')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(100),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('mode')
                    .setLabel('Type filter (optional)')
                    .setPlaceholder('animated / static / leave blank for all')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(20),
            ),
        );
}

function buildIdModal() {
    return new ModalBuilder()
        .setCustomId(`${ID_PREFIX}_byid_modal`)
        .setTitle('Steal Emojis by ID')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('ids')
                    .setLabel(`Emoji IDs or tags (max ${STEAL_LIMIT})`)
                    .setPlaceholder('123…, <:name:123>, <a:name:123> — separated by space, comma, or newline')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(2000),
            ),
        );
}

/* ─────────────────────── Collector ─────────────────────── */

function attachCollector(panelMessage, ownerId) {
    const collector = panelMessage.createMessageComponentCollector({
        filter: (i) => i.user.id === ownerId && i.customId.startsWith(`${ID_PREFIX}_`),
        time: TIMEOUT_MS,
    });

    collector.on('collect', async (i) => {
        const state = getScan(panelMessage.id);
        if (!state) {
            await i.update({ components: [buildExpiredPanel('globalemoji')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            return;
        }

        // ── Pagination ──
        if (i.customId === `${ID_PREFIX}_first`) state.page = 0;
        else if (i.customId === `${ID_PREFIX}_prev`)  state.page = Math.max(0, state.page - 1);
        else if (i.customId === `${ID_PREFIX}_next`)  state.page = Math.min(state.totalPages - 1, state.page + 1);
        else if (i.customId === `${ID_PREFIX}_last`)  state.page = state.totalPages - 1;
        else if (i.customId.startsWith(`${ID_PREFIX}_back:`)) {
            state.page = parseInt(i.customId.split(':')[1] || '0', 10) || 0;
        }
        // ── Help / Reset ──
        else if (i.customId === `${ID_PREFIX}_help`) {
            await i.update(buildHelpPayload(state.page)).catch(() => {});
            return;
        }
        else if (i.customId === `${ID_PREFIX}_reset`) {
            state.opts.search = '';
            state.opts.animatedOnly = false;
            state.opts.staticOnly = false;
            state.opts.guildFilter = '';
            applyFilters(i.client, state);
        }
        // ── Modals ──
        else if (i.customId === `${ID_PREFIX}_search`) {
            await i.showModal(buildSearchModal()).catch(() => {});
            return;
        }
        else if (i.customId === `${ID_PREFIX}_byid`) {
            if (!checkExpressionPerms(i.member)) {
                await i.reply({ components: [buildPermissionDenied('Manage Expressions')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
                return;
            }
            await i.showModal(buildIdModal()).catch(() => {});
            return;
        }
        // ── Steal selection ──
        else if (i.customId === `${ID_PREFIX}_steal`) {
            if (!checkExpressionPerms(i.member)) {
                await i.reply({ components: [buildPermissionDenied('Manage Expressions')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
                return;
            }
            const indices = i.values.map(v => parseInt(v, 10)).filter(n => !isNaN(n));
            const picks = indices.map(idx => state.items[idx]).filter(Boolean);
            if (picks.length === 0) {
                await i.deferUpdate().catch(() => {});
                return;
            }
            await i.deferUpdate().catch(() => {});
            const { ok, fail } = await performSteal(i.guild, i.user, picks);
            await panelMessage.edit(buildStealResultPayload(ok, fail, state.page)).catch(() => {});
            return;
        }
        else {
            await i.deferUpdate().catch(() => {});
            return;
        }

        await i.update(buildBrowserPayload(state)).catch(() => {});
    });

    // ── Modal submissions piggyback on the same collector via a dedicated
    // listener. The handler is captured by reference so we can detach it
    // when the collector ends to prevent listener leaks.
    const modalHandler = async (modalInteraction) => {
        if (!modalInteraction.isModalSubmit()) return;
        if (modalInteraction.user.id !== ownerId) return;
        if (!modalInteraction.customId.startsWith(`${ID_PREFIX}_`)) return;
        const state = getScan(panelMessage.id);
        if (!state) return;

        if (modalInteraction.customId === `${ID_PREFIX}_search_modal`) {
            const q = modalInteraction.fields.getTextInputValue('q')?.trim() || '';
            const guildVal = modalInteraction.fields.getTextInputValue('guild')?.trim() || '';
            const modeVal = (modalInteraction.fields.getTextInputValue('mode')?.trim() || '').toLowerCase();
            state.opts.search = q;
            state.opts.guildFilter = guildVal;
            state.opts.animatedOnly = modeVal === 'animated' || modeVal === 'a';
            state.opts.staticOnly = modeVal === 'static' || modeVal === 's';
            applyFilters(modalInteraction.client, state);
            await modalInteraction.update(buildBrowserPayload(state)).catch(() => {});
            return;
        }

        if (modalInteraction.customId === `${ID_PREFIX}_byid_modal`) {
            if (!checkExpressionPerms(modalInteraction.member)) {
                await modalInteraction.reply({ components: [buildPermissionDenied('Manage Expressions')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
                return;
            }
            const raw = modalInteraction.fields.getTextInputValue('ids') || '';
            const parsed = parseEmojiIdInput(raw);
            if (parsed.length === 0) {
                await modalInteraction.reply({
                    components: [buildErrorResponse(
                        'No IDs Found',
                        'Provide one or more emoji IDs or tags.',
                        'Examples:\n`123456789012345678`\n`<:pepe:123>` `<a:dance:456>`'
                    )],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                }).catch(() => {});
                return;
            }
            await modalInteraction.deferUpdate().catch(() => {});
            const { resolved, missing } = await resolveByIds(modalInteraction.client, parsed);
            const { ok, fail } = await performSteal(modalInteraction.guild, modalInteraction.user, resolved);
            for (const m of missing) {
                fail.push({ source: { id: m.id, name: m.name || 'unknown' }, reason: 'No emoji found at that ID' });
            }
            await panelMessage.edit(buildStealResultPayload(ok, fail, state.page)).catch(() => {});
        }
    };
    panelMessage.client.on('interactionCreate', modalHandler);

    collector.on('end', async () => {
        panelMessage.client.removeListener('interactionCreate', modalHandler);
        clearScan(panelMessage.id);
        const expired = buildExpiredPanel('globalemoji');
        await panelMessage.edit({ components: [expired], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });
}

function applyFilters(client, state) {
    const { items, guildsScanned } = flattenEmojis(client, state.opts);
    state.items = items;
    state.guildsScanned = guildsScanned;
    state.totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    state.page = 0;
}

/* ─────────────────────── Entrypoint ─────────────────────── */

async function runBrowser(client, opts, replyHandle) {
    const { items, guildsScanned } = flattenEmojis(client, opts);
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const state = { items, page: 0, totalPages, opts, guildsScanned };
    const payload = buildBrowserPayload(state);

    const panelMessage = await replyHandle(payload);
    if (!panelMessage) return;
    setScan(panelMessage.id, state);
    attachCollector(panelMessage, opts.ownerId);
}

async function runStealById(client, guild, user, rawInput, replyHandle) {
    const parsed = parseEmojiIdInput(rawInput);
    if (parsed.length === 0) {
        const container = buildErrorResponse(
            'No IDs Found',
            'Provide one or more emoji IDs or tags.',
            'Examples:\n`123456789012345678`\n`<:pepe:123>` `<a:dance:456>`\nMix snowflakes & tags, separated by spaces, commas, or newlines.'
        );
        await replyHandle({ components: [container], flags: MessageFlags.IsComponentsV2 });
        return;
    }
    const { resolved, missing } = await resolveByIds(client, parsed);
    const { ok, fail } = await performSteal(guild, user, resolved);
    for (const m of missing) {
        fail.push({ source: { id: m.id, name: m.name || 'unknown' }, reason: 'No emoji found at that ID' });
    }
    await replyHandle(buildStealResultPayload(ok, fail, 0));
}

/* ─────────────────────── Module exports ─────────────────────── */

module.exports = {
    data: new SlashCommandBuilder()
        .setName('globalemoji')
        .setDescription('Browse every emoji across the bot’s servers and steal what you like')
        .addSubcommand(s => s
            .setName('browse')
            .setDescription('Open the interactive emoji browser with search & pagination')
            .addStringOption(o => o.setName('search').setDescription('Filter by emoji name'))
            .addBooleanOption(o => o.setName('animated').setDescription('Show only animated emojis'))
            .addBooleanOption(o => o.setName('static').setDescription('Show only static emojis'))
            .addStringOption(o => o.setName('guild').setDescription('Filter by server name or ID')))
        .addSubcommand(s => s
            .setName('steal-id')
            .setDescription('Steal one or more emojis directly by their ID or tag')
            .addStringOption(o => o.setName('ids').setDescription('IDs or tags, separated by spaces/commas/newlines').setRequired(true)))
        .addSubcommand(s => s
            .setName('help')
            .setDescription('How to use globalemoji')),

    prefix: 'globalemoji',
    description: 'Browse every emoji across the bot’s servers and steal by name or ID',
    usage: 'globalemoji [search] [-a animated] [-s static] [-g <guild>]  •  globalemoji id <ids…>',
    category: 'utility',
    aliases: ['gemoji', 'emojibrowse', 'allemojis'],
    permissions: ['ManageGuildExpressions'],

    async execute(interaction) {
        if (!checkExpressionPerms(interaction.member)) {
            return interaction.reply({
                components: [buildPermissionDenied('Manage Expressions')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'help') {
            return interaction.reply({ ...buildHelpPayload(0), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        if (sub === 'steal-id') {
            const raw = interaction.options.getString('ids');
            await interaction.deferReply();
            await runStealById(interaction.client, interaction.guild, interaction.user, raw, async (payload) => {
                return interaction.editReply(payload);
            });
            return;
        }

        // browse
        const opts = {
            search: interaction.options.getString('search') || '',
            animatedOnly: !!interaction.options.getBoolean('animated'),
            staticOnly: !!interaction.options.getBoolean('static'),
            guildFilter: interaction.options.getString('guild') || '',
            ownerId: interaction.user.id,
        };
        if (opts.animatedOnly && opts.staticOnly) {
            const container = buildErrorResponse(
                'Conflicting Filters',
                'You cannot pick both **animated** and **static** at the same time.',
                'Choose one filter or leave both off to see everything.'
            );
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        await interaction.deferReply();
        await runBrowser(interaction.client, opts, async (payload) => {
            return interaction.editReply(payload);
        });
    },

    async executePrefix(message, args) {
        if (!message.guild) {
            return message.reply('<:Cancel:1473037949187657818> This command can only be used in a server.').catch(() => {});
        }
        if (!checkExpressionPerms(message.member)) {
            return message.reply({ components: [buildPermissionDenied('Manage Expressions')], flags: MessageFlags.IsComponentsV2 });
        }

        // -globalemoji help / -globalemoji id <ids…>
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'help' || sub === '--help' || sub === '-h') {
            return message.reply({ ...buildHelpPayload(0), flags: MessageFlags.IsComponentsV2 });
        }
        if (sub === 'id' || sub === 'ids' || sub === 'steal-id') {
            const raw = args.slice(1).join(' ');
            return runStealById(message.client, message.guild, message.author, raw, async (payload) => {
                return message.reply(payload);
            });
        }

        const opts = parsePrefixArgs(args);
        opts.ownerId = message.author.id;
        if (opts.animatedOnly && opts.staticOnly) {
            const container = buildErrorResponse(
                'Conflicting Filters',
                'You cannot pick both `-a` (animated) and `-s` (static) at the same time.',
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        await runBrowser(message.client, opts, async (payload) => {
            return message.reply(payload);
        });
    },
};

function parsePrefixArgs(args) {
    const opts = { search: '', animatedOnly: false, staticOnly: false, guildFilter: '' };
    const remaining = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '-a' || a === '--animated') opts.animatedOnly = true;
        else if (a === '-s' || a === '--static') opts.staticOnly = true;
        else if (a === '-g' || a === '--guild') {
            opts.guildFilter = args[i + 1] || '';
            i++;
        } else {
            remaining.push(a);
        }
    }
    opts.search = remaining.join(' ').trim();
    return opts;
}
