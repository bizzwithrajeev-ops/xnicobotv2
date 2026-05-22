const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');
const { updateVoiceChannelStatus } = require('../../utils/musicPanel');
const { voiceErrorMessage } = require('../../utils/musicHelpers');

function buildContent(currentTrack) {
    let content = `# <:Play:1473039266081800303> Music Resumed\n\n`;
    content += `**Track:** ${currentTrack.info.title}\n`;
    content += `**Artist:** ${currentTrack.info.author || 'Unknown'}\n\n`;
    content += `> Now playing`;
    return new ContainerBuilder()
        .setAccentColor(COLORS.SUCCESS)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume the paused song'),

    prefix: 'resume',
    description: 'Resume the paused song',
    usage: 'resume',
    category: 'music',
    aliases: ['rs', 'unpause', 'continue'],

    async execute(interaction, lavalinkManager) {
        const player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player) return interaction.reply({ components: [buildErrorResponse('No Music Playing', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        const voiceErr = voiceErrorMessage(interaction.member, player);
        if (voiceErr) return interaction.reply({ components: [buildErrorResponse('Voice Required', voiceErr)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        const currentTrack = player.queue.current;
        if (!currentTrack) return interaction.reply({ components: [buildErrorResponse('No Track Playing', 'No track is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        if (!player.paused) return interaction.reply({ components: [buildErrorResponse('Not Paused', 'The music is not paused.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        await player.resume();
        await updateVoiceChannelStatus(interaction.client, player);
        return interaction.reply({ components: [buildContent(currentTrack)], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        if (!player) return message.reply({ components: [buildErrorResponse('No Music Playing', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 });
        const voiceErr = voiceErrorMessage(message.member, player);
        if (voiceErr) return message.reply({ components: [buildErrorResponse('Voice Required', voiceErr)], flags: MessageFlags.IsComponentsV2 });

        const currentTrack = player.queue.current;
        if (!currentTrack) return message.reply({ components: [buildErrorResponse('No Track Playing', 'No track is currently playing.')], flags: MessageFlags.IsComponentsV2 });
        if (!player.paused) return message.reply({ components: [buildErrorResponse('Not Paused', 'The music is not paused.')], flags: MessageFlags.IsComponentsV2 });

        await player.resume();
        await updateVoiceChannelStatus(message.client, player);
        return message.reply({ components: [buildContent(currentTrack)], flags: MessageFlags.IsComponentsV2 });
    }
};
