const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

function buildShipContainer(user1, user2) {
    const percentage = Math.floor(Math.random() * 101);
    const hearts = '💗'.repeat(Math.floor(percentage / 10));
    const broken = '💔'.repeat(10 - Math.floor(percentage / 10));

    let msg = '';
    if (percentage < 20) msg = 'Not happening... 😬';
    else if (percentage < 40) msg = 'Maybe in another life 🤷';
    else if (percentage < 60) msg = 'Could work out 🤔';
    else if (percentage < 80) msg = 'Great match! 😍';
    else msg = 'Perfect couple! 💕';

    return new ContainerBuilder()
        .setAccentColor(percentage > 50 ? 0xFF69B4 : 0x808080)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# 💘 Ship Calculator\n\n` +
                `**${user1.username}** 💕 **${user2.username}**\n\n` +
                `${hearts}${broken}\n\n` +
                `**${percentage}%** - ${msg}`
            )
        );
}

module.exports = {
    prefix: 'ship',
    description: 'Ship two users together and see their compatibility',
    usage: 'ship <@user1> <@user2>',
    category: 'fun',
    aliases: ['love', 'compatibility'],
    data: new SlashCommandBuilder()
        .setName('ship')
        .setDescription('Ship two users together')
        .addUserOption(option =>
            option.setName('user1')
                .setDescription('First user')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('user2')
                .setDescription('Second user')
                .setRequired(true)),

    async execute(interaction) {
        const user1 = interaction.options.getUser('user1');
        const user2 = interaction.options.getUser('user2');
        
        const container = buildShipContainer(user1, user2);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        const user1 = message.mentions.users.first();
        const user2 = message.mentions.users.size > 1 ? message.mentions.users.last() : null;

        if (!user1 || !user2) {
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Missing Users\n\nPlease mention two users to ship!\n\n**Usage:** \`-ship @user1 @user2\``
                    )
                );
            return message.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }

        const container = buildShipContainer(user1, user2);
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
