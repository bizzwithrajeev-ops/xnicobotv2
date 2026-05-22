const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');
const { updateVoiceChannelStatus } = require('../../utils/musicPanel');
const { voiceErrorMessage } = require('../../utils/musicHelpers');

function buildContent(currentTrack, slashOrPrefix) {
    let content = `# <:Pause:1473039275829366815> Music Paused\n\n`;
    content += `**Track:** ${currentTrack.info.title}\n`;
    content += `**Artist:** ${currentTrack.info.author || 'Unknown'}\n\n`;
    content += `> Use \`${slashOrPrefix}resume\` to continue playing`;
    return new ContainerBuilder()
        .setAccentColor(COLORS.WARNING)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause the current song'),

    prefix: 'pause',
    description: 'Pause the current song',
    usage: 'pause',
    category: 'music',
    aliases: ['ps'],

    async execute(interaction, lavalinkManager) {
        const player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player) return interaction.reply({ components: [buildErrorResponse('No Music Playing', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        const voiceErr = voiceErrorMessage(interaction.member, player);
        if (voiceErr) return interaction.reply({ components: [buildErrorResponse('Voice Required', voiceErr)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        const currentTrack = player.queue.current;
        if (!currentTrack) return interaction.reply({ components: [buildErrorResponse('No Track Playing', 'No track is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        if (player.paused) return interaction.reply({ components: [buildErrorResponse('Already Paused', 'Use `/resume` to continue playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        await player.pause();
        await updateVoiceChannelStatus(interaction.client, player);
        return interaction.reply({ components: [buildContent(currentTrack, '/')], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        if (!player) return message.reply({ components: [buildErrorResponse('No Music Playing', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 });
        const voiceErr = voiceErrorMessage(message.member, player);
        if (voiceErr) return message.reply({ components: [buildErrorResponse('Voice Required', voiceErr)], flags: MessageFlags.IsComponentsV2 });

        const currentTrack = player.queue.current;
        if (!currentTrack) return message.reply({ components: [buildErrorResponse('No Track Playing', 'No track is currently playing.')], flags: MessageFlags.IsComponentsV2 });
        if (player.paused) return message.reply({ components: [buildErrorResponse('Already Paused', 'Use `-resume` to continue playing.')], flags: MessageFlags.IsComponentsV2 });

        await player.pause();
        await updateVoiceChannelStatus(message.client, player);
        return message.reply({ components: [buildContent(currentTrack, '-')], flags: MessageFlags.IsComponentsV2 });
    }
};
