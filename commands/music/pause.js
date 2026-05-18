const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');
const { updateVoiceChannelStatus } = require('../../utils/musicPanel');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause the current song'),
    
    prefix: 'pause',
    description: 'Pause the current song',
    usage: 'pause',
    category: 'music',
    aliases: ['ps'],
    
    async execute(interaction, lavalinkManager) {
        const player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player) {
            const container = buildErrorResponse('No Music Playing', 'There is no music currently playing.');
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        
        if (!interaction.member.voice.channel) {
            const container = buildErrorResponse('Not in Voice Channel', 'You need to be in a voice channel to use this command.');
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        
        const currentTrack = player.queue.current;
        if (!currentTrack) {
            const container = buildErrorResponse('No Track Playing', 'No track is currently playing.');
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        if (player.paused) {
            const container = buildErrorResponse('Already Paused', 'The music is already paused. Use `/resume` to continue playing.');
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        await player.pause();
        
        await updateVoiceChannelStatus(interaction.client, player);
        
        let content = `# <:Pause:1473039275829366815> Music Paused\n\n`;
        content += `**Track:** ${currentTrack.info.title}\n`;
        content += `**Artist:** ${currentTrack.info.author || 'Unknown'}\n\n`;
        content += `> Use \`/resume\` to continue playing`;
        
        const container = new ContainerBuilder()
            .setAccentColor(COLORS.WARNING)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
        
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        if (!player) {
            const container = buildErrorResponse('No Music Playing', 'There is no music currently playing.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        if (!message.member.voice.channel) {
            const container = buildErrorResponse('Not in Voice Channel', 'You need to be in a voice channel to use this command.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const currentTrack = player.queue.current;
        if (!currentTrack) {
            const container = buildErrorResponse('No Track Playing', 'No track is currently playing.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (player.paused) {
            const container = buildErrorResponse('Already Paused', 'The music is already paused. Use `-resume` to continue playing.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        await player.pause();
        
        await updateVoiceChannelStatus(message.client, player);
        
        let content = `# <:Pause:1473039275829366815> Music Paused\n\n`;
        content += `**Track:** ${currentTrack.info.title}\n`;
        content += `**Artist:** ${currentTrack.info.author || 'Unknown'}\n\n`;
        content += `> Use \`-resume\` to continue playing`;
        
        const container = new ContainerBuilder()
            .setAccentColor(COLORS.WARNING)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
        
        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
