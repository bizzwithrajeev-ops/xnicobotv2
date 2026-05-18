const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const { buildPermissionDenied, buildInvalidUsage, buildSuccessResponse } = require('../../utils/responseBuilder');

const jsonStore = require('../../utils/jsonStore');

function getLeveling() {
    if (!jsonStore.has('leveling')) {
        jsonStore.write('leveling', {});
        return {};
    }
    return jsonStore.read('leveling');
}

function saveLeveling(data) {
    jsonStore.write('leveling', data);
}

function xpForLevel(level) {
    return Math.pow(level / 0.1, 2);
}

module.exports = {
    data: null, // Prefix-only
    name: 'setlevel',
    prefix: 'setlevel',
    description: 'Set a user\'s level',
    usage: 'setlevel <@user> <level>',
    category: 'leveling',
    aliases: ['lvlset', 'setxp'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await message.reply({ components: [buildPermissionDenied('Administrator')], flags: MessageFlags.IsComponentsV2 });
        }
        
        const target = message.mentions.users.first();
        const level = parseInt(args[1]);
        
        if (!target || isNaN(level) || level < 0) {
            return await message.reply({
                components: [buildInvalidUsage('setlevel', '-setlevel @user <level>', ['-setlevel @user 10', '-setlevel @user 0'])],
                flags: MessageFlags.IsComponentsV2
            });
        }

        if (level > 1000) {
            return await message.reply({
                components: [buildInvalidUsage('setlevel', '-setlevel @user <level>', ['Level must be between 0 and 1000'])],
                flags: MessageFlags.IsComponentsV2
            });
        }
        
        const leveling = getLeveling();
        
        if (!leveling[message.guild.id]) {
            leveling[message.guild.id] = {};
        }

        const oldData = leveling[message.guild.id][target.id];
        const oldLevel = oldData ? (oldData.level || Math.floor(0.1 * Math.sqrt(oldData.xp || 0))) : 0;
        const xpNeeded = Math.ceil(xpForLevel(level));
        
        leveling[message.guild.id][target.id] = {
            ...(leveling[message.guild.id][target.id] || {}),
            xp: xpNeeded,
            level: level,
            lastXpGain: leveling[message.guild.id][target.id]?.lastXpGain || 0
        };
        
        saveLeveling(leveling);
        
        const container = buildSuccessResponse('Level Updated', `Successfully set ${target}'s level.`, {
            'User': `${target}`,
            'Previous Level': `${oldLevel}`,
            'New Level': `${level}`,
            'Total XP': `${xpNeeded.toLocaleString()}`
        });
        container.setAccentColor(0x57F287);
        
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};
