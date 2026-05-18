const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, ChannelType, MessageFlags } = require('discord.js');
const { COLORS } = require('../../utils/responseBuilder');

function buildChannelListContainer(guild) {
    const channels = guild.channels.cache;

    const counts = {
        text: channels.filter(c => c.type === ChannelType.GuildText).size,
        voice: channels.filter(c => c.type === ChannelType.GuildVoice).size,
        category: channels.filter(c => c.type === ChannelType.GuildCategory).size,
        announcement: channels.filter(c => c.type === ChannelType.GuildAnnouncement).size,
        stage: channels.filter(c => c.type === ChannelType.GuildStageVoice).size,
        forum: channels.filter(c => c.type === ChannelType.GuildForum).size,
        thread: channels.filter(c => [ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread].includes(c.type)).size,
    };

    const container = new ContainerBuilder().setAccentColor(COLORS.INFO);

    const iconUrl = guild.iconURL({ size: 256 });
    const headerSection = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# <:Folder:1473039340425973972> ${guild.name} — Channels`)
        );
    if (iconUrl) {
        headerSection.setThumbnailAccessory(new ThumbnailBuilder({ media: { url: iconUrl } }));
    }
    container.addSectionComponents(headerSection);

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    const lines = [
        `**Total Channels:** ${channels.size}`,
        ``,
        `<:Edit:1473037903625191580> **Text:** ${counts.text}`,
        `<:Volumeup:1473039290136002844> **Voice:** ${counts.voice}`,
        `<:Folderopen:1473039552783323348> **Categories:** ${counts.category}`,
        `<:Bullhorn:1473038903157199093> **Announcements:** ${counts.announcement}`,
        `<:Userplus:1473038912212435086> **Stage:** ${counts.stage}`,
        `<:Chat:1473038936241864865> **Forums:** ${counts.forum}`,
    ];
    if (counts.thread > 0) lines.push(`🧵 **Threads:** ${counts.thread}`);

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));

    return container;
}

module.exports = {
    prefix: 'channellist',
    description: 'View channel statistics for the server',
    usage: 'channellist',
    category: 'basic',
    aliases: ['channels', 'clist'],

    data: new SlashCommandBuilder()
        .setName('channellist')
        .setDescription('View channel statistics for the server'),

    async execute(interaction) {
        try {
            const container = buildChannelListContainer(interaction.guild);
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[CHANNELLIST] Error:`, error);
            const content = '<:Cancel:1473037949187657818> An error occurred while running this command.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content }).catch(() => {});
            } else {
                await interaction.reply({ content, ephemeral: true }).catch(() => {});
            }
        }
    },

    async executePrefix(message) {
        try {
            const container = buildChannelListContainer(message.guild);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[CHANNELLIST] Error:`, error);
            await message.reply('<:Cancel:1473037949187657818> An error occurred while running this command.').catch(() => {});
        }
    }
};
