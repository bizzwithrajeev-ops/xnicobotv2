const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');

function buildEmojisResponse(guild) {
    const emojis = guild.emojis.cache;
    
    if (emojis.size === 0) {
        return { error: '<:Cancel:1473037949187657818> This server has no custom emojis!' };
    }

    const animated = emojis.filter(e => e.animated);
    const staticEmojis = emojis.filter(e => !e.animated);

    const container = new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# <:Star:1473038501766369300> ${guild.name} Emojis\n\n` +
                `**Total:** ${emojis.size} | **Static:** ${staticEmojis.size} | **Animated:** ${animated.size}`
            )
        );

    if (staticEmojis.size > 0) {
        const staticList = staticEmojis.map(e => e.toString()).slice(0, 30).join(' ');
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### <:Picture:1473039568398843957> Static Emojis\n${staticList}${staticEmojis.size > 30 ? ` +${staticEmojis.size - 30} more` : ''}`
            )
        );
    }

    if (animated.size > 0) {
        const animatedList = animated.map(e => e.toString()).slice(0, 30).join(' ');
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### <:Palette:1473039029476917461> Animated Emojis\n${animatedList}${animated.size > 30 ? ` +${animated.size - 30} more` : ''}`
            )
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));

    return { container };
}

module.exports = {
    prefix: 'emojis',
    description: 'List all custom emojis in the server',
    usage: 'emojis',
    category: 'basic',
    data: new SlashCommandBuilder()
        .setName('emojis')
        .setDescription('List all custom emojis in the server'),

    async execute(interaction) {
        try {
            const result = buildEmojisResponse(interaction.guild);
            if (result.error) {
                return interaction.reply({ content: result.error, flags: MessageFlags.Ephemeral });
            }
            await interaction.reply({ components: [result.container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[EMOJIS] Error:`, error);
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
            const result = buildEmojisResponse(message.guild);
            if (result.error) {
                return message.reply(result.error);
            }
            await message.reply({ components: [result.container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[EMOJIS] Error:`, error);
            await message.reply('<:Cancel:1473037949187657818> An error occurred while running this command.').catch(() => {});
        }
    }
};
