const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, COLORS, EMOJIS, BRANDING } = require('../../utils/responseBuilder');

const jsonStore = require('../../utils/jsonStore');
const { resolveUser } = require('../../utils/resolveUser');

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
    name: 'voiceban',
    prefix: 'voiceban',
    description: 'Ban a user from all voice channels — disconnects and prevents rejoining',
    usage: 'voiceban <@user> [reason]',
    category: 'voice',
    aliases: ['vban'],
    permissions: ['MoveMembers', 'ManageChannels'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Move Members** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
            const container = buildErrorResponse('Missing Bot Permission', 'I need the **Manage Channels** permission to enforce voice bans.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const resolvedUser = await resolveUser(message, args);
        const member = resolvedUser ? await message.guild.members.fetch(resolvedUser.id).catch(() => null) : null;
        const reason = args.slice(1).join(' ') || 'No reason provided';

        if (!member) {
            let content = `# <:Volumeoff:1473039301414621427> Voice Ban\n\n`;
            content += `Ban a user from all voice channels — disconnects and denies Connect permission.\n\n`;
            content += `### Usage\n`;
            content += `> \`voiceban @user [reason]\`\n\n`;
            content += `### Examples\n`;
            content += `> \`voiceban @User Spamming in VC\`\n`;
            content += `> \`voiceban @User\`\n\n`;
            content += `-# Use \`voiceunban @user\` to remove the ban`;

            const container = new ContainerBuilder()
                .setAccentColor(COLORS.CYAN)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (member.id === message.author.id) {
            const container = buildErrorResponse('Invalid Target', 'You cannot voice ban yourself.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (member.id === message.guild.members.me.id) {
            const container = buildErrorResponse('Invalid Target', 'I cannot voice ban myself.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const channelName = member.voice.channel?.name || 'N/A';

        try {
            // Disconnect from current voice if connected
            if (member.voice.channel) {
                await member.voice.disconnect(reason);
            }

            // Deny Connect permission on all voice channels
            const voiceChannels = message.guild.channels.cache.filter(
                c => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice
            );

            let denied = 0;
            for (const [, channel] of voiceChannels) {
                try {
                    await channel.permissionOverwrites.edit(member.id, { Connect: false });
                    denied++;
                } catch {}
            }

            // Store the ban
            const bans = loadBans();
            if (!bans[message.guild.id]) bans[message.guild.id] = {};
            bans[message.guild.id][member.id] = {
                reason,
                bannedBy: message.author.id,
                bannedAt: new Date().toISOString()
            };
            saveBans(bans);

            const container = buildSuccessResponse(
                'Voice Ban Applied',
                `**${member.user.username}** has been banned from all voice channels.`,
                {
                    'User': `${member}`,
                    'Previous Channel': channelName,
                    'Channels Denied': `${denied}/${voiceChannels.size}`,
                    'Reason': reason,
                    'Moderator': message.author.username
                }
            );
            container.setAccentColor(COLORS.ERROR);
            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Use \`voiceunban @${member.user.username}\` to remove the ban\n${BRANDING}`));

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            const container = buildErrorResponse('Failed', 'Could not voice ban the user.', error.message);
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
