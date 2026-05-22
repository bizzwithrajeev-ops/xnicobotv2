const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { COLORS } = require('../../utils/responseBuilder');
const premiumManager = require('../../utils/premiumManager');

module.exports = {
    prefix: 'serverpremium',
    name: 'serverpremium',
    description: 'Check this server\'s premium status',
    usage: 'serverpremium',
    category: 'utility',
    aliases: ['serverprem', 'guildpremium'],
    
    async executePrefix(message) {
      try {
        if (!message.guild) {
            return message.reply('<:Cancel:1473037949187657818> This command can only be used in a server.');
        }

        const status = premiumManager.getServerPremiumStatus(message.guild.id);

        let content = `# <:Copy:1473039575302803629> Server Premium Status\n\n`;
        content += `<:Home:1473039138868433192> **Server:** ${message.guild.name}\n`;
        content += `<:Copy:1473039575302803629> **Status:** ${status.isPremium ? '<:Checkedbox:1473038547165384804> **Premium Active**' : '<:Cancel:1473037949187657818> **No Premium**'}\n\n`;

        if (status.isPremium) {
            content += `<:Bookopen:1473038576391557130> **Activated:** <t:${Math.floor(new Date(status.activatedAt).getTime() / 1000)}:R>\n`;
            
            if (status.expiresAt) {
                const expiryTs = Math.floor(new Date(status.expiresAt).getTime() / 1000);
                content += `<:Alarm:1473039068546732214> **Expires:** <t:${expiryTs}:F> (<t:${expiryTs}:R>)\n`;
            } else {
                content += `<:Alarm:1473039068546732214> **Duration:** Permanent ♾️\n`;
            }
            
            content += `<:Key:1473038690606649375> **Key Used:** \`${status.keyUsed || 'Unknown'}\`\n`;
            if (status.activatedBy) {
                content += `<:User:1473038971398520977> **Activated By:** <@${status.activatedBy}>\n`;
            }
            content += `\n> All members in this server enjoy premium features! 🌟`;
        } else {
            content += `> Ask the bot owner for a server premium key.\n`;
            content += `> Use \`redeemserverkey <key>\` to activate (requires Admin).`;
        }

        const container = new ContainerBuilder()
            .setAccentColor(status.isPremium ? COLORS.SUCCESS : COLORS.INFO)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      } catch (error) {
        console.error('[ServerPremium] Error:', error);
        message.reply('<:Cancel:1473037949187657818> An error occurred while checking server premium status.').catch(() => {});
      }
    }
};
