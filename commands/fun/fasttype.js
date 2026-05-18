const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

const phrases = [
    'The quick brown fox jumps over the lazy dog',
    'Pack my box with five dozen liquor jugs',
    'How vexingly quick daft zebras jump',
    'Sphinx of black quartz judge my vow',
    'Two driven jocks help fax my big quiz',
    'The five boxing wizards jump quickly',
    'Jackdaws love my big sphinx of quartz',
    'Discord is the best chat platform',
    'I love playing games with friends',
    'Programming is a creative art',
    'Never gonna give you up',
    'May the force be with you',
    'Winter is coming soon',
    'To be or not to be',
    'All your base are belong to us',
    'Keep calm and carry on',
    'Just do it right now',
    'Live long and prosper'
];

const words = [
    'algorithm', 'butterfly', 'chocolate', 'developer', 'elephant',
    'fantastic', 'gorgeous', 'hamburger', 'incredible', 'javascript',
    'keyboard', 'lightning', 'microphone', 'notebook', 'orchestra',
    'pineapple', 'quantum', 'raspberry', 'strawberry', 'telescope',
    'umbrella', 'volleyball', 'watermelon', 'xylophone', 'yesterday'
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fasttype')
        .setDescription('Test your typing speed')
        .addStringOption(opt =>
            opt.setName('difficulty')
                .setDescription('Choose difficulty')
                .setRequired(false)
                .addChoices(
                    { name: 'Easy (Single Word)', value: 'easy' },
                    { name: 'Medium (Short Phrase)', value: 'medium' },
                    { name: 'Hard (Long Phrase)', value: 'hard' }
                )),

    prefix: 'fasttype',
    description: 'Test your typing speed - type the phrase as fast as you can!',
    usage: 'fasttype [easy/medium/hard]',
    category: 'games',
    aliases: ['type', 'typingtest', 'typerace', 'typinggame'],

    async execute(interaction) {
        const difficulty = interaction.options.getString('difficulty') || 'medium';
        await playFastType(interaction, true, difficulty);
    },

    async executePrefix(message, args) {
        const difficulty = ['easy', 'medium', 'hard'].includes(args[0]?.toLowerCase()) ? args[0].toLowerCase() : 'medium';
        await playFastType(message, false, difficulty);
    }
};

async function playFastType(context, isInteraction, difficulty) {
    const channel = context.channel;
    const authorId = isInteraction ? context.user.id : context.author.id;
    
    let text;
    if (difficulty === 'easy') {
        text = words[Math.floor(Math.random() * words.length)];
    } else if (difficulty === 'hard') {
        text = phrases[Math.floor(Math.random() * phrases.length)] + ' ' + 
               phrases[Math.floor(Math.random() * phrases.length)].split(' ').slice(0, 3).join(' ');
    } else {
        text = phrases[Math.floor(Math.random() * phrases.length)];
    }

    const container = new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# ⌨️ Fast Type Challenge!\n\n` +
                `**Difficulty:** ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}\n\n` +
                `Type this as fast as you can:\n\n` +
                `\`\`\`${text}\`\`\`\n` +
                `-# You have 30 seconds!`
            )
        );

    const startTime = Date.now();

    if (isInteraction) {
        await context.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } else {
        await context.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const filter = m => m.author.id === authorId;
    
    try {
        const collected = await channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });
        const response = collected.first().content;
        const endTime = Date.now();
        const timeTaken = (endTime - startTime) / 1000;

        const correctChars = [...response].filter((char, i) => char === text[i]).length;
        const accuracy = Math.round((correctChars / text.length) * 100);
        const wpm = Math.round((text.split(' ').length / timeTaken) * 60);
        const cpm = Math.round((text.length / timeTaken) * 60);

        let rating, color;
        if (response.toLowerCase() === text.toLowerCase() && accuracy >= 95) {
            if (wpm >= 80) { rating = '<:Award:1473038391632203887> LEGENDARY!'; color = 0xFFD700; }
            else if (wpm >= 60) { rating = '<:Star:1473038501766369300> Excellent!'; color = 0x00FF00; }
            else if (wpm >= 40) { rating = '<:Checkedbox:1473038547165384804> Good job!'; color = 0x00FF00; }
            else { rating = '👍 Nice try!'; color = 0x00FF00; }
        } else {
            rating = accuracy >= 80 ? '<:Edit:1473037903625191580> Almost there!' : '<:Cancel:1473037949187657818> Try again!';
            color = accuracy >= 80 ? 0xFFA500 : 0xFF0000;
        }

        const resultContainer = new ContainerBuilder()
            .setAccentColor(color)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# ${rating}\n\n` +
                    `**<:Timer:1473039056710406204> Time:** ${timeTaken.toFixed(2)}s\n` +
                    `**<:Invoice:1473039492217835550> Accuracy:** ${accuracy}%\n` +
                    `**<:Edit:1473037903625191580> WPM:** ${wpm}\n` +
                    `**⌨️ CPM:** ${cpm}\n\n` +
                    `${accuracy < 100 ? `**Your text:**\n\`${response.substring(0, 100)}${response.length > 100 ? '...' : ''}\`` : '**Perfect match!** <:Present:1473038450465706076>'}`
                )
            );
        await channel.send({ components: [resultContainer], flags: MessageFlags.IsComponentsV2 });
    } catch {
        const timeoutContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Alarm:1473039068546732214> Time's Up!\n\nYou didn't finish in time. Try again!`
                )
            );
        await channel.send({ components: [timeoutContainer], flags: MessageFlags.IsComponentsV2 });
    }
}
