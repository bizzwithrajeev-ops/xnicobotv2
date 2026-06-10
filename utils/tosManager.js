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
 * Build ToS acceptance panel
 */
function buildTosPanel() {
    const container = new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# 📜 Terms of Service\n\n` +
            `Welcome to **xNico Bot**! Before you can use the bot, please read and accept our Terms of Service.\n\n` +
            `### By using this bot, you agree to:\n` +
            `• Follow Discord's Terms of Service and Community Guidelines\n` +
            `• Use the bot's features responsibly and ethically\n` +
            `• Not abuse, exploit, or misuse bot commands\n` +
            `• Allow the bot to collect necessary data (user IDs, server settings) for functionality\n` +
            `• Understand that premium features require separate activation\n\n` +
            `### We will:\n` +
            `• Protect your data and never sell it to third parties\n` +
            `• Provide reliable service to the best of our ability\n` +
            `• Respect your privacy and server settings\n` +
            `• Continue improving and updating the bot\n\n` +
            `-# For full terms, visit: https://thenico.vercel.app/terms`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Please select an option below:**`
        ));

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
                .setStyle(ButtonStyle.Danger)
        );

    return { container, buttonRow };
}

/**
 * Send ToS acceptance DM
 */
async function sendAcceptanceDM(user) {
    try {
        const dmEmbed = new ContainerBuilder()
            .setAccentColor(0x57F287)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# ✅ Terms of Service Accepted\n\n` +
                `Thank you for accepting the xNico Bot Terms of Service!\n\n` +
                `You can now use all available bot commands. Start with \`-help\` to see what I can do.\n\n` +
                `**Popular Commands:**\n` +
                `• \`-help\` — View all commands\n` +
                `• \`-play <song>\` — Play music\n` +
                `• \`-profile\` — View your profile\n` +
                `• \`-economy\` — Check economy commands\n\n` +
                `Enjoy using xNico Bot! 🎉`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `-# Need help? Join our support server: https://discord.gg/Zs35X7Umak`
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
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# ❌ Terms of Service Declined\n\n` +
                `You have declined the xNico Bot Terms of Service.\n\n` +
                `**You will not be able to use bot commands until you accept the terms.**\n\n` +
                `To accept the terms later, simply try using any bot command again and click "Accept & Continue".\n\n` +
                `-# If you have questions, join our support server: https://discord.gg/Zs35X7Umak`
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
