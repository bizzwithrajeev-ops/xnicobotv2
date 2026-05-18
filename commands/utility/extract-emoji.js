const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');

module.exports = {
    prefix: 'extract-emoji',
    description: 'Extract all emojis from text',
    usage: 'extract-emoji <text>',
    category: 'utility',
    aliases: ['getemoji', 'extractemoji'],

    async executePrefix(message, args) {
        if (!args.length) {
            const container = buildErrorResponse(
                'No Text Provided',
                'Please provide text to extract emojis from.',
                '**Example:** `extract-emoji Hello <:Userplus:1473038912212435086> World 🌍`'
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const text = args.join(' ');
        
        const customEmojiRegex = /<a?:\w+:\d+>/g;
        const customEmojis = text.match(customEmojiRegex) || [];

        if (customEmojis.length === 0) {
            const container = buildErrorResponse('No Emojis Found', 'No custom Discord emojis found in the provided text.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const uniqueEmojis = [...new Set(customEmojis)];
        
        let content = `# 😀 Extracted Emojis\n\n`;
        content += `**Found:** ${uniqueEmojis.length} unique emoji(s)\n\n`;
        content += `### Emojis\n`;
        content += `> ${uniqueEmojis.join(' ')}`;

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.INFO)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
