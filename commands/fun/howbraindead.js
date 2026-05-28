'use strict';

const { createPercentCommand } = require('../../utils/percentCommandFactory');

module.exports = createPercentCommand({
    name: 'howbraindead',
    title: 'How Braindead?',
    description: 'Reveal a user\u2019s braindead percentage',
    aliases: ['braindead', 'brainrot'],
    tiers: [
        { max: 10,  text: 'Sharp as a tack \uD83D\uDCCC' },
        { max: 30,  text: 'Occasional buffering \u23F3' },
        { max: 55,  text: 'Solid TikTok consumer \uD83D\uDCF1' },
        { max: 75,  text: 'Brain on autopilot \uD83D\uDD01' },
        { max: 90,  text: 'Skibidi-level cognition \uD83D\uDEBD' },
        { max: 100, text: 'Pure brainrot achieved \uD83E\uDDCC\u2728' },
    ],
});
