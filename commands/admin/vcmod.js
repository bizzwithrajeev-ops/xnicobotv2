const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { COLORS, BRANDING, buildErrorResponse } = require('../../utils/responseBuilder');
const trust = require('../../utils/trustManager');

module.exports = {
    prefix: 'vcmod',
    description: 'Display all trusted VC moderators in this guild',
    usage: 'vcmod',
    category: 'admin',
    aliases: ['vcmods', 'listvcmods', 'vcmodlist'],

    async executePrefix(message) {
        try {
        const entries = trust.getList(message.guild.id, 'vcmods');

        let list = '';
        if (entries.length === 0) {
            list = '*No VC moderators in the trust list*';
        } else {
            for (const entry of entries) {
                const mention = entry.type === 'user' ? `<@${entry.id}>` : `<@&${entry.id}>`;
                const typeIcon = entry.type === 'user' ? '<:User:1473038971398520977>' : '<:Userplus:1473038912212435086>';
                const addedBy = entry.addedBy ? `by <@${entry.addedBy}>` : '';
                const addedAt = entry.addedAt ? `<t:${Math.floor(new Date(entry.addedAt).getTime() / 1000)}:R>` : 'Unknown';
                list += `${typeIcon} ${mention} — added ${addedAt} ${addedBy}\n`;
            }
        }

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.INFO)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# <:Microphone:1473039293088927996> Trusted VC Moderators\n\n` +
                `**Server:** ${message.guild.name}\n` +
                `**Total:** ${entries.length}\n` +
                `**Trust Role:** Trusted VC Mod\n` +
                `**Permissions:** Mute Members, Deafen Members, Move Members\n\n` +
                `${list}\n` +
                `-# Use \`add-vcmod @user\` or \`remove-vcmod @user\` to manage`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[VCMod] Error:', error);
            const container = buildErrorResponse('Error', 'An error occurred while executing this command.', error.message);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
