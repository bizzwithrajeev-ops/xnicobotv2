'use strict';

const { createPercentCommand } = require('../../utils/percentCommandFactory');

module.exports = createPercentCommand({
    name: 'howsus',
    title: 'How Sus?',
    description: 'Find out how sus a user is',
    aliases: ['sus', 'susrate'],
    tiers: [
        { max: 10,  text: 'Crewmate vibes ✅' },
        { max: 30,  text: 'Slightly fishy 🐟' },
        { max: 55,  text: 'Watch them closely 👀' },
        { max: 75,  text: 'Vent confirmed 🚪' },
        { max: 90,  text: 'Definitely the impostor 🔪' },
        { max: 100, text: 'Maximum sus detected 🚨' },
    ],
});
