/**
 * Action Command Factory — generates all 29 action commands (hug, kiss, etc.)
 * from a simple config object. Each command fetches an anime GIF from
 * nekos.best → waifu.pics → Tenor → GIPHY → hardcoded fallbacks.
 *
 * Professional CV2 container layout:
 *   ┌─────────────────────────────────────────┐
 *   │ [emoji] Author verbed Target!           │
 *   │                                         │
 *   │ ┌─────────────────────────────────────┐ │
 *   │ │           Anime GIF                 │ │
 *   │ └─────────────────────────────────────┘ │
 *   │                                         │
 *   │ -# emoji Author ▸ Target               │
 *   └─────────────────────────────────────────┘
 */

'use strict';

const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags
} = require('discord.js');
const { buildErrorResponse } = require('./responseBuilder');
const { resolveUser } = require('./resolveUser');

// ── Custom emoji map for professional styling ────────────────────────────
const ACTION_EMOJIS = {
    hug:       '<:Heartalt:1473038488893526016>',
    kiss:      '<:Heartalt:1473038488893526016>',
    cuddle:    '<:Heartalt:1473038488893526016>',
    handhold:  '<:Heartalt:1473038488893526016>',
    peck:      '<:Heartalt:1473038488893526016>',
    pat:       '<:Star:1473038501766369300>',
    pet:       '<:Star:1473038501766369300>',
    praise:    '<:Star:1473038501766369300>',
    highfive:  '<:Checkedbox:1473038547165384804>',
    wave:      '<:Checkedbox:1473038547165384804>',
    celebrate: '<:Checkedbox:1473038547165384804>',
    salute:    '<:Checkedbox:1473038547165384804>',
    smile:     '<:Checkedbox:1473038547165384804>',
    wink:      '<:Checkedbox:1473038547165384804>',
    dance:     '<:Music:1473039311057190972>',
    laugh:     '<:Music:1473039311057190972>',
    blush:     '<:Music:1473039311057190972>',
    bite:      '<:Fire:1473038604812161218>',
    bonk:      '<:Fire:1473038604812161218>',
    slap:      '<:Fire:1473038604812161218>',
    punch:     '<:Fire:1473038604812161218>',
    poke:      '<:Lightning:1473038797540298792>',
    tickle:    '<:Lightning:1473038797540298792>',
    feed:      '<:Lightning:1473038797540298792>',
    cry:       '<:Cancel:1473037949187657818>',
    facepalm:  '<:Cancel:1473037949187657818>',
    stare:     '<:Eye:1473038435056095242>',
    yawn:      '<:Clock:1473039102113878056>',
    stretch:   '<:Clock:1473039102113878056>',
};

// Accent colors per action mood
const ACTION_COLORS = {
    love:    0xE91E63,  // pink — hug, kiss, cuddle, handhold, peck
    happy:   0x57F287,  // green — pat, pet, praise, highfive, wave, celebrate, salute, smile, wink
    fun:     0xFEE75C,  // yellow — dance, laugh, blush, tickle, poke, feed
    attack:  0xED4245,  // red — bite, bonk, slap, punch
    sad:     0x5865F2,  // blurple — cry, facepalm, stare, yawn, stretch
};

const ACTION_MOOD = {
    hug: 'love', kiss: 'love', cuddle: 'love', handhold: 'love', peck: 'love',
    pat: 'happy', pet: 'happy', praise: 'happy', highfive: 'happy', wave: 'happy',
    celebrate: 'happy', salute: 'happy', smile: 'happy', wink: 'happy',
    dance: 'fun', laugh: 'fun', blush: 'fun', tickle: 'fun', poke: 'fun', feed: 'fun',
    bite: 'attack', bonk: 'attack', slap: 'attack', punch: 'attack',
    cry: 'sad', facepalm: 'sad', stare: 'sad', yawn: 'sad', stretch: 'sad',
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

// ── GIF fetching (multi-source with fallback) ────────────────────────────

async function fetchAnimeGif(query, fallbacks, nekosName = null, waifuName = null) {
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

    // 3. Tenor API v2
    const tenorKey = process.env.TENOR_API_KEY;
    if (tenorKey) {
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

    // 4. GIPHY API
    const giphyKey = process.env.GIPHY_API_KEY;
    if (giphyKey) {
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

    // 5. Hardcoded fallback
    return getRandomElement(fallbacks);
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
    const mood = ACTION_MOOD[actionName] || 'happy';
    const accentColor = ACTION_COLORS[mood] || 0x2b2d31;
    const authorAvatar = getAvatarUrl(author, 512);
    const targetAvatar = getAvatarUrl(target, 512);

    const container = new ContainerBuilder()
        .setAccentColor(accentColor);

    // Header section: action text + author avatar
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${customEmoji} **${author.globalName || author.username}** ${verb} **${target.globalName || target.username}**!`
                )
            )
            .setThumbnailAccessory(
                new ThumbnailBuilder().setURL(authorAvatar).setDescription(`${author.username}`)
            )
    );

    // GIF visual
    if (gifUrl) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder()
                .addItems(new MediaGalleryItemBuilder().setURL(gifUrl))
        );
    }

    // Footer section: subtle info + target avatar
    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `-# ${customEmoji} **${author.username}** ▸ **${target.username}**`
                )
            )
            .setThumbnailAccessory(
                new ThumbnailBuilder().setURL(targetAvatar).setDescription(`${target.username}`)
            )
    );

    return container;
}

// ── Factory ──────────────────────────────────────────────────────────────

function createActionCommand(opts) {
    const nekosName = opts.nekosEndpoint ?? opts.name;
    const waifuName = opts.waifuEndpoint ?? opts.name;

    return {
        data: new SlashCommandBuilder()
            .setName(opts.name)
            .setDescription(opts.description)
            .addUserOption(option =>
                option.setName('user')
                    .setDescription(`The user to ${opts.name}`)
                    .setRequired(true)),
        prefix: opts.name,
        description: opts.description,
        usage: `${opts.name} <@user>`,
        category: 'action',
        aliases: opts.aliases || [],
        dmAllowed: true,

        async execute(interaction) {
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
            const gif = await fetchAnimeGif(opts.searchQuery, opts.fallbackGifs, nekosName, waifuName);
            const container = buildActionContainer(
                interaction.user, target, opts.verb, opts.emoji, gif, opts.name
            );
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        },

        async executePrefix(message, args) {
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

            const gif = await fetchAnimeGif(opts.searchQuery, opts.fallbackGifs, nekosName, waifuName);
            const container = buildActionContainer(
                message.author, target, opts.verb, opts.emoji, gif, opts.name
            );
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    };
}

module.exports = { createActionCommand, fetchAnimeGif, buildActionContainer, getRandomElement, selectMediaUrl };
