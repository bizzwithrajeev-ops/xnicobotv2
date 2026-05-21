const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');

async function buildOldestMemberContainer(guild) {
    await guild.members.fetch();
    const members = guild.members.cache.filter(m => !m.user.bot).sort((a, b) => a.user.createdTimestamp - b.user.createdTimestamp);
    const oldest = members.first();
    if (!oldest) return buildErrorResponse('No Members Found', 'Could not find any human members in this server.');

    const section = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# <:Clock:1473039102113878056> Oldest Account\n\n` +
                `**${oldest.user.username}**\n` +
                `${oldest.user}\n\n` +
                `<:Clock:1473039102113878056> **Account Created:** <t:${Math.floor(oldest.user.createdTimestamp / 1000)}:F>\n` +
                `<:Lightning:1473038797540298792> **Age:** <t:${Math.floor(oldest.user.createdTimestamp / 1000)}:R>\n\n` +
                `<:Caretright:1473038207221502106> **Joined Server:** <t:${Math.floor(oldest.joinedTimestamp / 1000)}:R>`
            )
        )
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: oldest.user.displayAvatarURL({ size: 256 }) } }));

    return new ContainerBuilder()
        .setAccentColor(COLORS.INFO)
        .addSectionComponents(section)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));
}

module.exports = {
    prefix: 'oldest-member',
    description: 'View the member with the oldest Discord account',
    usage: 'oldest-member',
    category: 'basic',
    aliases: ['oldestmember', 'oldmember'],

    data: new SlashCommandBuilder()
        .setName('oldest-member')
        .setDescription('View the member with the oldest Discord account'),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });
        try {
            const container = await buildOldestMemberContainer(interaction.guild);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            const err = buildErrorResponse('Error', 'Failed to fetch members.', error.message);
            await interaction.editReply({ components: [err], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async executePrefix(message) {
        try {
            const container = await buildOldestMemberContainer(message.guild);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            const err = buildErrorResponse('Error', 'Failed to fetch members.', error.message);
            await message.reply({ components: [err], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
