const { SnowflakeUtil, SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { buildErrorResponse, buildInvalidUsage, COLORS } = require('../../utils/responseBuilder');

function buildSnowflake(snowflake) {
    const timestamp = SnowflakeUtil.timestampFrom(snowflake);
    const workerId = (BigInt(snowflake) >> 17n) & 0x1Fn;
    const processId = (BigInt(snowflake) >> 12n) & 0x1Fn;
    const increment = BigInt(snowflake) & 0xFFFn;

    return new ContainerBuilder()
        .setAccentColor(COLORS.INFO)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Search:1473038053219106847> Snowflake Decoder`))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### <:Bookopen:1473038576391557130> Information\n` +
            `<:Fileuser:1473039570630348810> **ID:** \`${snowflake}\`\n` +
            `<:Clock:1473039102113878056> **Created:** <t:${Math.floor(timestamp / 1000)}:F>\n` +
            `<:Caretright:1473038207221502106> **Relative:** <t:${Math.floor(timestamp / 1000)}:R>`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### <:Settings:1473037894703779851> Technical Details\n` +
            `<:Caretright:1473038207221502106> **Timestamp:** ${timestamp}\n` +
            `<:Caretright:1473038207221502106> **Worker ID:** ${workerId}\n` +
            `<:Caretright:1473038207221502106> **Process ID:** ${processId}\n` +
            `<:Caretright:1473038207221502106> **Increment:** ${increment}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('snowflake')
        .setDescription('Decode a Discord snowflake ID')
        .addStringOption(opt => opt.setName('id').setDescription('Discord snowflake ID to decode').setRequired(true)),

    prefix: 'snowflake',
    description: 'Decode a Discord snowflake ID',
    usage: 'snowflake <id>',
    category: 'basic',
    aliases: ['sf', 'decode'],

    async execute(interaction) {
        const snowflake = interaction.options.getString('id');
        if (!/^\d{17,19}$/.test(snowflake)) {
            const container = buildErrorResponse('Invalid ID', 'Please provide a valid Discord snowflake ID (17-19 digits).');
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        try {
            const container = buildSnowflake(snowflake);
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Snowflake Error:', error);
            const container = buildErrorResponse('Decode Failed', 'Could not decode the snowflake ID.', 'Make sure you provided a valid Discord ID.');
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async executePrefix(message, args) {
        const snowflake = args[0];
        
        if (!snowflake || !/^\d{17,19}$/.test(snowflake)) {
            const container = buildInvalidUsage(
                'snowflake',
                '-snowflake <id>',
                ['-snowflake 123456789012345678', '-snowflake 987654321098765432']
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            const container = buildSnowflake(snowflake);
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Snowflake Error:', error);
            const container = buildErrorResponse(
                'Decode Failed',
                'Could not decode the snowflake ID.',
                'Make sure you provided a valid Discord ID.'
            );
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
