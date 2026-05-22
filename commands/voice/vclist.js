const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits, ChannelType, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { COLORS, BRANDING } = require('../../utils/responseBuilder');

module.exports = {
    name: 'vclist',
    prefix: 'vclist',
    description: 'Show all voice channels and their connected members',
    usage: 'vclist',
    category: 'voice',
    aliases: ['voicelist', 'voicemembers', 'vcinfo'],

    async executePrefix(message, args) {
        const voiceChannels = message.guild.channels.cache
            .filter(ch => ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice)
            .sort((a, b) => a.position - b.position);

        if (voiceChannels.size === 0) {
            const { buildErrorResponse } = require('../../utils/responseBuilder');
            const container = buildErrorResponse('No Voice Channels', 'This server has no voice channels.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let totalMembers = 0;
        let content = `# <:Volumeup:1473039290136002844> Voice Channel Overview\n\n`;

        for (const [, ch] of voiceChannels) {
            const members = ch.members;
            const memberCount = members.size;
            totalMembers += memberCount;

            const limitStr = ch.userLimit ? `/${ch.userLimit}` : '';
            const statusIcon = memberCount > 0 ? '<:Toggleon:1473038585501581312>' : '<:Toggleoff:1473038582813032590>';

            content += `${statusIcon} **${ch.name}** — \`${memberCount}${limitStr}\` members\n`;

            if (memberCount > 0) {
                const memberNames = members.map(m => {
                    let status = '';
                    if (m.voice.serverMute) status += ' 🔇';
                    if (m.voice.serverDeaf) status += ' 🔈';
                    if (m.voice.streaming) status += ' 📺';
                    if (m.voice.selfVideo) status += ' 📹';
                    return `> <:Caretright:1473038207221502106> ${m.user.username}${status}`;
                }).join('\n');
                content += memberNames + '\n';
            }
            content += '\n';
        }

        content += `### <:Invoice:1473039492217835550> Summary\n`;
        content += `> **Total Channels:** ${voiceChannels.size}\n`;
        content += `> **Total Connected:** ${totalMembers} members`;

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.CYAN)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
