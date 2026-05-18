const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'salute',
    description: 'Salute someone with respect',
    verb: 'saluted',
    emoji: '🫡',
    searchQuery: 'anime salute',
    aliases: ['respect'],
    selfAllowed: true,
    fallbackGifs: [
        'https://media.tenor.com/7eV7r0l7I3cAAAAC/anime-salute.gif',
        'https://media.tenor.com/fivv2yQmYVIAAAAC/salute-anime.gif',
        'https://media.tenor.com/2r9eM8mFh8sAAAAC/anime-respect.gif',
        'https://media.tenor.com/MOqY5WfJ2rQAAAAC/anime-military.gif',
        'https://media.tenor.com/1aV8jQzF6f8AAAAC/anime-ok.gif'
    ]
});
