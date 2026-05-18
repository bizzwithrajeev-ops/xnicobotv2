const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

const activeGames = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wordchain')
        .setDescription('Start a word chain game - each word must start with the last letter of the previous word'),

    prefix: 'wordchain',
    description: 'Start a word chain game - each word must start with the last letter of the previous word',
    usage: 'wordchain',
    category: 'games',
    aliases: ['shiritori', 'chain'],

    async execute(interaction) {
        await playWordChain(interaction, true);
    },

    async executePrefix(message) {
        await playWordChain(message, false);
    }
};

async function playWordChain(context, isInteraction) {
    const channel = context.channel;
    const authorId = isInteraction ? context.user.id : context.author.id;
    const authorName = isInteraction ? context.user.username : context.author.username;

    if (activeGames.has(channel.id)) {
        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Cancel:1473037949187657818> Game In Progress\n\nA word chain game is already active in this channel!`
                )
            );
        if (isInteraction) {
            await context.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } else {
            await context.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        return;
    }

    const startWords = ['apple', 'elephant', 'house', 'table', 'ocean', 'river', 'mountain', 'star', 'game', 'music'];
    const startWord = startWords[Math.floor(Math.random() * startWords.length)];
    const lastLetter = startWord.slice(-1).toLowerCase();

    activeGames.set(channel.id, {
        usedWords: new Set([startWord.toLowerCase()]),
        currentLetter: lastLetter,
        lastPlayer: null,
        score: 0,
        startTime: Date.now()
    });

    const container = new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# <:Attach:1473037923979886694> Word Chain Game!\n\n` +
                `**Started by:** ${authorName}\n\n` +
                `**Rules:**\n` +
                `> 1. Say a word that starts with the last letter of the previous word\n` +
                `> 2. No repeated words\n` +
                `> 3. English words only\n` +
                `> 4. Type \`stop\` to end the game\n\n` +
                `**Starting word:** \`${startWord}\`\n\n` +
                `Next word must start with: **${lastLetter.toUpperCase()}**\n\n` +
                `-# Game will end after 60 seconds of inactivity`
            )
        );

    if (isInteraction) {
        await context.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } else {
        await context.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const filter = m => !m.author.bot;
    const collector = channel.createMessageCollector({ filter, time: 60000, idle: 60000 });

    collector.on('collect', async (msg) => {
        const game = activeGames.get(channel.id);
        if (!game) return collector.stop();

        const word = msg.content.toLowerCase().trim();

        if (word === 'stop') {
            collector.stop('manual');
            return;
        }

        if (!/^[a-z]+$/.test(word)) return;

        if (word[0] !== game.currentLetter) {
            await msg.react('<:Cancel:1473037949187657818>');
            return;
        }

        if (game.usedWords.has(word)) {
            await msg.react('<:History:1473037847568318605>');
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**${word}** was already used! Try another word starting with **${game.currentLetter.toUpperCase()}**`)
                );
            await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
            return;
        }

        if (word.length < 2) return;

        game.usedWords.add(word);
        game.currentLetter = word.slice(-1);
        game.lastPlayer = msg.author.id;
        game.score++;

        await msg.react('<:Checkedbox:1473038547165384804>');

        collector.resetTimer();
    });

    collector.on('end', async (collected, reason) => {
        const game = activeGames.get(channel.id);
        activeGames.delete(channel.id);

        if (!game) return;

        const duration = Math.floor((Date.now() - game.startTime) / 1000);

        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# 🏁 Word Chain Ended!\n\n` +
                    `**Total Words:** ${game.score}\n` +
                    `**Duration:** ${duration}s\n` +
                    `**Last Word:** ${[...game.usedWords].pop()}\n\n` +
                    `${reason === 'manual' ? 'Game stopped by player!' : 'Time ran out!'}`
                )
            );
        await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    });
}
