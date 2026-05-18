const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('numguess')
        .setDescription('Guess a number between 1 and 100')
        .addIntegerOption(opt =>
            opt.setName('max')
                .setDescription('Maximum number (default: 100)')
                .setMinValue(10)
                .setMaxValue(1000)
                .setRequired(false)),

    prefix: 'numguess',
    description: 'Guess a number between 1 and 100 - test your guessing skills!',
    usage: 'numguess [max]',
    category: 'games',
    aliases: ['guess', 'guessnumber'],

    async execute(interaction) {
        const max = interaction.options.getInteger('max') || 100;
        await playGuess(interaction, true, max);
    },

    async executePrefix(message, args) {
        const max = parseInt(args[0]) || 100;
        await playGuess(message, false, Math.min(Math.max(max, 10), 1000));
    }
};

async function playGuess(context, isInteraction, max) {
    const channel = context.channel;
    const authorId = isInteraction ? context.user.id : context.author.id;
    const secretNumber = Math.floor(Math.random() * max) + 1;
    const maxAttempts = Math.ceil(Math.log2(max)) + 1;
    let attempts = 0;

    const container = new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# <:Bookmark:1473038643492028517> Number Guessing Game!\n\n` +
                `I'm thinking of a number between **1** and **${max}**\n\n` +
                `You have **${maxAttempts} attempts** to guess it!\n\n` +
                `-# Type your guess in chat`
            )
        );

    if (isInteraction) {
        await context.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } else {
        await context.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const filter = m => m.author.id === authorId && !isNaN(parseInt(m.content));
    const collector = channel.createMessageCollector({ filter, time: 60000 });

    collector.on('collect', async (msg) => {
        const guess = parseInt(msg.content);
        attempts++;

        if (guess === secretNumber) {
            const winContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Present:1473038450465706076> Correct!\n\n` +
                        `The number was **${secretNumber}**!\n` +
                        `You got it in **${attempts}** attempt${attempts === 1 ? '' : 's'}!\n\n` +
                        `${attempts === 1 ? '<:Award:1473038391632203887> **PERFECT!** First try!' : attempts <= 3 ? '<:Star:1473038501766369300> Great job!' : '<:Checkedbox:1473038547165384804> Well done!'}`
                    )
                );
            await channel.send({ components: [winContainer], flags: MessageFlags.IsComponentsV2 });
            collector.stop('won');
            return;
        }

        if (attempts >= maxAttempts) {
            const loseContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# 😢 Game Over!\n\n` +
                        `You've used all **${maxAttempts}** attempts!\n` +
                        `The number was **${secretNumber}**\n\n` +
                        `Better luck next time!`
                    )
                );
            await channel.send({ components: [loseContainer], flags: MessageFlags.IsComponentsV2 });
            collector.stop('lost');
            return;
        }

        const hint = guess < secretNumber ? '📈 Higher!' : '📉 Lower!';
        const remaining = maxAttempts - attempts;

        const hintContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `${hint}\n\n` +
                    `**${remaining}** attempt${remaining === 1 ? '' : 's'} remaining`
                )
            );
        await channel.send({ components: [hintContainer], flags: MessageFlags.IsComponentsV2 });
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            const timeoutContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Alarm:1473039068546732214> Time's Up!\n\nThe number was **${secretNumber}**`
                    )
                );
            await channel.send({ components: [timeoutContainer], flags: MessageFlags.IsComponentsV2 });
        }
    });
}
