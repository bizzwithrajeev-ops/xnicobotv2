const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');
const { buildMusicSuccess, EMOJIS, getPlatformInfo, truncateText } = require('../../utils/musicPanel');
const { formatTime } = require('../../utils/helpers');

const jsonStore = require('../../utils/jsonStore');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip to the next song'),
    
    prefix: 'skip',
    description: 'Skip to the next song',
    usage: 'skip',
    category: 'music',
    aliases: ['s', 'next'],
    
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

        try {
            if (!player.queue || !player.queue.tracks || !player.queue.tracks.length) {
                let shouldStay = false;
                if (jsonStore.has('musicpanel-247')) {
                    try {
                        const config247 = jsonStore.read('musicpanel-247');
                        shouldStay = config247[interaction.guild.id]?.enabled || false;
                    } catch (e) {
                        console.error('Error reading 24/7 config:', e);
                    }
                }
                
                if (shouldStay) {
                    if (player.queue.current) {
                        try {
                            await player.stopPlaying();
                        } catch (skipError) {
                            console.error('Skip error in 24/7 mode:', skipError);
                        }
                    }
                    
                    let content = `# <:Skipnext:1473039269726785737> Skipped\n\n`;
                    content += `No more songs in queue.\n`;
                    content += `> <:Refresh:1473037911581528165> Bot staying in **24/7 mode**`;
                    
                    const container = new ContainerBuilder()
                        .setAccentColor(COLORS.SUCCESS)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
                    return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                } else {
                    await player.destroy();
                    
                    let content = `# <:Skipnext:1473039269726785737> Skipped\n\n`;
                    content += `No more songs in queue.\n`;
                    content += `> Left the voice channel`;
                    
                    const container = new ContainerBuilder()
                        .setAccentColor(COLORS.SUCCESS)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
                    return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                }
            }

            const nextTrack = player.queue.tracks[0];
            await player.skip();
            
            const platform = getPlatformInfo(nextTrack?.info?.sourceName);
            let content = `# ${EMOJIS.next} Skipped\n\n`;
            content += `### Now Playing\n`;
            content += `${platform.icon} **${truncateText(nextTrack?.info?.title, 45)}**\n`;
            content += `-# by ${truncateText(nextTrack?.info?.author, 35)} • \`${formatTime(nextTrack?.info?.duration || 0)}\``;
            
            const container = new ContainerBuilder()
                .setAccentColor(COLORS.SUCCESS)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
            
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Skip command error:', error);
            const container = buildErrorResponse('Skip Failed', 'An error occurred while skipping.', error.message);
            if (!interaction.replied && !interaction.deferred) {
                return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(console.error);
            }
        }
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

        try {
            if (!player.queue || !player.queue.tracks || !player.queue.tracks.length) {
                let shouldStay = false;
                if (jsonStore.has('musicpanel-247')) {
                    try {
                        const config247 = jsonStore.read('musicpanel-247');
                        shouldStay = config247[message.guild.id]?.enabled || false;
                    } catch (e) {
                        console.error('Error reading 24/7 config:', e);
                    }
                }
                
                if (shouldStay) {
                    if (player.queue.current) {
                        try {
                            await player.stopPlaying();
                        } catch (skipError) {
                            console.error('Skip error in 24/7 mode:', skipError);
                        }
                    }
                    
                    let content = `# <:Skipnext:1473039269726785737> Skipped\n\n`;
                    content += `No more songs in queue.\n`;
                    content += `> <:Refresh:1473037911581528165> Bot staying in **24/7 mode**`;
                    
                    const container = new ContainerBuilder()
                        .setAccentColor(COLORS.SUCCESS)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
                    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                } else {
                    await player.destroy();
                    
                    let content = `# <:Skipnext:1473039269726785737> Skipped\n\n`;
                    content += `No more songs in queue.\n`;
                    content += `> Left the voice channel`;
                    
                    const container = new ContainerBuilder()
                        .setAccentColor(COLORS.SUCCESS)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
                    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                }
            }

            const nextTrack = player.queue.tracks[0];
            await player.skip();
            
            const platform = getPlatformInfo(nextTrack?.info?.sourceName);
            let content = `# ${EMOJIS.next} Skipped\n\n`;
            content += `### Now Playing\n`;
            content += `${platform.icon} **${truncateText(nextTrack?.info?.title, 45)}**\n`;
            content += `-# by ${truncateText(nextTrack?.info?.author, 35)} • \`${formatTime(nextTrack?.info?.duration || 0)}\``;
            
            const container = new ContainerBuilder()
                .setAccentColor(COLORS.SUCCESS)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
            
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Skip command error:', error);
            const container = buildErrorResponse('Skip Failed', 'An error occurred while skipping.', error.message);
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(console.error);
        }
    }
};
