const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');
const premiumManager = require('../../utils/premiumManager');

module.exports = {
    prefix: 'redeemserverkey',
    name: 'redeemserverkey',
    description: 'Redeem a server premium key for this server',
    usage: 'redeemserverkey <key>',
    category: 'admin',
    aliases: ['activateserver', 'serverredeem'],
    
    async executePrefix(message, args) {
      try {
        if (!message.guild) {
            return message.reply('<:Cancel:1473037949187657818> This command can only be used in a server.');
        }

        if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
            const container = buildErrorResponse('No Permission', 'You need **Administrator** permission to activate server premium.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // Delete the user's message immediately to prevent key exposure in chat
        if (args[0] && message.deletable) message.delete().catch(() => {});

        if (!args[0]) {
            let content = `# <:Copy:1473039575302803629> Redeem Server Premium Key\n\n`;
            content += `**Usage:** \`redeemserverkey <key>\`\n\n`;
            content += `### Description\n`;
            content += `> Activate premium features for this entire server.\n`;
            content += `> Get a server key from the bot owner.\n\n`;
            content += `**Example:**\n`;
            content += `\`redeemserverkey ABCD-1234-EFGH-5678\`\n\n`;
            content += `> All members in this server will benefit from premium features.`;

            const container = new ContainerBuilder()
                .setAccentColor(COLORS.INFO)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const keyCode = args[0].toUpperCase();
        const result = premiumManager.redeemServerKey(message.guild.id, message.author.id, keyCode);

        if (!result.success) {
            const container = buildErrorResponse('Redemption Failed', result.message);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let content = `# <:Present:1473038450465706076> Server Premium Activated!\n\n`;
        content += `<:Checkedbox:1473038547165384804> Successfully redeemed key: \`${keyCode}\`\n`;
        content += `<:Home:1473039138868433192> **Server:** ${message.guild.name}\n`;
        content += `<:User:1473038971398520977> **Activated by:** ${message.author.username}\n`;
        
        if (result.expiresAt) {
            content += `<:Timer:1473039056710406204> **Duration:** ${result.duration} days\n`;
            content += `<:Bookopen:1473038576391557130> **Expires:** <t:${Math.floor(new Date(result.expiresAt).getTime() / 1000)}:F>\n`;
        } else {
            content += `<:Timer:1473039056710406204> **Duration:** Permanent ♾️\n`;
        }
        
        content += `\n> All server members now have access to premium features! 🌟`;

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.SUCCESS)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[RedeemServerKey] Error:', error);
            const container = buildErrorResponse('Error', 'An error occurred while executing this command.', error.message);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
