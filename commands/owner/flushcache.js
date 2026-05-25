'use strict';

/**
 * flushcache.js — Owner-only: persist every in-memory store to disk.
 * Useful before a manual restart so no data is lost. Complements
 * `clearcache`, which sweeps caches rather than persisting them.
 */

const { isOwner } = require('../../utils/helpers');
const jsonStore = require('../../utils/jsonStore');
const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

module.exports = {
    name: 'flushcache',
    prefix: 'flushcache',
    aliases: ['flush', 'persistcache', 'savestore'],
    description: 'Owner-only: flush all in-memory stores to disk',
    usage: 'flushcache',
    category: 'owner',
    ownerOnly: true,

    async executePrefix(message) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const startedAt = Date.now();
        const status = await message.reply('<:Lightning:1473038797540298792> Flushing in-memory stores to disk…');

        try {
            const result = (typeof jsonStore.flush === 'function') ? await jsonStore.flush() : null;
            const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2);

            const memUsage = process.memoryUsage();
            const heapMB = (memUsage.heapUsed / 1024 / 1024).toFixed(1);

            const container = new ContainerBuilder()
                .setAccentColor(0x57F287)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Checkedbox:1473038547165384804> Cache Flushed\n\n` +
                    `> Stores written: ${result == null ? '*(no count returned)*' : `**${result}**`}\n` +
                    `> Time: **${elapsed}s**\n` +
                    `> Heap: **${heapMB} MB**`
                ));
            await status.edit({ content: null, components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        } catch (e) {
            await status.edit(`<:Cancel:1473037949187657818> Flush failed: ${e.message}`).catch(() => {});
        }
    }
};
