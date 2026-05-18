const { isOwner } = require('../../utils/helpers');
const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');
const premiumManager = require('../../utils/premiumManager');

module.exports = {
    prefix: 'removeserverpremium',
    name: 'removeserverpremium',
    description: 'Remove premium from a server',
    usage: 'removeserverpremium <server_id>',
    category: 'owner',
    aliases: ['revokeserverpremium', 'takeserverpremium'],
    ownerOnly: true,
    
    async executePrefix(message, args) {
        if (!isOwner(message.author.id)) {
            const container = buildErrorResponse('Owner Only', 'This command is restricted to the bot owner.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

      try {
        if (!args[0]) {
            let content = `# <:Copy:1473039575302803629> Remove Server Premium\n\n`;
            content += `**Usage:** \`removeserverpremium <server_id>\`\n\n`;
            content += `**Example:** \`removeserverpremium 123456789\``;

            const container = new ContainerBuilder()
                .setAccentColor(COLORS.INFO)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const guildId = args[0];
        const guild = message.client.guilds.cache.get(guildId);
        const guildName = guild ? guild.name : `Unknown (${guildId})`;

        const result = premiumManager.removeServerPremium(guildId);

        if (!result.success) {
            const container = buildErrorResponse('Not Found', result.message);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let content = `# <:Checkedbox:1473038547165384804> Server Premium Removed\n\n`;
        content += `<:Home:1473039138868433192> **Server:** ${guildName}\n`;
        content += `> Server premium has been revoked.`;

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.SUCCESS)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      } catch (error) {
        console.error('[RemoveServerPremium] Error:', error);
        const container = buildErrorResponse('Error', 'An error occurred while removing server premium.');
        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }
    }
};
