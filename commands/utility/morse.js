const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

const morseCode = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
    'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
    'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
    'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
    'Y': '-.--', 'Z': '--..', '0': '-----', '1': '.----', '2': '..---',
    '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...',
    '8': '---..', '9': '----.', ' ': '/'
};

const reverseMorse = Object.fromEntries(Object.entries(morseCode).map(([k, v]) => [v, k]));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('morse')
        .setDescription('Convert text to/from Morse code')
        .addStringOption(o => o.setName('text').setDescription('Text to convert').setRequired(true))
        .addStringOption(o => o.setName('mode').setDescription('Conversion mode').addChoices({ name: 'Text to Morse', value: 'encode' }, { name: 'Morse to Text', value: 'decode' })),

    prefix: 'morse',
    description: 'Convert text to/from Morse code',
    usage: 'morse <text> [encode/decode]',
    category: 'utility',
    aliases: ['morsecode'],

    async execute(interaction) {
        const text = interaction.options.getString('text');
        const mode = interaction.options.getString('mode') || 'encode';
        await convertMorse(interaction, text, mode, true);
    },

    async executePrefix(message, args) {
        if (args.length === 0) {
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Missing Text\n\nPlease provide text to convert!\n\n**Usage:** \`-morse <text> [encode/decode]\`\n**Example:** \`-morse Hello World\``
                    )
                );
            return message.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }
        
        let mode = 'encode';
        let text = args.join(' ');
        
        const lastArg = args[args.length - 1].toLowerCase();
        if (['encode', 'decode'].includes(lastArg)) {
            mode = lastArg;
            text = args.slice(0, -1).join(' ');
        }
        
        if (!text) {
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Missing Text\n\nPlease provide text to convert!`
                    )
                );
            return message.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }
        
        await convertMorse(message, text, mode, false);
    }
};

async function convertMorse(context, text, mode, isInteraction) {
    try {
        let result;
        
        if (mode === 'encode') {
            result = text.toUpperCase().split('').map(char => morseCode[char] || char).join(' ');
        } else {
            result = text.split(' ').map(code => reverseMorse[code] || code).join('');
        }
        
        if (result.length > 3900) {
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Too Long\n\nResult is too long to display! (Max 3900 characters)`
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
                    `# 📡 Morse Code ${mode === 'encode' ? 'Encoder' : 'Decoder'}\n\n` +
                    `**Input:**\n${text}\n\n` +
                    `**Output:**\n\`${result}\``
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
