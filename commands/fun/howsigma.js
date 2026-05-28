'use strict';

const { createPercentCommand } = require('../../utils/percentCommandFactory');

module.exports = createPercentCommand({
    name: 'howsigma',
    title: 'How Sigma?',
    description: 'Reveal a user\u2019s sigma-grindset percentage',
    aliases: ['sigma', 'sigmarate', 'grindset'],
    tiers: [
        { max: 10,  text: 'Pure beta energy \uD83D\uDCC9' },
        { max: 30,  text: 'Mostly NPC dialogue \uD83D\uDDE3\uFE0F' },
        { max: 55,  text: 'Quietly grinding \u2728' },
        { max: 75,  text: 'Lone-wolf vibes \uD83D\uDC3A' },
        { max: 90,  text: 'Sigma certified \uD83D\uDD25' },
        { max: 100, text: 'Patrick Bateman tier \uD83C\uDFAF' },
    ],
});
