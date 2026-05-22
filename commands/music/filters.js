const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { buildErrorResponse } = require('../../utils/responseBuilder');
const { voiceErrorMessage, buildEQ, resetTimescale } = require('../../utils/musicHelpers');

/**
 * Filter presets — every entry knows how to apply itself to a player.
 * `apply(player)` resets timescale first when the preset uses one, and
 * always sends a complete 15-band EQ array so previous presets don't
 * leave stale gain on un-touched bands.
 */
const FILTERS = {
    clear:      { label: 'Clear All',  emoji: '<:Trash:1473038090074591293>',           apply: async (p) => { await p.filterManager.resetFilters().catch(() => {}); } },
    bassboost:  { label: 'Bass Boost', emoji: '<:Volumeup:1473039290136002844>',        apply: async (p) => { await p.filterManager.setEQ(buildEQ({ 0: 0.4, 1: 0.3, 2: 0.2 })); } },
    nightcore:  { label: 'Nightcore',  emoji: '<:Lightningalt:1473038679906844824>',    apply: async (p) => { await resetTimescale(p); await p.filterManager.setTimescale({ speed: 1.2, pitch: 1.2 }); } },
    vaporwave:  { label: 'Vaporwave',  emoji: '🌊',                                       apply: async (p) => { await resetTimescale(p); await p.filterManager.setTimescale({ speed: 0.8, pitch: 0.8 }); } },
    daycore:    { label: 'Daycore',    emoji: '<:Music:1473039311057190972>',           apply: async (p) => { await resetTimescale(p); await p.filterManager.setTimescale({ speed: 0.75, pitch: 0.75 }); } },
    chipmunk:   { label: 'Chipmunk',   emoji: '<:Microphone:1473039293088927996>',      apply: async (p) => { await resetTimescale(p); await p.filterManager.setTimescale({ speed: 1.3, pitch: 1.4 }); } },
    china:      { label: 'China',      emoji: '🏮',                                       apply: async (p) => { await resetTimescale(p); await p.filterManager.setTimescale({ speed: 0.7, pitch: 1.3 }); } },
    '8d':       { label: '8D Audio',   emoji: '<:Headphone:1473039296062689566>',       apply: async (p) => { await p.filterManager.setRotation({ rotationHz: 0.2 }); } },
    karaoke:    { label: 'Karaoke',    emoji: '<:Microphone:1473039293088927996>',      apply: async (p) => { await p.filterManager.setKaraoke({ level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 }); } },
    tremolo:    { label: 'Tremolo',    emoji: '<:Music:1473039311057190972>',           apply: async (p) => { await p.filterManager.setTremolo({ frequency: 4.0, depth: 0.75 }); } },
    vibrato:    { label: 'Vibrato',    emoji: '<:Music:1473039311057190972>',           apply: async (p) => { await p.filterManager.setVibrato({ frequency: 10.0, depth: 0.9 }); } },
    distortion: { label: 'Distortion', emoji: '🌀',                                       apply: async (p) => { await p.filterManager.setDistortion({ sinOffset: 0, sinScale: 1, cosOffset: 0, cosScale: 1, tanOffset: 0, tanScale: 1, offset: 0, scale: 1.2 }); } },
    soft:       { label: 'Soft',       emoji: '☁️',                                      apply: async (p) => { await p.filterManager.setEQ(buildEQ({ 4: -0.15, 5: -0.15 })); } },
    pop:        { label: 'Pop',        emoji: '<:Microphone:1473039293088927996>',      apply: async (p) => { await p.filterManager.setEQ(buildEQ({ 0: -0.05, 1: 0.1, 2: 0.1, 3: 0.15, 4: 0.1 })); } },
    party:      { label: 'Party',      emoji: '<:Fire:1473038604812161218>',            apply: async (p) => { await p.filterManager.setEQ(buildEQ({ 0: 0.3, 1: 0.3, 5: 0.3, 6: 0.3 })); } },
    electronic: { label: 'Electronic', emoji: '<:Lightningalt:1473038679906844824>',    apply: async (p) => { await p.filterManager.setEQ(buildEQ({ 0: 0.375, 1: 0.35, 2: 0.125, 4: -0.125, 5: 0.125, 6: 0.25 })); } },
};

