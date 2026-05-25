const { createImageCommand } = require('../../utils/imageCommandHelper');

module.exports = createImageCommand({
    name: 'jpeg',
    description: 'Add JPEG compression artifacts',
    aliases: ['jpegify', 'needsmorejpeg'],
    effectName: 'JPEG compression',
    apiEndpoint: 'jpeg',
    filename: 'jpeg.jpg',
    title: '<:Attach:1473037923979886694> **Needs More JPEG!**',
    accentColor: 0x8B4513,
    errorMessage: '<:Cancel:1473037949187657818> Failed to JPEGify image.',
    prefixOnly: true,
});
