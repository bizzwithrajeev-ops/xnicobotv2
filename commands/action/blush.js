const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'blush',
    description: 'Blush around someone',
    verb: 'blushed around',
    emoji: '😳',
    searchQuery: 'anime blush embarrassed',
    aliases: ['shy'],
    fallbackGifs: [
        'https://media.tenor.com/OQgBV0aKCe4AAAAC/blush-anime.gif',
        'https://media.tenor.com/7d6PfL-ksKAAAAAC/anime-blush.gif',
        'https://media.tenor.com/-sV3HYQfW0MAAAAC/blush-cute.gif',
        'https://media.tenor.com/VqVG3TTXN0AAAAC/anime-embarrassed.gif',
        'https://media.tenor.com/5JEiWpuEZB0AAAAC/embarrassed-anime.gif'
    ]
});
