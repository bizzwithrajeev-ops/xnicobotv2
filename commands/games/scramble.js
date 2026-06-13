const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

const words = [
    'discord', 'computer', 'javascript', 'programming', 'developer', 'keyboard', 'monitor',
    'algorithm', 'database', 'framework', 'software', 'hardware', 'network', 'internet',
    'technology', 'application', 'interface', 'graphics', 'processor', 'memory',
    'chocolate', 'adventure', 'butterfly', 'discovery', 'fantastic', 'wonderful'
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('scramble')
        .setDescription('Unscramble the word to win!'),

    prefix: 'scramble',
    description: 'Unscramble the word to win - solve the word puzzle!',
    usage: 'scramble',
    category: 'games',
    aliases: ['unscramble', 'wordscramble'],

    async execute(interaction) {
        await playScramble(interaction, true);
    },

    async executePrefix(message) {
        await playScramble(message, false);
    }
};

async function playScramble(context, isInteraction) {
    const channel = context.channel;
    const authorId = isInteraction ? context.user.id : context.author.id;
    
    const word = words[Math.floor(Math.random() * words.length)];
    let scrambled = word.split('').sort(() => Math.random() - 0.5).join('');
    
    while (scrambled === word) {
        scrambled = word.split('').sort(() => Math.random() - 0.5).join('');
    }

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# 🔤 Word Scramble!\n\n` +
                `Unscramble this word:\n\n` +
                `# \`${scrambled.toUpperCase()}\`\n\n` +
                `-# Type your answer within 30 seconds!`
            )
        );

    if (isInteraction) {
        await context.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } else {
        await context.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const filter = m => m.author.id === authorId;
    
    try {
        const collected = await channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });
        const guess = collected.first().content.toLowerCase().trim();

        if (guess === word) {
            const winContainer = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> Correct!\n\n` +
                        `The word was **${word.toUpperCase()}**!\n\n` +
                        `<:Present:1473038450465706076> Great job solving it!`
                    )
                );
            await channel.send({ components: [winContainer], flags: MessageFlags.IsComponentsV2 });
        } else {
            const loseContainer = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Wrong!\n\n` +
                        `You guessed: **${guess.toUpperCase()}**\n` +
                        `The word was: **${word.toUpperCase()}**\n\n` +
                        `Better luck next time!`
                    )
                );
            await channel.send({ components: [loseContainer], flags: MessageFlags.IsComponentsV2 });
        }
    } catch {
        const timeoutContainer = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Alarm:1473039068546732214> Time's Up!\n\n` +
                    `The word was **${word.toUpperCase()}**!`
                )
            );
        await channel.send({ components: [timeoutContainer], flags: MessageFlags.IsComponentsV2 });
    }
}
