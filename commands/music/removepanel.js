
const { PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');

const jsonStore = require('../../utils/jsonStore');

function loadPanelConfig() {
    if (!jsonStore.has('musicpanel')) {
        return {};
    }
    return jsonStore.read('musicpanel');
}

function savePanelConfig(config) {
    jsonStore.write('musicpanel', config);
}

module.exports = {
    name: 'removepanel',
    description: 'Remove the music panel from this server',
    
    async executePrefix(message, args, lavalinkManager) {
        console.log('Remove music panel command executed by', message.author.username);
        
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply({ components: [buildErrorResponse('No Permission', 'You need **Manage Channels** permission to use this command!')], flags: MessageFlags.IsComponentsV2 });
        }

        const config = loadPanelConfig();
        
        // Check if panel exists for this server
        if (!config[message.guild.id]) {
            return message.reply({ components: [buildErrorResponse('Error', 'No music panel exists in this server!')], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            const panelData = config[message.guild.id];
            const channel = message.guild.channels.cache.get(panelData.channelId);
            
            if (channel) {
                // Delete the channel
                await channel.delete('Music panel removed by admin');
                console.log(`<:Trash:1473038090074591293> Deleted music panel channel ${panelData.channelId} in guild ${message.guild.id}`);
            }

            // Remove from config
            delete config[message.guild.id];
            savePanelConfig(config);
            
            // Update caches to indicate panel no longer exists
            if (global.musicPanelCache) {
                global.musicPanelCache.set(message.guild.id, false);
            }
            if (global.musicPanelChannelCache) {
                global.musicPanelChannelCache.delete(message.guild.id);
            }

            const successContainer = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent('# <:Checkedbox:1473038547165384804> Panel Removed\n\nMusic panel has been successfully removed!')
                );
            await message.reply({ components: [successContainer], flags: MessageFlags.IsComponentsV2 });

        } catch (error) {
            console.error('Remove Music Panel Error:', error);
            console.error('Error stack:', error.stack);
            await message.reply({ components: [buildErrorResponse('Failed', `Failed to remove music panel. Error: ${error.message}`)], flags: MessageFlags.IsComponentsV2 }).catch(console.error);
        }
    }
};
