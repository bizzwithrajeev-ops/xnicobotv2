const { createImageCommand } = require('../../utils/imageCommandHelper');

module.exports = createImageCommand({
    name: 'greyscale',
    description: 'Convert image to greyscale',
    aliases: ['grayscale', 'gray', 'grey'],
    effectName: 'greyscale filter',
    apiEndpoint: 'greyscale',
    filename: 'greyscale.png',
    title: '<:Attach:1473037923979886694> **Greyscale Filter**',
    accentColor: 0x808080,
    errorMessage: '<:Cancel:1473037949187657818> Failed to convert image to greyscale.',
});
