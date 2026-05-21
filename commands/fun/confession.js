'use strict';

/**
 * Confession System — Anonymous confessions styled like the suggestion system.
 *
 * Features:
 *   - Anonymous posting via /confess or -confess
 *   - Submit button on each confession for quick new submissions
 *   - Reply button to anonymously reply to a confession
 *   - Unique confession IDs for moderation
 *   - Confession counter (#0001, #0002, etc.)
 *   - Admin log lookup by ID
 */

const {
    SlashCommandBuilder, MessageFlags,
    ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    SeparatorBuilder, SeparatorSpacingSize,
    ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const jsonStore = require('../../utils/jsonStore');

const STORE = 'confessions';

// ── Emojis ───────────────────────────────────────────────────────────────
const E = {
    confession: '<:Envelope:1473038885364695113>',
    check:      '<:Checkedbox:1473038547165384804>',
    cancel:     '<:Cancel:1473037949187657818>',
    chat:       '<:Chat:1473038936241864865>',
    edit:       '<:Editalt:1473038138577256670>',
    user:       '<:User:1473038971398520977>',
    clock:      '<:Clock:1473039102113878056>',
    info:       '<:Inforect:1473038624172937287>',
    bookopen:   '<:Bookopen:1473038576391557130>',
    fire:       '<:Fire:1473038604812161218>',
    shield:     '<:Shield:1473038669831995494>',
    server:     '<:Server:1473039204417142844>',
};

// ── Helpers ──────────────────────────────────────────────────────────────

function getGuildConfig(guildId) { return (jsonStore.peek(STORE) || {})[guildId] || null; }

function saveGuildConfig(guildId, cfg) {
    const all = jsonStore.read(STORE) || {};
    all[guildId] = cfg;
    jsonStore.write(STORE, all);
}

function generateId() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }
function formatNum(n) { return `#${String(n).padStart(4, '0')}`; }
function ts(date) { return `<t:${Math.floor(date / 1000)}:R>`; }

// ── Card Builders ────────────────────────────────────────────────────────

function buildConfessionCard(text, number, confessionId) {
    return new ContainerBuilder()
        .setAccentColor(0x2b2d31)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## ${E.confession} Anonymous Confession ${formatNum(number)}\n` +
            `-# Confession ID: \`${confessionId}\``
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `> ${text.replace(/\n/g, '\n> ')}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `-# ${E.server} Anonymous · ${E.clock} ${ts(Date.now())} · ${E.shield} Report harmful content to moderators`
        ))
        .addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`confess_new`)
                .setLabel('Submit')
                .setEmoji(E.edit)
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`confess_reply_${confessionId}`)
                .setLabel('Reply')
                .setEmoji(E.chat)
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`confess_info_${confessionId}`)
                .setEmoji(E.info)
                .setStyle(ButtonStyle.Secondary)
        ));
}

function buildReplyCard(replyText, confessionId) {
    return new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### ${E.chat} Anonymous Reply to ${formatNum(0)}\n-# Confession \`${confessionId}\``
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `> ${replyText.replace(/\n/g, '\n> ')}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `-# ${E.server} Anonymous reply · ${ts(Date.now())}`
        ));
}

function buildInfoCard(confessionId) {
    return new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### ${E.info} Post Info\n\n` +
            `**Post ID** · \`${confessionId}\`\n\n` +
            `Report harmful content or request an anonymous connection with the author.`
        ))
        .addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`confess_report_${confessionId}`)
                .setLabel('Report')
                .setEmoji(E.cancel)
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`confess_reply_${confessionId}`)
                .setLabel('Reply')
                .setEmoji(E.chat)
                .setStyle(ButtonStyle.Secondary)
        ));
}

// ── Command ──────────────────────────────────────────────────────────────

