const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

function titleCase(str) {
    return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const puzzles = [
    { emojis: '🎬🦁👑', answer: 'the lion king', accepts: ['the lion king', 'lion king'] },
    { emojis: '🧊❄️👸', answer: 'frozen', accepts: ['frozen'] },
    { emojis: '🕷️🧑🕸️', answer: 'spider-man', accepts: ['spiderman', 'spider-man', 'spider man'] },
    { emojis: '⭐🔫⚔️', answer: 'star wars', accepts: ['star wars', 'starwars'] },
    { emojis: '🧙‍♂️💍🌋', answer: 'lord of the rings', accepts: ['lord of the rings', 'lotr'] },
    { emojis: '🦇🌃🦸', answer: 'batman', accepts: ['batman', 'the batman'] },
    { emojis: '🧱🏠🐷', answer: 'three little pigs', accepts: ['three little pigs', '3 little pigs', 'the three little pigs'] },
    { emojis: '🐠🔍🌊', answer: 'finding nemo', accepts: ['finding nemo', 'nemo'] },
    { emojis: '👻🔫👨‍👨‍👦', answer: 'ghostbusters', accepts: ['ghostbusters', 'ghost busters'] },
    { emojis: '🏴‍☠️⚓🗺️', answer: 'pirates of the caribbean', accepts: ['pirates of the caribbean', 'pirates'] },
    { emojis: '🦖🏝️🔬', answer: 'jurassic park', accepts: ['jurassic park', 'jurassic world'] },
    { emojis: '🧪💀☠️', answer: 'breaking bad', accepts: ['breaking bad'] },
    { emojis: '🏠⬆️🎈', answer: 'up', accepts: ['up'] },
    { emojis: '🐀👨‍🍳🇫🇷', answer: 'ratatouille', accepts: ['ratatouille'] },
    { emojis: '🚀👨‍🚀🌙', answer: 'interstellar', accepts: ['interstellar'] },
    { emojis: '🤖❤️🌱', answer: 'wall-e', accepts: ['wall-e', 'walle', 'wall e'] },
    { emojis: '🦈🌊😱', answer: 'jaws', accepts: ['jaws'] },
    { emojis: '👨‍🔬⚡🧟', answer: 'frankenstein', accepts: ['frankenstein'] },
    { emojis: '🧜‍♀️🌊🏰', answer: 'the little mermaid', accepts: ['the little mermaid', 'little mermaid'] },
    { emojis: '🐒🍌🏝️', answer: 'donkey kong', accepts: ['donkey kong'] }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('emojiguess')
        .setDescription('Guess the movie, show, or character from emoji clues!'),

    prefix: 'emojiguess',
    description: 'Guess the movie, show, or character from emoji clues!',
    usage: 'emojiguess',
    category: 'games',
    aliases: ['emojiquiz', 'emojigame', 'eg'],

    async execute(interaction) {
        await playEmojiGuess(interaction, true);
    },

    async executePrefix(message) {
        await playEmojiGuess(message, false);
    }
};

async function playEmojiGuess(context, isInteraction) {
    const channel = context.channel;
    const authorId = isInteraction ? context.user.id : context.author.id;
    const puzzle = puzzles[Math.floor(Math.random() * puzzles.length)];

    const container = new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# 🎯 Emoji Guess!\n\n` +
                `What movie, show, or character do these emojis represent?\n\n` +
                `# ${puzzle.emojis}\n\n` +
                `-# Type your answer within 30 seconds!`
            )
        );

    await context.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

    const filter = m => m.author.id === authorId;

    try {
        const collected = await channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });
        const guess = collected.first().content.toLowerCase().trim();

        if (puzzle.accepts.includes(guess)) {
            const winContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> Correct!\n\n` +
                        `${puzzle.emojis} = **${titleCase(puzzle.answer)}**!\n\n` +
                        `<:Present:1473038450465706076> You nailed it!`
                    )
                );
            await channel.send({ components: [winContainer], flags: MessageFlags.IsComponentsV2 });
        } else {
            const loseContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Not Quite!\n\n` +
                        `You guessed: **${guess}**\n` +
                        `The answer was: **${titleCase(puzzle.answer)}** ${puzzle.emojis}\n\n` +
                        `Better luck next time!`
                    )
                );
            await channel.send({ components: [loseContainer], flags: MessageFlags.IsComponentsV2 });
        }
    } catch {
        const timeoutContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Alarm:1473039068546732214> Time's Up!\n\n` +
                    `The answer was **${titleCase(puzzle.answer)}** ${puzzle.emojis}`
                )
            );
        await channel.send({ components: [timeoutContainer], flags: MessageFlags.IsComponentsV2 });
    }
}
