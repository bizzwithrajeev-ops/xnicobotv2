const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { COLORS } = require('../../utils/responseBuilder');
const premiumManager = require('../../utils/premiumManager');

module.exports = {
    prefix: 'premiumperks',
    name: 'premiumperks',
    description: 'View all premium features and benefits',
    usage: 'premiumperks',
    category: 'utility',
    aliases: ['perks', 'premiumfeatures', 'prembenefits'],
    
    async executePrefix(message) {
        const hasAccess = premiumManager.hasPremiumAccess(message.author.id, message.guild?.id);

        let content = `# <:Sketch:1473038248493453352> Premium Features\n\n`;

        if (hasAccess) {
            content += `<:Checkedbox:1473038547165384804> **You have Premium access!** All perks below are active.\n\n`;
        } else {
            content += `> Unlock all features below by redeeming a premium key!\n\n`;
        }

        content += `### <:Fire:1473038604812161218> Premium Benefits\n\n`;

        content += `**<:Caretright:1473038207221502106> Bot Customization**\n`;
        content += `> Customize the bot's name, avatar, status, and embed colors for your server.\n\n`;

        content += `**<:Caretright:1473038207221502106> No Cooldown Restrictions**\n`;
        content += `> Use commands without any cooldown delays.\n\n`;

        content += `**<:Caretright:1473038207221502106> Priority Support**\n`;
        content += `> Get priority assistance from the bot support team.\n\n`;

        content += `**<:Caretright:1473038207221502106> Exclusive Premium Badge**\n`;
        content += `> Show off a premium badge on your profile.\n\n`;

        content += `**<:Caretright:1473038207221502106> Premium-Only Commands**\n`;
        content += `> Access exclusive commands reserved for premium users.\n\n`;

        content += `**<:Caretright:1473038207221502106> Server-Wide Premium**\n`;
        content += `> Admins can activate server premium so all members benefit.\n\n`;

        // Acquiring section
        content += `### <:Key:1473038690606649375> How to Get Premium\n\n`;
        content += `**Option 1:** Get a premium key from the bot owner\n`;
        content += `> Use \`redeemkey <key>\` to activate for yourself\n\n`;
        content += `**Option 2:** Server premium key (admin only)\n`;
        content += `> Use \`redeemserverkey <key>\` to activate for the whole server\n\n`;

        // Status
        if (hasAccess) {
            content += `-# ✨ You're already enjoying premium! Use \`premium\` to check your status.`;
        } else {
            content += `-# Contact the bot owner to get a premium key.`;
        }

        const container = new ContainerBuilder()
            .setAccentColor(hasAccess ? 0xF5C542 : COLORS.INFO)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
