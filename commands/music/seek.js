const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { parseTime, formatTime } = require('../../utils/helpers');

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
                .setDescription('Time to seek to (e.g., 1:30)')
                .setRequired(true)),
    
    async execute(interaction, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(interaction.guild.id);
            if (!player || !player.queue.current) return interaction.reply({ components: [buildErrorResponse('No Player', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            if (!interaction.member.voice.channel) return interaction.reply({ components: [buildErrorResponse('Voice Required', 'You need to be in a voice channel.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

            const time = interaction.options.getString('time');
            const ms = parseTime(time);
            const duration = player.queue.current.info.duration;
            
            if (duration === 0 || player.queue.current.info.isStream) {
                return interaction.reply({ components: [buildErrorResponse('Cannot Seek', 'Cannot seek on live streams.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            if (ms === null || ms > duration) {
                return interaction.reply({ components: [buildErrorResponse('Invalid Time', 'Invalid time format or exceeds duration.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            await player.seek(ms);
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Fastforward:1473039306292723976> Seeked\n\n**Track:** ${player.queue.current.info.title}\n**Position:** ${formatTime(ms)}`)
                );
            
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Seek Error:', error);
            const msg = error.message || 'An unknown error occurred';
            if (interaction.replied || interaction.deferred) await interaction.followUp({ components: [buildErrorResponse('Error', msg)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
            else await interaction.reply({ components: [buildErrorResponse('Error', msg)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(message.guild.id);
            if (!player || !player.queue.current) return message.reply({ components: [buildErrorResponse('No Player', 'Nothing is playing!')], flags: MessageFlags.IsComponentsV2 });
            if (!message.member.voice.channel) return message.reply({ components: [buildErrorResponse('Voice Required', 'You need to be in a voice channel!')], flags: MessageFlags.IsComponentsV2 });

            const time = args[0];
            if (!time) return message.reply({ components: [buildErrorResponse('Missing Input', 'Please provide a time! (e.g., 1:30)')], flags: MessageFlags.IsComponentsV2 });

            const ms = parseTime(time);
            const duration = player.queue.current.info.duration;
            if (duration === 0 || player.queue.current.info.isStream) {
                return message.reply({ components: [buildErrorResponse('Error', 'Cannot seek on live streams!')], flags: MessageFlags.IsComponentsV2 });
            }
            if (ms === null || ms > duration) {
                return message.reply({ components: [buildErrorResponse('Invalid Input', 'Invalid time format or time exceeds song duration!')], flags: MessageFlags.IsComponentsV2 });
            }

            await player.seek(ms);
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Fastforward:1473039306292723976> Seeked\n\n**Track:** ${player.queue.current.info.title}\n**Position:** ${formatTime(ms)}`)
                );

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Seek Error:', error);
            message.reply({ components: [buildErrorResponse('Error', `An error occurred: ${error.message || 'Unknown error'}`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }
};
