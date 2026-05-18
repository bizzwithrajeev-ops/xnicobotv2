const { isOwner } = require('../../utils/helpers');
const { MessageFlags, SeparatorSpacingSize, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder } = require('discord.js');
const {
    buildSuccessResponse, buildErrorResponse, buildInfoResponse, buildInvalidUsage,
    COLORS, EMOJIS, BRANDING
} = require('../../utils/responseBuilder');

const SUPPORTED_EVENTS = {
    guildMemberAdd: {
        description: 'Member joins the server',
        emoji: '<:Userplus:1473038912212435086>',
        target: 'member',
        requiresGuild: true
    },
    guildMemberRemove: {
        description: 'Member leaves the server',
        emoji: '<:Userblock:1473038868184826149>',
        target: 'member',
        requiresGuild: true
    },
    guildMemberUpdate: {
        description: 'Member is updated (role/nick change)',
        emoji: '<:Editalt:1473038138577256670>',
        target: 'member',
        requiresGuild: true
    },
    guildBanAdd: {
        description: 'Member is banned',
        emoji: '<:banhammer:1473367388597780592>',
        target: 'ban',
        requiresGuild: true
    },
    guildBanRemove: {
        description: 'Member is unbanned',
        emoji: '<:Unlock:1473038516639236269>',
        target: 'ban',
        requiresGuild: true
    },
    channelCreate: {
        description: 'Channel is created',
        emoji: '<:Add:1473038100862337035>',
        target: 'channel',
        requiresGuild: true
    },
    channelDelete: {
        description: 'Channel is deleted',
        emoji: '<:Trash:1473038090074591293>',
        target: 'channel',
        requiresGuild: true
    },
    roleCreate: {
        description: 'Role is created',
        emoji: '<:Add:1473038100862337035>',
        target: 'role',
        requiresGuild: true
    },
    roleDelete: {
        description: 'Role is deleted',
        emoji: '<:Trash:1473038090074591293>',
        target: 'role',
        requiresGuild: true
    },
    messageDelete: {
        description: 'Message is deleted',
        emoji: '<:Trash:1473038090074591293>',
        target: 'message',
        requiresGuild: false
    },
    messageCreate: {
        description: 'Message is sent',
        emoji: '<:Chat:1473038936241864865>',
        target: 'message',
        requiresGuild: false
    },
    guildCreate: {
        description: 'Bot joins a server',
        emoji: '<:Checkedbox:1473038547165384804>',
        target: 'guild',
        requiresGuild: true
    },
    guildDelete: {
        description: 'Bot leaves a server',
        emoji: '<:Cancel:1473037949187657818>',
        target: 'guild',
        requiresGuild: true
    },
    interactionCreate: {
        description: 'Interaction is triggered',
        emoji: '<:Settings:1473037894703779851>',
        target: 'interaction',
        requiresGuild: false
    }
};

function buildEventTarget(event, message, targetUser) {
    const info = SUPPORTED_EVENTS[event];
    if (!info) return null;

    const member = targetUser
        ? message.guild.members.cache.get(targetUser.id) || message.member
        : message.member;

    switch (info.target) {
        case 'member':
            return member;
        case 'ban':
            return { guild: message.guild, user: member.user };
        case 'channel':
            return message.channel;
        case 'role':
            return message.guild.roles.cache.find(r => !r.managed && r.id !== message.guild.id) || message.guild.roles.everyone;
        case 'message':
            return message;
        case 'guild':
            return message.guild;
        case 'interaction':
            return null;
        default:
            return member;
    }
}

module.exports = {
    name: 'emit',

    async executePrefix(message, args, lavalinkManager, client) {
        if (!isOwner(message.author.id)) {
            const container = buildErrorResponse('Owner Only', 'This command is restricted to the bot owner.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const event = args[0];
        const targetUser = message.mentions.users.first();

        // No args → show event list panel
        if (!event) {
            let listContent = `# ${EMOJIS.LIST} Event Emitter\n\n`;
            listContent += `Emit Discord client events for testing purposes.\n\n`;
            listContent += `### <:Settings:1473037894703779851> Available Events\n`;

            for (const [name, info] of Object.entries(SUPPORTED_EVENTS)) {
                listContent += `> ${info.emoji} \`${name}\` — ${info.description}\n`;
            }

            listContent += `\n### <:Edit:1473037903625191580> Usage\n`;
            listContent += `\`emit <event>\` — Emit with yourself as target\n`;
            listContent += `\`emit <event> @user\` — Emit with mentioned user as target\n`;
            listContent += `\n### <:Bookopen:1473038576391557130> Examples\n`;
            listContent += `\`emit guildMemberAdd\`\n`;
            listContent += `\`emit guildMemberAdd @User\`\n`;
            listContent += `\`emit channelCreate\`\n`;

                        const container = new ContainerBuilder()
                .setAccentColor(COLORS.CYAN)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(listContent))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // Validate event name
        if (!SUPPORTED_EVENTS[event]) {
            const validNames = Object.keys(SUPPORTED_EVENTS).map(e => `\`${e}\``).join(', ');
            const container = buildErrorResponse(
                'Unknown Event',
                `**${event}** is not a supported event.`,
                `Valid events: ${validNames}`
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const eventInfo = SUPPORTED_EVENTS[event];

        // Guild check
        if (eventInfo.requiresGuild && !message.guild) {
            const container = buildErrorResponse('Guild Required', `The **${event}** event can only be emitted inside a server.`);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // Build the appropriate target object
        const target = buildEventTarget(event, message, targetUser);

        if (target === null && eventInfo.target !== 'interaction') {
            const container = buildErrorResponse('Target Error', `Could not build a valid target for **${event}**.`);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            // Events that need special argument patterns
            if (event === 'guildMemberUpdate') {
                client.emit(event, target, target);
            } else if (event === 'interactionCreate') {
                // Cannot safely emit interaction without a real interaction object
                const container = buildErrorResponse('Cannot Emit', 'The **interactionCreate** event requires a real interaction object and cannot be safely simulated.');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } else {
                client.emit(event, target);
            }

            const member = targetUser
                ? message.guild.members.cache.get(targetUser.id) || message.member
                : message.member;

            const container = buildSuccessResponse('Event Emitted', `Successfully emitted **${event}** event.`, {
                'Event': `${eventInfo.emoji} ${event}`,
                'Description': eventInfo.description,
                'Target': eventInfo.target === 'member' || eventInfo.target === 'ban'
                    ? `${member.user.tag} (${member.id})`
                    : eventInfo.target === 'channel'
                        ? `#${message.channel.name} (${message.channel.id})`
                        : eventInfo.target === 'guild'
                            ? `${message.guild.name} (${message.guild.id})`
                            : eventInfo.target === 'message'
                                ? `Message in #${message.channel.name}`
                                : eventInfo.target === 'role'
                                    ? 'Server role'
                                    : 'N/A',
                'Emitted By': message.author.tag
            }, true);
            container.setAccentColor(0x57F287);

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Emit Error:', error);
            const container = buildErrorResponse('Emit Failed', `Failed to emit **${event}** event.`, `Error: ${error.message}`);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
