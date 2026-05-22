'use strict';

const { createPercentCommand } = require('../../utils/percentCommandFactory');

module.exports = createPercentCommand({
    name: 'howstraight',
    title: 'How Straight?',
    description: 'Find out the straight percentage of a user',
    aliases: ['straightrate'],
    tiers: [
        { max: 10,  text: 'Bent like a paperclip 📎' },
        { max: 30,  text: 'Mostly off the path 🚧' },
        { max: 55,  text: 'Walking the line 🚶' },
        { max: 75,  text: 'Pretty straight, mostly 🧍' },
        { max: 90,  text: 'Straight arrow energy 🏹' },
        { max: 100, text: 'Certified heteronormative 🧱' },
    ],
});
