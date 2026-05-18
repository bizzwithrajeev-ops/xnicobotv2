const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { COLORS } = require('../../utils/responseBuilder');

const jokes = [
    { setup: "Why don't scientists trust atoms?", punchline: "Because they make up everything!" },
    { setup: "What do you call a bear with no teeth?", punchline: "A gummy bear!" },
    { setup: "Why did the scarecrow win an award?", punchline: "He was outstanding in his field!" },
    { setup: "What do you call fake spaghetti?", punchline: "An impasta!" },
    { setup: "Why don't eggs tell jokes?", punchline: "They'd crack each other up!" },
    { setup: "What did the ocean say to the beach?", punchline: "Nothing, it just waved!" },
    { setup: "Why did the bicycle fall over?", punchline: "Because it was two tired!" },
    { setup: "What do you call a fish wearing a bowtie?", punchline: "Sofishticated!" },
    { setup: "Why don't skeletons fight each other?", punchline: "They don't have the guts!" },
    { setup: "What's orange and sounds like a parrot?", punchline: "A carrot!" },
    { setup: "Why did the math book look so sad?", punchline: "Because it had too many problems!" },
    { setup: "What do you call a dinosaur that crashes his car?", punchline: "Tyrannosaurus Wrecks!" },
    { setup: "Why can't you hear a pterodactyl go to the bathroom?", punchline: "Because the 'P' is silent!" },
    { setup: "What did one wall say to the other wall?", punchline: "I'll meet you at the corner!" },
    { setup: "Why did the coffee file a police report?", punchline: "It got mugged!" },
    { setup: "What do you call a lazy kangaroo?", punchline: "A pouch potato!" },
    { setup: "Why don't oysters share?", punchline: "Because they're shellfish!" },
    { setup: "What did the grape do when it got stepped on?", punchline: "It let out a little wine!" },
    { setup: "I'm reading a book about anti-gravity...", punchline: "It's impossible to put down!" },
    { setup: "I used to hate facial hair...", punchline: "But then it grew on me." },
    { setup: "What do you call a bee that can't make up its mind?", punchline: "A maybe!" },
    { setup: "I told my wife she was drawing her eyebrows too high.", punchline: "She looked surprised." },
    { setup: "What did the janitor say when he jumped out of the closet?", punchline: "Supplies!" },
    { setup: "Why do cows wear bells?", punchline: "Because their horns don't work!" },
    { setup: "I used to play piano by ear...", punchline: "But now I use my hands." },
    { setup: "What do you call a sleeping dinosaur?", punchline: "A dino-snore!" },
    { setup: "Want to hear a joke about paper?", punchline: "Never mind, it's tearable." },
    { setup: "What do you call a factory that makes okay products?", punchline: "A satisfactory!" }
];

function buildJoke() {
    const joke = jokes[Math.floor(Math.random() * jokes.length)];
    let content = `# 😂 Random Joke\n\n`;
    content += `**${joke.setup}**\n\n`;
    content += `||${joke.punchline}||\n\n`;
    content += `-# Tap the spoiler to reveal the punchline!`;
    return new ContainerBuilder()
        .setAccentColor(COLORS.FUN)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('joke')
        .setDescription('Get a random joke'),
    prefix: 'joke',
    description: 'Get a random joke',
    usage: 'joke',
    category: 'fun',
    aliases: ['dadjoke', 'tell-joke', 'pun', 'punny', 'badpun'],

    async execute(interaction) {
        const container = buildJoke();
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message) {
        const container = buildJoke();
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
