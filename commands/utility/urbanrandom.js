const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const axios = require('axios');

async function getRandomDefinition() {
    try {
        const response = await axios.get('https://api.urbandictionary.com/v0/random');
        return response.data.list[0];
    } catch {
        return null;
    }
}

function buildUrbanContainer(data) {
    let content = `# <:Bookopen:1473038576391557130> ${data.word}\n\n` +
        `${data.definition.substring(0, 1500)}\n\n` +
        `👍 **${data.thumbs_up}** | 👎 **${data.thumbs_down}**`;

    if (data.example) {
        content += `\n\n**Example:**\n*${data.example.substring(0, 500)}*`;
    }

    content += `\n\n*By ${data.author}*`;

    return new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('urbanrandom')
        .setDescription('Get a random Urban Dictionary definition'),

    async execute(interaction) {
        const data = await getRandomDefinition();

        if (!data) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> Failed to fetch a random definition!', ephemeral: true });
        }

        const container = buildUrbanContainer(data);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        const data = await getRandomDefinition();

        if (!data) {
            return message.reply('<:Cancel:1473037949187657818> Failed to fetch a random definition!');
        }

        const container = buildUrbanContainer(data);
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
