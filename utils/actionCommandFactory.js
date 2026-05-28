/**
 * Action Command Factory — generates all 29 action commands (hug, kiss, etc.)
 * from a simple config object. Each command fetches an anime GIF from
 * nekos.best → waifu.pics → Tenor → GIPHY → hardcoded fallbacks.
 *
 * Professional CV2 container layout (3-item MediaGallery):
 *   ┌──────────────────────────────────────────────────────┐
 *   │ <emoji> Action Command Executed                      │
 *   │ -# Author <verb> Target                              │
 *   │ ┌──────────────────────────┐ ┌──────────────────┐   │
 *   │ │                          │ │  Author Avatar   │   │
 *   │ │       Action GIF         │ ├──────────────────┤   │
 *   │ │      (large, left)       │ │  Target Avatar   │   │
 *   │ └──────────────────────────┘ └──────────────────┘   │
 *   │ ──────────────────────────────────────────────────── │
 *   │ <emoji> Author <:Caretright:1473038207221502106> Target  ·  <t:now:R>                │
 *   │ -# <:xnico:…> xNico </> · Action System              │
 *   └──────────────────────────────────────────────────────┘
 */

'use strict';

const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags
} = require('discord.js');
const { buildErrorResponse } = require('./responseBuilder');
const { resolveUser } = require('./resolveUser');

// ── Brand constants (kept in sync with utils/responseBuilder.js) ─────────
const BRAND_EMOJI = '<:xnico:1486755083390550036>';
const BRAND_LINE  = `${BRAND_EMOJI} **xNico** \`</>\` · Action System`;
const ARROW_EMOJI = '<:Caretright:1473038207221502106>';

// ── Custom emoji map for professional styling ────────────────────────────
const ACTION_EMOJIS = {
    // Love / affection
    hug:       '<a:HeartCross:1506258489960304800>',
    kiss:      '<a:HeartCross:1506258489960304800>',
    cuddle:    '<a:HeartCross:1506258489960304800>',
    handhold:  '<a:HeartCross:1506258489960304800>',
    peck:      '<a:HeartCross:1506258489960304800>',
    snuggle:   '<a:HeartCross:1506258489960304800>',
    blowkiss:  '<a:HeartCross:1506258489960304800>',
    lappillow: '<a:HeartCross:1506258489960304800>',
    carry:     '<a:HeartCross:1506258489960304800>',

    // Happy / positive
    pat:       '<:Star:1473038501766369300>',
    pet:       '<:Star:1473038501766369300>',
    praise:    '<:Star:1473038501766369300>',
    highfive:  '<:Checkedbox:1473038547165384804>',
    wave:      '<:Checkedbox:1473038547165384804>',
    celebrate: '<:Checkedbox:1473038547165384804>',
    salute:    '<:Checkedbox:1473038547165384804>',
    smile:     '<:Checkedbox:1473038547165384804>',
    wink:      '<:Checkedbox:1473038547165384804>',
    thumbsup:  '<:Checkedbox:1473038547165384804>',
    nod:       '<:Checkedbox:1473038547165384804>',
    handshake: '<:Checkedbox:1473038547165384804>',
    happy:     '<:Star:1473038501766369300>',

    // Fun / playful
    dance:     '<:Music:1473039311057190972>',
    laugh:     '<:Music:1473039311057190972>',
    blush:     '<:Music:1473039311057190972>',
    spin:      '<:Music:1473039311057190972>',
    smug:      '<:Lightning:1473038797540298792>',
    think:     '<:Lightning:1473038797540298792>',

    // Attack / playful violence
    bite:      '<:Fire:1473038604812161218>',
    bonk:      '<:Fire:1473038604812161218>',
    slap:      '<:Fire:1473038604812161218>',
    punch:     '<:Fire:1473038604812161218>',
    yeet:      '<:Fire:1473038604812161218>',
    bully:     '<:Fire:1473038604812161218>',
    baka:      '<:Fire:1473038604812161218>',
    shoot:     '<:Fire:1473038604812161218>',
    tableflip: '<:Fire:1473038604812161218>',
    angry:     '<:Fire:1473038604812161218>',

    // Light teasing / interaction
    poke:      '<:Lightning:1473038797540298792>',
    tickle:    '<:Lightning:1473038797540298792>',
    feed:      '<:Lightning:1473038797540298792>',

    // Sad / passive
    cry:       '<:Cancel:1473037949187657818>',
    facepalm:  '<:Cancel:1473037949187657818>',
    stare:     '<:Eye:1473038435056095242>',
    yawn:      '<:Clock:1473039102113878056>',
    stretch:   '<:Clock:1473039102113878056>',
    sleep:     '<:Clock:1473039102113878056>',
    pout:      '<:Cancel:1473037949187657818>',
    shocked:   '<:Eye:1473038435056095242>',
    shrug:     '<:Cancel:1473037949187657818>',
    bored:     '<:Clock:1473039102113878056>',
    confused:  '<:Eye:1473038435056095242>',
};

