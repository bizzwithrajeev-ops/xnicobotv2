const { createImageCommand } = require('../../utils/imageCommandHelper');

module.exports = createImageCommand({
    name: 'oilpaint',
    description: 'Apply oil paint effect to an image',
    aliases: ['oil', 'paint'],
    effectName: 'oil paint effect',
    apiEndpoint: 'oilpaint',
    filename: 'oilpaint.png',
    title: '<:Editalt:1473038138577256670> **Oil Painting**',
    accentColor: 0x8B4513,
    errorMessage: '<:Cancel:1473037949187657818> Failed to apply oil paint effect.',
});
