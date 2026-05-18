const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { COLORS, BRANDING, buildErrorResponse } = require('../../utils/responseBuilder');
const trust = require('../../utils/trustManager');

module.exports = {
    prefix: 'adminreset',
    description: 'Remove all admins from the trust list and revoke their roles (Owner Only)',
    usage: 'adminreset',
    category: 'admin',
    aliases: ['resetadmins', 'clearadmins'],

    async executePrefix(message) {
        if (!trust.isGuildOwner(message.guild, message.author.id)) {
            const container = buildErrorResponse('Permission Denied', 'Only the **server owner** can reset the admin list.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            const entries = trust.getList(message.guild.id, 'admins');
            if (entries.length === 0) {
                const container = buildErrorResponse('Already Empty', 'The admin trust list is already empty.');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const userEntries = entries.filter(e => e.type === 'user');
            const roleEntries = entries.filter(e => e.type === 'role');

            const confirmContainer = new ContainerBuilder()
                .setAccentColor(0xED4245)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Infotriangle:1473038460456800459> Confirm: Reset Admin List\n\n` +
                    `<:Infotriangle:1473038460456800459> **This is a destructive action!**\n\n` +
                    `<:Trash:1473038090074591293> **Entries to be removed:** ${entries.length}\n` +
                    `- <:User:1473038971398520977> Users: ${userEntries.length}\n` +
                    `- <:Caretright:1473038207221502106> Roles: ${roleEntries.length}\n\n` +
                    `### What will happen:\n` +
                    `- <:Caretright:1473038207221502106> **All** entries will be removed from the admin trust list\n` +
                    `- <:Caretright:1473038207221502106> The **Trusted Admin** role will be revoked from all members\n` +
                    `- <:Caretright:1473038207221502106> All admin-level bot access will be removed\n` +
                    `- <:Caretright:1473038207221502106> All affected users will be notified via DM\n\n` +
                    `**Requested by:** ${message.author.username}\n\n` +
                    `-# <:Infotriangle:1473038460456800459> This action cannot be undone. Are you sure?`
                ));

            await trust.withConfirmation(message, confirmContainer, async (i) => {
                const rolesRemoved = await trust.removeAllTrustRoles(message.guild, 'admins');

                for (const entry of userEntries) {
                    await trust.notifyUser(message.client, entry.id,
                        `<:Notificationon:1473038417691676784> The **Admin trust list** in **${message.guild.name}** has been **reset** by **${message.author.username}**.\n> Your admin-level access and Trusted Admin role have been revoked.`
                    );
                }

                const count = trust.resetList(message.guild.id, 'admins');

                const success = new ContainerBuilder()
                    .setAccentColor(COLORS.SUCCESS)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> Admin List Reset Successfully\n\n` +
                        `<:Trash:1473038090074591293> **Entries Removed:** ${count}\n` +
                        `<:Caretright:1473038207221502106> **Roles Revoked:** ${rolesRemoved} member${rolesRemoved === 1 ? '' : 's'}\n` +
                        `<:Caretright:1473038207221502106> **Reset by:** ${message.author.username}\n\n` +
                        `<:Caretright:1473038207221502106> All admin privileges have been revoked.`
                    ))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
                await i.update({ components: [success], flags: MessageFlags.IsComponentsV2 });
            });
        } catch (error) {
            console.error('[AdminReset] Error:', error);
            const container = buildErrorResponse('Error', 'An error occurred while executing this command.', error.message);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
