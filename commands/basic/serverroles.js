const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');

function buildRolesResponse(guild) {
    const roles = guild.roles.cache
        .sort((a, b) => b.position - a.position)
        .filter(role => role.id !== guild.id);

    const rolesList = roles.map(role => `${role}`).slice(0, 40);
    const hasMore = roles.size > 40;

    const iconUrl = guild.iconURL({ size: 256 });
    
    const container = new ContainerBuilder()
        .setAccentColor(0xCAD7E6);

    if (iconUrl) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# <:Bookopen:1473038576391557130> Roles in ${guild.name}`)
                )
                .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: iconUrl } }))
        );
    } else {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# <:Bookopen:1473038576391557130> Roles in ${guild.name}`)
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `<:Invoice:1473039492217835550> **Total Roles:** ${roles.size} | <:Award:1473038391632203887> **Highest:** ${guild.roles.highest}\n\n` +
            (rolesList.join(' ') || 'No roles found') +
            (hasMore ? `\n\n*+${roles.size - 40} more roles*` : '')
        )
    );

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));

    return container;
}

module.exports = {
    prefix: 'serverroles',
    description: 'List all roles in the server',
    usage: 'serverroles',
    category: 'basic',
    aliases: ['rolelist', 'roles', 'allroles'],
    data: new SlashCommandBuilder()
        .setName('serverroles')
        .setDescription('List all roles in the server'),

    async execute(interaction) {
        try {
            const container = buildRolesResponse(interaction.guild);
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[SERVERROLES] Error:`, error);
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
            const container = buildRolesResponse(message.guild);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[SERVERROLES] Error:`, error);
            await message.reply('<:Cancel:1473037949187657818> An error occurred while running this command.').catch(() => {});
        }
    }
};
