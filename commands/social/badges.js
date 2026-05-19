const { ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const badgeManager = require('../../utils/badgeManager');
const { resolveUser } = require('../../utils/resolveUser');

module.exports = {
    prefix: 'badges',
    name: 'badges',
    description: 'View badges for yourself or another user',
    usage: 'badges [@user]',
    category: 'social',
    aliases: ['badge', 'mybadges'],

    async executePrefix(message, args) {
        const user = (await resolveUser(message, args)) || message.author;
        
        try {
            const badges = await badgeManager.getUserBadges(user.id);

            const section = new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${user.username}'s Badges`))
                .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: user.displayAvatarURL({ size: 256 }) } }));

            if (badges.length === 0) {
                const container = new ContainerBuilder()
                    .setAccentColor(0xCAD7E6)
                    .addSectionComponents(section)
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent('*No badges yet! Badges can be earned or awarded.*')
                    );

                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const badgeList = badges.map(b => 
                `${b.emoji} **${b.name}**\n└ ${b.description}`
            ).join('\n\n');

            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addSectionComponents(section)
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        badgeList + `\n\n*Total: ${badges.length} badge${badges.length !== 1 ? 's' : ''}*`
                    )
                );

            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Error viewing badges:', error);
            const { buildErrorResponse } = require('../../utils/responseBuilder');
            const errContainer = buildErrorResponse('Badge Error', 'An error occurred while fetching badges.', 'Please try again later.');
            await message.reply({ components: [errContainer], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
