const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

const jsonStore = require('../../utils/jsonStore');

function loadAfkConfig() {
    if (!jsonStore.has('afk')) {
        jsonStore.write('afk', {});
        return {};
    }
    return jsonStore.read('afk');
}

function saveAfkConfig(config) {
    jsonStore.write('afk', config);
}

function loadAfkStats() {
    if (!jsonStore.has('afk-stats')) {
        jsonStore.write('afk-stats', {});
        return {};
    }
    return jsonStore.read('afk-stats');
}

function saveAfkStats(stats) {
    jsonStore.write('afk-stats', stats);
}

module.exports = {
    prefix: 'afk',
    description: 'Set your AFK status',
    usage: 'afk [message]',
    category: 'utility',
    aliases: ['brb', 'away'],
    
    data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Set your AFK status with an optional message')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The reason for being AFK')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('dm-notifications')
                .setDescription('Receive DM when someone mentions you while AFK')
                .setRequired(false)
        ),
    
    async execute(interaction) {
        const afkMessage = interaction.options.getString('message') || 'AFK';
        const dmNotifications = interaction.options.getBoolean('dm-notifications') ?? false;
        const userId = interaction.user.id;
        const timestamp = Date.now();
        
        const afkConfig = loadAfkConfig();
        const afkStats = loadAfkStats();
        const member = interaction.guild.members.cache.get(userId);
        
        if (!afkStats[userId]) afkStats[userId] = { count: 0, totalTime: 0 };
        afkStats[userId].count += 1;
        saveAfkStats(afkStats);
        
        afkConfig[userId] = {
            message: afkMessage,
            timestamp: timestamp,
            guildId: interaction.guild.id,
            mentions: [],
            previousNickname: member?.nickname || null,
            dmNotifications: dmNotifications
        };
        saveAfkConfig(afkConfig);
        
        const dmStatus = dmNotifications ? '<:Checkedbox:1473038547165384804> Enabled' : '<:Cancel:1473037949187657818> Disabled';
        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 💤 AFK Status Set\n\nYou are now AFK: **${afkMessage}**\n\n<:Bookopen:1473038576391557130>**AFK Count:** ${afkStats[userId].count}\n📬 **DM Notifications:** ${dmStatus}`));
        
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        if (member?.manageable && !member.nickname?.startsWith('[AFK] ')) {
            await member.setNickname(`[AFK] ${member.displayName.substring(0, 26)}`).catch(() => {});
        }
    },

    async executePrefix(message, args) {
        let dmNotifications = false;
        let afkMessageText = args.join(' ') || 'AFK';
        
        // Check for --dm or --dm-notifications flag
        if (args.includes('--dm') || args.includes('--dm-notifications')) {
            dmNotifications = true;
            afkMessageText = args.filter(arg => arg !== '--dm' && arg !== '--dm-notifications').join(' ') || 'AFK';
        }
        
        const userId = message.author.id;
        const timestamp = Date.now();
        
        const afkConfig = loadAfkConfig();
        const afkStats = loadAfkStats();
        
        // Update AFK count
        if (!afkStats[userId]) {
            afkStats[userId] = { count: 0, totalTime: 0 };
        }
        afkStats[userId].count += 1;
        saveAfkStats(afkStats);
        
        afkConfig[userId] = {
            message: afkMessageText,
            timestamp: timestamp,
            guildId: message.guild.id,
            mentions: [],
            previousNickname: message.member?.nickname || null,
            dmNotifications: dmNotifications
        };
        
        saveAfkConfig(afkConfig);
        
        const dmStatus = dmNotifications ? '<:Checkedbox:1473038547165384804> Enabled' : '<:Cancel:1473037949187657818> Disabled';
        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# 💤 AFK Status Set\n\nYou are now AFK: **${afkMessageText}**\n\n<:Bookopen:1473038576391557130>**AFK Count:** ${afkStats[userId].count} time${afkStats[userId].count !== 1 ? 's' : ''}\n📬 **DM Notifications:** ${dmStatus}\n\n*You will be automatically removed from AFK when you send a message*\n\n<:Fire:1473038604812161218> *Tip: Use \`--dm\` flag to enable DM notifications*`)
            );
        
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        
        try {
            if (message.member && message.member.manageable && !message.member.nickname?.startsWith('[AFK] ')) {
                await message.member.setNickname(`[AFK] ${message.member.displayName.substring(0, 26)}`).catch(() => {});
            }
        } catch (error) {
            console.error('Error setting AFK nickname:', error);
        }
    }
};
