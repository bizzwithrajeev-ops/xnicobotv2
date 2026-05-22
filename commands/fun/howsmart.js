'use strict';

const { createPercentCommand } = require('../../utils/percentCommandFactory');

module.exports = createPercentCommand({
    name: 'howsmart',
    title: 'How Smart?',
    description: 'Find out how smart a user is',
    aliases: ['smartrate', 'smartness'],
    tiers: [
        { max: 10,  text: 'Stuck on the loading screen 💀' },
        { max: 30,  text: 'Wikipedia is your friend 📖' },
        { max: 55,  text: 'Bright on a good day 💡' },
        { max: 75,  text: 'Quick on the uptake 🚀' },
        { max: 90,  text: 'Big brain hours 🧠' },
        { max: 100, text: 'Certified genius 🎓' },
    ],
});
