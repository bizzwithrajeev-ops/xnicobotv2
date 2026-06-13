const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

function buildVoteResponse(client) {
    const clientId = process.env.CLIENT_ID || client.user.id;
    const voteLink = `https://top.gg/bot/${clientId}/vote`;
    
    const section = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# <:Fire:1473038604812161218> Vote for Nico!\n\n` +
                `Support **Nico** by voting on both platforms! Your vote helps us grow and improve.\n\n` +
                `<:Present:1473038450465706076> **Rewards:** Get special perks for voting!\n` +
                `<:Heart:1473038659514007616> **Support:** Your vote helps us reach more servers\n` +
                `<:Lightningalt:1473038817673085010> **Streak:** Vote daily to build your streak!`
            )
        )
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: client.user.displayAvatarURL({ size: 256 }) } }));

    const container = new ContainerBuilder()
        .addSectionComponents(section)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Vote on Top.gg')
            .setURL(voteLink)
            .setStyle(ButtonStyle.Link)
            .setEmoji('<:topgg:1473546762248523839>'),
        new ButtonBuilder()
            .setLabel('Vote on DBL')
            .setURL('https://discordbotlist.com/bots/xnico')
            .setStyle(ButtonStyle.Link)
            .setEmoji('<:Cursor:1473038064564834544>')
    );

    return { container, row };
}

module.exports = {
    prefix: 'vote',
    description: 'Get the vote link for the bot',
    usage: 'vote',
    category: 'basic',
    dmAllowed: true,
    data: new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Get the vote link for the bot'),
    
    async execute(interaction) {
        try {
            const { container, row } = buildVoteResponse(interaction.client);
            await interaction.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Vote command error:', error);
            await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred.', flags: MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message) {
        try {
            const { container, row } = buildVoteResponse(message.client);
            await message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Vote command error:', error);
            await message.reply('<:Cancel:1473037949187657818> An error occurred.');
        }
    }
};
