const { PermissionFlagsBits } = require('discord.js');

const jsonStore = require('../../utils/jsonStore');
module.exports = {
    name: 'delcustomcmd',
    description: 'Delete a custom command',
    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('<:Cancel:1473037949187657818> You need the **Administrator** permission!');
        }

        const cmdName = args[0]?.toLowerCase();
        if (!cmdName) {
            return message.reply('<:Cancel:1473037949187657818> **Usage:** `-delcustomcmd <name>`');
        }

        let config = {};

        if (jsonStore.has('customcmds')) {
            config = jsonStore.read('customcmds');
        }

        if (!config[message.guild.id] || !config[message.guild.id][cmdName]) {
            return message.reply('<:Cancel:1473037949187657818> That custom command does not exist!');
        }

        delete config[message.guild.id][cmdName];
        jsonStore.write('customcmds', config);

        await message.reply(`<:Checkedbox:1473038547165384804> Custom command **${cmdName}** has been deleted!`);
    }
};
