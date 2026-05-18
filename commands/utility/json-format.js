const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: null,

    async executePrefix(message, args) {
        const jsonString = args.join(' ');
        
        if (!jsonString) {
            return message.reply('<:Cancel:1473037949187657818> Please provide a JSON string to format!');
        }
        
        try {
            const parsed = JSON.parse(jsonString);
            const formatted = JSON.stringify(parsed, null, 2);
            
            if (formatted.length > 3900) {
                return message.reply('<:Cancel:1473037949187657818> Formatted JSON is too long to display! (Max 3900 characters)');
            }
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Star:1473038501766369300> Formatted JSON\n\n\`\`\`json\n${formatted}\n\`\`\``)
                );
            
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Cancel:1473037949187657818> Invalid JSON\n\n**Error:** ${error.message}\n\n**Tip:** Make sure your JSON is properly formatted with quotes around keys and values.`)
                );
            
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
