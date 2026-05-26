const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { COLORS, BRANDING, buildErrorResponse } = require('../../utils/responseBuilder');
const trust = require('../../utils/trustManager');

module.exports = {
    prefix: 'show-owner',
    description: 'Display the current guild owner, second owner, and trust hierarchy',
    usage: 'show-owner',
    category: 'admin',
    aliases: ['showowner'],

    async executePrefix(message) {
        try {
        const guild = message.guild;
        const owner = await guild.fetchOwner().catch(() => null);
        const secondOwnerId = trust.getSecondOwner(guild.id);

        let secondOwnerText = '*Not assigned*';
        if (secondOwnerId) {
            try {
                const user = await message.client.users.fetch(secondOwnerId);
                secondOwnerText = `${user.username} (\`${user.id}\`)`;
            } catch {
                secondOwnerText = `<@${secondOwnerId}> (\`${secondOwnerId}\`)`;
            }
        }

        const adminCount = trust.getList(guild.id, 'admins').length;
        const modCount = trust.getList(guild.id, 'mods').length;
        const vcmodCount = trust.getList(guild.id, 'vcmods').length;

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.INFO)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# <:Crown:1506010837368963142> Server Ownership & Trust Hierarchy\n\n` +
                `**Server:** ${guild.name}\n\n` +
                `<:Crown:1506010837368963142> **Owner:** ${owner ? `${owner.user.username} (\`${owner.id}\`)` : 'Unknown'}\n` +
                `<:User:1473038971398520977> **Second Owner:** ${secondOwnerText}\n\n` +
                `### Trust Hierarchy\n` +
                `<:Crown:1506010837368963142> **Owner** → Full access\n` +
                `<:User:1473038971398520977> **Second Owner** → Full access + Administrator role\n` +
                `<:staff:1476259690315780229> **Admins** (${adminCount}) → Trusted Admin role + moderation perms\n` +
                `<:Settings:1473037894703779851> **Moderators** (${modCount}) → Trusted Moderator role + basic mod perms\n` +
                `<:Microphone:1473039293088927996> **VC Mods** (${vcmodCount}) → Trusted VC Mod role + voice perms\n\n` +
                `-# Use \`add-owner @user\` to assign a second owner (server owner only)\n` +
                `-# Use \`admins\`, \`mods\`, \`vcmods\` to view each trust list`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[ShowOwner] Error:', error);
            const container = buildErrorResponse('Error', 'An error occurred while executing this command.', error.message);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
