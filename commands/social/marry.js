'use strict';

/**
 * marry — Propose marriage to another user.
 *
 * Slash and prefix entry points share the same `proposeMarriage`
 * pipeline. The slash variant is deferred up-front because the
 * proposal flow waits up to 30 seconds for a response — without
 * the defer the interaction would expire before the prompt could
 * be edited in.
 *
 * State is stored in the `marriages` json store as a symmetric
 * map: { [userId]: { partner, date } } for both members of the
 * couple. `divorce` removes both halves; `socialprofile` reads
 * either half to show the relationship.
 */

const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags,
} = require('discord.js');
const jsonStore = require('../../utils/jsonStore');
const { resolveUser } = require('../../utils/resolveUser');

const ACCENT  = 0xCAD7E6;
const TIMEOUT = 30_000;

function errorContainer(content) {
    return new ContainerBuilder()
        .setAccentColor(ACCENT)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

function loadMarriages() {
    if (!jsonStore.has('marriages')) return {};
    try { return jsonStore.read('marriages') || {}; } catch { return {}; }
}

/**
 * Wraps both interaction and message reply paths behind a single
 * call surface. For slash interactions we use editReply because the
 * caller has deferred up-front; for prefix messages we use the
 * normal reply.
 */
function makeReplyer(context, isInteraction) {
    return async (payload) => {
        if (isInteraction) {
            // Deferred at command entry — first call uses editReply,
            // subsequent calls go through the channel so we don't
            // edit the original prompt out from under the user.
            if (!context._marryEditedOnce) {
                context._marryEditedOnce = true;
                return context.editReply(payload).catch(() => null);
            }
            return context.channel.send(payload).catch(() => null);
        }
        return context.reply(payload).catch(() => null);
    };
}

async function proposeMarriage(context, user, isInteraction) {
    const author  = isInteraction ? context.user : context.author;
    const channel = context.channel;
    const reply   = makeReplyer(context, isInteraction);

    if (user.id === author.id) {
        return reply({
            components: [errorContainer(
                `# <:Cancel:1473037949187657818> Can't Marry Yourself\n\nYou cannot marry yourself!`
            )],
            flags: MessageFlags.IsComponentsV2,
        });
    }

    if (user.bot) {
        return reply({
            components: [errorContainer(
                `# <:Cancel:1473037949187657818> Can't Marry Bots\n\nYou cannot marry a bot!`
            )],
            flags: MessageFlags.IsComponentsV2,
        });
    }

    const config = loadMarriages();

    if (config[author.id]) {
        return reply({
            components: [errorContainer(
                `# <:Cancel:1473037949187657818> Already Married\n\nYou are already married! Use \`divorce\` to end your current marriage first.`
            )],
            flags: MessageFlags.IsComponentsV2,
        });
    }

    if (config[user.id]) {
        return reply({
            components: [errorContainer(
                `# <:Cancel:1473037949187657818> User Already Married\n\n${user.username} is already married to someone else.`
            )],
            flags: MessageFlags.IsComponentsV2,
        });
    }

    // Send the proposal prompt and immediately wait for a reply
    // from the proposed-to user.
    await reply({
        components: [
            new ContainerBuilder()
                .setAccentColor(ACCENT)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# 💍 Marriage Proposal\n\n` +
                    `**${author.username}** is proposing to **${user.username}**!\n\n` +
                    `<@${user.id}>, do you accept? Type **yes** or **no** within 30 seconds.`
                )),
        ],
        flags: MessageFlags.IsComponentsV2,
        // Allow pinging the proposed user so they actually see it.
        allowedMentions: { users: [user.id] },
    });

    const filter = m =>
        m.author.id === user.id &&
        ['yes', 'no'].includes(m.content.trim().toLowerCase());

    const collected = await channel.awaitMessages({
        filter, max: 1, time: TIMEOUT, errors: ['time'],
    }).catch(() => null);

    if (!collected || collected.first().content.trim().toLowerCase() === 'no') {
        const timedOut = !collected;
        return channel.send({
            components: [
                new ContainerBuilder()
                    .setAccentColor(ACCENT)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# 💔 Proposal ${timedOut ? 'Expired' : 'Rejected'}\n\n` +
                        (timedOut
                            ? `**${user.username}** didn't respond in time.`
                            : `**${user.username}** turned **${author.username}** down.`)
                    )),
            ],
            flags: MessageFlags.IsComponentsV2,
        }).catch(() => null);
    }

    // Re-load to avoid race with a parallel proposal that may have
    // succeeded between the prompt and the answer.
    const fresh = loadMarriages();
    if (fresh[author.id] || fresh[user.id]) {
        return channel.send({
            components: [errorContainer(
                `# <:Cancel:1473037949187657818> Marriage Conflict\n\nOne of you got married while waiting. Please try again.`
            )],
            flags: MessageFlags.IsComponentsV2,
        }).catch(() => null);
    }

    const now = Date.now();
    fresh[author.id] = { partner: user.id,   date: now };
    fresh[user.id]   = { partner: author.id, date: now };
    jsonStore.write('marriages', fresh);

    return channel.send({
        components: [
            new ContainerBuilder()
                .setAccentColor(ACCENT)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# 💑 Just Married!\n\n` +
                    `**${author.username}** and **${user.username}** are now married!\n\n` +
                    `<:Present:1473038450465706076> Congratulations to the happy couple!`
                )),
        ],
        flags: MessageFlags.IsComponentsV2,
    }).catch(() => null);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('marry')
        .setDescription('Propose marriage to another user')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('The user to propose to')
                .setRequired(true)),

    prefix: 'marry',
    description: 'Propose marriage to another user',
    usage: 'marry <@user>',
    category: 'social',
    aliases: ['propose'],

    async execute(interaction) {
        // Defer up-front — the proposal flow waits up to 30 seconds
        // for the proposed user to answer. Without the defer the
        // initial slash interaction token would expire long before
        // we could send the success / rejection message.
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply().catch(() => {});
        }
        const user = interaction.options.getUser('user');
        await proposeMarriage(interaction, user, true);
    },

    async executePrefix(message, args) {
        const user = await resolveUser(message, args);
        if (!user) {
            return message.reply({
                components: [errorContainer(
                    `# <:Cancel:1473037949187657818> Missing User\n\nPlease mention someone to propose to!\n\n**Usage:** \`marry @user\``
                )],
                flags: MessageFlags.IsComponentsV2,
            }).catch(() => null);
        }
        await proposeMarriage(message, user, false);
    },
};
