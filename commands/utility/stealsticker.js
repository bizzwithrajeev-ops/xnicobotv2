const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { COLORS, BRANDING, buildProgressResponse } = require('../../utils/responseBuilder');

/* ── Supported image content types for sticker ── */
const VALID_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/apng'];

/* ── Resolve sticker format extension ── */
function getStickerExtension(format) {
    switch (format) {
        case 4:  return 'gif';
        case 2:  return 'png';
        case 3:  return 'json';
        default: return 'png';
    }
}

/* ── Format label for display ── */
function formatLabel(format) {
    switch (format) {
        case 4: return 'GIF';
        case 2: return 'APNG';
        default: return 'PNG';
    }
}

/* ── Validate and extract Unicode emoji for sticker tag ── */
function extractUnicodeEmoji(str) {
    if (!str) return null;
    const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})(\uFE0F|\u200D|\p{Emoji_Presentation}|\p{Extended_Pictographic})*/u;
    const match = str.match(emojiRegex);
    return match ? match[0] : null;
}

/* ── Parse custom emojis from a string ── */
function parseCustomEmojis(text) {
    const regex = /<(a?):(\w+):(\d{15,})>/g;
    const results = [];
    const seen = new Set();
    let m;
    while ((m = regex.exec(text)) !== null) {
        if (seen.has(m[3])) continue;
        seen.add(m[3]);
        results.push({
            type: 'emoji',
            animated: m[1] === 'a',
            name: m[2],
            id: m[3],
            url: `https://cdn.discordapp.com/emojis/${m[3]}.${m[1] === 'a' ? 'gif' : 'png'}?size=320`,
            format: m[1] === 'a' ? 4 : 1
        });
    }
    return results;
}

/* ── Parse sticker error codes ── */
function getErrorMessage(error) {
    if (error.code === 30039)  return 'Server sticker slots are full! Your server needs more boosts.';
    if (error.code === 50013)  return 'I don\'t have **Manage Guild Expressions** permission!';
    if (error.code === 50046)  return 'The file is too large. Max sticker size is **512 KB**.';
    if (error.code === 50006)  return 'Could not download the source. The URL may be invalid or expired.';
    if (error.message?.includes('size'))  return 'File is too large! Max sticker size is 512 KB.';
    if (error.message?.includes('boost')) return 'Your server needs more boosts to upload stickers.';
    if (error.message?.includes('Invalid Form Body')) return 'Invalid sticker data. Name must be 2-30 characters, tag must be a standard emoji.';
    return `${error.message || 'Unknown error'}`;
}

/* ── Source label for display ── */
function sourceLabel(src) {
    switch (src) {
        case 'emoji': return '`emoji → sticker`';
        case 'attachment': return '`attachment`';
        case 'url': return '`image URL`';
        default: return '';
    }
}

/* ── Build success container (single sticker) ── */
function buildSuccess(sticker, source) {
    const badge = sourceLabel(source);
    return new ContainerBuilder()
        .setAccentColor(COLORS.SUCCESS)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# <:Checkedbox:1473038547165384804> Sticker Stolen!\n\n` +
                `**Name:** ${sticker.name}\n` +
                `**Tags:** ${sticker.tags}\n` +
                `**Format:** ${formatLabel(sticker.format)}` +
                (badge ? `\n**Source:** ${badge}` : '')
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
}

/* ── Build multi-result container ── */
function buildMultiResult(ok, fail) {
    const lines = [];
    if (ok.length) {
        lines.push(`**<:Checkedbox:1473038547165384804> Added (${ok.length}):**`);
        for (const { sticker, source } of ok) {
            const badge = sourceLabel(source);
            lines.push(`> **${sticker.name}** — ${formatLabel(sticker.format)} ${badge}`);
        }
    }
    if (fail.length) {
        if (ok.length) lines.push('');
        lines.push(`**<:Cancel:1473037949187657818> Failed (${fail.length}):**`);
        for (const { name, reason, source } of fail) {
            const badge = sourceLabel(source);
            lines.push(`> **${name}** — ${reason} ${badge}`);
        }
    }
    const ctr = new ContainerBuilder()
        .setAccentColor(fail.length && !ok.length ? COLORS.ERROR : COLORS.SUCCESS);
    ctr.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# ${ok.length ? '<:Toggleon:1473038585501581312>' : '<:Toggleoff:1473038582813032590>'} Steal Sticker Results\n\n${lines.join('\n')}`
        )
    );
    ctr.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    ctr.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
    return ctr;
}

