const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');

async function runCoinflip(userChoice = null) {
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const emoji = result === 'heads' ? '🪙' : '🎰';

    let title = '🪙 Coin Flip';
    let description = `The coin landed on **${result.toUpperCase()}**! ${emoji}`;
    let color = COLORS.INFO;

    if (userChoice) {
        const normalizedChoice = userChoice === 'h' ? 'heads' : userChoice === 't' ? 'tails' : userChoice;
        const won = normalizedChoice === result;
        
        if (won) {
            title = '<:Present:1473038450465706076> You Won!';
            description = `The coin landed on **${result.toUpperCase()}**!\n\nYou guessed **${normalizedChoice}** correctly! ${emoji}`;
            color = COLORS.SUCCESS;
        } else {
            title = '😔 You Lost!';
            description = `The coin landed on **${result.toUpperCase()}**!\n\nYou guessed **${normalizedChoice}**. Better luck next time!`;
            color = COLORS.ERROR;
        }
    }

    return new ContainerBuilder()
        .setAccentColor(color)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}\n\n${description}`));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Flip a coin')
        .addStringOption(option =>
            option.setName('choice')
                .setDescription('Guess heads or tails')
                .addChoices(
                    { name: 'Heads', value: 'heads' },
                    { name: 'Tails', value: 'tails' }
                )),
    prefix: 'coinflip',
    description: 'Flip a coin, optionally guess the result',
    usage: 'coinflip [heads/tails]',
    category: 'games',
    aliases: ['flip', 'cf'],

    async execute(interaction) {
        const choice = interaction.options.getString('choice');
        const container = await runCoinflip(choice);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        const userChoice = args[0]?.toLowerCase();
        
        if (userChoice && !['heads', 'tails', 'h', 't'].includes(userChoice)) {
            const container = buildErrorResponse(
                'Invalid Choice',
                'Please use `heads/h` or `tails/t`.'
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const container = await runCoinflip(userChoice);
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
