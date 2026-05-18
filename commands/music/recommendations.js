const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('recommendations')
        .setDescription('Get song recommendations based on what\'s playing')
        .addIntegerOption(option =>
            option.setName('count')
                .setDescription('Number of recommendations (1-10)')
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(false)),

    async execute(interaction, lavalinkManager) {
        const player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player || !player.queue.current) {
            return interaction.reply({ components: [buildErrorResponse('Error', 'Nothing is playing! Play a song first to get recommendations.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        if (!lavalinkManager.useable) {
            return interaction.reply({ components: [buildErrorResponse('Music Unavailable', 'No music servers are connected right now. Please try again in a moment.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        await interaction.deferReply();

        const currentTrack = player.queue.current;
        const count = interaction.options.getInteger('count') || 5;

        const searchQueries = [
            `${currentTrack.info.author} songs`,
            `${currentTrack.info.title.split('(')[0].trim()} similar`,
            `${currentTrack.info.author} top tracks`,
            `songs like ${currentTrack.info.title.substring(0, 30)}`
        ];

        const recommendations = [];
        const currentUri = currentTrack.info.uri;

        for (const query of searchQueries) {
            if (recommendations.length >= count) break;

            try {
                const result = await Promise.race([
                    player.search({ query: `ytsearch:${query}` }, interaction.user),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Search timed out')), 15000))
                ]);
                
                if (result && result.tracks && result.tracks.length > 0) {
                    for (const track of result.tracks) {
                        if (track.info.uri !== currentUri && 
                            !recommendations.some(r => r.info.uri === track.info.uri) &&
                            !player.queue.tracks.some(q => q.info.uri === track.info.uri)) {
                            recommendations.push(track);
                            if (recommendations.length >= count) break;
                        }
                    }
                }
            } catch (e) {}
        }

        if (recommendations.length === 0) {
            try {
                const fallbackResult = await Promise.race([
                    player.search({ query: `ytsearch:${currentTrack.info.author} mix` }, interaction.user),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Search timed out')), 15000))
                ]);
                if (fallbackResult && fallbackResult.tracks) {
                    for (const track of fallbackResult.tracks.slice(0, count)) {
                        if (track.info.uri !== currentUri) {
                            recommendations.push(track);
                        }
                    }
                }
            } catch (e) {}
        }

        if (recommendations.length === 0) {
            return interaction.editReply({ components: [buildErrorResponse('No Results', 'Could not find recommendations. Try a different song.')], flags: MessageFlags.IsComponentsV2 });
        }

        let content = `# <:spotify:1473663456182800446> Recommendations\n\n`;
        content += `-# Based on: **${currentTrack.info.title.substring(0, 40)}** by ${currentTrack.info.author}\n\n`;

        recommendations.forEach((track, i) => {
            const title = (track.info.title || 'Unknown').substring(0, 45) + ((track.info.title || '').length > 45 ? '...' : '');
            const duration = formatTime(track.info.duration);
            content += `**${i + 1}.** ${title}\n`;
            content += `-# by ${track.info.author || 'Unknown'} • ${duration}\n\n`;
        });

        content += `-# Click buttons to add songs to queue`;

        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        const row1 = new ActionRowBuilder();
        const row2 = recommendations.length > 5 ? new ActionRowBuilder() : null;

        recommendations.forEach((track, i) => {
            const button = new ButtonBuilder()
                .setCustomId(`rec_add_${i}`)
                .setLabel(`${i + 1}`)
                .setStyle(ButtonStyle.Secondary);
            
            if (i < 5) {
                row1.addComponents(button);
            } else if (row2) {
                row2.addComponents(button);
            }
        });

        const addAllButton = new ButtonBuilder()
            .setCustomId('rec_add_all')
            .setLabel('Add All')
            .setEmoji('<:Play:1473039266081800303>')
            .setStyle(ButtonStyle.Success);

        if (row2 && row2.components.length < 5) {
            row2.addComponents(addAllButton);
        } else if (row1.components.length < 5) {
            row1.addComponents(addAllButton);
        }

        container.addActionRowComponents(row1);
        if (row2 && row2.components.length > 0) {
            container.addActionRowComponents(row2);
        }

        const response = await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        interaction.client.recommendationCache = interaction.client.recommendationCache || new Map();
        interaction.client.recommendationCache.set(response.id, {
            tracks: recommendations,
            userId: interaction.user.id,
            expires: Date.now() + 300000
        });
    },

    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        if (!player || !player.queue.current) {
            return message.reply({ components: [buildErrorResponse('No Player', 'Nothing is playing! Play a song first to get recommendations.')], flags: MessageFlags.IsComponentsV2 });
        }

        if (!lavalinkManager.useable) {
            return message.reply({ components: [buildErrorResponse('Music Unavailable', 'No music servers are connected right now. Please try again in a moment.')], flags: MessageFlags.IsComponentsV2 });
        }

        const count = parseInt(args[0]) || 5;
        const validCount = Math.min(Math.max(count, 1), 10);

        const currentTrack = player.queue.current;

        const searchQueries = [
            `${currentTrack.info.author} songs`,
            `songs like ${currentTrack.info.title.substring(0, 30)}`
        ];

        const recommendations = [];
        const currentUri = currentTrack.info.uri;

        for (const query of searchQueries) {
            if (recommendations.length >= validCount) break;

            try {
                const result = await Promise.race([
                    player.search({ query: `ytsearch:${query}` }, message.author),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Search timed out')), 15000))
                ]);
                
                if (result && result.tracks && result.tracks.length > 0) {
                    for (const track of result.tracks) {
                        if (track.info.uri !== currentUri && 
                            !recommendations.some(r => r.info.uri === track.info.uri)) {
                            recommendations.push(track);
                            if (recommendations.length >= validCount) break;
                        }
                    }
                }
            } catch (e) {}
        }

        if (recommendations.length === 0) {
            return message.reply({ components: [buildErrorResponse('Error', 'Could not find recommendations.')], flags: MessageFlags.IsComponentsV2 });
        }

        let content = `# <:spotify:1473663456182800446> Recommendations\n\n`;
        content += `-# Based on: **${currentTrack.info.title.substring(0, 40)}**\n\n`;

        recommendations.forEach((track, i) => {
            const title = (track.info.title || 'Unknown').substring(0, 45);
            content += `**${i + 1}.** ${title}\n`;
            content += `-# by ${track.info.author || 'Unknown'}\n\n`;
        });

        content += `-# Use \`play <song name>\` to add songs`;

        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};

function formatTime(ms) {
    if (!ms || ms === 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
