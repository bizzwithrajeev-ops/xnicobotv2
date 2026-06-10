const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder
} = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, BRANDING } = require('../../utils/responseBuilder');

// Store active timers
const activeTimers = new Map();

module.exports = {
    name: 'timer',
    prefix: 'timer',
    description: 'Set a timer with notifications',
    usage: 'timer <duration> [reason]',
    category: 'utility',
    aliases: ['settimer', 'countdown', 'remind'],
    
    data: new SlashCommandBuilder()
        .setName('timer')
        .setDescription('Set a timer with notifications')
        .addSubcommand(sub => sub
            .setName('set')
            .setDescription('Set a new timer')
            .addStringOption(opt => opt
                .setName('duration')
                .setDescription('Duration (e.g., 5m, 1h, 30s, 2h30m)')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('reason')
                .setDescription('What is this timer for?')
                .setMaxLength(200))
            .addBooleanOption(opt => opt
                .setName('ping')
                .setDescription('Ping you when timer ends? (default: yes)')
                .setRequired(false)))
        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('List your active timers'))
        .addSubcommand(sub => sub
            .setName('cancel')
            .setDescription('Cancel a timer')
            .addStringOption(opt => opt
                .setName('id')
                .setDescription('Timer ID to cancel')
                .setRequired(true))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set') {
            const duration = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const ping = interaction.options.getBoolean('ping') ?? true; // Default to true
            await handleSetTimer(interaction, duration, reason, ping, false);
        } else if (subcommand === 'list') {
            await handleListTimers(interaction, false);
        } else if (subcommand === 'cancel') {
            const timerId = interaction.options.getString('id');
            await handleCancelTimer(interaction, timerId, false);
        }
    },

    async executePrefix(message, args) {
        if (!args[0]) {
            const container = buildErrorResponse(
                'Timer Command',
                'Please specify an action!',
                '**Usage:**\n`timer set <duration> [reason]`\n`timer set <duration> --no-ping [reason]`\n`timer list`\n`timer cancel <id>`\n\n**Examples:**\n`timer set 5m Pizza in oven`\n`timer set 1h30m --no-ping Meeting break`\n`timer set 10s Test timer`'
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const action = args[0].toLowerCase();

        if (['set', 'add', 'create'].includes(action)) {
            if (!args[1]) {
                const container = buildErrorResponse('Missing Duration', 'Please specify a duration!', '**Example:** `timer set 5m Pizza in oven`\n**With no ping:** `timer set 5m --no-ping Pizza in oven`');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            const duration = args[1];
            
            // Check for --no-ping or --noping flag
            let ping = true;
            let reasonArgs = args.slice(2);
            if (reasonArgs.includes('--no-ping') || reasonArgs.includes('--noping')) {
                ping = false;
                reasonArgs = reasonArgs.filter(arg => arg !== '--no-ping' && arg !== '--noping');
            }
            
            const reason = reasonArgs.join(' ') || 'No reason provided';
            await handleSetTimer(message, duration, reason, ping, true);
        } else if (['list', 'view', 'show'].includes(action)) {
            await handleListTimers(message, true);
        } else if (['cancel', 'remove', 'delete', 'stop'].includes(action)) {
            if (!args[1]) {
                const container = buildErrorResponse('Missing Timer ID', 'Please specify a timer ID!', '**Example:** `timer cancel 1`');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            await handleCancelTimer(message, args[1], true);
        } else {
            const container = buildErrorResponse('Invalid Action', 'Unknown timer action!', '**Available:** `set`, `list`, `cancel`');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};

async function handleSetTimer(target, durationStr, reason, ping, isPrefix) {
    const userId = isPrefix ? target.author.id : target.user.id;
    const channelId = target.channel?.id || target.channelId;

    // Parse duration
    const milliseconds = parseDuration(durationStr);
    if (!milliseconds || milliseconds < 1000) {
        const container = buildErrorResponse(
            'Invalid Duration',
            'Could not parse the duration!',
            '**Valid formats:**\n`30s` - 30 seconds\n`5m` - 5 minutes\n`1h` - 1 hour\n`2h30m` - 2 hours 30 minutes\n`1d` - 1 day'
        );
        if (isPrefix) {
            return target.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        return target.reply({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    }

    if (milliseconds > 7 * 24 * 60 * 60 * 1000) { // Max 7 days
        const container = buildErrorResponse('Duration Too Long', 'Maximum timer duration is 7 days!');
        if (isPrefix) {
            return target.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        return target.reply({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    }

    // Generate timer ID
    const timerId = generateTimerId(userId);
    const endTime = Date.now() + milliseconds;
    const endTimestamp = Math.floor(endTime / 1000);

    // Create timer
    const timer = {
        id: timerId,
        userId,
        channelId,
        reason,
        endTime,
        duration: milliseconds,
        createdAt: Date.now(),
        ping: ping,
        timeout: null
    };

    // Set timeout
    timer.timeout = setTimeout(async () => {
        await notifyTimerEnd(target.client || target.message?.client, timer);
        activeTimers.delete(`${userId}-${timerId}`);
    }, milliseconds);

    activeTimers.set(`${userId}-${timerId}`, timer);

    // Success response
    const durationFormatted = formatDuration(milliseconds);
    const container = buildSuccessResponse(
        '⏰ Timer Set',
        `Your timer has been set!`,
        {
            'Timer ID': `\`${timerId}\``,
            'Duration': `**${durationFormatted}**`,
            'Ends': `<t:${endTimestamp}:R> (<t:${endTimestamp}:F>)`,
            'Reason': reason,
            'Ping': ping ? '✅ Yes' : '❌ No'
        }
    );
    container.setAccentColor(0x57F287);
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# You will be ${ping ? 'pinged' : 'notified'} in <#${channelId}> when the timer ends`
    ));

    if (isPrefix) {
        return target.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
    return target.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function handleListTimers(target, isPrefix) {
    const userId = isPrefix ? target.author.id : target.user.id;
    const userTimers = [];

    for (const [key, timer] of activeTimers.entries()) {
        if (timer.userId === userId) {
            userTimers.push(timer);
        }
    }

    if (userTimers.length === 0) {
        const container = buildErrorResponse('No Active Timers', 'You don\'t have any active timers!', 'Use `/timer set` to create one.');
        if (isPrefix) {
            return target.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        return target.reply({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    }

    // Sort by end time
    userTimers.sort((a, b) => a.endTime - b.endTime);

    let timerList = '';
    for (const timer of userTimers) {
        const endTimestamp = Math.floor(timer.endTime / 1000);
        const remaining = timer.endTime - Date.now();
        const pingIcon = timer.ping ? '🔔' : '🔕';
        timerList += `**ID ${timer.id}** • Ends <t:${endTimestamp}:R> ${pingIcon}\n`;
        timerList += `> ${timer.reason}\n`;
        timerList += `> Channel: <#${timer.channelId}> • Remaining: ${formatDuration(remaining)}\n\n`;
    }

    const container = new ContainerBuilder()
        .setTitle(`⏰ Your Active Timers (${userTimers.length})`)
        .setDescription(timerList)
        .setAccentColor(0xBCF1E4);
    
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Use `/timer cancel <id>` to cancel a timer'));

    if (isPrefix) {
        return target.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
    return target.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function handleCancelTimer(target, timerId, isPrefix) {
    const userId = isPrefix ? target.author.id : target.user.id;
    const key = `${userId}-${timerId}`;
    const timer = activeTimers.get(key);

    if (!timer) {
        const container = buildErrorResponse('Timer Not Found', `No timer with ID \`${timerId}\` found!`, 'Use `/timer list` to see your active timers.');
        if (isPrefix) {
            return target.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        return target.reply({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    }

    // Cancel timeout
    clearTimeout(timer.timeout);
    activeTimers.delete(key);

    const container = buildSuccessResponse(
        '🗑️ Timer Cancelled',
        `Timer **${timerId}** has been cancelled.`,
        { 'Reason': timer.reason }
    );
    container.setAccentColor(0xFEE75C);

    if (isPrefix) {
        return target.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
    return target.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function notifyTimerEnd(client, timer) {
    try {
        const channel = await client.channels.fetch(timer.channelId).catch(() => null);
        if (!channel?.isTextBased()) return;

        const durationFormatted = formatDuration(timer.duration);
        
        // Build the notification container
        const container = new ContainerBuilder()
            .setAccentColor(0x57F287)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# ⏰ Timer Ended\n\n` +
                `${timer.ping ? `<@${timer.userId}>` : `Hey <@${timer.userId}>`}, your timer has ended!`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**⏱️ Duration:** ${durationFormatted}\n` +
            `**📝 Reason:** ${timer.reason}\n` +
            `**🕒 Set:** <t:${Math.floor(timer.createdAt / 1000)}:R> (<t:${Math.floor(timer.createdAt / 1000)}:f>)\n` +
            `**🔔 Timer ID:** \`${timer.id}\``
        ));

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

        // Send notification - with or without ping
        await channel.send({ 
            content: timer.ping ? `<@${timer.userId}>` : undefined,
            components: [container], 
            flags: MessageFlags.IsComponentsV2 
        });
    } catch (error) {
        console.error('[Timer] Failed to send notification:', error);
    }
}

function parseDuration(str) {
    const regex = /(\d+)\s*([smhd])/gi;
    let total = 0;
    let match;

    while ((match = regex.exec(str)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();

        switch (unit) {
            case 's': total += value * 1000; break;
            case 'm': total += value * 60 * 1000; break;
            case 'h': total += value * 60 * 60 * 1000; break;
            case 'd': total += value * 24 * 60 * 60 * 1000; break;
        }
    }

    return total;
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

function generateTimerId(userId) {
    const userTimerCount = Array.from(activeTimers.keys())
        .filter(key => key.startsWith(`${userId}-`))
        .length;
    return (userTimerCount + 1).toString();
}

// Export for cleanup on shutdown
module.exports.cleanupTimers = function() {
    for (const [key, timer] of activeTimers.entries()) {
        clearTimeout(timer.timeout);
    }
    activeTimers.clear();
    console.log('[Timer] All timers cleaned up');
};

module.exports.getActiveTimersCount = function() {
    return activeTimers.size;
};
