const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { formatTime, voiceErrorMessage } = require('../../utils/musicHelpers');

async function doBack(player, member, seconds) {
    if (!player || !player.queue.current) return { error: { title: 'No Player', body: 'Nothing is playing.' } };

    const voiceErr = voiceErrorMessage(member, player);
    if (voiceErr) return { error: { title: 'Voice Required', body: voiceErr } };

    if (player.queue.current.info.isStream || (player.queue.current.info.duration || 0) === 0) {
        return { error: { title: 'Cannot Seek', body: 'Cannot seek inside a live stream.' } };
    }

    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 600) {
        return { error: { title: 'Invalid Input', body: 'Provide a value between 1 and 600 seconds.' } };
    }

    const newPosition = Math.max(0, (player.position || 0) - seconds * 1000);
    await player.seek(newPosition);
    return { newPosition };
}

function buildResponse(seconds, position) {
    return new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# <:Fastrewind:1473039308620431682> Rewind\n\nMoved back **${seconds}s**.\n-# Position: \`${formatTime(position)}\``
        )
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('back')
        .setDescription('Rewind the current track')
        .addIntegerOption(o => o.setName('seconds')
            .setDescription('Seconds to rewind (1-600, default 10)')
            .setMinValue(1).setMaxValue(600)),

    prefix: 'back',
    description: 'Rewind the current track',
    usage: 'back [seconds]',
    category: 'music',
    aliases: ['rewind', 'rw'],

    async execute(interaction, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(interaction.guild.id);
            const seconds = interaction.options.getInteger('seconds') || 10;
            const result = await doBack(player, interaction.member, seconds);
            if (result.error) {
                return interaction.reply({ components: [buildErrorResponse(result.error.title, result.error.body)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            return interaction.reply({ components: [buildResponse(seconds, result.newPosition)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Back Error:', error);
            const reply = { components: [buildErrorResponse('Back Error', error.message || 'Unknown error')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
            if (interaction.replied || interaction.deferred) return interaction.followUp(reply).catch(() => {});
            return interaction.reply(reply).catch(() => {});
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(message.guild.id);
            const seconds = parseInt(args[0]) || 10;
            const result = await doBack(player, message.member, seconds);
            if (result.error) {
                return message.reply({ components: [buildErrorResponse(result.error.title, result.error.body)], flags: MessageFlags.IsComponentsV2 });
            }
            return message.reply({ components: [buildResponse(seconds, result.newPosition)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Back Error:', error);
            return message.reply({ components: [buildErrorResponse('Back Error', error.message || 'Unknown error')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }
};
