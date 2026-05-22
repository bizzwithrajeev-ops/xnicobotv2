'use strict';

const { createPercentCommand } = require('../../utils/percentCommandFactory');

module.exports = createPercentCommand({
    name: 'howgay',
    title: 'How Gay?',
    description: 'Find out the gay percentage of a user',
    aliases: ['gayrate', 'gaymeter'],
    tiers: [
        { max: 10,  text: 'Straight as a ruler 📏' },
        { max: 25,  text: 'Mostly straight, slight wobble 👀' },
        { max: 45,  text: 'Curious mood today 🤔' },
        { max: 60,  text: 'Hitting the rainbow notes 🌈' },
        { max: 80,  text: 'Loud and proud 🏳️‍🌈' },
        { max: 100, text: 'Certified maximum gay ✨🏳️‍🌈' },
    ],
});
