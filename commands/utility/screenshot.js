
const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: null,

    async executePrefix(message, args) {
        if (!args[0]) {
            return message.reply('<:Cancel:1473037949187657818> Please provide a URL! Example: `-screenshot https://google.com`');
        }

        let url = args[0];
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        const loadingMsg = await message.reply('<:wcamera:1386229251895857304> Taking screenshot...');

        try {
            const screenshotUrl = `https://image.thum.io/get/width/1920/crop/768/maxAge/1/noanimate/${url}`;
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:wcamera:1386229251895857304> Website Screenshot\n\n**URL:** ${url}\n\n![Screenshot](${screenshotUrl})`)
                );

            await loadingMsg.edit({ content: null, components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Screenshot error:', error);
            await loadingMsg.edit('<:Cancel:1473037949187657818> Failed to take screenshot! Make sure the URL is valid.');
        }
    }
};
