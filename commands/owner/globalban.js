const { isOwner } = require('../../utils/helpers');

module.exports = {
    name: 'globalban',
    prefix: 'globalban',
    aliases: ['gban', 'banall'],
    description: 'Ban a user from every guild the bot is in',
    usage: 'globalban <userId> [reason]',
    category: 'owner',
    ownerOnly: true,

    async executePrefix(message, args, lavalinkManager, client) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const userId = args[0]?.replace(/[<@!>]/g, '');
        if (!userId || !/^\d{17,20}$/.test(userId)) {
            return message.reply('<:Cancel:1473037949187657818> Provide a valid user ID. Usage: `globalban <userId> [reason]`');
        }

        const reason = args.slice(1).join(' ') || 'Global ban';
        const msg = await message.reply(`<:Lightning:1473038797540298792> Globally banning \`${userId}\` from ${client.guilds.cache.size} guild(s)...`);

        let success = 0;
        let failed = 0;
        for (const guild of client.guilds.cache.values()) {
            try {
                await guild.members.ban(userId, { reason: `[GLOBAL BAN] ${reason}` });
                success++;
            } catch (err) {
                failed++;
                console.error(`[globalban] ${guild.name}: ${err.message}`);
            }
        }

        await msg.edit(
            `<:Checkedbox:1473038547165384804> Globally banned \`${userId}\`\n` +
            `> Banned in: **${success}** guild(s)\n` +
            (failed ? `> Failed in: **${failed}** guild(s)\n` : '') +
            `> Reason: ${reason}`
        ).catch(() => {});
    }
};
