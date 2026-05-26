'use strict';

const {
    SlashCommandBuilder, PermissionFlagsBits, MessageFlags,
    ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder,
    SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder,
    ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const {
    buildErrorResponse, buildPermissionDenied, buildExpiredPanel, buildLoadingResponse,
    BRANDING, COLORS,
} = require('../../utils/responseBuilder');
const { resolveAnyInput } = require('../../utils/stealResolver');
const {
    explainEmojiError, explainStickerError, sanitizeName, sanitizeStickerName,
    pickStickerTag,
} = require('../../utils/globalAssetBrowser');

const ID_PREFIX = 'steal';
const PROMPT_TIMEOUT_MS = 90_000;

function checkPerms(member) {
    return !!(
        member?.permissions?.has(PermissionFlagsBits.ManageGuildExpressions) ||
        member?.permissions?.has(PermissionFlagsBits.Administrator)
    );
}

function escapeMd(text) {
    return String(text || '').replace(/[*_~`|>\\]/g, m => `\\${m}`);
}

/* ─────────────────────── Prompt UI ─────────────────────── */

function buildPromptPayload(candidate, sessionId, indexLabel) {
    const animatedTag = candidate.animated
        ? '<:Lightning:1473038797540298792> animated'
        : '<:Bookopen:1473038576391557130> static';

    const meta =
        `### <:Invoice:1473039492217835550> Detected Source\n` +
        `<:Caretright:1473038207221502106> **From:** ${candidate.sourceLabel}\n` +
        `<:Caretright:1473038207221502106> **Name:** \`${candidate.name || 'unnamed'}\`\n` +
        `<:Caretright:1473038207221502106> **Type:** ${animatedTag}\n` +
        `<:Caretright:1473038207221502106> **Format:** \`${(candidate.ext || 'png').toUpperCase()}\``;

    const headerSection = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 🎯 Steal Source Detected\n` +
            `-# ${indexLabel} • Pick how you want to add this`
        ))
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: candidate.previewUrl || candidate.url } }));

    const guidance =
        `### <:Lightbulbalt:1473038470787240009> Quick Tips\n` +
        `<:Caretright:1473038207221502106> **Emoji** is a 256 KB PNG/GIF for inline reactions and chat\n` +
        `<:Caretright:1473038207221502106> **Sticker** is a 512 KB PNG/APNG/GIF that posts as a standalone message\n` +
        `<:Caretright:1473038207221502106> Tap **✏️ Rename** before saving to give it a custom name`;

    const container = new ContainerBuilder()
        .setAccentColor(COLORS.INFO)
        .addSectionComponents(headerSection)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(meta))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(guidance))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    const lottie = candidate.type === 'discord-sticker' && candidate.format === 3;
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${ID_PREFIX}_emoji:${sessionId}`)
            .setLabel('Add as Emoji')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🙂'),
        new ButtonBuilder()
            .setCustomId(`${ID_PREFIX}_sticker:${sessionId}`)
            .setLabel('Add as Sticker')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🖼️')
            .setDisabled(lottie),
        new ButtonBuilder()
            .setCustomId(`${ID_PREFIX}_rename:${sessionId}`)
            .setLabel('Rename')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('✏️'),
        new ButtonBuilder()
            .setCustomId(`${ID_PREFIX}_skip:${sessionId}`)
            .setLabel('Skip')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⏭️'),
        new ButtonBuilder()
            .setCustomId(`${ID_PREFIX}_cancel:${sessionId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('✖️'),
    ));

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

    return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

