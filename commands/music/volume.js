const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const { buildErrorResponse, buildInvalidUsage, COLORS } = require('../../utils/responseBuilder');
const { voiceErrorMessage } = require('../../utils/musicHelpers');

function volumeIcon(v) {
    if (v === 0)  return '<:Volumeoff:1473039301414621427>';
    if (v < 50)   return '<:Volumedown:1473039303691993233>';
    if (v < 100)  return '<:Volumedown:1473039303691993233>';
    if (v <= 150) return '<:Volumeup:1473039290136002844>';
    return '<:Volumeup:1473039290136002844>';
}

function buildContainer(volume, oldVolume) {
    const filled = Math.min(20, Math.max(0, Math.floor(volume / 10)));
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
    const warn = volume > 150 ? `\n\n> <:Infotriangle:1473038460456800459> High volume — protect your hearing.` : '';
    const content =
        `# ${volumeIcon(volume)} Volume Changed\n\n` +
        `**Previous:** ${oldVolume}%\n` +
        `**New:** ${volume}%\n\n` +
        `\`${bar}\` ${volume}%${warn}`;
    return new ContainerBuilder()
        .setAccentColor(COLORS.SUCCESS)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Set the playback volume')
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Volume level (0-200)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(200)),

    prefix: 'volume',
    description: 'Set the playback volume',
    usage: 'volume <0-200>',
    category: 'music',
    aliases: ['vol', 'v'],

    async execute(interaction, lavalinkManager) {
        const player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player) return interaction.reply({ components: [buildErrorResponse('No Music Playing', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        const voiceErr = voiceErrorMessage(interaction.member, player);
        if (voiceErr) return interaction.reply({ components: [buildErrorResponse('Voice Required', voiceErr)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        const volume = interaction.options.getInteger('level');
        const oldVolume = player.volume || 100;
        await player.setVolume(volume);
        return interaction.reply({ components: [buildContainer(volume, oldVolume)], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        if (!player) return message.reply({ components: [buildErrorResponse('No Music Playing', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 });
        const voiceErr = voiceErrorMessage(message.member, player);
        if (voiceErr) return message.reply({ components: [buildErrorResponse('Voice Required', voiceErr)], flags: MessageFlags.IsComponentsV2 });

        const volume = parseInt(args[0]);
        if (isNaN(volume) || volume < 0 || volume > 200) {
            return message.reply({ components: [buildInvalidUsage('volume', '-volume <0-200>', ['-volume 50', '-volume 100', '-volume 150'])], flags: MessageFlags.IsComponentsV2 });
        }
        const oldVolume = player.volume || 100;
        await player.setVolume(volume);
        return message.reply({ components: [buildContainer(volume, oldVolume)], flags: MessageFlags.IsComponentsV2 });
    }
};
