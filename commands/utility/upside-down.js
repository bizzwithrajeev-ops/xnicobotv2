const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

const flipped = {
    'a': 'ɐ', 'b': 'q', 'c': 'ɔ', 'd': 'p', 'e': 'ǝ', 'f': 'ɟ', 'g': 'ƃ', 'h': 'ɥ', 'i': 'ᴉ', 'j': 'ɾ',
    'k': 'ʞ', 'l': 'l', 'm': 'ɯ', 'n': 'u', 'o': 'o', 'p': 'd', 'q': 'b', 'r': 'ɹ', 's': 's', 't': 'ʇ',
    'u': 'n', 'v': 'ʌ', 'w': 'ʍ', 'x': 'x', 'y': 'ʎ', 'z': 'z',
    'A': '∀', 'B': 'q', 'C': 'Ɔ', 'D': 'p', 'E': 'Ǝ', 'F': 'Ⅎ', 'G': 'פ', 'H': 'H', 'I': 'I', 'J': 'ſ',
    'K': 'ʞ', 'L': '˥', 'M': 'W', 'N': 'N', 'O': 'O', 'P': 'Ԁ', 'Q': 'Ό', 'R': 'ᴚ', 'S': 'S', 'T': '┴',
    'U': '∩', 'V': 'Λ', 'W': 'M', 'X': 'X', 'Y': '⅄', 'Z': 'Z',
    '0': '0', '1': 'Ɩ', '2': 'ᄅ', '3': 'Ɛ', '4': 'ㄣ', '5': 'ϛ', '6': '9', '7': 'ㄥ', '8': '8', '9': '6',
    '.': '˙', ',': '\'', '!': '¡', '?': '¿', '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{',
    '<': '>', '>': '<', '&': '⅋', '_': '‾', ';': '؛', '"': '„', '\'': ','
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('upside-down')
        .setDescription('Flip text upside down')
        .addStringOption(o => o.setName('text').setDescription('Text to flip').setRequired(true)),

    prefix: 'upside-down',
    description: 'Flip text upside down',
    usage: 'upside-down <text>',
    category: 'utility',
    aliases: ['upsidedown', 'fliptext'],

    async execute(interaction) {
        const text = interaction.options.getString('text');
        await flipText(interaction, text, true);
    },

    async executePrefix(message, args) {
        if (args.length === 0) {
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Missing Text\n\nPlease provide text to flip!\n\n**Usage:** \`-upside-down <text>\`\n**Example:** \`-upside-down Hello World\``
                    )
                );
            return message.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }

        const text = args.join(' ');
        await flipText(message, text, false);
    }
};

async function flipText(context, text, isInteraction) {
    try {
        const result = text.split('').map(char => flipped[char] || char).reverse().join('');

        if (result.length > 2000) {
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Too Long\n\nResult is too long! (Max 2000 characters)`
                    )
                );
            if (isInteraction) {
                return context.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
            } else {
                return context.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
            }
        }

        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# 🙃 Upside Down Text\n\n` +
                    `**Original:**\n${text}\n\n` +
                    `**Flipped:**\n${result}`
                )
            );

        if (isInteraction) {
            await context.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } else {
            await context.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    } catch (error) {
        const errorContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Error\n\n${error.message}`)
            );
        if (isInteraction) {
            await context.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        } else {
            await context.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }
    }
}
