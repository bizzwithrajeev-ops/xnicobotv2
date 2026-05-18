const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'cuddle',
    description: 'Cuddle with someone',
    verb: 'cuddled',
    emoji: ':heartpulse:',
    searchQuery: 'anime cuddle',
    aliases: ['snuggle'],
    fallbackGifs: [
        'https://media.tenor.com/DmTYMfbKd5AAAAAC/anime-cuddle.gif',
        'https://media.tenor.com/rl3AS0gJvrwAAAAC/anime-cuddle.gif',
        'https://media.tenor.com/5NEBPfCzHZAAAAAC/anime-hug-cuddle.gif',
        'https://media.tenor.com/aNJuFaWvhSEAAAAC/cuddle-anime.gif',
        'https://media.tenor.com/T7wPVSPldbUAAAAC/anime-cuddle.gif'
    ]
});
