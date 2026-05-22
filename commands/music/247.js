const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { voiceErrorMessage } = require('../../utils/musicHelpers');

const jsonStore = require('../../utils/jsonStore');

function load247Config() {
    if (!jsonStore.has('musicpanel-247')) {
        jsonStore.write('musicpanel-247', {});
        return {};
    }
    return jsonStore.read('musicpanel-247');
}

function save247Config(config) {
    jsonStore.write('musicpanel-247', config);
}

module.exports = {
    name: '247',
    description: 'Toggle 24/7 mode to keep the bot in voice channel',
    
    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        
        {
            const __ve = voiceErrorMessage(message.member, lavalinkManager?.getPlayer?.(message.guild.id));
            if (__ve) return message.reply({ components: [buildErrorResponse('Voice Required', __ve)], flags: MessageFlags.IsComponentsV2 });
        }

        const config = load247Config();
        const guildId = message.guild.id;
        const isEnabled = config[guildId]?.enabled || false;

        if (isEnabled) {
            delete config[guildId];
            save247Config(config);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Refresh:1473037911581528165> 24/7 Mode Disabled\n\n**Status:** Bot will leave voice channel when queue is empty or after inactivity`)
                );

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } else {
            if (!player) {
                return message.reply({ components: [buildErrorResponse('No Player', 'Nothing is playing! Start playing music first, then enable 24/7 mode.')], flags: MessageFlags.IsComponentsV2 });
            }

            config[guildId] = {
                enabled: true,
                voiceChannelId: message.member.voice.channel.id,
                textChannelId: message.channel.id,
                enabledAt: Date.now()
            };
            save247Config(config);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Refresh:1473037911581528165> 24/7 Mode Enabled\n\n**Status:** Bot will stay in <#${message.member.voice.channel.id}> even when queue is empty\n\n**Note:** Use \`-247\` again to disable`)
                );

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