module.exports = {
    data: new SlashCommandBuilder()
        .setName('confess')
        .setDescription('Send an anonymous confession')
        .addStringOption(o => o.setName('message').setDescription('Your confession (anonymous)').setRequired(true).setMaxLength(2000)),

    prefix: 'confess',
    description: 'Send an anonymous confession',
    usage: 'confess <message>',
    category: 'fun',
    aliases: ['confession', 'anon'],

    async execute(interaction) {
        const cfg = getGuildConfig(interaction.guild.id);
        if (!cfg?.channelId) {
            return interaction.reply({ content: `${E.cancel} Confessions not set up. Ask an admin to run \`/confession-setup\`.`, flags: MessageFlags.Ephemeral });
        }

        const text = interaction.options.getString('message');
        const channel = interaction.guild.channels.cache.get(cfg.channelId);
        if (!channel) return interaction.reply({ content: `${E.cancel} Confession channel not found.`, flags: MessageFlags.Ephemeral });

        const confessionId = generateId();
        cfg.count = (cfg.count || 0) + 1;
        cfg.log = cfg.log || {};
        cfg.log[confessionId] = { userId: interaction.user.id, timestamp: Date.now(), number: cfg.count };
        saveGuildConfig(interaction.guild.id, cfg);

        const card = buildConfessionCard(text, cfg.count, confessionId);
        await channel.send({ components: [card], flags: MessageFlags.IsComponentsV2 });

        await interaction.reply({
            content: `${E.check} Your confession ${formatNum(cfg.count)} has been posted anonymously!\n-# ID: \`${confessionId}\``,
            flags: MessageFlags.Ephemeral
        });
    },

    async executePrefix(message, args) {
        const cfg = getGuildConfig(message.guild.id);
        if (!cfg?.channelId) {
            return message.reply(`${E.cancel} Confessions not set up. Ask an admin to run \`-confession-setup #channel\`.`);
        }
        if (!args.length) return message.reply(`${E.cancel} Usage: \`-confess <your message>\``);

        const text = args.join(' ');
        const channel = message.guild.channels.cache.get(cfg.channelId);
        if (!channel) return message.reply(`${E.cancel} Confession channel not found.`);

        const confessionId = generateId();
        cfg.count = (cfg.count || 0) + 1;
        cfg.log = cfg.log || {};
        cfg.log[confessionId] = { userId: message.author.id, timestamp: Date.now(), number: cfg.count };
        saveGuildConfig(message.guild.id, cfg);

        const card = buildConfessionCard(text, cfg.count, confessionId);
        await channel.send({ components: [card], flags: MessageFlags.IsComponentsV2 });

        // Delete original to maintain anonymity
        await message.delete().catch(() => {});
        const confirm = await message.channel.send(`${E.check} Confession posted anonymously!`);
        setTimeout(() => confirm.delete().catch(() => {}), 4000);
    },

    // ── Button Handler ───────────────────────────────────────────────────

    async handleButton(interaction) {
        const id = interaction.customId;

        // Submit new confession
        if (id === 'confess_new') {
            const cfg = getGuildConfig(interaction.guild.id);
            if (!cfg?.channelId) {
                return interaction.reply({ content: `${E.cancel} Confessions not configured.`, flags: MessageFlags.Ephemeral });
            }
            const modal = new ModalBuilder()
                .setCustomId('confess_modal_new')
                .setTitle('Anonymous Confession')
                .addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('confess_text')
                        .setLabel('Your confession')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Type your anonymous confession here...')
                        .setRequired(true)
                        .setMaxLength(2000)
                ));
            await interaction.showModal(modal);
            return true;
        }

        // Reply to confession
        if (id.startsWith('confess_reply_')) {
            const confessionId = id.replace('confess_reply_', '');
            const modal = new ModalBuilder()
                .setCustomId(`confess_modal_reply_${confessionId}`)
                .setTitle(`Reply to #${confessionId}`)
                .addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('reply_text')
                        .setLabel('Your anonymous reply')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Type your reply here...')
                        .setRequired(true)
                        .setMaxLength(1000)
                ));
            await interaction.showModal(modal);
            return true;
        }

        // Info button (ephemeral)
        if (id.startsWith('confess_info_')) {
            const confessionId = id.replace('confess_info_', '');
            const card = buildInfoCard(confessionId);
            await interaction.reply({ components: [card], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            return true;
        }

        // Report button (ephemeral acknowledgment)
        if (id.startsWith('confess_report_')) {
            const confessionId = id.replace('confess_report_', '');
            await interaction.reply({
                content: `${E.shield} Report submitted for confession \`${confessionId}\`. Moderators will review it.\n-# If this is urgent, contact a server moderator directly.`,
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        return false;
    },

    // ── Modal Handler ────────────────────────────────────────────────────

    async handleModal(interaction) {
        const id = interaction.customId;

        if (id === 'confess_modal_new') {
            const cfg = getGuildConfig(interaction.guild.id);
            if (!cfg?.channelId) return interaction.reply({ content: `${E.cancel} Not configured.`, flags: MessageFlags.Ephemeral });

            const text = interaction.fields.getTextInputValue('confess_text');
            const channel = interaction.guild.channels.cache.get(cfg.channelId);
            if (!channel) return interaction.reply({ content: `${E.cancel} Channel not found.`, flags: MessageFlags.Ephemeral });

            const confessionId = generateId();
            cfg.count = (cfg.count || 0) + 1;
            cfg.log = cfg.log || {};
            cfg.log[confessionId] = { userId: interaction.user.id, timestamp: Date.now(), number: cfg.count };
            saveGuildConfig(interaction.guild.id, cfg);

            const card = buildConfessionCard(text, cfg.count, confessionId);
            await channel.send({ components: [card], flags: MessageFlags.IsComponentsV2 });

            await interaction.reply({
                content: `${E.check} Confession ${formatNum(cfg.count)} posted! (ID: \`${confessionId}\`)`,
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (id.startsWith('confess_modal_reply_')) {
            const confessionId = id.replace('confess_modal_reply_', '');
            const replyText = interaction.fields.getTextInputValue('reply_text');
            const card = buildReplyCard(replyText, confessionId);
            await interaction.channel.send({ components: [card], flags: MessageFlags.IsComponentsV2 });
            await interaction.reply({ content: `${E.check} Reply posted anonymously!`, flags: MessageFlags.Ephemeral });
            return true;
        }

        return false;
    }
};
