'use strict';

/**
 * uuid.js — prefix-only.
 * Generate one or more cryptographically-secure UUID v4 values.
 */

const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const crypto = require('crypto');

const MAX_COUNT = 10;

function errorContainer(title, body) {
    return new ContainerBuilder()
        .setAccentColor(0xED4245)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> ${title}\n\n${body}`));
}

module.exports = {
    name: 'uuid',
    prefix: 'uuid',
    aliases: ['genuuid', 'randomuuid'],
    description: 'Generate random UUIDs',
    usage: 'uuid [count]',
    category: 'utility',

    async executePrefix(message, args) {
        const count = parseInt(args[0], 10) || 1;
        if (!Number.isFinite(count) || count < 1 || count > MAX_COUNT) {
            return message.reply({
                components: [errorContainer('Invalid Count', `Please provide a number between 1 and ${MAX_COUNT}!\n\n**Usage:** \`uuid [count]\`\n**Example:** \`uuid 5\``)],
                flags: MessageFlags.IsComponentsV2
            });
        }

        const uuids = Array.from({ length: count }, () => crypto.randomUUID());

        let content = `# <:Fileuser:1473039570630348810> UUID Generator\n\n**Generated ${count} UUID${count > 1 ? 's' : ''}:**\n\n`;
        uuids.forEach((u, i) => {
            content += `${count > 1 ? `${i + 1}. ` : ''}\`${u}\`\n`;
        });

        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
