
const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: null,
    aliases: ['bitly'],

    async executePrefix(message, args) {
        if (!args[0]) {
            return message.reply('<:Cancel:1473037949187657818> Please provide a URL to shorten! Example: `-shorten https://example.com`');
        }

        let url = args[0];
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        const loadingMsg = await message.reply('<:Attach:1473037923979886694> Shortening URL...');

        try {
            const response = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`);
            const shortUrl = response.data;

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Attach:1473037923979886694> URL Shortened\n\n**Original URL:**\n${url}\n\n**Shortened URL:**\n${shortUrl}`)
                );

            await loadingMsg.edit({ content: null, components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('URL shortener error:', error);
            await loadingMsg.edit('<:Cancel:1473037949187657818> Failed to shorten URL! Make sure the URL is valid.');
        }
    }
};
