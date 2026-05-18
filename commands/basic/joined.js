const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { COLORS } = require('../../utils/responseBuilder');

function buildJoined(member) {
    const joinedAt = Math.floor(member.joinedTimestamp / 1000);
    const createdAt = Math.floor(member.user.createdTimestamp / 1000);

    let content = `# <:Bookopen:1473038576391557130> Join Date\n\n`;
    content += `<:User:1473038971398520977> **Member:** ${member.user.username}\n\n`;
    content += `### Server Join\n`;
    content += `<:Caretright:1473038207221502106> <t:${joinedAt}:F>\n`;
    content += `<:Caretright:1473038207221502106> <t:${joinedAt}:R>\n\n`;
    content += `### Account Created\n`;
    content += `<:Caretright:1473038207221502106> <t:${createdAt}:F>\n`;
    content += `<:Caretright:1473038207221502106> <t:${createdAt}:R>`;

    const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: member.user.displayAvatarURL({ size: 256 }) } }));

    return new ContainerBuilder()
        .setAccentColor(member.displayColor || COLORS.INFO)
        .addSectionComponents(section)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('joined')
        .setDescription('View when a member joined the server')
        .addUserOption(opt => opt.setName('user').setDescription('User to check')),

    prefix: 'joined',
    description: 'View when a member joined the server',
    usage: 'joined [@user]',
    category: 'basic',
    aliases: ['joindate', 'whenjoined'],

    async execute(interaction) {
        const user = interaction.options.getUser('user');
        const member = user ? await interaction.guild.members.fetch(user.id).catch(() => null) : interaction.member;
        if (!member) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> Could not find that member.', flags: MessageFlags.Ephemeral });
        }
        const container = buildJoined(member);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        try {
            const member = message.mentions.members.first() || message.member;
            const container = buildJoined(member);
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[JOINED] Error:`, error);
            await message.reply('<:Cancel:1473037949187657818> An error occurred while running this command.').catch(() => {});
        }
    }
};
