const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'channel-rename',
    prefix: 'channel-rename',
    description: 'Rename a channel',
    category: 'admin',
    usage: 'channel-rename [#channel] <new_name>',
    permissions: ['ManageChannels'],

    async executePrefix(message, args) {
        if (!message.guild) return message.reply('<:Cancel:1473037949187657818> This command can only be used in a server.').catch(() => {});
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('<:Infocircle:1473038519029989588> You need Manage Channels permission to use this command.');
        }

        const channel = message.mentions.channels.first() || message.channel;
        const newName = args.slice(message.mentions.channels.first() ? 1 : 0).join('-');

        if (!newName) {
            return message.reply('<:Infocircle:1473038519029989588> Usage: `channel-rename [#channel] <new_name>`');
        }

        try {
            const oldName = channel.name;
            await channel.setName(newName);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`<:Checkedbox:1473038547165384804> Channel renamed from **${oldName}** to **${newName}**`)
                );

            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            await message.reply(`<:Cancel:1473037949187657818> Failed to rename channel: ${error.message}`);
        }
    }
};
