const { isOwner } = require('../../utils/helpers');
const fs = require('fs');
const path = require('path');
const jsonStore = require('../../utils/jsonStore');

module.exports = {
    
    async executePrefix(message, args, lavalinkManager, client) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const ownersPath = path.join(__dirname, '..', '..', 'datas', 'owners.json');
        let owners = [];
        
        if (jsonStore.has('owners')) {
            owners = jsonStore.read('owners');
        }

        const mainOwner = await client.users.fetch(process.env.OWNER_ID);
        let ownerList = `<:Crown:1506010837368963142> **Main Owner:** ${mainOwner.username}\n\n`;

        if (owners.length > 0) {
            ownerList += `**Co-Owners:**\n`;
            for (const id of owners) {
                try {
                    const user = await client.users.fetch(id);
                    ownerList += `• ${user.username} (${id})\n`;
                } catch (err) {
                    ownerList += `• Unknown User (${id})\n`;
                }
            }
        } else {
            ownerList += `*No co-owners*`;
        }

        message.reply(ownerList);
    }
};
