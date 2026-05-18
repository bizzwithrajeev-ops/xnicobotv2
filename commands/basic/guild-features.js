const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');

const featureEmojis = {
    'ANIMATED_BANNER': '<:Palette:1473039029476917461>',
    'ANIMATED_ICON': '<:Palette:1473039029476917461>',
    'BANNER': '<:Picture:1473039568398843957>',
    'COMMUNITY': '<:Userplus:1473038912212435086>',
    'DISCOVERABLE': '<:Search:1473038053219106847>',
    'INVITE_SPLASH': '<:Picture:1473039568398843957>',
    'MEMBER_VERIFICATION_GATE_ENABLED': '<:Checkedbox:1473038547165384804>',
    'MONETIZATION_ENABLED': '<:Invoice:1473039492217835550>',
    'MORE_STICKERS': '<:Edit:1473037903625191580>',
    'NEWS': '<:Bullhorn:1473038903157199093>',
    'PARTNERED': '<:Attach:1473037923979886694>',
    'PREVIEW_ENABLED': '<:Eye:1473038435056095242>',
    'ROLE_ICONS': '<:Userplus:1473038912212435086>',
    'VANITY_URL': '<:Attach:1473037923979886694>',
    'VERIFIED': '<:Checkedbox:1473038547165384804>',
    'VIP_REGIONS': '<:Star:1473038501766369300>',
    'WELCOME_SCREEN_ENABLED': '<:Userplus:1473038912212435086>'
};

function buildGuildFeatures(guild) {
    const features = guild.features.length > 0 
        ? guild.features.map(f => {
            const emoji = featureEmojis[f] || '<:Star:1473038501766369300>';
            const name = f.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
            return `> ${emoji} ${name}`;
        }).join('\n')
        : '> *No special features enabled*';

    let content = `# 🌟 Server Features\n\n`;
    content += `**Server:** ${guild.name}\n`;
    content += `**Feature Count:** ${guild.features.length}\n`;
    content += `**Boost Level:** ${guild.premiumTier}\n\n`;
    content += `### Enabled Features\n`;
    content += features;

    const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

    if (guild.iconURL()) {
        section.setThumbnailAccessory(new ThumbnailBuilder({ media: { url: guild.iconURL({ size: 256 }) } }));
    }

    return new ContainerBuilder()
        .setAccentColor(COLORS.INFO)
        .addSectionComponents(section)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guild-features')
        .setDescription('View server features and perks'),

    prefix: 'guild-features',
    description: 'View server features and perks',
    usage: 'guild-features',
    category: 'basic',
    aliases: ['features', 'serverfeatures'],

    async execute(interaction) {
        try {
            const container = buildGuildFeatures(interaction.guild);
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            const container = buildErrorResponse('Error', 'Failed to fetch server features.', error.message);
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async executePrefix(message) {
        try {
            const container = buildGuildFeatures(message.guild);
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            const container = buildErrorResponse('Error', 'Failed to fetch server features.', error.message);
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
