const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { voiceErrorMessage, buildEQ } = require('../../utils/musicHelpers');

function applyBass(player, level) {
    const gain = level * 0.2;
    return player.filterManager.setEQ(buildEQ({
        0: gain,
        1: gain * 0.8,
        2: gain * 0.6,
    }));
}

function buildContainer(level) {
    return new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# <:Volumeup:1473039290136002844> Bass Boost — Level ${level}/5\n\n` +
            `Low frequencies enhanced. Pair with **Speakers / Headphones** for best results.\n` +
            `-# Use \`/bassboost 0\` or \`/filters clear\` to reset.`
        )
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bassboost')
        .setDescription('Apply bass boost to the music')
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Bass boost level (0-5, 0 disables)')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(5)),

    prefix: 'bassboost',
    description: 'Apply bass boost to the music',
    usage: 'bassboost [0-5]',
    category: 'music',
    aliases: ['bb', 'bass'],

    async execute(interaction, lavalinkManager) {
        const player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player) return interaction.reply({ components: [buildErrorResponse('No Player', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        const voiceErr = voiceErrorMessage(interaction.member, player);
        if (voiceErr) return interaction.reply({ components: [buildErrorResponse('Voice Required', voiceErr)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        const level = interaction.options.getInteger('level') ?? 3;
        try {
            await applyBass(player, level);
            return interaction.reply({ components: [buildContainer(level)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Bass boost error:', error);
            return interaction.reply({ components: [buildErrorResponse('Filter Failed', 'Could not apply bass boost.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        if (!player) return message.reply({ components: [buildErrorResponse('No Player', 'Nothing is playing.')], flags: MessageFlags.IsComponentsV2 });
        const voiceErr = voiceErrorMessage(message.member, player);
        if (voiceErr) return message.reply({ components: [buildErrorResponse('Voice Required', voiceErr)], flags: MessageFlags.IsComponentsV2 });

        const raw = args[0];
        const level = raw == null ? 3 : parseInt(raw);
        if (!Number.isFinite(level) || level < 0 || level > 5) {
            return message.reply({ components: [buildErrorResponse('Invalid Level', 'Bass level must be between 0 and 5.')], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            await applyBass(player, level);
            return message.reply({ components: [buildContainer(level)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Bass boost error:', error);
            return message.reply({ components: [buildErrorResponse('Filter Failed', 'Could not apply bass boost.')], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
