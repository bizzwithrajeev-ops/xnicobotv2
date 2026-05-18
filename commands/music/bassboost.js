
const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bassboost')
        .setDescription('Apply bass boost to the music')
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Bass boost level (1-5)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(5)),
    
    async execute(interaction, lavalinkManager) {
        const player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player) return interaction.reply({ components: [buildErrorResponse('No Player', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        if (!interaction.member.voice.channel) return interaction.reply({ components: [buildErrorResponse('Voice Required', 'You need to be in a voice channel.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        const level = interaction.options.getInteger('level') || 3;
        const gain = level * 0.2;

        try {
            await player.filterManager.setEQ([
                { band: 0, gain: gain },
                { band: 1, gain: gain * 0.8 },
                { band: 2, gain: gain * 0.6 }
            ]);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Volumeup:1473039290136002844> Bass Boost Applied\n\n**Level:** ${level}/5\n**Status:** Bass enhanced!`)
                );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Bass boost error:', error);
            return interaction.reply({ components: [buildErrorResponse('Filter Failed', 'Could not apply bass boost. The music server may be unavailable.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        if (!player) return message.reply({ components: [buildErrorResponse('No Player', 'Nothing is playing!')], flags: MessageFlags.IsComponentsV2 });
        if (!message.member.voice.channel) return message.reply({ components: [buildErrorResponse('Voice Required', 'You need to be in a voice channel!')], flags: MessageFlags.IsComponentsV2 });

        const level = parseInt(args[0]) || 3;
        if (level < 1 || level > 5) {
            return message.reply({ components: [buildErrorResponse('Error', 'Bass level must be between 1 and 5!')], flags: MessageFlags.IsComponentsV2 });
        }

        const gain = level * 0.2;

        try {
            await player.filterManager.setEQ([
                { band: 0, gain: gain },
                { band: 1, gain: gain * 0.8 },
                { band: 2, gain: gain * 0.6 }
            ]);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Volumeup:1473039290136002844> Bass Boost Applied\n\n**Level:** ${level}/5\n**Status:** Bass enhanced!`)
                );

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Bass boost error:', error);
            return message.reply({ components: [buildErrorResponse('Filter Failed', 'Could not apply bass boost. The music server may be unavailable.')], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
