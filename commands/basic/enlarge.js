const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse, buildInvalidUsage, COLORS } = require('../../utils/responseBuilder');

function buildEnlarged(customEmoji) {
    const [, animated, name, id] = customEmoji;
    const ext = animated ? 'gif' : 'png';
    const url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=512`;

    return new ContainerBuilder()
        .setAccentColor(COLORS.INFO)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Search:1473038053219106847> Enlarged Emoji`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `<:Caretright:1473038207221502106> **Name:** ${name}\n` +
            `<:Fileuser:1473039570630348810> **ID:** \`${id}\`\n` +
            `<:Palette:1473039029476917461> **Animated:** ${animated ? 'Yes' : 'No'}`
        ))
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(url)
            )
        )
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('enlarge')
        .setDescription('Enlarge a custom emoji')
        .addStringOption(opt => opt.setName('emoji').setDescription('Custom emoji to enlarge').setRequired(true)),

    prefix: 'enlarge',
    description: 'Enlarge a custom emoji',
    usage: 'enlarge <emoji>',
    category: 'basic',
    aliases: ['jumbo', 'bigemoji'],

    async execute(interaction) {
        const emoji = interaction.options.getString('emoji');
        const customEmoji = emoji.match(/<(a?):(\w+):(\d+)>/);
        if (customEmoji) {
            const container = buildEnlarged(customEmoji);
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } else {
            const container = buildErrorResponse(
                'Invalid Emoji',
                'Please provide a valid custom emoji.',
                'Standard Unicode emojis cannot be enlarged. Use a custom server emoji.'
            );
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args) {
        try {
            const emoji = args[0];
            
            if (!emoji) {
                const container = buildInvalidUsage(
                    'enlarge',
                    '-enlarge <emoji>',
                    ['-enlarge :customEmoji:', '-enlarge <:emoji:123456789>']
                );
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const customEmoji = emoji.match(/<(a?):(\w+):(\d+)>/);
            
            if (customEmoji) {
                const container = buildEnlarged(customEmoji);
                message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } else {
                const container = buildErrorResponse(
                    'Invalid Emoji',
                    'Please provide a valid custom emoji.',
                    'Standard Unicode emojis cannot be enlarged. Use a custom server emoji.'
                );
                message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
        } catch (error) {
            console.error(`[ENLARGE] Error:`, error);
            await message.reply('<:Cancel:1473037949187657818> An error occurred while running this command.').catch(() => {});
        }
    }
};
