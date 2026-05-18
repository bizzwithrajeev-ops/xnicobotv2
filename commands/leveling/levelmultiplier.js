const { PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildPermissionDenied, buildInvalidUsage, buildSuccessResponse, buildErrorResponse, EMOJIS } = require('../../utils/responseBuilder');

const jsonStore = require('../../utils/jsonStore');

function getMultiplier() {
    if (!jsonStore.has('levelmultiplier')) {
        jsonStore.write('levelmultiplier', {});
        return {};
    }
    return jsonStore.read('levelmultiplier');
}

function saveMultiplier(data) {
    jsonStore.write('levelmultiplier', data);
}

module.exports = {
    data: null, // Prefix-only
    name: 'levelmultiplier',
    prefix: 'levelmultiplier',
    description: 'Set XP multiplier for roles',
    usage: 'levelmultiplier <set|remove|list> [@role] [multiplier]',
    category: 'leveling',
    aliases: ['lvlmulti', 'xpmultiplier'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await message.reply({ components: [buildPermissionDenied('Administrator')], flags: MessageFlags.IsComponentsV2 });
        }
        
        const subcommand = args[0]?.toLowerCase();
        
        if (subcommand === 'set') {
            const role = message.mentions.roles.first();
            const multiplier = parseFloat(args[2]);
            
            if (!role || isNaN(multiplier) || multiplier <= 0) {
                return await message.reply({
                    components: [buildInvalidUsage('levelmultiplier', '-levelmultiplier set @role <multiplier>', ['-levelmultiplier set @Booster 2.0', '-levelmultiplier set @VIP 1.5'])],
                    flags: MessageFlags.IsComponentsV2
                });
            }

            if (multiplier > 10) {
                return await message.reply({
                    components: [buildErrorResponse('Invalid Multiplier', 'Multiplier must be between **0.1x** and **10x**.', 'Use a reasonable value to prevent XP inflation.')],
                    flags: MessageFlags.IsComponentsV2
                });
            }
            
            const multipliers = getMultiplier();
            if (!multipliers[message.guild.id]) {
                multipliers[message.guild.id] = {};
            }
            
            multipliers[message.guild.id][role.id] = multiplier;
            saveMultiplier(multipliers);
            
            const container = buildSuccessResponse('XP Multiplier Set', `Users with ${role} will now earn **${multiplier}x XP** per message.`, {
                'Role': `${role}`,
                'Multiplier': `${multiplier}x`,
                'Effect': `+${Math.round((multiplier - 1) * 100)}% XP gain`
            });
            container.setAccentColor(0x57F287);
            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        if (subcommand === 'remove') {
            const role = message.mentions.roles.first();
            
            if (!role) {
                return await message.reply({
                    components: [buildInvalidUsage('levelmultiplier', '-levelmultiplier remove @role', ['-levelmultiplier remove @Booster'])],
                    flags: MessageFlags.IsComponentsV2
                });
            }
            
            const multipliers = getMultiplier();
            if (!multipliers[message.guild.id] || !multipliers[message.guild.id][role.id]) {
                const container = new ContainerBuilder()
                    .setAccentColor(0xFEE75C)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder()
                            .setContent(`# ${EMOJIS.WARNING} No Multiplier Found\n\nNo XP multiplier is configured for ${role}.`)
                    );
                return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            
            delete multipliers[message.guild.id][role.id];
            saveMultiplier(multipliers);
            
            const container = buildSuccessResponse('Multiplier Removed', `XP multiplier has been removed for ${role}. They will now earn standard XP.`);
            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        if (subcommand === 'list') {
            const multipliers = getMultiplier();
            const guildMultipliers = multipliers[message.guild.id] || {};
            
            if (Object.keys(guildMultipliers).length === 0) {
                const container = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder()
                            .setContent(`# <:Lightningalt:1473038679906844824> XP Multipliers\n\nNo multipliers configured yet.\n\n-# Use \`-levelmultiplier set @role <multiplier>\` to add one`)
                    );
                return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            
            let multiplierList = '# <:Lightningalt:1473038679906844824> XP Multipliers\n\n';
            for (const [roleId, mult] of Object.entries(guildMultipliers)) {
                const role = message.guild.roles.cache.get(roleId);
                multiplierList += `> <:Caretright:1473038207221502106> ${role || '`Deleted Role`'} — **${mult}x** XP (+${Math.round((mult - 1) * 100)}%)\n`;
            }
            multiplierList += `\n-# ${Object.keys(guildMultipliers).length} multiplier${Object.keys(guildMultipliers).length !== 1 ? 's' : ''} configured`;
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(multiplierList)
                );
            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# <:Lightningalt:1473038679906844824> XP Multiplier System\n\nBoost XP gain for specific roles to reward active members.\n\n### <:Document:1473039496995143731> Commands\n> \`-levelmultiplier set @role <multiplier>\` — Set XP multiplier\n> \`-levelmultiplier remove @role\` — Remove multiplier\n> \`-levelmultiplier list\` — View all multipliers`)
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('levelmultiplier_list')
                    .setLabel('View Multipliers')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('<a:loading:1506015728871149770>'),
                new ButtonBuilder()
                    .setCustomId('levelmultiplier_help')
                    .setLabel('Help')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('<:Lightbulbalt:1473038470787240009>')
            );
        
        container.addActionRowComponents(row);
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};
