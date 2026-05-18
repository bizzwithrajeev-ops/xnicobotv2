'use strict';

const {
    ContainerBuilder, TextDisplayBuilder,
    SeparatorBuilder, SeparatorSpacingSize,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    PermissionFlagsBits, MessageFlags
} = require('discord.js');
const { db } = require('../../utils/database');
const { buildExpiredPanel } = require('../../utils/responseBuilder');

const TIMEOUT = 30_000;
const VALID_TYPES = ['embed', 'welcome', 'leave', 'custom', 'announcement'];
const TYPE_EMOJI = { embed: '<:Folder:1473039340425973972>', welcome: '<:Userplus:1473038912212435086>', leave: '<:Userplus:1473038912212435086>', custom: '<:Edit:1473037903625191580>', announcement: '<:Bullhorn:1473038903157199093>' };

module.exports = {
    prefix: 'database-set',
    description: 'Store data in the database',
    usage: 'database-set <type> <name> <data>',
    category: 'backup',
    aliases: ['db-set', 'dbset'],
    permissions: ['ManageGuild'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Missing Permission\n\nYou need **Manage Guild** permission.'))], flags: MessageFlags.IsComponentsV2 });
        }

        if (args.length < 3) {
            return message.reply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Invalid Usage\n\n**Usage:** \`database-set <type> <name> <data>\`\n**Types:** \`${VALID_TYPES.join('`, `')}\`\n\n> For embed type, provide valid JSON data.`))], flags: MessageFlags.IsComponentsV2 });
        }

        const type = args[0].toLowerCase();
        const name = args[1];
        const data = args.slice(2).join(' ');

        if (!VALID_TYPES.includes(type)) {
            return message.reply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Invalid Type\n\nValid: \`${VALID_TYPES.join('`, `')}\``))], flags: MessageFlags.IsComponentsV2 });
        }

        // Parse data
        let parsedData = data;
        if (type === 'embed') {
            try { parsedData = JSON.parse(data); } catch {
                return message.reply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Invalid JSON\n\nEmbed type requires valid JSON.\n\n> Example: `{"title":"Hello","description":"World"}`'))], flags: MessageFlags.IsComponentsV2 });
            }
        }

        const key = `${message.guild.id}_${type}_${name}`;
        const uid = message.author.id;
        const sid = `${uid}_${Date.now().toString(36)}`;
        const emoji = TYPE_EMOJI[type] || '📦';

        // Check if exists (overwrite warning)
        let existing;
        try { existing = await db.get(key); } catch {}

        const preview = typeof parsedData === 'object' ? JSON.stringify(parsedData, null, 2).substring(0, 200) : String(parsedData).substring(0, 200);
        const overwriteNote = existing ? '\n> <:Infotriangle:1473038460456800459> An entry with this name already exists and will be **overwritten**.' : '';

        const ctr = new ContainerBuilder().setAccentColor(existing ? 0xFEE75C : 0xCAD7E6);
        ctr.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# ${emoji} ${existing ? 'Overwrite' : 'Save'} Database Entry\n\n` +
            `**Type:** \`${type}\`\n**Name:** \`${name}\`\n\n` +
            `**Data Preview:**\n\`\`\`\n${preview}${preview.length >= 200 ? '…' : ''}\n\`\`\`${overwriteNote}`
        ));
        ctr.addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`dbs:confirm:${sid}`).setEmoji('<:Save:1473038120030306386>').setLabel(existing ? 'Overwrite' : 'Save').setStyle(existing ? ButtonStyle.Danger : ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`dbs:cancel:${sid}`).setEmoji('<:Cancel:1473037949187657818>').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        ));

        const sent = await message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
        const collector = sent.createMessageComponentCollector({ time: TIMEOUT });

        collector.on('collect', async (i) => {
            if (i.user.id !== uid) return i.reply({ content: '<:Cancel:1473037949187657818> Only the command invoker can use this.', ephemeral: true });
            collector.stop('handled');

            if (i.customId.split(':')[1] === 'confirm') {
                try {
                    const now = Date.now();
                    await db.set(key, {
                        type, name, data: parsedData,
                        guildId: message.guild.id,
                        createdBy: uid,
                        createdAt: existing?.createdAt || now,
                        updatedAt: now
                    });
                    return i.update({ components: [new ContainerBuilder().setAccentColor(0xCAD7E6).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Checkedbox:1473038547165384804> Data Stored\n\n${emoji} **${name}** (\`${type}\`) saved successfully.\n\n> Use \`database-get ${type} ${name}\` to retrieve it.`))], flags: MessageFlags.IsComponentsV2 });
                } catch (err) {
                    console.error('Database Set Error:', err);
                    return i.update({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Error\n\n${err.message}`))], flags: MessageFlags.IsComponentsV2 });
                }
            }
            return i.update({ components: [new ContainerBuilder().setAccentColor(0xCAD7E6).addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Cancelled. No data was stored.'))], flags: MessageFlags.IsComponentsV2 });
        });

        collector.on('end', (_, reason) => {
            if (reason === 'handled') return;
            sent.edit({ components: [buildExpiredPanel('database-set', 'No data was stored.')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        });
    }
};
