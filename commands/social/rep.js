const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, COLORS } = require('../../utils/responseBuilder');

const jsonStore = require('../../utils/jsonStore');
module.exports = {
    prefix: 'rep',
    description: 'Give reputation to another user',
    usage: 'rep <@user>',
    category: 'social',
    aliases: ['reputation', '+rep'],

    async executePrefix(message, args) {
        const user = message.mentions.users.first();
        if (!user) {
            let content = `# <:Star:1473038501766369300> Reputation\n\n`;
            content += `**Usage:** \`rep @user\`\n\n`;
            content += `### Description\n`;
            content += `> Give a reputation point to another user.\n`;
            content += `> You can give one rep point every 24 hours.\n\n`;
            content += `**Example:** \`rep @TrustedUser\``;

            const container = new ContainerBuilder()
                .setAccentColor(COLORS.INFO)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (user.id === message.author.id) {
            const container = buildErrorResponse('Self-Rep', 'You cannot give yourself reputation!');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let config = {};

        if (jsonStore.has('reputation')) {
            config = jsonStore.read('reputation');
        }

        let cooldowns = {};

        if (jsonStore.has('rep_cooldown')) {
            cooldowns = jsonStore.read('rep_cooldown');
        }

        const lastGiven = cooldowns[message.author.id];
        const cooldownTime = 24 * 60 * 60 * 1000;

        if (lastGiven && Date.now() - lastGiven < cooldownTime) {
            const timeLeft = cooldownTime - (Date.now() - lastGiven);
            const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
            const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

            let content = `# <a:loading:1506015728871149770> Cooldown Active\n\n`;
            content += `You can give reputation again in:\n`;
            content += `> **${hoursLeft}h ${minutesLeft}m**`;

            const container = new ContainerBuilder()
                .setAccentColor(COLORS.WARNING)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        config[user.id] = (config[user.id] || 0) + 1;
        cooldowns[message.author.id] = Date.now();

        jsonStore.write('reputation', config);
        jsonStore.write('rep_cooldown', cooldowns);

        const container = buildSuccessResponse(
            'Reputation Given',
            `You gave **${user.username}** a reputation point!`,
            `**Their Total Rep:** <:Star:1473038501766369300> ${config[user.id]}`
        );

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
