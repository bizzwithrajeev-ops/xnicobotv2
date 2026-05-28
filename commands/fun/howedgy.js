'use strict';

const { createPercentCommand } = require('../../utils/percentCommandFactory');

module.exports = createPercentCommand({
    name: 'howedgy',
    title: 'How Edgy?',
    description: 'Measure a user\u2019s edge level',
    aliases: ['edgyrate', 'edgelord'],
    tiers: [
        { max: 10,  text: 'Soft as a marshmallow \u2601\uFE0F' },
        { max: 30,  text: 'Mildly spicy \uD83C\uDF36\uFE0F' },
        { max: 55,  text: 'Hoodie-and-headphones aura \uD83C\uDFA7' },
        { max: 75,  text: 'Black-eyeliner energy \uD83C\uDFB8' },
        { max: 90,  text: 'Edgelord on the loose \u26A1' },
        { max: 100, text: 'My Chemical Romance reborn \uD83E\uDD18\uD83C\uDFFB' },
    ],
});
