const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { COLORS, BRANDING, buildProgressResponse } = require('../../utils/responseBuilder');

/* ── Supported image content types for emoji ── */
const VALID_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/* ── Parse all custom emojis from a string ── */
function parseEmojis(text) {
    const regex = /<(a?):(\w+):(\d{15,})>/g;
    const results = [];
    const seen = new Set();
    let m;
    while ((m = regex.exec(text)) !== null) {
        if (seen.has(m[3])) continue;
        seen.add(m[3]);
        results.push({
            animated: m[1] === 'a',
            name: m[2],
            id: m[3],
            url: `https://cdn.discordapp.com/emojis/${m[3]}.${m[1] === 'a' ? 'gif' : 'png'}`,
            source: 'emoji'
        });
    }
    return results;
}

/* ── Resolve sticker format extension ── */
function getStickerExtension(format) {
    switch (format) {
        case 4:  return 'gif';
        case 2:  return 'png';
        case 3:  return 'json';
        default: return 'png';
    }
}

/* ── Extract sticker sources from a message ── */
function extractStickersFromMessage(msg) {
    const results = [];
    if (!msg?.stickers?.size) return results;
    for (const [, sticker] of msg.stickers) {
        if (sticker.format === 3) continue; // skip Lottie
        const ext = getStickerExtension(sticker.format || 1);
        results.push({
            animated: sticker.format === 4 || sticker.format === 2,
            name: sticker.name?.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 32) || 'sticker',
            id: sticker.id,
            url: `https://media.discordapp.net/stickers/${sticker.id}.${ext}?size=128`,
            source: 'sticker'
        });
    }
    return results;
}

/* ── Extract attachment sources from a message ── */
function extractAttachmentsFromMessage(msg) {
    const results = [];
    if (!msg?.attachments?.size) return results;
    for (const [, att] of msg.attachments) {
        if (!att.contentType || !VALID_IMAGE_TYPES.includes(att.contentType)) continue;
        const nameBase = att.name?.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 32) || 'emoji';
        results.push({
            animated: att.contentType === 'image/gif',
            name: nameBase,
            id: null,
            url: att.url,
            source: 'attachment'
        });
    }
    return results;
}

/* ── Parse sticker URL or ID from text ── */
function parseStickerReferences(text) {
    const results = [];
    // Match sticker URLs: cdn.discordapp.com/stickers/ID.ext or media.discordapp.net/stickers/ID.ext
    const urlRegex = /(?:cdn\.discordapp\.com|media\.discordapp\.net)\/stickers\/(\d{15,})\.(\w+)/g;
    let m;
    while ((m = urlRegex.exec(text)) !== null) {
        const ext = m[2].toLowerCase();
        if (ext === 'json') continue; // skip Lottie
        results.push({
            animated: ext === 'gif',
            name: 'sticker',
            id: m[1],
            url: `https://media.discordapp.net/stickers/${m[1]}.${ext}?size=128`,
            source: 'sticker'
        });
    }
    return results;
}

/* ── Parse image URLs from text ── */
function parseImageUrls(text) {
    const results = [];
    const urlRegex = /(https?:\/\/[^\s<>"]+\.(?:png|jpg|jpeg|gif|webp))(?:\?[^\s<>"]*)?/gi;
    let m;
    while ((m = urlRegex.exec(text)) !== null) {
        // skip emoji and sticker CDN URLs (handled separately)
        if (/cdn\.discordapp\.com\/emojis\//.test(m[0])) continue;
        if (/stickers\/\d+/.test(m[0])) continue;
        results.push({
            animated: /\.gif/i.test(m[1]),
            name: 'image',
            id: null,
            url: m[0],
            source: 'url'
        });
    }
    return results;
}

/* ── Collect all emoji sources from all inputs ── */
async function collectSources(client, textInput, repliedMessage, directAttachments) {
    const sources = [];
    const seenIds = new Set();

    // 1. Parse custom emojis from text input
    if (textInput) {
        for (const e of parseEmojis(textInput)) {
            if (e.id && seenIds.has(e.id)) continue;
            if (e.id) seenIds.add(e.id);
            sources.push(e);
        }
    }

    // 2. Parse sticker references from text input
    if (textInput) {
        for (const s of parseStickerReferences(textInput)) {
            if (s.id && seenIds.has(s.id)) continue;
            if (s.id) seenIds.add(s.id);
            sources.push(s);
        }
    }

    // 3. Parse image URLs from text input
    if (textInput) {
        for (const u of parseImageUrls(textInput)) {
            sources.push(u);
        }
    }

    // 4. Direct attachments (from slash command or prefix message)
    if (directAttachments?.size) {
        for (const [, att] of directAttachments) {
            if (!att.contentType || !VALID_IMAGE_TYPES.includes(att.contentType)) continue;
            const nameBase = att.name?.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 32) || 'emoji';
            sources.push({
                animated: att.contentType === 'image/gif',
                name: nameBase,
                id: null,
                url: att.url,
                source: 'attachment'
            });
        }
    }

    // 5. From replied message: emojis in content, stickers, attachments
    if (repliedMessage) {
        if (repliedMessage.content) {
            for (const e of parseEmojis(repliedMessage.content)) {
                if (e.id && seenIds.has(e.id)) continue;
                if (e.id) seenIds.add(e.id);
                sources.push(e);
            }
        }
        for (const s of extractStickersFromMessage(repliedMessage)) {
            if (s.id && seenIds.has(s.id)) continue;
            if (s.id) seenIds.add(s.id);
            sources.push(s);
        }
        for (const a of extractAttachmentsFromMessage(repliedMessage)) {
            sources.push(a);
        }
    }

    return sources;
}

