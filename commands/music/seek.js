const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { parseTime, formatTime, voiceErrorMessage } = require('../../utils/musicHelpers');

async function doSeek(player, member, time) {
    if (!player || !player.queue.current) return { error: { title: 'No Player', body: 'Nothing is playing.' } };
    const voiceErr = voiceErrorMessage(member, player);
    if (voiceErr) return { error: { title: 'Voice Required', body: voiceErr } };

    const duration = player.queue.current.info.duration;
    if (duration === 0 || player.queue.current.info.isStream) {
        return { error: { title: 'Cannot Seek', body: 'Cannot seek inside a live stream.' } };
    }
    if (!time) return { error: { title: 'Missing Input', body: 'Provide a time. Examples: `90`, `1:30`, `1m30s`.' } };

    const ms = parseTime(time);
    if (ms == null || ms < 0) return { error: { title: 'Invalid Time', body: 'Could not parse that time.\nFormats: `90` (seconds), `1:30`, `1:02:30`, `1m30s`.' } };
    if (ms > duration) return { error: { title: 'Out of Bounds', body: `That time is past the end of the track (\`${formatTime(duration)}\`).` } };

    await player.seek(ms);
    return { ms };
}

function buildResponse(player, ms) {
    const t = player.queue.current;
    return new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# <:Fastforward:1473039306292723976> Seeked\n\n**${t.info.title}**\n-# Position: \`${formatTime(ms)}\` / \`${formatTime(t.info.duration || 0)}\``
        )
    );
}

module.exports = {
    prefix: 'seek',
    description: 'Seek to a specific time in the song',
    usage: 'seek <time>',
    category: 'music',
    aliases: ['sk', 'goto'],

    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription('Seek to a specific time in the song')
        .addStringOption(option =>
            option.setName('time')
                .setDescription('Time to seek to (90, 1:30, 1m30s)')
                .setRequired(true)),

    async execute(interaction, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(interaction.guild.id);
            const time = interaction.options.getString('time');
            const result = await doSeek(player, interaction.member, time);
            if (result.error) {
                return interaction.reply({ components: [buildErrorResponse(result.error.title, result.error.body)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            return interaction.reply({ components: [buildResponse(player, result.ms)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Seek Error:', error);
            const reply = { components: [buildErrorResponse('Seek Error', error.message || 'Unknown error')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
            if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
            else await interaction.reply(reply).catch(() => {});
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(message.guild.id);
            const time = args[0];
            const result = await doSeek(player, message.member, time);
            if (result.error) {
                return message.reply({ components: [buildErrorResponse(result.error.title, result.error.body)], flags: MessageFlags.IsComponentsV2 });
            }
            return message.reply({ components: [buildResponse(player, result.ms)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Seek Error:', error);
            return message.reply({ components: [buildErrorResponse('Seek Error', error.message || 'Unknown error')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }
};
