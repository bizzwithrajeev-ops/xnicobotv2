const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');

module.exports = {
    description: 'Embed Say',
    usage: 'embed-say',
    category: 'admin',
    data: new SlashCommandBuilder()
        .setName('embed-say')
        .setDescription('Make the bot say something')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message to send')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    
    async execute(interaction) {
        try {
        const message = interaction.options.getString('message');
        await interaction.channel.send({ content: message, allowedMentions: { parse: [] } });
        
        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# <:Checkedbox:1473038547165384804> Message Sent\n\n**Channel:** ${interaction.channel}\n**Moderator:** ${interaction.user.username}`)
            );
        
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[EmbedSay] Error:', error);
            const container = buildErrorResponse('Error', 'An error occurred while executing this command.', error.message);
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args) {
        if (!message.guild) return message.reply('<:Cancel:1473037949187657818> This command can only be used in a server.').catch(() => {});
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply('<:Cancel:1473037949187657818> You need the Manage Messages permission to use this command!');
        }

        try {
        const text = args.join(' ');
        if (!text) {
            return message.reply('<:Cancel:1473037949187657818> Please provide a message!');
        }

        await message.delete();
        message.channel.send({ content: text, allowedMentions: { parse: [] } });
        } catch (error) {
            console.error('[EmbedSay] Error:', error);
            const container = buildErrorResponse('Error', 'An error occurred while executing this command.', error.message);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
