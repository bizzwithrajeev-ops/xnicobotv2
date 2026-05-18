const { PermissionFlagsBits } = require('discord.js');

const jsonStore = require('../../utils/jsonStore');
module.exports = {
    name: 'customcmd',
    description: 'Create a custom command',
    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('<:Cancel:1473037949187657818> You need the **Administrator** permission!');
        }

        if (args.length < 2) {
            return message.reply('<:Cancel:1473037949187657818> **Usage:** `-customcmd <name> <response>`');
        }

        const cmdName = args[0].toLowerCase();
        const response = args.slice(1).join(' ');

        let config = {};

        if (jsonStore.has('customcmds')) {
            config = jsonStore.read('customcmds');
        }

        if (!config[message.guild.id]) {
            config[message.guild.id] = {};
        }

        config[message.guild.id][cmdName] = response;
        jsonStore.write('customcmds', config);

        await message.reply(`<:Checkedbox:1473038547165384804> Custom command **${cmdName}** created!\n*Use with: \`-${cmdName}\`*`);
    }
};
