'use strict';

const { createPercentCommand } = require('../../utils/percentCommandFactory');

module.exports = createPercentCommand({
    name: 'howsimp',
    title: 'How Simp?',
    description: 'Calculate a user\u2019s simp percentage',
    aliases: ['simp', 'simprate', 'simplevel'],
    tiers: [
        { max: 10,  text: 'Stone-cold and unbothered \u2744\uFE0F' },
        { max: 30,  text: 'Lightly affectionate \uD83C\uDF38' },
        { max: 55,  text: 'Catching feelings \uD83D\uDE0D' },
        { max: 75,  text: 'Weekly Amazon-gift simp \uD83D\uDCB8' },
        { max: 90,  text: 'PayPal\u2019s favourite customer \uD83D\uDC9F' },
        { max: 100, text: 'Maximum simp protocol engaged \uD83D\uDC51\uD83D\uDC9D' },
    ],
});
