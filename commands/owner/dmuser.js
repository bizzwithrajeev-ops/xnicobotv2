const { isOwner } = require('../../utils/helpers');

const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dmuser')
        .setDescription('<:Lock:1473038513749491773> Owner Only: Send a DM to a user')
        .addStringOption(option =>
            option.setName('userid')
                .setDescription('The user ID to DM')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message to send')
                .setRequired(true)),
    
    async execute(interaction) {
        if (!isOwner(interaction.user.id)) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> This command is only available to the bot owner!', flags: MessageFlags.Ephemeral });
        }

        const userId = interaction.options.getString('userid');
        const message = interaction.options.getString('message');

        try {
            const user = await interaction.client.users.fetch(userId);
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Chat:1473038936241864865> Message from Bot Owner\n\n${message}`)
                );

            await user.send({ components: [container], flags: MessageFlags.IsComponentsV2 });

            const successContainer = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> DM Sent\n\n**To:** ${user.username} (\`${user.id}\`)\n**Message:** ${message}`)
                );

            await interaction.reply({ components: [successContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        } catch (error) {
            await interaction.reply({ content: `<:Cancel:1473037949187657818> Failed to send DM: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const userId = args[0];
        const dmMessage = args.slice(1).join(' ');

        if (!userId || !dmMessage) {
            return message.reply('<:Cancel:1473037949187657818> Usage: `-dmuser <userid> <message>`');
        }

        try {
            const user = await message.client.users.fetch(userId);
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Chat:1473038936241864865> Message from Bot Owner\n\n${dmMessage}`)
                );

            await user.send({ components: [container], flags: MessageFlags.IsComponentsV2 });

            const successContainer = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> DM Sent\n\n**To:** ${user.username} (\`${user.id}\`)\n**Message:** ${dmMessage}`)
                );

            message.reply({ components: [successContainer], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            message.reply(`<:Cancel:1473037949187657818> Failed to send DM: ${error.message}`);
        }
    }
};
