const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { COLORS, BRANDING, buildErrorResponse } = require('../../utils/responseBuilder');
const trust = require('../../utils/trustManager');

module.exports = {
    prefix: 'removeowner',
    description: 'Remove the second owner from this guild',
    usage: 'removeowner',
    category: 'admin',
    aliases: ['remove-owner', 'delowner'],

    async executePrefix(message) {
        if (!trust.isGuildOwner(message.guild, message.author.id)) {
            const container = buildErrorResponse('Permission Denied', 'Only the **server owner** can use this command.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        try {
        const current = trust.getSecondOwner(message.guild.id);
        if (!current) {
            const container = buildErrorResponse('No Second Owner', 'No second owner is currently assigned.', 'Use `add-owner @user` to assign one.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let username = current;
        let targetUser = null;
        try {
            targetUser = await message.client.users.fetch(current);
            username = targetUser.username;
        } catch {}

        const confirmContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# <:Infotriangle:1473038460456800459> Confirm: Remove Second Owner\n\n` +
                `<:Caretright:1473038207221502106> **Current Second Owner:** ${targetUser || `<@${current}>`} (\`${current}\`)\n` +
                `<:Caretright:1473038207221502106> **Requested by:** ${message.author.username}\n\n` +
                `### What will happen:\n` +
                `- <:Caretright:1473038207221502106> **${username}** will lose second owner privileges\n` +
                `- <:Caretright:1473038207221502106> The **Second Owner** role will be revoked\n` +
                `- <:Caretright:1473038207221502106> They will no longer be able to manage admins, mods, or VC mods\n` +
                `- <:Caretright:1473038207221502106> All bot access granted through second owner status will be removed\n\n` +
                `-# Are you sure you want to proceed?`
            ));

        await trust.withConfirmation(message, confirmContainer, async (i) => {
            trust.removeSecondOwner(message.guild.id);

            // Remove the role
            let roleNote = '';
            const rr = await trust.removeTrustRole(message.guild, current, 'secondOwner');
            roleNote = rr.success ? `\n<:Caretright:1473038207221502106> **Role Revoked:** Second Owner` : `\n<:Infotriangle:1473038460456800459> Could not revoke role: ${rr.error}`;

            // DM notification
            if (targetUser) {
                await trust.notifyUser(message.client, current,
                    `<:Notificationon:1473038417691676784> You have been **removed** as **Second Owner** of **${message.guild.name}** by **${message.author.username}**.\n> Your second owner privileges have been revoked.`
                );
            }

            const success = new ContainerBuilder()
                .setAccentColor(COLORS.SUCCESS)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Checkedbox:1473038547165384804> Second Owner Removed Successfully\n\n` +
                    `<:Caretright:1473038207221502106> **<:User:1473038971398520977> User:** ${targetUser || `<@${current}>`} (\`${current}\`)${roleNote}\n` +
                    `<:Caretright:1473038207221502106> **Removed by:** ${message.author.username}\n\n` +
                    `<:Caretright:1473038207221502106> This user no longer has second owner privileges.`
                ))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
            await i.update({ components: [success], flags: MessageFlags.IsComponentsV2 });
        });
        } catch (error) {
            console.error('[RemoveOwner] Error:', error);
            const container = buildErrorResponse('Error', 'An error occurred while executing this command.', error.message);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
