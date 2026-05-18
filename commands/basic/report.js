const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');

async function sendReport(client, reporter, guild, bug) {
    const ownerId = process.env.OWNER_ID;
    if (!ownerId) return { success: false, error: new Error('OWNER_ID not configured') };
    
    try {
        const owner = await client.users.fetch(ownerId);
        
        const reportSection = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`# <:Infotriangle:1473038460456800459> Bug Report`)
            )
            .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: reporter.displayAvatarURL({ size: 256 }) } }));

        const reportContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addSectionComponents(reportSection)
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### <:Edit:1473037903625191580> Description\n${bug}\n\n` +
                    `<:User:1473038971398520977> **From:** ${reporter.username} (\`${reporter.id}\`)\n` +
                    `<:Folder:1473039340425973972> **Server:** ${guild.name} (\`${guild.id}\`)`
                )
            )
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));

        await owner.send({ components: [reportContainer], flags: MessageFlags.IsComponentsV2 });
        return { success: true };
    } catch (error) {
        console.error('Report error:', error);
        return { success: false, error };
    }
}

module.exports = {
    sendReport,
    prefix: 'report',
    description: 'Report a bug to the bot owner',
    usage: 'report',
    category: 'basic',
    data: new SlashCommandBuilder()
        .setName('report')
        .setDescription('Report a bug to the bot owner')
        .addStringOption(option =>
            option.setName('bug')
                .setDescription('Describe the bug')
                .setRequired(true)),

    async execute(interaction) {
        const bug = interaction.options.getString('bug');
        const result = await sendReport(interaction.client, interaction.user, interaction.guild, bug);

        if (result.success) {
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> Report Sent\n\nYour bug report has been sent to the bot owner.\n\n**Report:** ${bug.substring(0, 100)}${bug.length > 100 ? '...' : ''}`
                    )
                );
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content: '<:Cancel:1473037949187657818> Failed to send report. Please try again later.', flags: MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args) {
        if (!args.length) {
            return message.reply('<:Cancel:1473037949187657818> Please provide a bug description!');
        }

        const bug = args.join(' ');
        const result = await sendReport(message.client, message.author, message.guild, bug);

        if (result.success) {
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# <:Checkedbox:1473038547165384804> Report Sent\n\nYour bug report has been sent to the bot owner!`)
                );
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } else {
            await message.reply('<:Cancel:1473037949187657818> Failed to send report!');
        }
    }
};
