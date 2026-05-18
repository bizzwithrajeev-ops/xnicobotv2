const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');

async function sendSuggestion(client, author, guild, suggestion) {
    const ownerId = process.env.OWNER_ID;
    if (!ownerId) return { success: false };
    
    try {
        const owner = await client.users.fetch(ownerId);
        
        const section = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`# <:Fire:1473038604812161218> New Suggestion`)
            )
            .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: author.displayAvatarURL({ size: 256 }) } }));

        const suggestionContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addSectionComponents(section)
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### <:Edit:1473037903625191580> Suggestion\n${suggestion}\n\n` +
                    `<:User:1473038971398520977> **From:** ${author.username} (\`${author.id}\`)\n` +
                    `<:Folder:1473039340425973972> **Server:** ${guild.name} (\`${guild.id}\`)`
                )
            )
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));

        await owner.send({ components: [suggestionContainer], flags: MessageFlags.IsComponentsV2 });
        return { success: true };
    } catch (error) {
        console.error('Suggestion error:', error);
        return { success: false };
    }
}

module.exports = {
    prefix: 'suggest',
    description: 'Submit a suggestion to the bot owner',
    usage: 'suggest',
    category: 'basic',
    data: new SlashCommandBuilder()
        .setName('suggest')
        .setDescription('Submit a suggestion to the bot owner')
        .addStringOption(option =>
            option.setName('suggestion')
                .setDescription('Your suggestion')
                .setRequired(true)),
    
    async execute(interaction) {
        const suggestion = interaction.options.getString('suggestion');
        const result = await sendSuggestion(interaction.client, interaction.user, interaction.guild, suggestion);
        
        if (result.success) {
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> Suggestion Sent\n\n**Suggestion:** ${suggestion.substring(0, 100)}${suggestion.length > 100 ? '...' : ''}\n**Status:** Sent to bot owner`
                    )
                );
            
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content: '<:Cancel:1473037949187657818> Failed to send suggestion. Please try again later.', flags: MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args) {
        const suggestion = args.join(' ');
        
        if (!suggestion) {
            return message.reply('<:Cancel:1473037949187657818> Please provide a suggestion!');
        }

        const result = await sendSuggestion(message.client, message.author, message.guild, suggestion);
        
        if (result.success) {
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# <:Checkedbox:1473038547165384804> Suggestion Sent\n\nYour suggestion has been sent to the bot owner!`)
                );
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } else {
            await message.reply('<:Cancel:1473037949187657818> Failed to send suggestion. Please try again later.');
        }
    }
};
