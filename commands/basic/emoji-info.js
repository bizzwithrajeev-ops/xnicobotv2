const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');

function buildEmojiInfoContainer(emoji) {
    const container = new ContainerBuilder()
        .setAccentColor(COLORS.INFO)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# ${emoji} Emoji Information`)
        )
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(emoji.url)
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**Name:** ${emoji.name}\n` +
                `**ID:** \`${emoji.id}\`\n` +
                `**Animated:** ${emoji.animated ? 'Yes' : 'No'}\n` +
                `**Created:** <t:${Math.floor(emoji.createdTimestamp / 1000)}:R>\n` +
                `**Usage:** \`<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>\`\n` +
                `**URL:** ${emoji.url}`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));

    return container;
}

module.exports = {
    prefix: 'emoji-info',
    description: 'Get information about a server emoji',
    usage: 'emoji-info <emoji or name>',
    category: 'basic',
    aliases: ['emojiinfo', 'emoji-url', 'emojiurl'],

    data: new SlashCommandBuilder()
        .setName('emoji-info')
        .setDescription('Get information about a server emoji')
        .addStringOption(opt => opt.setName('emoji').setDescription('Emoji name or custom emoji').setRequired(true)),

    async execute(interaction) {
        try {
            const input = interaction.options.getString('emoji');
            const emoji = findEmoji(interaction.guild, input);
            if (!emoji) {
                const err = buildErrorResponse('Emoji Not Found', `Could not find emoji \`${input}\` in this server.`);
                return interaction.reply({ components: [err], flags: MessageFlags.IsComponentsV2 });
            }
            const container = buildEmojiInfoContainer(emoji);
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[EMOJI-INFO] Error:`, error);
            const content = '<:Cancel:1473037949187657818> An error occurred while running this command.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content }).catch(() => {});
            } else {
                await interaction.reply({ content, ephemeral: true }).catch(() => {});
            }
        }
    },

    async executePrefix(message, args) {
        try {
            if (!args.length) {
                const err = buildErrorResponse('Missing Argument', 'Please provide an emoji name or custom emoji.\n**Usage:** `emoji-info <emoji>`');
                return message.reply({ components: [err], flags: MessageFlags.IsComponentsV2 });
            }
            const input = args.join(' ');
            const emoji = findEmoji(message.guild, input);
            if (!emoji) {
                const err = buildErrorResponse('Emoji Not Found', `Could not find emoji \`${input}\` in this server.`);
                return message.reply({ components: [err], flags: MessageFlags.IsComponentsV2 });
            }
            const container = buildEmojiInfoContainer(emoji);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[EMOJI-INFO] Error:`, error);
            await message.reply('<:Cancel:1473037949187657818> An error occurred while running this command.').catch(() => {});
        }
    }
};

function findEmoji(guild, input) {
    // Try parsing custom emoji format <:name:id> or <a:name:id>
    const customMatch = input.match(/<a?:(\w+):(\d+)>/);
    if (customMatch) {
        return guild.emojis.cache.get(customMatch[2]);
    }
    // Try by name (strip colons)
    const name = input.replace(/:/g, '').trim();
    return guild.emojis.cache.find(e => e.name.toLowerCase() === name.toLowerCase())
        || guild.emojis.cache.get(name); // also try as ID
}
