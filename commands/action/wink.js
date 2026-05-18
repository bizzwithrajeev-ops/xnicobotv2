const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'wink',
    description: 'Wink at someone',
    verb: 'winked at',
    emoji: ':wink:',
    searchQuery: 'anime wink',
    aliases: [],
    fallbackGifs: [
        'https://media.tenor.com/bP-gIDBranIAAAAC/anime-wink.gif',
        'https://media.tenor.com/A0h6dGJiWpkAAAAC/anime-wink.gif',
        'https://media.tenor.com/VKlqgSCwn9IAAAAC/wink-anime.gif',
        'https://media.tenor.com/C6bLaREfGqMAAAAC/anime-wink.gif',
        'https://media.tenor.com/3kKMFgx7O3gAAAAC/anime-wink.gif'
    ]
});
