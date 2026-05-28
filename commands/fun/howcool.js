'use strict';

const { createPercentCommand } = require('../../utils/percentCommandFactory');

module.exports = createPercentCommand({
    name: 'howcool',
    title: 'How Cool?',
    description: 'Find out a user\u2019s cool factor',
    aliases: ['coolrate', 'coolness'],
    tiers: [
        { max: 10,  text: 'Lukewarm at best \uD83E\uDDCA' },
        { max: 30,  text: 'Room-temperature swag \uD83D\uDC55' },
        { max: 55,  text: 'Solidly chill \uD83E\uDDCA' },
        { max: 75,  text: 'Sub-zero swagger \u2744\uFE0F' },
        { max: 90,  text: 'Sunglasses-indoors energy \uD83D\uDD76\uFE0F' },
        { max: 100, text: 'Glacier-cold legend \uD83C\uDFD4\uFE0F\u2728' },
    ],
});
