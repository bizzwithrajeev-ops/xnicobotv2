const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pitch')
        .setDescription('Change the pitch of the music')
        .addNumberOption(option =>
            option.setName('value')
                .setDescription('Pitch value (0.5 - 2.0, default: 1.0)')
                .setRequired(true)
                .setMinValue(0.5)
                .setMaxValue(2.0)),
    
    async execute(interaction, lavalinkManager) {
        const player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player || !player.queue.current) {
            return interaction.reply({ components: [buildErrorResponse('No Player', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        if (!interaction.member.voice.channel) {
            return interaction.reply({ components: [buildErrorResponse('Voice Required', 'You need to be in a voice channel.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const pitch = interaction.options.getNumber('value');

        try {
            await player.filterManager.setTimescale({ pitch });

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Music:1473039311057190972> Pitch Changed\n\n**Pitch Level:** ${pitch}x\n**Track:** ${player.queue.current.info.title}\n\n*Tip: Use 1.0 for normal pitch*`)
                );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            await interaction.reply({ components: [buildErrorResponse('Error', 'Failed to change pitch! The player might not support this feature.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        if (!player || !player.queue.current) {
            return message.reply({ components: [buildErrorResponse('No Player', 'Nothing is playing!')], flags: MessageFlags.IsComponentsV2 });
        }
        if (!message.member.voice.channel) {
            return message.reply({ components: [buildErrorResponse('Voice Required', 'You need to be in a voice channel!')], flags: MessageFlags.IsComponentsV2 });
        }

        const pitch = parseFloat(args[0]);
        if (isNaN(pitch) || pitch < 0.5 || pitch > 2.0) {
            return message.reply({ components: [buildErrorResponse('Missing Input', 'Please provide a valid pitch between 0.5 and 2.0!\nExample: `-pitch 1.2`')], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            await player.filterManager.setTimescale({ pitch });

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Music:1473039311057190972> Pitch Changed\n\n**Pitch Level:** ${pitch}x\n**Track:** ${player.queue.current.info.title}\n\n*Tip: Use 1.0 for normal pitch*`)
                );

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            message.reply({ components: [buildErrorResponse('Failed', 'Failed to change pitch! The player might not support this feature.')], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
