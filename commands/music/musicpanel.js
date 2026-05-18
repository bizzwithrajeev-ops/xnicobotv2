const { PermissionFlagsBits, ChannelType, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const { buildIdlePanel } = require('../../utils/musicPanel');
const { buildErrorResponse } = require('../../utils/responseBuilder');

const jsonStore = require('../../utils/jsonStore');

function loadPanelConfig() {
    if (!jsonStore.has('musicpanel')) {
        jsonStore.write('musicpanel', {});
        return {};
    }
    return jsonStore.read('musicpanel');
}

function savePanelConfig(config) {
    jsonStore.write('musicpanel', config);
}

module.exports = {
    name: 'musicpanel',
    description: 'Create a dedicated music panel channel with interactive controls',
    
    async executePrefix(message, args, lavalinkManager) {
        console.log('Music panel command executed by', message.author.username);
        
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply({ components: [buildErrorResponse('No Permission', 'You need **Manage Channels** permission to use this command!')], flags: MessageFlags.IsComponentsV2 });
        }

        const config = loadPanelConfig();
        
        // Check if panel already exists for this server
        if (config[message.guild.id]) {
            return message.reply({ components: [buildErrorResponse('Already Set', 'A music panel already exists in this server! Only one panel is allowed per server.')], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            const channel = await message.guild.channels.create({
                name: '・Nico﹒',
                type: ChannelType.GuildText,
                topic: '<:Music:1473039311057190972> Music Panel - Type song names, URLs, or playlists from YouTube, Spotify, SoundCloud & Apple Music! Your messages will auto-delete.',
                permissionOverwrites: [
                    {
                        id: message.guild.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel, 
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.SendMessages
                        ]
                    },
                    {
                        id: message.client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ManageMessages,
                            PermissionFlagsBits.EmbedLinks,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.ManageChannels
                        ]
                    }
                ]
            });

            const idlePanel = buildIdlePanel(message.guild.id);

            const panelMessage = await channel.send({ 
                components: [idlePanel], 
                flags: MessageFlags.IsComponentsV2 
            });

            // Store single panel per server
            config[message.guild.id] = {
                channelId: channel.id,
                messageId: panelMessage.id,
                createdAt: Date.now()
            };
            savePanelConfig(config);
            
            // Update caches to indicate panel exists
            if (global.musicPanelCache) {
                global.musicPanelCache.set(message.guild.id, true);
            }
            if (global.musicPanelChannelCache) {
                global.musicPanelChannelCache.set(message.guild.id, channel.id);
            }

            const successContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Music Panel Created!\n\n**Channel:** <#${channel.id}>\n\nUsers can now type song names in that channel to play music!\n\n-# The panel will update automatically when music plays`)
                );

            await message.reply({ components: [successContainer], flags: MessageFlags.IsComponentsV2 });

        } catch (error) {
            console.error('Music Panel Error:', error);
            console.error('Error stack:', error.stack);
            await message.reply({ components: [buildErrorResponse('Failed', `Failed to create music panel. Error: ${error.message}\n\nMake sure I have proper permissions!`)], flags: MessageFlags.IsComponentsV2 }).catch(console.error);
        }
    }
};
