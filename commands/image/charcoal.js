const { createImageCommand } = require('../../utils/imageCommandHelper');

module.exports = createImageCommand({
    name: 'charcoal',
    description: 'Apply charcoal drawing effect',
    aliases: ['pencil'],
    effectName: 'charcoal effect',
    apiEndpoint: 'charcoal',
    filename: 'charcoal.png',
    title: '<:Editalt:1473038138577256670> **Charcoal Drawing**',
    accentColor: 0x2F4F4F,
    errorMessage: '<:Cancel:1473037949187657818> Failed to apply charcoal effect.',
});
