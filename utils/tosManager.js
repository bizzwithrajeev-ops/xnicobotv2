/**
 * Terms of Service (ToS) Manager
 * Handles ToS acceptance for first-time users
 */

const jsonStore = require('./jsonStore');
const { ContainerBuilder, TextDisplayBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');

const TOS_STORE = 'tos-acceptances';

/**
 * Load ToS acceptances from the store (read-only peek, no deep clone)
 */
function peekTosAcceptances() {
    try {
        if (!jsonStore.has(TOS_STORE)) {
            jsonStore.write(TOS_STORE, {});
            return {};
        }
        return jsonStore.peek(TOS_STORE) || {};
    } catch (error) {
        console.error('[ToS] Error loading acceptances:', error);
        return {};
    }
}

/**
 * Load ToS acceptances from the store (mutable clone)
 */
function loadTosAcceptances() {
    try {
        if (!jsonStore.has(TOS_STORE)) {
            jsonStore.write(TOS_STORE, {});
            return {};
        }
        return jsonStore.read(TOS_STORE) || {};
    } catch (error) {
        console.error('[ToS] Error loading acceptances:', error);
        return {};
    }
}

/**
 * Save ToS acceptances (awaits the write for durability)
 */
async function saveTosAcceptances(data) {
    try {
        if (!data || typeof data !== 'object') {
            console.error('[ToS] Invalid data provided to save');
            return false;
        }
        await jsonStore.writeImmediate(TOS_STORE, data);
        return true;
    } catch (error) {
        console.error('[ToS] Error in saveTosAcceptances:', error);
        return false;
    }
}

/**
 * Check if user has accepted ToS
 */
function hasAcceptedTos(userId) {
    try {
        if (!userId) {
            console.warn('[ToS] hasAcceptedTos called with no userId');
            return false;
        }
        // Use peek for read-only check — avoids deep-cloning the entire
        // acceptances object on every single command invocation.
        const acceptances = peekTosAcceptances();
        return acceptances[userId]?.accepted === true;
    } catch (error) {
        console.error('[ToS] Error checking ToS acceptance:', error);
        return false;
    }
}

/**
 * Check if user has explicitly declined ToS (not just "hasn't seen it yet")
 */
function hasDeclinedTos(userId) {
    try {
        if (!userId) return false;
        const acceptances = peekTosAcceptances();
        const entry = acceptances[userId];
        return entry && entry.accepted === false;
    } catch (error) {
        return false;
    }
}

/**
 * Mark user as accepted ToS
 */
async function acceptTos(userId) {
    try {
        if (!userId) {
            console.error('[ToS] acceptTos called with no userId');
            return false;
        }
        const acceptances = loadTosAcceptances();
        acceptances[userId] = {
            accepted: true,
            acceptedAt: new Date().toISOString(),
            version: '1.0'
        };
        const saved = await saveTosAcceptances(acceptances);
        if (saved) {
            console.log(`[ToS] User ${userId} accepted ToS`);
        }
        return saved;
    } catch (error) {
        console.error('[ToS] Error accepting ToS:', error);
        return false;
    }
}

/**
 * Mark user as declined ToS
 */
async function declineTos(userId) {
    try {
        if (!userId) {
            console.error('[ToS] declineTos called with no userId');
            return false;
        }
        const acceptances = loadTosAcceptances();
        acceptances[userId] = {
            accepted: false,
            declinedAt: new Date().toISOString(),
            version: '1.0'
        };
        const saved = await saveTosAcceptances(acceptances);
        if (saved) {
            console.log(`[ToS] User ${userId} declined ToS`);
        }
        return saved;
    } catch (error) {
        console.error('[ToS] Error declining ToS:', error);
        return false;
    }
}

/**
 * Build ToS acceptance panel with user context
 */
function buildTosPanel(user) {
    try {
        if (!user || !user.id) {
            console.error('[ToS] buildTosPanel called with invalid user');
            throw new Error('Invalid user object');
        }

        const buttonRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('tos_accept')
                    .setLabel('Accept & Continue')
                    .setEmoji('<:Checkedbox:1473038547165384804>')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('tos_decline')
                    .setLabel('Decline')
                    .setEmoji('<:Cancel:1473037949187657818>')
                    .setStyle(ButtonStyle.Secondary)
            );

        const username = user.username || user.tag || 'User';
        const declined = hasDeclinedTos(user.id);

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# Terms of Service Agreement\n\n` +
                (declined
                    ? `**${username}**, you previously declined the Terms of Service. You need to accept them to use bot commands.`
                    : `Welcome, **${username}**! Before accessing xNico Bot's features, please review and accept our Terms of Service.`)
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
    } catch (error) {
        console.error('[ToS] Error building ToS panel:', error);
        throw error;
    }
}

/**
 * Send ToS acceptance DM
 */
async function sendAcceptanceDM(user) {
    try {
        if (!user || !user.id) {
            console.error('[ToS] sendAcceptanceDM called with invalid user');
            return false;
        }

        const dmEmbed = new ContainerBuilder()
            .setAccentColor(0x57F287)
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
        // User has DMs disabled or other error
        console.log(`[ToS] Could not send acceptance DM to user ${user?.id}: ${error.message}`);
        return false;
    }
}

/**
 * Send ToS decline DM
 */
async function sendDeclineDM(user) {
    try {
        if (!user || !user.id) {
            console.error('[ToS] sendDeclineDM called with invalid user');
            return false;
        }

        const dmEmbed = new ContainerBuilder()
            .setAccentColor(0xED4245)
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
        // User has DMs disabled or other error
        console.log(`[ToS] Could not send decline DM to user ${user?.id}: ${error.message}`);
        return false;
    }
}

module.exports = {
    hasAcceptedTos,
    hasDeclinedTos,
    acceptTos,
    declineTos,
    buildTosPanel,
    sendAcceptanceDM,
    sendDeclineDM,
    loadTosAcceptances,
    saveTosAcceptances
};