function buildSummaryPayload(results) {
    const ok = results.filter(r => r.outcome === 'ok');
    const fail = results.filter(r => r.outcome === 'fail');
    const skipped = results.filter(r => r.outcome === 'skipped');

    const lines = [];
    if (ok.length) {
        lines.push(`### <:Checkedbox:1473038547165384804> Added (${ok.length})`);
        for (const r of ok) {
            const tag = r.kind === 'emoji'
                ? (r.created?.toString() ? `${r.created} \`:${r.created.name}:\`` : `\`:${r.created?.name || 'emoji'}:\``)
                : `**${escapeMd(r.created?.name || 'sticker')}**`;
            lines.push(`> ${r.kind === 'emoji' ? '🙂' : '🖼️'} ${tag} — \`${r.candidate.sourceLabel}\``);
        }
    }
    if (fail.length) {
        if (lines.length) lines.push('');
        lines.push(`### <:Cancel:1473037949187657818> Failed (${fail.length})`);
        for (const r of fail) {
            lines.push(`> ${r.kind === 'emoji' ? '🙂' : '🖼️'} \`${r.candidate.name || 'unknown'}\` — ${r.reason}`);
        }
    }
    if (skipped.length) {
        if (lines.length) lines.push('');
        lines.push(`### <:Bookopen:1473038576391557130> Skipped (${skipped.length})`);
        for (const r of skipped) {
            lines.push(`> \`${r.candidate.name || 'unknown'}\` — ${r.reason}`);
        }
    }

    const accent = ok.length ? 0x57F287 : (fail.length ? COLORS.ERROR || 0xED4245 : COLORS.INFO);

    return {
        components: [
            new ContainerBuilder()
                .setAccentColor(accent)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# 🎯 Steal Summary\n` +
                    `-# ${ok.length} added • ${fail.length} failed • ${skipped.length} skipped`
                ))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n') || '*Nothing to report.*'))
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING)),
        ],
        flags: MessageFlags.IsComponentsV2,
    };
}

/* ─────────────────────── Steal actions ─────────────────────── */

async function addAsEmoji(guild, actor, candidate) {
    const created = await guild.emojis.create({
        attachment: candidate.url,
        name: sanitizeName(candidate.name, 'stolen_emoji'),
        reason: `Stolen as emoji via /steal by ${actor.username}`,
    });
    return created;
}

async function addAsSticker(guild, actor, candidate) {
    if (candidate.type === 'discord-sticker' && candidate.format === 3) {
        throw new Error('Lottie stickers cannot be cloned');
    }
    const opts = {
        file: candidate.url,
        name: sanitizeStickerName(candidate.name, 'sticker'),
        tags: pickStickerTag({ tags: '😀' }),
        reason: `Stolen as sticker via /steal by ${actor.username}`,
    };
    return guild.stickers.create(opts);
}

/* ─────────────────────── Rename modal ─────────────────────── */

function buildRenameModal(sessionId) {
    return new ModalBuilder()
        .setCustomId(`${ID_PREFIX}_rename_modal:${sessionId}`)
        .setTitle('Rename Before Saving')
        .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('name')
                .setLabel('New name')
                .setPlaceholder('2-30 chars (letters, numbers, underscore, space)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(2)
                .setMaxLength(30),
        ));
}

/* ─────────────────────── Session manager ─────────────────────── */

const SESSIONS = new Map();
function makeSessionId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Run the per-candidate prompt loop on `panelMessage`. The session lets
 * the user iterate through every detected source and pick how to save
 * each one.
 */
