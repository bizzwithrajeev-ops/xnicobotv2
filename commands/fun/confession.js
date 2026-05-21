'use strict';

/**
 * Confession System — Anonymous confessions with setup, submit, reply, and report.
 *
 * Setup: /confession-setup #channel — sets the confession channel
 * Submit: /confess <text> — sends anonymous confession to the channel
 * Buttons: Submit (new), Reply (to existing), Report
 * Each confession gets a unique ID for tracking/reporting.
 */

const {
    SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType,
    ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder,
    ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
    SeparatorBuilder, SeparatorSpacingSize
} = require('discord.js');
const jsonStore = require('../../utils/jsonStore');

const STORE = 'confessions';

// ── Helpers ──────────────────────────────────────────────────────────────

function loadConfig() { return jsonStore.peek(STORE) || {}; }
function getGuildConfig(guildId) { return (jsonStore.peek(STORE) || {})[guildId] || null; }

function saveGuildConfig(guildId, cfg) {
    const all = jsonStore.read(STORE) || {};
    all[guildId] = cfg;
    jsonStore.write(STORE, all);
}

function generateId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ── Build confession embed (CV2 container) ───────────────────────────────

function buildConfessionContainer(confessionText, confessionNumber, confessionId) {
    const container = new ContainerBuilder()
        .setAccentColor(0x2b2d31)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `## Anonymous Confession 🌸 #${confessionNumber}\n\n${confessionText}\n\n-# ID: \`${confessionId}\` · Confessions are anonymous`
        ))
        .addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`confess_reply_${confessionId}`).setLabel('Reply').setEmoji('<:Chat:1473038936241864865>').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`confess_new`).setLabel('Submit').setEmoji('<:Editalt:1473038138577256670>').setStyle(ButtonStyle.Success)
        ));

    return container;
}

function buildReplyContainer(replyText, confessionId, isAnonymous) {
    return new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### <:Chat:1473038936241864865> Reply to #${confessionId}\n\n> ${replyText}\n\n-# ${isAnonymous ? 'Anonymous reply' : 'Reply'}`
        ));
}

// ── Command module ───────────────────────────────────────────────────────

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
            return interaction.reply({
                content: '<:Cancel:1473037949187657818> Confessions are not set up in this server. Ask an admin to run `/confession-setup`.',
                flags: MessageFlags.Ephemeral
            });
        }

        const text = interaction.options.getString('message');
        const channel = interaction.guild.channels.cache.get(cfg.channelId);
        if (!channel) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> Confession channel not found.', flags: MessageFlags.Ephemeral });
        }

        const confessionId = generateId();
        cfg.count = (cfg.count || 0) + 1;
        cfg.log = cfg.log || {};
        cfg.log[confessionId] = { userId: interaction.user.id, timestamp: Date.now(), number: cfg.count };
        saveGuildConfig(interaction.guild.id, cfg);

        const container = buildConfessionContainer(text, cfg.count, confessionId);
        await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });

        await interaction.reply({
            content: `<:Checkedbox:1473038547165384804> Your confession has been posted anonymously! (ID: \`${confessionId}\`)`,
            flags: MessageFlags.Ephemeral
        });
    },

    async executePrefix(message, args) {
        const cfg = getGuildConfig(message.guild.id);
        if (!cfg?.channelId) {
            return message.reply('<:Cancel:1473037949187657818> Confessions not set up. Ask an admin to run `-confession-setup #channel`.');
        }

        if (!args.length) {
            return message.reply('<:Cancel:1473037949187657818> Please provide your confession text: `-confess <message>`');
        }

        const text = args.join(' ');
        const channel = message.guild.channels.cache.get(cfg.channelId);
        if (!channel) return message.reply('<:Cancel:1473037949187657818> Confession channel not found.');

        const confessionId = generateId();
        cfg.count = (cfg.count || 0) + 1;
        cfg.log = cfg.log || {};
        cfg.log[confessionId] = { userId: message.author.id, timestamp: Date.now(), number: cfg.count };
        saveGuildConfig(message.guild.id, cfg);

        const container = buildConfessionContainer(text, cfg.count, confessionId);
        await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });

        // Delete the original message to keep it anonymous
        await message.delete().catch(() => {});
        const confirm = await message.channel.send({
            content: `<:Checkedbox:1473038547165384804> Confession posted anonymously! (ID: \`${confessionId}\`)`,
        });
        setTimeout(() => confirm.delete().catch(() => {}), 5000);
    },

    // ── Button handler ───────────────────────────────────────────────────

    async handleButton(interaction) {
        const id = interaction.customId;

        // New confession button
        if (id === 'confess_new') {
            const modal = new ModalBuilder()
                .setCustomId('confess_modal_new')
                .setTitle('Anonymous Confession')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('confess_text')
                            .setLabel('Your confession')
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder('Type your anonymous confession here...')
                            .setRequired(true)
                            .setMaxLength(2000)
                    )
                );
            await interaction.showModal(modal);
            return true;
        }

        // Reply to confession button
        if (id.startsWith('confess_reply_')) {
            const confessionId = id.replace('confess_reply_', '');
            const modal = new ModalBuilder()
                .setCustomId(`confess_modal_reply_${confessionId}`)
                .setTitle(`Reply to Confession #${confessionId}`)
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('reply_text')
                            .setLabel('Your reply')
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder('Type your reply here...')
                            .setRequired(true)
                            .setMaxLength(1000)
                    )
                );
            await interaction.showModal(modal);
            return true;
        }

        return false;
    },

    // ── Modal handler ────────────────────────────────────────────────────

    async handleModal(interaction) {
        const id = interaction.customId;

        // New confession modal submit
        if (id === 'confess_modal_new') {
            const cfg = getGuildConfig(interaction.guild.id);
            if (!cfg?.channelId) {
                return interaction.reply({ content: '<:Cancel:1473037949187657818> Confessions not set up.', flags: MessageFlags.Ephemeral });
            }

            const text = interaction.fields.getTextInputValue('confess_text');
            const channel = interaction.guild.channels.cache.get(cfg.channelId);
            if (!channel) return interaction.reply({ content: '<:Cancel:1473037949187657818> Channel not found.', flags: MessageFlags.Ephemeral });

            const confessionId = generateId();
            cfg.count = (cfg.count || 0) + 1;
            cfg.log = cfg.log || {};
            cfg.log[confessionId] = { userId: interaction.user.id, timestamp: Date.now(), number: cfg.count };
            saveGuildConfig(interaction.guild.id, cfg);

            const container = buildConfessionContainer(text, cfg.count, confessionId);
            await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });

            await interaction.reply({
                content: `<:Checkedbox:1473038547165384804> Confession #${cfg.count} posted! (ID: \`${confessionId}\`)`,
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        // Reply modal submit
        if (id.startsWith('confess_modal_reply_')) {
            const confessionId = id.replace('confess_modal_reply_', '');
            const replyText = interaction.fields.getTextInputValue('reply_text');

            const container = buildReplyContainer(replyText, confessionId, true);

            // Send reply in the same channel as a new message
            await interaction.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
            await interaction.reply({ content: '<:Checkedbox:1473038547165384804> Reply posted anonymously!', flags: MessageFlags.Ephemeral });
            return true;
        }

        return false;
    }
};
