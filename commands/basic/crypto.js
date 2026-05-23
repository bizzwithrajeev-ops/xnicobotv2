const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const axios = require('axios');

async function getCryptoData(coin) {
    try {
        const apiKey = process.env.COINGECKO_API_KEY;
        const headers = apiKey ? { 'x-cg-demo-api-key': apiKey } : {};
        const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd&include_24hr_change=true`, { headers });
        return response.data[coin];
    } catch {
        return null;
    }
}

function buildCryptoContainer(coin, data) {
    const change = data.usd_24h_change ? data.usd_24h_change.toFixed(2) : 'N/A';
    const isUp = data.usd_24h_change >= 0;
    const changeEmoji = isUp ? '<:Toggleon:1473038585501581312>' : '<:Toggleoff:1473038582813032590>';
    const sign = isUp ? '+' : '';
    
    return new ContainerBuilder()
        .setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# <:Invoice:1473039492217835550> ${coin.charAt(0).toUpperCase() + coin.slice(1)} Price`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `<:Invoice:1473039492217835550> **Price (USD):** $${data.usd.toLocaleString()}\n` +
                `${changeEmoji} **24h Change:** ${sign}${change}%`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </> • Data from CoinGecko`));
}

module.exports = {
    prefix: 'crypto',
    description: 'Get cryptocurrency price',
    usage: 'crypto',
    category: 'basic',
    data: new SlashCommandBuilder()
        .setName('crypto')
        .setDescription('Get cryptocurrency price')
        .addStringOption(option =>
            option.setName('coin')
                .setDescription('The cryptocurrency to look up (e.g., bitcoin, ethereum)')
                .setRequired(false)),

    async execute(interaction) {
        const coin = (interaction.options.getString('coin') || 'bitcoin').toLowerCase();
        const data = await getCryptoData(coin);

        if (!data) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> Cryptocurrency not found!', flags: MessageFlags.Ephemeral });
        }

        const container = buildCryptoContainer(coin, data);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        const coin = (args[0] || 'bitcoin').toLowerCase();
        const data = await getCryptoData(coin);

        if (!data) {
            return message.reply('<:Cancel:1473037949187657818> Cryptocurrency not found!');
        }

        const container = buildCryptoContainer(coin, data);
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
