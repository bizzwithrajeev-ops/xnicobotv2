const { isOwner } = require('../../utils/helpers');

module.exports = {
    name: 'globalunban',
    prefix: 'globalunban',
    aliases: ['gunban'],
    description: 'Unban a user from every guild the bot is in',
    usage: 'globalunban <userId>',
    category: 'owner',
    ownerOnly: true,

    async executePrefix(message, args, lavalinkManager, client) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const userId = args[0]?.replace(/[<@!>]/g, '');
        if (!userId || !/^\d{17,20}$/.test(userId)) {
            return message.reply('<:Cancel:1473037949187657818> Provide a valid user ID. Usage: `globalunban <userId>`');
        }

        const msg = await message.reply(`<:Lightning:1473038797540298792> Globally unbanning \`${userId}\`...`);

        let success = 0;
        let failed = 0;
        for (const guild of client.guilds.cache.values()) {
            try {
                await guild.members.unban(userId, 'Global unban');
                success++;
            } catch (err) {
                // Most failures are "user not banned" which is expected.
                if (!/Unknown Ban|Unknown User/i.test(err.message)) {
                    failed++;
                    console.error(`[globalunban] ${guild.name}: ${err.message}`);
                }
            }
        }

        await msg.edit(
            `<:Checkedbox:1473038547165384804> Globally unbanned \`${userId}\`\n` +
            `> Unbanned in: **${success}** guild(s)\n` +
            (failed ? `> Failed in: **${failed}** guild(s)` : '')
        ).catch(() => {});
    }
};
