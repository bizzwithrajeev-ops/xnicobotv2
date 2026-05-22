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

            if (args.length < 2) {
                return message.reply({ components: [buildErrorResponse('Invalid Usage', 'Usage: `-move <from> <to>`')], flags: MessageFlags.IsComponentsV2 });
            }

            const fromPos = parseInt(args[0]) - 1;
            const toPos = parseInt(args[1]) - 1;

            if (isNaN(fromPos) || isNaN(toPos)) {
                return message.reply({ components: [buildErrorResponse('Missing Input', 'Please provide valid position numbers!')], flags: MessageFlags.IsComponentsV2 });
            }

            if (fromPos < 0 || fromPos >= player.queue.tracks.length) {
                return message.reply({ components: [buildErrorResponse('Invalid Input', `Invalid 'from' position! Queue has ${player.queue.tracks.length} tracks.`)], flags: MessageFlags.IsComponentsV2 });
            }

            if (toPos < 0 || toPos >= player.queue.tracks.length) {
                return message.reply({ components: [buildErrorResponse('Invalid Input', `Invalid 'to' position! Queue has ${player.queue.tracks.length} tracks.`)], flags: MessageFlags.IsComponentsV2 });
            }

            const track = player.queue.tracks[fromPos];
            player.queue.tracks.splice(fromPos, 1);
            player.queue.tracks.splice(toPos, 0, track);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Refresh:1473037911581528165> Track Moved\n\n**${track.info.title}**\n\nMoved from position ${fromPos + 1} to position ${toPos + 1}`)
                );

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Move Error:', error);
            message.reply({ components: [buildErrorResponse('Error', `An error occurred: ${error.message || 'Unknown error'}`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }
};
