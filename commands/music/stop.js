const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const { updateMusicPanel, updateVoiceChannelStatus } = require('../../utils/musicPanel');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');
const { voiceErrorMessage } = require('../../utils/musicHelpers');
const jsonStore = require('../../utils/jsonStore');

function read247Enabled(guildId) {
    try {
        if (!jsonStore.has('musicpanel-247')) return false;
        const cfg = jsonStore.read('musicpanel-247');
        return !!cfg?.[guildId]?.enabled;
    } catch { return false; }
}

function clearQueue(player) {
    const tracks = player.queue?.tracks;
    if (!tracks) return 0;
    const len = tracks.length;
    if (typeof player.queue.splice === 'function') {
        player.queue.splice(0, len);
    } else {
        tracks.splice(0, len);
    }
    return len;
}

function buildResultContainer(queueSize, mode) {
    let content = `# <:Cancel:1473037949187657818> Music Stopped\n\n`;
    content += `Cleared **${queueSize}** track${queueSize !== 1 ? 's' : ''} from the queue.\n\n`;
    if (mode === '247') content += `> <:Refresh:1473037911581528165> Bot staying in **24/7 mode**`;
    else                content += `> Left the voice channel`;
    return new ContainerBuilder()
        .setAccentColor(COLORS.ERROR)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

async function performStop(client, player, guildId) {
    const queueSize = player.queue?.tracks?.length || 0;
    const stay = read247Enabled(guildId);
    if (stay) {
        clearQueue(player);
        try { await player.stopPlaying(); } catch {}
        await updateVoiceChannelStatus(client, player, 'waiting');
        setTimeout(async () => {
            try { await updateMusicPanel(client, null, client.autoplayStatus || new Map(), guildId); } catch {}
        }, 500);
        return { queueSize, mode: '247' };
    }
    try { await player.destroy(); } catch {}
    return { queueSize, mode: 'left' };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop the music and clear the queue'),

    prefix: 'stop',
    description: 'Stop the music and clear the queue',
    usage: 'stop',
    category: 'music',
    aliases: ['disconnect', 'dc', 'leave', 'lv', 'bye'],

    async execute(interaction, lavalinkManager) {
        const player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player) return interaction.reply({ components: [buildErrorResponse('No Music Playing', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        const voiceErr = voiceErrorMessage(interaction.member, player);
        if (voiceErr) return interaction.reply({ components: [buildErrorResponse('Voice Required', voiceErr)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        const r = await performStop(interaction.client, player, interaction.guild.id);
        return interaction.reply({ components: [buildResultContainer(r.queueSize, r.mode)], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        if (!player) return message.reply({ components: [buildErrorResponse('No Music Playing', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 });
        const voiceErr = voiceErrorMessage(message.member, player);
        if (voiceErr) return message.reply({ components: [buildErrorResponse('Voice Required', voiceErr)], flags: MessageFlags.IsComponentsV2 });

        const r = await performStop(message.client, player, message.guild.id);
        return message.reply({ components: [buildResultContainer(r.queueSize, r.mode)], flags: MessageFlags.IsComponentsV2 });
    }
};
