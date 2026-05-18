const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rot13')
        .setDescription('Encode/decode text using ROT13 cipher')
        .addStringOption(o => o.setName('text').setDescription('Text to encode/decode').setRequired(true)),

    prefix: 'rot13',
    description: 'Encode/decode text using ROT13 cipher',
    usage: 'rot13 <text>',
    category: 'utility',
    aliases: ['rotate13'],

    async execute(interaction) {
        const text = interaction.options.getString('text');
        await encodeRot13(interaction, text, true);
    },

    async executePrefix(message, args) {
        if (args.length === 0) {
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Missing Text\n\nPlease provide text to encode/decode!\n\n**Usage:** \`-rot13 <text>\`\n**Example:** \`-rot13 Hello World\``
                    )
                );
            return message.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }
        
        const text = args.join(' ');
        await encodeRot13(message, text, false);
    }
};

async function encodeRot13(context, text, isInteraction) {
    try {
        const result = text.replace(/[a-zA-Z]/g, char => {
            const start = char <= 'Z' ? 65 : 97;
            return String.fromCharCode(start + (char.charCodeAt(0) - start + 13) % 26);
        });
        
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
                    `# <:History:1473037847568318605> ROT13 Cipher\n\n` +
                    `**Input:**\n${text}\n\n` +
                    `**Output:**\n${result}\n\n` +
                    `-# ROT13 is its own inverse - run again to decode!`
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