// Accent colors per action mood
const ACTION_COLORS = {
    love:   0xE91E63,  // pink
    happy:  0x57F287,  // green
    fun:    0xFEE75C,  // yellow
    attack: 0xED4245,  // red
    sad:    0x5865F2,  // blurple
};

const ACTION_MOOD = {
    // Love
    hug: 'love', kiss: 'love', cuddle: 'love', handhold: 'love', peck: 'love',
    snuggle: 'love', blowkiss: 'love', lappillow: 'love', carry: 'love',

    // Happy
    pat: 'happy', pet: 'happy', praise: 'happy', highfive: 'happy', wave: 'happy',
    celebrate: 'happy', salute: 'happy', smile: 'happy', wink: 'happy',
    thumbsup: 'happy', nod: 'happy', handshake: 'happy', happy: 'happy',

    // Fun
    dance: 'fun', laugh: 'fun', blush: 'fun', tickle: 'fun', poke: 'fun', feed: 'fun',
    spin: 'fun', smug: 'fun', think: 'fun',

    // Attack
    bite: 'attack', bonk: 'attack', slap: 'attack', punch: 'attack',
    yeet: 'attack', bully: 'attack', baka: 'attack',
    shoot: 'attack', tableflip: 'attack', angry: 'attack',

    // Sad
    cry: 'sad', facepalm: 'sad', stare: 'sad', yawn: 'sad', stretch: 'sad',
    sleep: 'sad', pout: 'sad', shocked: 'sad', shrug: 'sad', bored: 'sad', confused: 'sad',
};

// ── API endpoint sets ────────────────────────────────────────────────────

const NEKOS_BEST_ENDPOINTS = new Set([
    'hug', 'kiss', 'pat', 'slap', 'bite', 'cuddle', 'poke', 'tickle',
    'highfive', 'wave', 'wink', 'cry', 'dance', 'blush', 'smile',
    'laugh', 'facepalm', 'stare', 'yawn', 'kick', 'happy',
    'thumbsup', 'handhold', 'shoot', 'baka', 'nod', 'nom',
    'nope', 'bored', 'lurk', 'sleep', 'think', 'yes', 'handshake',
    'bonk', 'punch', 'clap', 'angry', 'carry', 'confused', 'feed',
    'pout', 'run', 'salute', 'shake', 'shocked', 'shrug', 'sip',
    'spin', 'tableflip', 'peck', 'blowkiss', 'kabedon', 'lappillow',
    'smug', 'teehee', 'wag', 'yeet'
]);

const WAIFU_PICS_ENDPOINTS = new Set([
    'bite', 'bonk', 'bully', 'cry', 'cuddle', 'dance', 'handhold',
    'happy', 'highfive', 'hug', 'kick', 'kill', 'kiss', 'nom',
    'pat', 'poke', 'punch', 'slap', 'smile', 'wave', 'wink', 'yeet'
]);

// ── GIF fetching (API-only: nekos.best → waifu.pics → Tenor → GIPHY) ─────

