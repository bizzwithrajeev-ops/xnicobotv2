const { SlashCommandBuilder, AttachmentBuilder, ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = require('discord.js');
const { getImageUrl, getImageUrlFromInteraction, isImageApiConfigured, getUnavailableMessage } = require('../../utils/imageCommandHelper');
const { getImageApiUrl } = require('../../utils/imageApiHelper');

function isImageReferenceArg(arg) {
    return /^<@!?(\d+)>$/.test(arg) || /^https?:\/\//i.test(arg);
}

function isValidBorderColor(color) {
    return /^[a-zA-Z]{3,20}$/.test(color) || /^#?[0-9a-fA-F]{3,6}$/.test(color);
}

function buildResponse(color, sourceType) {
    return new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`<:Attach:1473037923979886694> **Border Added**\n-# Added ${color} border to ${sourceType}`)
        )
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://border.png'))
        );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('border')
        .setDescription('Add a border to an image')
        .addStringOption(o => o.setName('color').setDescription('Border color (name or hex)').setRequired(false))
        .addAttachmentOption(o => o.setName('image').setDescription('Image to add border to').setRequired(false))
        .addUserOption(o => o.setName('user').setDescription('Use this user\'s avatar').setRequired(false))
        .addStringOption(o => o.setName('url').setDescription('Image URL').setRequired(false)),
    prefix: 'border',
    name: 'border',
    description: 'Add a border to an image',
    usage: 'border [color] [image|@user|url]',
    category: 'image',
    aliases: ['frame'],

    async execute(interaction) {
        if (!isImageApiConfigured()) return interaction.reply({ content: getUnavailableMessage(), flags: MessageFlags.Ephemeral });
        const color = interaction.options.getString('color') || 'black';
        if (!isValidBorderColor(color)) return interaction.reply({ content: '<:Cancel:1473037949187657818> Invalid border color. Use a color name or hex code (e.g. `#ff0000`).', flags: MessageFlags.Ephemeral });
        await interaction.deferReply();
        const { url: imageUrl, source: sourceType } = getImageUrlFromInteraction(interaction);
        try {
            const apiUrl = getImageApiUrl('border', imageUrl, { color });
            if (!apiUrl) return interaction.editReply({ content: getUnavailableMessage() });
            const attachment = new AttachmentBuilder(apiUrl, { name: 'border.png' });
            await interaction.editReply({ components: [buildResponse(color, sourceType)], files: [attachment], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[IMAGE] border error:', error.message);
            await interaction.editReply({ content: '<:Cancel:1473037949187657818> Failed to add border to image.' });
        }
    },

    async executePrefix(message, args) {
        if (!isImageApiConfigured()) return message.reply(getUnavailableMessage());
        const firstArg = args[0];
        const hasColorArg = !!firstArg && !isImageReferenceArg(firstArg);
        const color = hasColorArg ? firstArg : 'black';
        if (!isValidBorderColor(color)) return message.reply('<:Cancel:1473037949187657818> Invalid border color. Use a color name or hex code (e.g. `#ff0000`).');
        const imageArgs = hasColorArg ? args.slice(1) : args;
        const { url: imageUrl, source: sourceType } = await getImageUrl(message, imageArgs);
        try {
            const apiUrl = getImageApiUrl('border', imageUrl, { color });
            if (!apiUrl) return message.reply(getUnavailableMessage());
            const attachment = new AttachmentBuilder(apiUrl, { name: 'border.png' });
            await message.reply({ components: [buildResponse(color, sourceType)], files: [attachment], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[IMAGE] border error:', error.message);
            await message.reply('<:Cancel:1473037949187657818> Failed to add border to image.');
        }
    }
};
