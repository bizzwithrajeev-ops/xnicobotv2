'use strict';

const { createPercentCommand } = require('../../utils/percentCommandFactory');

module.exports = createPercentCommand({
    name: 'howhot',
    title: 'How Hot?',
    description: 'Reveal a user\u2019s hotness percentage',
    aliases: ['hotrate', 'hotness'],
    tiers: [
        { max: 10,  text: 'Below freezing \uD83E\uDDCA' },
        { max: 30,  text: 'Just lukewarm \uD83C\uDF21\uFE0F' },
        { max: 55,  text: 'Warm and inviting \u2615' },
        { max: 75,  text: 'Smoking hot \uD83D\uDD25' },
        { max: 90,  text: 'Volcanic energy \uD83C\uDF0B' },
        { max: 100, text: 'Hottest in the galaxy \u2600\uFE0F\u2728' },
    ],
});
