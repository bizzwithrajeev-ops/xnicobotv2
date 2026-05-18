const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, COLORS } = require('../../utils/responseBuilder');
const premiumManager = require('../../utils/premiumManager');
const badgeManager = require('../../utils/badgeManager');

module.exports = {
    prefix: 'redeemkey',
    name: 'redeemkey',
    description: 'Redeem a premium key',
    usage: 'redeemkey <key>',
    category: 'utility',
    aliases: ['redeem', 'activatekey'],
    
    async executePrefix(message, args) {
      try {
        // Delete the user's message immediately to prevent key exposure in chat
        if (args[0] && message.deletable) message.delete().catch(() => {});

        if (!args[0]) {
            let content = `# <:Key:1473038690606649375> Redeem Premium Key\n\n`;
            content += `**Usage:** \`redeemkey <key>\`\n\n`;
            content += `### Description\n`;
            content += `> Redeem a premium key to activate premium features.\n\n`;
            content += `**Example:**\n`;
            content += `\`redeemkey ABCD-1234-EFGH-5678\`\n\n`;
            content += `> Keys are provided by the bot owner and can grant temporary or permanent premium access.`;

            const container = new ContainerBuilder()
                .setAccentColor(COLORS.INFO)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const keyCode = args[0].toUpperCase();
        const result = premiumManager.redeemKey(message.author.id, keyCode);

        if (!result.success) {
            const container = buildErrorResponse('Redemption Failed', result.message);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let content = `# <:Present:1473038450465706076> Premium Activated!\n\n`;
        content += `<:Checkedbox:1473038547165384804> Successfully redeemed key: \`${keyCode}\`\n`;
        content += `<:User:1473038971398520977> **User:** ${message.author.username}\n`;
        
        if (result.expiresAt) {
            content += `<:Timer:1473039056710406204> **Duration:** ${result.duration} days\n`;
            content += `<:Bookopen:1473038576391557130> **Expires:** <t:${Math.floor(new Date(result.expiresAt).getTime() / 1000)}:F>\n`;
        } else {
            content += `<:Timer:1473039056710406204> **Duration:** Permanent\n`;
        }
        
        content += `\n> Thank you for using premium features! 🌟`;

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.SUCCESS)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        // Grant premium badge (best-effort, non-blocking)
        await badgeManager.addBadgeToUser(message.author.id, 'premium').catch(() => {});

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      } catch (error) {
        console.error('[RedeemKey] Error:', error);
        message.reply('<:Cancel:1473037949187657818> An error occurred while redeeming the key. Please try again.').catch(() => {});
      }
    }
};
