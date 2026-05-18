/**
 * Disabled — the badge catalog is now hardcoded in
 * `utils/badgeManager.js` (see DEFAULT_BADGES). Custom runtime badge
 * creation was removed because it caused the "I edited the badge but
 * it didn't update" bug — defaults seeded into a JSON store would
 * never be re-applied on subsequent boots.
 *
 * To add a new badge: edit `utils/badgeManager.js` and restart.
 *
 * Keeping the file with a stub `data: null` makes the command-loader
 * happy and surfaces a clear deprecation notice if anyone runs the
 * old prefix command.
 */

const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

function deprecationContainer() {
    return new ContainerBuilder()
        .setAccentColor(0xED4245)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '# <:Cancel:1473037949187657818> Command Removed\n\n' +
                '`badge-create` has been removed. The badge catalog is now code-managed.\n\n' +
                'To add a new badge, edit `utils/badgeManager.js` (the `DEFAULT_BADGES` array) and restart the bot.'
            )
        );
}

module.exports = {
    name: 'badge-create',
    description: 'Removed — badge catalog is now code-managed (see utils/badgeManager.js).',
    category: 'owner',
    ownerOnly: true,
    data: null, // intentionally not registered as a slash command

    async executePrefix(message) {
        return message.reply({ components: [deprecationContainer()], flags: MessageFlags.IsComponentsV2 });
    }
};
