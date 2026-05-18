/**
 * /vcstatus — set or clear the *Voice Channel Status* line that
 * appears under the channel name in the channel list.
 *
 * Why this needed a rewrite
 * ─────────────────────────
 * The previous implementation called a non-existent
 * `channel.setStatus()` method (discord.js 14 has no such helper)
 * and fell through to `channel.edit({ topic })`, which silently
 * fails because voice channels don't have topics. The permission
 * check used `ManageChannels`, but Discord gates this feature on
 * the dedicated `Set Voice Channel Status` flag (1<<48). And there
 * was no slash command exported at all, so `/vcstatus` did not
 * exist even though the help menu advertised it.
 *
 * What this version does
 * ──────────────────────
 *   - Exports both `data` (slash) and `executePrefix`.
 *   - Checks `PermissionFlagsBits.SetVoiceChannelStatus` first; falls
 *     back to `ManageChannels` so server owners and admins still
 *     work even on guilds that haven't migrated permissions.
 *   - Hits the correct REST endpoint:
 *        PUT /channels/{channel.id}/voice-status   { status }
 *     This is the same endpoint utils/musicPanel.js uses.
 *   - Supports clearing via `clear` or empty string by sending
 *     `{ status: null }` (Discord rejects empty strings).
 *   - Truncates input to 500 characters (the Discord limit).
 *   - Accepts both a mentioned voice channel and the user's current
 *     VC; for slash, optional `channel` option.
 */

'use strict';

const {
    SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType
} = require('discord.js');
const {
    buildErrorResponse, buildSuccessResponse, buildInvalidUsage
} = require('../../utils/responseBuilder');

const MAX_STATUS_LENGTH = 500;

// Set Voice Channel Status — bit 48. discord.js 14.25 does not yet
// export this flag (PermissionFlagsBits.SetVoiceChannelStatus is
// `undefined`), and `permissions.has(undefined)` returns true for
// every user (it coerces to 0n and 0n is "contained" in any bitset)
// which silently bypassed the check. We use the literal bit value
// here, with `ManageChannels` as a strict fallback so admins and
// channel managers still work on guilds where the new permission
// hasn't been granted to anyone.
const SET_VOICE_CHANNEL_STATUS_BIT =
    PermissionFlagsBits.SetVoiceChannelStatus ?? (1n << 48n);

function hasPermission(member) {
    if (!member?.permissions) return false;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    try {
        if (member.permissions.has(SET_VOICE_CHANNEL_STATUS_BIT)) return true;
    } catch {}
    return member.permissions.has(PermissionFlagsBits.ManageChannels);
}

function isVoiceLike(channel) {
    return channel && (
        channel.type === ChannelType.GuildVoice ||
        channel.type === ChannelType.GuildStageVoice
    );
}

/**
 * Apply the status via Discord's REST API. Pass `null` to clear.
 * Returns nothing on success, throws on API failure so the caller
 * can render an error container.
 */
async function applyStatus(client, channelId, status) {
    await client.rest.put(`/channels/${channelId}/voice-status`, {
        body: { status: status === null ? null : String(status).slice(0, MAX_STATUS_LENGTH) }
    });
}

/**
 * Run the command body for either prefix or slash.
 *
 * @param {object} ctx
 * @param {import('discord.js').GuildMember} ctx.member
 * @param {import('discord.js').VoiceBasedChannel|null} ctx.channel
 * @param {string|null} ctx.statusText  raw text or null to clear
 * @param {string} ctx.username  for the response details panel
 * @param {Function} ctx.reply  resolves to the reply call (slash deferred or prefix)
 * @param {import('discord.js').Client} ctx.client
 */