async function fetchAnimeGif(query, _legacyFallbacks, nekosName = null, waifuName = null) {
    waifuName = waifuName ?? nekosName;

    // 1. nekos.best (free, dedicated anime endpoints)
    if (nekosName && NEKOS_BEST_ENDPOINTS.has(nekosName)) {
        try {
            const res = await fetch(`https://nekos.best/api/v2/${nekosName}`, { signal: AbortSignal.timeout(4000) });
            if (res.ok) {
                const data = await res.json();
                if (data.results?.[0]?.url) return data.results[0].url;
            }
        } catch { /* fall through */ }
    }

    // 2. waifu.pics (free, good coverage)
    if (waifuName && WAIFU_PICS_ENDPOINTS.has(waifuName)) {
        try {
            const res = await fetch(`https://api.waifu.pics/sfw/${waifuName}`, { signal: AbortSignal.timeout(4000) });
            if (res.ok) {
                const data = await res.json();
                if (data.url) return data.url;
            }
        } catch { /* fall through */ }
    }

    // 3. Tenor API v2 (requires TENOR_API_KEY)
    const tenorKey = process.env.TENOR_API_KEY;
    if (tenorKey && query) {
        try {
            const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${encodeURIComponent(tenorKey)}&client_key=xnicobot&limit=40&media_filter=tinygif,gif`;
            const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
            if (res.ok) {
                const data = await res.json();
                if (data.results?.length) {
                    const gifUrl = selectMediaUrl(data.results);
                    if (gifUrl) return gifUrl;
                }
            }
        } catch { /* fall through */ }
    }

    // 4. GIPHY API (requires GIPHY_API_KEY)
    const giphyKey = process.env.GIPHY_API_KEY;
    if (giphyKey && query) {
        try {
            const url = `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(giphyKey)}&q=${encodeURIComponent(query)}&limit=30&rating=pg-13`;
            const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
            if (res.ok) {
                const data = await res.json();
                if (data.data?.length) {
                    const gifUrl = selectMediaUrl(data.data, true);
                    if (gifUrl) return gifUrl;
                }
            }
        } catch { /* fall through */ }
    }

    // No source returned a GIF — container will render avatars only.
    return null;
}

function selectMediaUrl(items, isGiphy = false) {
    if (!items?.length) return null;
    const pick = getRandomElement(items);
    if (isGiphy) return pick.images?.original?.url || pick.images?.fixed_height?.url;
    return ['gif', 'tinygif', 'mediumgif'].map(t => pick.media_formats?.[t]?.url).find(u => u);
}

function getRandomElement(array) {
    if (!Array.isArray(array) || array.length === 0) return null;
    return array[Math.floor(Math.random() * array.length)];
}

// ── Container builder ────────────────────────────────────────────────────

function getAvatarUrl(user, size = 256) {
    if (typeof user.displayAvatarURL === 'function') {
        return user.displayAvatarURL({ size, extension: 'png' });
    }
    return user.avatarURL?.({ size }) || user.defaultAvatarURL || 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function buildActionContainer(author, target, verb, emoji, gifUrl, actionName) {
    const customEmoji = ACTION_EMOJIS[actionName] || emoji;
    const mood        = ACTION_MOOD[actionName] || 'happy';
    const accentColor = ACTION_COLORS[mood] || 0x2b2d31;
    const authorAvatar = getAvatarUrl(author, 512);
    const targetAvatar = getAvatarUrl(target, 512);

    const authorName = author.globalName || author.username;
    const targetName = target.globalName || target.username;
    const nowEpoch   = Math.floor(Date.now() / 1000);

    const container = new ContainerBuilder().setAccentColor(accentColor);

    // ── Header ─────────────────────────────────────────────────────────
    // Bold title + subtitle line stating the action sentence.
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `${customEmoji} **Action Command Executed**\n` +
            `-# **${escapeMd(authorName)}** ${verb} **${escapeMd(targetName)}**`
        )
    );

    // ── Hero gallery ───────────────────────────────────────────────────
    // Discord's MediaGallery auto-arranges 3 items as [big | small/small].
    // 1: large action GIF (left)   2: author avatar (top-right)
    //                              3: target avatar (bottom-right)
    if (gifUrl) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder()
                    .setURL(gifUrl)
                    .setDescription(`${authorName} ${verb} ${targetName}`),
                new MediaGalleryItemBuilder()
                    .setURL(authorAvatar)
                    .setDescription(`${author.username} — executor`),
                new MediaGalleryItemBuilder()
                    .setURL(targetAvatar)
                    .setDescription(`${target.username} — target`)
            )
        );
    } else {
        // No GIF available — keep the layout clean with just the avatars.
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder()
                    .setURL(authorAvatar)
                    .setDescription(`${author.username} — executor`),
                new MediaGalleryItemBuilder()
                    .setURL(targetAvatar)
                    .setDescription(`${target.username} — target`)
            )
        );
    }

    // ── Meta line (action summary + timestamp) ─────────────────────────
    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `-# ${customEmoji} **${escapeMd(author.username)}** ${ARROW_EMOJI} ` +
            `**${escapeMd(target.username)}**  ·  <t:${nowEpoch}:R>`
        )
    );

    // ── Branded footer ─────────────────────────────────────────────────
    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small)
    );
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${BRAND_LINE}`)
    );

    return container;
}

// ── Markdown helper ──────────────────────────────────────────────────────
// Escapes characters that would otherwise break Discord markdown when a
// user has special chars in their display name (e.g. `_` `*` `~` `|` `\`).
function escapeMd(str) {
    if (!str) return '';
    return String(str).replace(/([\\*_~`|>])/g, '\\$1');
}

