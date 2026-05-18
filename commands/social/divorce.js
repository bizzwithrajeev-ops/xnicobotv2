const { MessageFlags } = require('discord.js');
const { buildSuccessResponse, buildErrorResponse } = require('../../utils/responseBuilder');

const jsonStore = require('../../utils/jsonStore');

function loadMarriages() {
    if (jsonStore.has('marriages')) {
        return jsonStore.read('marriages');
    }
    return {};
}

module.exports = {
    prefix: 'divorce',
    name: 'divorce',
    description: 'Divorce your partner and end the marriage',
    usage: 'divorce',
    category: 'social',
    aliases: ['breakup'],

    async executePrefix(message, args) {
        const config = loadMarriages();

        if (!config[message.author.id]) {
            const container = buildErrorResponse(
                'Not Married',
                'You are not currently married to anyone!',
                'Use `marry @user` to propose to someone.'
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const partnerId = config[message.author.id].partner;
        const partner = await message.client.users.fetch(partnerId).catch(() => null);
        delete config[message.author.id];
        delete config[partnerId];

        jsonStore.write('marriages', config);

        const container = buildSuccessResponse(
            'Divorce Complete',
            '💔 Your marriage has ended.',
            {
                'Divorced By': `${message.author.username}`,
                'Ex-Partner': partner ? `${partner}` : `<@${partnerId}>`
            }
        );
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
    }
};
