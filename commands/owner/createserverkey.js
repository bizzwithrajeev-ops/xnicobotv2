const { isOwner } = require('../../utils/helpers');
const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');
const premiumManager = require('../../utils/premiumManager');

module.exports = {
    prefix: 'createserverkey',
    name: 'createserverkey',
    description: 'Create a server premium key',
    usage: 'createserverkey [duration_in_days]',
    category: 'owner',
    aliases: ['genserverkey', 'serverkey'],
    ownerOnly: true,
    
    async executePrefix(message, args) {
        if (!isOwner(message.author.id)) {
            const container = buildErrorResponse('Owner Only', 'This command is restricted to the bot owner.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

      try {
        let duration = null;
        if (args[0]) {
            const parsedDuration = parseInt(args[0], 10);
            if (isNaN(parsedDuration) || parsedDuration <= 0) {
                let content = `# <:Copy:1473039575302803629> Create Server Premium Key\n\n`;
                content += `**Usage:** \`createserverkey [duration_in_days]\`\n\n`;
                content += `### Description\n`;
                content += `> Creates a premium key for **server-level** activation.\n`;
                content += `> Server admins can redeem it using \`redeemserverkey <key>\`.\n\n`;
                content += `**Examples:**\n`;
                content += `\`createserverkey\` — Permanent server premium\n`;
                content += `\`createserverkey 30\` — 30-day server premium\n`;
                content += `\`createserverkey 365\` — 1-year server premium`;

                const container = new ContainerBuilder()
                    .setAccentColor(COLORS.INFO)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            duration = parsedDuration;
        }

        const keyData = premiumManager.createKey(duration, 'server');
        
        const createdTs = Math.floor(new Date(keyData.createdAt).getTime() / 1000);
        const expiresTs = Math.floor(new Date(keyData.expiresAt).getTime() / 1000);

        let content = `# <:Checkedbox:1473038547165384804> Server Premium Key Created\n\n`;
        content += `<:Key:1473038690606649375> **Key:** \`${keyData.key}\`\n`;
        content += `<:Copy:1473039575302803629> **Type:** Server Premium\n`;
        content += `<:Bookopen:1473038576391557130> **Created:** <t:${createdTs}:R>\n`;
        content += `<:Alarm:1473039068546732214> **Key Expires:** <t:${expiresTs}:R> (must be redeemed within 24h)\n`;
        content += `<:Timer:1473039056710406204> **Premium Duration:** ${duration ? `${duration} days` : 'Permanent'}\n`;
        content += `<:Invoice:1473039492217835550> **Status:** Unused\n\n`;
        content += `> Server admins can activate using \`redeemserverkey ${keyData.key}\``;

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.SUCCESS)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      } catch (error) {
        console.error('[CreateServerKey] Error:', error);
        const container = buildErrorResponse('Error', 'An error occurred while creating the server key.');
        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }
    }
};
