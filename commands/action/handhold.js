const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'handhold',
    description: 'Hold someone\'s hand',
    verb: 'held hands with',
    emoji: '🤝',
    searchQuery: 'anime hand holding',
    aliases: ['holdhand'],
    fallbackGifs: [
        'https://media.tenor.com/LxQ5LxQ0KfQAAAAC/anime-hand-holding.gif',
        'https://media.tenor.com/cq9Uq2B9o5kAAAAC/hand-hold-anime.gif',
        'https://media.tenor.com/oaM1pP5KxwYAAAAC/anime-couple.gif',
        'https://media.tenor.com/oQ4FQ_8r4e0AAAAC/anime-romance.gif',
        'https://media.tenor.com/8Qh2K8o8VQIAAAAC/holding-hands-anime.gif'
    ]
});
