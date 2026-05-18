const { ContainerBuilder, TextDisplayBuilder, MessageFlags, ChannelType, PermissionFlagsBits } = require('discord.js');

module.exports = {
    usage: 'slowmode-all',
    category: 'admin',
    name: 'slowmode-all',
    prefix: 'slowmode-all',
    description: 'Set slowmode in all text channels',

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('<:Cancel:1473037949187657818> You need **Manage Channels** permission to use this command.');
        }

        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('<:Cancel:1473037949187657818> I need **Manage Channels** permission to execute this command.');
        }

        const seconds = parseInt(args[0]);
        if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
            return message.reply('<:Cancel:1473037949187657818> Please provide a valid number between 0 and 21600 seconds.');
        }

        const textChannels = message.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
        let updated = 0;
        let failed = 0;

        for (const [id, channel] of textChannels) {
            try {
                await channel.setRateLimitPerUser(seconds, `Slowmode-all by ${message.author.username}`);
                updated++;
            } catch (error) {
                failed++;
            }
        }

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# <:Timer:1473039056710406204> Slowmode-all Complete\n\n<:Checkedbox:1473038547165384804> **Updated:** ${updated} channels\n<:Cancel:1473037949187657818> **Failed:** ${failed} channels\n**Slowmode:** ${seconds}s\n**Moderator:** ${message.author.username}`)
            );

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
