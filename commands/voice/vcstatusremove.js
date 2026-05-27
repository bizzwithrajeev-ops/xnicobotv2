'use strict';

const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, BRANDING } = require('../../utils/responseBuilder');
const { applyStatus } = require('./vcstatus');
const jsonStore = require('../../utils/jsonStore');

const STORE_NAME = 'vcstatus-persist';

const SET_VOICE_CHANNEL_STATUS_BIT =
    PermissionFlagsBits.SetVoiceChannelStatus ?? (1n << 48n);

function hasPermission(member) {
    if (!member?.permissions) return false;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    try { if (member.permissions.has(SET_VOICE_CHANNEL_STATUS_BIT)) return true; } catch {}
    return member.permissions.has(PermissionFlagsBits.ManageChannels);
}

module.exports = {
    name: 'vcstatusremove',
    prefix: 'vcstatusremove',
    description: 'Remove the voice channel status and clear any persistent status',
    usage: 'vcstatusremove [#channel]',
    category: 'voice',
    aliases: ['vcstatusclear', 'removestatus', 'clearstatus'],

    data: new SlashCommandBuilder()
        .setName('vcstatusremove')
        .setDescription('Remove voice channel status and clear persistence')
        .addChannelOption(o => o
            .setName('channel')
            .setDescription('Voice channel (defaults to your current VC)')
            .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
            .setRequired(false)),

    async execute(interaction) {
        if (!hasPermission(interaction.member)) {
            return interaction.reply({
                components: [buildErrorResponse('Missing Permission', 'You need **Manage Channels** permission.')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
        }

        const channel = interaction.options.getChannel('channel') || interaction.member?.voice?.channel;
        if (!channel || (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)) {
            return interaction.reply({
                components: [buildErrorResponse('No Voice Channel', 'Mention a voice channel or join one.')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
        }

        try {
            await applyStatus(interaction.client, channel.id, null);
            // Remove persistence
            const data = jsonStore.read(STORE_NAME) || {};
            delete data[channel.id];
            jsonStore.write(STORE_NAME, data);

            const container = buildSuccessResponse('Status Removed', `Cleared the status of **${channel.name}** and removed persistence.`, {
                'Channel': `<#${channel.id}>`,
                'Removed By': interaction.user.username
            });
            container.setAccentColor(0x57F287);
            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            await interaction.reply({
                components: [buildErrorResponse('Failed', `Could not clear status: ${err?.rawError?.message || err?.message}`)],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
        }
    },

    async executePrefix(message, args) {
        if (!hasPermission(message.member)) {
            return message.reply({
                components: [buildErrorResponse('Missing Permission', 'You need **Manage Channels** permission.')],
                flags: MessageFlags.IsComponentsV2
            });
        }

        const mentioned = message.mentions.channels.first();
        const channel = (mentioned?.type === ChannelType.GuildVoice || mentioned?.type === ChannelType.GuildStageVoice)
            ? mentioned
            : message.member?.voice?.channel;

        if (!channel || (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)) {
            return message.reply({
                components: [buildErrorResponse('No Voice Channel', 'Mention a voice channel or join one.')],
                flags: MessageFlags.IsComponentsV2
            });
        }

        try {
            await applyStatus(message.client, channel.id, null);
            const data = jsonStore.read(STORE_NAME) || {};
            delete data[channel.id];
            jsonStore.write(STORE_NAME, data);

            const container = buildSuccessResponse('Status Removed', `Cleared the status of **${channel.name}** and removed persistence.`, {
                'Channel': `<#${channel.id}>`,
                'Removed By': message.author.username
            });
            container.setAccentColor(0x57F287);
            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            await message.reply({
                components: [buildErrorResponse('Failed', `Could not clear status: ${err?.rawError?.message || err?.message}`)],
                flags: MessageFlags.IsComponentsV2
            });
        }
    }
};
