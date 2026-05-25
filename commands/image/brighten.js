const { createImageCommand } = require('../../utils/imageCommandHelper');

module.exports = createImageCommand({
    name: 'brighten',
    description: 'Brighten an image',
    aliases: ['bright', 'light'],
    effectName: 'brightness',
    apiEndpoint: 'brighten',
    filename: 'brighten.png',
    title: '<:Lightningalt:1473038679906844824> **Brightened Image**',
    accentColor: 0xFFD700,
    errorMessage: '<:Cancel:1473037949187657818> Failed to brighten image.',
    prefixOnly: true,
});