async function runPromptSession({ panelMessage, candidates, ownerId, guild }) {
    const sessionId = makeSessionId();
    SESSIONS.set(sessionId, { candidates, ownerId, results: [], cursor: 0 });

    const renderCurrent = async () => {
        const session = SESSIONS.get(sessionId);
        if (!session) return false;
        if (session.cursor >= session.candidates.length) {
            await panelMessage.edit(buildSummaryPayload(session.results)).catch(() => {});
            SESSIONS.delete(sessionId);
            return false;
        }
        const candidate = session.candidates[session.cursor];
        const label = `Item ${session.cursor + 1} of ${session.candidates.length}`;
        await panelMessage.edit(buildPromptPayload(candidate, sessionId, label)).catch(() => {});
        return true;
    };

    if (!(await renderCurrent())) return;

    const collector = panelMessage.createMessageComponentCollector({
        filter: (i) => i.user.id === ownerId && i.customId.startsWith(`${ID_PREFIX}_`),
        time: PROMPT_TIMEOUT_MS,
    });

    collector.on('collect', async (i) => {
        const session = SESSIONS.get(sessionId);
        if (!session) {
            await i.update({ components: [buildExpiredPanel('steal')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            return;
        }
        const [action, sid] = i.customId.split(':');
        if (sid !== sessionId) {
            await i.deferUpdate().catch(() => {});
            return;
        }

        const candidate = session.candidates[session.cursor];
        if (!candidate) return;

        if (action === `${ID_PREFIX}_skip`) {
            session.results.push({ candidate, kind: '-', outcome: 'skipped', reason: 'Skipped by user' });
            session.cursor++;
            collector.resetTimer({ time: PROMPT_TIMEOUT_MS });
            await i.deferUpdate().catch(() => {});
            await renderCurrent();
            return;
        }

        if (action === `${ID_PREFIX}_cancel`) {
            // Mark remaining as skipped and finalize
            for (let idx = session.cursor; idx < session.candidates.length; idx++) {
                session.results.push({ candidate: session.candidates[idx], kind: '-', outcome: 'skipped', reason: 'Cancelled' });
            }
            await i.deferUpdate().catch(() => {});
            await panelMessage.edit(buildSummaryPayload(session.results)).catch(() => {});
            SESSIONS.delete(sessionId);
            collector.stop('cancelled');
            return;
        }

        if (action === `${ID_PREFIX}_rename`) {
            await i.showModal(buildRenameModal(sessionId)).catch(() => {});
            return;
        }

        if (action === `${ID_PREFIX}_emoji` || action === `${ID_PREFIX}_sticker`) {
            if (!checkPerms(i.member)) {
                await i.reply({ components: [buildPermissionDenied('Manage Expressions')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
                return;
            }
            const kind = action === `${ID_PREFIX}_emoji` ? 'emoji' : 'sticker';
            await i.deferUpdate().catch(() => {});
            // Show a transient "saving" panel so the user gets feedback on slow saves.
            await panelMessage.edit({
                components: [buildLoadingResponse(`Saving ${kind}…`, `Adding **${escapeMd(candidate.name)}** as ${kind}.`, 'Discord normally accepts this in under a second.')],
                flags: MessageFlags.IsComponentsV2,
            }).catch(() => {});

            try {
                const created = kind === 'emoji'
                    ? await addAsEmoji(guild, i.user, candidate)
                    : await addAsSticker(guild, i.user, candidate);
                session.results.push({ candidate, kind, outcome: 'ok', created });
            } catch (err) {
                const reason = kind === 'emoji' ? explainEmojiError(err) : explainStickerError(err);
                session.results.push({ candidate, kind, outcome: 'fail', reason });
            }

            session.cursor++;
            collector.resetTimer({ time: PROMPT_TIMEOUT_MS });
            await renderCurrent();
            return;
        }

        await i.deferUpdate().catch(() => {});
    });

    // Modal listener for rename — auto-cleaned when the session ends.
    const modalHandler = async (m) => {
        if (!m.isModalSubmit()) return;
        if (m.user.id !== ownerId) return;
        const expectedId = `${ID_PREFIX}_rename_modal:${sessionId}`;
        if (m.customId !== expectedId) return;
        const session = SESSIONS.get(sessionId);
        if (!session) return;
        const candidate = session.candidates[session.cursor];
        if (!candidate) return;
        const newName = (m.fields.getTextInputValue('name') || '').trim();
        if (newName.length >= 2) candidate.name = newName.slice(0, 30);
        const label = `Item ${session.cursor + 1} of ${session.candidates.length}`;
        await m.update(buildPromptPayload(candidate, sessionId, label)).catch(() => {});
    };
    panelMessage.client.on('interactionCreate', modalHandler);

    collector.on('end', async (_, reason) => {
        panelMessage.client.removeListener('interactionCreate', modalHandler);
        const session = SESSIONS.get(sessionId);
        if (session && reason !== 'cancelled') {
            // Mark unprocessed as timed-out
            for (let idx = session.cursor; idx < session.candidates.length; idx++) {
                session.results.push({ candidate: session.candidates[idx], kind: '-', outcome: 'skipped', reason: 'Timed out' });
            }
            await panelMessage.edit(buildSummaryPayload(session.results)).catch(() => {});
            SESSIONS.delete(sessionId);
        }
    });
}

/* ─────────────────────── Entrypoints ─────────────────────── */

async function entry({ guild, member, user, channel, replyHandle, textInput, repliedMessage, directAttachments }) {
    if (!checkPerms(member)) {
        return replyHandle({
            components: [buildPermissionDenied('Manage Expressions')],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    }

    if (!textInput && !repliedMessage && !(directAttachments && directAttachments.size)) {
        const container = buildErrorResponse(
            'Nothing to Steal',
            'Provide an emoji, sticker, image URL, Tenor/Giphy/Twitter link, or attach an image.',
            '**Examples:**\n' +
            '`/steal source:<:pepe:123>`\n' +
            '`/steal source:https://tenor.com/view/...`\n' +
            'Reply to a message containing a sticker or image and run `/steal`'
        );
        return replyHandle({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const loading = buildLoadingResponse('Looking for something to steal…', 'Scanning the input for emojis, stickers, and image links.', 'This usually finishes in a couple of seconds.');
    const panelMessage = await replyHandle({ components: [loading], flags: MessageFlags.IsComponentsV2 });
    if (!panelMessage) return;

    const candidates = await resolveAnyInput({ textInput, repliedMessage, directAttachments });
    if (candidates.length === 0) {
        const container = buildErrorResponse(
            'No Stealable Content Found',
            'I could not detect anything stealable in that input.',
            '**Things I can detect:**\n' +
            '> • Custom Discord emojis (`<:name:123>` / `<a:name:123>`)\n' +
            '> • Stickers (URLs or replies)\n' +
            '> • Direct image URLs (PNG/JPEG/GIF/WebP/APNG)\n' +
            '> • Tenor and Giphy links\n' +
            '> • Image attachments\n' +
            '> • Most web pages with a preview image (og:image)'
        );
        await panelMessage.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        return;
    }

    await runPromptSession({ panelMessage, candidates, ownerId: user.id, guild });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('steal')
        .setDescription('Save any image, GIF, sticker, emoji, or link as an emoji or sticker — your choice')
        .addStringOption(o => o
            .setName('source')
            .setDescription('Emoji, sticker URL, image URL, Tenor/Giphy link, or any web link')
            .setRequired(false))
        .addAttachmentOption(o => o
            .setName('image')
            .setDescription('Upload an image (PNG/GIF/JPEG/WebP)')
            .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions),

    prefix: 'steal',
    description: 'Save any image, GIF, sticker, or link as an emoji or sticker — your choice',
    usage: 'steal <source/url/emoji/sticker> — or attach/reply with an image',
    category: 'utility',
    aliases: [],
    permissions: ['ManageGuildExpressions'],

    async execute(interaction) {
        const sourceText = interaction.options.getString('source');
        const attachment = interaction.options.getAttachment('image');

        let repliedMessage = null;
        try {
            const ref = interaction.message?.reference;
            if (ref?.messageId) {
                repliedMessage = await interaction.channel.messages.fetch(ref.messageId).catch(() => null);
            }
        } catch {}

        const directAttachments = new Map();
        if (attachment) directAttachments.set(attachment.id, attachment);

        await interaction.deferReply();
        await entry({
            guild: interaction.guild,
            member: interaction.member,
            user: interaction.user,
            channel: interaction.channel,
            textInput: sourceText,
            repliedMessage,
            directAttachments,
            replyHandle: async (payload) => interaction.editReply(payload),
        });
    },

    async executePrefix(message, args) {
        if (!message.guild) {
            return message.reply('<:Cancel:1473037949187657818> This command can only be used in a server.').catch(() => {});
        }
        let repliedMessage = null;
        if (message.reference?.messageId) {
            repliedMessage = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
        }
        await entry({
            guild: message.guild,
            member: message.member,
            user: message.author,
            channel: message.channel,
            textInput: args.join(' ') || null,
            repliedMessage,
            directAttachments: message.attachments,
            replyHandle: async (payload) => message.reply(payload),
        });
    },
};
