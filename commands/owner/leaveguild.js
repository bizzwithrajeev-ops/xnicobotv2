const { isOwner } = require('../../utils/helpers');
const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaveguild')
        .setDescription('<:Lock:1473038513749491773> Owner Only: Make the bot leave a server')
        .addStringOption(option =>
            option.setName('guildid')
                .setDescription('The server ID to leave')
                .setRequired(true)),
    
    async execute(interaction, lavalinkManager) {
        if (!isOwner(interaction.user.id)) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> This command is only available to the bot owner!', flags: MessageFlags.Ephemeral });
        }

        const guildId = interaction.options.getString('guildid');
        const guild = interaction.client.guilds.cache.get(guildId);

        if (!guild) {
            return interaction.reply({ content: `<:Cancel:1473037949187657818> Could not find server with ID: \`${guildId}\``, flags: MessageFlags.Ephemeral });
        }

        const guildName = guild.name;
        
        try {
            await guild.leave();
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Left Server\n\n**Server:** ${guildName}\n**ID:** \`${guildId}\``)
                );
            
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        } catch (error) {
            await interaction.reply({ content: `<:Cancel:1473037949187657818> Error leaving server: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const guildId = args[0];
        if (!guildId) return message.reply('<:Cancel:1473037949187657818> Please provide a server ID!');

        const guild = message.client.guilds.cache.get(guildId);

        if (!guild) {
            return message.reply(`<:Cancel:1473037949187657818> Could not find server with ID: \`${guildId}\``);
        }

        const guildName = guild.name;
        
        try {
            await guild.leave();
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Left Server\n\n**Server:** ${guildName}\n**ID:** \`${guildId}\``)
                );
            
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            message.reply(`<:Cancel:1473037949187657818> Error leaving server: ${error.message}`);
        }
    }
};
