const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { COLORS } = require('../../utils/responseBuilder');

const TIER_PERKS = {
    0: ['50 MB upload limit', '128 Kbps audio quality'],
    1: ['100 MB upload limit', '128 Kbps audio quality', 'Custom server invite background', 'Animated server icon', '15 custom emoji slots bonus'],
    2: ['150 MB upload limit', '256 Kbps audio quality', 'Server banner', '30 custom emoji slots bonus', '1080p streaming'],
    3: ['200 MB upload limit', '384 Kbps audio quality', 'Vanity URL', '50 custom emoji slots bonus', 'Animated server banner'],
};

const BOOSTS_REQUIRED = { 1: 2, 2: 7, 3: 14 };

function buildProgressBar(current, total) {
    const filled = Math.min(10, Math.round((current / total) * 10));
    return '▓'.repeat(filled) + '░'.repeat(10 - filled);
}

function buildBoostInfoContainer(guild) {
    const tier = guild.premiumTier;
    const boostCount = guild.premiumSubscriptionCount || 0;
    const boosters = guild.members.cache.filter(m => m.premiumSince).size;

    const container = new ContainerBuilder().setAccentColor(COLORS.PINK);

    const iconUrl = guild.iconURL({ size: 256 });
    const headerSection = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# <:Lightningalt:1473038679906844824> Server Boost Info`)
        );
    if (iconUrl) {
        headerSection.setThumbnailAccessory(new ThumbnailBuilder({ media: { url: iconUrl } }));
    }
    container.addSectionComponents(headerSection);

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `**Server:** ${guild.name}\n` +
            `<:Sketch:1473038248493453352> **Boost Tier:** Level ${tier}\n` +
            `<:nitroboost:1386229297827545089> **Total Boosts:** ${boostCount}\n` +
            `<:User:1473038971398520977> **Boosters:** ${boosters}`
        )
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    const perks = (TIER_PERKS[tier] || []).map(p => `> <:Checkedbox:1473038547165384804> ${p}`).join('\n');
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**Current Perks (Tier ${tier}):**\n${perks}`)
    );

    if (tier < 3) {
        const nextTier = tier + 1;
        const remaining = Math.max(0, BOOSTS_REQUIRED[nextTier] - boostCount);
        const bar = buildProgressBar(boostCount, BOOSTS_REQUIRED[nextTier]);
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**Next Tier (Level ${nextTier}):**\n` +
                `${bar} \`${boostCount}/${BOOSTS_REQUIRED[nextTier]}\`\n` +
                `-# ${remaining} more boost${remaining !== 1 ? 's' : ''} needed`
            )
        );
    } else {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`<:Star:1473038501766369300> **Maximum tier reached!**`)
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));

    return container;
}

module.exports = {
    prefix: 'server-boost-info',
    description: 'View server boost tier, perks, and progress',
    usage: 'server-boost-info',
    category: 'basic',
    aliases: ['boostinfo', 'boost-info', 'boosttier'],

    data: new SlashCommandBuilder()
        .setName('server-boost-info')
        .setDescription('View server boost tier, perks, and progress'),

    async execute(interaction) {
        try {
            const container = buildBoostInfoContainer(interaction.guild);
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[SERVER-BOOST-INFO] Error:`, error);
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
            const container = buildBoostInfoContainer(message.guild);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[SERVER-BOOST-INFO] Error:`, error);
            await message.reply('<:Cancel:1473037949187657818> An error occurred while running this command.').catch(() => {});
        }
    }
};
