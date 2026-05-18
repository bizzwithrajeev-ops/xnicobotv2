const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');

const choices = ['rock', 'paper', 'scissors'];
const emojis = { rock: '🪨', paper: '<:Clipboardalt:1473039555190849598>', scissors: '✂️' };

function determineWinner(userChoice, botChoice) {
    if (userChoice === botChoice) return 'tie';
    if (
        (userChoice === 'rock' && botChoice === 'scissors') ||
        (userChoice === 'paper' && botChoice === 'rock') ||
        (userChoice === 'scissors' && botChoice === 'paper')
    ) {
        return 'win';
    }
    return 'lose';
}

function buildResult(userChoice, botChoice) {
    const result = determineWinner(userChoice, botChoice);

    let resultText, color;
    if (result === 'win') {
        resultText = '<:Present:1473038450465706076> **You Win!**';
        color = COLORS.SUCCESS;
    } else if (result === 'lose') {
        resultText = '😔 **You Lose!**';
        color = COLORS.ERROR;
    } else {
        resultText = '🤝 **It\'s a Tie!**';
        color = COLORS.WARNING;
    }

    let content = `# ✊ Rock Paper Scissors\n\n`;
    content += `### Battle\n`;
    content += `> **You:** ${emojis[userChoice]} ${userChoice.charAt(0).toUpperCase() + userChoice.slice(1)}\n`;
    content += `> **Bot:** ${emojis[botChoice]} ${botChoice.charAt(0).toUpperCase() + botChoice.slice(1)}\n\n`;
    content += `### Result\n`;
    content += `> ${resultText}`;

    return new ContainerBuilder()
        .setAccentColor(color)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Play Rock Paper Scissors against the bot')
        .addStringOption(option =>
            option.setName('choice')
                .setDescription('Your choice')
                .setRequired(true)
                .addChoices(
                    { name: '🪨 Rock', value: 'rock' },
                    { name: '📄 Paper', value: 'paper' },
                    { name: '✂️ Scissors', value: 'scissors' }
                )),

    prefix: 'rps',
    description: 'Play Rock Paper Scissors against the bot',
    usage: 'rps <rock/paper/scissors>',
    category: 'games',
    aliases: ['rockpaperscissors'],

    async execute(interaction) {
        const userChoice = interaction.options.getString('choice');
        const botChoice = choices[Math.floor(Math.random() * choices.length)];
        const container = buildResult(userChoice, botChoice);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        if (!args.length) {
            const container = buildErrorResponse(
                'No Choice Made',
                'Please choose rock, paper, or scissors!',
                '**Example:** `rps rock` or `rps scissors`'
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const userChoice = args[0].toLowerCase();
        if (!choices.includes(userChoice)) {
            const container = buildErrorResponse(
                'Invalid Choice',
                'Please choose **rock**, **paper**, or **scissors**!'
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const botChoice = choices[Math.floor(Math.random() * choices.length)];
        const container = buildResult(userChoice, botChoice);
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
