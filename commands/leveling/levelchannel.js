const { PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { updateGuildConfig } = require('../../utils/database');
const { buildPermissionDenied, buildInvalidUsage, buildSuccessResponse } = require('../../utils/responseBuilder');

const jsonStore = require('../../utils/jsonStore');

function getLevelChannel() {
    if (!jsonStore.has('levelchannel')) {
        jsonStore.write('levelchannel', {});
        return {};
    }
    return jsonStore.read('levelchannel');
}

function saveLevelChannel(data) {
    jsonStore.write('levelchannel', data);
}

module.exports = {
    data: null, // Prefix-only
    name: 'levelchannel',
    prefix: 'levelchannel',
    description: 'Set the level-up announcement channel',
    usage: 'levelchannel <set|remove> [#channel]',
    category: 'leveling',
    aliases: ['lvlchannel'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await message.reply({ components: [buildPermissionDenied('Administrator')], flags: MessageFlags.IsComponentsV2 });
        }
        
        const subcommand = args[0]?.toLowerCase();
        
        if (subcommand === 'set') {
            const channel = message.mentions.channels.first();
            
            if (!channel) {
                return await message.reply({
                    components: [buildInvalidUsage('levelchannel', '-levelchannel set #channel', ['-levelchannel set #level-ups'])],
                    flags: MessageFlags.IsComponentsV2
                });
            }
            
            const levelChannels = getLevelChannel();
            levelChannels[message.guild.id] = channel.id;
            saveLevelChannel(levelChannels);
            
            // Also update database so the XP handler uses this channel
            await updateGuildConfig(message.guild.id, {
                'leveling.announcements.enabled': true,
                'leveling.announcements.channel': 'custom',
                'leveling.announcements.customChannelId': channel.id,
                'leveling.announcementChannel': channel.id
            }).catch(() => {});
            
            const container = buildSuccessResponse('Level Channel Set', `All level-up announcements will now be sent to ${channel}.`, {
                'Channel': `${channel}`,
                'Type': 'Custom Channel'
            });
            container.setAccentColor(0x57F287);
            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        if (subcommand === 'disable') {
            const levelChannels = getLevelChannel();
            
            if (!levelChannels[message.guild.id]) {
                const container = new ContainerBuilder()
                    .setAccentColor(0xFEE75C)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder()
                            .setContent(`# <:Infotriangle:1473038460456800459> Not Configured\n\nNo level channel is configured. Use \`-levelchannel set #channel\` to set one.`)
                    );
                return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            
            delete levelChannels[message.guild.id];
            saveLevelChannel(levelChannels);
            
            // Also update database so the XP handler uses same-channel
            await updateGuildConfig(message.guild.id, {
                'leveling.announcements.channel': 'same',
                'leveling.announcements.customChannelId': null,
                'leveling.announcementChannel': null
            }).catch(() => {});
            
            const container = buildSuccessResponse('Level Channel Disabled', 'Level-up announcements will now appear in the same channel where users level up.', {
                'Mode': 'Same Channel'
            });
            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        const levelChannels = getLevelChannel();
        const channelId = levelChannels[message.guild.id];
        
        if (channelId) {
            const channel = message.guild.channels.cache.get(channelId);
            const container = new ContainerBuilder()
                .setAccentColor(0x57F287)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Bullhorn:1473038903157199093> Level Announcement Channel\n\n> **Current Channel:** ${channel || '`Deleted Channel`'}\n> **Status:** <:Toggleon:1473038585501581312> Active\n\n### <:Document:1473039496995143731> Commands\n\`-levelchannel set #channel\` — Set announcement channel\n\`-levelchannel disable\` — Remove and use same channel`)
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('levelchannel_disable')
                        .setLabel('Disable Channel')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('<:Volumeoff:1473039301414621427>'),
                    new ButtonBuilder()
                        .setCustomId('levelchannel_help')
                        .setLabel('Help')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('<:Lightbulbalt:1473038470787240009>')
                );
            
            container.addActionRowComponents(row);
            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        const container = new ContainerBuilder()
            .setAccentColor(0xFEE75C)
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# <:Bullhorn:1473038903157199093> Level Announcement Channel\n\n> **Status:** <:Toggleoff:1473038582813032590> Not Configured\n> **Mode:** Announcements sent in same channel\n\n### <:Document:1473039496995143731> Commands\n\`-levelchannel set #channel\` — Set announcement channel\n\`-levelchannel disable\` — Remove and use same channel`)
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('levelchannel_help')
                    .setLabel('Help')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('<:Lightbulbalt:1473038470787240009>')
            );
        
        container.addActionRowComponents(row);
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};
