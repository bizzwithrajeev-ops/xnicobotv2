const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');

function buildBoostersContainer(guild) {
    const boosters = guild.members.cache.filter(member => member.premiumSince);
    
    if (boosters.size === 0) {
        return { error: '<:Cancel:1473037949187657818> This server has no boosters yet!' };
    }

    const boosterList = [...boosters
        .sort((a, b) => a.premiumSince - b.premiumSince)
        .values()]
        .map((member, i) => {
            const boostingSince = `<t:${Math.floor(member.premiumSince.getTime() / 1000)}:R>`;
            return `> \`${String(i + 1).padStart(2, ' ')}\` <:Sketch:1473038248493453352> **${member.user.username}** — ${boostingSince}`;
        })
        .slice(0, 15)
        .join('\n');

    const iconUrl = guild.iconURL({ size: 256 });
    
    const headerSection = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# <:Sketch:1473038248493453352> ${guild.name} Boosters`)
        );

    if (iconUrl) {
        headerSection.setThumbnailAccessory(new ThumbnailBuilder({ media: { url: iconUrl } }));
    }

    const container = new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addSectionComponents(headerSection)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `> <:User:1473038971398520977> **Boosters:** ${boosters.size} · <:nitroboost:1386229297827545089> **Level:** ${guild.premiumTier} · <:Sketch:1473038248493453352> **Boosts:** ${guild.premiumSubscriptionCount || 0}`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `${boosterList}${boosters.size > 15 ? `\n-# +${boosters.size - 15} more` : ''}`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));

    return { container };
}

module.exports = {
    prefix: 'boosters',
    description: 'List all server boosters',
    usage: 'boosters',
    category: 'basic',
    data: new SlashCommandBuilder()
        .setName('boosters')
        .setDescription('List all server boosters'),

    async execute(interaction) {
        try {
            const result = buildBoostersContainer(interaction.guild);
            if (result.error) {
                return interaction.reply({ content: result.error, ephemeral: true });
            }
            await interaction.reply({ components: [result.container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[BOOSTERS] Error:`, error);
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
            const result = buildBoostersContainer(message.guild);
            if (result.error) {
                return message.reply(result.error);
            }
            await message.reply({ components: [result.container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[BOOSTERS] Error:`, error);
            await message.reply('<:Cancel:1473037949187657818> An error occurred while running this command.').catch(() => {});
        }
    }
};
