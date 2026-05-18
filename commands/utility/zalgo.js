const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

const zalgoChars = [
    '\u0300', '\u0301', '\u0302', '\u0303', '\u0304', '\u0305', '\u0306', '\u0307',
    '\u0308', '\u0309', '\u030A', '\u030B', '\u030C', '\u030D', '\u030E', '\u030F',
    '\u0310', '\u0311', '\u0312', '\u0313', '\u0314', '\u0315', '\u0316', '\u0317'
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('zalgo')
        .setDescription('Convert text to creepy Zalgo text')
        .addStringOption(o => o.setName('text').setDescription('Text to convert').setRequired(true))
        .addIntegerOption(o => o.setName('intensity').setDescription('Zalgo intensity (1-10)').setMinValue(1).setMaxValue(10)),

    prefix: 'zalgo',
    description: 'Convert text to creepy Zalgo text',
    usage: 'zalgo <text>',
    category: 'utility',
    aliases: ['creepy', 'glitch'],

    async execute(interaction) {
        const text = interaction.options.getString('text');
        const intensity = interaction.options.getInteger('intensity') || 3;
        await convertZalgo(interaction, text, intensity, true);
    },

    async executePrefix(message, args) {
        if (args.length === 0) {
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Missing Text\n\nPlease provide text to convert!\n\n**Usage:** \`-zalgo <text>\`\n**Example:** \`-zalgo Hello World\``
                    )
                );
            return message.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }
        
        const text = args.join(' ');
        await convertZalgo(message, text, 3, false);
    }
};

async function convertZalgo(context, text, intensity, isInteraction) {
    try {
        const result = text.split('').map(char => {
            if (char === ' ') return char;
            let zalgoChar = char;
            for (let i = 0; i < intensity; i++) {
                zalgoChar += zalgoChars[Math.floor(Math.random() * zalgoChars.length)];
            }
            return zalgoChar;
        }).join('');
        
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
                new TextDisplayBuilder().setContent(`# 👹 Zalgo Text\n\n${result}`)
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
