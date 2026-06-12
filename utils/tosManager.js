/**
 * Terms of Service (ToS) Manager
 * Handles ToS acceptance for first-time users
 */

const jsonStore = require('./jsonStore');
const { ContainerBuilder, TextDisplayBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');

// Store for tracking ToS acceptances
function loadTosAcceptances() {
    if (!jsonStore.has('tos-acceptances')) {
        jsonStore.write('tos-acceptances', {});
        return {};
    }
    return jsonStore.read('tos-acceptances');
}

function saveTosAcceptances(data) {
    jsonStore.writeImmediate('tos-acceptances', data).catch(() => {});
}

/**
 * Check if user has accepted ToS
 */
function hasAcceptedTos(userId) {
    const acceptances = loadTosAcceptances();
    return acceptances[userId]?.accepted === true;
}

/**
 * Mark user as accepted ToS
 */
function acceptTos(userId) {
    const acceptances = loadTosAcceptances();
    acceptances[userId] = {
        accepted: true,
        acceptedAt: new Date().toISOString(),
        version: '1.0'
    };
    saveTosAcceptances(acceptances);
}

/**
 * Mark user as declined ToS
 */
function declineTos(userId) {
    const acceptances = loadTosAcceptances();
    acceptances[userId] = {
        accepted: false,
        declinedAt: new Date().toISOString(),
        version: '1.0'
    };
    saveTosAcceptances(acceptances);
}

/**
 * Build ToS acceptance panel with user context
 */
function buildTosPanel(user) {
    const buttonRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('tos_accept')
                .setLabel('Accept & Continue')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('tos_decline')
                .setLabel('Decline')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Secondary)
        );

    const container = new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addUserProfileComponents(user)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# Terms of Service Agreement\n\n` +
            `Welcome, **${user.username}**! Before accessing xNico Bot's features, please review and accept our Terms of Service.`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### Your Responsibilities\n` +
            `• Comply with Discord's Terms of Service and Community Guidelines\n` +
            `• Use bot features responsibly and ethically\n` +
            `• Avoid abuse, exploitation, or misuse of commands\n` +
            `• Respect other users and server rules\n\n` +
            `### Data Collection & Privacy\n` +
            `• We collect user IDs and server settings for bot functionality\n` +
            `• Your data is protected and never sold to third parties\n` +
            `• We respect your privacy and follow GDPR guidelines\n` +
            `• You can request data deletion at any time\n\n` +
            `### Service Commitment\n` +
            `• We provide reliable service to the best of our ability\n` +
            `• Regular updates and improvements to enhance your experience\n` +
            `• Premium features available with separate activation\n` +
            `• Support available through our community server`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**By clicking "Accept & Continue", you confirm that you have read and agree to these terms.**\n\n` +
            `-# Full terms available at: https://thenico.vercel.app/terms`
        ))
        .addActionRowComponents(buttonRow);

    return container;
}

/**
 * Send ToS acceptance DM
 */
async function sendAcceptanceDM(user) {
    try {
        const dmEmbed = new ContainerBuilder()
            .setAccentColor(0x57F287)
            .addUserProfileComponents(user)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# Welcome to xNico Bot!\n\n` +
                `Thank you for accepting our Terms of Service. You now have full access to all bot features.`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `### Getting Started\n` +
                `• Use \`/help\` or \`-help\` to view all commands\n` +
                `• Check \`/profile\` to see your user profile\n` +
                `• Try \`/play <song>\` to enjoy music features\n` +
                `• Explore economy with \`/economy\` or \`/daily\`\n\n` +
                `### Need Assistance?\n` +
                `Join our support server for help, updates, and community discussions.`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `-# Support Server: https://discord.gg/Zs35X7Umak`
            ));

        await user.send({ 
            components: [dmEmbed], 
            flags: MessageFlags.IsComponentsV2 
        });
        return true;
    } catch (error) {
        // User has DMs disabled
        return false;
    }
}

/**
 * Send ToS decline DM
 */
async function sendDeclineDM(user) {
    try {
        const dmEmbed = new ContainerBuilder()
            .setAccentColor(0xED4245)
            .addUserProfileComponents(user)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# Terms of Service Declined\n\n` +
                `You have declined the xNico Bot Terms of Service.`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `### What This Means\n` +
                `• You cannot use bot commands until you accept the terms\n` +
                `• No data will be collected or stored about you\n` +
                `• You can change your decision at any time\n\n` +
                `### Ready to Accept?\n` +
                `Simply try using any bot command again, and you'll see the Terms of Service prompt where you can click "Accept & Continue".`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `-# Questions? Join our support server: https://discord.gg/Zs35X7Umak`
            ));

        await user.send({ 
            components: [dmEmbed], 
            flags: MessageFlags.IsComponentsV2 
        });
        return true;
    } catch (error) {
        // User has DMs disabled
        return false;
    }
}

module.exports = {
    hasAcceptedTos,
    acceptTos,
    declineTos,
    buildTosPanel,
    sendAcceptanceDM,
    sendDeclineDM,
    loadTosAcceptances,
    saveTosAcceptances
};
