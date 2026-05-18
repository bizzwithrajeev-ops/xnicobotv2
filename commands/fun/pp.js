const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

function buildPP(user) {
    const size = Math.floor(Math.random() * 15) + 1;
    const pp = '8' + '='.repeat(size) + 'D';
    return new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(
            new TextDisplayBuilder()
                .setContent(`# 🍆 PP Size\n\n**User:** ${user.username}\n**Size:** ${pp}\n*${size} inches*`)
        );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pp')
        .setDescription('Check PP size for a user')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('The user to check')
                .setRequired(false)),
    prefix: 'pp',
    description: 'Check PP size for a user',
    usage: 'pp [@user]',
    category: 'fun',
    aliases: ['ppsize', 'dick'],

    async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const container = buildPP(user);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message) {
        const user = message.mentions.users.first() || message.author;
        const container = buildPP(user);
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
