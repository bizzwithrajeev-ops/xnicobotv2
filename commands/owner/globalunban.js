const { isOwner } = require('../../utils/helpers');
module.exports = {
    
    async executePrefix(message, args, lavalinkManager, client) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const userId = args[0];
        if (!userId) {
            return message.reply('<:Cancel:1473037949187657818> Please provide a user ID to globally unban!');
        }

        const msg = await message.reply('<:Lightning:1473038797540298792> Globally unbanning user from all servers...');
        let count = 0;

        for (const guild of client.guilds.cache.values()) {
            try {
                await guild.members.unban(userId, 'Global unban');
                count++;
            } catch (err) {
                console.error(`Failed to unban in ${guild.name}:`, err.message);
            }
        }

        msg.edit(`<:Checkedbox:1473038547165384804> Successfully globally unbanned user from **${count}** servers!`);
    }
};
