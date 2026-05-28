'use strict';

const { createPercentCommand } = require('../../utils/percentCommandFactory');

module.exports = createPercentCommand({
    name: 'howevil',
    title: 'How Evil?',
    description: 'Reveal a user\u2019s evil percentage',
    aliases: ['evilrate', 'villain'],
    tiers: [
        { max: 10,  text: 'Pure cinnamon roll \uD83E\uDD0D' },
        { max: 30,  text: 'Mostly harmless mischief \uD83D\uDE08' },
        { max: 55,  text: 'Chaotic neutral energy \u2696\uFE0F' },
        { max: 75,  text: 'Plotting something \uD83D\uDDA4' },
        { max: 90,  text: 'Cartoon-villain coded \uD83C\uDFAD' },
        { max: 100, text: 'Final-boss energy \uD83D\uDC51\uD83D\uDC80' },
    ],
});