/* ── Source label for display ── */
function sourceLabel(src) {
    switch (src) {
        case 'sticker': return '`sticker → emoji`';
        case 'attachment': return '`attachment`';
        case 'url': return '`image URL`';
        default: return '';
    }
}

/* ── Build result container ── */
function buildResult(ok, fail) {
    const lines = [];
    if (ok.length) {
        lines.push(`**<:Checkedbox:1473038547165384804> Added (${ok.length}):**`);
        for (const { emoji, original } of ok) {
            const badge = sourceLabel(original.source);
            lines.push(`> ${emoji} \`:${emoji.name}:\` ${emoji.animated ? '*(animated)*' : ''} ${badge}`);
        }
    }
    if (fail.length) {
        if (ok.length) lines.push('');
        lines.push(`**<:Cancel:1473037949187657818> Failed (${fail.length}):**`);
        for (const { original, reason } of fail) {
            const badge = sourceLabel(original.source);
            lines.push(`> \`:${original.name}:\` — ${reason} ${badge}`);
        }
    }
    const ctr = new ContainerBuilder()
        .setAccentColor(fail.length && !ok.length ? COLORS.ERROR : COLORS.SUCCESS);
    ctr.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# ${ok.length ? '<:Checkedbox:1473038547165384804>' : '<:Cancel:1473037949187657818>'} Steal Emoji Results\n\n${lines.join('\n')}`
        )
    );
    ctr.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    ctr.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
    return ctr;
}

