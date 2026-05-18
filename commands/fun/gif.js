const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = require('discord.js');

async function searchGif(query) {
    const apiKey = process.env.TENOR_API_KEY;
    
    if (!apiKey) {
        return { error: '<:Cancel:1473037949187657818> GIF search is not configured. Please set TENOR_API_KEY in environment variables.' };
    }

    try {
        const response = await fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${apiKey}&limit=10`);
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            return { error: '<:Cancel:1473037949187657818> No GIFs found for that search!' };
        }

        const randomGif = data.results[Math.floor(Math.random() * data.results.length)];
        
        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**${query}** — *Powered by Tenor*`)
            )
            .addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(randomGif.media_formats.gif.url)
                )
            );

        return { container };
    } catch (error) {
        console.error('GIF Error:', error);
        return { error: '<:Cancel:1473037949187657818> Failed to fetch GIF. Please try again later.' };
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gif')
        .setDescription('Search for a GIF')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('What to search for')
                .setRequired(true)),

    prefix: 'gif',
    description: 'Search for a GIF from Tenor',
    usage: 'gif <query>',
    category: 'fun',
    aliases: ['giphy', 'tenor'],

    async execute(interaction) {
        const query = interaction.options.getString('query');
        await interaction.deferReply();
        
        const result = await searchGif(query);
        if (result.error) {
            const errorContainer = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> GIF Error\n\n${result.error.replace('<:Cancel:1473037949187657818> ', '')}`)
                );
            return interaction.editReply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }
        await interaction.editReply({ components: [result.container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        const query = args.join(' ');
        
        if (!query) {
            const errorContainer = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Missing Query\n\nPlease provide a search query!\n\n**Usage:** \`-gif <query>\`\n**Example:** \`-gif happy dance\``
                    )
                );
            return message.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }

        const result = await searchGif(query);
        if (result.error) {
            const errorContainer = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> GIF Error\n\n${result.error.replace('<:Cancel:1473037949187657818> ', '')}`)
                );
            return message.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
        }
        await message.reply({ components: [result.container], flags: MessageFlags.IsComponentsV2 });
    }
};
