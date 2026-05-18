const { isOwner } = require('../../utils/helpers');
const {
    SlashCommandBuilder,
    MessageFlags
} = require('discord.js');
const badgeManager = require('../../utils/badgeManager');
const {
    BADGE_ICONS,
    buildSuccessContainer,
    buildErrorContainer,
    editV2Reply
} = require('../../utils/badgeUI');

function buildSuccessMessage(badge, user, totalBadges) {
    return buildSuccessContainer(
        'Badge Removed',
        `Successfully removed the **${badge.emoji} ${badge.name}** badge from **${user.username}**.\n\n` +
        `**Remaining Badges:** ${totalBadges}`,
        badge,
        user,
        '#ED4245'
    );
}

function buildOrphanRemovedMessage(badgeId, user, totalBadges) {
    // The user had this badge but the catalog entry no longer exists
    // (deleted out of band). Render a distinct message rather than
    // feeding an undefined badge into the standard success container,
    // which would print "Successfully removed the **`<empty>` <id>**".
    return buildSuccessContainer(
        'Orphaned Badge Removed',
        `Removed orphaned badge \`${badgeId}\` from **${user.username}**.\n\n` +
        `The badge was on the user but its catalog entry was missing.\n\n` +
        `**Remaining Badges:** ${totalBadges}`,
        null,
        user,
        '#ED4245'
    );
}

module.exports = {
    name: 'badge-remove',
    description: 'Remove a custom badge from a user (Owner Only)',
    usage: '<@user> <badge-id>',
    data: new SlashCommandBuilder()
        .setName('badge-remove')
        .setDescription('Remove a custom badge from a user (Owner Only)')
        .addUserOption(option => option.setName('user').setDescription('User to remove the badge from').setRequired(true))
        .addStringOption(option => option.setName('badge-id').setDescription('Badge to remove').setRequired(true).setAutocomplete(true)),

    async autocomplete(interaction) {
        const focused = (interaction.options.getFocused() || '').toLowerCase();
        const badges = await badgeManager.getAllBadges();
        const filtered = badges
            .filter(b =>
                b.badgeId.toLowerCase().includes(focused) ||
                (b.name || '').toLowerCase().includes(focused)
            )
            .slice(0, 25);
        await interaction.respond(filtered.map(b => ({
            name: `${b.name} (${b.badgeId})`.slice(0, 100),
            value: b.badgeId
        })));
    },

    async execute(interaction) {
        if (!isOwner(interaction.user.id)) {
            return interaction.reply({
                content: `${BADGE_ICONS.Cancel} This command is only available to the bot owner.`,
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });

        try {
            const user = interaction.options.getUser('user', true);
            const badgeId = interaction.options.getString('badge-id', true).toLowerCase();

            if (user.bot) {
                return editV2Reply(interaction, {
                    components: [buildErrorContainer('Cannot Remove Badge', 'Bots do not own badges.')]
                });
            }

            const result = await badgeManager.removeBadgeFromUser(user.id, badgeId);
            if (!result.success) {
                return editV2Reply(interaction, {
                    components: [buildErrorContainer('Could Not Remove Badge', result.message || 'Unknown error.')]
                });
            }

            return editV2Reply(interaction, {
                components: [
                    result.badge
                        ? buildSuccessMessage(result.badge, user, result.totalBadges)
                        : buildOrphanRemovedMessage(badgeId, user, result.totalBadges)
                ]
            });
        } catch (error) {
            console.error('Error removing badge:', error);
            return editV2Reply(interaction, {
                components: [buildErrorContainer('Failed to Remove Badge', error.message || 'Unknown error.')]
            });
        }
    },

    async executePrefix(message, args) {
        if (!isOwner(message.author.id)) {
            return message.reply(`${BADGE_ICONS.Cancel} This command is only available to the bot owner.`);
        }

        const prefix = message.prefix || '-';

        if (args.length < 2) {
            return message.reply({
                components: [buildErrorContainer(
                    'Invalid Usage',
                    `**Usage:** \`${prefix}badge-remove <@user> <badge-id>\`\n\n` +
                    '-# You can also use `/badge-remove` for guided input.'
                )],
                flags: MessageFlags.IsComponentsV2
            });
        }

        const user = message.mentions.users.first();
        if (!user) {
            return message.reply({
                components: [buildErrorContainer('User Not Found', 'Please mention a valid user.')],
                flags: MessageFlags.IsComponentsV2
            });
        }
        if (user.bot) {
            return message.reply({
                components: [buildErrorContainer('Cannot Remove Badge', 'Bots do not own badges.')],
                flags: MessageFlags.IsComponentsV2
            });
        }

        try {
            const badgeId = args[1].toLowerCase();
            const result = await badgeManager.removeBadgeFromUser(user.id, badgeId);
            if (!result.success) {
                return message.reply({
                    components: [buildErrorContainer('Could Not Remove Badge', result.message || 'Unknown error.')],
                    flags: MessageFlags.IsComponentsV2
                });
            }

            return message.reply({
                components: [
                    result.badge
                        ? buildSuccessMessage(result.badge, user, result.totalBadges)
                        : buildOrphanRemovedMessage(badgeId, user, result.totalBadges)
                ],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (error) {
            console.error('Error removing badge:', error);
            return message.reply({
                components: [buildErrorContainer('Failed to Remove Badge', error.message || 'Unknown error.')],
                flags: MessageFlags.IsComponentsV2
            });
        }
    }
};
