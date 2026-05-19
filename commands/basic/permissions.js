const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { COLORS } = require('../../utils/responseBuilder');

function buildPermissions(member) {
    const permissions = member.permissions.toArray();
    const keyPerms = ['Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels',
                     'KickMembers', 'BanMembers', 'ModerateMembers', 'ManageMessages',
                     'ManageWebhooks', 'ManageNicknames', 'MentionEveryone'];
    const hasAdmin = permissions.includes('Administrator');

    let content = `# <:Key:1473038690606649375> Permissions\n\n`;
    content += `**Member:** ${member.user.username}\n`;
    content += `**Role Count:** ${member.roles.cache.size - 1}\n`;
    content += `**Highest Role:** ${member.roles.highest}\n\n`;

    if (hasAdmin) {
        content += `### <:Crown:1506010837368963142> Administrator\n`;
        content += `> This user has all permissions.\n`;
    } else {
        const memberKeyPerms = permissions.filter(p => keyPerms.includes(p));
        if (memberKeyPerms.length > 0) {
            content += `### <:Lightningalt:1473038679906844824> Key Permissions\n`;
            content += memberKeyPerms.map(p => `> \`${p}\``).join('\n');
            content += `\n\n`;
        }
        content += `### <:Document:1473039496995143731> All Permissions (${permissions.length})\n`;
        content += `> ${permissions.slice(0, 15).map(p => `\`${p}\``).join(', ')}`;
        if (permissions.length > 15) {
            content += `\n> ...and ${permissions.length - 15} more`;
        }
    }

    const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: member.user.displayAvatarURL({ size: 256 }) } }));

    return new ContainerBuilder()
        .setAccentColor(member.displayColor || COLORS.INFO)
        .addSectionComponents(section)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('permissions')
        .setDescription('View a member\'s permissions')
        .addUserOption(opt => opt.setName('user').setDescription('User to check permissions for')),

    prefix: 'permissions',
    description: 'View a member\'s permissions',
    usage: 'permissions [@user]',
    category: 'basic',
    aliases: ['perms'],

    async execute(interaction) {
        const user = interaction.options.getUser('user');
        const member = user ? await interaction.guild.members.fetch(user.id).catch(() => null) : interaction.member;
        if (!member) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> Could not find that member.', flags: MessageFlags.Ephemeral });
        }
        const container = buildPermissions(member);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        try {
            const member = message.mentions.members.first() || message.member;
            const container = buildPermissions(member);
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[PERMISSIONS] Error:`, error);
            await message.reply('<:Cancel:1473037949187657818> An error occurred while running this command.').catch(() => {});
        }
    }
};
