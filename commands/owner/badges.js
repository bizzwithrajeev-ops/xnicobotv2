const { isOwner } = require('../../utils/helpers');
const {
    SlashCommandBuilder,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { BADGE_ICONS } = require('../../utils/badgeUI');

// NOTE: this file MUST use a name distinct from commands/social/badges.js
// (which uses name='badges'). When index.js loads commands it warns
// "Duplicate command detected" and skips any later module with the same
// name. Use 'ownerbadges' here, with 'obadges' as a prefix alias.

function buildHelpContainer() {
    let content = `# ${BADGE_ICONS.Award} Owner Badge Suite\n\n`;
    content += 'Award and revoke badges from users. The badge **catalog** is now code-managed — see `utils/badgeManager.js` to add or rename badges, then restart the bot.\n\n';
    content += `### Available Commands\n`;
    content += `> ${BADGE_ICONS.Edit} **List** — \`/badge-list [user]\`\n`;
    content += `> ${BADGE_ICONS.Award} **Give** — \`/badge-give <user> <badge-id>\`\n`;
    content += `> ${BADGE_ICONS.Trash} **Remove** — \`/badge-remove <user> <badge-id>\`\n\n`;
    content += '-# Click any button below for the exact command syntax.';

    const container = new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('badge_help_list').setLabel('List').setStyle(ButtonStyle.Secondary).setEmoji(BADGE_ICONS.Edit),
        new ButtonBuilder().setCustomId('badge_help_give').setLabel('Give').setStyle(ButtonStyle.Primary).setEmoji(BADGE_ICONS.Award),
        new ButtonBuilder().setCustomId('badge_help_remove').setLabel('Remove').setStyle(ButtonStyle.Danger).setEmoji(BADGE_ICONS.Trash)
    );

    return [container, row];
}

const HELP_TEXT = {
    list: '`/badge-list [user]` — Lists every badge in the catalog, or the badges owned by a specific user.',
    give: '`/badge-give <user> <badge-id>` — Awards an existing badge to a user.',
    remove: '`/badge-remove <user> <badge-id>` — Revokes a badge from a user.'
};

module.exports = {
    name: 'ownerbadges',
    prefix: 'ownerbadges',
    description: 'Owner badge suite help / umbrella command',
    usage: 'ownerbadges',
    category: 'owner',
    aliases: ['obadges'],

    data: new SlashCommandBuilder()
        .setName('ownerbadges')
        .setDescription('Owner badge suite help / umbrella command'),

    async execute(interaction) {
        if (!isOwner(interaction.user.id)) {
            return interaction.reply({
                content: `${BADGE_ICONS.Cancel} This command is only available to the bot owner.`,
                flags: MessageFlags.Ephemeral
            });
        }
        const components = buildHelpContainer();
        await interaction.reply({ components, flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message) {
        if (!isOwner(message.author.id)) {
            return message.reply(`${BADGE_ICONS.Cancel} This command is only available to the bot owner.`);
        }
        const components = buildHelpContainer();
        await message.reply({ components, flags: MessageFlags.IsComponentsV2 });
    },

    async handleInteraction(interaction) {
        if (!interaction.isButton()) return false;
        if (!interaction.customId.startsWith('badge_help_')) return false;

        const action = interaction.customId.slice('badge_help_'.length);
        const text = HELP_TEXT[action];
        if (!text) return false;

        const helpContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Command\n${text}`));

        await interaction.reply({
            components: [helpContainer],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
        });
        return true;
    }
};
