const { createImageCommand } = require('../../utils/imageCommandHelper');

module.exports = createImageCommand({
    name: 'deepfry',
    description: 'Deepfry an image',
    aliases: ['fry', 'fried'],
    effectName: 'deepfry effect',
    apiEndpoint: 'deepfry',
    filename: 'deepfry.png',
    title: '<:Fire:1473038604812161218> **Deepfried Image**',
    accentColor: 0xFF4500,
    errorMessage: '<:Cancel:1473037949187657818> Failed to deepfry image.',
});
