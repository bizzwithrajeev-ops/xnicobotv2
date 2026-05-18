const { createImageCommand } = require('../../utils/imageCommandHelper');

module.exports = createImageCommand({
    name: 'invertcolors',
    description: 'Invert colors of an image',
    aliases: ['invert', 'negative'],
    effectName: 'color inversion',
    apiEndpoint: 'invert',
    filename: 'invert.png',
    title: '<:Attach:1473037923979886694> **Inverted Colors**',
    accentColor: 0xCAD7E6,
    errorMessage: '<:Cancel:1473037949187657818> Failed to invert image colors.',
});
