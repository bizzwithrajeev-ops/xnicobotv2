const { createImageCommand } = require('../../utils/imageCommandHelper');

module.exports = createImageCommand({
    name: 'trigger',
    description: 'Create a triggered GIF',
    aliases: ['triggered'],
    effectName: 'triggered effect',
    apiEndpoint: 'trigger',
    filename: 'triggered.gif',
    title: '<:Fire:1473038604812161218> **TRIGGERED**',
    accentColor: 0xFF0000,
    errorMessage: '<:Cancel:1473037949187657818> Failed to create triggered GIF.',
});
