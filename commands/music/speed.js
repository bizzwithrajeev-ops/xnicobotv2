const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('speed')
        .setDescription('Change playback speed')
        .addNumberOption(option =>
            option.setName('value')
                .setDescription('Speed value (0.25 - 3.0, default: 1.0)')
                .setRequired(true)
                .setMinValue(0.25)
                .setMaxValue(3.0)),
    
    async execute(interaction, lavalinkManager) {
        const player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player || !player.queue.current) {
            return interaction.reply({ components: [buildErrorResponse('No Player', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        if (!interaction.member.voice.channel) {
            return interaction.reply({ components: [buildErrorResponse('Voice Required', 'You need to be in a voice channel.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const speed = interaction.options.getNumber('value');

        try {
            await player.filterManager.setTimescale({ speed });

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Lightningalt:1473038679906844824> Speed Changed\n\n**Playback Speed:** ${speed}x\n**Track:** ${player.queue.current.info.title}\n\n*Tip: Use 1.0 for normal speed*`)
                );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            await interaction.reply({ components: [buildErrorResponse('Error', 'Failed to change speed! The player might not support this feature.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
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

        const speed = parseFloat(args[0]);
        if (isNaN(speed) || speed < 0.25 || speed > 3.0) {
            return message.reply({ components: [buildErrorResponse('Missing Input', 'Please provide a valid speed between 0.25 and 3.0!\nExample: `-speed 1.5`')], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            await player.filterManager.setTimescale({ speed });

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Lightningalt:1473038679906844824> Speed Changed\n\n**Playback Speed:** ${speed}x\n**Track:** ${player.queue.current.info.title}\n\n*Tip: Use 1.0 for normal speed*`)
                );

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            message.reply({ components: [buildErrorResponse('Failed', 'Failed to change speed! The player might not support this feature.')], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
