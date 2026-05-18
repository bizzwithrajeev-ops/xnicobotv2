const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const crypto = require('crypto');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('uuid')
        .setDescription('Generate random UUIDs')
        .addIntegerOption(o => o.setName('count').setDescription('Number of UUIDs to generate (1-10)').setMinValue(1).setMaxValue(10)),

    prefix: 'uuid',
    description: 'Generate random UUIDs',
    usage: 'uuid [count]',
    category: 'utility',
    aliases: ['genuuid', 'randomuuid'],

    async execute(interaction) {
        const count = interaction.options.getInteger('count') || 1;
        await generateUUIDs(interaction, count, true);
    },

    async executePrefix(message, args) {
        const count = parseInt(args[0]) || 1;
        
        if (count < 1 || count > 10) {
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Invalid Count\n\nPlease provide a number between 1 and 10!\n\n**Usage:** \`-uuid [count]\`\n**Example:** \`-uuid 5\``
                    )
                );
            return message.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }
        
        await generateUUIDs(message, count, false);
    }
};

async function generateUUIDs(context, count, isInteraction) {
    try {
        const uuids = [];
        for (let i = 0; i < count; i++) {
            uuids.push(crypto.randomUUID());
        }
        
        let content = `# <:Fileuser:1473039570630348810> UUID Generator\n\n**Generated ${count} UUID${count > 1 ? 's' : ''}:**\n\n`;
        uuids.forEach((uuid, i) => {
            content += `${count > 1 ? `${i + 1}. ` : ''}\`${uuid}\`\n`;
        });
        
        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(content)
            );
        
        if (isInteraction) {
            await context.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } else {
            await context.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    } catch (error) {
        const errorContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Error\n\n${error.message}`)
            );
        if (isInteraction) {
            await context.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        } else {
            await context.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }
    }
}
