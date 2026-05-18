const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');

const memeTemplates = [
    "Nobody:\nAbsolutely nobody:\n> {text}",
    "Me: {text}\nAlso me: *Why did I do that?*",
    "Expectation: Everything will go smoothly\nReality: {text}",
    "Mom: We have {text} at home\n{text} at home: 💀",
    "Teacher: The test isn't that hard\nThe test: {text}",
    "My brain at 3 AM: {text}",
    "When you {text}\n*surprised pikachu face* 😮",
    "Boss makes a dollar, I make a dime\nThat's why I {text}",
    "Is this {text}? 👈🦋",
    "POV: You just {text}",
    "Roses are red, violets are blue,\n{text}",
    "Me: finally going to sleep\nBrain: What about {text}?",
    "Netflix: Are you still watching?\nMe: {text}"
];

function buildMeme(text) {
    const template = memeTemplates[Math.floor(Math.random() * memeTemplates.length)];
    const meme = template.replace(/{text}/g, text);
    let content = `# <:Userplus:1473038912212435086> Meme Generator\n\n`;
    content += meme;
    content += `\n\n-# Run the command again for a different template!`;
    return new ContainerBuilder()
        .setAccentColor(COLORS.FUN)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Generate a random meme with your text')
        .addStringOption(opt =>
            opt.setName('text')
                .setDescription('The text for your meme')
                .setRequired(true)),
    prefix: 'meme',
    description: 'Generate a random meme with your text',
    usage: 'meme <text>',
    category: 'fun',
    aliases: ['memegen'],

    async execute(interaction) {
        const text = interaction.options.getString('text');
        const container = buildMeme(text);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        if (!args.length) {
            const container = buildErrorResponse(
                'No Text Provided',
                'Please provide text for your meme!',
                '**Example:** `meme discord bot coding`'
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const text = args.join(' ');
        const container = buildMeme(text);
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
