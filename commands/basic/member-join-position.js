const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { COLORS } = require('../../utils/responseBuilder');

async function buildJoinPosition(member, guild) {
    await guild.members.fetch();
    const members = Array.from(guild.members.cache.values())
        .sort((a, b) => a.joinedTimestamp - b.joinedTimestamp);

    const position = members.findIndex(m => m.id === member.id) + 1;
    const percentage = ((position / guild.memberCount) * 100).toFixed(1);

    let content = `# <:Invoice:1473039492217835550> Join Position\n\n`;
    content += `<:User:1473038971398520977> **${member.user.username}**\n\n`;
    content += `### Position\n`;
    content += `<:Caretright:1473038207221502106> **#${position}** out of **${guild.memberCount}** members\n`;
    content += `<:Trophy:1473038207221502106>Top **${percentage}%** of the server\n\n`;
    content += `### Timeline\n`;
    content += `<:Caretright:1473038207221502106> **Joined:** <t:${Math.floor(member.joinedTimestamp / 1000)}:F>\n`;
    content += `<:Caretright:1473038207221502106> **Relative:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>`;

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
        .setName('member-join-position')
        .setDescription('View a member\'s join position')
        .addUserOption(opt => opt.setName('user').setDescription('User to check')),

    prefix: 'member-join-position',
    description: 'View a member\'s join position',
    usage: 'member-join-position [@user]',
    category: 'basic',
    aliases: ['joinpos', 'joinposition'],

    async execute(interaction) {
        const user = interaction.options.getUser('user');
        const member = user ? await interaction.guild.members.fetch(user.id).catch(() => null) : interaction.member;
        if (!member) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> Could not find that member.', flags: MessageFlags.Ephemeral });
        }
        try {
            const container = await buildJoinPosition(member, interaction.guild);
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[MEMBER-JOIN-POSITION] Error:`, error);
            await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred while running this command.', flags: MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args) {
        try {
            const member = message.mentions.members.first() || message.member;
            const container = await buildJoinPosition(member, message.guild);
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[MEMBER-JOIN-POSITION] Error:`, error);
            await message.reply('<:Cancel:1473037949187657818> An error occurred while running this command.').catch(() => {});
        }
    }
};
