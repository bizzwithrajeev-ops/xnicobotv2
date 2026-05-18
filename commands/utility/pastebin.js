module.exports = {
    name: 'pastebin',
    description: 'Create a pastebin link from text',
    async executePrefix(message, args) {
        const text = args.join(' ');
        if (!text) {
            return message.reply('<:Cancel:1473037949187657818> Please provide text to create a pastebin!');
        }

        try {
            await message.reply(`<:Checkedbox:1473038547165384804> Here's a mockup pastebin feature. In production, integrate with pastebin.com API.\n\`\`\`${text.substring(0, 1900)}\`\`\``);
        } catch (error) {
            await message.reply('<:Cancel:1473037949187657818> Failed to create pastebin!');
        }
    }
};
