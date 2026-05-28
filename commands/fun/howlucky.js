'use strict';

const { createPercentCommand } = require('../../utils/percentCommandFactory');

module.exports = createPercentCommand({
    name: 'howlucky',
    title: 'How Lucky?',
    description: 'Read a user\u2019s luck percentage for today',
    aliases: ['luck', 'luckrate', 'fortune'],
    random: true, // luck rerolls every call
    tiers: [
        { max: 10,  text: 'Unlucky day \u2014 stay indoors \u26C8\uFE0F' },
        { max: 30,  text: 'Bad-luck adjacent \uD83C\uDF02' },
        { max: 55,  text: 'A coin-flip kind of day \uD83E\uDE99' },
        { max: 75,  text: 'Fortune is on your side \uD83C\uDF40' },
        { max: 90,  text: 'Lottery-ticket energy \uD83C\uDFAB' },
        { max: 100, text: 'Cosmically blessed \uD83C\uDF1F\u2728' },
    ],
});
