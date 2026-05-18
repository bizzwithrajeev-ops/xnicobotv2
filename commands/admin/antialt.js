const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildErrorResponse, buildPermissionDenied, COLORS, EMOJIS, BRANDING } = require('../../utils/responseBuilder');

const jsonStore = require('../../utils/jsonStore');

function loadConfig() {
    if (!jsonStore.has('antialt')) {
        jsonStore.write('antialt', {});
        return {};
    }
    return jsonStore.read('antialt');
}

function saveConfig(config) {
    jsonStore.write('antialt', config);
}

function ensureGuildConfig(config, guildId) {
    if (!config[guildId]) {
        config[guildId] = { enabled: false, minAge: 7 };
    }
    return config[guildId];
}

function buildStatusPanel(guildConfig) {
    return new ContainerBuilder()
        .setAccentColor(COLORS.PRIMARY)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# <:Shield:1473038669831995494> Anti-Alt Configuration\n\n` +
                `### <:Invoice:1473039492217835550> Current Settings\n` +
                `**Status:** ${guildConfig.enabled ? '<:Checkedbox:1473038547165384804> Enabled' : '<:Cancel:1473037949187657818> Disabled'}\n` +
                `**Minimum Age:** ${guildConfig.minAge} days\n\n` +
                `### <:Edit:1473037903625191580> Commands\n` +
                `\`/antialt enable\` - Enable anti-alt\n` +
                `\`/antialt disable\` - Disable anti-alt\n` +
                `\`/antialt age <days>\` - Set minimum account age`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('antialt')
        .setDescription('Configure anti-alt account detection')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('enable')
                .setDescription('Enable anti-alt detection'))
        .addSubcommand(sub =>
            sub.setName('disable')
                .setDescription('Disable anti-alt detection'))
        .addSubcommand(sub =>
            sub.setName('age')
                .setDescription('Set minimum account age')
                .addIntegerOption(opt =>
                    opt.setName('days')
                        .setDescription('Minimum account age in days')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(365)))
        .addSubcommand(sub =>
            sub.setName('status')
                .setDescription('View current anti-alt configuration')),

    prefix: 'antialt',
    description: 'Configure anti-alt account detection',
    usage: 'antialt <enable/disable/age/status>',
    category: 'admin',

    async execute(interaction) {
        try {
            const config = loadConfig();
            const guildConfig = ensureGuildConfig(config, interaction.guild.id);
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'enable') {
                config[interaction.guild.id].enabled = true;
                saveConfig(config);
                if (global.updateAntialtCache) global.updateAntialtCache(interaction.guild.id, config[interaction.guild.id]);
                const container = new ContainerBuilder()
                    .setAccentColor(COLORS.PRIMARY)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# ${EMOJIS.SUCCESS} Anti-Alt Enabled\n\nAccounts younger than **${guildConfig.minAge} days** will be detected.`
                        )
                    )
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (subcommand === 'disable') {
                config[interaction.guild.id].enabled = false;
                saveConfig(config);
                if (global.updateAntialtCache) global.updateAntialtCache(interaction.guild.id, config[interaction.guild.id]);
                const container = new ContainerBuilder()
                    .setAccentColor(COLORS.PRIMARY)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# ${EMOJIS.ERROR} Anti-Alt Disabled\n\nAlt account detection has been turned off.`
                        )
                    )
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (subcommand === 'age') {
                const days = interaction.options.getInteger('days');
                config[interaction.guild.id].minAge = days;
                saveConfig(config);
                if (global.updateAntialtCache) global.updateAntialtCache(interaction.guild.id, config[interaction.guild.id]);
                const container = new ContainerBuilder()
                    .setAccentColor(COLORS.PRIMARY)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# ${EMOJIS.SUCCESS} Age Updated\n\nMinimum account age set to **${days} days**.`
                        )
                    )
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            await interaction.reply({ components: [buildStatusPanel(guildConfig)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[AntiAlt] Error:', error);
            const container = buildErrorResponse('Error', 'An error occurred while executing this command.', error.message);
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            const container = buildPermissionDenied('Administrator');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            const config = loadConfig();
            const guildConfig = ensureGuildConfig(config, message.guild.id);
            const subcommand = args[0]?.toLowerCase();

            if (subcommand === 'enable') {
                config[message.guild.id].enabled = true;
                saveConfig(config);
                if (global.updateAntialtCache) global.updateAntialtCache(message.guild.id, config[message.guild.id]);
                const container = new ContainerBuilder()
                    .setAccentColor(COLORS.PRIMARY)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# ${EMOJIS.SUCCESS} Anti-Alt Enabled\n\nAccounts younger than **${guildConfig.minAge} days** will be detected.`
                        )
                    )
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (subcommand === 'disable') {
                config[message.guild.id].enabled = false;
                saveConfig(config);
                if (global.updateAntialtCache) global.updateAntialtCache(message.guild.id, config[message.guild.id]);
                const container = new ContainerBuilder()
                    .setAccentColor(COLORS.PRIMARY)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# ${EMOJIS.ERROR} Anti-Alt Disabled\n\nAlt account detection has been turned off.`
                        )
                    )
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (subcommand === 'age') {
                const days = parseInt(args[1]);
                if (isNaN(days) || days < 1) {
                    const container = new ContainerBuilder()
                        .setAccentColor(COLORS.ERROR)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `# ${EMOJIS.ERROR} Invalid Days\n\nPlease provide a valid number of days!\n\n**Usage:** \`-antialt age <days>\``
                            )
                        );
                    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                }
                config[message.guild.id].minAge = days;
                saveConfig(config);
                if (global.updateAntialtCache) global.updateAntialtCache(message.guild.id, config[message.guild.id]);
                const container = new ContainerBuilder()
                    .setAccentColor(COLORS.PRIMARY)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# ${EMOJIS.SUCCESS} Age Updated\n\nMinimum account age set to **${days} days**.`
                        )
                    )
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            await message.reply({ components: [buildStatusPanel(guildConfig)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[AntiAlt] Error:', error);
            const container = buildErrorResponse('Error', 'An error occurred while executing this command.', error.message);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
