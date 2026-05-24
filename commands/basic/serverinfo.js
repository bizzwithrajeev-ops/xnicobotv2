'use strict';

const {
    SlashCommandBuilder,
    ChannelType,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');

const VERIFICATION_LEVELS = ['None', 'Low', 'Medium', 'High', 'Very High'];
const NSFW_LEVELS = ['Default', 'Explicit', 'Safe', 'Age-Restricted'];

const E = {
    book:      '<:Bookopen:1473038576391557130>',
    folder:    '<:Folder:1473039340425973972>',
    folderOpen:'<:Folderopen:1473039552783323348>',
    user:      '<:User:1473038971398520977>',
    userPlus:  '<:Userplus:1473038912212435086>',
    shield:    '<:Shield:1473038669831995494>',
    check:     '<:Checkedbox:1473038547165384804>',
    cancel:    '<:Cancel:1473037949187657818>',
    sketch:    '<:Sketch:1473038248493453352>',
    edit:      '<:Edit:1473037903625191580>',
    volume:    '<:Volumeup:1473039290136002844>',
    star:      '<:Star:1473038501766369300>',
    caret:     '<:Caretright:1473038207221502106>',
    crown:     '<:Crown:1506010837368963142>',
    lightning: '<:Lightningalt:1473038679906844824>',
    bots:      '<:bots:1473368718120849500>',
    online:    '<:online:1485248286653943900>',
    offline:   '<:offline:1485248289690616041>',
    copy:      '<:Copy:1473039575302803629>',
    clock:     '<:Clock:1473039102113878056>',
    fire:      '<:Fire:1473038604812161218>',
};

function tsR(ms) { return ms ? `<t:${Math.floor(ms / 1000)}:R>` : '*unknown*'; }
function tsD(ms) { return ms ? `<t:${Math.floor(ms / 1000)}:D>` : '*unknown*'; }

function getOnlineCounts(guild) {
    let online = 0, idle = 0, dnd = 0, offline = 0, bots = 0;
    for (const member of guild.members.cache.values()) {
        if (member.user.bot) bots++;
        const status = member.presence?.status || 'offline';
        if (status === 'online') online++;
        else if (status === 'idle') idle++;
        else if (status === 'dnd') dnd++;
        else offline++;
    }
    return { online, idle, dnd, offline, bots };
}

async function buildServerInfo(guild) {
    const owner = await guild.fetchOwner().catch(() => null);
    const channels = guild.channels.cache;

    const textChannels    = channels.filter(c => c.type === ChannelType.GuildText).size;
    const voiceChannels   = channels.filter(c => c.type === ChannelType.GuildVoice).size;
    const stageChannels   = channels.filter(c => c.type === ChannelType.GuildStageVoice).size;
    const forumChannels   = channels.filter(c => c.type === ChannelType.GuildForum).size;
    const categories      = channels.filter(c => c.type === ChannelType.GuildCategory).size;
    const announcement    = channels.filter(c => c.type === ChannelType.GuildAnnouncement).size;

    const counts = getOnlineCounts(guild);
    const humans = guild.memberCount - counts.bots;

    const container = new ContainerBuilder().setAccentColor(0xCAD7E6);

    // Header
    const headerText =
        `# ${guild.name}` +
        (guild.partnered ? ` ${E.lightning}` : '') +
        (guild.verified ? ` ${E.check}` : '') +
        (guild.description ? `\n-# ${guild.description}` : '');

    if (guild.iconURL()) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
                .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: guild.iconURL({ size: 512 }) } }))
        );
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // General
    const ownerLine = owner
        ? `${owner.user.username} (<@${owner.id}>)`
        : `<@${guild.ownerId}>`;

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `### ${E.book} General\n` +
        `${E.copy} **ID:** \`${guild.id}\`\n` +
        `${E.crown} **Owner:** ${ownerLine}\n` +
        `${E.clock} **Created:** ${tsD(guild.createdTimestamp)} (${tsR(guild.createdTimestamp)})\n` +
        `${E.shield} **Verification:** ${VERIFICATION_LEVELS[guild.verificationLevel] || 'Unknown'}\n` +
        `${E.lightning} **Filter:** ${NSFW_LEVELS[guild.nsfwLevel] || 'Unknown'}` +
        (guild.preferredLocale ? `\n${E.caret} **Locale:** \`${guild.preferredLocale}\`` : '')
    ));

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // Members
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `### ${E.user} Members · ${guild.memberCount.toLocaleString()}\n` +
        `${E.userPlus} **Humans:** ${humans.toLocaleString()}  ·  ${E.bots} **Bots:** ${counts.bots.toLocaleString()}\n` +
        `${E.online} **${counts.online.toLocaleString()}**  ·  <:idle:1473370064718827715> **${counts.idle.toLocaleString()}**  ·  <:dnd:1485248263857639424> **${counts.dnd.toLocaleString()}**  ·  ${E.offline} **${counts.offline.toLocaleString()}**`
    ));

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // Channels
    let chBody = `### ${E.folder} Channels · ${channels.size.toLocaleString()}\n`;
    chBody += `${E.edit} **Text:** ${textChannels}  ·  ${E.volume} **Voice:** ${voiceChannels}  ·  ${E.folderOpen} **Categories:** ${categories}`;
    if (announcement || stageChannels || forumChannels) {
        const extras = [];
        if (announcement)   extras.push(`<:Bullhorn:1473038903157199093> **Announce:** ${announcement}`);
        if (stageChannels)  extras.push(`<:Microphone:1473039293088927996> **Stage:** ${stageChannels}`);
        if (forumChannels)  extras.push(`<:Document:1473039496995143731> **Forum:** ${forumChannels}`);
        chBody += `\n${extras.join('  ·  ')}`;
    }
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(chBody));

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // Roles + customization
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `### ${E.userPlus} Roles & Customization\n` +
        `${E.userPlus} **Roles:** ${guild.roles.cache.size}  ·  ${E.star} **Emojis:** ${guild.emojis.cache.size}  ·  ${E.caret} **Stickers:** ${guild.stickers.cache.size}\n` +
        `${E.sketch} **Boost tier:** ${guild.premiumTier} (${guild.premiumSubscriptionCount || 0} boosts)` +
        (guild.vanityURLCode ? `\n${E.lightning} **Vanity:** \`/${guild.vanityURLCode}\`` : '')
    ));

    // Features
    if (guild.features.length > 0) {
        const features = guild.features
            .slice(0, 8)
            .map(f => `\`${f.replace(/_/g, ' ').toLowerCase()}\``)
            .join(' · ');
        const more = guild.features.length > 8 ? ` +${guild.features.length - 8} more` : '';
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### ${E.fire} Features\n${features}${more}`
        ));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));

    // Action row — links to icon / banner / splash if available
    const row = new ActionRowBuilder();
    if (guild.iconURL()) {
        row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Icon').setEmoji(E.folder).setURL(guild.iconURL({ size: 4096 })));
    }
    if (guild.bannerURL?.()) {
        row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Banner').setEmoji(E.fire).setURL(guild.bannerURL({ size: 4096 })));
    }
    if (guild.splashURL?.()) {
        row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Splash').setEmoji(E.lightning).setURL(guild.splashURL({ size: 4096 })));
    }

    return { container, row: row.components.length > 0 ? row : null };
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
            const { container, row } = await buildServerInfo(interaction.guild);
            const components = row ? [container, row] : [container];
            await interaction.reply({ components, flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[SERVERINFO] Error:', error);
            const content = '<:Cancel:1473037949187657818> An error occurred while running this command.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content }).catch(() => {});
            } else {
                await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    async executePrefix(message) {
        try {
            const { container, row } = await buildServerInfo(message.guild);
            const components = row ? [container, row] : [container];
            await message.reply({ components, flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[SERVERINFO] Error:', error);
            await message.reply('<:Cancel:1473037949187657818> An error occurred while running this command.').catch(() => {});
        }
    },
};
