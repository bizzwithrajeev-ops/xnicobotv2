const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'smile',
    description: 'Smile at someone',
    verb: 'smiled at',
    emoji: '😊',
    searchQuery: 'anime smile happy',
    aliases: ['grin'],
    fallbackGifs: [
        'https://media.tenor.com/y9TkFMyCdZcAAAAC/anime-smile.gif',
        'https://media.tenor.com/tYJfKQPHHb8AAAAC/smile-anime.gif',
        'https://media.tenor.com/h4rkN5eMHnIAAAAC/happy-smile.gif',
        'https://media.tenor.com/6KUZGZKxAwIAAAAC/anime-happy.gif',
        'https://media.tenor.com/QfMl8OzVJWcAAAAC/cute-smile.gif'
    ]
});
