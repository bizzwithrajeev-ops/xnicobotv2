'use strict';

const { createPercentCommand } = require('../../utils/percentCommandFactory');

module.exports = createPercentCommand({
    name: 'howrich',
    title: 'How Rich?',
    description: 'Reveal a user\u2019s wealth percentage (just for fun)',
    aliases: ['richrate', 'wealth'],
    tiers: [
        { max: 10,  text: 'Counting coins under the couch \uD83D\uDC51' },
        { max: 30,  text: 'Living paycheck-to-paycheck \uD83D\uDCB8' },
        { max: 55,  text: 'Comfortable middle ground \uD83C\uDFE1' },
        { max: 75,  text: 'Casually flexing \uD83D\uDD11' },
        { max: 90,  text: 'New-money energy \uD83D\uDC8E' },
        { max: 100, text: 'Bezos-tier billionaire \uD83D\uDE80\uD83D\uDCB0' },
    ],
});
