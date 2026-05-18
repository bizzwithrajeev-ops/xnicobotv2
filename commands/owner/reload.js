const { isOwner } = require('../../utils/helpers');
const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reload')
        .setDescription('<:Lock:1473038513749491773> Owner Only: Reload a command')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('The command to reload')
                .setRequired(true)),
    
    async execute(interaction, lavalinkManager) {
        if (!isOwner(interaction.user.id)) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> This command is only available to the bot owner!', flags: MessageFlags.Ephemeral });
        }

        const commandName = interaction.options.getString('command').toLowerCase();
        const command = interaction.client.commands.get(commandName);

        if (!command) {
            return interaction.reply({ content: `<:Cancel:1473037949187657818> Command \`${commandName}\` not found!`, flags: MessageFlags.Ephemeral });
        }

        const folders = ['music', 'voice', 'basic', 'fun', 'admin', 'automation', 'utility', 'owner', 'economy', 'leveling', 'image', 'social', 'backup', 'webhook', 'dm'];
        let commandPath = null;

        for (const folder of folders) {
            const testPath = path.join(__dirname, '..', folder, `${commandName}.js`);
            try {
                require.resolve(testPath);
                commandPath = testPath;
                break;
            } catch (e) {}
        }

        if (!commandPath) {
            return interaction.reply({ content: `<:Cancel:1473037949187657818> Could not find command file for \`${commandName}\`!`, flags: MessageFlags.Ephemeral });
        }

        delete require.cache[require.resolve(commandPath)];

        try {
            const newCommand = require(commandPath);
            interaction.client.commands.set(newCommand.data?.name || commandName, newCommand);

            // Re-register aliases
            if (newCommand.aliases) {
                for (const alias of newCommand.aliases) {
                    interaction.client.commands.set(alias, newCommand);
                }
            }
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Command Reloaded\n\n**Command:** \`${commandName}\`\n**Status:** Successfully reloaded`)
                );
            
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: `<:Cancel:1473037949187657818> Error reloading command \`${commandName}\`:\n\`${error.message}\``, flags: MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const commandName = args[0]?.toLowerCase();
        if (!commandName) return message.reply('<:Cancel:1473037949187657818> Please specify a command to reload!');

        const command = message.client.commands.get(commandName);

        if (!command) {
            return message.reply(`<:Cancel:1473037949187657818> Command \`${commandName}\` not found!`);
        }

        const folders = ['music', 'voice', 'basic', 'fun', 'admin', 'automation', 'utility', 'owner', 'economy', 'leveling', 'image', 'social', 'backup', 'webhook', 'dm'];
        let commandPath = null;

        for (const folder of folders) {
            const testPath = path.join(__dirname, '..', folder, `${commandName}.js`);
            try {
                require.resolve(testPath);
                commandPath = testPath;
                break;
            } catch (e) {}
        }

        if (!commandPath) {
            return message.reply(`<:Cancel:1473037949187657818> Could not find command file for \`${commandName}\`!`);
        }

        delete require.cache[require.resolve(commandPath)];

        try {
            const newCommand = require(commandPath);
            message.client.commands.set(newCommand.data?.name || commandName, newCommand);

            // Re-register aliases
            if (newCommand.aliases) {
                for (const alias of newCommand.aliases) {
                    message.client.commands.set(alias, newCommand);
                }
            }
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Command Reloaded\n\n**Command:** \`${commandName}\`\n**Status:** Successfully reloaded`)
                );
            
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(error);
            message.reply(`<:Cancel:1473037949187657818> Error reloading command \`${commandName}\`:\n\`${error.message}\``);
        }
    }
};
