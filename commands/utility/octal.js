const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('octal')
        .setDescription('Convert text to/from octal')
        .addStringOption(o => o.setName('text').setDescription('Text to convert').setRequired(true))
        .addStringOption(o => o.setName('mode').setDescription('Conversion mode').addChoices({ name: 'Text to Octal', value: 'encode' }, { name: 'Octal to Text', value: 'decode' })),

    prefix: 'octal',
    description: 'Convert text to/from octal (base 8)',
    usage: 'octal <text> [encode/decode]',
    category: 'utility',
    aliases: ['oct'],

    async execute(interaction) {
        const text = interaction.options.getString('text');
        const mode = interaction.options.getString('mode') || 'encode';
        await convertOctal(interaction, text, mode, true);
    },

    async executePrefix(message, args) {
        if (args.length === 0) {
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Missing Text\n\nPlease provide text to convert!\n\n**Usage:** \`-octal <text> [encode/decode]\`\n**Example:** \`-octal Hello World\``
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

        await convertOctal(message, text, mode, false);
    }
};

async function convertOctal(context, text, mode, isInteraction) {
    try {
        let result;

        if (mode === 'encode') {
            result = text.split('').map(char => char.charCodeAt(0).toString(8).padStart(3, '0')).join(' ');
        } else {
            const octalArray = text.replace(/[^0-7\s]/g, '').split(/\s+/).filter(o => o);
            result = octalArray.map(octal => {
                const decimal = parseInt(octal, 8);
                return isNaN(decimal) ? '' : String.fromCharCode(decimal);
            }).join('');

            if (!result) {
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xCAD7E6)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# <:Cancel:1473037949187657818> Invalid Format\n\nInvalid octal format! Use space-separated octal codes (0-7).`
                        )
                    );
                if (isInteraction) {
                    return context.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
                } else {
                    return context.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
                }
            }
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
                    `# 🔢 Octal ${mode === 'encode' ? 'Encoder' : 'Decoder'}\n\n` +
                    `**Input:**\n${text.length > 200 ? text.substring(0, 200) + '...' : text}\n\n` +
                    `**Output:**\n\`${result.length > 200 ? result.substring(0, 200) + '...' : result}\``
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
