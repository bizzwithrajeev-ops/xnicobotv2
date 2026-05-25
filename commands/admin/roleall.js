'use strict';

/**
 * /roleall — Bulk role management for the entire server.
 *
 *   /roleall everyone add    role:<role>
 *   /roleall everyone remove role:<role>
 *   /roleall humans   add    role:<role>
 *   /roleall humans   remove role:<role>
 *   /roleall bots     add    role:<role>
 *   /roleall bots     remove role:<role>
 *
 * Prefix usage:
 *   -roleall <everyone|humans|bots> <add|remove> @role
 *   -roleall <everyone|humans|bots> @role          (action defaults to add)
 *   -roleall @role                                 (legacy → everyone add)
 *   -roleallhumans @role                           (alias → humans add)
 *   -roleallbots @role                             (alias → bots add)
 *
 *  © xNico
 */

const {
    PermissionFlagsBits,
    SlashCommandBuilder,
    MessageFlags,
} = require('discord.js');

const {
    buildErrorResponse,
    buildInvalidUsage,
} = require('../../utils/responseBuilder');

const {
    runFromInteraction,
    runFromMessage,
    VALID_TARGETS,
    VALID_ACTIONS,
} = require('../../utils/roleAllHelper');

// ── Slash command registration ──────────────────────────────────────
const TARGETS = [
    { name: 'everyone', label: 'all members in the server' },
    { name: 'humans',   label: 'all human members'         },
    { name: 'bots',     label: 'all bot members'           },
];

function addAddRemove(group, target) {
    return group
        .addSubcommand(s => s
            .setName('add')
            .setDescription(`Give a role to ${target.label}`)
            .addRoleOption(o => o
                .setName('role')
                .setDescription('The role to assign')
                .setRequired(true)))
        .addSubcommand(s => s
            .setName('remove')
            .setDescription(`Remove a role from ${target.label}`)
            .addRoleOption(o => o
                .setName('role')
                .setDescription('The role to remove')
                .setRequired(true)));
}

const data = new SlashCommandBuilder()
    .setName('roleall')
    .setDescription('Bulk add or remove a role across the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

for (const t of TARGETS) {
    data.addSubcommandGroup(g =>
        addAddRemove(
            g.setName(t.name).setDescription(`Manage roles for ${t.label}`),
            t
        )
    );
}

// ── Helpers ─────────────────────────────────────────────────────────
function resolveRole(guild, message, token) {
    if (!token) return null;
    // Resolve <@&id>, raw id, or by name (case-insensitive).
    const idMatch = token.match(/^<@&(\d+)>$/) || token.match(/^(\d{17,20})$/);
    if (idMatch) return guild.roles.cache.get(idMatch[1]) || null;
    const lower = token.toLowerCase();
    return guild.roles.cache.find(r => r.name.toLowerCase() === lower)
        || message?.mentions?.roles?.first()
        || null;
}

/**
 * Parse `-roleall ...` prefix arguments into a normalised request.
 *
 * Accepted forms (in order of precedence):
 *   1. <target> <action> <role>
 *   2. <target> <role>             → action defaults to 'add'
 *   3. <action> <role>             → target defaults to 'everyone'
 *   4. <role>                      → 'everyone add'
 */
function parsePrefixArgs(message, args) {
    const tokens = args.map(t => t?.toLowerCase?.() ?? '');
    const guild  = message.guild;

    const isTarget = (t) => VALID_TARGETS.has(t);
    const isAction = (t) => VALID_ACTIONS.has(t);

    let targetType = 'everyone';
    let action     = 'add';
    let roleToken  = null;

    if (args.length >= 3 && isTarget(tokens[0]) && isAction(tokens[1])) {
        targetType = tokens[0];
        action     = tokens[1];
        roleToken  = args[2];
    } else if (args.length >= 2 && isTarget(tokens[0])) {
        targetType = tokens[0];
        roleToken  = args[1];
    } else if (args.length >= 2 && isAction(tokens[0])) {
        action     = tokens[0];
        roleToken  = args[1];
    } else if (args.length >= 1) {
        roleToken  = args[0];
    }

    const role = message.mentions.roles.first()
        || resolveRole(guild, message, roleToken);

    if (!role) return null;
    return { targetType, action, role };
}

// ── Module export ───────────────────────────────────────────────────
module.exports = {
    data,
    name: 'roleall',
    description: 'Bulk add or remove a role for everyone, humans, or bots',
    usage: 'roleall <everyone|humans|bots> <add|remove> <@role>',
    category: 'admin',
    aliases: ['roleallhumans', 'roleallbots'],

    async execute(interaction) {
        try {
            const group  = interaction.options.getSubcommandGroup(true); // everyone | humans | bots
            const action = interaction.options.getSubcommand(true);      // add | remove
            const role   = interaction.options.getRole('role', true);

            await runFromInteraction(interaction, { targetType: group, action, role });
        } catch (error) {
            console.error('[RoleAll] Slash Error:', error);
            const container = buildErrorResponse(
                'Role All Failed',
                'An error occurred while processing the request.',
                `\`${error.message}\``
            );
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2,
                }).catch(() => {});
            } else {
                await interaction.reply({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                }).catch(() => {});
            }
        }
    },

    async executePrefix(message, args) {
        try {
            // Detect how the user invoked the command (handles prefixes of any length, no-prefix mode and aliases).
            const firstToken = (message.content.trim().split(/\s+/)[0] || '').toLowerCase();
            const invokedAs  = firstToken.replace(/^[^a-z0-9]+/i, ''); // strip leading prefix chars

            // Aliases: -roleallhumans @role / -roleallbots @role
            if (invokedAs === 'roleallhumans' || invokedAs === 'roleallbots') {
                const targetType = invokedAs === 'roleallhumans' ? 'humans' : 'bots';
                const role = message.mentions.roles.first()
                    || resolveRole(message.guild, message, args[0]);
                if (!role) {
                    return message.reply({
                        components: [buildInvalidUsage(
                            invokedAs,
                            `-${invokedAs} @role`,
                            [`-${invokedAs} @Members`]
                        )],
                        flags: MessageFlags.IsComponentsV2,
                    });
                }
                return runFromMessage(message, { targetType, action: 'add', role });
            }

            const parsed = parsePrefixArgs(message, args);
            if (!parsed) {
                return message.reply({
                    components: [buildInvalidUsage(
                        'roleall',
                        '-roleall <everyone|humans|bots> <add|remove> @role',
                        [
                            '-roleall everyone add @Members',
                            '-roleall humans remove @Verified',
                            '-roleall bots add @BotRole',
                            '-roleall @Members  (legacy: everyone add)',
                        ]
                    )],
                    flags: MessageFlags.IsComponentsV2,
                });
            }

            await runFromMessage(message, parsed);
        } catch (error) {
            console.error('[RoleAll] Prefix Error:', error);
            await message.reply({
                components: [buildErrorResponse(
                    'Role All Failed',
                    'An error occurred while processing the request.',
                    `\`${error.message}\``
                )],
                flags: MessageFlags.IsComponentsV2,
            }).catch(() => {});
        }
    },
};
