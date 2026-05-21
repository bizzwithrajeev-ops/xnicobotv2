const { ContainerBuilder, TextDisplayBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');

const COLORS = {
    SUCCESS: null,
    ERROR: 0xED4245,
    WARNING: 0xFEE75C,
    INFO: null,
    PRIMARY: null,
    SECONDARY: null,
    PINK: 0xE91E63,
    ORANGE: 0xE67E22,
    CYAN: 0x1ABC9C,
    PURPLE: 0x9B59B6,
    FUN: null,
    MUSIC: null,
    MODERATION: null
};

const EMOJIS = {
    SUCCESS: '<:Checkedbox:1473038547165384804>',
    ERROR: '<:Cancel:1473037949187657818>',
    WARNING: '<:Infotriangle:1473038460456800459>',
    INFO: '<:Bookopen:1473038576391557130>',
    LOADING: '<:Lightning:1473038797540298792>',
    SETTINGS: '<:Shield:1473038669831995494>',
    MESSAGES: '<:Chat:1473038936241864865>',
    USER: '<:User:1473038971398520977>',
    ROLE: '<:Userplus:1473038912212435086>',
    CHANNEL: '<:Edit:1473037903625191580>',
    TIME: '<:Alarm:1473039068546732214>',
    LOCK: '<:Lock:1473038513749491773>',
    UNLOCK: '<:Unlock:1473038516639236269>',
    BAN: '<:banhammer:1473367388597780592>',
    KICK: '<:Userblock:1473038868184826149>',
    MUTE: '<:Volumeoff:1473039301414621427>',
    WARN: '<:Infotriangle:1473038460456800459>',
    DELETE: '<:Trash:1473038090074591293>',
    EDIT: '<:Editalt:1473038138577256670>',
    ADD: '<:Add:1473038100862337035>',
    REMOVE: '<:Trash:1473038090074591293>',
    LIST: '<:Document:1473039496995143731>',
    STATS: '<:Invoice:1473039492217835550>',
    MUSIC: '<:Music:1473039311057190972>',
    STAR: '<:Star:1473038501766369300>',
    GIFT: '<:Present:1473038450465706076>',
    PARTY: '<:Present:1473038450465706076>'
};

const BRANDING = '-# xNico </>';

function buildSuccessResponse(title, description, details = null, showBranding = false) {
    let content = `# ${EMOJIS.SUCCESS} ${title}\n\n`;
    content += `${description}\n`;

    if (details) {
        content += `\n### <:Document:1473039496995143731> Details\n`;
        if (typeof details === 'object') {
            for (const [key, value] of Object.entries(details)) {
                content += `> **${key}:** ${value}\n`;
            }
        } else {
            content += details;
        }
    }

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    
    if (showBranding) {
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
    }
    
    return container;
}

function buildErrorResponse(title, description, suggestion = null) {
    let content = `# ${EMOJIS.ERROR} ${title}\n\n`;
    content += `${description}\n`;
    
    if (suggestion) {
        content += `\n### <:Lightbulbalt:1473038470787240009> Suggestion\n`;
        content += `${suggestion}`;
    }
    
    return new ContainerBuilder()
        .setAccentColor(COLORS.ERROR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

function buildWarningResponse(title, description) {
    let content = `# ${EMOJIS.WARNING} ${title}\n\n`;
    content += `${description}`;
    
    return new ContainerBuilder()
        .setAccentColor(COLORS.WARNING)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

function buildInfoResponse(title, description, sections = null) {
    let content = `# ${EMOJIS.INFO} ${title}\n\n`;
    content += `${description}\n`;
    
    if (sections) {
        for (const section of sections) {
            content += `\n### ${section.title}\n`;
            content += `${section.content}\n`;
        }
    }
    
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

function buildHelpResponse(commandName, description, usage, examples = [], options = []) {
    let content = `# 📖 ${commandName}\n\n`;
    content += `${description}\n\n`;
    
    content += `### <:Document:1473039496995143731> Usage\n`;
    content += `\`${usage}\`\n\n`;
    
    if (options.length > 0) {
        content += `### <:Settings:1473037894703779851> Options\n`;
        for (const opt of options) {
            content += `> **${opt.name}** - ${opt.description}${opt.required ? ' *(required)*' : ''}\n`;
        }
        content += '\n';
    }
    
    if (examples.length > 0) {
        content += `### <:Edit:1473037903625191580> Examples\n`;
        for (const example of examples) {
            content += `\`${example}\`\n`;
        }
    }
    
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

function buildModerationResponse(action, target, moderator, reason = null, duration = null, caseId = null) {
    const actionEmojis = {
        ban: '<:banhammer:1473367388597780592>',
        kick: '<:Userblock:1473038868184826149>',
        mute: '<:Volumeoff:1473039301414621427>',
        warn: '<:Infotriangle:1473038460456800459>',
        timeout: '<:Alarm:1473039068546732214>',
        unban: '<:Unlock:1473038516639236269>',
        unmute: '<:Volumeup:1473039290136002844>',
        untimeout: '<:Volumeup:1473039290136002844>',
        softban: '<:banhammer:1473367388597780592>'
    };
    
    const emoji = actionEmojis[action.toLowerCase()] || '<:Settings:1473037894703779851>';
    
    let content = `# ${emoji} ${action.charAt(0).toUpperCase() + action.slice(1)}\n\n`;
    content += `**Target:** ${target.username || target}\n`;
    content += `**Moderator:** ${moderator.username || moderator}\n`;
    if (reason) content += `**Reason:** ${reason}\n`;
    if (duration) content += `**Duration:** ${duration}\n`;
    if (caseId) content += `**Case ID:** #${caseId}\n`;
    
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
}

function buildListResponse(title, items, emptyMessage = 'No items found.') {
    let content = `# <:Document:1473039496995143731> ${title}\n\n`;
    
    if (items.length === 0) {
        content += emptyMessage;
    } else {
        for (let i = 0; i < items.length; i++) {
            if (typeof items[i] === 'object') {
                content += `**${i + 1}.** ${items[i].name}\n`;
                if (items[i].description) content += `> ${items[i].description}\n`;
            } else {
                content += `**${i + 1}.** ${items[i]}\n`;
            }
        }
    }
    
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
}

function buildProgressResponse(title, current, total, description = '', stage = null) {
    const safeTotal = Math.max(total || 0, 1);
    const safeCurrent = Math.min(Math.max(current || 0, 0), safeTotal);
    const ratio = safeCurrent / safeTotal;
    const percentage = Math.round(ratio * 100);
    const barLength = 16;
    const filled = Math.round(ratio * barLength);
    const bar = `${'▰'.repeat(filled)}${'▱'.repeat(barLength - filled)}`;

    let content = `# ${EMOJIS.LOADING} ${title}\n\n`;
    content += `${bar} **${percentage}%**\n`;
    content += `> **Progress:** ${safeCurrent}/${safeTotal}`;
    if (stage) content += `\n> **Current:** ${stage}`;
    if (description) content += `\n\n${description}`;

    return new ContainerBuilder()
        .setAccentColor(COLORS.INFO)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
}

function buildConfirmResponse(title, description, confirmId, cancelId) {
    let content = `# <:Infotriangle:1473038460456800459> ${title}\n\n`;
    content += `${description}\n\n`;
    content += `-# This action may be irreversible. Please confirm.`;
    
    const container = new ContainerBuilder()
        .setAccentColor(COLORS.WARNING)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(confirmId)
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('<:Checkedbox:1473038547165384804>'),
        new ButtonBuilder()
            .setCustomId(cancelId)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Cancel:1473037949187657818>')
    );
    
    container.addActionRowComponents(row);
    return container;
}

function buildSetupPanel(title, description, config, buttons = []) {
    let content = `# <:Settings:1473037894703779851> ${title}\n`;
    content += `-# ${description}\n\n`;
    
    content += `### <:Invoice:1473039492217835550> Current Configuration\n`;
    content += `\`\`\`ansi\n`;
    content += `\u001b[1;34m╔════════════════════════════════════════╗\n`;
    
    const entries = Object.entries(config);
    for (const [key, value] of entries) {
        const displayValue = typeof value === 'boolean' 
            ? (value ? '\u001b[1;32mEnabled' : '\u001b[1;31mDisabled')
            : `\u001b[1;33m${value}`;
        content += `\u001b[1;34m║ \u001b[1;36m${key.padEnd(18)} ${displayValue.padEnd(18)}\u001b[1;34m ║\n`;
    }
    
    content += `\u001b[1;34m╚════════════════════════════════════════╝\n`;
    content += `\`\`\``;
    
    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

    if (buttons.length > 0) {
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        
        const chunks = [];
        for (let i = 0; i < buttons.length; i += 5) {
            chunks.push(buttons.slice(i, i + 5));
        }
        
        for (const chunk of chunks) {
            const row = new ActionRowBuilder();
            for (const btn of chunk) {
                const button = new ButtonBuilder()
                    .setCustomId(btn.id)
                    .setLabel(btn.label)
                    .setStyle(btn.style || ButtonStyle.Secondary)
                    .setDisabled(btn.disabled || false);
                if (btn.emoji) button.setEmoji(btn.emoji);
                row.addComponents(button);
            }
            container.addActionRowComponents(row);
        }
    }
    
    return container;
}

function buildStatsResponse(title, stats) {
    let content = `# <:Invoice:1473039492217835550> ${title}\n\n`;
    
    for (const [key, value] of Object.entries(stats)) {
        content += `> **${key}:** ${value}\n`;
    }
    
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
}

function buildPermissionDenied(requiredPermission = null) {
    let content = `# ${EMOJIS.ERROR} Permission Denied\n\n`;
    content += `You don't have permission to use this command.\n`;
    
    if (requiredPermission) {
        content += `\n**Required Permission:** ${requiredPermission}`;
    }
    
    return new ContainerBuilder()
        .setAccentColor(COLORS.ERROR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

function buildBotPermissionError(requiredPermission = null) {
    let content = `# ${EMOJIS.ERROR} Bot Missing Permissions\n\n`;
    content += `I don't have the required permissions to perform this action.\n`;
    
    if (requiredPermission) {
        content += `\n**Required Permission:** ${requiredPermission}`;
    }
    
    content += `\n\n### <:Lightbulbalt:1473038470787240009> Solution\nPlease ensure my role has the necessary permissions and is positioned above the target role/user in the role hierarchy.`;
    
    return new ContainerBuilder()
        .setAccentColor(COLORS.ERROR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

function buildUserNotFound(identifier = null) {
    let content = `# ${EMOJIS.ERROR} User Not Found\n\n`;
    content += `The specified user could not be found in this server.\n`;
    
    if (identifier) {
        content += `\n**Searched for:** ${identifier}`;
    }
    
    content += `\n\n### <:Lightbulbalt:1473038470787240009> Tips\n`;
    content += `• Make sure the user is a member of this server\n`;
    content += `• Try mentioning the user directly (@user)\n`;
    content += `• Use the user's ID if available`;
    
    return new ContainerBuilder()
        .setAccentColor(COLORS.ERROR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

function buildRoleNotFound(identifier = null) {
    let content = `# ${EMOJIS.ERROR} Role Not Found\n\n`;
    content += `The specified role could not be found.\n`;
    
    if (identifier) {
        content += `\n**Searched for:** ${identifier}`;
    }
    
    content += `\n\n### <:Lightbulbalt:1473038470787240009> Tips\n`;
    content += `• Make sure the role exists in this server\n`;
    content += `• Try mentioning the role directly (@role)\n`;
    content += `• Use the role's ID if available`;
    
    return new ContainerBuilder()
        .setAccentColor(COLORS.ERROR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

function buildChannelNotFound(identifier = null) {
    let content = `# ${EMOJIS.ERROR} Channel Not Found\n\n`;
    content += `The specified channel could not be found.\n`;
    
    if (identifier) {
        content += `\n**Searched for:** ${identifier}`;
    }
    
    content += `\n\n### <:Lightbulbalt:1473038470787240009> Tips\n`;
    content += `• Make sure the channel exists in this server\n`;
    content += `• Try mentioning the channel directly (#channel)\n`;
    content += `• Check if you have access to view the channel`;
    
    return new ContainerBuilder()
        .setAccentColor(COLORS.ERROR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

function buildRoleHierarchyError(action = 'modify') {
    let content = `# ${EMOJIS.ERROR} Role Hierarchy Error\n\n`;
    content += `Cannot ${action} - the target role is higher than or equal to your/my highest role.\n`;
    content += `\n### <:Lightbulbalt:1473038470787240009> Solution\n`;
    content += `Ensure the bot's role and your role are positioned above the target in Server Settings > Roles.`;
    
    return new ContainerBuilder()
        .setAccentColor(COLORS.ERROR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

function buildInvalidUsage(commandName, correctUsage, examples = []) {
    let content = `# ${EMOJIS.ERROR} Invalid Usage\n\n`;
    content += `The command was not used correctly.\n\n`;
    content += `### <:Document:1473039496995143731> Correct Usage\n`;
    content += `\`${correctUsage}\`\n`;
    
    if (examples.length > 0) {
        content += `\n### <:Edit:1473037903625191580> Examples\n`;
        for (const example of examples) {
            content += `\`${example}\`\n`;
        }
    }
    
    return new ContainerBuilder()
        .setAccentColor(COLORS.ERROR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

function buildCooldownResponse(remaining) {
    let content = `# ${EMOJIS.WARNING} Cooldown Active\n\n`;
    content += `Please wait **${remaining}** before using this command again.`;
    
    return new ContainerBuilder()
        .setAccentColor(COLORS.WARNING)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

function buildLoadingResponse(title, description, hint = null) {
    let content = `# ${EMOJIS.LOADING} ${title}\n\n${description}`;
    if (hint) {
        content += `\n\n-# ${hint}`;
    }

    return new ContainerBuilder()
        .setAccentColor(COLORS.INFO)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
}

/**
 * Build a professional expired/timed-out panel for interactive commands.
 * @param {string} commandHint  The command to re-run (e.g. `/help`, `backup-list`)
 * @param {string} [contextMsg] Optional context about what was not completed
 * @returns {ContainerBuilder}
 */
function buildExpiredPanel(commandHint, contextMsg = null) {
    const now = Math.floor(Date.now() / 1000);
    const container = new ContainerBuilder().setAccentColor(0x2B2D31);
    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
    let content = `## <:Lightning:1473038797540298792>  Session Expired\n`;
    content += contextMsg
        ? `${contextMsg}\n`
        : `This panel timed out due to inactivity.\n`;
    content += `-# Run \`${commandHint}\` to start a new session.`;
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# xNico </> · Expired <t:${now}:R>`)
    );
    return container;
}

module.exports = {
    COLORS,
    EMOJIS,
    BRANDING,
    buildSuccessResponse,
    buildErrorResponse,
    buildWarningResponse,
    buildInfoResponse,
    buildHelpResponse,
    buildModerationResponse,
    buildListResponse,
    buildProgressResponse,
    buildConfirmResponse,
    buildSetupPanel,
    buildStatsResponse,
    buildPermissionDenied,
    buildBotPermissionError,
    buildUserNotFound,
    buildRoleNotFound,
    buildChannelNotFound,
    buildRoleHierarchyError,
    buildInvalidUsage,
    buildCooldownResponse,
    buildLoadingResponse,
    buildExpiredPanel
};
