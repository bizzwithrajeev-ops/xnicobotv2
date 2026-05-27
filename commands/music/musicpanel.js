'use strict';

const { PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { buildIdlePanel } = require('../../utils/musicPanel');
const { buildPermissionDenied } = require('../../utils/responseBuilder');
const { musicSuccess, musicError, replyMusic } = require('../../utils/musicResponse');
const log = require('../../utils/logger-styled');

const jsonStore = require('../../utils/jsonStore');

const STORE = 'musicpanel';
const CV2 = MessageFlags.IsComponentsV2;

function loadPanelConfig() {
    if (!jsonStore.has(STORE)) {
        jsonStore.write(STORE, {});
        return {};
    }
    return jsonStore.read(STORE) || {};
}

function savePanelConfig(config) { jsonStore.write(STORE, config); }

module.exports = {
    name: 'musicpanel',
    prefix: 'musicpanel',
    description: 'Create a dedicated music panel channel with interactive controls',
    usage: 'musicpanel',
    category: 'music',
    aliases: ['mp', 'panel'],

    async executePrefix(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply({ components: [buildPermissionDenied('Manage Channels')], flags: CV2 });
        }

        const config = loadPanelConfig();
        if (config[message.guild.id]) {
            return replyMusic(message, musicError(
                'Panel Already Exists',
                'A music panel is already set up for this server.',
                'Use `removepanel` first if you want to recreate it.'
            ));
        }

        let channel;
        try {
            channel = await message.guild.channels.create({
                name: '・Nico﹒',
                type: ChannelType.GuildText,
                topic: '<:Music:1473039311057190972> Music Panel — type a song name, URL, or playlist (YouTube · Spotify · SoundCloud · Apple Music). Messages auto-delete.',
                permissionOverwrites: [
                    {
                        id: message.guild.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.SendMessages,
                        ],
                    },
                    {
                        id: message.client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ManageMessages,
                            PermissionFlagsBits.EmbedLinks,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.ManageChannels,
                        ],
                    },
                ],
            });

            const idlePanel = buildIdlePanel(message.guild.id);
            const panelMsg  = await channel.send({ components: [idlePanel], flags: CV2 });

            config[message.guild.id] = {
                channelId: channel.id,
                messageId: panelMsg.id,
                createdAt: Date.now(),
            };
            savePanelConfig(config);

            if (global.musicPanelCache) global.musicPanelCache.set(message.guild.id, true);
            if (global.musicPanelChannelCache) global.musicPanelChannelCache.set(message.guild.id, channel.id);

            return replyMusic(message, musicSuccess(
                'Music Panel Created',
                `Panel ready in <#${channel.id}>.`,
                'Members can now type song names there to start playback.'
            ));
        } catch (err) {
            log.error?.(`[musicpanel] Failed to create panel: ${err.message}`);
            try { await channel?.delete().catch(() => {}); } catch {}
            return replyMusic(message, musicError(
                'Panel Creation Failed',
                'Could not create the music panel.',
                err.message || 'Make sure I have the required permissions.'
            ));
        }
    },
};
