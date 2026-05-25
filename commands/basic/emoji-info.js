'use strict';

/**
 * emoji-info.js — prefix-only.
 * Resolves a server emoji from a custom emoji string, name, or ID and
 * shows its metadata + image.
 */

const { ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');

function findEmoji(guild, input) {
    const customMatch = input.match(/<a?:(\w+):(\d+)>/);
    if (customMatch) return guild.emojis.cache.get(customMatch[2]);

    const name = input.replace(/:/g, '').trim();
    return guild.emojis.cache.find(e => e.name.toLowerCase() === name.toLowerCase())
        || guild.emojis.cache.get(name); // also try as raw ID
}

function buildEmojiInfoContainer(emoji) {
    return new ContainerBuilder()
        .setAccentColor(COLORS.INFO)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# ${emoji} Emoji Information`)
        )
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(emoji.url))
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
}

module.exports = {
    name: 'emoji-info',
    prefix: 'emoji-info',
    aliases: ['emojiinfo', 'emoji-url', 'emojiurl'],
    description: 'Get information about a server emoji',
    usage: 'emoji-info <emoji or name>',
    category: 'basic',

    async executePrefix(message, args) {
        try {
            if (!args.length) {
                const err = buildErrorResponse('Missing Argument', 'Please provide an emoji name or custom emoji.\n**Usage:** `emoji-info <emoji>`');
                return message.reply({ components: [err], flags: MessageFlags.IsComponentsV2 });
            }
            if (!message.guild) {
                const err = buildErrorResponse('Server Required', 'This command must be used in a server.');
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
            console.error('[emoji-info]', error);
            await message.reply('<:Cancel:1473037949187657818> An error occurred while running this command.').catch(() => {});
        }
    }
};
