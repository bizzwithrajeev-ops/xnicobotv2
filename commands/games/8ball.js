const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse, buildInvalidUsage, COLORS } = require('../../utils/responseBuilder');

const responses = [
    { text: 'Yes, definitely!', type: 'positive' },
    { text: 'It is certain.', type: 'positive' },
    { text: 'Without a doubt.', type: 'positive' },
    { text: 'Yes - definitely.', type: 'positive' },
    { text: 'You may rely on it.', type: 'positive' },
    { text: 'As I see it, yes.', type: 'positive' },
    { text: 'Most likely.', type: 'positive' },
    { text: 'Outlook good.', type: 'positive' },
    { text: 'Signs point to yes.', type: 'positive' },
    { text: 'Reply hazy, try again.', type: 'neutral' },
    { text: 'Ask again later.', type: 'neutral' },
    { text: 'Better not tell you now.', type: 'neutral' },
    { text: 'Cannot predict now.', type: 'neutral' },
    { text: 'Concentrate and ask again.', type: 'neutral' },
    { text: "Don't count on it.", type: 'negative' },
    { text: 'My reply is no.', type: 'negative' },
    { text: 'My sources say no.', type: 'negative' },
    { text: 'Outlook not so good.', type: 'negative' },
    { text: 'Very doubtful.', type: 'negative' },
    { text: 'Absolutely not!', type: 'negative' }
];

const typeColors = {
    positive: COLORS.SUCCESS,
    neutral: COLORS.WARNING,
    negative: COLORS.ERROR
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Ask the magic 8-ball a question')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('Your question for the 8-ball')
                .setRequired(true)),
    
    prefix: '8ball',
    description: 'Ask the magic 8-ball a question',
    usage: '8ball <question>',
    category: 'games',
    aliases: ['8b', 'ball', 'magic', 'ask'],

    async execute(interaction) {
        const question = interaction.options.getString('question');
        const response = responses[Math.floor(Math.random() * responses.length)];
        
        let content = `# 🎱 Magic 8-Ball\n\n`;
        content += `**Question:** ${question}\n\n`;
        content += `### 🔮 Answer\n`;
        content += `> ${response.text}\n\n`;
        content += `-# xNico </>`;

        const container = new ContainerBuilder()
            .setAccentColor(typeColors[response.type])
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        if (!args.length) {
            const container = buildInvalidUsage(
                '8ball',
                '-8ball <question>',
                ['-8ball Will I be lucky today?', '-8ball Should I do this?']
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const question = args.join(' ');
        const response = responses[Math.floor(Math.random() * responses.length)];
        
        let content = `# 🎱 Magic 8-Ball\n\n`;
        content += `**Question:** ${question}\n\n`;
        content += `### 🔮 Answer\n`;
        content += `> ${response.text}\n\n`;
        content += `-# xNico </>`;

        const container = new ContainerBuilder()
            .setAccentColor(typeColors[response.type])
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
