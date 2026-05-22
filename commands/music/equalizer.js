const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { voiceErrorMessage } = require('../../utils/musicHelpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('equalizer')
        .setDescription('Apply equalizer presets or reset')
        .addStringOption(option =>
            option.setName('preset')
                .setDescription('Select equalizer preset')
                .setRequired(true)
                .addChoices(
                    { name: 'Reset (Default)', value: 'reset' },
                    { name: 'Bass Boost', value: 'bass' },
                    { name: 'Treble Boost', value: 'treble' },
                    { name: 'Party', value: 'party' },
                    { name: 'Soft', value: 'soft' },
                    { name: 'Rock', value: 'rock' },
                    { name: 'Classical', value: 'classical' },
                    { name: 'Electronic', value: 'electronic' },
                    { name: 'Full Bass', value: 'fullbass' }
                )),
    
    async execute(interaction, lavalinkManager) {
        const player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player || !player.queue.current) {
            return interaction.reply({ components: [buildErrorResponse('No Player', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        {
            const __ve = voiceErrorMessage(interaction.member, lavalinkManager?.getPlayer?.(interaction.guild.id));
            if (__ve) return interaction.reply({ components: [buildErrorResponse('Voice Required', __ve)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const preset = interaction.options.getString('preset');

        const presets = {
            reset: Array(15).fill(0),
            bass: [0.6, 0.4, 0.3, 0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            treble: [0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
            party: [0.7, 0.7, 0, 0, 0, 0, 0, 0, 0.7, 0.7, 0.7, 0, 0, 0, 0.7],
            soft: [-0.25, 0, 0, 0, 0.25, 0.25, 0.25, 0.25, 0, 0, 0, 0, 0, 0, -0.25],
            rock: [0.3, 0.25, 0.2, 0.1, -0.05, -0.15, -0.15, 0, 0.1, 0.25, 0.35, 0.35, 0.35, 0.3, 0.3],
            classical: [0, 0, 0, 0, 0, 0, -0.05, -0.05, -0.05, 0, 0, 0.2, 0.25, 0.3, 0.3],
            electronic: [0.375, 0.35, 0.125, 0, -0.125, 0.25, -0.125, 0.25, 0.3, 0.35, 0.4, 0.4, 0.375, 0.35, 0.3],
            fullbass: [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0, 0, 0, 0, 0, 0, 0]
        };

        const presetNames = {
            reset: 'Default (Reset)',
            bass: 'Bass Boost',
            treble: 'Treble Boost',
            party: 'Party',
            soft: 'Soft',
            rock: 'Rock',
            classical: 'Classical',
            electronic: 'Electronic',
            fullbass: 'Full Bass'
        };

        try {
            const bands = presets[preset].map((gain, index) => ({ band: index, gain }));
            await player.filterManager.setEQ(bands);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Fire:1473038604812161218> Equalizer Applied\n\n**Preset:** ${presetNames[preset]}\n**Track:** ${player.queue.current.info.title}\n\n*Use \`reset\` to restore default sound*`)
                );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            await interaction.reply({ components: [buildErrorResponse('Equalizer Failed', 'Failed to apply equalizer. Player may not support this feature.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        if (!player || !player.queue.current) {
            return message.reply({ components: [buildErrorResponse('No Player', 'Nothing is playing!')], flags: MessageFlags.IsComponentsV2 });
        }
        {
            const __ve = voiceErrorMessage(message.member, lavalinkManager?.getPlayer?.(message.guild.id));
            if (__ve) return message.reply({ components: [buildErrorResponse('Voice Required', __ve)], flags: MessageFlags.IsComponentsV2 });
        }

        const preset = args[0]?.toLowerCase();

        const presets = {
            reset: Array(15).fill(0),
            bass: [0.6, 0.4, 0.3, 0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            treble: [0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
            party: [0.7, 0.7, 0, 0, 0, 0, 0, 0, 0.7, 0.7, 0.7, 0, 0, 0, 0.7],
            soft: [-0.25, 0, 0, 0, 0.25, 0.25, 0.25, 0.25, 0, 0, 0, 0, 0, 0, -0.25],
            rock: [0.3, 0.25, 0.2, 0.1, -0.05, -0.15, -0.15, 0, 0.1, 0.25, 0.35, 0.35, 0.35, 0.3, 0.3],
            classical: [0, 0, 0, 0, 0, 0, -0.05, -0.05, -0.05, 0, 0, 0.2, 0.25, 0.3, 0.3],
            electronic: [0.375, 0.35, 0.125, 0, -0.125, 0.25, -0.125, 0.25, 0.3, 0.35, 0.4, 0.4, 0.375, 0.35, 0.3],
            fullbass: [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0, 0, 0, 0, 0, 0, 0]
        };

        const presetNames = {
            reset: 'Default (Reset)',
            bass: 'Bass Boost',
            treble: 'Treble Boost',
            party: 'Party',
            soft: 'Soft',
            rock: 'Rock',
            classical: 'Classical',
            electronic: 'Electronic',
            fullbass: 'Full Bass'
        };

        if (!presets[preset]) {
            return message.reply({ components: [buildErrorResponse('Invalid Input', 'Invalid preset! Available: reset, bass, treble, party, soft, rock, classical, electronic, fullbass\nExample: `-equalizer bass`')], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            const bands = presets[preset].map((gain, index) => ({ band: index, gain }));
            await player.filterManager.setEQ(bands);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Fire:1473038604812161218> Equalizer Applied\n\n**Preset:** ${presetNames[preset]}\n**Track:** ${player.queue.current.info.title}\n\n*Use \`reset\` to restore default sound*`)
                );

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            message.reply({ components: [buildErrorResponse('Failed', 'Failed to apply equalizer! The player might not support this feature.')], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
