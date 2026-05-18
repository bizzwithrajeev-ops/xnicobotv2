const { isOwner } = require('../../utils/helpers');
const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const jsonStore = require('../../utils/jsonStore');
const log = require('../../utils/logger');

function getActivePlayers(client) {
    const lm = client.lavalinkManager;
    if (!lm?.players?.size) return [];
    return [...lm.players.values()]
        .filter(p => p.playing || p.paused)
        .map(p => {
            const guild = client.guilds.cache.get(p.guildId);
            const track = p.queue?.current;
            return {
                guild: guild?.name || p.guildId,
                track: track?.info?.title || 'Unknown',
                paused: p.paused
            };
        });
}

function formatPlayerInfo(activePlayers) {
    if (!activePlayers.length) return '\n> No active music sessions.';
    let info = `\n> **⚠️ ${activePlayers.length} active music session(s):**`;
    for (const p of activePlayers) {
        info += `\n> • **${p.guild}** — ${p.track}${p.paused ? ' (paused)' : ''}`;
    }
    return info;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shutdown')
        .setDescription('<:Lock:1473038513749491773> Owner Only: Shutdown the bot'),

    async execute(interaction, lavalinkManager) {
        if (!isOwner(interaction.user.id)) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> This command is only available to the bot owner!', flags: MessageFlags.Ephemeral });
        }

        const activePlayers = getActivePlayers(interaction.client);
        const playerInfo = formatPlayerInfo(activePlayers);

        if (activePlayers.length) {
            log.warning(`Shutdown initiated with ${activePlayers.length} active player(s): ${activePlayers.map(p => `${p.guild} → ${p.track}`).join(', ')}`);
        }

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# <:dnd:1473370101427343403> Shutting Down\n\n**Status:** Flushing database and shutting down...${playerInfo}`)
            );

        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        try { await jsonStore.flush(); } catch (e) {}
        setTimeout(() => {
            process.exit(0);
        }, 1000);
    },

    async executePrefix(message, args, lavalinkManager) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const activePlayers = getActivePlayers(message.client);
        const playerInfo = formatPlayerInfo(activePlayers);

        if (activePlayers.length) {
            log.warning(`Shutdown initiated with ${activePlayers.length} active player(s): ${activePlayers.map(p => `${p.guild} → ${p.track}`).join(', ')}`);
        }

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# <:dnd:1473370101427343403> Shutting Down\n\n**Status:** Flushing database and shutting down...${playerInfo}`)
            );

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        try { await jsonStore.flush(); } catch (e) {}
        setTimeout(() => {
            process.exit(0);
        }, 1000);
    }
};