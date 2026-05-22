const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { voiceErrorMessage, nextLoopMode } = require('../../utils/musicHelpers');

const ICONS = {
    off:   '<:Forward:1473038953182531645>',
    track: '<:Refresh:1473037911581528165>',
    queue: '<:Shuffle:1473039298751107213>'
};

const TEXT = { off: 'Off', track: 'Track', queue: 'Queue' };

function applyMode(player, mode) {
    player.setRepeatMode(mode);
}

function buildResponse(mode) {
    return new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# ${ICONS[mode]} Loop — ${TEXT[mode]}\n\n` +
            (mode === 'off'   ? 'Repeat is disabled.\n-# Tracks will play through the queue once.' :
             mode === 'track' ? 'Current track will repeat indefinitely.\n-# Run \`/loop off\` to disable.' :
                                'Whole queue will repeat after the last track.\n-# Run \`/loop off\` to disable.')
        )
    );
}

module.exports = {
    prefix: 'loop',
    description: 'Cycle or set the loop/repeat mode',
    usage: 'loop [off|track|queue]',
    category: 'music',
    aliases: ['lp', 'rp'],

    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Cycle or set the loop/repeat mode')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Loop mode (omit to cycle)')
                .setRequired(false)
                .addChoices(
                    { name: 'Off',   value: 'off' },
                    { name: 'Track', value: 'track' },
                    { name: 'Queue', value: 'queue' }
                )),

    async execute(interaction, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(interaction.guild.id);
            if (!player) {
                return interaction.reply({ components: [buildErrorResponse('No Player', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }
            const voiceErr = voiceErrorMessage(interaction.member, player);
            if (voiceErr) return interaction.reply({ components: [buildErrorResponse('Voice Required', voiceErr)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

            const requested = interaction.options.getString('mode');
            const mode = requested || nextLoopMode(player.repeatMode || 'off');
            applyMode(player, mode);

            await interaction.reply({ components: [buildResponse(mode)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Loop Error:', error);
            const msg = error.message || 'An unknown error occurred';
            const reply = { components: [buildErrorResponse('Loop Error', msg)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
            if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
            else await interaction.reply(reply).catch(() => {});
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        try {
            const player = lavalinkManager.getPlayer(message.guild.id);
            if (!player) return message.reply({ components: [buildErrorResponse('No Player', 'Nothing is playing.')], flags: MessageFlags.IsComponentsV2 });
            const voiceErr = voiceErrorMessage(message.member, player);
            if (voiceErr) return message.reply({ components: [buildErrorResponse('Voice Required', voiceErr)], flags: MessageFlags.IsComponentsV2 });

            const requested = args[0]?.toLowerCase();
            let mode;
            if (!requested) mode = nextLoopMode(player.repeatMode || 'off');
            else if (['off', 'track', 'queue'].includes(requested)) mode = requested;
            else return message.reply({ components: [buildErrorResponse('Invalid Mode', 'Use one of: `off`, `track`, `queue` — or omit to cycle.')], flags: MessageFlags.IsComponentsV2 });

            applyMode(player, mode);
            return message.reply({ components: [buildResponse(mode)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Loop Error:', error);
            return message.reply({ components: [buildErrorResponse('Loop Error', error.message || 'Unknown error')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }
};
