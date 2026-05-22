const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
} = require('discord.js');

const badgeManager = require('../../utils/badgeManager');
const { isOwner } = require('../../utils/helpers');
const { COLORS, BRANDING } = require('../../utils/responseBuilder');

function err(title, body) {
    return new ContainerBuilder()
        .setAccentColor(COLORS.ERROR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# <:Cancel:1473037949187657818> ${title}\n\n${body}`
        ));
}

function ok(badge) {
    return new ContainerBuilder()
        .setAccentColor(COLORS.SUCCESS)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# <:Checkedbox:1473038547165384804> Custom Badge Created\n\n` +
            `${badge.emoji} **${badge.name}**\n` +
            `-# \`${badge.badgeId}\` · position \`${badge.position}\`\n\n` +
            (badge.description ? `> ${badge.description}\n` : '') +
            (badge.imageUrl ? `> Image: ${badge.imageUrl}\n` : '') +
            `\nGrant it with \`/badge-give @user ${badge.badgeId}\`.`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${BRANDING}`));
}

const VALID_HEX = /^#?[0-9a-fA-F]{6}$/;
const VALID_URL = /^https?:\/\/\S+\.\S+/;

function parseUsage(args) {
    /**
     * Prefix usage:
     *   badge-create <id> | <name> | [emoji] | [description] | [color] | [imageUrl]
     *
     * Pipe-delimited so names with spaces work without quoting hell.
     * Trailing fields can be omitted.
     */
    const joined = args.join(' ');
    if (!joined) return null;
    const parts = joined.split('|').map(p => p.trim());
    if (parts.length < 2) return null;
    const [badgeId, name, emoji, description, color, imageUrl] = parts;
    return { badgeId, name, emoji, description, color, imageUrl };
}

async function handleCreate(payload) {
    if (!payload?.badgeId || !payload?.name) {
        return { error: err('Missing Fields', 'You must provide at least a **badge id** and a **name**.\nUsage: `badge-create <id> | <name> | [emoji] | [description] | [color] | [imageUrl]`') };
    }
    if (payload.color && !VALID_HEX.test(payload.color)) {
        return { error: err('Invalid Color', 'Color must be a 6-digit hex value (e.g. `#bcf1e4`).') };
    }
    if (payload.imageUrl && !VALID_URL.test(payload.imageUrl)) {
        return { error: err('Invalid Image URL', 'Image URL must start with `http://` or `https://`.') };
    }

    const result = await badgeManager.createCustomBadge(payload);
    if (!result.success) return { error: err('Create Failed', result.message || 'Could not create the badge.') };
    return { container: ok(result.badge) };
}

module.exports = {
    name: 'badge-create',
    prefix: 'badge-create',
    aliases: ['createbadge', 'badgecreate'],
    description: 'Owner-only: create a new custom badge.',
    usage: 'badge-create <id> | <name> | [emoji] | [description] | [#hexcolor] | [imageUrl]',
    category: 'owner',
    ownerOnly: true,
    prefixOnly: false,

    data: new SlashCommandBuilder()
        .setName('badge-create')
        .setDescription('Owner-only: create a new custom badge')
        .setDefaultMemberPermissions(0) // hide from everyone in UI
        .addStringOption(o => o.setName('id').setDescription('Badge ID (lowercase, 2-32 chars)').setRequired(true))
        .addStringOption(o => o.setName('name').setDescription('Display name').setRequired(true))
        .addStringOption(o => o.setName('emoji').setDescription('Emoji or custom <:Name:id>').setRequired(false))
        .addStringOption(o => o.setName('description').setDescription('Short description (<=200 chars)').setRequired(false))
        .addStringOption(o => o.setName('color').setDescription('Hex color, e.g. #bcf1e4').setRequired(false))
        .addStringOption(o => o.setName('image').setDescription('Optional image URL').setRequired(false))
        .addIntegerOption(o => o.setName('position').setDescription('Sort order (defaults after existing custom badges)').setRequired(false)),

    async execute(interaction) {
        if (!isOwner(interaction.user.id)) {
            return interaction.reply({ components: [err('Owner Only', 'This command is restricted to bot owners.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const payload = {
            badgeId:     interaction.options.getString('id', true),
            name:        interaction.options.getString('name', true),
            emoji:       interaction.options.getString('emoji') || undefined,
            description: interaction.options.getString('description') || undefined,
            color:       interaction.options.getString('color') || undefined,
            imageUrl:    interaction.options.getString('image') || undefined,
            position:    interaction.options.getInteger('position') ?? undefined,
        };

        const r = await handleCreate(payload);
        if (r.error) return interaction.reply({ components: [r.error], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        return interaction.reply({ components: [r.container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        if (!isOwner(message.author.id)) {
            return message.reply({ components: [err('Owner Only', 'This command is restricted to bot owners.')], flags: MessageFlags.IsComponentsV2 });
        }

        const payload = parseUsage(args);
        if (!payload) {
            return message.reply({ components: [err('Usage', '`badge-create <id> | <name> | [emoji] | [description] | [#hexcolor] | [imageUrl]`\n\nExample:\n`badge-create alpha-tester | Alpha Tester | <:Award:1473038391632203887> | Joined the alpha | #5865F2`')], flags: MessageFlags.IsComponentsV2 });
        }

        const r = await handleCreate(payload);
        if (r.error) return message.reply({ components: [r.error], flags: MessageFlags.IsComponentsV2 });
        return message.reply({ components: [r.container], flags: MessageFlags.IsComponentsV2 });
    },
};
