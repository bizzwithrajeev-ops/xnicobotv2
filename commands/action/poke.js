const { createActionCommand } = require('../../utils/actionCommandFactory');

module.exports = createActionCommand({
    name: 'poke',
    description: 'Poke someone to get their attention',
    verb: 'poked',
    emoji: ':point_right:',
    searchQuery: 'anime poke',
    aliases: ['boop'],
    fallbackGifs: [
        'https://media.tenor.com/LxGu8GQBMUAAAAAC/anime-poke.gif',
        'https://media.tenor.com/xHJaBGRsW6cAAAAC/anime-poke.gif',
        'https://media.tenor.com/FNzlgOFJ53MAAAAC/poke-anime.gif',
        'https://media.tenor.com/6AzOjGgyqEkAAAAC/poke-anime.gif',
        'https://media.tenor.com/Y4GROuPTiqgAAAAC/poke-anime.gif'
    ]
});
