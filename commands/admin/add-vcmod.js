const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { COLORS, buildErrorResponse } = require('../../utils/responseBuilder');
const trust = require('../../utils/trustManager');

module.exports = {
    prefix: 'add-vcmod',
    description: 'Add a user or role to the VC Moderator trust list',
    usage: 'add-vcmod <@user|@role|userId>',
    category: 'admin',
    aliases: ['addvcmod', 'vcmodadd'],

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
                        `# <:Microphone:1473039293088927996> Add VC Moderator\n\n` +
                        `<:Infocircle:1473038519029989588> **Usage:** \`add-vcmod @user\` or \`add-vcmod @role\`\n\n` +
                        `<:Caretright:1473038207221502106> Adds a user or role to the trusted VC moderator list.\n` +
                        `<:Caretright:1473038207221502106> VC Mods receive the **Trusted VC Mod** role with permissions:\n` +
                        `<:Caretright:1473038207221502106> Mute Members, Deafen Members, Move Members in voice channels.`
                    ))
;
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const targetId = targetUser ? targetUser.id : targetRole.id;
            const targetType = targetUser ? 'user' : 'role';
            const targetName = targetUser ? targetUser.username : targetRole.name;

            // Validation checks
            if (targetUser?.bot) {
                const container = buildErrorResponse('Cannot Add Bot', 'You cannot add bots to the VC moderator list.');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            if (targetUser && targetUser.id === message.author.id) {
                const container = buildErrorResponse('Cannot Add Yourself', 'You cannot add yourself to the VC moderator list.');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            if (targetRole && targetRole.id === message.guild.id) {
                const container = buildErrorResponse('Invalid Role', 'You cannot add the @everyone role to the VC moderator list.');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            if (targetRole && targetRole.managed) {
                const container = buildErrorResponse('Managed Role', `**${targetRole.name}** is a bot/integration-managed role and cannot be added to the VC moderator list.`);
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            if (targetUser && trust.isGuildOwner(message.guild, targetUser.id)) {
                const container = buildErrorResponse('Already Owner', 'The server owner already has full access.');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            if (targetUser && trust.isSecondOwner(message.guild.id, targetUser.id)) {
                const container = buildErrorResponse('Already Second Owner', 'The second owner already has higher access than VC Mod.');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            if (trust.getList(message.guild.id, 'vcmods').some(e => e.id === targetId)) {
                const container = buildErrorResponse('Already VC Mod', `**${targetName}** is already in the VC moderator list.`);
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (trust.getList(message.guild.id, 'admins').some(e => e.id === targetId)) {
                const container = buildErrorResponse('Higher Role Exists', `**${targetName}** is already an **Admin**, which is higher than VC Mod.`);
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            if (trust.getList(message.guild.id, 'mods').some(e => e.id === targetId)) {
                const container = buildErrorResponse('Higher Role Exists', `**${targetName}** is already a **Moderator**, which is higher than VC Mod.`);
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const confirmContainer = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Infotriangle:1473038460456800459> Confirm: Add VC Moderator\n\n` +
                    `<:Caretright:1473038207221502106> **Target:** ${targetUser || targetRole} (\`${targetId}\`)\n` +
                    `<:Caretright:1473038207221502106> **Type:** ${targetType === 'user' ? '<:User:1473038971398520977> User' : '<:Userplus:1473038912212435086> Role'}\n` +
                    `<:Caretright:1473038207221502106> **Requested by:** ${message.author.username}\n\n` +
                    `### What will happen:\n` +
                    (targetType === 'user'
                        ? `- <:Caretright:1473038207221502106> User will be added to the **VC Mod trust list**\n- <:Caretright:1473038207221502106> A **Trusted VC Mod** role will be assigned with permissions:\n  Mute Members, Deafen Members, Move Members`
                        : `- <:Caretright:1473038207221502106> Role will be marked as a **Trusted VC Mod** role\n- <:Caretright:1473038207221502106> All members with this role gain VC mod-level bot access`) +
                    `\n\n-# Are you sure you want to proceed?`
                ));

            await trust.withConfirmation(message, confirmContainer, async (i) => {
                const result = trust.addToList(message.guild.id, 'vcmods', targetId, targetType, message.author.id);
                if (!result.success) {
                    const fail = new ContainerBuilder().setAccentColor(COLORS.ERROR)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Failed\n\n${result.message}`));
                    return i.update({ components: [fail], flags: MessageFlags.IsComponentsV2 });
                }

                let roleNote = '';
                if (targetType === 'user') {
                    const rr = await trust.assignTrustRole(message.guild, targetId, 'vcmods');
                    roleNote = rr.success ? `\n**Role Assigned:** ${rr.role}` : `\n<:Infotriangle:1473038460456800459> Could not assign role: ${rr.error}`;
                }

                if (targetUser) {
                    await trust.notifyUser(message.client, targetUser.id,
                        `<:Notificationon:1473038417691676784> You have been added as a **Trusted VC Moderator** in **${message.guild.name}** by **${message.author.username}**.\n> You now have VC mod-level access and permissions.`
                    );
                }

                const success = new ContainerBuilder()
                    .setAccentColor(COLORS.SUCCESS)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> VC Moderator Added Successfully\n\n` +
                        `<:Caretright:1473038207221502106> **${targetType === 'user' ? '<:User:1473038971398520977> User' : '<:Userplus:1473038912212435086> Role'}:** ${targetUser || targetRole} (\`${targetId}\`)${roleNote}\n` +
                        `<:Caretright:1473038207221502106> **Added by:** ${message.author.username}\n\n` +
                        `<:Caretright:1473038207221502106> They now have VC moderator-level trust and permissions in this server.`
                    ))
;
                await i.update({ components: [success], flags: MessageFlags.IsComponentsV2 });
            });
        } catch (error) {
            console.error('[AddVCMod] Error:', error);
            const container = buildErrorResponse('Error', 'An error occurred while executing this command.', error.message);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
