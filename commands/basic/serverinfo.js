const { SlashCommandBuilder, ChannelType, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');

const VERIFICATION_LEVELS = {
    0: 'None',
    1: 'Low',
    2: 'Medium',
    3: 'High',
    4: 'Very High'
};

async function buildServerInfo(guild) {
    const owner = await guild.fetchOwner();
    const channels = guild.channels.cache;
    
    const textChannels = channels.filter(c => c.type === ChannelType.GuildText).size;
    const voiceChannels = channels.filter(c => c.type === ChannelType.GuildVoice).size;
    const categories = channels.filter(c => c.type === ChannelType.GuildCategory).size;

    const container = new ContainerBuilder()
        .setAccentColor(0xCAD7E6);

    if (guild.iconURL()) {
        const headerSection = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`# ${guild.name}${guild.description ? `\n-# ${guild.description}` : ''}`)
            )
            .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: guild.iconURL({ size: 512 }) } }));
        container.addSectionComponents(headerSection);
    } else {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# ${guild.name}${guild.description ? `\n-# ${guild.description}` : ''}`)
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `### <:Bookopen:1473038576391557130> General\n` +
            `> <:Folder:1473039340425973972> **ID:** \`${guild.id}\`\n` +
            `> <:User:1473038971398520977> **Owner:** ${owner.user.username}\n` +
            `> <:Shield:1473038669831995494> **Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:D> (<t:${Math.floor(guild.createdTimestamp / 1000)}:R>)\n` +
            `> <:Checkedbox:1473038547165384804> **Verification:** ${VERIFICATION_LEVELS[guild.verificationLevel]}`
        )
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `### <:User:1473038971398520977> Members\n` +
            `> <:User:1473038971398520977> **Total:** ${guild.memberCount.toLocaleString()}\n` +
            `> <:Sketch:1473038248493453352> **Boost Level:** ${guild.premiumTier} · **Boosts:** ${guild.premiumSubscriptionCount || 0}`
        )
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `### <:Folder:1473039340425973972> Channels\n` +
            `> <:Edit:1473037903625191580> **Text:** ${textChannels} · <:Volumeup:1473039290136002844> **Voice:** ${voiceChannels} · <:Folderopen:1473039552783323348> **Categories:** ${categories}\n` +
            `> <:Userplus:1473038912212435086> **Roles:** ${guild.roles.cache.size} · <:Star:1473038501766369300> **Emojis:** ${guild.emojis.cache.size} · <:Caretright:1473038207221502106> **Stickers:** ${guild.stickers.cache.size}`
        )
    );

    if (guild.features.length > 0) {
        const features = guild.features.slice(0, 6).map(f => `\`${f.replace(/_/g, ' ').toLowerCase()}\``).join(' ');
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### <:Lightningalt:1473038679906844824> Features\n> ${features}${guild.features.length > 6 ? ` +${guild.features.length - 6} more` : ''}`)
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));

    return container;
}

module.exports = {
    prefix: 'serverinfo',
    description: 'Display detailed server information',
    usage: 'serverinfo',
    category: 'basic',
    aliases: ['si', 'server', 'guild', 'server-age', 'serverage'],
    
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Display detailed server information'),

    async execute(interaction) {
        try {
            const container = await buildServerInfo(interaction.guild);
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[SERVERINFO] Error:`, error);
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
            const container = await buildServerInfo(message.guild);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[SERVERINFO] Error:`, error);
            await message.reply('<:Cancel:1473037949187657818> An error occurred while running this command.').catch(() => {});
        }
    }
};
