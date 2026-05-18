const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { db } = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('load-playlist')
        .setDescription('Load and play a saved playlist')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Name of the playlist')
                .setRequired(true)
                .setAutocomplete(true))
        .addBooleanOption(option =>
            option.setName('shuffle')
                .setDescription('Shuffle the playlist')
                .setRequired(false)),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const allKeys = await db.list(`playlist_${interaction.user.id}_`);
        
        const playlists = [];
        for (const key of allKeys) {
            const playlist = await db.get(key);
            if (playlist && playlist.name.toLowerCase().includes(focusedValue)) {
                playlists.push({ name: playlist.name, value: playlist.name });
            }
        }
        
        await interaction.respond(playlists.slice(0, 25));
    },

    async execute(interaction, lavalinkManager) {
        const member = interaction.member;
        const voiceChannel = member.voice.channel;
        
        if (!voiceChannel) {
            return interaction.reply({ components: [buildErrorResponse('Error', 'You need to be in a voice channel!')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        if (!lavalinkManager.useable) {
            return interaction.reply({ components: [buildErrorResponse('Music Unavailable', 'No music servers are connected right now. Please try again in a moment.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        
        await interaction.deferReply();
        
        const playlistName = interaction.options.getString('name').trim();
        const playlistKey = `playlist_${interaction.user.id}_${playlistName.toLowerCase().replace(/\s+/g, '_')}`;
        
        const playlist = await db.get(playlistKey);
        if (!playlist) {
            return interaction.editReply({ 
                components: [buildErrorResponse('Playlist Not Found', 'Use /playlists to see your saved playlists.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral 
            });
        }
        
        const shuffle = interaction.options.getBoolean('shuffle') || false;
        
        let player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player) {
            player = await lavalinkManager.createPlayer({
                guildId: interaction.guild.id,
                voiceChannelId: voiceChannel.id,
                textChannelId: interaction.channel.id,
                selfDeaf: true
            });
        }
        
        if (!player.connected) {
            await player.connect();
        }
        
        let songsToPlay = [...playlist.songs];
        if (shuffle) {
            for (let i = songsToPlay.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [songsToPlay[i], songsToPlay[j]] = [songsToPlay[j], songsToPlay[i]];
            }
        }
        
        let addedCount = 0;
        for (const song of songsToPlay) {
            try {
                const result = await Promise.race([
                    player.search({ query: song.url }, interaction.user),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Search timed out')), 15000))
                ]);
                if (result.tracks.length > 0) {
                    player.queue.add(result.tracks[0]);
                    addedCount++;
                }
            } catch (e) {
                console.error(`Failed to add song: ${song.title}`, e);
            }
        }
        
        if (addedCount === 0) {
            return interaction.editReply({ 
                components: [buildErrorResponse('Load Failed', 'Could not load any songs from the playlist.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral 
            });
        }
        
        if (!player.playing && !player.paused) {
            await player.play();
        }
        
        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Folderopen:1473039552783323348> Loading Playlist\n\n` +
                    `**${playlist.name}**\n` +
                    `${addedCount} songs added to queue${shuffle ? ' (shuffled)' : ''}\n\n` +
                    `-# Now playing!`
                )
            );
        
        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args, lavalinkManager) {
        const member = message.member;
        const voiceChannel = member.voice.channel;
        
        if (!voiceChannel) {
            return message.reply({ components: [buildErrorResponse('Voice Required', 'You need to be in a voice channel!')], flags: MessageFlags.IsComponentsV2 });
        }
        
        if (!args.length) {
            return message.reply({ components: [buildErrorResponse('Missing Input', 'Please provide a playlist name!')], flags: MessageFlags.IsComponentsV2 });
        }

        if (!lavalinkManager.useable) {
            return message.reply({ components: [buildErrorResponse('Music Unavailable', 'No music servers are connected right now. Please try again in a moment.')], flags: MessageFlags.IsComponentsV2 });
        }
        
        const shuffle = args[args.length - 1]?.toLowerCase() === 'shuffle';
        const playlistName = shuffle ? args.slice(0, -1).join(' ').trim() : args.join(' ').trim();
        const playlistKey = `playlist_${message.author.id}_${playlistName.toLowerCase().replace(/\s+/g, '_')}`;
        
        const playlist = await db.get(playlistKey);
        if (!playlist) {
            return message.reply({ components: [buildErrorResponse('Not Found', 'Playlist not found! Use `playlists` to see your saved playlists.')], flags: MessageFlags.IsComponentsV2 });
        }
        
        let player = lavalinkManager.getPlayer(message.guild.id);
        if (!player) {
            player = await lavalinkManager.createPlayer({
                guildId: message.guild.id,
                voiceChannelId: voiceChannel.id,
                textChannelId: message.channel.id,
                selfDeaf: true
            });
        }
        
        if (!player.connected) {
            await player.connect();
        }
        
        let songsToPlay = [...playlist.songs];
        if (shuffle) {
            for (let i = songsToPlay.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [songsToPlay[i], songsToPlay[j]] = [songsToPlay[j], songsToPlay[i]];
            }
        }
        
        const loadingMsg = await message.reply(`<:Music:1473039311057190972> Loading playlist "${playlist.name}"...`);
        
        let addedCount = 0;
        for (const song of songsToPlay) {
            try {
                const result = await Promise.race([
                    player.search({ query: song.url }, message.author),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Search timed out')), 15000))
                ]);
                if (result.tracks.length > 0) {
                    player.queue.add(result.tracks[0]);
                    addedCount++;
                }
            } catch (e) {
                console.error(`Failed to add song: ${song.title}`, e);
            }
        }
        
        if (addedCount === 0) {
            return loadingMsg.edit(`<:Cancel:1473037949187657818> Couldn't load any songs from the playlist!`);
        }
        
        if (!player.playing && !player.paused) {
            await player.play();
        }
        
        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Folderopen:1473039552783323348> Loading Playlist\n\n` +
                    `**${playlist.name}**\n` +
                    `${addedCount} songs added to queue${shuffle ? ' (shuffled)' : ''}\n\n` +
                    `-# Now playing!`
                )
            );
        
        await loadingMsg.edit({ content: null, components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
