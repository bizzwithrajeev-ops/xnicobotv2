const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'channel-position',
    prefix: 'channel-position',
    description: 'Change the position of a channel',
    category: 'admin',
    usage: 'channel-position <#channel> <position>',
    permissions: ['ManageChannels'],

    async executePrefix(message, args) {
        if (!message.guild) return message.reply('<:Cancel:1473037949187657818> This command can only be used in a server.').catch(() => {});
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('<:Infocircle:1473038519029989588> You need Manage Channels permission to use this command.');
        }

        const channel = message.mentions.channels.first();
        if (!channel) {
            return message.reply('<:Infocircle:1473038519029989588> Please mention a channel.');
        }

        const position = parseInt(args[1]);
        if (isNaN(position) || position < 0) {
            return message.reply('<:Infocircle:1473038519029989588> Please provide a valid position number.');
        }

        try {
            await channel.setPosition(position);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`<:Checkedbox:1473038547165384804> ${channel} position set to **${position}**.`)
                );

            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            await message.reply(`<:Cancel:1473037949187657818> Failed to set channel position: ${error.message}`);
        }
    }
};
