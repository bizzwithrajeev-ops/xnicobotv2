const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { COLORS } = require('../../utils/responseBuilder');
const premiumManager = require('../../utils/premiumManager');

module.exports = {
    prefix: 'premium',
    name: 'premium',
    description: 'Check your premium status',
    usage: 'premium [@user]',
    category: 'utility',
    aliases: ['premiumstatus', 'checkpremium'],
    
    async executePrefix(message, args) {
      try {
        const targetUser = message.mentions.users.first() || message.author;
        const status = premiumManager.getPremiumStatus(targetUser.id);
        const serverStatus = message.guild ? premiumManager.getServerPremiumStatus(message.guild.id) : null;
        const hasAccess = premiumManager.hasPremiumAccess(targetUser.id, message.guild?.id);

        let content = `# <:Sketch:1473038248493453352> Premium Status\n\n`;
        content += `<:User:1473038971398520977> **User:** ${targetUser.username}\n`;

        // Determine overall access label
        if (hasAccess) {
            const source = status.isPremium ? 'User Premium' : serverStatus?.isPremium ? 'Server Premium' : 'Bot Owner';
            content += `<:Checkedbox:1473038547165384804> **Status:** Premium Active (${source})\n\n`;
        } else {
            content += `<:Cancel:1473037949187657818> **Status:** No Premium\n\n`;
        }

        // User premium details
        if (status.isPremium) {
            content += `### <:Key:1473038690606649375> User Premium\n`;
            content += `<:Bookopen:1473038576391557130> **Activated:** <t:${Math.floor(new Date(status.activatedAt).getTime() / 1000)}:R>\n`;
            
            if (status.expiresAt) {
                const expiryTimestamp = Math.floor(new Date(status.expiresAt).getTime() / 1000);
                content += `<:Alarm:1473039068546732214> **Expires:** <t:${expiryTimestamp}:F> (<t:${expiryTimestamp}:R>)\n`;
            } else {
                content += `<:Alarm:1473039068546732214> **Duration:** Permanent ♾️\n`;
            }
            
            content += `<:Key:1473038690606649375> **Key Used:** \`${status.keyUsed || 'Unknown'}\`\n\n`;
        }

        // Server premium details
        if (serverStatus?.isPremium) {
            content += `### <:Home:1473039138868433192> Server Premium\n`;
            content += `<:Bookopen:1473038576391557130> **Activated:** <t:${Math.floor(new Date(serverStatus.activatedAt).getTime() / 1000)}:R>\n`;
            
            if (serverStatus.expiresAt) {
                const expiryTs = Math.floor(new Date(serverStatus.expiresAt).getTime() / 1000);
                content += `<:Alarm:1473039068546732214> **Expires:** <t:${expiryTs}:F> (<t:${expiryTs}:R>)\n`;
            } else {
                content += `<:Alarm:1473039068546732214> **Duration:** Permanent ♾️\n`;
            }
            if (serverStatus.activatedBy) {
                content += `<:User:1473038971398520977> **Activated By:** <@${serverStatus.activatedBy}>\n`;
            }
            content += `\n`;
        }

        if (hasAccess) {
            content += `> Enjoy your premium features! 🌟`;
        } else {
            content += `> Get a premium key from the bot owner to activate premium features.\n`;
            content += `> Use \`redeemkey <key>\` to redeem your premium key.`;
        }

        const container = new ContainerBuilder()
            .setAccentColor(hasAccess ? COLORS.SUCCESS : COLORS.INFO)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      } catch (error) {
        console.error('[Premium] Error:', error);
        message.reply('<:Cancel:1473037949187657818> An error occurred while checking premium status.').catch(() => {});
      }
    }
};
