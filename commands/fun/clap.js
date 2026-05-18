const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');

function buildClap(text) {
    const clapped = text.split(' ').join(' 👏 ');
    let content = `# 👏 Clap Text\n\n`;
    content += `${clapped} 👏`;
    return new ContainerBuilder()
        .setAccentColor(COLORS.FUN)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clap')
        .setDescription('Add 👏 between each word')
        .addStringOption(opt =>
            opt.setName('text')
                .setDescription('The text to clap')
                .setRequired(true)),
    prefix: 'clap',
    description: 'Add 👏 between each word',
    usage: 'clap <text>',
    category: 'fun',
    aliases: ['clapback'],

    async execute(interaction) {
        const text = interaction.options.getString('text');
        const container = buildClap(text);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        const text = args.join(' ');
        if (!text) {
            const container = buildErrorResponse(
                'No Text Provided',
                'Please provide text to clap!',
                '**Example:** `clap hello world`'
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const container = buildClap(text);
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
