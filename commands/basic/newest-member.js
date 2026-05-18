const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');

async function buildNewestMemberContainer(guild) {
    await guild.members.fetch();
    const members = guild.members.cache.filter(m => !m.user.bot).sort((a, b) => b.joinedTimestamp - a.joinedTimestamp);
    const newest = members.first();
    if (!newest) return buildErrorResponse('No Members Found', 'Could not find any human members in this server.');

    const section = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# <:Userplus:1473038912212435086> Newest Member\n\n` +
                `**${newest.user.username}**\n` +
                `${newest.user}\n\n` +
                `<:Clock:1473039102113878056> **Joined:** <t:${Math.floor(newest.joinedTimestamp / 1000)}:F>\n` +
                `<a:loading:1506015728871149770> **Relative:** <t:${Math.floor(newest.joinedTimestamp / 1000)}:R>\n\n` +
                `<:Caretright:1473038207221502106> **Account Created:** <t:${Math.floor(newest.user.createdTimestamp / 1000)}:R>`
            )
        )
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: newest.user.displayAvatarURL({ size: 256 }) } }));

    return new ContainerBuilder()
        .setAccentColor(COLORS.SUCCESS)
        .addSectionComponents(section)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));
}

module.exports = {
    prefix: 'newest-member',
    description: 'View the newest member in the server',
    usage: 'newest-member',
    category: 'basic',
    aliases: ['newestmember', 'newmember'],

    data: new SlashCommandBuilder()
        .setName('newest-member')
        .setDescription('View the newest member in the server'),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });
        try {
            const container = await buildNewestMemberContainer(interaction.guild);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            const err = buildErrorResponse('Error', 'Failed to fetch members.', error.message);
            await interaction.editReply({ components: [err], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async executePrefix(message) {
        try {
            const container = await buildNewestMemberContainer(message.guild);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            const err = buildErrorResponse('Error', 'Failed to fetch members.', error.message);
            await message.reply({ components: [err], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
