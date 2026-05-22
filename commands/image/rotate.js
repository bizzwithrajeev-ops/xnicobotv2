const { SlashCommandBuilder, AttachmentBuilder, ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = require('discord.js');
const { getImageUrl, getImageUrlFromInteraction, isImageApiConfigured, getUnavailableMessage } = require('../../utils/imageCommandHelper');
const { getImageApiUrl } = require('../../utils/imageApiHelper');

function isIntegerString(value) {
    return /^-?\d+$/.test(value);
}

function buildResponse(degrees, sourceType) {
    return new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`<:Refresh:1473037911581528165> **Rotated Image**\n-# Rotated ${sourceType} by ${degrees}°`)
        )
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://rotate.png'))
        );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rotate')
        .setDescription('Rotate an image')
        .addIntegerOption(o => o.setName('degrees').setDescription('Rotation degrees (-360 to 360)').setMinValue(-360).setMaxValue(360).setRequired(false))
        .addAttachmentOption(o => o.setName('image').setDescription('Image to rotate').setRequired(false))
        .addUserOption(o => o.setName('user').setDescription('Use this user\'s avatar').setRequired(false))
        .addStringOption(o => o.setName('url').setDescription('Image URL').setRequired(false)),
    prefix: 'rotate',
    name: 'rotate',
    description: 'Rotate an image',
    usage: 'rotate [degrees] [image|@user|url]',
    category: 'image',
    aliases: ['turn'],

    async execute(interaction) {
        if (!isImageApiConfigured()) return interaction.reply({ content: getUnavailableMessage(), flags: MessageFlags.Ephemeral });
        const degrees = interaction.options.getInteger('degrees') ?? 90;
        await interaction.deferReply();
        const { url: imageUrl, source: sourceType } = getImageUrlFromInteraction(interaction);
        try {
            const apiUrl = getImageApiUrl('rotate', imageUrl, { degrees });
            if (!apiUrl) return interaction.editReply({ content: getUnavailableMessage() });
            const attachment = new AttachmentBuilder(apiUrl, { name: 'rotate.png' });
            await interaction.editReply({ components: [buildResponse(degrees, sourceType)], files: [attachment], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[IMAGE] rotate error:', error.message);
            await interaction.editReply({ content: '<:Cancel:1473037949187657818> Failed to rotate image.' });
        }
    },

    async executePrefix(message, args) {
        if (!isImageApiConfigured()) return message.reply(getUnavailableMessage());
        const firstArg = args[0];
        const hasDegreesArg = !!firstArg && isIntegerString(firstArg);
        const degrees = hasDegreesArg ? parseInt(firstArg, 10) : 90;
        if (degrees < -360 || degrees > 360) return message.reply('<:Cancel:1473037949187657818> Rotation degrees must be between `-360` and `360`.');
        const imageArgs = hasDegreesArg ? args.slice(1) : args;
        const { url: imageUrl, source: sourceType } = await getImageUrl(message, imageArgs);
        try {
            const apiUrl = getImageApiUrl('rotate', imageUrl, { degrees });
            if (!apiUrl) return message.reply(getUnavailableMessage());
            const attachment = new AttachmentBuilder(apiUrl, { name: 'rotate.png' });
            await message.reply({ components: [buildResponse(degrees, sourceType)], files: [attachment], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[IMAGE] rotate error:', error.message);
            await message.reply('<:Cancel:1473037949187657818> Failed to rotate image.');
        }
    }
};
