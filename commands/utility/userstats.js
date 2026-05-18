const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');

async function buildUserStatsContainer(channel, user, member) {
    const messages = await channel.messages.fetch({ limit: 100 });
    const userMsgCount = messages.filter(m => m.author.id === user.id).size;

    const section = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# <:Bookopen:1473038576391557130> User Statistics: ${user.username}`)
        )
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: user.displayAvatarURL({ size: 256 }) } }));

    return new ContainerBuilder()
        .setAccentColor(parseInt(member.displayHexColor.replace('#', ''), 16) || 0xCAD7E6)
        .addSectionComponents(section)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**Messages (Last 100):** ${userMsgCount}\n` +
                `**Roles:** ${member.roles.cache.size}\n` +
                `**Joined Server:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>\n` +
                `**Account Created:** <t:${Math.floor(user.createdTimestamp / 1000)}:R>`
            )
        );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('userstats')
        .setDescription('View detailed user statistics')
        .addUserOption(o => o.setName('user').setDescription('User to view stats for')),

    async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id);

        try {
            const container = await buildUserStatsContainer(interaction.channel, user, member);
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            await interaction.reply({ content: '<:Cancel:1473037949187657818> Failed to fetch user statistics!', ephemeral: true });
        }
    },

    async executePrefix(message, args) {
        const user = message.mentions.users.first() || message.author;
        const member = await message.guild.members.fetch(user.id);

        try {
            const container = await buildUserStatsContainer(message.channel, user, member);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            await message.reply('<:Cancel:1473037949187657818> Failed to fetch user statistics!');
        }
    }
};
