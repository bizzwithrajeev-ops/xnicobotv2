const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'feed',
    description: 'Feed someone something tasty',
    verb: 'fed',
    emoji: '🍜',
    searchQuery: 'anime feeding',
    aliases: ['givefood'],
    fallbackGifs: [
        'https://media.tenor.com/s6d5u5p8h9sAAAAC/anime-feeding.gif',
        'https://media.tenor.com/DN5x5-r5H6QAAAAC/feed-anime.gif',
        'https://media.tenor.com/kQ0h6l2i7dQAAAAC/anime-food.gif',
        'https://media.tenor.com/8ez7Gz4w6TgAAAAC/anime-eating.gif',
        'https://media.tenor.com/rX0Y5nQ7dWIAAAAC/anime-cute-food.gif'
    ]
});
