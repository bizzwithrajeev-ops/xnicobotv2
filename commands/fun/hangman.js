const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const words = [
    'JAVASCRIPT', 'DISCORD', 'COMPUTER', 'KEYBOARD', 'MONITOR', 'GAMING', 'PROGRAMMING',
    'DEVELOPER', 'DATABASE', 'NETWORK', 'SERVER', 'ALGORITHM', 'FUNCTION', 'VARIABLE',
    'PYTHON', 'TERMINAL', 'BROWSER', 'COMMAND', 'LIBRARY', 'PACKAGE', 'MODULE',
    'FRAMEWORK', 'INTERFACE', 'COMPONENT', 'CALLBACK', 'PROMISE', 'TEMPLATE',
    'ELEMENT', 'BOOLEAN', 'INTEGER', 'STRING', 'OBJECT', 'SYNTAX', 'METHOD'
];

const hangmanStages = [
    ['```', '  +---+', '  |   |', '      |', '      |', '      |', '      |', '=========', '```'],
    ['```', '  +---+', '  |   |', '  O   |', '      |', '      |', '      |', '=========', '```'],
    ['```', '  +---+', '  |   |', '  O   |', '  |   |', '      |', '      |', '=========', '```'],
    ['```', '  +---+', '  |   |', '  O   |', ' /|   |', '      |', '      |', '=========', '```'],
    ['```', '  +---+', '  |   |', '  O   |', ' /|\\  |', '      |', '      |', '=========', '```'],
    ['```', '  +---+', '  |   |', '  O   |', ' /|\\  |', ' /    |', '      |', '=========', '```'],
    ['```', '  +---+', '  |   |', '  O   |', ' /|\\  |', ' / \\  |', '      |', '=========', '```']
];

const games = new Map();

// Cleanup stale games every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [id, game] of games) {
        if (now - game.createdAt > 10 * 60 * 1000) games.delete(id);
    }
}, 5 * 60 * 1000);

function buildGameContainer(game, statusText = null) {
    const display = game.word.split('').map(l => game.guessed.includes(l) ? `**${l}**` : '\\_').join(' ');
    const hangman = hangmanStages[game.wrong].join('\n');
    const guessedLetters = game.guessed.length > 0 ? game.guessed.join(', ') : 'None';

    let content = `# <:Gamepad:1473039216429498409> Hangman\n\n`;
    content += `${hangman}\n\n`;
    content += `**Word:** ${display}\n`;
    content += `**Wrong Guesses:** ${game.wrong}/${game.maxWrong}\n`;
    content += `**Guessed:** ${guessedLetters}`;

    if (statusText) content += `\n\n${statusText}`;

    return content;
}

function buildLetterRows(gameId, game, disabled = false) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const rows = [];

    const buttonsPerRow = 5;

    for (let i = 0; i < letters.length; i += buttonsPerRow) {
        const row = new ActionRowBuilder();
        const chunk = letters.slice(i, i + buttonsPerRow);
        for (const letter of chunk) {
            const isGuessed = game.guessed.includes(letter);
            const isCorrect = isGuessed && game.word.includes(letter);
            const isWrong = isGuessed && !game.word.includes(letter);

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`hangman_${gameId}_${letter}`)
                    .setLabel(letter)
                    .setStyle(isCorrect ? ButtonStyle.Success : isWrong ? ButtonStyle.Danger : ButtonStyle.Secondary)
                    .setDisabled(disabled || isGuessed)
            );
        }
        rows.push(row);
    }
    return rows;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hangman')
        .setDescription('Play a game of Hangman - guess the word letter by letter!'),

    prefix: 'hangman',
    description: 'Play a game of Hangman - guess the word letter by letter!',
    usage: 'hangman',
    category: 'games',
    aliases: ['hm'],

    async execute(interaction) {
        const word = words[Math.floor(Math.random() * words.length)];
        const gameId = `${interaction.user.id}-${Date.now()}`;

        const game = {
            word,
            guessed: [],
            wrong: 0,
            maxWrong: 6,
            playerId: interaction.user.id,
            createdAt: Date.now()
        };
        games.set(gameId, game);

        const content = buildGameContainer(game, 'Click a letter to guess!');
        const rows = buildLetterRows(gameId, game);

        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
        rows.forEach(row => container.addActionRowComponents(row));

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message) {
        const word = words[Math.floor(Math.random() * words.length)];
        const gameId = `${message.author.id}-${Date.now()}`;

        const game = {
            word,
            guessed: [],
            wrong: 0,
            maxWrong: 6,
            playerId: message.author.id,
            createdAt: Date.now()
        };
        games.set(gameId, game);

        const content = buildGameContainer(game, 'Click a letter to guess!');
        const rows = buildLetterRows(gameId, game);

        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
        rows.forEach(row => container.addActionRowComponents(row));

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async handleButton(interaction) {
        const customId = interaction.customId;
        if (!customId.startsWith('hangman_')) return false;

        const lastUnderscore = customId.lastIndexOf('_');
        const letter = customId.slice(lastUnderscore + 1);
        const gameId = customId.slice(8, lastUnderscore);
        const game = games.get(gameId);

        if (!game) {
            await interaction.reply({
                components: [new ContainerBuilder().setAccentColor(0xCAD7E6).addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Game Expired\n\nThis game has expired. Start a new one with `-hangman`!')
                )],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
            return true;
        }

        if (interaction.user.id !== game.playerId) {
            await interaction.reply({
                components: [new ContainerBuilder().setAccentColor(0xCAD7E6).addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Not Your Game\n\nThis is not your game! Start your own with `-hangman`')
                )],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
            return true;
        }

        if (game.guessed.includes(letter)) {
            await interaction.deferUpdate();
            return true;
        }

        game.guessed.push(letter);
        if (!game.word.includes(letter)) game.wrong++;

        const won = game.word.split('').every(l => game.guessed.includes(l));
        const lost = game.wrong >= game.maxWrong;

        let statusText, accentColor;
        if (won) {
            statusText = `<:Award:1473038391632203887> **You Won!** The word was **${game.word}**!`;
            accentColor = 0x00FF00;
            games.delete(gameId);
        } else if (lost) {
            statusText = `<:Cancel:1473037949187657818> **Game Over!** The word was **${game.word}**`;
            accentColor = 0xFF0000;
            games.delete(gameId);
        } else {
            statusText = game.word.includes(letter)
                ? `<:Checkedbox:1473038547165384804> **${letter}** is in the word!`
                : `<:Cancel:1473037949187657818> **${letter}** is not in the word!`;
            accentColor = 0xCAD7E6;
        }

        const content = buildGameContainer(game, statusText);
        const rows = buildLetterRows(gameId, game, won || lost);
        const container = new ContainerBuilder()
            .setAccentColor(accentColor)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
        rows.forEach(row => container.addActionRowComponents(row));

        try {
            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (e) {
            if (e.code !== 10008 && e.code !== 40060) console.error('Hangman update error:', e);
        }
        return true;
    }
};