function buildPickerContainer() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('filter_bassboost').setLabel('Bass Boost').setStyle(ButtonStyle.Primary).setEmoji(FILTERS.bassboost.emoji),
        new ButtonBuilder().setCustomId('filter_nightcore').setLabel('Nightcore').setStyle(ButtonStyle.Primary).setEmoji(FILTERS.nightcore.emoji),
        new ButtonBuilder().setCustomId('filter_vaporwave').setLabel('Vaporwave').setStyle(ButtonStyle.Primary).setEmoji(FILTERS.vaporwave.emoji),
        new ButtonBuilder().setCustomId('filter_8d').setLabel('8D Audio').setStyle(ButtonStyle.Primary).setEmoji(FILTERS['8d'].emoji),
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('filter_karaoke').setLabel('Karaoke').setStyle(ButtonStyle.Primary).setEmoji(FILTERS.karaoke.emoji),
        new ButtonBuilder().setCustomId('filter_tremolo').setLabel('Tremolo').setStyle(ButtonStyle.Primary).setEmoji(FILTERS.tremolo.emoji),
        new ButtonBuilder().setCustomId('filter_vibrato').setLabel('Vibrato').setStyle(ButtonStyle.Primary).setEmoji(FILTERS.vibrato.emoji),
        new ButtonBuilder().setCustomId('filter_china').setLabel('China').setStyle(ButtonStyle.Primary).setEmoji(FILTERS.china.emoji),
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('filter_distortion').setLabel('Distortion').setStyle(ButtonStyle.Primary).setEmoji(FILTERS.distortion.emoji),
        new ButtonBuilder().setCustomId('filter_pop').setLabel('Pop').setStyle(ButtonStyle.Primary).setEmoji(FILTERS.pop.emoji),
        new ButtonBuilder().setCustomId('filter_party').setLabel('Party').setStyle(ButtonStyle.Primary).setEmoji(FILTERS.party.emoji),
        new ButtonBuilder().setCustomId('filter_clear').setLabel('Clear All').setStyle(ButtonStyle.Danger).setEmoji(FILTERS.clear.emoji),
    );

    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# <:Fire:1473038604812161218> Audio Filters\n\n` +
            `Pick a preset to apply to the current track. Re-pick the same filter to clear it,\n` +
            `or use **Clear All** to reset every filter at once.\n\n` +
            `**Bass / EQ:** Bass Boost • Soft • Pop • Party • Electronic\n` +
            `**Pitch / Speed:** Nightcore • Vaporwave • Daycore • Chipmunk • China\n` +
            `**Effects:** 8D Audio • Karaoke • Tremolo • Vibrato • Distortion`
        ))
        .addActionRowComponents(row1, row2, row3);
}

async function applyFilter(player, filter) {
    const preset = FILTERS[filter];
    if (!preset) return null;
    await preset.apply(player);
    return preset.label;
}

function buildAppliedContainer(filterName, filter) {
    let body;
    if (filter === 'clear') body = 'All filters cleared.\n-# Audio is back to default.';
    else                    body = `**${filterName}** is now applied to the music.`;
    return new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`# <:Fire:1473038604812161218> Filter Applied\n\n${body}`)
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('filters')
        .setDescription('Apply audio filters to the music')
        .addStringOption(option =>
            option.setName('filter')
                .setDescription('Select a filter (omit to open the picker)')
                .setRequired(false)
                .addChoices(
                    ...Object.keys(FILTERS).map(k => ({ name: FILTERS[k].label, value: k }))
                )),

    prefix: 'filters',
    description: 'Apply audio filters to the music',
    usage: 'filters [preset]',
    category: 'music',
    aliases: ['filter', 'fx'],

    async execute(interaction, lavalinkManager) {
        if (!interaction.guild) {
            return interaction.reply({ components: [buildErrorResponse('Server Only', 'This command can only be used in a server.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        const player = lavalinkManager.getPlayer(interaction.guild.id);
        if (!player) return interaction.reply({ components: [buildErrorResponse('No Player', 'Nothing is currently playing.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        const voiceErr = voiceErrorMessage(interaction.member, player);
        if (voiceErr) return interaction.reply({ components: [buildErrorResponse('Voice Required', voiceErr)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        const filter = interaction.options.getString('filter');
        if (!filter) {
            return interaction.reply({ components: [buildPickerContainer()], flags: MessageFlags.IsComponentsV2 });
        }
        const label = await applyFilter(player, filter);
        if (label == null) {
            return interaction.reply({ components: [buildErrorResponse('Unknown Filter', 'Unknown filter selected.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        return interaction.reply({ components: [buildAppliedContainer(label, filter)], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args, lavalinkManager) {
        const player = lavalinkManager.getPlayer(message.guild.id);
        if (!player) return message.reply({ components: [buildErrorResponse('No Player', 'Nothing is playing!')], flags: MessageFlags.IsComponentsV2 });
        const voiceErr = voiceErrorMessage(message.member, player);
        if (voiceErr) return message.reply({ components: [buildErrorResponse('Voice Required', voiceErr)], flags: MessageFlags.IsComponentsV2 });

        const filter = args[0]?.toLowerCase();
        if (!filter) {
            return message.reply({ components: [buildPickerContainer()], flags: MessageFlags.IsComponentsV2 });
        }
        const label = await applyFilter(player, filter);
        if (label == null) {
            return message.reply({ components: [buildErrorResponse('Unknown Filter', `Unknown filter \`${filter}\`. Available: ${Object.keys(FILTERS).join(', ')}.`)], flags: MessageFlags.IsComponentsV2 });
        }
        return message.reply({ components: [buildAppliedContainer(label, filter)], flags: MessageFlags.IsComponentsV2 });
    },

    // Exported so the panel filter buttons can reuse the same preset map.
    _FILTERS: FILTERS,
    _applyFilter: applyFilter,
    _buildAppliedContainer: buildAppliedContainer,
};
