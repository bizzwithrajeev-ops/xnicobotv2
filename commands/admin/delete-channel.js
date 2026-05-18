const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { buildSuccessResponse, buildErrorResponse, buildPermissionDenied, buildInvalidUsage, buildChannelNotFound } = require('../../utils/responseBuilder');

module.exports = {
    prefix: 'delete-channel',
    description: 'Delete a channel from the server',
    usage: 'delete-channel <#channel>',
    category: 'admin',

    async executePrefix(message, args) {
        if (!message.guild) return message.reply('<:Cancel:1473037949187657818> This command can only be used in a server.').catch(() => {});
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            const container = buildPermissionDenied('Manage Channels');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const channel = message.mentions.channels.first();
        if (!channel) {
            const container = buildInvalidUsage(
                'delete-channel',
                '-delete-channel #channel',
                ['-delete-channel #old-chat', '-delete-channel #temp-vc']
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (channel.id === message.channel.id) {
            const container = buildErrorResponse(
                '<:Cancel:1473037949187657818> Cannot Delete Current Channel',
                '<:Infotriangle:1473038460456800459> You cannot delete the channel you are currently in.',
                '<:Caretright:1473038207221502106> Use this command from a different channel.'
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            const channelName = channel.name;
            const channelType = channel.type;
            await channel.delete(`Deleted by ${message.author.username}`);

            const container = buildSuccessResponse(
                '<:Check:1473038547165384804> Channel Deleted',
                `<:Caretright:1473038207221502106> Successfully deleted the channel.`,
                {
                    '<:Caretright:1473038207221502106> Channel Name': channelName,
                    '<:Caretright:1473038207221502106> Deleted By': `${message.author.username}`
                }
            );

            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            const container = buildErrorResponse(
                '<:Cancel:1473037949187657818> Failed to Delete Channel',
                '<:Infotriangle:1473038460456800459> An error occurred while deleting the channel.',
                `<:Caretright:1473038207221502106> Error: ${error.message}`
            );
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
