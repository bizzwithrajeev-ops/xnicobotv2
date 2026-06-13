const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { paginate, setupPaginationCollector } = require('../../utils/pagination');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');

module.exports = {
    name: 'channel-permissions',
    prefix: 'channel-permissions',
    description: 'View channel permission overrides',
    category: 'admin',
    usage: 'channel-permissions [#channel]',
    aliases: ['chperms', 'channelperms'],
    permissions: ['ManageChannels'],

    async executePrefix(message, args) {
        if (!message.guild) return message.reply('<:Cancel:1473037949187657818> This command can only be used in a server.').catch(() => {});
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('<:Infocircle:1473038519029989588> You need Manage Channels permission to use this command.');
        }

        try {
            const channel = message.mentions.channels.first() || message.channel;
            const overwrites = channel.permissionOverwrites.cache;

            if (overwrites.size === 0) {
                const container = buildErrorResponse(
                    '<:Key:1473038690606649375> No Overrides',
                    `${channel} has no permission overrides.`
                );
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const allLines = overwrites.map(overwrite => {
                const target = overwrite.type === 0 ? message.guild.roles.cache.get(overwrite.id) : message.guild.members.cache.get(overwrite.id);
                const name = target ? (overwrite.type === 0 ? `@${target.name}` : target.user.username) : 'Unknown';
                const icon = overwrite.type === 0 ? '<:Userplus:1473038912212435086>' : '<:User:1473038971398520977>';
                const allow = overwrite.allow.toArray().slice(0, 8).map(p => `\`${p}\``).join(', ') || 'None';
                const deny = overwrite.deny.toArray().slice(0, 8).map(p => `\`${p}\``).join(', ') || 'None';
                const allowMore = overwrite.allow.toArray().length > 8 ? ` +${overwrite.allow.toArray().length - 8}` : '';
                const denyMore = overwrite.deny.toArray().length > 8 ? ` +${overwrite.deny.toArray().length - 8}` : '';
                return `> ${icon} **${name}**\n> <:Checkedbox:1473038547165384804> ${allow}${allowMore}\n> <:Cancel:1473037949187657818> ${deny}${denyMore}`;
            });

            const result = paginate({
                header: `# <:Key:1473038690606649375> Permission Overrides\n-# ${channel} • **${overwrites.size}** override(s)`,
                lines: [...allLines],
                perPage: 5,
                accentColor: COLORS.INFO,
            });

            const reply = await message.reply(result);
            if (result._pageData) setupPaginationCollector(reply, result._pageData, message.author.id);
        } catch (error) {
            console.error('[ChannelPermissions] Error:', error);
            const container = buildErrorResponse('Error', 'An error occurred while executing this command.', error.message);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
