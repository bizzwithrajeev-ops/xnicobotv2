'use strict';

const { createPercentCommand } = require('../../utils/percentCommandFactory');

module.exports = createPercentCommand({
    name: 'howcursed',
    title: 'How Cursed?',
    description: 'Measure a user\u2019s cursed-energy level',
    aliases: ['cursedrate', 'cursemeter'],
    tiers: [
        { max: 10,  text: 'Wholesome and blessed \uD83D\uDE07' },
        { max: 30,  text: 'A little eerie \uD83D\uDD2E' },
        { max: 55,  text: 'Mid-grade hex \uD83D\uDD79\uFE0F' },
        { max: 75,  text: 'Walking jinx \uD83D\uDC80' },
        { max: 90,  text: 'Reality-warping cursed \uD83C\uDF00' },
        { max: 100, text: 'Forbidden tome opened \uD83D\uDCDC\uD83D\uDD25' },
    ],
});
