const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('./responseBuilder');

// Nekos.best API endpoints for anime actions (free, no key required)
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

// Waifu.pics SFW endpoints (free, no key required - secondary API)
const WAIFU_PICS_ENDPOINTS = new Set([
    'bite', 'bonk', 'bully', 'cry', 'cuddle', 'dance', 'handhold',
    'happy', 'highfive', 'hug', 'kick', 'kill', 'kiss', 'nom',
    'pat', 'poke', 'punch', 'slap', 'smile', 'wave', 'wink', 'yeet'
]);

/**
 * Fetch anime GIF from nekos.best API → waifu.pics → Tenor → GIPHY → fallback
 * @param {string} query - Search query for Tenor/GIPHY
 * @param {string[]} fallbacks - Fallback GIF URLs
 * @param {string|null} nekosName - nekos.best endpoint name
 * @param {string|null} waifuName - waifu.pics endpoint name (defaults to nekosName)
 */
async function fetchAnimeGif(query, fallbacks, nekosName = null, waifuName = null) {
    waifuName = waifuName ?? nekosName;

    // 1. Try nekos.best API (free, dedicated anime endpoints)
    if (nekosName && NEKOS_BEST_ENDPOINTS.has(nekosName)) {
        try {
            const res = await fetch(`https://nekos.best/api/v2/${nekosName}`, { signal: AbortSignal.timeout(5000) });
            if (res.ok) {
                const data = await res.json();
                if (data.results?.[0]?.url) return data.results[0].url;
            }
        } catch (e) {
            // Fall through to next source
        }
    }

    // 2. Try waifu.pics API (free, good coverage for action GIFs)
    if (waifuName && WAIFU_PICS_ENDPOINTS.has(waifuName)) {
        try {
            const res = await fetch(`https://api.waifu.pics/sfw/${waifuName}`, { signal: AbortSignal.timeout(5000) });
            if (res.ok) {
                const data = await res.json();
                if (data.url) return data.url;
            }
        } catch (e) {
            // Fall through
        }
    }

    // 3. Try Tenor API v2
    const tenorKey = process.env.TENOR_API_KEY;
    if (tenorKey) {
        try {
            const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${encodeURIComponent(tenorKey)}&client_key=xnicobot&limit=40&media_filter=tinygif,gif`;
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (res.ok) {
                const data = await res.json();
                if (data.results?.length) {
                    const gifUrl = selectMediaUrl(data.results);
                    if (gifUrl) return gifUrl;
                }
            }
        } catch (e) {
            // Fall through
        }
    }

    // 4. Try GIPHY API
    const giphyKey = process.env.GIPHY_API_KEY;
    if (giphyKey) {
        try {
            const url = `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(giphyKey)}&q=${encodeURIComponent(query)}&limit=30&rating=pg-13`;
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (res.ok) {
                const data = await res.json();
                if (data.data?.length) {
                    const gifUrl = selectMediaUrl(data.data, true);
                    if (gifUrl) return gifUrl;
                }
            }
        } catch (e) {
            // Fall through
        }
    }

    // 5. Fallback to hardcoded GIFs
    return getRandomElement(fallbacks);
}

/**
 * Select a random media URL from API results
 */
function selectMediaUrl(items, isGiphy = false) {
    if (!items?.length) return null;
    const pick = getRandomElement(items);

    if (isGiphy) {
        return pick.images?.original?.url || pick.images?.fixed_height?.url;
    }

    const MEDIA_PRIORITIES = ['gif', 'tinygif', 'mediumgif'];
    return MEDIA_PRIORITIES.map(type => pick.media_formats?.[type]?.url).find(url => url);
}

/**
 * Get random element from array
 */
function getRandomElement(array) {
    if (!Array.isArray(array) || array.length === 0) return null;
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Get user avatar URL safely
 */
function getAvatarUrl(user, size = 256) {
    if (typeof user.displayAvatarURL === 'function') {
        return user.displayAvatarURL({ size, extension: 'png' });
    }
    return user.avatarURL({ size }) || user.defaultAvatarURL;
}

/**
 * Build action container with CV2-style layout:
 *   - Section: action text + author avatar thumbnail (right)
 *   - GIF (full-width main visual)
 *   - Section: footer text + target avatar thumbnail (right)
 */
function buildActionContainer(author, target, verb, emoji, gifUrl) {
    const authorAvatar = getAvatarUrl(author, 512);
    const targetAvatar = getAvatarUrl(target, 512);

    const container = new ContainerBuilder()
        .setAccentColor(0x2b2d31);

    // Section 1: action text (left) + author avatar (right side)
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`${emoji} **${author.username}** ${verb} **${target.username}**!`)
            )
            .setThumbnailAccessory(
                new ThumbnailBuilder().setURL(authorAvatar).setDescription(`${author.username}'s avatar`)
            )
    );

    // Main GIF visual (full width)
    container.addMediaGalleryComponents(
        new MediaGalleryBuilder()
            .addItems(new MediaGalleryItemBuilder().setURL(gifUrl))
    );

    // Section 2: footer info (left) + target avatar (right side)
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# ${emoji} **${author.username}** ▸ **${target.username}**`)
            )
            .setThumbnailAccessory(
                new ThumbnailBuilder().setURL(targetAvatar).setDescription(`${target.username}'s avatar`)
            )
    );

    return container;
}

/**
 * Create an action command module.
 * opts.nekosEndpoint - override nekos.best endpoint (defaults to opts.name)
 * opts.waifuEndpoint - override waifu.pics endpoint (defaults to opts.name)
 */
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
                return interaction.reply({
                    components: [buildErrorResponse(`Can't ${opts.name} Yourself`, opts.selfMessage || `Mention someone else to ${opts.name}!`)],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
                });
            }
            await interaction.deferReply();
            const gif = await fetchAnimeGif(opts.searchQuery, opts.fallbackGifs, nekosName, waifuName);
            const container = buildActionContainer(interaction.user, target, opts.verb, opts.emoji, gif);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        },

        async executePrefix(message) {
            const target = message.mentions.users.first();
            if (!target) {
                return message.reply({
                    components: [buildErrorResponse('No User Mentioned', `Mention someone to ${opts.name}!`, `**Example:** \`-${opts.name} @Friend\``)],
                    flags: MessageFlags.IsComponentsV2
                });
            }
            if (!opts.selfAllowed && target.id === message.author.id) {
                return message.reply({
                    components: [buildErrorResponse(`Can't ${opts.name} Yourself`, opts.selfMessage || `Mention someone else to ${opts.name}!`)],
                    flags: MessageFlags.IsComponentsV2
                });
            }
            const gif = await fetchAnimeGif(opts.searchQuery, opts.fallbackGifs, nekosName, waifuName);
            const container = buildActionContainer(message.author, target, opts.verb, opts.emoji, gif);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    };
}

module.exports = { createActionCommand, fetchAnimeGif, buildActionContainer, getRandomElement, selectMediaUrl };
