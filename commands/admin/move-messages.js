const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

module.exports = {
    prefix: 'move-messages',
    description: 'Move Messages',
    usage: 'move-messages',
    category: 'admin',
    data: null,

    async executePrefix(message, args) {
        if (!message.guild) return message.reply('<:Cancel:1473037949187657818> This command can only be used in a server.').catch(() => {});
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply('<:Cancel:1473037949187657818> You need **Manage Messages** permission to use this command!');
        }

        if (args.length < 2) {
            return message.reply('<:Cancel:1473037949187657818> Usage: `move-messages <amount> <#target-channel>`\nExample: `move-messages 10 #archive`');
        }

        try {
            const amount = parseInt(args[0]);
            const targetChannel = message.mentions.channels.first();

            if (!amount || amount < 1 || amount > 100) {
                return message.reply('<:Cancel:1473037949187657818> Amount must be between 1 and 100!');
            }

            if (!targetChannel) {
                return message.reply('<:Cancel:1473037949187657818> Please mention a valid target channel!');
            }

            const messages = await message.channel.messages.fetch({ limit: amount });
            // Sort oldest-first to preserve conversation order
            const sorted = [...messages.values()].reverse();
            let moved = 0;

            for (const msg of sorted) {
                if (msg.id === message.id) continue;
                
                try {
                    const container = new ContainerBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder()
                                .setContent(`**${msg.author.username}** (${msg.createdAt.toLocaleString()}):\n${msg.content || '*[No text content]*'}`)
                        );

                    await targetChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
                    await msg.delete();
                    moved++;
                } catch (err) {
                    console.error('Error moving message:', err);
                }
            }

            const confirmContainer = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Messages Moved!\n\n**Moved:** ${moved} messages\n**To:** ${targetChannel}`)
                );

            await message.reply({ components: [confirmContainer], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            await message.reply(`<:Cancel:1473037949187657818> Error: ${error.message}`);
        }
    }
};
