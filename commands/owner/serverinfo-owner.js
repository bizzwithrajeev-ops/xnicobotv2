'use strict';

/**
 * serverinfo-owner.js — prefix-only.
 * Owner-only: show detailed info about any guild the bot is in.
 */

const { isOwner } = require('../../utils/helpers');
const { MessageFlags, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');

async function buildServerInfoContainer(guild) {
    const owner = await guild.fetchOwner();
    const channels = guild.channels.cache;
    const textChannels = channels.filter(c => c.type === 0).size;
    const voiceChannels = channels.filter(c => c.type === 2).size;
    const categories = channels.filter(c => c.type === 4).size;

    const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Bookopen:1473038576391557130> ${guild.name}`))
        .setThumbnailAccessory(new ThumbnailBuilder({
            media: { url: guild.iconURL({ size: 256 }) || 'https://cdn.discordapp.com/embed/avatars/0.png' }
        }));

    const container = new ContainerBuilder()
        .addSectionComponents(section)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**<:Fileuser:1473039570630348810> Server ID:** ${guild.id}\n` +
            `**<:Crown:1506010837368963142> Owner:** ${owner.user.username} (\`${owner.id}\`)\n` +
            `**<:Clock:1473039102113878056> Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>\n\n` +
            `**<:User:1473038971398520977> Members:** ${guild.memberCount}\n` +
            `**<:Chat:1473038936241864865> Channels:** Text: ${textChannels} | Voice: ${voiceChannels} | Categories: ${categories}\n` +
            `**<:Userplus:1473038912212435086> Roles:** ${guild.roles.cache.size}\n\n` +
            `**😀 Emojis:** ${guild.emojis.cache.size}\n` +
            `**<:Caretright:1473038207221502106> Stickers:** ${guild.stickers.cache.size}\n` +
            `**<:Lightningalt:1473038679906844824> Boost:** Level ${guild.premiumTier} (${guild.premiumSubscriptionCount || 0} boosts)\n` +
            `**<:Shield:1473038669831995494> Verification:** ${guild.verificationLevel.toString()}\n\n` +
            `**📜 Features:** ${guild.features.length > 0 ? guild.features.slice(0, 5).join(', ') : 'None'}`
        ));

    if (guild.banner) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(guild.bannerURL({ size: 1024 })))
        );
    }

    return container;
}

module.exports = {
    name: 'serverinfo-owner',
    prefix: 'serverinfo-owner',
    aliases: ['guildinfo-owner', 'sio'],
    description: 'Owner-only: get detailed info about any server',
    usage: 'serverinfo-owner <serverId>',
    category: 'owner',
    ownerOnly: true,

    async executePrefix(message, args) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const guildId = args[0];
        if (!guildId) return message.reply('<:Cancel:1473037949187657818> Please provide a server ID!');

        const guild = message.client.guilds.cache.get(guildId);
        if (!guild) {
            return message.reply(`<:Cancel:1473037949187657818> Bot is not in server with ID: \`${guildId}\``);
        }

        try {
            const container = await buildServerInfoContainer(guild);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            await message.reply(`<:Cancel:1473037949187657818> Failed to fetch server info: ${error.message}`);
        }
    }
};
