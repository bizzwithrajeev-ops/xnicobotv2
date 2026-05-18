const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'hug',
    description: 'Give someone a warm hug',
    verb: 'hugged',
    emoji: ':hugging:',
    searchQuery: 'anime hug',
    aliases: ['embrace'],
    selfMessage: 'You can\'t hug yourself! But here\'s a virtual hug anyway!',
    fallbackGifs: [
        'https://media.tenor.com/LlrrI6S27MQAAAAC/hug.gif',
        'https://media.tenor.com/UcLW0n3WQK8AAAAC/anime-hug.gif',
        'https://media.tenor.com/uyIL_M0h0VwAAAAC/hug-anime.gif',
        'https://media.tenor.com/YlCl0V3-PNAAAAAC/cute-kawai.gif',
        'https://media.tenor.com/5P41gpgH_dkAAAAC/mochi-peachcat.gif'
    ]
});
