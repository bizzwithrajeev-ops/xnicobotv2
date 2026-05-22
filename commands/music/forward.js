const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { formatTime, voiceErrorMessage } = require('../../utils/musicHelpers');

async function doForward(player, member, seconds) {
    if (!player || !player.queue.current) return { error: { title: 'No Player', body: 'Nothing is playing.' } };

    const voiceErr = voiceErrorMessage(member, player);
    if (voiceErr) return { error: { title: 'Voice Required', body: voiceErr } };

    if (player.queue.current.info.isStream || (player.queue.current.info.duration || 0) === 0) {
        return { error: { title: 'Cannot Seek', body: 'Cannot seek inside a live stream.' } };
    }

    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 600) {
        return { error: { title: 'Invalid Input', body: 'Provide a value between 1 and 600 seconds.' } };
    }

    const duration = player.queue.current.info.duration;
    const newPosition = Math.min(duration - 1000, (player.position || 0) + seconds * 1000);
    await player.seek(Math.max(0, newPosition));
    return { newPosition };
}

function buildResponse(seconds, position) {
    return new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# <:Fastforward:1473039306292723976> Fast Forward\n\nMoved forward **${seconds}s**.\n-# Position: \`${formatTime(position)}\``
        )
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('forward')
        .setDescription('Skip forward in the current track')
        .addIntegerOption(o => o.setName('seconds')
            .setDescription('Seconds to skip forward (1-600, default 10)')
            .setMinValue(1).setMaxValue(600)),

    prefix: 'forward',
    description: 'Skip forward in the current track',
    usage: 'forward [seconds]',
    category: 'music',
    aliases: ['ff', 'fwd'],

    async execute(interaction, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(interaction.guild.id);
            const seconds = interaction.options.getInteger('seconds') || 10;
            const result = await doForward(player, interaction.member, seconds);
            if (result.error) {
                return interaction.reply({ components: [buildErrorResponse(result.error.title, result.error.body)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            return interaction.reply({ components: [buildResponse(seconds, result.newPosition)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Forward Error:', error);
            const reply = { components: [buildErrorResponse('Forward Error', error.message || 'Unknown error')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
            if (interaction.replied || interaction.deferred) return interaction.followUp(reply).catch(() => {});
            return interaction.reply(reply).catch(() => {});
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(message.guild.id);
            const seconds = parseInt(args[0]) || 10;
            const result = await doForward(player, message.member, seconds);
            if (result.error) {
                return message.reply({ components: [buildErrorResponse(result.error.title, result.error.body)], flags: MessageFlags.IsComponentsV2 });
            }
            return message.reply({ components: [buildResponse(seconds, result.newPosition)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Forward Error:', error);
            return message.reply({ components: [buildErrorResponse('Forward Error', error.message || 'Unknown error')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }
};
