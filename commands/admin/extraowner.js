const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { COLORS, BRANDING } = require('../../utils/responseBuilder');
const trust = require('../../utils/trustManager');

function buildPanel(guild, secondOwnerId) {
    const ownerDisplay = secondOwnerId
        ? `<@${secondOwnerId}> (\`${secondOwnerId}\`)`
        : '*Not set*';

    const statusEmoji = secondOwnerId
        ? '<:Checkedbox:1473038547165384804>'
        : '<:Cancel:1473037949187657818>';

    const content =
        `# <:Shield:1473038669831995494> Extra Owner\n` +
        `-# Secondary owner configuration for **${guild.name}**\n\n` +
        `### <:Userplus:1473038912212435086> Current Extra Owner\n` +
        `${statusEmoji} ${ownerDisplay}\n\n` +
        `### <:Document:1473039496995143731> What Extra Owner Gets\n` +
        `▸ Full access to all security commands\n` +
        `▸ Can manage antinuke, whitelist, and trust settings\n` +
        `▸ Treated as server owner in the bot's permission system\n` +
        `▸ Cannot override the actual server owner\n\n` +
        `### <:Lightningalt:1473038679906844824> Commands\n` +
        `▸ \`extraowner set @user\` — Set a user as extra owner\n` +
        `▸ \`extraowner view\` — View current extra owner\n` +
        `▸ \`extraowner reset\` — Remove the extra owner\n\n` +
        `-# <:Infotriangle:1473038460456800459> Only the server owner can manage this setting\n\n` +
        BRANDING;

    const container = new ContainerBuilder()
        .setAccentColor(secondOwnerId ? 0x57F287 : null);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    return container;
}

module.exports = {
    name: 'extraowner',
    prefix: 'extraowner',
    description: 'Set, view, or reset the secondary (extra) owner for this server',
    usage: 'extraowner [set @user|view|reset]',
    category: 'admin',
    aliases: ['secondowner', 'coowner'],
    prefixOnly: true,

    async executePrefix(message, args) {
        const guild = message.guild;
        const sub = args[0]?.toLowerCase();

        if (sub === 'view' || !sub) {
            if (!trust.isServerOwner(guild, message.author.id)) {
                return message.reply('<:Cancel:1473037949187657818> Only the **server owner** or **extra owner** can use this command.');
            }

            const secondOwnerId = trust.getSecondOwner(guild.id);
            const panel = buildPanel(guild, secondOwnerId);
            return message.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        }

        if (!trust.isGuildOwner(guild, message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> Only the **server owner** can set or reset the extra owner.');
        }

        if (sub === 'set') {
            const user = message.mentions.users.first();
            if (!user) {
                return message.reply('<:Cancel:1473037949187657818> Mention a user to set as extra owner.\n**Usage:** `extraowner set @user`');
            }

            if (user.id === message.author.id) {
                return message.reply('<:Cancel:1473037949187657818> You are already the server owner.');
            }

            if (user.bot) {
                return message.reply('<:Cancel:1473037949187657818> You cannot set a bot as extra owner.');
            }

            const currentSecond = trust.getSecondOwner(guild.id);
            if (currentSecond === user.id) {
                return message.reply(`<:Cancel:1473037949187657818> **${user.username}** is already the extra owner.`);
            }

            trust.setSecondOwner(guild.id, user.id);

            const container = new ContainerBuilder()
                .setAccentColor(0x57F287)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Checkedbox:1473038547165384804> Extra Owner Set\n\n` +
                    `**User:** ${user} (\`${user.id}\`)\n\n` +
                    `> This user now has owner-level access to all bot security commands.\n\n` +
                    (currentSecond ? `-# Previous extra owner <@${currentSecond}> has been replaced` : `-# Use \`extraowner reset\` to remove`)
                ));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (sub === 'reset') {
            const currentSecond = trust.getSecondOwner(guild.id);
            if (!currentSecond) {
                return message.reply('<:Cancel:1473037949187657818> There is no extra owner set for this server.');
            }

            trust.removeSecondOwner(guild.id);

            const container = new ContainerBuilder()
                .setAccentColor(0xED4245)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Cancel:1473037949187657818> Extra Owner Removed\n\n` +
                    `**Previous:** <@${currentSecond}> (\`${currentSecond}\`)\n\n` +
                    `> This user no longer has owner-level bot access.`
                ));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const secondOwnerId = trust.getSecondOwner(guild.id);
        const panel = buildPanel(guild, secondOwnerId);
        return message.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
    }
};
