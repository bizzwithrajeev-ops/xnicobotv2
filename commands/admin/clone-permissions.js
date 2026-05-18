const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

module.exports = {
    prefix: 'clone-permissions',
    description: 'Clone Permissions',
    usage: 'clone-permissions',
    category: 'admin',
    data: null,

    async executePrefix(message, args) {
        if (!message.guild) return message.reply('<:Cancel:1473037949187657818> This command can only be used in a server.').catch(() => {});
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('<:Cancel:1473037949187657818> You need **Manage Channels** permission to use this command!');
        }

        if (args.length < 2) {
            return message.reply('<:Cancel:1473037949187657818> Usage: `clone-permissions <#source-channel> <#target-channel>`');
        }

        try {
            const sourceChannel = message.mentions.channels.first();
            const targetChannel = [...message.mentions.channels.values()][1];

            if (!sourceChannel || !targetChannel) {
                return message.reply('<:Cancel:1473037949187657818> Please mention both source and target channels!');
            }

            await targetChannel.permissionOverwrites.set(sourceChannel.permissionOverwrites.cache);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Permissions Cloned!\n\n**From:** ${sourceChannel}\n**To:** ${targetChannel}\n\n*All permission overrides copied successfully*`)
                );

            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            await message.reply(`<:Cancel:1473037949187657818> Error: ${error.message}`);
        }
    }
};
