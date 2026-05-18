const { PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
    usage: 'setcategory',
    category: 'admin',
    name: 'setcategory',
    prefix: 'setcategory',
    description: 'Move a channel to a different category',
    async executePrefix(message, args) {
        if (!message.guild) return message.reply('<:Cancel:1473037949187657818> This command can only be used in a server.').catch(() => {});
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('<:Cancel:1473037949187657818> You need the **Manage Channels** permission!');
        }

        const channel = message.mentions.channels.first() || message.channel;
        const categoryId = args.find(arg => /^\d+$/.test(arg));

        if (!categoryId) {
            return message.reply('<:Cancel:1473037949187657818> Please provide a category ID!\n**Usage:** `-setcategory #channel <categoryID>`');
        }

        const category = message.guild.channels.cache.get(categoryId);
        if (!category || category.type !== ChannelType.GuildCategory) {
            return message.reply('<:Cancel:1473037949187657818> Invalid category ID!');
        }

        try {
            await channel.setParent(category);
            await message.reply(`<:Checkedbox:1473038547165384804> Moved **${channel.name}** to **${category.name}**`);
        } catch (error) {
            await message.reply('<:Cancel:1473037949187657818> Failed to move channel!');
        }
    }
};
