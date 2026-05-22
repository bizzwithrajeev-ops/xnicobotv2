const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { formatTime, voiceErrorMessage } = require('../../utils/musicHelpers');

async function playPrevious(player) {
    // queue.previous is appended-to-end on each track end, so the most-recent
    // previous is the *last* element.
    const prev = (player.queue.previous || []);
    const previousTrack = prev[prev.length - 1] || prev[0];
    if (!previousTrack) return null;
    await player.queue.add(previousTrack, 0);
    await player.skip();
    return previousTrack;
}

function buildResponse(track) {
    return new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# <:Skipprev:1473039272193032402> Playing Previous\n\n**${track.info.title}**\n-# Duration: \`${formatTime(track.info.duration || 0)}\``
        )
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('previous')
        .setDescription('Play the previous track'),

    prefix: 'previous',
    description: 'Play the previous track',
    usage: 'previous',
    category: 'music',
    aliases: ['prev'],

    async execute(interaction, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(interaction.guild.id);
            if (!player) return interaction.reply({ components: [buildErrorResponse('No Player', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            const voiceErr = voiceErrorMessage(interaction.member, player);
            if (voiceErr) return interaction.reply({ components: [buildErrorResponse('Voice Required', voiceErr)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

            const track = await playPrevious(player);
            if (!track) {
                return interaction.reply({ components: [buildErrorResponse('No History', 'No previous track available.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            return interaction.reply({ components: [buildResponse(track)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Previous Error:', error);
            const reply = { components: [buildErrorResponse('Previous Error', error.message || 'Unknown error')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
            if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
            else await interaction.reply(reply).catch(() => {});
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(message.guild.id);
            if (!player) return message.reply({ components: [buildErrorResponse('No Player', 'Nothing is playing.')], flags: MessageFlags.IsComponentsV2 });
            const voiceErr = voiceErrorMessage(message.member, player);
            if (voiceErr) return message.reply({ components: [buildErrorResponse('Voice Required', voiceErr)], flags: MessageFlags.IsComponentsV2 });

            const track = await playPrevious(player);
            if (!track) {
                return message.reply({ components: [buildErrorResponse('No History', 'No previous track available.')], flags: MessageFlags.IsComponentsV2 });
            }
            return message.reply({ components: [buildResponse(track)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Previous Error:', error);
            return message.reply({ components: [buildErrorResponse('Previous Error', error.message || 'Unknown error')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }
};
