const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('Play Russian roulette - will you survive?'),

    prefix: 'roulette',
    description: 'Play Russian roulette - test your luck with a 1 in 6 chance!',
    usage: 'roulette',
    category: 'games',
    aliases: ['russianroulette'],

    async execute(interaction) {
        await playRoulette(interaction, true);
    },

    async executePrefix(message) {
        await playRoulette(message, false);
    }
};

async function playRoulette(context, isInteraction) {
    const chamber = Math.floor(Math.random() * 6) + 1;
    const bullet = Math.floor(Math.random() * 6) + 1;
    const died = chamber === bullet;

    const container = new ContainerBuilder()
        .setAccentColor(died ? 0xFF0000 : 0x00FF00)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                died
                    ? `# 💀 BANG!\n\n` +
                      `You pulled the trigger on chamber **${chamber}**...\n` +
                      `The bullet was in chamber **${bullet}**!\n\n` +
                      `💥 **You died!**`
                    : `# <:Checkedbox:1473038547165384804> Click...\n\n` +
                      `You pulled the trigger on chamber **${chamber}**...\n` +
                      `The bullet was in chamber **${bullet}**!\n\n` +
                      `😅 **You survived!**`
            )
        );

    if (isInteraction) {
        await context.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } else {
        await context.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
}
