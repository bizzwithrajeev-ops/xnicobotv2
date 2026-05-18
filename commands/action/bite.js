const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'bite',
    description: 'Bite someone playfully',
    verb: 'bit',
    emoji: ':rage:',
    searchQuery: 'anime bite',
    aliases: ['chomp', 'nom'],
    fallbackGifs: [
        'https://media.tenor.com/Z3j3gMKIGjYAAAAC/anime-bite.gif',
        'https://media.tenor.com/aNJuFaWvhSEAAAAC/zero-two-bite.gif',
        'https://media.tenor.com/yG3IVwm1JJIAAAAC/anime-bite.gif',
        'https://media.tenor.com/95DPAhAHsRgAAAAC/anime-bite.gif',
        'https://media.tenor.com/sXBBKFl0mEMAAAAC/bite-anime.gif'
    ]
});
