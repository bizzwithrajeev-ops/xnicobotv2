const { createImageCommand } = require('../../utils/imageCommandHelper');

module.exports = createImageCommand({
    name: 'mirror',
    description: 'Mirror/flip an image',
    aliases: ['reflect'],
    effectName: 'mirror effect',
    apiEndpoint: 'flip',
    filename: 'mirror.png',
    title: '<:Refresh:1473037911581528165> **Mirrored Image**',
    accentColor: 0xCAD7E6,
    errorMessage: '<:Cancel:1473037949187657818> Failed to mirror image.',
    prefixOnly: true,
});
