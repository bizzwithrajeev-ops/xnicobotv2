'use strict';

/**
 * shutdown.js — prefix-only.
 * Flushes jsonStore and exits with code 0 so the process manager
 * stops the bot rather than restarting it.
 */

const { isOwner } = require('../../utils/helpers');
const { MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
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
    name: 'shutdown',
    prefix: 'shutdown',
    aliases: ['stopbot', 'kill'],
    description: 'Owner-only: gracefully shut down the bot process',
    usage: 'shutdown',
    category: 'owner',
    ownerOnly: true,

    async executePrefix(message) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const activePlayers = getActivePlayers(message.client);
        const playerInfo = formatPlayerInfo(activePlayers);

        if (activePlayers.length) {
            log.warning?.(`Shutdown initiated with ${activePlayers.length} active player(s): ${activePlayers.map(p => `${p.guild} → ${p.track}`).join(', ')}`);
        }

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# <:dnd:1485248263857639424> Shutting Down\n\n**Status:** Flushing database and shutting down...${playerInfo}`
            ));

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        try { await jsonStore.flush(); } catch {}
        setTimeout(() => process.exit(0), 1000);
    }
};
