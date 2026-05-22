'use strict';

const { createPercentCommand } = require('../../utils/percentCommandFactory');

module.exports = createPercentCommand({
    name: 'howcute',
    title: 'How Cute?',
    description: 'Find out how cute a user is',
    aliases: ['cuterate', 'cuteness'],
    tiers: [
        { max: 10,  text: 'Try a smile maybe? 🙂' },
        { max: 30,  text: 'Mildly adorable 🐭' },
        { max: 55,  text: 'Pretty cute ngl 🌸' },
        { max: 75,  text: 'Heart melting 🫠' },
        { max: 90,  text: 'Dangerously adorable ⚠️' },
        { max: 100, text: 'Certified plushie 🧸💖' },
    ],
});
