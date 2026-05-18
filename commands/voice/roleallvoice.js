const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, ChannelType } = require('discord.js');

const jsonStore = require('../../utils/jsonStore');

function loadConfig() {
    if (!jsonStore.has('voiceautorole')) {
        jsonStore.write('voiceautorole', {});
        return {};
    }
    return jsonStore.read('voiceautorole');
}

function saveConfig(config) {
    jsonStore.write('voiceautorole', config);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roleallvoice')
        .setDescription('Give a role to all members currently in voice channels')
        .addRoleOption(opt => opt.setName('role').setDescription('Role to assign to all VC members').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    name: 'roleallvoice',
    prefix: 'roleallvoice',
    description: 'Give a role to all members currently in voice channels',
    usage: 'roleallvoice <@role>',
    category: 'voice',
    aliases: ['rav', 'voicerole'],

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> You need **Manage Roles** permission!', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply();

        const role = interaction.options.getRole('role');

        if (role.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.editReply('<:Cancel:1473037949187657818> I cannot assign a role higher than my highest role!');
        }

        if (role.position >= interaction.member.roles.highest.position) {
            return interaction.editReply('<:Cancel:1473037949187657818> You cannot assign a role that is higher than or equal to your highest role!');
        }

        if (role.managed) {
            return interaction.editReply('<:Cancel:1473037949187657818> I cannot assign bot-managed roles!');
        }

        const config = loadConfig();
        config[interaction.guild.id] = role.id;
        saveConfig(config);

        let affectedCount = 0;
        const voiceChannels = interaction.guild.channels.cache.filter(ch =>
            ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice
        );

        for (const [_, channel] of voiceChannels) {
            for (const [_, member] of channel.members) {
                if (!member.roles.cache.has(role.id) && !member.user.bot) {
                    await member.roles.add(role).catch(() => { });
                    affectedCount++;
                }
            }
        }

        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(
                        `# <:Checkedbox:1473038547165384804> Role Applied to Voice Members\n\n` +
                        `**Role:** ${role}\n` +
                        `**Members affected:** ${affectedCount}\n\n` +
                        `> All members currently in voice channels now have this role.\n` +
                        `> The role will be **automatically removed** when they disconnect.\n\n` +
                        `-# Use \`roleallvoice-off\` to disable auto-removal`
                    )
            );

        await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            const { buildPermissionDenied } = require('../../utils/responseBuilder');
            const container = buildPermissionDenied('Manage Roles');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (!args[0]) {
            const config = loadConfig();
            const roleId = config[message.guild.id];
            const role = roleId ? message.guild.roles.cache.get(roleId) : null;

            const voiceChannels = message.guild.channels.cache.filter(ch =>
                ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice
            );
            let membersInVoice = 0;
            for (const [_, channel] of voiceChannels) {
                membersInVoice += channel.members.filter(m => !m.user.bot).size;
            }

            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(
                            `# <:mic:<:Microphone:1473039293088927996>> Role All Voice\n\n` +
                            `**Auto-remove role:** ${role ? role : 'Not set'}\n` +
                            `**Members in VC:** ${membersInVoice}\n\n` +
                            `**Usage:**\n` +
                            `\`roleallvoice @role\` - Give role to all members in VC\n` +
                            `\`roleallvoice-off\` - Disable auto-removal\n\n` +
                            `-# Role is automatically removed when user disconnects from VC`
                        )
                );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
        if (!role) {
            const { buildInvalidUsage } = require('../../utils/responseBuilder');
            const errContainer = buildInvalidUsage('roleallvoice', 'roleallvoice @role', ['roleallvoice @Gamer']);
            return message.reply({ components: [errContainer], flags: MessageFlags.IsComponentsV2 });
        }

        if (role.position >= message.guild.members.me.roles.highest.position) {
            const { buildErrorResponse } = require('../../utils/responseBuilder');
            const errContainer = buildErrorResponse('Role Hierarchy Error', 'I cannot assign a role higher than my highest role!', 'Move my role above the target role in Server Settings > Roles.');
            return message.reply({ components: [errContainer], flags: MessageFlags.IsComponentsV2 });
        }

        if (role.position >= message.member.roles.highest.position) {
            const { buildErrorResponse: buildErr } = require('../../utils/responseBuilder');
            const errContainer = buildErr('Insufficient Permissions', 'You cannot assign a role that is higher than or equal to your highest role.');
            return message.reply({ components: [errContainer], flags: MessageFlags.IsComponentsV2 });
        }

        if (role.managed) {
            const { buildErrorResponse } = require('../../utils/responseBuilder');
            const errContainer = buildErrorResponse('Managed Role', 'I cannot assign bot-managed or integration roles!');
            return message.reply({ components: [errContainer], flags: MessageFlags.IsComponentsV2 });
        }

        const config = loadConfig();
        config[message.guild.id] = role.id;
        saveConfig(config);

        let affectedCount = 0;
        const voiceChannels = message.guild.channels.cache.filter(ch =>
            ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice
        );

        for (const [_, channel] of voiceChannels) {
            for (const [_, member] of channel.members) {
                if (!member.roles.cache.has(role.id) && !member.user.bot) {
                    await member.roles.add(role).catch(() => { });
                    affectedCount++;
                }
            }
        }

        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(
                        `# <:Checkedbox:1473038547165384804> Role Applied to Voice Members\n\n` +
                        `**Role:** ${role}\n` +
                        `**Members affected:** ${affectedCount}\n\n` +
                        `> All members currently in voice channels now have this role.\n` +
                        `> The role will be **automatically removed** when they disconnect.\n\n` +
                        `-# Use \`roleallvoice-off\` to disable auto-removal`
                    )
            );

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
