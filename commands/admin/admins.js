const { MessageFlags } = require('discord.js');
const { COLORS, buildErrorResponse, BRANDING } = require('../../utils/responseBuilder');
const { paginate, setupPaginationCollector } = require('../../utils/pagination');
const { createContainer, addTextDisplay, addSeparator } = require('../../utils/componentHelpers');
const trust = require('../../utils/trustManager');

module.exports = {
    prefix: 'admins',
    description: 'Display all trusted admins in this guild',
    usage: 'admins',
    category: 'admin',
    aliases: ['listadmins', 'adminlist'],

    async executePrefix(message) {
        try {
            const entries = trust.getList(message.guild.id, 'admins');

            if (entries.length === 0) {
                const container = createContainer(COLORS.INFO);
                addTextDisplay(container, `# <:Shield:1473038669831995494> Trusted Admins\n\n*No admins in the trust list*\n\n-# Use \`add-admin @user\` to add admins`);
                addSeparator(container);
                addTextDisplay(container, BRANDING);
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const allLines = entries.map(entry => {
                const mention = entry.type === 'user' ? `<@${entry.id}>` : `<@&${entry.id}>`;
                const typeIcon = entry.type === 'user' ? '<:User:1473038971398520977>' : '<:Userplus:1473038912212435086>';
                const addedBy = entry.addedBy ? `by <@${entry.addedBy}>` : '';
                const addedAt = entry.addedAt ? `<t:${Math.floor(new Date(entry.addedAt).getTime() / 1000)}:R>` : 'Unknown';
                return `${typeIcon} ${mention} — added ${addedAt} ${addedBy}`;
            });

            const result = paginate({
                header: `# <:Shield:1473038669831995494> Trusted Admins\n\n` +
                    `<:Caretright:1473038207221502106> **Server:** ${message.guild.name}\n` +
                    `<:Caretright:1473038207221502106> **Total:** ${entries.length}\n` +
                    `<:Caretright:1473038207221502106> **Trust Role:** Trusted Admin\n` +
                    `<:Caretright:1473038207221502106> **Permissions:** Manage Channels, Roles, Messages, Ban, Kick, Mute, Move, Timeout`,
                lines: allLines,
                perPage: 15,
                accentColor: COLORS.INFO,
                footer: BRANDING
            });

            const reply = await message.reply(result);
            setupPaginationCollector(reply, result._pageData, message.author.id);
        } catch (error) {
            console.error('[Admins] Error:', error);
            const container = buildErrorResponse('Error', 'An error occurred while executing this command.', error.message);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
