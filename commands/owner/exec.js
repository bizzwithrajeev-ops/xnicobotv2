const { isOwner } = require('../../utils/helpers');
const { exec } = require('child_process');
const util = require('util');

module.exports = {
    
    async executePrefix(message, args) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const command = args.join(' ');
        if (!command) {
            return message.reply('<:Cancel:1473037949187657818> Please provide a command to execute!');
        }

        const msg = await message.reply('<:Lightning:1473038797540298792> Executing command...');

        exec(command, (error, stdout, stderr) => {
            if (error) {
                return msg.edit(`<:Cancel:1473037949187657818> **Error:**\n\`\`\`\n${error.message.substring(0, 1900)}\n\`\`\``);
            }

            if (stderr) {
                return msg.edit(`<:Inforect:1473038624172937287> **Stderr:**\n\`\`\`\n${stderr.substring(0, 1900)}\n\`\`\``);
            }

            msg.edit(`<:Checkedbox:1473038547165384804> **Output:**\n\`\`\`\n${stdout.substring(0, 1900) || 'No output'}\n\`\`\``);
        });
    }
};
