
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = require('discord.js');
const { COLORS, BRANDING } = require('../../utils/responseBuilder');

const deletedMessages = new Map();
const MAX_SNIPES = 10;
const SNIPE_EXPIRE_MS = 10 * 60 * 1000; // 10 minutes

function buildSnipeContainer(snipedMessage, index, total) {
    const timestamp = Math.floor(snipedMessage.deletedAt / 1000);
    const avatarUrl = snipedMessage.authorAvatar || `https://cdn.discordapp.com/embed/avatars/${(parseInt(snipedMessage.authorId) >> 22) % 6}.png`;
    const indexLabel = total > 1 ? ` (${index}/${total})` : '';

    const container = new ContainerBuilder().setAccentColor(COLORS.PRIMARY);

    // Header with avatar thumbnail
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### <:Search:1473038053219106847> Sniped Message${indexLabel}\n` +
                    `**${snipedMessage.author}** · <t:${timestamp}:R>`
                )
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    // Message content
    const content = snipedMessage.content || null;
    const hasEmbeds = snipedMessage.embeds?.length > 0;
    const hasStickers = snipedMessage.stickers?.length > 0;

    let bodyText = '';
    if (content) {
        bodyText += content.length > 1900 ? content.slice(0, 1900) + '...' : content;
    }
    if (hasStickers) {
        bodyText += (bodyText ? '\n\n' : '') + '**Stickers:** ' + snipedMessage.stickers.map(s => '`' + s + '`').join(', ');
    }
    if (hasEmbeds) {
        bodyText += (bodyText ? '\n\n' : '') + '*Message contained ' + snipedMessage.embeds.length + ' embed(s)*';
    }
    if (!bodyText) bodyText = '*[No text content]*';

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyText));

    // Image attachments in media gallery
    const imageAttachments = (snipedMessage.attachments || []).filter(a => a.contentType?.startsWith('image/'));
    const otherAttachments = (snipedMessage.attachments || []).filter(a => !a.contentType?.startsWith('image/'));

    if (imageAttachments.length > 0) {
        const gallery = new MediaGalleryBuilder();
        for (const img of imageAttachments.slice(0, 10)) {
            gallery.addItems(new MediaGalleryItemBuilder().setURL(img.url));
        }
        container.addMediaGalleryComponents(gallery);
    }

    // Non-image attachments listed as text
    if (otherAttachments.length > 0) {
        const fileList = otherAttachments.map(a => `📎 [${a.name}](${a.url})`).join('\n');
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fileList));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

    return container;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('snipe')
        .setDescription('View recently deleted messages in this channel')
        .addIntegerOption(opt => opt.setName('index').setDescription('Which deleted message to view (1 = most recent)').setMinValue(1).setMaxValue(MAX_SNIPES).setRequired(false)),

    prefix: 'snipe',
    description: 'View recently deleted messages in this channel',
    usage: 'snipe [index]',
    category: 'utility',
    aliases: [],

    async execute(interaction) {
        const channelId = interaction.channel.id;
        const snipes = getValidSnipes(channelId);
        const index = (interaction.options.getInteger('index') || 1);

        if (!snipes.length) {
            const container = new ContainerBuilder().setAccentColor(COLORS.ERROR)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> No Deleted Messages\n\nThere are no recently deleted messages in this channel.\n-# Messages expire after 10 minutes.'));
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        if (index > snipes.length) {
            const container = new ContainerBuilder().setAccentColor(COLORS.ERROR)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Invalid Index\n\nOnly **${snipes.length}** sniped message(s) available. Use \`/snipe index:1-${snipes.length}\`.`));
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const snipedMessage = snipes[index - 1];
        await interaction.reply({ components: [buildSnipeContainer(snipedMessage, index, snipes.length)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async executePrefix(message, args) {
        const channelId = message.channel.id;
        const snipes = getValidSnipes(channelId);
        const index = parseInt(args[0]) || 1;

        if (!snipes.length) {
            const container = new ContainerBuilder().setAccentColor(COLORS.ERROR)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> No Deleted Messages\n\nThere are no recently deleted messages in this channel.\n-# Messages expire after 10 minutes.'));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (index < 1 || index > snipes.length) {
            const container = new ContainerBuilder().setAccentColor(COLORS.ERROR)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Invalid Index\n\nOnly **${snipes.length}** sniped message(s) available. Use \`snipe 1-${snipes.length}\`.`));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const snipedMessage = snipes[index - 1];
        await message.reply({ components: [buildSnipeContainer(snipedMessage, index, snipes.length)], flags: MessageFlags.IsComponentsV2 });
    },

    saveDeletedMessage(message) {
        if (message.author?.bot) return;
        if (!message.author) return;

        const channelId = message.channel.id;
        if (!deletedMessages.has(channelId)) deletedMessages.set(channelId, []);
        const snipes = deletedMessages.get(channelId);

        snipes.unshift({
            author: message.author.displayName || message.author.username,
            authorId: message.author.id,
            authorAvatar: message.author.displayAvatarURL({ size: 128 }),
            content: message.content || null,
            attachments: message.attachments?.map(a => ({ url: a.url, name: a.name, contentType: a.contentType })) || [],
            embeds: message.embeds?.length || 0,
            stickers: message.stickers?.map(s => s.name) || [],
            deletedAt: Date.now()
        });

        if (snipes.length > MAX_SNIPES) snipes.length = MAX_SNIPES;
    }
};

function getValidSnipes(channelId) {
    const snipes = deletedMessages.get(channelId);
    if (!snipes?.length) return [];
    const now = Date.now();
    const valid = snipes.filter(s => now - s.deletedAt < SNIPE_EXPIRE_MS);
    if (valid.length !== snipes.length) deletedMessages.set(channelId, valid);
    return valid;
}
