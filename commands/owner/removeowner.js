const { isOwner } = require('../../utils/helpers');
const fs = require('fs');
const path = require('path');
const jsonStore = require('../../utils/jsonStore');
const { resolveUser } = require('../../utils/resolveUser');

module.exports = {
    name: 'removeowner',
    prefix: 'removeowner',
    aliases: ['delowner', 'removeco'],
    description: 'Remove a co-owner from the bot',
    usage: 'removeowner <@user>',
    category: 'owner',
    ownerOnly: true,

    async executePrefix(message, args) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const user = await resolveUser(message, args);
        if (!user) {
            return message.reply('<:Cancel:1473037949187657818> Please mention a user to remove as co-owner!');
        }

        const ownersPath = path.join(__dirname, '..', '..', 'datas', 'owners.json');
        
        if (!jsonStore.has('owners')) {
            return message.reply('<:Cancel:1473037949187657818> No co-owners found!');
        }

        let owners = jsonStore.read('owners');

        if (!owners.includes(user.id)) {
            return message.reply('<:Cancel:1473037949187657818> This user is not a co-owner!');
        }

        owners = owners.filter(id => id !== user.id);
        jsonStore.write('owners', owners);
        
        message.reply(`<:Checkedbox:1473038547165384804> Successfully removed **${user.username}** from co-owners!`);
    }
};
