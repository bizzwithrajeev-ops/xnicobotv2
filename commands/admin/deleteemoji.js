const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { COLORS, BRANDING } = require('../../utils/responseBuilder');

function buildSuccess(emojiName, moderator) {
    return new ContainerBuilder()
        .setAccentColor(COLORS.SUCCESS)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# <:Trash:1473038090074591293> Emoji Deleted\n\n` +
                `**Name:** \`:${emojiName}:\`\n` +
                `**Moderator:** ${moderator}`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
}

function buildError(desc) {
    return new ContainerBuilder()
        .setAccentColor(COLORS.ERROR)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Delete Emoji\n\n${desc}`)
        );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deleteemoji')
        .setDescription('Delete a custom emoji from this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
        .addStringOption(option =>
            option.setName('emoji')
                .setDescription('The emoji to delete (paste it)')
                .setRequired(true)),

    prefix: 'deleteemoji',
    description: 'Delete a custom emoji from this server',
    usage: 'deleteemoji <emoji>',
    category: 'admin',
    aliases: ['delemoji', 'removeemoji'],

    async execute(interaction) {
        const input = interaction.options.getString('emoji');
        const emojiMatch = input.match(/<a?:(\w+):(\d+)>/);

        if (!emojiMatch) {
            return interaction.reply({
                components: [buildError('Please provide a valid custom emoji.\n\n**Example:** `/deleteemoji emoji:<:name:123>`')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
        }

        const emoji = interaction.guild.emojis.cache.get(emojiMatch[2]);
        if (!emoji) {
            return interaction.reply({
                components: [buildError('That emoji was not found in this server!')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
        }

        try {
            const emojiName = emoji.name;
            await emoji.delete(`Deleted by ${interaction.user.username}`);
            await interaction.reply({ components: [buildSuccess(emojiName, interaction.user.username)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            await interaction.reply({
                components: [buildError(`Failed to delete emoji: ${error.message}`)],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
        }
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuildExpressions) &&
            !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({
                components: [buildError('You need **Manage Expressions** permission to delete emojis.')],
                flags: MessageFlags.IsComponentsV2
            });
        }

        const emojiMatch = args[0]?.match(/<a?:(\w+):(\d+)>/);

        if (!emojiMatch) {
            return message.reply({
                components: [buildError('Please provide a valid emoji.\n\n**Usage:** `deleteemoji <emoji>`\n**Example:** `deleteemoji :customemoji:`')],
                flags: MessageFlags.IsComponentsV2
            });
        }

        const emoji = message.guild.emojis.cache.get(emojiMatch[2]);
        if (!emoji) {
            return message.reply({
                components: [buildError('That emoji was not found in this server!')],
                flags: MessageFlags.IsComponentsV2
            });
        }

        try {
            const emojiName = emoji.name;
            await emoji.delete(`Deleted by ${message.author.username}`);
            await message.reply({ components: [buildSuccess(emojiName, message.author.username)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            await message.reply({
                components: [buildError(`Failed to delete emoji: ${error.message}`)],
                flags: MessageFlags.IsComponentsV2
            });
        }
    }
};
