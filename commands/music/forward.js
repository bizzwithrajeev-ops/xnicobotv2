const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { formatTime } = require('../../utils/helpers');
const { buildErrorResponse } = require('../../utils/responseBuilder');

module.exports = {
    async executePrefix(message, args, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(message.guild.id);
            if (!player || !player.queue.current) {
                return message.reply({ components: [buildErrorResponse('No Player', 'Nothing is playing!')], flags: MessageFlags.IsComponentsV2 });
            }
            if (!message.member.voice.channel) {
                return message.reply({ components: [buildErrorResponse('Voice Required', 'You need to be in a voice channel!')], flags: MessageFlags.IsComponentsV2 });
            }

            const seconds = parseInt(args[0]) || 10;
            if (seconds < 1 || seconds > 60) {
                return message.reply({ components: [buildErrorResponse('Missing Input', 'Please provide a value between 1 and 60 seconds!')], flags: MessageFlags.IsComponentsV2 });
            }

            const currentPosition = player.position;
            const duration = player.queue.current.info.duration;
            const newPosition = Math.min(duration, currentPosition + (seconds * 1000));

            await player.seek(newPosition);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Fastforward:1473039306292723976> Fast Forwarded\n\nWent forward ${seconds} seconds\n\n**Current Position:** ${formatTime(newPosition)}`)
                );

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Forward Error:', error);
            message.reply({ components: [buildErrorResponse('Error', `An error occurred: ${error.message || 'Unknown error'}`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }
};
