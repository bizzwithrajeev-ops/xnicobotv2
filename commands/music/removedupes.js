const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { voiceErrorMessage } = require('../../utils/musicHelpers');

module.exports = {
    async executePrefix(message, args, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(message.guild.id);
            if (!player || !player.queue.current) {
                return message.reply({ components: [buildErrorResponse('No Player', 'Nothing is playing!')], flags: MessageFlags.IsComponentsV2 });
            }
            {
            const __ve = voiceErrorMessage(message.member, lavalinkManager?.getPlayer?.(message.guild.id));
            if (__ve) return message.reply({ components: [buildErrorResponse('Voice Required', __ve)], flags: MessageFlags.IsComponentsV2 });
        }

            const originalLength = player.queue.tracks.length;
            
            if (originalLength === 0) {
                return message.reply({ components: [buildErrorResponse('Empty Queue', 'The queue is empty!')], flags: MessageFlags.IsComponentsV2 });
            }

            const seen = new Set();
            const uniqueTracks = [];

            for (const track of player.queue.tracks) {
                const identifier = track.info.identifier || track.info.uri;
                if (!seen.has(identifier)) {
                    seen.add(identifier);
                    uniqueTracks.push(track);
                }
            }

            player.queue.tracks = uniqueTracks;
            const removedCount = originalLength - uniqueTracks.length;

            if (removedCount === 0) {
                const container = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder()
                            .setContent(`# <:Checkedbox:1473038547165384804> No Duplicates Found\n\nThe queue has no duplicate tracks!`)
                    );

                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Trash:1473038090074591293> Duplicates Removed\n\n**Removed:** ${removedCount} duplicate track${removedCount > 1 ? 's' : ''}\n**Remaining:** ${uniqueTracks.length} unique track${uniqueTracks.length !== 1 ? 's' : ''}`)
                );

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Removedupes Error:', error);
            message.reply({ components: [buildErrorResponse('Error', `An error occurred: ${error.message || 'Unknown error'}`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }
};
