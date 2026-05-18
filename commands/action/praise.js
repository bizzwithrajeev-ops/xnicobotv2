const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'praise',
    description: 'Praise someone',
    verb: 'praised',
    emoji: '⭐',
    searchQuery: 'anime praise compliment',
    nekosEndpoint: 'thumbsup',
    waifuEndpoint: 'happy',
    aliases: ['compliment'],
    fallbackGifs: [
        'https://media.tenor.com/Q3h6yUQIpKQAAAAC/anime-happy.gif',
        'https://media.tenor.com/h4rkN5eMHnIAAAAC/happy-anime.gif',
        'https://media.tenor.com/TYRMqppLSMcAAAAC/thumbs-up-anime.gif',
        'https://media.tenor.com/kG5AQKjlJ9AAAAAC/anime-laugh.gif',
        'https://media.tenor.com/y9TkFMyCdZcAAAAC/anime-smile.gif'
    ]
});
