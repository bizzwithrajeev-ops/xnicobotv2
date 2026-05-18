const { PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('../../utils/database');
const { buildPermissionDenied, buildInvalidUsage, buildSuccessResponse, EMOJIS } = require('../../utils/responseBuilder');

const jsonStore = require('../../utils/jsonStore');

function getLevelRoles() {
    if (!jsonStore.has('levelroles')) {
        jsonStore.write('levelroles', {});
        return {};
    }
    return jsonStore.read('levelroles');
}

function saveLevelRoles(data) {
    jsonStore.write('levelroles', data);
}

module.exports = {
    data: null, // Prefix-only
    name: 'levelroles',
    prefix: 'levelroles',
    description: 'Configure roles awarded at specific levels',
    usage: 'levelroles <add|remove|list> [level] [@role]',
    category: 'leveling',
    aliases: ['lvlroles', 'levelrole'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await message.reply({ components: [buildPermissionDenied('Administrator')], flags: MessageFlags.IsComponentsV2 });
        }
        
        const subcommand = args[0]?.toLowerCase();
        
        if (subcommand === 'add') {
            const level = parseInt(args[1]);
            const role = message.mentions.roles.first();
            
            if (isNaN(level) || !role) {
                return await message.reply({
                    components: [buildInvalidUsage('levelroles', '-levelroles add <level> @role', ['-levelroles add 10 @VIP', '-levelroles add 25 @Regular'])],
                    flags: MessageFlags.IsComponentsV2
                });
            }

            if (level < 1 || level > 1000) {
                return await message.reply({
                    components: [buildInvalidUsage('levelroles', '-levelroles add <level> @role', ['Level must be between 1 and 1000'])],
                    flags: MessageFlags.IsComponentsV2
                });
            }
            
            const levelRoles = getLevelRoles();
            if (!levelRoles[message.guild.id]) {
                levelRoles[message.guild.id] = [];
            }
            
            // Check for duplicate level entry and update if exists
            const existingIndex = levelRoles[message.guild.id].findIndex(lr => lr.level === level);
            if (existingIndex >= 0) {
                levelRoles[message.guild.id][existingIndex].roleId = role.id;
            } else {
                levelRoles[message.guild.id].push({ level, roleId: role.id });
            }
            levelRoles[message.guild.id].sort((a, b) => a.level - b.level);
            saveLevelRoles(levelRoles);
            
            // Also update database so the XP handler uses these roles
            const guildConfig = await getGuildConfig(message.guild.id);
            const dbRoles = guildConfig.leveling?.roles || [];
            const dbExisting = dbRoles.findIndex(r => r.level === level);
            if (dbExisting >= 0) {
                dbRoles[dbExisting].roleId = role.id;
            } else {
                dbRoles.push({ level, roleId: role.id });
            }
            await updateGuildConfig(message.guild.id, { 'leveling.roles': dbRoles }).catch(() => {});
            
            const isUpdate = existingIndex >= 0;
            const container = buildSuccessResponse(
                isUpdate ? 'Level Role Updated' : 'Level Role Added',
                `Users who reach **Level ${level}** will ${isUpdate ? 'now' : ''} receive ${role}.`,
                {
                    'Level': `${level}`,
                    'Role': `${role}`,
                    'Total Rewards': `${levelRoles[message.guild.id].length}`
                }
            );
            container.setAccentColor(0x57F287);
            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        if (subcommand === 'remove') {
            const level = parseInt(args[1]);
            
            if (isNaN(level)) {
                return await message.reply({
                    components: [buildInvalidUsage('levelroles', '-levelroles remove <level>', ['-levelroles remove 10'])],
                    flags: MessageFlags.IsComponentsV2
                });
            }
            
            const levelRoles = getLevelRoles();
            if (!levelRoles[message.guild.id]) {
                levelRoles[message.guild.id] = [];
            }
            
            const beforeLength = levelRoles[message.guild.id].length;
            levelRoles[message.guild.id] = levelRoles[message.guild.id].filter(lr => lr.level !== level);
            saveLevelRoles(levelRoles);
            
            // Also update database
            const guildConfig = await getGuildConfig(message.guild.id);
            const dbRoles = (guildConfig.leveling?.roles || []).filter(r => r.level !== level);
            await updateGuildConfig(message.guild.id, { 'leveling.roles': dbRoles }).catch(() => {});
            
            if (beforeLength === levelRoles[message.guild.id].length) {
                const container = new ContainerBuilder()
                    .setAccentColor(0xFEE75C)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder()
                            .setContent(`# ${EMOJIS.WARNING} Not Found\n\nNo role reward is configured for **Level ${level}**.`)
                    );
                return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            
            const container = buildSuccessResponse('Level Role Removed', `Role reward for **Level ${level}** has been removed.`, {
                'Level': `${level}`,
                'Remaining Rewards': `${levelRoles[message.guild.id].length}`
            });
            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        if (subcommand === 'list') {
            const levelRoles = getLevelRoles();
            const guildRoles = levelRoles[message.guild.id] || [];
            
            if (guildRoles.length === 0) {
                const container = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder()
                            .setContent(`# <:Bookmark:1473038643492028517> Level Roles\n\nNo level roles configured yet.\n\n-# Use \`-levelroles add <level> @role\` to create your first reward`)
                    );
                return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            
            let rolesList = '# <:Bookmark:1473038643492028517> Level Role Rewards\n\n';
            for (const lr of guildRoles) {
                const role = message.guild.roles.cache.get(lr.roleId);
                rolesList += `> <:Caretright:1473038207221502106> **Level ${lr.level}** → ${role || '\`Deleted Role\`'}\n`;
            }
            rolesList += `\n-# ${guildRoles.length} reward${guildRoles.length !== 1 ? 's' : ''} configured`;
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(rolesList)
                );
            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# <:Bookmark:1473038643492028517> Level Roles System\n\nAutomatically assign roles when members reach specific levels.\n\n### <:Document:1473039496995143731> Commands\n> \`-levelroles add <level> @role\` — Add level role reward\n> \`-levelroles remove <level>\` — Remove level role reward\n> \`-levelroles list\` — View all level roles`)
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('levelroles_list')
                    .setLabel('View List')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('<:Bookopen:1473038576391557130>'),
                new ButtonBuilder()
                    .setCustomId('levelroles_help')
                    .setLabel('Help')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('<:Lightbulbalt:1473038470787240009>')
            );
        
        container.addActionRowComponents(row);
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};
