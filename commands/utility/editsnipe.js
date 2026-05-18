
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { COLORS, BRANDING } = require('../../utils/responseBuilder');

const editedMessages = new Map();
const MAX_SNIPES = 10;
const SNIPE_EXPIRE_MS = 10 * 60 * 1000; // 10 minutes

function buildEditSnipeContainer(snipedMessage, index, total) {
    const timestamp = Math.floor(snipedMessage.editedAt / 1000);
    const avatarUrl = snipedMessage.authorAvatar || `https://cdn.discordapp.com/embed/avatars/${(parseInt(snipedMessage.authorId) >> 22) % 6}.png`;
    const indexLabel = total > 1 ? ` (${index}/${total})` : '';

    const container = new ContainerBuilder().setAccentColor(COLORS.PRIMARY);

    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### <:Editalt:1473038138577256670> Edit Sniped Message${indexLabel}\n` +
                    `**${snipedMessage.author}** · <t:${timestamp}:R>`
                )
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
    );

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    const before = snipedMessage.before ? (snipedMessage.before.length > 900 ? snipedMessage.before.slice(0, 900) + '...' : snipedMessage.before) : '*[No text content]*';
    const after = snipedMessage.after ? (snipedMessage.after.length > 900 ? snipedMessage.after.slice(0, 900) + '...' : snipedMessage.after) : '*[No text content]*';

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Before:**\n${before}\n\n**After:**\n${after}`));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

    return container;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('editsnipe')
        .setDescription('View recently edited messages in this channel')
        .addIntegerOption(opt => opt.setName('index').setDescription('Which edited message to view (1 = most recent)').setMinValue(1).setMaxValue(MAX_SNIPES).setRequired(false)),

    prefix: 'editsnipe',
    description: 'View recently edited messages in this channel',
    usage: 'editsnipe [index]',
    category: 'utility',
    aliases: ['esnipe'],

    async execute(interaction) {
        const channelId = interaction.channel.id;
        const snipes = getValidSnipes(channelId);
        const index = (interaction.options.getInteger('index') || 1);

        if (!snipes.length) {
            const container = new ContainerBuilder().setAccentColor(COLORS.ERROR)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> No Edited Messages\n\nThere are no recently edited messages in this channel.\n-# Messages expire after 10 minutes.'));
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        if (index > snipes.length) {
            const container = new ContainerBuilder().setAccentColor(COLORS.ERROR)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Invalid Index\n\nOnly **${snipes.length}** sniped edit(s) available. Use \`/editsnipe index:1-${snipes.length}\`.`));
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const snipedMessage = snipes[index - 1];
        await interaction.reply({ components: [buildEditSnipeContainer(snipedMessage, index, snipes.length)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async executePrefix(message, args) {
        const channelId = message.channel.id;
        const snipes = getValidSnipes(channelId);
        const index = parseInt(args[0]) || 1;

        if (!snipes.length) {
            const container = new ContainerBuilder().setAccentColor(COLORS.ERROR)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> No Edited Messages\n\nThere are no recently edited messages in this channel.\n-# Messages expire after 10 minutes.'));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (index < 1 || index > snipes.length) {
            const container = new ContainerBuilder().setAccentColor(COLORS.ERROR)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Invalid Index\n\nOnly **${snipes.length}** sniped edit(s) available. Use \`editsnipe 1-${snipes.length}\`.`));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const snipedMessage = snipes[index - 1];
        await message.reply({ components: [buildEditSnipeContainer(snipedMessage, index, snipes.length)], flags: MessageFlags.IsComponentsV2 });
    },

    saveEditedMessage(oldMessage, newMessage) {
        if (newMessage.author?.bot) return;
        if (!newMessage.author) return;
        if (oldMessage.content === newMessage.content) return;

        const channelId = newMessage.channel.id;
        if (!editedMessages.has(channelId)) editedMessages.set(channelId, []);
        const snipes = editedMessages.get(channelId);

        snipes.unshift({
            author: newMessage.author.displayName || newMessage.author.username,
            authorId: newMessage.author.id,
            authorAvatar: newMessage.author.displayAvatarURL({ size: 128 }),
            before: oldMessage.content || null,
            after: newMessage.content || null,
            editedAt: Date.now()
        });

        if (snipes.length > MAX_SNIPES) snipes.length = MAX_SNIPES;
    }
};

function getValidSnipes(channelId) {
    const snipes = editedMessages.get(channelId);
    if (!snipes?.length) return [];
    const now = Date.now();
    const valid = snipes.filter(s => now - s.editedAt < SNIPE_EXPIRE_MS);
    if (valid.length !== snipes.length) editedMessages.set(channelId, valid);
    return valid;
}
