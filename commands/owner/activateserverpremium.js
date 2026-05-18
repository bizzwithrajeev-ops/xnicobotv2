const { isOwner } = require('../../utils/helpers');
const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');
const premiumManager = require('../../utils/premiumManager');

module.exports = {
    prefix: 'activateserverpremium',
    name: 'activateserverpremium',
    description: 'Activate premium on ALL servers the bot is in',
    usage: 'activateserverpremium [duration_in_days]',
    category: 'owner',
    aliases: ['activateallpremium', 'massserverpremium', 'allserverpremium'],
    ownerOnly: true,

    async executePrefix(message, args) {
        if (!isOwner(message.author.id)) {
            const container = buildErrorResponse('Owner Only', 'This command is restricted to the bot owner.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let duration = null;
        if (args[0]) {
            const d = parseInt(args[0], 10);
            if (isNaN(d) || d <= 0) {
                const container = buildErrorResponse('Invalid Duration', 'Duration must be a positive number of days.');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            duration = d;
        }

        const guilds = message.client.guilds.cache;
        const totalGuilds = guilds.size;

        if (totalGuilds === 0) {
            const container = buildErrorResponse('No Servers', 'The bot is not in any servers.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // Send a "working" message first
        const workingContainer = new ContainerBuilder()
            .setAccentColor(COLORS.INFO)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Timer:1473039056710406204> Activating Server Premium\n\nProcessing **${totalGuilds}** servers silently... Please wait.`
                )
            );

        const statusMsg = await message.reply({ components: [workingContainer], flags: MessageFlags.IsComponentsV2 });

        let success = 0;
        let alreadyActive = 0;
        let failed = 0;

        for (const [guildId] of guilds) {
            try {
                const isAlready = premiumManager.isServerPremium(guildId);
                if (isAlready && !duration) {
                    alreadyActive++;
                    continue;
                }

                const result = premiumManager.addServerPremiumDirect(guildId, duration, message.author.id);
                if (result.success) {
                    success++;
                } else {
                    failed++;
                }
            } catch {
                failed++;
            }
        }

        // Silent — no DMs, no server notifications

        const durationText = duration ? `**${duration} days**` : '**Permanent**';

        let content = `# <:Checkedbox:1473038547165384804> Server Premium Activated — All Servers\n\n`;
        content += `<:Home:1473039138868433192> **Total Servers:** ${totalGuilds}\n`;
        content += `<:Checkedbox:1473038547165384804> **Activated:** ${success}\n`;
        if (alreadyActive > 0) {
            content += `<:Bookopen:1473038576391557130> **Already Active:** ${alreadyActive}\n`;
        }
        if (failed > 0) {
            content += `<:Cancel:1473037949187657818> **Failed:** ${failed}\n`;
        }
        content += `<:Timer:1473039056710406204> **Duration:** ${durationText}\n`;

        const resultContainer = new ContainerBuilder()
            .setAccentColor(COLORS.SUCCESS)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        try {
            await statusMsg.edit({ components: [resultContainer], flags: MessageFlags.IsComponentsV2 });
        } catch {
            await message.channel.send({ components: [resultContainer], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
