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
        'Badge Awarded',
        `Successfully gave the **${badge.emoji} ${badge.name}** badge to **${user.username}**!\n\n` +
        `**Badge Description:** ${badge.description || '*No description*'}\n` +
        `**Total Badges:** ${totalBadges}`,
        badge,
        // Prefer the badge image when available; otherwise fall back to user avatar.
        badge.imageUrl ? null : user,
        badge.color
    );
}

module.exports = {
    name: 'badge-give',
    description: 'Give a custom badge to a user (Owner Only)',
    usage: '<@user> <badge-id>',
    data: new SlashCommandBuilder()
        .setName('badge-give')
        .setDescription('Give a custom badge to a user (Owner Only)')
        .addUserOption(option => option.setName('user').setDescription('User to award the badge to').setRequired(true))
        .addStringOption(option => option.setName('badge-id').setDescription('Badge to award').setRequired(true).setAutocomplete(true)),

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
                    components: [buildErrorContainer('Cannot Award Badge', 'Badges cannot be awarded to bots.')]
                });
            }

            const badges = await badgeManager.getAllBadges();
            const badge = badges.find(b => b.badgeId === badgeId);
            if (!badge) {
                const list = badges.map(b => `\`${b.badgeId}\``).join(', ') || '*none*';
                return editV2Reply(interaction, {
                    components: [buildErrorContainer(
                        'Badge Not Found',
                        `Badge with ID \`${badgeId}\` does not exist.\n\n**Available badges:** ${list}`
                    )]
                });
            }

            const result = await badgeManager.addBadgeToUser(user.id, badgeId);
            if (!result.success) {
                return editV2Reply(interaction, {
                    components: [buildErrorContainer('Could Not Award Badge', result.message || 'Unknown error.')]
                });
            }

            return editV2Reply(interaction, {
                components: [buildSuccessMessage(result.badge, user, result.totalBadges)]
            });
        } catch (error) {
            console.error('Error giving badge:', error);
            return editV2Reply(interaction, {
                components: [buildErrorContainer('Failed to Award Badge', error.message || 'Unknown error.')]
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
                    `**Usage:** \`${prefix}badge-give <@user> <badge-id>\`\n\n` +
                    '-# You can also use `/badge-give` for guided input.'
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
                components: [buildErrorContainer('Cannot Award Badge', 'Badges cannot be awarded to bots.')],
                flags: MessageFlags.IsComponentsV2
            });
        }

        try {
            const badgeId = args[1].toLowerCase();
            const badges = await badgeManager.getAllBadges();
            const badge = badges.find(b => b.badgeId === badgeId);
            if (!badge) {
                const list = badges.map(b => `\`${b.badgeId}\``).join(', ') || '*none*';
                return message.reply({
                    components: [buildErrorContainer(
                        'Badge Not Found',
                        `Badge with ID \`${badgeId}\` does not exist.\n\n**Available badges:** ${list}`
                    )],
                    flags: MessageFlags.IsComponentsV2
                });
            }

            const result = await badgeManager.addBadgeToUser(user.id, badgeId);
            if (!result.success) {
                return message.reply({
                    components: [buildErrorContainer('Could Not Award Badge', result.message || 'Unknown error.')],
                    flags: MessageFlags.IsComponentsV2
                });
            }

            return message.reply({
                components: [buildSuccessMessage(result.badge, user, result.totalBadges)],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (error) {
            console.error('Error giving badge:', error);
            return message.reply({
                components: [buildErrorContainer('Failed to Award Badge', error.message || 'Unknown error.')],
                flags: MessageFlags.IsComponentsV2
            });
        }
    }
};
