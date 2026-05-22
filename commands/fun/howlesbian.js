'use strict';

const { createPercentCommand } = require('../../utils/percentCommandFactory');

module.exports = createPercentCommand({
    name: 'howlesbian',
    title: 'How Lesbian?',
    description: 'Find out the lesbian percentage of a user',
    aliases: ['lesbianrate', 'lesrate'],
    tiers: [
        { max: 10,  text: 'Not picking up the vibes 📡' },
        { max: 30,  text: 'Faint signal detected 🛰️' },
        { max: 55,  text: 'Cottagecore energy rising 🍓' },
        { max: 75,  text: 'Strong lesbian aura 🏳️‍🌈' },
        { max: 90,  text: 'Local lesbian icon 💜' },
        { max: 100, text: 'Lesbian royalty crowned 👑🏳️‍🌈' },
    ],
});
