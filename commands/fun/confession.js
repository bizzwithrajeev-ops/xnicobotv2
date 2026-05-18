const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('confession')
        .setDescription('Submit an anonymous confession')
        .addStringOption(opt =>
            opt.setName('text')
                .setDescription('Your confession (will be anonymous)')
                .setRequired(true)
                .setMaxLength(1000)),

    prefix: 'confession',
    description: 'Submit an anonymous confession - your message will be deleted',
    usage: 'confession <your confession>',
    category: 'fun',
    aliases: ['confess', 'anon'],

    async execute(interaction) {
        const confession = interaction.options.getString('text');
        
        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# 🤫 Anonymous Confession\n\n` +
                    `*"${confession}"*\n\n` +
                    `-# From someone in ${interaction.guild?.name || 'this server'}`
                )
            );
        
        await interaction.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
        
        const confirmContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# <:Checkedbox:1473038547165384804> Confession Sent\n\nYour anonymous confession has been posted!`
                )
            );
        await interaction.reply({ components: [confirmContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async executePrefix(message, args) {
        if (args.length === 0) {
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Missing Confession\n\nPlease provide a confession!\n\n**Usage:** \`-confession <your confession>\``
                    )
                );
            return message.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }
        
        const confession = args.join(' ');
        
        if (confession.length > 1000) {
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Too Long\n\nConfession is too long! Maximum 1000 characters.`
                    )
                );
            return message.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }
        
        await message.delete().catch(() => {});
        
        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# 🤫 Anonymous Confession\n\n` +
                    `*"${confession}"*\n\n` +
                    `-# From someone in ${message.guild?.name || 'this server'}`
                )
            );
        
        await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
