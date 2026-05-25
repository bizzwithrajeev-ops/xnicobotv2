const { createImageCommand } = require('../../utils/imageCommandHelper');

module.exports = createImageCommand({
    name: 'blur',
    description: 'Apply blur effect to an image',
    aliases: ['blurry'],
    effectName: 'blur effect',
    apiEndpoint: 'blur',
    filename: 'blur.png',
    title: '<:Attach:1473037923979886694> **Blur Effect Applied**',
    accentColor: 0xCAD7E6,
    errorMessage: '<:Cancel:1473037949187657818> Failed to blur image.',
    prefixOnly: true,
});
