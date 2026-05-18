const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');

module.exports = {
    prefix: 'join',
    description: 'Make the bot join your voice channel',
    usage: 'join',
    category: 'music',
    aliases: ['j', 'come', 'summon'],
    
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Make the bot join your voice channel'),
    
    async execute(interaction, lavalinkManager) {
        if (!interaction.member.voice.channel) {
            return interaction.reply({ components: [buildErrorResponse('Voice Required', 'You need to be in a voice channel.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        if (!lavalinkManager.useable) {
            return interaction.reply({ components: [buildErrorResponse('Music Unavailable', 'No music servers are connected right now. Please try again in a moment.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        try {
            let player = lavalinkManager.getPlayer(interaction.guild.id);
            
            if (player && player.voiceChannelId) {
                if (player.voiceChannelId === interaction.member.voice.channel.id) {
                    return interaction.reply({ components: [buildErrorResponse('Already Connected', "I'm already in your voice channel.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
                }
                await player.destroy();
            }

            player = await lavalinkManager.createPlayer({
                guildId: interaction.guild.id,
                voiceChannelId: interaction.member.voice.channel.id,
                textChannelId: interaction.channel.id,
                selfDeaf: true,
                selfMute: false,
                volume: 100
            });
            
            await player.connect();

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Joined Voice Channel\n\n**Channel:** ${interaction.member.voice.channel.name}\n**Status:** Ready to play music!`)
                );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            await interaction.reply({ components: [buildErrorResponse('Join Failed', 'Failed to join voice channel. Check my permissions.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        if (!message.member.voice.channel) {
            return message.reply({ components: [buildErrorResponse('Voice Required', 'You need to be in a voice channel!')], flags: MessageFlags.IsComponentsV2 });
        }

        if (!lavalinkManager.useable) {
            return message.reply({ components: [buildErrorResponse('Music Unavailable', 'No music servers are connected right now. Please try again in a moment.')], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            let player = lavalinkManager.getPlayer(message.guild.id);
            
            if (player && player.voiceChannelId) {
                if (player.voiceChannelId === message.member.voice.channel.id) {
                    return message.reply({ components: [buildErrorResponse('Already Set', "I'm already in your voice channel!")], flags: MessageFlags.IsComponentsV2 });
                }
                await player.destroy();
            }

            player = await lavalinkManager.createPlayer({
                guildId: message.guild.id,
                voiceChannelId: message.member.voice.channel.id,
                textChannelId: message.channel.id,
                selfDeaf: true,
                selfMute: false,
                volume: 100
            });
            
            await player.connect();

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Joined Voice Channel\n\n**Channel:** ${message.member.voice.channel.name}\n**Status:** Ready to play music!`)
                );

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            message.reply({ components: [buildErrorResponse('No Permission', 'Failed to join voice channel! Please check my permissions.')], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
