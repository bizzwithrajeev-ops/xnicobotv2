const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('filters')
        .setDescription('Apply audio filters to the music')
        .addStringOption(option =>
            option.setName('filter')
                .setDescription('Select a filter')
                .setRequired(false)
                .addChoices(
                    { name: 'Clear All', value: 'clear' },
                    { name: 'Bass Boost', value: 'bassboost' },
                    { name: 'Nightcore', value: 'nightcore' },
                    { name: 'Vaporwave', value: 'vaporwave' },
                    { name: '8D Audio', value: '8d' },
                    { name: 'Karaoke', value: 'karaoke' },
                    { name: 'Tremolo', value: 'tremolo' },
                    { name: 'Vibrato', value: 'vibrato' },
                    { name: 'China', value: 'china' },
                    { name: 'Chipmunk', value: 'chipmunk' },
                    { name: 'Daycore', value: 'daycore' },
                    { name: 'Distortion', value: 'distortion' },
                    { name: 'Soft', value: 'soft' },
                    { name: 'Pop', value: 'pop' },
                    { name: 'Party', value: 'party' },
                    { name: 'Electronic', value: 'electronic' }
                )),
    
    async execute(interaction, lavalinkManager) {
        if (!interaction.guild) return interaction.reply({ components: [buildErrorResponse('Server Only', 'This command can only be used in a server.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        
        const player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player) return interaction.reply({ components: [buildErrorResponse('No Player', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        if (!interaction.member.voice.channel) return interaction.reply({ components: [buildErrorResponse('Voice Required', 'You need to be in a voice channel.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        const filter = interaction.options.getString('filter');

        if (!filter) {
            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('filter_bassboost')
                        .setLabel('Bass Boost')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('<:Volumeup:1473039290136002844>'),
                    new ButtonBuilder()
                        .setCustomId('filter_nightcore')
                        .setLabel('Nightcore')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('<:Lightningalt:1473038679906844824>'),
                    new ButtonBuilder()
                        .setCustomId('filter_vaporwave')
                        .setLabel('Vaporwave')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🌊'),
                    new ButtonBuilder()
                        .setCustomId('filter_8d')
                        .setLabel('8D Audio')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('<:Fire:1473038604812161218>')
                );

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('filter_karaoke')
                        .setLabel('Karaoke')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('<:Microphone:1473039293088927996>'),
                    new ButtonBuilder()
                        .setCustomId('filter_tremolo')
                        .setLabel('Tremolo')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('<:Music:1473039311057190972>'),
                    new ButtonBuilder()
                        .setCustomId('filter_vibrato')
                        .setLabel('Vibrato')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('<:Music:1473039311057190972>'),
                    new ButtonBuilder()
                        .setCustomId('filter_china')
                        .setLabel('China')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🏮')
                );

            const row3 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('filter_distortion')
                        .setLabel('Distortion')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🌀'),
                    new ButtonBuilder()
                        .setCustomId('filter_pop')
                        .setLabel('Pop')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('<:Microphone:1473039293088927996>'),
                    new ButtonBuilder()
                        .setCustomId('filter_clear')
                        .setLabel('Clear All')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('<:Trash:1473038090074591293>')
                );

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Fire:1473038604812161218> Audio Filters\n\nSelect a filter to apply to the current track:\n\n**Available Filters:**\n<:Volumeup:1473039290136002844> Bass Boost • <:Lightningalt:1473038679906844824> Nightcore • 🌊 Vaporwave • <:Headphone:1473039296062689566> 8D\n<:Microphone:1473039293088927996> Karaoke • <:Music:1473039311057190972> Tremolo • <:Music:1473039311057190972> Vibrato • 🏮 China\n🌀 Distortion • <:Microphone:1473039293088927996> Pop`)
                )
                .addActionRowComponents(row1, row2, row3);

            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let filterName = '';
        
        if (filter === 'clear') {
            await player.filterManager.resetFilters();
            filterName = 'All filters cleared';
        } else if (filter === 'bassboost') {
            await player.filterManager.setEQ([
                { band: 0, gain: 0.4 },
                { band: 1, gain: 0.3 },
                { band: 2, gain: 0.2 }
            ]);
            filterName = 'Bass Boost';
        } else if (filter === 'nightcore') {
            await player.filterManager.setTimescale({ speed: 1.2, pitch: 1.2 });
            filterName = 'Nightcore';
        } else if (filter === 'vaporwave') {
            await player.filterManager.setTimescale({ speed: 0.8, pitch: 0.8 });
            filterName = 'Vaporwave';
        } else if (filter === '8d') {
            player.filterManager.data.rotation = { rotationHz: 0.2 }; player.filterManager.filters.rotation = true; await player.filterManager.applyPlayerFilters();
            filterName = '8D Audio';
        } else if (filter === 'karaoke') {
            player.filterManager.data.karaoke = { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 }; player.filterManager.filters.karaoke = true; await player.filterManager.applyPlayerFilters();
            filterName = 'Karaoke';
        } else if (filter === 'tremolo') {
            player.filterManager.data.tremolo = { frequency: 4.0, depth: 0.75 }; player.filterManager.filters.tremolo = true; await player.filterManager.applyPlayerFilters();
            filterName = 'Tremolo';
        } else if (filter === 'vibrato') {
            player.filterManager.data.vibrato = { frequency: 10.0, depth: 0.9 }; player.filterManager.filters.vibrato = true; await player.filterManager.applyPlayerFilters();
            filterName = 'Vibrato';
        } else if (filter === 'china') {
            await player.filterManager.setTimescale({ speed: 0.7, pitch: 1.3 });
            filterName = 'China';
        } else if (filter === 'chipmunk') {
            await player.filterManager.setTimescale({ speed: 1.3, pitch: 1.4 });
            filterName = 'Chipmunk';
        } else if (filter === 'daycore') {
            await player.filterManager.setTimescale({ speed: 0.75, pitch: 0.75 });
            filterName = 'Daycore';
        } else if (filter === 'distortion') {
            player.filterManager.data.distortion = { sinOffset: 0, sinScale: 1, cosOffset: 0, cosScale: 1, tanOffset: 0, tanScale: 1, offset: 0, scale: 1.2 };
            player.filterManager.filters.distortion = true;
            await player.filterManager.applyPlayerFilters();
            filterName = 'Distortion';
        } else if (filter === 'soft') {
            await player.filterManager.setEQ([
                { band: 0, gain: 0 },
                { band: 1, gain: 0 },
                { band: 2, gain: 0 },
                { band: 3, gain: 0 },
                { band: 4, gain: -0.15 },
                { band: 5, gain: -0.15 }
            ]);
            filterName = 'Soft';
        } else if (filter === 'pop') {
            await player.filterManager.setEQ([
                { band: 0, gain: -0.05 },
                { band: 1, gain: 0.1 },
                { band: 2, gain: 0.1 },
                { band: 3, gain: 0.15 },
                { band: 4, gain: 0.1 }
            ]);
            filterName = 'Pop';
        } else if (filter === 'party') {
            await player.filterManager.setEQ([
                { band: 0, gain: 0.3 },
                { band: 1, gain: 0.3 },
                { band: 2, gain: 0 },
                { band: 3, gain: 0 },
                { band: 4, gain: 0 },
                { band: 5, gain: 0.3 },
                { band: 6, gain: 0.3 }
            ]);
            filterName = 'Party';
        } else if (filter === 'electronic') {
            await player.filterManager.setEQ([
                { band: 0, gain: 0.375 },
                { band: 1, gain: 0.35 },
                { band: 2, gain: 0.125 },
                { band: 3, gain: 0 },
                { band: 4, gain: -0.125 },
                { band: 5, gain: 0.125 },
                { band: 6, gain: 0.25 }
            ]);
            filterName = 'Electronic';
        } else {
            return interaction.reply({ components: [buildErrorResponse('Unknown Filter', 'Unknown filter selected.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# <:Fire:1473038604812161218> Filter Applied\n\n**${filterName}** ${filter === 'clear' ? '<:Trash:1473038090074591293>' : 'has been applied to the music! <:Music:1473039311057190972>'}`)
            );

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        if (!player) return message.reply({ components: [buildErrorResponse('No Player', 'Nothing is playing!')], flags: MessageFlags.IsComponentsV2 });
        if (!message.member.voice.channel) return message.reply({ components: [buildErrorResponse('Voice Required', 'You need to be in a voice channel!')], flags: MessageFlags.IsComponentsV2 });

        const filter = args[0]?.toLowerCase();

        if (!filter) {
            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('filter_bassboost')
                        .setLabel('Bass Boost')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('<:Volumeup:1473039290136002844>'),
                    new ButtonBuilder()
                        .setCustomId('filter_nightcore')
                        .setLabel('Nightcore')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('<:Lightningalt:1473038679906844824>'),
                    new ButtonBuilder()
                        .setCustomId('filter_vaporwave')
                        .setLabel('Vaporwave')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🌊'),
                    new ButtonBuilder()
                        .setCustomId('filter_8d')
                        .setLabel('8D Audio')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('<:Headphone:1473039296062689566>')
                );

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('filter_karaoke')
                        .setLabel('Karaoke')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('<:Microphone:1473039293088927996>'),
                    new ButtonBuilder()
                        .setCustomId('filter_tremolo')
                        .setLabel('Tremolo')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('<:Music:1473039311057190972>'),
                    new ButtonBuilder()
                        .setCustomId('filter_vibrato')
                        .setLabel('Vibrato')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('<:Music:1473039311057190972>'),
                    new ButtonBuilder()
                        .setCustomId('filter_china')
                        .setLabel('China')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🏮')
                );

            const row3 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('filter_distortion')
                        .setLabel('Distortion')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🌀'),
                    new ButtonBuilder()
                        .setCustomId('filter_pop')
                        .setLabel('Pop')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('<:Microphone:1473039293088927996>'),
                    new ButtonBuilder()
                        .setCustomId('filter_clear')
                        .setLabel('Clear All')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('<:Trash:1473038090074591293>')
                );

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Fire:1473038604812161218> Audio Filters\n\nSelect a filter to apply to the current track:\n\n**Available Filters:**\n<:Volumeup:1473039290136002844> Bass Boost • <:Lightningalt:1473038679906844824> Nightcore • 🌊 Vaporwave • <:Headphone:1473039296062689566> 8D\n<:Microphone:1473039293088927996> Karaoke • <:Music:1473039311057190972> Tremolo • <:Music:1473039311057190972> Vibrato • 🏮 China\n🌀 Distortion • <:Microphone:1473039293088927996> Pop`)
                )
                .addActionRowComponents(row1, row2, row3);

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let filterName = '';
        
        if (filter === 'clear') {
            await player.filterManager.resetFilters();
            filterName = 'All filters cleared';
        } else if (filter === 'bassboost') {
            await player.filterManager.setEQ([
                { band: 0, gain: 0.4 },
                { band: 1, gain: 0.3 },
                { band: 2, gain: 0.2 }
            ]);
            filterName = 'Bass Boost';
        } else if (filter === 'nightcore') {
            await player.filterManager.setTimescale({ speed: 1.2, pitch: 1.2 });
            filterName = 'Nightcore';
        } else if (filter === 'vaporwave') {
            await player.filterManager.setTimescale({ speed: 0.8, pitch: 0.8 });
            filterName = 'Vaporwave';
        } else if (filter === '8d') {
            player.filterManager.data.rotation = { rotationHz: 0.2 }; player.filterManager.filters.rotation = true; await player.filterManager.applyPlayerFilters();
            filterName = '8D Audio';
        } else if (filter === 'karaoke') {
            player.filterManager.data.karaoke = { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 }; player.filterManager.filters.karaoke = true; await player.filterManager.applyPlayerFilters();
            filterName = 'Karaoke';
        } else if (filter === 'tremolo') {
            player.filterManager.data.tremolo = { frequency: 4.0, depth: 0.75 }; player.filterManager.filters.tremolo = true; await player.filterManager.applyPlayerFilters();
            filterName = 'Tremolo';
        } else if (filter === 'vibrato') {
            player.filterManager.data.vibrato = { frequency: 10.0, depth: 0.9 }; player.filterManager.filters.vibrato = true; await player.filterManager.applyPlayerFilters();
            filterName = 'Vibrato';
        } else if (filter === 'china') {
            await player.filterManager.setTimescale({ speed: 0.7, pitch: 1.3 });
            filterName = 'China';
        } else if (filter === 'chipmunk') {
            await player.filterManager.setTimescale({ speed: 1.3, pitch: 1.4 });
            filterName = 'Chipmunk';
        } else if (filter === 'daycore') {
            await player.filterManager.setTimescale({ speed: 0.75, pitch: 0.75 });
            filterName = 'Daycore';
        } else if (filter === 'distortion') {
            player.filterManager.data.distortion = { sinOffset: 0, sinScale: 1, cosOffset: 0, cosScale: 1, tanOffset: 0, tanScale: 1, offset: 0, scale: 1.2 };
            player.filterManager.filters.distortion = true;
            await player.filterManager.applyPlayerFilters();
            filterName = 'Distortion';
        } else if (filter === 'soft') {
            await player.filterManager.setEQ([
                { band: 0, gain: 0 },
                { band: 1, gain: 0 },
                { band: 2, gain: 0 },
                { band: 3, gain: 0 },
                { band: 4, gain: -0.15 },
                { band: 5, gain: -0.15 }
            ]);
            filterName = 'Soft';
        } else if (filter === 'pop') {
            await player.filterManager.setEQ([
                { band: 0, gain: -0.05 },
                { band: 1, gain: 0.1 },
                { band: 2, gain: 0.1 },
                { band: 3, gain: 0.15 },
                { band: 4, gain: 0.1 }
            ]);
            filterName = 'Pop';
        } else if (filter === 'party') {
            await player.filterManager.setEQ([
                { band: 0, gain: 0.3 },
                { band: 1, gain: 0.3 },
                { band: 2, gain: 0 },
                { band: 3, gain: 0 },
                { band: 4, gain: 0 },
                { band: 5, gain: 0.3 },
                { band: 6, gain: 0.3 }
            ]);
            filterName = 'Party';
        } else if (filter === 'electronic') {
            await player.filterManager.setEQ([
                { band: 0, gain: 0.375 },
                { band: 1, gain: 0.35 },
                { band: 2, gain: 0.125 },
                { band: 3, gain: 0 },
                { band: 4, gain: -0.125 },
                { band: 5, gain: 0.125 },
                { band: 6, gain: 0.25 }
            ]);
            filterName = 'Electronic';
        } else {
            return message.reply({ components: [buildErrorResponse('Invalid Input', 'Invalid filter! Available: clear, bassboost, nightcore, vaporwave, 8d, karaoke, tremolo, vibrato, china, chipmunk, daycore, distortion, soft, pop, party, electronic')], flags: MessageFlags.IsComponentsV2 });
        }

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# <:Fire:1473038604812161218> Filter Applied\n\n**${filterName}** ${filter === 'clear' ? '<:Trash:1473038090074591293>' : 'has been applied to the music! <:Music:1473039311057190972>'}`)
            );

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