async function runStatusUpdate(ctx) {
    const { member, channel, statusText, username, reply, client } = ctx;

    if (!hasPermission(member)) {
        return reply({
            components: [buildErrorResponse(
                'Missing Permission',
                'You need the **Set Voice Channel Status** or **Manage Channels** permission to change a voice channel\'s status.'
            )],
            flags: MessageFlags.IsComponentsV2
        });
    }

    if (!isVoiceLike(channel)) {
        return reply({
            components: [buildErrorResponse(
                'No Voice Channel',
                'Mention a voice channel or join one before running this command.'
            )],
            flags: MessageFlags.IsComponentsV2
        });
    }

    const clearing = statusText === null
        || statusText === ''
        || /^clear$/i.test(String(statusText).trim());

    try {
        await applyStatus(client, channel.id, clearing ? null : statusText);

        const container = buildSuccessResponse(
            clearing ? 'Status Cleared' : 'Status Updated',
            clearing
                ? `Cleared the status of **#${channel.name}**.`
                : `Updated the status of **#${channel.name}**.`,
            {
                'Channel': `#${channel.name}`,
                'Status':  clearing ? 'None' : statusText.slice(0, MAX_STATUS_LENGTH),
                'Moderator': username
            }
        );
        container.setAccentColor(0x57F287);
        return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (err) {
        // Surface Discord's actual error message — usually
        // "Missing Permissions" (50013) or rate-limit (429).
        const reason = err?.rawError?.message
            || err?.message
            || 'Unknown error';
        return reply({
            components: [buildErrorResponse('Failed', `Could not update voice status: ${reason}`)],
            flags: MessageFlags.IsComponentsV2
        });
    }
}

module.exports = {
    name: 'vcstatus',
    prefix: 'vcstatus',
    description: 'Set or clear the status of a voice channel',
    usage: 'vcstatus <status text|clear> [#channel]',
    category: 'voice',
    aliases: ['voicestatus', 'setstatus'],
    permissions: ['SetVoiceChannelStatus'],

    data: new SlashCommandBuilder()
        .setName('vcstatus')
        .setDescription('Set or clear the status of a voice channel')
        .addStringOption(o => o
            .setName('status')
            .setDescription('Status text (or "clear" to remove the current status)')
            .setMaxLength(MAX_STATUS_LENGTH)
            .setRequired(true))
        .addChannelOption(o => o
            .setName('channel')
            .setDescription('Voice channel to update (defaults to your current VC)')
            .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
            .setRequired(false)),

    async execute(interaction) {
        const status = interaction.options.getString('status');
        const channel = interaction.options.getChannel('channel') || interaction.member?.voice?.channel || null;

        return runStatusUpdate({
            member: interaction.member,
            channel,
            statusText: status,
            username: interaction.user.username,
            reply: (opts) => interaction.reply(opts),
            client: interaction.client
        });
    },

    async executePrefix(message, args) {
        if (!args.length) {
            return message.reply({
                components: [buildInvalidUsage(
                    'vcstatus',
                    'vcstatus <status text|clear> [#channel]',
                    [
                        'vcstatus Playing Games',
                        'vcstatus 🎵 Music Session',
                        'vcstatus clear — Removes the status',
                        'vcstatus #VoiceChannel Hanging out'
                    ]
                )],
                flags: MessageFlags.IsComponentsV2
            });
        }

        // Resolve the target channel: a mentioned voice channel beats
        // the user's current voice channel, which beats nothing.
        const mentioned = message.mentions.channels.first();
        let channel, statusText;

        if (mentioned && isVoiceLike(mentioned)) {
            channel = mentioned;
            // Strip the channel mention token from the args list before
            // joining the rest as the status text, regardless of where
            // the mention appeared in the argument list.
            statusText = args
                .filter(a => !/^<#\d+>$/.test(a))
                .join(' ')
                .trim();
        } else {
            channel = message.member?.voice?.channel || null;
            statusText = args.join(' ').trim();
        }

        return runStatusUpdate({
            member: message.member,
            channel,
            statusText,
            username: message.author.username,
            reply: (opts) => message.reply(opts),
            client: message.client
        });
    }
};
