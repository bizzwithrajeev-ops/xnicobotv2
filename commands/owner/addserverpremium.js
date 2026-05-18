const { isOwner } = require('../../utils/helpers');
const { ContainerBuilder, TextDisplayBuilder, MessageFlags, ChannelType } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');
const premiumManager = require('../../utils/premiumManager');

module.exports = {
    prefix: 'addserverpremium',
    name: 'addserverpremium',
    description: 'Add premium to a server directly',
    usage: 'addserverpremium <server_id> [duration_in_days]',
    category: 'owner',
    aliases: ['giveserverpremium', 'grantserverpremium'],
    ownerOnly: true,
    
    async executePrefix(message, args) {
        if (!isOwner(message.author.id)) {
            const container = buildErrorResponse('Owner Only', 'This command is restricted to the bot owner.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

      try {
        if (!args[0]) {
            let content = `# <:Copy:1473039575302803629> Add Server Premium\n\n`;
            content += `**Usage:** \`addserverpremium <server_id> [duration]\`\n\n`;
            content += `**Examples:**\n`;
            content += `\`addserverpremium 123456789\` — Permanent\n`;
            content += `\`addserverpremium 123456789 30\` — 30 days`;

            const container = new ContainerBuilder()
                .setAccentColor(COLORS.INFO)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const guildId = args[0];

        // Validate guild ID format (Discord snowflake: 17-20 digits)
        if (!/^\d{17,20}$/.test(guildId)) {
            const container = buildErrorResponse('Invalid Server ID', 'Server ID must be a valid Discord snowflake (17-20 digit number).');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let duration = null;
        if (args[1]) {
            const d = parseInt(args[1], 10);
            if (isNaN(d) || d <= 0) {
                const container = buildErrorResponse('Invalid Duration', 'Duration must be a positive number of days.');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            duration = d;
        }

        const guild = message.client.guilds.cache.get(guildId);
        const guildName = guild ? guild.name : `Unknown (${guildId})`;

        const result = premiumManager.addServerPremiumDirect(guildId, duration, message.author.id);

        let content = `# <:Checkedbox:1473038547165384804> Server Premium Added\n\n`;
        content += `<:Home:1473039138868433192> **Server:** ${guildName}\n`;
        content += `<:Timer:1473039056710406204> **Duration:** ${duration ? `${duration} days` : 'Permanent'}\n`;
        if (result.expiresAt) {
            content += `<:Bookopen:1473038576391557130> **Expires:** <t:${Math.floor(new Date(result.expiresAt).getTime() / 1000)}:F>\n`;
        }

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.SUCCESS)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        // --- Drop premium activation message in the server ---
        if (guild) {
            try {
                const botName = message.client.user.username;
                const durationText = duration ? `**${duration} days**` : '**Permanent**';
                const expiryText = duration && result.expiresAt
                    ? `\n<:Bookopen:1473038576391557130> **Expires:** <t:${Math.floor(new Date(result.expiresAt).getTime() / 1000)}:F>`
                    : '';

                const notifContainer = new ContainerBuilder()
                    .setAccentColor(0xCAD7E6);

                let notifContent = `# <:Sketch:1473038248493453352> Server Premium Activated!\n\n`;
                notifContent += `This server has been upgraded to **Premium** for **${botName}**!\n\n`;
                notifContent += `### <:Fire:1473038604812161218> Premium Details\n`;
                notifContent += `<:Caretright:1473038207221502106> **Duration:** ${durationText}${expiryText}\n`;
                notifContent += `<:Caretright:1473038207221502106> **Activated By:** Bot Owner\n\n`;
                notifContent += `### <:Checkedbox:1473038547165384804> Premium Benefits\n`;
                notifContent += `<:Caretright:1473038207221502106> All premium features unlocked for this server\n`;
                notifContent += `<:Caretright:1473038207221502106> Premium commands available for all members\n`;
                notifContent += `<:Caretright:1473038207221502106> Priority support & exclusive features\n\n`;
                notifContent += `-# Enjoy your premium perks! Use \`/serverpremium\` to check status <:Sketch:1473038248493453352>`;

                notifContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(notifContent));

                // Find best channel: announcements > system > general > first writable text channel
                let targetChannel = null;
                
                // Try announcement channels first
                targetChannel = guild.channels.cache.find(ch => 
                    ch.type === ChannelType.GuildAnnouncement && 
                    ch.permissionsFor(guild.members.me)?.has(['SendMessages', 'ViewChannel'])
                );
                
                // Try system channel
                if (!targetChannel && guild.systemChannel) {
                    const perms = guild.systemChannel.permissionsFor(guild.members.me);
                    if (perms?.has(['SendMessages', 'ViewChannel'])) {
                        targetChannel = guild.systemChannel;
                    }
                }

                // Try general or chat named channels
                if (!targetChannel) {
                    targetChannel = guild.channels.cache.find(ch =>
                        ch.type === ChannelType.GuildText &&
                        /^(general|chat|main|lobby)$/i.test(ch.name) &&
                        ch.permissionsFor(guild.members.me)?.has(['SendMessages', 'ViewChannel'])
                    );
                }

                // Fallback to any writable text channel
                if (!targetChannel) {
                    targetChannel = guild.channels.cache.find(ch =>
                        ch.type === ChannelType.GuildText &&
                        ch.permissionsFor(guild.members.me)?.has(['SendMessages', 'ViewChannel'])
                    );
                }

                if (targetChannel) {
                    await targetChannel.send({ components: [notifContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
                }
            } catch (e) {
                // Non-critical
            }
        }
      } catch (error) {
        console.error('[AddServerPremium] Error:', error);
        const container = buildErrorResponse('Error', 'An error occurred while adding server premium.');
        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }
    }
};
