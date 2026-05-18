const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { COLORS, BRANDING } = require('../../utils/responseBuilder');

function buildSuccess(oldName, newName, emojiStr, moderator) {
    return new ContainerBuilder()
        .setAccentColor(COLORS.SUCCESS)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# <:Editalt:1473038138577256670> Emoji Renamed\n\n` +
                `${emojiStr} \`:${oldName}:\` → \`:${newName}:\`\n` +
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
            new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Rename Emoji\n\n${desc}`)
        );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('renameemoji')
        .setDescription('Rename a custom emoji in this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
        .addStringOption(option =>
            option.setName('emoji')
                .setDescription('The emoji to rename (paste it)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('name')
                .setDescription('The new name for the emoji')
                .setRequired(true)),

    prefix: 'renameemoji',
    description: 'Rename a custom emoji in this server',
    usage: 'renameemoji <emoji> <new_name>',
    category: 'admin',
    aliases: ['emojirename'],

    async execute(interaction) {
        const input = interaction.options.getString('emoji');
        const newName = interaction.options.getString('name');
        const emojiMatch = input.match(/<a?:(\w+):(\d+)>/);

        if (!emojiMatch) {
            return interaction.reply({
                components: [buildError('Please provide a valid custom emoji.\n\n**Example:** `/renameemoji emoji:<:old:123> name:newname`')],
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
            const oldName = emoji.name;
            await emoji.setName(newName, `Renamed by ${interaction.user.username}`);
            await interaction.reply({ components: [buildSuccess(oldName, newName, `${emoji}`, interaction.user.username)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            await interaction.reply({
                components: [buildError(`Failed to rename emoji: ${error.message}`)],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
        }
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuildExpressions) &&
            !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({
                components: [buildError('You need **Manage Expressions** permission to rename emojis.')],
                flags: MessageFlags.IsComponentsV2
            });
        }

        if (args.length < 2) {
            return message.reply({
                components: [buildError('Please provide an emoji and new name.\n\n**Usage:** `renameemoji <emoji> <new_name>`\n**Example:** `renameemoji :oldname: newname`')],
                flags: MessageFlags.IsComponentsV2
            });
        }

        const emojiMatch = args[0]?.match(/<a?:(\w+):(\d+)>/);
        if (!emojiMatch) {
            return message.reply({
                components: [buildError('Please provide a valid custom emoji as the first argument.')],
                flags: MessageFlags.IsComponentsV2
            });
        }

        const emoji = message.guild.emojis.cache.get(emojiMatch[2]);
        const newName = args[1];

        if (!emoji) {
            return message.reply({
                components: [buildError('That emoji was not found in this server!')],
                flags: MessageFlags.IsComponentsV2
            });
        }

        try {
            const oldName = emoji.name;
            await emoji.setName(newName, `Renamed by ${message.author.username}`);
            await message.reply({ components: [buildSuccess(oldName, newName, `${emoji}`, message.author.username)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            await message.reply({
                components: [buildError(`Failed to rename emoji: ${error.message}`)],
                flags: MessageFlags.IsComponentsV2
            });
        }
    }
};
