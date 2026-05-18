const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');

function buildRoleInfo(role) {
    const permissions = role.permissions.toArray().slice(0, 8);
    const permissionList = permissions.length > 0 ? permissions.map(p => `\`${p}\``).join(', ') : 'None';
    const hasMore = role.permissions.toArray().length > 8;

    const container = new ContainerBuilder()
        .setAccentColor(role.color || 0xCAD7E6)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# <:Userplus:1473038912212435086> ${role.name}`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `<:Fileuser:1473039570630348810> **ID:** \`${role.id}\`\n` +
                `<:Caretright:1473038207221502106> **Color:** ${role.hexColor}\n` +
                `<:Pin:1473038806612447500> **Position:** ${role.position}\n` +
                `<:User:1473038971398520977> **Members:** ${role.members.size}\n` +
                `<:Clock:1473039102113878056> **Created:** <t:${Math.floor(role.createdTimestamp / 1000)}:R>`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### <:Settings:1473037894703779851> Settings\n` +
                `<:Caretright:1473038207221502106> **Mentionable:** ${role.mentionable ? 'Yes' : 'No'}\n` +
                `<:Pin:1473038806612447500> **Hoisted:** ${role.hoist ? 'Yes' : 'No'}\n` +
                `<:bots:1473368718120849500> **Managed:** ${role.managed ? 'Yes (Bot/Integration)' : 'No'}`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### <:Key:1473038690606649375> Key Permissions\n${permissionList}${hasMore ? ' +more' : ''}`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));

    return container;
}

module.exports = {
    prefix: 'roleinfo',
    description: 'Display information about a role',
    usage: 'roleinfo',
    category: 'basic',
    data: new SlashCommandBuilder()
        .setName('roleinfo')
        .setDescription('Display information about a role')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to get info about')
                .setRequired(true)),
    
    async execute(interaction) {
        try {
            const role = interaction.options.getRole('role');
            const container = buildRoleInfo(role);
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[ROLEINFO] Error:`, error);
            const content = '<:Cancel:1473037949187657818> An error occurred while running this command.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content }).catch(() => {});
            } else {
                await interaction.reply({ content, ephemeral: true }).catch(() => {});
            }
        }
    },

    async executePrefix(message, args) {
        try {
            const roleName = args.join(' ');
            if (!roleName) {
                return message.reply('<:Cancel:1473037949187657818> Please provide a role name or mention!');
            }

            const role = message.mentions.roles.first() || 
                         message.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());

            if (!role) {
                return message.reply('<:Cancel:1473037949187657818> Role not found!');
            }

            const container = buildRoleInfo(role);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`[ROLEINFO] Error:`, error);
            await message.reply('<:Cancel:1473037949187657818> An error occurred while running this command.').catch(() => {});
        }
    }
};
