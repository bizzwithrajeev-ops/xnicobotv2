const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, COLORS, BRANDING } = require('../../utils/responseBuilder');

const jsonStore = require('../../utils/jsonStore');

function loadBans() {
    try {
        if (jsonStore.has('voicebans')) return jsonStore.read('voicebans');
    } catch {}
    return {};
}

function saveBans(bans) {
    jsonStore.write('voicebans', bans);
}

module.exports = {
    name: 'voiceunban',
    prefix: 'voiceunban',
    description: 'Remove voice ban from a user — restores Connect permission on all voice channels',
    usage: 'voiceunban <@user>',
    category: 'voice',
    aliases: ['vunban'],
    permissions: ['MoveMembers', 'ManageChannels'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Move Members** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
            const container = buildErrorResponse('Missing Bot Permission', 'I need the **Manage Channels** permission to remove voice bans.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const user = message.mentions.users.first();
        if (!user) {
            const container = buildErrorResponse(
                'No User Mentioned',
                'Please mention a user to unban from voice.',
                '**Example:** `voiceunban @User`'
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const member = await message.guild.members.fetch(user.id).catch(() => null);
        if (!member) {
            const container = buildErrorResponse('User Not Found', 'That user is not in this server.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // Check if user has a stored voice ban
        const bans = loadBans();
        const guildBans = bans[message.guild.id] || {};
        const banInfo = guildBans[member.id];

        try {
            // Remove Connect deny from all voice channels
            const voiceChannels = message.guild.channels.cache.filter(
                c => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice
            );

            let restored = 0;
            for (const [, channel] of voiceChannels) {
                try {
                    const overwrite = channel.permissionOverwrites.cache.get(member.id);
                    if (overwrite && overwrite.deny.has(PermissionFlagsBits.Connect)) {
                        // Clear *only* the Connect deny — preserves any
                        // other overwrites (e.g. ViewChannel: false, role
                        // bypass). Previously we deleted the whole
                        // overwrite, which silently restored every other
                        // permission the user had explicitly denied.
                        await channel.permissionOverwrites.edit(member.id, { Connect: null });
                        restored++;
                    }
                } catch {}
            }

            // Remove from stored bans
            if (bans[message.guild.id]) {
                delete bans[message.guild.id][member.id];
                if (Object.keys(bans[message.guild.id]).length === 0) delete bans[message.guild.id];
                saveBans(bans);
            }

            const details = {
                'User': `${member}`,
                'Channels Restored': `${restored}/${voiceChannels.size}`,
                'Moderator': message.author.username
            };
            if (banInfo) {
                details['Original Reason'] = banInfo.reason;
                details['Banned By'] = `<@${banInfo.bannedBy}>`;
            }

            const container = buildSuccessResponse(
                'Voice Unban Applied',
                `**${user.username}** has been unbanned from voice channels.`,
                details
            );
            container.setAccentColor(0x57F287);
            
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            const container = buildErrorResponse('Failed', 'Could not remove voice ban.', error.message);
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
