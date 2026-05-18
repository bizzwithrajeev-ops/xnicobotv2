const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');

const emojiMap = {
    'a': '🇦', 'b': '🇧', 'c': '🇨', 'd': '🇩', 'e': '🇪', 'f': '🇫', 'g': '🇬', 'h': '🇭',
    'i': '🇮', 'j': '🇯', 'k': '🇰', 'l': '🇱', 'm': '🇲', 'n': '🇳', 'o': '🇴', 'p': '🇵',
    'q': '🇶', 'r': '🇷', 's': '🇸', 't': '🇹', 'u': '🇺', 'v': '🇻', 'w': '🇼', 'x': '🇽',
    'y': '🇾', 'z': '🇿', '0': '0️⃣', '1': '1️⃣', '2': '2️⃣', '3': '3️⃣', '4': '4️⃣',
    '5': '5️⃣', '6': '6️⃣', '7': '7️⃣', '8': '8️⃣', '9': '9️⃣', '!': '❗', '?': '<:Lightbulbalt:1473038470787240009>', ' ': '   '
};

module.exports = {
    prefix: 'emojify',
    description: 'Convert text to regional indicator emojis',
    usage: 'emojify <text>',
    category: 'utility',
    aliases: ['emoji-text'],

    async executePrefix(message, args) {
        if (args.length === 0) {
            const container = buildErrorResponse(
                'No Text Provided',
                'Please provide text to emojify.',
                '**Example:** `emojify hello`'
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        const text = args.join(' ');
        const result = text.toLowerCase().split('').map(char => emojiMap[char] || char).join('');
        
        if (result.length > 1800) {
            const container = buildErrorResponse('Too Long', 'Result is too long to display (max 1800 characters).');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        let content = `# 😀 Emojify\n\n`;
        content += result;
        
        const container = new ContainerBuilder()
            .setAccentColor(COLORS.FUN)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
        
        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
