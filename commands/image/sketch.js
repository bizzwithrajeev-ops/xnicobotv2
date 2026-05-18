const { createImageCommand } = require('../../utils/imageCommandHelper');

module.exports = createImageCommand({
    name: 'sketch',
    description: 'Convert image to sketch',
    aliases: ['draw', 'pencilsketch'],
    effectName: 'sketch effect',
    apiEndpoint: 'sketch',
    filename: 'sketch.png',
    title: '<:Editalt:1473038138577256670> **Sketch Effect**',
    accentColor: 0x696969,
    errorMessage: '<:Cancel:1473037949187657818> Failed to convert image to sketch.',
});
