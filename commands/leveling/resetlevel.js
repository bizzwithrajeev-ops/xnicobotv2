const { PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildPermissionDenied, buildInvalidUsage, buildSuccessResponse, EMOJIS } = require('../../utils/responseBuilder');

const jsonStore = require('../../utils/jsonStore');
const { resolveUser } = require('../../utils/resolveUser');

function getLeveling() {
    if (!jsonStore.has('leveling')) {
        jsonStore.write('leveling', {});
        return {};
    }
    return jsonStore.read('leveling');
}

function saveLeveling(data) {
    jsonStore.write('leveling', data);
}

module.exports = {
    data: null, // Prefix-only
    name: 'resetlevel',
    prefix: 'resetlevel',
    description: 'Reset a user\'s level or all levels',
    usage: 'resetlevel <@user|all>',
    category: 'leveling',
    aliases: ['lvlreset', 'resetxp'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await message.reply({ components: [buildPermissionDenied('Administrator')], flags: MessageFlags.IsComponentsV2 });
        }
        
        const leveling = getLeveling();
        
        if (args[0]?.toLowerCase() === 'all') {
            const memberCount = Object.keys(leveling[message.guild.id] || {}).length;

            // Confirmation prompt
            const confirmContent = `# <:Infotriangle:1473038460456800459> Confirm Reset All Levels\n\n` +
                `This will permanently reset leveling data for **${memberCount}** user${memberCount !== 1 ? 's' : ''}.\n\n` +
                `-# This action cannot be undone.`;

            const confirmContainer = new ContainerBuilder()
                .setAccentColor(0xFEE75C)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(confirmContent))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('resetlevel_confirm_all').setLabel('Reset All').setStyle(ButtonStyle.Danger).setEmoji('<:Trash:1473038090074591293>'),
                        new ButtonBuilder().setCustomId('resetlevel_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary).setEmoji('<:Cancel:1473037949187657818>')
                    )
                );

            const confirmMsg = await message.reply({ components: [confirmContainer], flags: MessageFlags.IsComponentsV2 });

            try {
                const filter = i => i.user.id === message.author.id && ['resetlevel_confirm_all', 'resetlevel_cancel'].includes(i.customId);
                const collected = await confirmMsg.awaitMessageComponent({ filter, time: 30000 });

                if (collected.customId === 'resetlevel_confirm_all') {
                    leveling[message.guild.id] = {};
                    saveLeveling(leveling);

                    const container = buildSuccessResponse('All Levels Reset', `All leveling data for **${memberCount}** user${memberCount !== 1 ? 's' : ''} has been wiped.`, {
                        'Server': message.guild.name,
                        'Users Affected': `${memberCount}`,
                        'Reset By': `${message.author}`
                    });
                    container.setAccentColor(0x57F287);
                    await collected.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                } else {
                    const container = buildSuccessResponse('Reset Cancelled', 'No leveling data was modified.');
                    await collected.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
                }
            } catch {
                const expired = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${EMOJIS.ERROR} Confirmation Expired\n\nThe reset was cancelled due to timeout.`));
                await confirmMsg.edit({ components: [expired], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            }
            return;
        }
        
        const target = await resolveUser(message, args);
        
        if (!target) {
            return await message.reply({
                components: [buildInvalidUsage('resetlevel', '-resetlevel @user or -resetlevel all', ['-resetlevel @user', '-resetlevel all'])],
                flags: MessageFlags.IsComponentsV2
            });
        }
        
        if (leveling[message.guild.id] && leveling[message.guild.id][target.id]) {
            const oldData = leveling[message.guild.id][target.id];
            const oldLevel = oldData.level || Math.floor(0.1 * Math.sqrt(oldData.xp || 0));
            delete leveling[message.guild.id][target.id];
            saveLeveling(leveling);
            
            const container = buildSuccessResponse('Level Reset', `${target}'s leveling data has been reset.`, {
                'User': `${target}`,
                'Previous Level': `${oldLevel}`,
                'Previous XP': `${(oldData.xp || 0).toLocaleString()}`,
                'Status': 'Reset to Level 0'
            });
            container.setAccentColor(0x57F287);
            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        const container = new ContainerBuilder()
            .setAccentColor(0xED4245)
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# ${EMOJIS.ERROR} No Data Found\n\n${target} has no leveling data to reset.`)
            );
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};
