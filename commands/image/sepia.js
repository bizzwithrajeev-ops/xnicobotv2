const { createImageCommand } = require('../../utils/imageCommandHelper');

module.exports = createImageCommand({
    name: 'sepia',
    description: 'Apply sepia filter to an image',
    aliases: ['vintage'],
    effectName: 'sepia filter',
    apiEndpoint: 'sepia',
    filename: 'sepia.png',
    title: '<:Attach:1473037923979886694> **Sepia Filter**',
    accentColor: 0xB8860B,
    errorMessage: '<:Cancel:1473037949187657818> Failed to apply sepia filter.',
});
