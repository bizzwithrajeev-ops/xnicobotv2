const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');

const FLAGS_MAP = {
    Staff: '<:Shield:1473038669831995494> Discord Staff',
    Partner: '<:Attach:1473037923979886694> Partnered Server Owner',
    Hypesquad: '<:Money:1473377877239140529> HypeSquad Events',
    BugHunterLevel1: '<:Search:1473038053219106847> Bug Hunter Level 1',
    BugHunterLevel2: '<:Search:1473038053219106847> Bug Hunter Level 2',
    HypeSquadOnlineHouse1: '<:Lightningalt:1473038679906844824> HypeSquad Bravery',
    HypeSquadOnlineHouse2: '<:Lightningalt:1473038679906844824> HypeSquad Brilliance',
    HypeSquadOnlineHouse3: '<:Heartalt:1473038488893526016> HypeSquad Balance',
    PremiumEarlySupporter: '<:Fire:1473038604812161218> Early Supporter',
    VerifiedBot: '<:Checkedbox:1473038547165384804> Verified Bot',
    VerifiedDeveloper: '<:Settings:1473037894703779851> Early Verified Bot Developer',
    CertifiedModerator: '<:Shield:1473038669831995494> Certified Moderator',
    ActiveDeveloper: '<:Settings:1473037894703779851> Active Developer',
    TeamPseudoUser: '<:Userplus:1473038912212435086> Team User',
    Spammer: '<:Infotriangle:1473038460456800459> Flagged as Spammer',
    Quarantined: '<:Commentblock:1473370739351490794> Quarantined',
    BotHTTPInteractions: '<:Bookopen:1473038576391557130> HTTP Interactions Bot',
};

function buildFlagsContainer(user, flags) {
    const container = new ContainerBuilder().setAccentColor(COLORS.INFO);

    const headerSection = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# 🏳️ User Flags`)
        )
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: user.displayAvatarURL({ size: 256 }) } }));
    container.addSectionComponents(headerSection);

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    const flagsList = flags.length > 0
        ? flags.map(flag => `> ${FLAGS_MAP[flag] || `\`${flag}\``}`).join('\n')
        : '*No flags found*';

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `**User:** ${user.username}\n` +
            `**Flags:** ${flags.length}\n\n` +
            flagsList
        )
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));

    return container;
}

module.exports = {
    prefix: 'user-flags',
    description: 'View a user\'s Discord profile badges and flags',
    usage: 'user-flags [@user]',
    category: 'basic',
    aliases: ['flags', 'userflags'],

    data: new SlashCommandBuilder()
        .setName('user-flags')
        .setDescription('View a user\'s Discord profile badges and flags')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(false)),

    async execute(interaction) {
        try {
            const user = interaction.options.getUser('user') || interaction.user;
            const fetched = await user.fetch(true);
            const flags = fetched.flags?.toArray() || [];
            const container = buildFlagsContainer(fetched, flags);
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            const err = buildErrorResponse('Error', 'Failed to fetch user flags.', error.message);
            await interaction.reply({ components: [err], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async executePrefix(message, args) {
        try {
            let user = message.mentions.users.first() || message.author;
            if (!message.mentions.users.size && args[0]) {
                user = await message.client.users.fetch(args[0]).catch(() => null);
                if (!user) {
                    const err = buildErrorResponse('User Not Found', `Could not find user with ID \`${args[0]}\`.`);
                    return message.reply({ components: [err], flags: MessageFlags.IsComponentsV2 });
                }
            }
            const fetched = await user.fetch(true);
            const flags = fetched.flags?.toArray() || [];
            const container = buildFlagsContainer(fetched, flags);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            const err = buildErrorResponse('Error', 'Failed to fetch user flags.', error.message);
            await message.reply({ components: [err], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
