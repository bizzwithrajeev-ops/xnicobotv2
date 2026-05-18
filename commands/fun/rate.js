const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');

function buildRating(thing) {
    const rating = Math.floor(Math.random() * 11);
    const emojis = ['😢', '😕', '😐', '🙂', '😊', '😃', '😍', '🤩', '<:Star:1473038501766369300>', '💯', '<:Fire:1473038604812161218>'];
    const emoji = emojis[rating];
    const descriptions = [
        'Absolutely terrible!', 'Very bad', 'Not good', 'Below average',
        'Okay I guess', 'Average', 'Pretty decent', 'Good stuff!',
        'Really great!', 'Almost perfect!', 'Absolutely perfect! <:Present:1473038450465706076>'
    ];
    const progressBar = '█'.repeat(rating) + '░'.repeat(10 - rating);
    let content = `# <:Star:1473038501766369300> Rating\n\n`;
    content += `**Subject:** ${thing}\n\n`;
    content += `### Score\n`;
    content += `> **${rating}/10** ${emoji}\n`;
    content += `> \`${progressBar}\`\n\n`;
    content += `*${descriptions[rating]}*`;
    return new ContainerBuilder()
        .setAccentColor(rating >= 7 ? COLORS.SUCCESS : rating >= 4 ? COLORS.WARNING : COLORS.ERROR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rate')
        .setDescription('Rate anything from 0 to 10')
        .addStringOption(opt =>
            opt.setName('thing')
                .setDescription('The thing to rate')
                .setRequired(true)),
    prefix: 'rate',
    description: 'Rate anything from 0 to 10',
    usage: 'rate <thing>',
    category: 'fun',
    aliases: ['rating'],

    async execute(interaction) {
        const thing = interaction.options.getString('thing');
        const container = buildRating(thing);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        const thing = args.join(' ');
        if (!thing) {
            const container = buildErrorResponse(
                'Nothing to Rate',
                'Please provide something to rate!',
                '**Example:** `rate pizza`'
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const container = buildRating(thing);
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
