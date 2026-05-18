const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('yesno')
        .setDescription('Get a random yes or no answer')
        .addStringOption(opt =>
            opt.setName('question')
                .setDescription('Your question')
                .setRequired(false)),

    prefix: 'random-yes-no',
    description: 'Get a random yes or no answer to your question',
    usage: 'random-yes-no [question]',
    category: 'fun',
    aliases: ['yesno', 'yn', 'askyesno'],

    async execute(interaction) {
        const question = interaction.options.getString('question');
        const answer = Math.random() < 0.5 ? 'Yes' : 'No';
        const isYes = answer === 'Yes';

        let content = `# ${isYes ? '<:Checkedbox:1473038547165384804>' : '<:Cancel:1473037949187657818>'} ${answer}!\n\n`;
        if (question) {
            content = `# 🎱 Yes or No?\n\n**Question:** ${question}\n\n**Answer:** ${isYes ? '<:Checkedbox:1473038547165384804>' : '<:Cancel:1473037949187657818>'} **${answer}**`;
        }

        const container = new ContainerBuilder()
            .setAccentColor(isYes ? 0x00FF00 : 0xFF0000)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(content)
            );

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        const question = args.join(' ');
        const answer = Math.random() < 0.5 ? 'Yes' : 'No';
        const isYes = answer === 'Yes';

        let content = `# ${isYes ? '<:Checkedbox:1473038547165384804>' : '<:Cancel:1473037949187657818>'} ${answer}!\n\n`;
        if (question) {
            content = `# 🎱 Yes or No?\n\n**Question:** ${question}\n\n**Answer:** ${isYes ? '<:Checkedbox:1473038547165384804>' : '<:Cancel:1473037949187657818>'} **${answer}**`;
        }

        const container = new ContainerBuilder()
            .setAccentColor(isYes ? 0x00FF00 : 0xFF0000)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(content)
            );

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