/* ── Build error container ── */
function buildError(title, desc) {
    return new ContainerBuilder()
        .setAccentColor(COLORS.ERROR)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> ${title}\n\n${desc}`)
        );
}

/* ── Resolve sticker from various inputs ── */
async function resolveSticker(client, input, repliedMessage) {
    // 1. Check replied message for stickers
    if (repliedMessage?.stickers?.size > 0) {
        const sticker = repliedMessage.stickers.first();
        try {
            const fullSticker = await client.rest.get(`/stickers/${sticker.id}`);
            return {
                id: sticker.id,
                name: fullSticker.name || sticker.name,
                format: fullSticker.format_type || 1,
                tags: fullSticker.tags || '😀',
                description: fullSticker.description || '',
                type: 'sticker'
            };
        } catch {
            return {
                id: sticker.id,
                name: sticker.name,
                format: sticker.format || 1,
                tags: '😀',
                description: '',
                type: 'sticker'
            };
        }
    }

    if (!input) return null;

    // 2. Parse sticker URL: cdn.discordapp.com/stickers/ID.ext or media.discordapp.net/stickers/ID.ext
    const urlMatch = input.match(/stickers\/(\d{15,})\.(\w+)/);
    if (urlMatch) {
        const id = urlMatch[1];
        const ext = urlMatch[2].toLowerCase();
        const formatMap = { png: 1, apng: 2, json: 3, gif: 4 };
        try {
            const fullSticker = await client.rest.get(`/stickers/${id}`);
            return {
                id,
                name: fullSticker.name || 'sticker',
                format: fullSticker.format_type || formatMap[ext] || 1,
                tags: fullSticker.tags || '😀',
                description: fullSticker.description || '',
                type: 'sticker'
            };
        } catch {
            return { id, name: 'sticker', format: formatMap[ext] || 1, tags: '😀', description: '', type: 'sticker' };
        }
    }

    // 3. URL without extension: stickers/ID
    const idFromUrl = input.match(/stickers\/(\d{15,})/);
    if (idFromUrl) {
        const id = idFromUrl[1];
        try {
            const fullSticker = await client.rest.get(`/stickers/${id}`);
            return {
                id,
                name: fullSticker.name || 'sticker',
                format: fullSticker.format_type || 1,
                tags: fullSticker.tags || '😀',
                description: fullSticker.description || '',
                type: 'sticker'
            };
        } catch {
            return { id, name: 'sticker', format: 1, tags: '😀', description: '', type: 'sticker' };
        }
    }

    // 4. Raw sticker ID
    if (/^\d{15,}$/.test(input.trim())) {
        try {
            const fullSticker = await client.rest.get(`/stickers/${input.trim()}`);
            return {
                id: input.trim(),
                name: fullSticker.name || 'sticker',
                format: fullSticker.format_type || 1,
                tags: fullSticker.tags || '😀',
                description: fullSticker.description || '',
                type: 'sticker'
            };
        } catch {
            return { id: input.trim(), name: 'sticker', format: 1, tags: '😀', description: '', type: 'sticker' };
        }
    }

    return null;
}

/* ── Collect all sticker-creation sources from inputs ── */
async function collectSources(client, textInput, repliedMessage, directAttachments) {
    const sources = [];

    // 1. Try to resolve a native sticker (from reply or text)
    const stickerData = await resolveSticker(client, textInput, repliedMessage);
    if (stickerData && stickerData.format !== 3) {
        sources.push(stickerData);
    }

    // 2. Parse custom emojis from text input → emoji-to-sticker
    if (textInput) {
        for (const e of parseCustomEmojis(textInput)) {
            sources.push(e);
        }
    }

    // 3. Parse custom emojis from replied message content
    if (repliedMessage?.content && !repliedMessage.stickers?.size) {
        for (const e of parseCustomEmojis(repliedMessage.content)) {
            sources.push(e);
        }
    }

    // 4. Direct attachments (slash command attachment or prefix message attachments)
    if (directAttachments?.size) {
        for (const [, att] of directAttachments) {
            if (!att.contentType || !VALID_IMAGE_TYPES.includes(att.contentType)) continue;
            const nameBase = att.name?.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_ ]/g, '').substring(0, 30) || 'sticker';
            sources.push({
                type: 'attachment',
                name: nameBase.length >= 2 ? nameBase : 'sticker',
                url: att.url,
                format: att.contentType === 'image/gif' ? 4 : 1,
                tags: '😀',
                description: ''
            });
        }
    }

    // 5. Attachments from replied message
    if (repliedMessage?.attachments?.size) {
        for (const [, att] of repliedMessage.attachments) {
            if (!att.contentType || !VALID_IMAGE_TYPES.includes(att.contentType)) continue;
            const nameBase = att.name?.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_ ]/g, '').substring(0, 30) || 'sticker';
            sources.push({
                type: 'attachment',
                name: nameBase.length >= 2 ? nameBase : 'sticker',
                url: att.url,
                format: att.contentType === 'image/gif' ? 4 : 1,
                tags: '😀',
                description: ''
            });
        }
    }

    // 6. Image URLs from text (not sticker/emoji CDN)
    if (textInput) {
        const urlRegex = /(https?:\/\/[^\s<>"]+\.(?:png|jpg|jpeg|gif|webp))(?:\?[^\s<>"]*)?/gi;
        let m;
        while ((m = urlRegex.exec(textInput)) !== null) {
            if (/cdn\.discordapp\.com\/emojis\//.test(m[0])) continue;
            if (/stickers\/\d+/.test(m[0])) continue;
            sources.push({
                type: 'url',
                name: 'sticker',
                url: m[0],
                format: /\.gif/i.test(m[1]) ? 4 : 1,
                tags: '😀',
                description: ''
            });
        }
    }

    return sources;
}

/* ── Create the sticker from a source ── */
async function createStickerFromSource(guild, user, source, customName, customEmoji) {
    const name = customName || source.name;
    if (name.length < 2 || name.length > 30) {
        throw new Error(`Sticker name must be 2-30 characters (got ${name.length}).`);
    }

    // Resolve tag
    let tag = '😀';
    if (customEmoji) {
        const extracted = extractUnicodeEmoji(customEmoji);
        if (extracted) tag = extracted;
    } else if (source.tags) {
        const origEmoji = extractUnicodeEmoji(source.tags);
        if (origEmoji) tag = origEmoji;
    }

    // Build the file URL
    let fileUrl;
    if (source.type === 'sticker') {
        const ext = getStickerExtension(source.format);
        fileUrl = `https://media.discordapp.net/stickers/${source.id}.${ext}`;
    } else {
        fileUrl = source.url;
    }

    return guild.stickers.create({
        file: fileUrl,
        name: name,
        tags: tag,
        reason: `Stolen by ${user.username} (source: ${source.type})`
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stealsticker')
        .setDescription('Steal stickers from stickers, emojis, attachments, or image URLs')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
        .addStringOption(option =>
            option.setName('source')
                .setDescription('Sticker URL/ID, emoji, or image URL to add as sticker')
                .setRequired(false))
        .addAttachmentOption(option =>
            option.setName('image')
                .setDescription('Upload an image to add as sticker (PNG/GIF/JPEG/WebP)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Custom name for the sticker (2-30 characters)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('emoji')
                .setDescription('Unicode emoji tag (e.g. 😀) — defaults to 😀')
                .setRequired(false)),

    prefix: 'stealsticker',
    description: 'Steal stickers from stickers, emojis, attachments, or image URLs',
    usage: 'stealsticker <sticker-url/emoji/image> [name] — or reply to a message',
    category: 'utility',
    aliases: ['ss', 'stickerclone', 'stickersteal'],

    async execute(interaction) {
        const sourceInput = interaction.options.getString('source');
        const attachment = interaction.options.getAttachment('image');
        const customName = interaction.options.getString('name');
        const emojiInput = interaction.options.getString('emoji');

        // Try to get the replied message
        let repliedMessage = null;
        try {
            const ref = interaction.message?.reference;
            if (ref?.messageId) {
                repliedMessage = await interaction.channel.messages.fetch(ref.messageId).catch(() => null);
            }
        } catch {}

        // Build attachments map
        const attachments = new Map();
        if (attachment) attachments.set(attachment.id, attachment);

        const sources = await collectSources(interaction.client, sourceInput, repliedMessage, attachments);

        if (!sources.length) {
            return interaction.reply({
                components: [buildError('No Source Provided',
                    '**Supported sources:**\n' +
                    '> • Sticker URL/ID (right-click sticker → Copy Link)\n' +
                    '> • Custom Discord emojis (emoji → sticker)\n' +
                    '> • Image attachments (PNG, GIF, JPEG, WebP)\n' +
                    '> • Image URLs\n' +
                    '> • Reply to a message with a sticker, emoji, or attachment\n\n' +
                    '**Examples:**\n' +
                    '`/stealsticker source:<:emoji:123>` — convert emoji to sticker\n' +
                    '`/stealsticker image:<upload>` — upload image as sticker\n' +
                    'Reply to a sticker/emoji message with `/stealsticker`'
                )],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply();

        // Single source path
        if (sources.length === 1) {
            const source = sources[0];

            if (source.format === 3) {
                return interaction.editReply({
                    components: [buildError('Unsupported Format',
                        'Lottie stickers (animated vector) cannot be cloned. Only **PNG**, **APNG**, and **GIF** are supported.'
                    )],
                    flags: MessageFlags.IsComponentsV2
                });
            }

            try {
                const sticker = await createStickerFromSource(interaction.guild, interaction.user, source, customName, emojiInput);
                return interaction.editReply({
                    components: [buildSuccess(sticker, source.type)],
                    flags: MessageFlags.IsComponentsV2
                });
            } catch (error) {
                console.error('Sticker steal error:', error);
                return interaction.editReply({
                    components: [buildError('Failed to Steal Sticker', getErrorMessage(error))],
                    flags: MessageFlags.IsComponentsV2
                });
            }
        }

        // Multi-source path with progress
        await interaction.editReply({
            components: [buildProgressResponse('Steal Sticker In Progress', 0, sources.length, 'Adding stickers to this server...')],
            flags: MessageFlags.IsComponentsV2
        });

        const ok = [];
        const fail = [];

        for (let i = 0; i < sources.length; i++) {
            const source = sources[i];
            if (source.format === 3) {
                fail.push({ name: source.name, reason: 'Lottie format unsupported', source: source.type });
            } else {
                try {
                    const sticker = await createStickerFromSource(interaction.guild, interaction.user, source, null, emojiInput);
                    ok.push({ sticker, source: source.type });
                } catch (err) {
                    fail.push({ name: source.name, reason: getErrorMessage(err), source: source.type });
                }
            }

            await interaction.editReply({
                components: [buildProgressResponse('Steal Sticker In Progress', i + 1, sources.length, 'Adding stickers to this server...', source.name)],
                flags: MessageFlags.IsComponentsV2
            }).catch(() => null);
        }

        await interaction.editReply({
            components: [buildMultiResult(ok, fail)],
            flags: MessageFlags.IsComponentsV2
        });
    },

    async executePrefix(message, args) {
        // Permission check
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuildExpressions) &&
            !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({
                components: [buildError('Permission Denied', 'You need the **Manage Expressions** permission to use this command.')],
                flags: MessageFlags.IsComponentsV2
            });
        }

        // Check replied message
        let repliedMessage = null;
        if (message.reference?.messageId) {
            repliedMessage = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
        }

        const textInput = args.join(' ') || null;
        const sources = await collectSources(message.client, textInput, repliedMessage, message.attachments);

        if (!sources.length) {
            return message.reply({
                components: [buildError('No Source Provided',
                    '**Supported sources:**\n' +
                    '> • Sticker URL/ID\n' +
                    '> • Custom Discord emojis (emoji → sticker)\n' +
                    '> • Image attachments (upload with your message)\n' +
                    '> • Image URLs\n' +
                    '> • Reply to a sticker, emoji, or attachment message\n\n' +
                    '**Examples:**\n' +
                    '`!stealsticker <:emoji:123>` — convert emoji to sticker\n' +
                    '`!stealsticker` + attach an image\n' +
                    'Reply to a sticker/emoji message with `!stealsticker`'
                )],
                flags: MessageFlags.IsComponentsV2
            });
        }

        // Custom name from tail arg (only for single source)
        let customName = null;
        if (sources.length === 1 && args.length > 0) {
            const lastArg = args[args.length - 1];
            if (!/<(a?):(\w+):(\d{15,})>/.test(lastArg) && !/^https?:\/\//i.test(lastArg) && !/^\d{15,}$/.test(lastArg)) {
                customName = lastArg.substring(0, 30);
            }
        }

        const processing = await message.reply({
            components: [buildProgressResponse('Steal Sticker In Progress', 0, sources.length, 'Adding stickers to this server...')],
            flags: MessageFlags.IsComponentsV2
        }).catch(() => null);

        if (!processing) return;

        // Single source path
        if (sources.length === 1) {
            const source = sources[0];

            if (source.format === 3) {
                return processing.edit({ content: null, components: [buildError('Unsupported Format', 'Lottie stickers cannot be cloned.')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            }

            try {
                const sticker = await createStickerFromSource(message.guild, message.author, source, customName, null);
                return processing.edit({ content: null, components: [buildSuccess(sticker, source.type)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            } catch (error) {
                console.error('Sticker steal error:', error);
                return processing.edit({ content: null, components: [buildError('Failed to Steal Sticker', getErrorMessage(error))], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            }
        }

        // Multi-source path
        const ok = [];
        const fail = [];

        for (let i = 0; i < sources.length; i++) {
            const source = sources[i];
            if (source.format === 3) {
                fail.push({ name: source.name, reason: 'Lottie format unsupported', source: source.type });
            } else {
                try {
                    const sticker = await createStickerFromSource(message.guild, message.author, source, null, null);
                    ok.push({ sticker, source: source.type });
                } catch (err) {
                    fail.push({ name: source.name, reason: getErrorMessage(err), source: source.type });
                }
            }

            await processing.edit({
                components: [buildProgressResponse('Steal Sticker In Progress', i + 1, sources.length, 'Adding stickers to this server...', source.name)],
                flags: MessageFlags.IsComponentsV2
            }).catch(() => null);
        }

        processing.edit({ content: null, components: [buildMultiResult(ok, fail)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }
};