/* ── Build error container ── */
function buildError(desc) {
    return new ContainerBuilder()
        .setAccentColor(COLORS.ERROR)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Steal Emoji\n\n${desc}`)
        );
}

/* ── Steal emojis core logic ── */
async function stealEmojis(guild, user, sources, onProgress) {
    const ok = [];
    const fail = [];
    let processed = 0;

    if (typeof onProgress === 'function') {
        await onProgress({ current: processed, total: sources.length, emoji: null });
    }

    for (const e of sources) {
        try {
            const created = await guild.emojis.create({
                attachment: e.url,
                name: e.name,
                reason: `Stolen by ${user.username} (source: ${e.source})`
            });
            ok.push({ emoji: created, original: e });
        } catch (err) {
            let reason = err.message;
            if (err.code === 30008) reason = 'Server emoji slots full';
            else if (err.code === 50013) reason = 'Missing permissions';
            else if (err.code === 50035) reason = 'Invalid emoji name or file';
            else if (err.code === 50045) reason = 'Asset too large (max 256 KB)';
            fail.push({ original: e, reason });
        }

        processed++;
        if (typeof onProgress === 'function') {
            await onProgress({ current: processed, total: sources.length, emoji: e });
        }
    }
    return { ok, fail };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stealemoji')
        .setDescription('Steal emojis from emojis, stickers, attachments, or image URLs')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
        .addStringOption(option =>
            option.setName('emojis')
                .setDescription('Emojis, sticker URLs, or image URLs to add as emoji')
                .setRequired(false))
        .addAttachmentOption(option =>
            option.setName('image')
                .setDescription('Upload an image to add as emoji (PNG/GIF/JPEG/WebP)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Custom name (only for single source)')
                .setRequired(false)),

    prefix: 'stealemoji',
    description: 'Steal emojis from emojis, stickers, attachments, or image URLs',
    usage: 'stealemoji <emojis/sticker-url/image-url> [name] — or reply to a message',
    category: 'utility',
    aliases: ['se', 'emojiclone', 'emojisteal'],

    async execute(interaction) {
        const emojiInput = interaction.options.getString('emojis');
        const attachment = interaction.options.getAttachment('image');
        const customName = interaction.options.getString('name');

        // Try to get the replied message
        let repliedMessage = null;
        try {
            const ref = interaction.message?.reference;
            if (ref?.messageId) {
                repliedMessage = await interaction.channel.messages.fetch(ref.messageId).catch(() => null);
            }
        } catch {}

        // Build a fake attachments collection if slash attachment provided
        const attachments = new Map();
        if (attachment) attachments.set(attachment.id, attachment);

        const sources = await collectSources(interaction.client, emojiInput, repliedMessage, attachments);

        if (!sources.length) {
            return interaction.reply({
                components: [buildError(
                    'No valid sources found!\n\n' +
                    '**Supported sources:**\n' +
                    '> • Custom Discord emojis\n' +
                    '> • Stickers (reply to a sticker message or paste sticker URL)\n' +
                    '> • Image attachments (PNG, GIF, JPEG, WebP)\n' +
                    '> • Image URLs\n\n' +
                    '**Examples:**\n' +
                    '`/stealemoji emojis:<:name:123>`\n' +
                    '`/stealemoji image:<upload>` — upload an image\n' +
                    'Reply to a sticker message with `/stealemoji`'
                )],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
        }

        if (sources.length === 1 && customName) {
            sources[0].name = customName.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 32);
        }

        await interaction.deferReply();
        await interaction.editReply({
            components: [buildProgressResponse('Steal Emoji In Progress', 0, sources.length, 'Adding emojis to this server...')],
            flags: MessageFlags.IsComponentsV2
        });

        const { ok, fail } = await stealEmojis(interaction.guild, interaction.user, sources, async ({ current, total, emoji }) => {
            await interaction.editReply({
                components: [buildProgressResponse('Steal Emoji In Progress', current, total, 'Adding emojis to this server...', emoji?.name ? `:${emoji.name}:` : null)],
                flags: MessageFlags.IsComponentsV2
            }).catch(() => null);
        });

        await interaction.editReply({ components: [buildResult(ok, fail)], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        // Permission check
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuildExpressions) &&
            !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({
                components: [buildError('You need **Manage Expressions** permission to steal emojis.')],
                flags: MessageFlags.IsComponentsV2
            });
        }

        // Get replied message
        let repliedMessage = null;
        if (message.reference?.messageId) {
            repliedMessage = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
        }

        const textInput = args.join(' ') || null;
        const sources = await collectSources(message.client, textInput, repliedMessage, message.attachments);

        if (!sources.length) {
            return message.reply({
                components: [buildError(
                    'No valid sources found!\n\n' +
                    '**Supported sources:**\n' +
                    '> • Custom Discord emojis\n' +
                    '> • Stickers (reply to a sticker message or paste sticker URL)\n' +
                    '> • Image attachments (upload with your message)\n' +
                    '> • Image URLs\n\n' +
                    '**Examples:**\n' +
                    '`!stealemoji <:name:123>`\n' +
                    '`!stealemoji` + attach an image\n' +
                    'Reply to a sticker message with `!stealemoji`'
                )],
                flags: MessageFlags.IsComponentsV2
            });
        }

        // Custom name: if last arg isn't a recognized token, use it as name for single source
        if (sources.length === 1 && args.length > 0) {
            const lastArg = args[args.length - 1];
            if (!/<(a?):(\w+):(\d{15,})>/.test(lastArg) && !/^https?:\/\//i.test(lastArg)) {
                sources[0].name = lastArg.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 32);
            }
        }

        const progressMessage = await message.reply({
            components: [buildProgressResponse('Steal Emoji In Progress', 0, sources.length, 'Adding emojis to this server...')],
            flags: MessageFlags.IsComponentsV2
        });

        const { ok, fail } = await stealEmojis(message.guild, message.author, sources, async ({ current, total, emoji }) => {
            await progressMessage.edit({
                components: [buildProgressResponse('Steal Emoji In Progress', current, total, 'Adding emojis to this server...', emoji?.name ? `:${emoji.name}:` : null)],
                flags: MessageFlags.IsComponentsV2
            }).catch(() => null);
        });

        progressMessage.edit({ components: [buildResult(ok, fail)], flags: MessageFlags.IsComponentsV2 });
    }
};
