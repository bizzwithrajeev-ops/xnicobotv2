const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { COLORS, BRANDING, buildErrorResponse } = require('../../utils/responseBuilder');
const trust = require('../../utils/trustManager');

module.exports = {
    prefix: 'removeadmin',
    description: 'Remove a user or role from the Admin trust list',
    usage: 'removeadmin <@user|@role|userId>',
    category: 'admin',
    aliases: ['remove-admin', 'deladmin'],

    async executePrefix(message, args) {
        if (!trust.isServerOwner(message.guild, message.author.id)) {
            const container = buildErrorResponse('Permission Denied', 'Only the **server owner** or **second owner** can use this command.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            let targetUser = message.mentions.users.first() || null;
            let targetRole = message.mentions.roles.first() || null;

            if (!targetUser && !targetRole && args[0]) {
                const id = args[0].replace(/[<@!&>]/g, '');
                try { targetUser = await message.client.users.fetch(id); } catch {
                    try { targetRole = await message.guild.roles.fetch(id); } catch {
                        const container = buildErrorResponse('Not Found', 'Could not find that user or role. Provide a valid mention or ID.');
                        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                    }
                }
            }

            if (!targetUser && !targetRole) {
                const container = new ContainerBuilder()
                    .setAccentColor(COLORS.INFO)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Shield:1473038669831995494> Remove Admin\n\n` +
                        `<:Infocircle:1473038519029989588> **Usage:** \`removeadmin @user\` or \`removeadmin @role\`\n\n` +
                        `<:Caretright:1473038207221502106> Removes a user or role from the trusted admin list.\n` +
                        `<:Caretright:1473038207221502106> The **Trusted Admin** role will be revoked.\n` +
                        `<:Caretright:1473038207221502106> All admin-level bot access will be removed.`
                    ))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const targetId = targetUser ? targetUser.id : targetRole.id;
            const targetType = targetUser ? 'user' : 'role';
            const targetName = targetUser ? targetUser.username : targetRole.name;

            if (!trust.getList(message.guild.id, 'admins').some(e => e.id === targetId)) {
                const container = buildErrorResponse('Not an Admin', `**${targetName}** is not in the admin list.`);
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const confirmContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Infotriangle:1473038460456800459> Confirm: Remove Admin\n\n` +
                    `<:Caretright:1473038207221502106> **Target:** ${targetUser || targetRole} (\`${targetId}\`)\n` +
                    `<:Caretright:1473038207221502106> **Type:** ${targetType === 'user' ? '<:User:1473038971398520977> User' : '<:Userplus:1473038912212435086> Role'}\n` +
                    `<:Caretright:1473038207221502106> **Requested by:** ${message.author.username}\n\n` +
                    `### What will happen:\n` +
                    (targetType === 'user'
                        ? `- <:Caretright:1473038207221502106> User will be removed from the **Admin trust list**\n- <:Caretright:1473038207221502106> The **Trusted Admin** role will be revoked\n- <:Caretright:1473038207221502106> All admin-level bot access will be removed`
                        : `- <:Caretright:1473038207221502106> Role will be unmarked as a **Trusted Admin** role\n- <:Caretright:1473038207221502106> Members with only this role lose admin-level bot access`) +
                    `\n\n-# Are you sure you want to proceed?`
                ));

            await trust.withConfirmation(message, confirmContainer, async (i) => {
                const result = trust.removeFromList(message.guild.id, 'admins', targetId);
                if (!result.success) {
                    const fail = new ContainerBuilder().setAccentColor(COLORS.ERROR)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Failed\n\n${result.message}`));
                    return i.update({ components: [fail], flags: MessageFlags.IsComponentsV2 });
                }

                // Remove role if user type
                let roleNote = '';
                if (targetType === 'user') {
                    const rr = await trust.removeTrustRole(message.guild, targetId, 'admins');
                    roleNote = rr.success ? `\n<:Caretright:1473038207221502106> **Role Revoked:** Trusted Admin` : `\n<:Infotriangle:1473038460456800459> Could not revoke role: ${rr.error}`;
                }

                // DM notification
                if (targetUser) {
                    await trust.notifyUser(message.client, targetUser.id,
                        `<:Notificationon:1473038417691676784> You have been **removed** from the **Admin trust list** in **${message.guild.name}** by **${message.author.username}**.\n> Your admin-level access has been revoked.`
                    );
                }

                const success = new ContainerBuilder()
                    .setAccentColor(COLORS.SUCCESS)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> Admin Removed Successfully\n\n` +
                        `<:Caretright:1473038207221502106> **${targetType === 'user' ? '<:User:1473038971398520977> User' : '<:Userplus:1473038912212435086> Role'}:** ${targetUser || targetRole} (\`${targetId}\`)${roleNote}\n` +
                        `<:Caretright:1473038207221502106> **Removed by:** ${message.author.username}\n\n` +
                        `<:Caretright:1473038207221502106> They no longer have admin-level trust in this server.`
                    ))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
                await i.update({ components: [success], flags: MessageFlags.IsComponentsV2 });
            });
        } catch (error) {
            console.error('[RemoveAdmin] Error:', error);
            const container = buildErrorResponse('Error', 'An error occurred while executing this command.', error.message);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
