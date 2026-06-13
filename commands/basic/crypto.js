'use strict';

/**
 * crypto.js — prefix-only.
 * Fetches a coin's USD price + 24h change from CoinGecko.
 */

const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const axios = require('axios');

async function getCryptoData(coin) {
    try {
        const apiKey = process.env.COINGECKO_API_KEY;
        const headers = apiKey ? { 'x-cg-demo-api-key': apiKey } : {};
        const response = await axios.get(
            `https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd&include_24hr_change=true`,
            { headers, timeout: 10_000 }
        );
        return response.data?.[coin] || null;
    } catch {
        return null;
    }
}

function buildCryptoContainer(coin, data) {
    const change = (typeof data.usd_24h_change === 'number') ? data.usd_24h_change.toFixed(2) : 'N/A';
    const isUp = (typeof data.usd_24h_change === 'number') ? data.usd_24h_change >= 0 : true;
    const changeEmoji = isUp ? '<:Toggleon:1473038585501581312>' : '<:Toggleoff:1473038582813032590>';
    const sign = isUp ? '+' : '';

    return new ContainerBuilder()
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
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Data from CoinGecko`));
}

module.exports = {
    name: 'crypto',
    prefix: 'crypto',
    aliases: ['coin', 'price'],
    description: 'Get cryptocurrency price',
    usage: 'crypto [coin]',
    category: 'basic',

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
