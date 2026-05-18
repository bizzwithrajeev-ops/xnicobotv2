/**
 * Disabled — see commands/owner/badge-create.js for the rationale.
 * Badge edits now happen by editing `utils/badgeManager.js` and
 * restarting the bot.
 */

const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

function deprecationContainer() {
    return new ContainerBuilder()
        .setAccentColor(0xED4245)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '# <:Cancel:1473037949187657818> Command Removed\n\n' +
                '`badge-edit` has been removed. The badge catalog is now code-managed.\n\n' +
                'To rename, recolor, or change a badge emoji, edit `utils/badgeManager.js` (the `DEFAULT_BADGES` array) and restart the bot.'
            )
        );
}

module.exports = {
    name: 'badge-edit',
    description: 'Removed — badge catalog is now code-managed (see utils/badgeManager.js).',
    category: 'owner',
    ownerOnly: true,
    data: null, // intentionally not registered as a slash command

    async executePrefix(message) {
        return message.reply({ components: [deprecationContainer()], flags: MessageFlags.IsComponentsV2 });
    }
};
