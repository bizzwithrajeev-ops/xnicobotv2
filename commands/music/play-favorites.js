const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { models } = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play-favorites')
        .setDescription('Play all your favorite songs')
        .addBooleanOption(option =>
            option.setName('shuffle')
                .setDescription('Shuffle the playlist before playing')
                .setRequired(false)),

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
        
        const favorites = await models.FavoriteSong.find({ userId: interaction.user.id });
        
        if (!favorites || favorites.length === 0) {
            return interaction.editReply({ 
                components: [buildErrorResponse('No Favorites', "You don't have any saved songs. Use /like to add songs.")], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral 
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
        
        let songsToPlay = [...favorites];
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
                components: [buildErrorResponse('Load Failed', 'Could not load any of your favorites.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral 
            });
        }
        
        if (!player.playing && !player.paused) {
            await player.play();
        }
        
        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Heartalt:1473038488893526016> Playing Favorites\n\n` +
                    `**${addedCount}** songs added to queue${shuffle ? ' (shuffled)' : ''}\n\n` +
                    `-# Now playing your favorite songs!`
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

        if (!lavalinkManager.useable) {
            return message.reply({ components: [buildErrorResponse('Music Unavailable', 'No music servers are connected right now. Please try again in a moment.')], flags: MessageFlags.IsComponentsV2 });
        }
        
        const favorites = await models.FavoriteSong.find({ userId: message.author.id });
        
        if (!favorites || favorites.length === 0) {
            return message.reply({ components: [buildErrorResponse('Not Found', "You don't have any saved songs! Use `like` to add songs.")], flags: MessageFlags.IsComponentsV2 });
        }
        
        const shuffle = args[0]?.toLowerCase() === 'shuffle';
        
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
        
        let songsToPlay = [...favorites];
        if (shuffle) {
            for (let i = songsToPlay.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [songsToPlay[i], songsToPlay[j]] = [songsToPlay[j], songsToPlay[i]];
            }
        }
        
        const loadingMsg = await message.reply(`<:Music:1473039311057190972> Loading ${favorites.length} favorite songs...`);
        
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
            return loadingMsg.edit(`<:Cancel:1473037949187657818> Couldn't load any of your favorites!`);
        }
        
        if (!player.playing && !player.paused) {
            await player.play();
        }
        
        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Heartalt:1473038488893526016> Playing Favorites\n\n` +
                    `**${addedCount}** songs added to queue${shuffle ? ' (shuffled)' : ''}\n\n` +
                    `-# Now playing your favorite songs!`
                )
            );
        
        await loadingMsg.edit({ content: null, components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
