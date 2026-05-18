const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

const emojis = ['🍎', '🍊', '🍋', '🍇', '🍓', '🍒', '🥝', '🍑', '🍍', '🥭', '🌟', '💎', '🎯', '🎲', '🎮'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('memory')
        .setDescription('Test your memory - remember the sequence!')
        .addIntegerOption(opt =>
            opt.setName('length')
                .setDescription('Sequence length (3-10, default: 5)')
                .setMinValue(3)
                .setMaxValue(10)
                .setRequired(false)),

    prefix: 'memory',
    description: 'Test your memory - remember and repeat the emoji sequence!',
    usage: 'memory [length]',
    category: 'games',
    aliases: ['memorygame', 'sequence'],

    async execute(interaction) {
        const length = interaction.options.getInteger('length') || 5;
        await playMemory(interaction, true, length);
    },

    async executePrefix(message, args) {
        let length = parseInt(args[0]) || 5;
        length = Math.min(Math.max(length, 3), 10);
        await playMemory(message, false, length);
    }
};

async function playMemory(context, isInteraction, length) {
    const channel = context.channel;
    const authorId = isInteraction ? context.user.id : context.author.id;
    
    const sequence = [];
    for (let i = 0; i < length; i++) {
        sequence.push(emojis[Math.floor(Math.random() * emojis.length)]);
    }

    const sequenceStr = sequence.join(' ');

    const showContainer = new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# 🧠 Memory Game!\n\n` +
                `**Remember this sequence:**\n\n` +
                `${sequenceStr}\n\n` +
                `-# Memorize it... sequence will disappear in 5 seconds!`
            )
        );

    let reply;
    if (isInteraction) {
        reply = await context.reply({ components: [showContainer], flags: MessageFlags.IsComponentsV2, fetchReply: true });
    } else {
        reply = await context.reply({ components: [showContainer], flags: MessageFlags.IsComponentsV2 });
    }

    await new Promise(resolve => setTimeout(resolve, 5000));

    const hiddenContainer = new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# 🧠 Memory Game!\n\n` +
                `**Now type the sequence!**\n\n` +
                `Enter the ${length} emojis in order (separated by spaces)\n\n` +
                `-# You have 30 seconds!`
            )
        );

    if (isInteraction) {
        await context.editReply({ components: [hiddenContainer], flags: MessageFlags.IsComponentsV2 });
    } else {
        await reply.edit({ components: [hiddenContainer], flags: MessageFlags.IsComponentsV2 });
    }

    const filter = m => m.author.id === authorId;
    
    try {
        const collected = await channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });
        const response = collected.first().content.trim();
        
        const userSequence = response.split(/\s+/).filter(e => emojis.includes(e));
        
        let correct = 0;
        for (let i = 0; i < sequence.length; i++) {
            if (userSequence[i] === sequence[i]) correct++;
        }
        
        const accuracy = Math.round((correct / length) * 100);
        const perfect = correct === length;

        let rating, color;
        if (perfect) {
            rating = length >= 8 ? '<:Award:1473038391632203887> INCREDIBLE MEMORY!' : length >= 6 ? '<:Star:1473038501766369300> Perfect!' : '<:Checkedbox:1473038547165384804> Well done!';
            color = 0x00FF00;
        } else if (accuracy >= 80) {
            rating = '<:Edit:1473037903625191580> Almost there!';
            color = 0xFFA500;
        } else if (accuracy >= 50) {
            rating = '🤔 Keep practicing!';
            color = 0xFFA500;
        } else {
            rating = '<:Cancel:1473037949187657818> Try again!';
            color = 0xFF0000;
        }

        const resultContainer = new ContainerBuilder()
            .setAccentColor(color)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# ${rating}\n\n` +
                    `**Correct:** ${correct}/${length}\n` +
                    `**Accuracy:** ${accuracy}%\n\n` +
                    `**Original:** ${sequenceStr}\n` +
                    `**Your answer:** ${userSequence.join(' ') || '(no valid emojis)'}`
                )
            );
        await channel.send({ components: [resultContainer], flags: MessageFlags.IsComponentsV2 });
    } catch {
        const timeoutContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Alarm:1473039068546732214> Time's Up!\n\n` +
                    `**The sequence was:**\n${sequenceStr}`
                )
            );
        await channel.send({ components: [timeoutContainer], flags: MessageFlags.IsComponentsV2 });
    }
}
