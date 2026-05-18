const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { COLORS } = require('../../utils/responseBuilder');

const facts = [
    "Honey never spoils. Archaeologists have found 3000-year-old honey in Egyptian tombs that's still edible!",
    "Octopuses have three hearts and blue blood.",
    "A group of flamingos is called a 'flamboyance'.",
    "Bananas are berries, but strawberries aren't.",
    "The Eiffel Tower can be 15 cm taller during the summer due to thermal expansion.",
    "A single cloud can weigh more than 1 million pounds.",
    "Scotland's national animal is the unicorn.",
    "The shortest war in history lasted 38 minutes (Anglo-Zanzibar War, 1896).",
    "Sharks existed before trees. They've been around for over 400 million years!",
    "A day on Venus is longer than its year.",
    "There are more stars in the universe than grains of sand on all Earth's beaches.",
    "Wombat poop is cube-shaped.",
    "A shrimp's heart is in its head.",
    "It's impossible to hum while holding your nose.",
    "The inventor of the Pringles can is now buried in one.",
    "A bolt of lightning is five times hotter than the surface of the sun.",
    "A crocodile cannot stick its tongue out.",
    "No number before 1,000 contains the letter 'A'.",
    "The moon has moonquakes.",
    "Cows have best friends and get stressed when separated."
];

function getFactContainer() {
    const randomFact = facts[Math.floor(Math.random() * facts.length)];
    
    let content = `# 🧠 Random Fun Fact\n\n`;
    content += `> ${randomFact}\n\n`;
    content += `-# Did you know? Run this command again for another fact!`;

    return new ContainerBuilder()
        .setAccentColor(COLORS.INFO)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fact')
        .setDescription('Get a random fun fact'),
    prefix: 'fact',
    description: 'Get a random fun fact',
    usage: 'fact',
    category: 'fun',
    aliases: ['funfact', 'didyouknow'],

    async execute(interaction) {
        const container = getFactContainer();
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message) {
        const container = getFactContainer();
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
