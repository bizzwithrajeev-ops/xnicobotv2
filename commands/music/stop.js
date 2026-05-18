const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const { updateMusicPanel, updateVoiceChannelStatus } = require('../../utils/musicPanel');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');

const jsonStore = require('../../utils/jsonStore');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop the music and clear the queue'),
    
    prefix: 'stop',
    description: 'Stop the music and clear the queue',
    usage: 'stop',
    category: 'music',
    aliases: ['disconnect', 'dc', 'leave', 'lv', 'bye'],
    
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

        let is247Enabled = false;
        if (jsonStore.has('musicpanel-247')) {
            try {
                const config247 = jsonStore.read('musicpanel-247');
                is247Enabled = config247[interaction.guild.id]?.enabled || false;
            } catch (e) {
                console.error('Error reading 24/7 config:', e);
            }
        }

        const guildId = interaction.guild.id;
        const queueSize = player.queue?.tracks?.length || 0;

        if (is247Enabled) {
            if (player.queue?.tracks) player.queue.tracks.splice(0, player.queue.tracks.length);
            await player.stopPlaying();
            
            await updateVoiceChannelStatus(interaction.client, player, 'waiting');
            
            setTimeout(async () => {
                try {
                    await updateMusicPanel(interaction.client, null, interaction.client.autoplayStatus || new Map(), guildId);
                } catch (e) {}
            }, 500);
            
            let content = `# <:Cancel:1473037949187657818> Music Stopped\n\n`;
            content += `Cleared ${queueSize} track${queueSize !== 1 ? 's' : ''} from queue.\n\n`;
            content += `> <:Refresh:1473037911581528165> Bot staying in **24/7 mode**`;
            
            const container = new ContainerBuilder()
                .setAccentColor(COLORS.ERROR)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
            
            return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } else {
            await player.destroy();
            
            let content = `# <:Cancel:1473037949187657818> Music Stopped\n\n`;
            content += `Cleared ${queueSize} track${queueSize !== 1 ? 's' : ''} from queue.\n\n`;
            content += `> Left the voice channel`;
            
            const container = new ContainerBuilder()
                .setAccentColor(COLORS.ERROR)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
            
            return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
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

        let is247Enabled = false;
        if (jsonStore.has('musicpanel-247')) {
            try {
                const config247 = jsonStore.read('musicpanel-247');
                is247Enabled = message.guild.id ? (config247[message.guild.id]?.enabled || false) : false;
            } catch (e) {
                console.error('Error reading 24/7 config:', e);
            }
        }

        const guildId = message.guild.id;
        const queueSize = player.queue?.tracks?.length || 0;

        if (is247Enabled) {
            if (player.queue?.tracks) player.queue.tracks.splice(0, player.queue.tracks.length);
            await player.stopPlaying();
            
            await updateVoiceChannelStatus(message.client, player, 'waiting');
            
            setTimeout(async () => {
                try {
                    await updateMusicPanel(message.client, null, message.client.autoplayStatus || new Map(), guildId);
                } catch (e) {}
            }, 500);
            
            let content = `# <:Cancel:1473037949187657818> Music Stopped\n\n`;
            content += `Cleared ${queueSize} track${queueSize !== 1 ? 's' : ''} from queue.\n\n`;
            content += `> <:Refresh:1473037911581528165> Bot staying in **24/7 mode**`;
            
            const container = new ContainerBuilder()
                .setAccentColor(COLORS.ERROR)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
            
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } else {
            await player.destroy();
            
            let content = `# <:Cancel:1473037949187657818> Music Stopped\n\n`;
            content += `Cleared ${queueSize} track${queueSize !== 1 ? 's' : ''} from queue.\n\n`;
            content += `> Left the voice channel`;
            
            const container = new ContainerBuilder()
                .setAccentColor(COLORS.ERROR)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
            
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
