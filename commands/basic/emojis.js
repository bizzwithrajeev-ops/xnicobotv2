'use strict';

/**
 * emojis — list every custom emoji in the current server, grouped
 * into static and animated. Truncates each list to a sane page size
 * (`MAX_PER_GROUP`) and shows an overflow hint instead of silently
 * dropping the rest.
 */

const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder,
    SeparatorBuilder, SeparatorSpacingSize, MessageFlags,
} = require('discord.js');
const { COLORS, BRANDING, EMOJIS: PALETTE } = require('../../utils/responseBuilder');
const { emojiUsability } = require('../../utils/emojiSystem');

// Discord components hard-cap at 4000 chars per text display, but a
// dense `<:tag:id>` block of 100 emojis already pushes ~3 KB. Cap each
// group conservatively to keep room for headers + branding.
const MAX_PER_GROUP = 60;

function buildEmojisResponse(guild) {
    const all = guild.emojis.cache;
    if (all.size === 0) {
        return { error: `${PALETTE.ERROR} This server has no custom emojis.` };
    }

    // Discord renders inline `<:tag:id>` only when the emoji is usable
    // (no role restrictions + available). For unusable ones we show the
    // bare name in monospace so the entry doesn't look broken.
    const partition = { animated: [], static: [] };
    for (const emoji of all.values()) {
        const { usable } = emojiUsability(emoji);
        const display = usable ? emoji.toString() : `\`:${emoji.name}:\``;
        partition[emoji.animated ? 'animated' : 'static'].push(display);
    }

    const container = new ContainerBuilder()
        .setAccentColor(COLORS.INFO)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# ${PALETTE.STAR} ${guild.name} Emojis\n` +
            `-# **Total:** ${all.size}  •  **Static:** ${partition.static.length}  •  **Animated:** ${partition.animated.length}`
        ));

    const renderGroup = (label, emoji, list) => {
        if (list.length === 0) return;
        const shown = list.slice(0, MAX_PER_GROUP).join(' ');
        const more = list.length > MAX_PER_GROUP
            ? `\n-# +${list.length - MAX_PER_GROUP} more not shown`
            : '';
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### ${emoji} ${label} (${list.length})\n${shown}${more}`
        ));
    };

    renderGroup('Static Emojis', PALETTE.STATIC, partition.static);
    renderGroup('Animated Emojis', PALETTE.ANIMATED, partition.animated);

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

    return { container };
}

module.exports = {
    prefix: 'emojis',
    description: 'List all custom emojis in the server',
    usage: 'emojis',
    category: 'basic',
    data: new SlashCommandBuilder()
        .setName('emojis')
        .setDescription('List all custom emojis in the server'),

    async execute(interaction) {
        try {
            if (!interaction.guild) {
                return interaction.reply({ content: `${PALETTE.ERROR} This command can only be used in a server.`, flags: MessageFlags.Ephemeral });
            }
            const result = buildEmojisResponse(interaction.guild);
            if (result.error) {
                return interaction.reply({ content: result.error, flags: MessageFlags.Ephemeral });
            }
            await interaction.reply({ components: [result.container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[EMOJIS]', error);
            const content = `${PALETTE.ERROR} An error occurred while running this command.`;
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content }).catch(() => {});
            } else {
                await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    async executePrefix(message) {
        try {
            if (!message.guild) {
                return message.reply(`${PALETTE.ERROR} This command can only be used in a server.`).catch(() => {});
            }
            const result = buildEmojisResponse(message.guild);
            if (result.error) {
                return message.reply(result.error).catch(() => {});
            }
            await message.reply({ components: [result.container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[EMOJIS]', error);
            await message.reply(`${PALETTE.ERROR} An error occurred while running this command.`).catch(() => {});
        }
    },
};
