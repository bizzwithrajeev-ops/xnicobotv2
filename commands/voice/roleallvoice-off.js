const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, COLORS } = require('../../utils/responseBuilder');

const jsonStore = require('../../utils/jsonStore');

module.exports = {
    name: 'roleallvoice-off',
    prefix: 'roleallvoice-off',
    description: 'Disable voice autorole feature',
    usage: 'roleallvoice-off',
    category: 'voice',
    aliases: ['disablevoicerole'],
    permissions: ['ManageRoles'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Manage Roles** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let config = {};
        if (jsonStore.has('voiceautorole')) {
            config = jsonStore.read('voiceautorole');
        }

        if (!config[message.guild.id]) {
            const container = buildErrorResponse('Not Enabled', 'Voice autorole is not enabled in this server.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const roleId = config[message.guild.id];
        delete config[message.guild.id];
        jsonStore.write('voiceautorole', config);

        let removedCount = 0;
        const role = message.guild.roles.cache.get(roleId);
        if (role) {
            for (const [, member] of message.guild.members.cache) {
                if (member.roles.cache.has(roleId)) {
                    await member.roles.remove(role).catch(() => {});
                    removedCount++;
                }
            }
        }

        const container = buildSuccessResponse(
            'Voice Autorole Disabled',
            `Successfully disabled voice autorole.`,
            { 'Removed From': `${removedCount} member(s)`, 'Role': role ? role.name : 'Deleted' }
        );
        container.setAccentColor(0x57F287);

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
