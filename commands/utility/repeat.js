const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('repeat')
        .setDescription('Repeat text multiple times')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('Text to repeat')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('times')
                .setDescription('Number of times to repeat')
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(true)),

    async executePrefix(message, args) {
        if (args.length < 2) {
            return message.reply('<:Cancel:1473037949187657818> Usage: `repeat <times> <text>`\nExample: `repeat 3 Hello`');
        }

        try {
            const times = parseInt(args[0]);

            if (isNaN(times) || times < 1 || times > 50) {
                return message.reply('<:Cancel:1473037949187657818> Times must be a number between 1 and 50!');
            }

            const text = args.slice(1).join(' ');
            const result = (text + '\n').repeat(times).trim();

            if (result.length > 2000) {
                return message.reply('<:Cancel:1473037949187657818> Result is too long! (Max 2000 characters)');
            }

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Refresh:1473037911581528165> Repeated ${times} Times\n\n${result}`)
                );

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            message.reply(`<:Cancel:1473037949187657818> Error: ${error.message}`);
        }
    }
};