// ── Solo container (no target, e.g. /sleep, /pout, /tableflip) ───────────
function buildSoloActionContainer(author, verb, emoji, gifUrl, actionName) {
    const customEmoji = ACTION_EMOJIS[actionName] || emoji;
    const mood        = ACTION_MOOD[actionName] || 'happy';
    const accentColor = ACTION_COLORS[mood] || 0x2b2d31;
    const authorAvatar = getAvatarUrl(author, 512);
    const authorName   = author.globalName || author.username;
    const nowEpoch     = Math.floor(Date.now() / 1000);

    const container = new ContainerBuilder().setAccentColor(accentColor);

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `${customEmoji} **Action Command Executed**\n` +
            `-# **${escapeMd(authorName)}** ${verb}`
        )
    );

    if (gifUrl) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder()
                    .setURL(gifUrl)
                    .setDescription(`${authorName} ${verb}`),
                new MediaGalleryItemBuilder()
                    .setURL(authorAvatar)
                    .setDescription(`${author.username} — executor`)
            )
        );
    } else {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder()
                    .setURL(authorAvatar)
                    .setDescription(`${author.username} — executor`)
            )
        );
    }

    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `-# ${customEmoji} **${escapeMd(author.username)}**  ·  <t:${nowEpoch}:R>`
        )
    );

    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small)
    );
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${BRAND_LINE}`)
    );

    return container;
}

// ── Factory ──────────────────────────────────────────────────────────────

function createActionCommand(opts) {
    const nekosName = opts.nekosEndpoint ?? opts.name;
    const waifuName = opts.waifuEndpoint ?? opts.name;
    const isSolo    = opts.solo === true;

    const slash = new SlashCommandBuilder()
        .setName(opts.name)
        .setDescription(opts.description);

    if (!isSolo) {
        slash.addUserOption(option =>
            option.setName('user')
                .setDescription(`The user to ${opts.name}`)
                .setRequired(true));
    }

    return {
        data: slash,
        prefix: opts.name,
        description: opts.description,
        usage: isSolo ? opts.name : `${opts.name} <@user>`,
        category: 'action',
        aliases: opts.aliases || [],
        dmAllowed: true,

        async execute(interaction) {
            // ── Solo action path ───────────────────────────────────────
            if (isSolo) {
                await interaction.deferReply();
                const gif = await fetchAnimeGif(opts.searchQuery, null, nekosName, waifuName);
                const container = buildSoloActionContainer(
                    interaction.user, opts.verb, opts.emoji, gif, opts.name
                );
                return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            // ── Targeted action path ───────────────────────────────────
            const target = interaction.options.getUser('user');

            if (!opts.selfAllowed && target.id === interaction.user.id) {
                const errEmoji = ACTION_EMOJIS[opts.name] || opts.emoji;
                return interaction.reply({
                    components: [buildErrorResponse(
                        `Can't ${opts.name} Yourself`,
                        opts.selfMessage || `${errEmoji} Mention someone else to ${opts.name}!`
                    )],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply();
            const gif = await fetchAnimeGif(opts.searchQuery, null, nekosName, waifuName);
            const container = buildActionContainer(
                interaction.user, target, opts.verb, opts.emoji, gif, opts.name
            );
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        },

        async executePrefix(message, args) {
            // ── Solo action path ───────────────────────────────────────
            if (isSolo) {
                const gif = await fetchAnimeGif(opts.searchQuery, null, nekosName, waifuName);
                const container = buildSoloActionContainer(
                    message.author, opts.verb, opts.emoji, gif, opts.name
                );
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            // ── Targeted action path ───────────────────────────────────
            const target = await resolveUser(message, args);

            if (!target) {
                const errEmoji = ACTION_EMOJIS[opts.name] || opts.emoji;
                return message.reply({
                    components: [buildErrorResponse(
                        'No User Mentioned',
                        `${errEmoji} Mention someone to ${opts.name}!`,
                        `**Usage:** \`-${opts.name} @user\``
                    )],
                    flags: MessageFlags.IsComponentsV2
                });
            }

            if (!opts.selfAllowed && target.id === message.author.id) {
                const errEmoji = ACTION_EMOJIS[opts.name] || opts.emoji;
                return message.reply({
                    components: [buildErrorResponse(
                        `Can't ${opts.name} Yourself`,
                        opts.selfMessage || `${errEmoji} Mention someone else to ${opts.name}!`
                    )],
                    flags: MessageFlags.IsComponentsV2
                });
            }

            const gif = await fetchAnimeGif(opts.searchQuery, null, nekosName, waifuName);
            const container = buildActionContainer(
                message.author, target, opts.verb, opts.emoji, gif, opts.name
            );
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    };
}

module.exports = {
    createActionCommand,
    fetchAnimeGif,
    buildActionContainer,
    buildSoloActionContainer,
    getRandomElement,
    selectMediaUrl
};
