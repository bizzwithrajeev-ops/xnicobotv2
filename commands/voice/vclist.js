'use strict';

/**
 * /vclist · -vclist
 * ───────────────────────────────────────────────────────────────────
 * Show every voice / stage channel in the guild plus the members
 * currently connected. The previous version inlined the full output
 * into one Components V2 container which trips the 4 000-char text
 * cap on big guilds — easy to hit on a busy server with 30+ VCs.
 *
 * This version emits one paginated container with up to 6 channels
 * per page (each channel block is multi-line). Pagination is shared
 * with the rest of the bot via utils/pagination.
 */

const {
    SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType,
} = require('discord.js');

const { COLORS, BRANDING, buildErrorResponse } = require('../../utils/responseBuilder');
const { paginate, setupPaginationCollector } = require('../../utils/pagination');

/* ─────────────────────────── helpers ───────────────────────────── */

const E = {
    on:        '<:Toggleon:1473038585501581312>',
    off:       '<:Toggleoff:1473038582813032590>',
    caret:     '<:Caretright:1473038207221502106>',
    voice:     '<:Volumeup:1473039290136002844>',
    stage:     '<:Microphone:1473039293088927996>',
    mic_off:   '<:Microphoneoff:1473039278438219984>',
    deaf:      '<:Volumeoff:1473039301414621427>',
    stream:    '<:YoutubeLive:1507444089292066907>',
    camera:    '<:Camera:1473039293088927996>',
    summary:   '<:Invoice:1473039492217835550>',
    none:      '<:Cancel:1473037949187657818>',
    info:      '<:Inforect:1473038624172937287>',
};

function memberStatusIcons(voiceState) {
    const tags = [];
    if (voiceState?.serverMute) tags.push(E.mic_off);
    if (voiceState?.serverDeaf) tags.push(E.deaf);
    if (voiceState?.streaming)  tags.push(E.stream);
    if (voiceState?.selfVideo)  tags.push(E.camera);
    return tags.length ? ` ${tags.join('')}` : '';
}

function escapeName(name) {
    // Escape Markdown so a `**channel**` named `**` doesn't break the layout.
    return String(name).replace(/([*_`~|\\])/g, '\\$1').slice(0, 100);
}

/**
 * Render a single channel block. Truncates the member list when it
 * gets ridiculously long so a single channel block can't blow the
 * 4 000-char container cap on its own.
 */
function renderChannelBlock(channel) {
    const isStage   = channel.type === ChannelType.GuildStageVoice;
    const typeIcon  = isStage ? E.stage : E.voice;
    const members   = channel.members ? [...channel.members.values()] : [];
    const count     = members.length;
    const limit     = channel.userLimit ? `/${channel.userLimit}` : '';
    const status    = count > 0 ? E.on : E.off;

    const head = `${status} ${typeIcon} **${escapeName(channel.name)}** \`${count}${limit}\``;

    if (count === 0) return head;

    const MEMBER_CAP = 20;
    const visible = members.slice(0, MEMBER_CAP);
    const memberLines = visible.map(m => {
        const name = m.user?.username ?? m.displayName ?? m.id;
        return `> ${E.caret} ${name}${memberStatusIcons(m.voice)}`;
    });
    if (count > MEMBER_CAP) {
        memberLines.push(`> ${E.caret} *…and ${count - MEMBER_CAP} more*`);
    }
    return `${head}\n${memberLines.join('\n')}`;
}

/**
 * Build the paginate() input — header + per-channel block lines.
 */
function buildPaginatedResult(guild) {
    const voiceChannels = guild.channels.cache
        .filter(ch =>
            ch.type === ChannelType.GuildVoice ||
            ch.type === ChannelType.GuildStageVoice)
        .sort((a, b) => a.position - b.position);

    if (voiceChannels.size === 0) {
        return { empty: true };
    }

    const totalConnected = voiceChannels.reduce(
        (acc, ch) => acc + (ch.members?.size ?? 0), 0,
    );
    const occupied = voiceChannels.filter(ch => (ch.members?.size ?? 0) > 0).size;

    const lines = voiceChannels.map(renderChannelBlock);

    const header =
        `# ${E.voice} Voice Channel Overview\n` +
        `-# **${voiceChannels.size}** channel${voiceChannels.size === 1 ? '' : 's'} • ` +
        `**${occupied}** active • ` +
        `**${totalConnected}** member${totalConnected === 1 ? '' : 's'} connected`;

    const footer =
        `${E.summary} **Channels** \`${voiceChannels.size}\`  ·  ` +
        `**Active** \`${occupied}\`  ·  ` +
        `**Connected** \`${totalConnected}\`\n${BRANDING}`;

    return paginate({
        header,
        lines,
        perPage:     6,
        accentColor: COLORS.CYAN,
        footer,
    });
}

function buildEmptyContainer() {
    return buildErrorResponse(
        'No Voice Channels',
        'This server has no voice or stage channels yet.',
    );
}

/* ─────────────────────────── command ───────────────────────────── */

module.exports = {
    name:        'vclist',
    prefix:      'vclist',
    description: 'Show all voice channels and their connected members',
    usage:       'vclist',
    category:    'voice',
    aliases:     ['voicelist', 'voicemembers', 'vcinfo'],

    data: new SlashCommandBuilder()
        .setName('vclist')
        .setDescription('Show all voice channels and their connected members')
        .setDefaultMemberPermissions(PermissionFlagsBits.ViewChannel)
        .setDMPermission(false),

    async execute(interaction) {
        const result = buildPaginatedResult(interaction.guild);
        if (result.empty) {
            return interaction.reply({
                components: [buildEmptyContainer()],
                flags: MessageFlags.IsComponentsV2,
            });
        }
        const reply = await interaction.reply({ ...result, fetchReply: true });
        setupPaginationCollector(reply, result._pageData, interaction.user.id);
    },

    async executePrefix(message) {
        const result = buildPaginatedResult(message.guild);
        if (result.empty) {
            return message.reply({
                components: [buildEmptyContainer()],
                flags: MessageFlags.IsComponentsV2,
            });
        }
        const reply = await message.reply(result);
        setupPaginationCollector(reply, result._pageData, message.author.id);
    },
};
