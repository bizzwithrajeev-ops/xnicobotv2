const { ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { formatTime } = require('../../utils/helpers');
const { buildErrorResponse } = require('../../utils/responseBuilder');

module.exports = {
    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        if (!player || !player.queue.current) {
            return message.reply({ components: [buildErrorResponse('No Player', 'Nothing is playing!')], flags: MessageFlags.IsComponentsV2 });
        }

        const track = player.queue.current;
        
        let container;
        
        if (track.info.artworkUrl) {
            const section = new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Music:1473039311057190972> Saved Track`))
                .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: track.info.artworkUrl } }));

            container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addSectionComponents(section)
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**${track.info.title}**\n\n` +
                        `**Artist:** ${track.info.author || 'Unknown'}\n` +
                        `**Duration:** ${formatTime(track.info.duration)}\n` +
                        `**Server:** ${message.guild.name}\n` +
                        `**URL:** ${track.info.uri || 'No URL available'}`
                    )
                );
        } else {
            container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Music:1473039311057190972> Saved Track\n\n` +
                        `**${track.info.title}**\n\n` +
                        `**Artist:** ${track.info.author || 'Unknown'}\n` +
                        `**Duration:** ${formatTime(track.info.duration)}\n` +
                        `**Server:** ${message.guild.name}\n` +
                        `**URL:** ${track.info.uri || 'No URL available'}`
                    )
                );
        }

        try {
            await message.author.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
            const successContainer = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent('# <:Checkedbox:1473038547165384804> Grabbed!\n\nSong info has been sent to your DMs!')
                );
            await message.reply({ components: [successContainer], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            await message.reply({ components: [buildErrorResponse('Error', "I couldn't send you a DM! Make sure your DMs are open.")], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
