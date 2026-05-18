const { isOwner } = require('../../utils/helpers');
module.exports = {
    
    async executePrefix(message, args, lavalinkManager, client) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const userId = args[0];
        if (!userId) {
            return message.reply('<:Cancel:1473037949187657818> Please provide a user ID to globally ban!');
        }

        const reason = args.slice(1).join(' ') || 'Global ban';
        const msg = await message.reply('<a:loading:1506015728871149770> Globally banning user from all servers...');
        let count = 0;

        for (const guild of client.guilds.cache.values()) {
            try {
                await guild.members.ban(userId, { reason: `[GLOBAL BAN] ${reason}` });
                count++;
            } catch (err) {
                console.error(`Failed to ban in ${guild.name}:`, err.message);
            }
        }

        msg.edit(`<:Checkedbox:1473038547165384804> Successfully globally banned user from **${count}** servers!`);
    }
};
