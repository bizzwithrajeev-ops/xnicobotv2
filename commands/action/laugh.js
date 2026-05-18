const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'laugh',
    description: 'Laugh with someone',
    verb: 'laughed at',
    emoji: '😂',
    searchQuery: 'anime laughing funny',
    aliases: [],
    fallbackGifs: [
        'https://media.tenor.com/fzEU9uS8HEAAAAAC/laughing-anime.gif',
        'https://media.tenor.com/I3hNmOgDhDEAAAAC/anime-laugh.gif',
        'https://media.tenor.com/kG5AQKjlJ9AAAAAC/laugh-anime.gif',
        'https://media.tenor.com/n5_EqHCxZLUAAAAC/funny-anime.gif',
        'https://media.tenor.com/jVGMdAqAF0AAAAAC/happy-laugh.gif'
    ]
});
