const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { voiceErrorMessage } = require('../../utils/musicHelpers');
const { formatTime } = require('../../utils/helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Search for songs and select from results')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Song name to search')
                .setRequired(true)),
    
    async execute(interaction, lavalinkManager) {
        {
            const __ve = voiceErrorMessage(interaction.member, lavalinkManager?.getPlayer?.(interaction.guild.id));
            if (__ve) return interaction.reply({ components: [buildErrorResponse('Voice Required', __ve)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const query = interaction.options.getString('query');

        try {
            await interaction.deferReply();

            if (!lavalinkManager.useable) {
                return interaction.editReply({ components: [buildErrorResponse('Music Unavailable', 'No music servers are connected right now. Please try again in a moment.')], flags: MessageFlags.IsComponentsV2 });
            }

            let player = lavalinkManager.getPlayer(interaction.guild.id);
            
            if (!player) {
                player = await lavalinkManager.createPlayer({
                    guildId: interaction.guild.id,
                    voiceChannelId: interaction.member.voice.channel.id,
                    textChannelId: interaction.channel.id,
                    selfDeaf: true,
                    selfMute: false,
                    volume: 100
                });
                
                await player.connect();
            }

            let res = await Promise.race([
                player.search({ query: `ytsearch:${query}` }, interaction.user),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Search timed out')), 20000))
            ]);

            if (res.loadType === 'empty' || !res.tracks || !res.tracks.length) {
                res = await Promise.race([
                    player.search({ query: `scsearch:${query}` }, interaction.user),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Search timed out')), 20000))
                ]);
            }

            if (res.loadType === 'empty' || !res.tracks || !res.tracks.length) {
                return interaction.editReply(`<:Cancel:1473037949187657818> No results found!`);
            }

            const tracks = res.tracks.slice(0, 5);

            const searchText = `# <:Search:1473038053219106847> Search Results\n\n**Query:** ${query}\n\n` +
                tracks.map((track, i) => 
                    `**${i + 1}.** ${track.info.title}\n` +
                    `     Artist: ${track.info.author || 'Unknown'} | Duration: ${formatTime(track.info.duration)}\n`
                ).join('\n');

            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`search_select_0`)
                        .setLabel('1')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('1️⃣'),
                    new ButtonBuilder()
                        .setCustomId(`search_select_1`)
                        .setLabel('2')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('2️⃣'),
                    new ButtonBuilder()
                        .setCustomId(`search_select_2`)
                        .setLabel('3')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('3️⃣'),
                    new ButtonBuilder()
                        .setCustomId(`search_select_3`)
                        .setLabel('4')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('4️⃣')
                );

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`search_select_4`)
                        .setLabel('5')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('5️⃣'),
                    new ButtonBuilder()
                        .setCustomId('search_cancel')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('<:Cancel:1473037949187657818>')
                );

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(searchText)
                )
                .addActionRowComponents(row1)
                .addActionRowComponents(row2);

            interaction.client.searchResults = interaction.client.searchResults || new Map();
            interaction.client.searchResults.set(interaction.user.id, {
                tracks: tracks,
                player: player,
                timestamp: Date.now()
            });

            setTimeout(() => {
                interaction.client.searchResults.delete(interaction.user.id);
            }, 60000);

            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Search Error:', error);
            await interaction.editReply(`<:Cancel:1473037949187657818> An error occurred while searching!`);
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        {
            const __ve = voiceErrorMessage(message.member, lavalinkManager?.getPlayer?.(message.guild.id));
            if (__ve) return message.reply({ components: [buildErrorResponse('Voice Required', __ve)], flags: MessageFlags.IsComponentsV2 });
        }

        const query = args.join(' ');
        if (!query) return message.reply({ components: [buildErrorResponse('Missing Input', 'Please provide a search query!')], flags: MessageFlags.IsComponentsV2 });

        try {
            if (!lavalinkManager.useable) {
                return message.reply({ components: [buildErrorResponse('Music Unavailable', 'No music servers are connected right now. Please try again in a moment.')], flags: MessageFlags.IsComponentsV2 });
            }

            const reply = await message.reply('<:Search:1473038053219106847> Searching...');

            let player = lavalinkManager.getPlayer(message.guild.id);
            
            if (!player) {
                player = await lavalinkManager.createPlayer({
                    guildId: message.guild.id,
                    voiceChannelId: message.member.voice.channel.id,
                    textChannelId: message.channel.id,
                    selfDeaf: true,
                    selfMute: false,
                    volume: 100
                });
                
                await player.connect();
            }

            let res = await Promise.race([
                player.search({ query: `ytsearch:${query}` }, message.author),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Search timed out')), 20000))
            ]);

            if (res.loadType === 'empty' || !res.tracks || !res.tracks.length) {
                res = await Promise.race([
                    player.search({ query: `scsearch:${query}` }, message.author),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Search timed out')), 20000))
                ]);
            }

            if (res.loadType === 'empty' || !res.tracks || !res.tracks.length) {
                return reply.edit(`<:Cancel:1473037949187657818> No results found!`);
            }

            const tracks = res.tracks.slice(0, 5);

            const searchText = `# <:Search:1473038053219106847> Search Results\n\n**Query:** ${query}\n\n` +
                tracks.map((track, i) => 
                    `**${i + 1}.** ${track.info.title}\n` +
                    `     Artist: ${track.info.author || 'Unknown'} | Duration: ${formatTime(track.info.duration)}\n`
                ).join('\n');

            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`search_select_0`)
                        .setLabel('1')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('1️⃣'),
                    new ButtonBuilder()
                        .setCustomId(`search_select_1`)
                        .setLabel('2')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('2️⃣'),
                    new ButtonBuilder()
                        .setCustomId(`search_select_2`)
                        .setLabel('3')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('3️⃣'),
                    new ButtonBuilder()
                        .setCustomId(`search_select_3`)
                        .setLabel('4')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('4️⃣')
                );

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`search_select_4`)
                        .setLabel('5')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('5️⃣'),
                    new ButtonBuilder()
                        .setCustomId('search_cancel')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('<:Cancel:1473037949187657818>')
                );

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(searchText)
                )
                .addActionRowComponents(row1)
                .addActionRowComponents(row2);

            message.client.searchResults = message.client.searchResults || new Map();
            message.client.searchResults.set(message.author.id, {
                tracks: tracks,
                player: player,
                timestamp: Date.now()
            });

            setTimeout(() => {
                message.client.searchResults.delete(message.author.id);
            }, 60000);

            await reply.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Search Error:', error);
            message.reply({ components: [buildErrorResponse('Error', 'An error occurred while searching!')], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
