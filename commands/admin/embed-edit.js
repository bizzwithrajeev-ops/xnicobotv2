const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'embed-edit',
    prefix: 'embed-edit',
    description: 'Edit a bot container message',
    category: 'admin',
    usage: 'embed-edit <message_id> <title> | <description>',
    permissions: ['ManageMessages'],

    async executePrefix(message, args) {
        if (!message.guild) return message.reply('<:Cancel:1473037949187657818> This command can only be used in a server.').catch(() => {});
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply('You need Manage Messages permission to use this command.');
        }

        if (!args[0]) {
            return message.reply('Usage: `embed-edit <message_id> <title> | <description>`');
        }

        const messageId = args[0];
        const content = args.slice(1).join(' ');

        if (!content.includes('|')) {
            return message.reply('Please separate title and description with `|`');
        }

        try {
            const targetMessage = await message.channel.messages.fetch(messageId);

            if (targetMessage.author.id !== message.client.user.id) {
                return message.reply('I can only edit my own messages.');
            }

            const [title, description] = content.split('|').map(s => s.trim());

            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# ${title || 'Embed'}\n\n${description || 'No description'}`
                    )
                );

            await targetMessage.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            await message.reply('<:Checkedbox:1473038547165384804> Message edited successfully!');
        } catch (error) {
            await message.reply(`<:Cancel:1473037949187657818> Failed to edit message: ${error.message}`);
        }
    }
};
