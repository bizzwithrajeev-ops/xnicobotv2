const { isOwner } = require('../../utils/helpers');
const { MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { COLORS } = require('../../utils/responseBuilder');
const snapshot = require('../../utils/storeSnapshot');

function box(title, body, color = COLORS.INFO) {
    return {
        components: [new ContainerBuilder()
            .setAccentColor(color)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`))],
        flags: MessageFlags.IsComponentsV2
    };
}

module.exports = {
    name: 'datasnapshot',
    prefix: 'datasnapshot',
    description: 'Create, list, inspect and restore full data snapshots (owner only)',
    usage: 'datasnapshot <create|list|info|restore> [name] [storeNames...]',
    category: 'owner',
    aliases: ['snapshot', 'datasnap', 'dbsnapshot'],
    ownerOnly: true,

    async executePrefix(message, args) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const sub = (args[0] || 'list').toLowerCase();

        if (sub === 'create' || sub === 'new') {
            const result = await snapshot.createSnapshot('manual');
            if (!result.success) {
                return message.reply({ ...box('<:Cancel:1473037949187657818> Snapshot Failed', result.error || 'Unknown error', COLORS.ERROR) });
            }
            return message.reply({ ...box(
                '<:Checkedbox:1473038547165384804> Snapshot Created',
                `**File:** \`${result.name}\`\n**Stores:** \`${result.stores}\`\n**Size:** \`${(result.bytes / 1024).toFixed(1)} KB\``,
                COLORS.SUCCESS
            ) });
        }

        if (sub === 'list') {
            const snaps = snapshot.listSnapshots();
            if (!snaps.length) {
                return message.reply({ ...box('<:Document:1473039496995143731> Data Snapshots', '*No snapshots yet. Run `datasnapshot create` to make one.*') });
            }
            const lines = snaps.slice(0, 20).map((s, i) =>
                `\`${i + 1}.\` \`${s.name}\`\n> └ <t:${Math.floor(new Date(s.createdAt).getTime() / 1000)}:R> • ${(s.size / 1024).toFixed(1)} KB`
            ).join('\n');
            return message.reply({ ...box(`<:Document:1473039496995143731> Data Snapshots (${snaps.length})`, lines) });
        }

        if (sub === 'info' || sub === 'inspect') {
            const name = args[1];
            if (!name) return message.reply({ ...box('<:Infotriangle:1473038460456800459> Usage', '`datasnapshot info <snapshot-file-name>`', COLORS.WARNING) });
            const info = snapshot.inspectSnapshot(name);
            if (!info.success) return message.reply({ ...box('<:Cancel:1473037949187657818> Not Found', info.error, COLORS.ERROR) });
            const names = info.storeNames.join(', ').slice(0, 1500);
            return message.reply({ ...box(
                '<:Document:1473039496995143731> Snapshot Info',
                `**Created:** <t:${Math.floor(new Date(info.createdAt).getTime() / 1000)}:F>\n**Reason:** \`${info.reason}\`\n**Stores (${info.storeCount}):**\n\`\`\`\n${names}\n\`\`\``
            ) });
        }

        if (sub === 'restore') {
            const name = args[1];
            if (!name) return message.reply({ ...box('<:Infotriangle:1473038460456800459> Usage', '`datasnapshot restore <snapshot-file-name> [store1 store2 ...]`\n-# Omit store names to restore everything. Provide names to restore only those (e.g. `premium prefixes`).', COLORS.WARNING) });

            const only = args.slice(2).filter(Boolean);
            const result = await snapshot.restoreSnapshot(name, { only: only.length ? only : undefined });
            if (!result.success) return message.reply({ ...box('<:Cancel:1473037949187657818> Restore Failed', result.error, COLORS.ERROR) });

            const restoredList = result.restored.slice(0, 60).join(', ') || 'none';
            return message.reply({ ...box(
                '<:Checkedbox:1473038547165384804> Snapshot Restored',
                `**Restored ${result.restored.length} store(s):**\n\`\`\`\n${restoredList}\n\`\`\`\n-# Data was written immediately to the database.`,
                COLORS.SUCCESS
            ) });
        }

        return message.reply({ ...box(
            '<:Document:1473039496995143731> Data Snapshot',
            '`datasnapshot create` — take a snapshot now\n`datasnapshot list` — list snapshots\n`datasnapshot info <name>` — inspect a snapshot\n`datasnapshot restore <name> [stores...]` — restore all or specific stores'
        ) });
    }
};
