const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const { buildErrorResponse, buildInvalidUsage, COLORS } = require('../../utils/responseBuilder');

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
        if (!player) {
            const container = buildErrorResponse('No Music Playing', 'There is no music currently playing.');
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        
        if (!interaction.member.voice.channel) {
            const container = buildErrorResponse('Not in Voice Channel', 'You need to be in a voice channel to use this command.');
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const volume = interaction.options.getInteger('level');
        const oldVolume = player.volume || 100;
        await player.setVolume(volume);
        
        const volumeIcon = volume === 0 ? '<:Volumeoff:1473039301414621427>' : volume < 50 ? '<:Volumedown:1473039303691993233>' : volume < 100 ? '<:Volumedown:1473039303691993233>' : '<:Volumeup:1473039290136002844>';
        const volumeBar = '█'.repeat(Math.floor(volume / 10)) + '░'.repeat(20 - Math.floor(volume / 10));
        
        let content = `# ${volumeIcon} Volume Changed\n\n`;
        content += `**Previous:** ${oldVolume}%\n`;
        content += `**New:** ${volume}%\n\n`;
        content += `\`${volumeBar}\` ${volume}%`;
        
        const container = new ContainerBuilder()
            .setAccentColor(COLORS.SUCCESS)
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

        const volume = parseInt(args[0]);
        if (isNaN(volume) || volume < 0 || volume > 200) {
            const container = buildInvalidUsage(
                'volume',
                '-volume <0-200>',
                ['-volume 50', '-volume 100', '-volume 150']
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const oldVolume = player.volume || 100;
        await player.setVolume(volume);
        
        const volumeIcon = volume === 0 ? '<:Volumeoff:1473039301414621427>' : volume < 50 ? '<:Volumedown:1473039303691993233>' : volume < 100 ? '<:Volumedown:1473039303691993233>' : '<:Volumeup:1473039290136002844>';
        const volumeBar = '█'.repeat(Math.floor(volume / 10)) + '░'.repeat(20 - Math.floor(volume / 10));
        
        let content = `# ${volumeIcon} Volume Changed\n\n`;
        content += `**Previous:** ${oldVolume}%\n`;
        content += `**New:** ${volume}%\n\n`;
        content += `\`${volumeBar}\` ${volume}%`;
        
        const container = new ContainerBuilder()
            .setAccentColor(COLORS.SUCCESS)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
        
        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
