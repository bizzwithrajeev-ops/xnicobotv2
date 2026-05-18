const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');

module.exports = {
    prefix: 'loop',
    description: 'Set loop/repeat mode',
    usage: 'loop <off/track/queue>',
    category: 'music',
    aliases: ['lp', 'rp'],
    
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Set loop/repeat mode')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Loop mode')
                .setRequired(true)
                .addChoices(
                    { name: 'Off', value: 'off' },
                    { name: 'Track', value: 'track' },
                    { name: 'Queue', value: 'queue' }
                )),
    
    async execute(interaction, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(interaction.guild.id);
            if (!player) return interaction.reply({ components: [buildErrorResponse('No Player', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            if (!interaction.member.voice.channel) return interaction.reply({ components: [buildErrorResponse('Voice Required', 'You need to be in a voice channel.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

            const mode = interaction.options.getString('mode');
            
            player.setRepeatMode(mode);

            const loopIcon = mode === 'track' ? '<:Refresh:1473037911581528165>' : mode === 'queue' ? '<:Refresh:1473037911581528165>' : '<:next:1417485139595890728>';
            const modeText = mode === 'track' ? 'Track' : mode === 'queue' ? 'Queue' : 'Off';

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# ${loopIcon} Loop Mode Changed\n\nLoop is now set to: **${modeText}**`)
                );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Loop Error:', error);
            const msg = error.message || 'An unknown error occurred';
            if (interaction.replied || interaction.deferred) await interaction.followUp({ components: [buildErrorResponse('Error', msg)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
            else await interaction.reply({ components: [buildErrorResponse('Error', msg)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(message.guild.id);
            if (!player) return message.reply({ components: [buildErrorResponse('No Player', 'Nothing is playing!')], flags: MessageFlags.IsComponentsV2 });
            if (!message.member.voice.channel) return message.reply({ components: [buildErrorResponse('Voice Required', 'You need to be in a voice channel!')], flags: MessageFlags.IsComponentsV2 });

            const mode = args[0]?.toLowerCase();
            if (!mode || !['off', 'track', 'queue'].includes(mode)) {
                return message.reply({ components: [buildErrorResponse('Missing Input', 'Please specify a valid mode: `off`, `track`, or `queue`')], flags: MessageFlags.IsComponentsV2 });
            }

            player.setRepeatMode(mode);

            const loopIcon = mode === 'track' ? '<:Refresh:1473037911581528165>' : mode === 'queue' ? '<:Refresh:1473037911581528165>' : '<:next:1417485139595890728>';
            const modeText = mode === 'track' ? 'Track' : mode === 'queue' ? 'Queue' : 'Off';

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# ${loopIcon} Loop Mode Changed\n\nLoop is now set to: **${modeText}**`)
                );

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Loop Error:', error);
            message.reply({ components: [buildErrorResponse('Error', `An error occurred: ${error.message || 'Unknown error'}`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }
};
