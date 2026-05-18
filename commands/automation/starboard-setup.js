const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

const jsonStore = require('../../utils/jsonStore');

function getStarboard() {
    if (!jsonStore.has('starboard')) {
        jsonStore.write('starboard', {});
        return {};
    }
    return jsonStore.read('starboard');
}

function saveStarboard(data) {
    jsonStore.write('starboard', data);
}

function buildStarboardSetupPanel(channel, threshold, isNew = true) {
    let content = `# <:Fire:1473038604812161218> Starboard ${isNew ? 'Configured' : 'Settings'}\n\n`;
    content += `Highlight the best messages in your server! When a message receives enough star reactions, it will be automatically posted to the starboard channel.\n\n`;
    
    content += `### <:Bookopen:1473038576391557130> Current Configuration\n`;
    content += `**Channel:** ${channel}\n`;
    content += `**Threshold:** ${threshold} <:Fire:1473038604812161218> reactions required\n\n`;
    
    content += `### <:Chat:1473038936241864865> How It Works\n`;
    content += `**1.** Members react to messages with <:Fire:1473038604812161218>\n`;
    content += `**2.** When a message reaches ${threshold} stars, it gets posted\n`;
    content += `**3.** The message appears in ${channel} with the star count\n`;
    content += `**4.** Star count updates as more users react\n\n`;
    
    content += `### <:Edit:1473037903625191580> Tips\n`;
    content += `• Lower thresholds (2-3) = More active starboard\n`;
    content += `• Higher thresholds (5-10) = Only the best content\n`;
    content += `• The poster cannot star their own message\n`;
    content += `• Bot messages and NSFW channels are excluded`;
    
    return content;
}

function buildHelpPanel() {
    return `# <:Fire:1473038604812161218> Starboard Setup Guide\n\n` +
        `Create a starboard to showcase the best messages in your server!\n\n` +
        `### <:Chat:1473038936241864865> Usage\n` +
        `\`-starboard #channel [threshold]\`\n\n` +
        `### <:Document:1473039496995143731> Parameters\n` +
        `**#channel** - Where starred messages will be posted (required)\n` +
        `**threshold** - Number of stars needed (default: 3)\n\n` +
        `### <:Edit:1473037903625191580> Examples\n` +
        `\`-starboard #starboard\` - Uses default 3 stars\n` +
        `\`-starboard #best-of 5\` - Requires 5 stars\n` +
        `\`-starboard #hall-of-fame 10\` - Requires 10 stars\n\n` +
        `### <:Bookopen:1473038576391557130> Recommended Thresholds\n` +
        `**Small servers (< 50 members):** 2-3 stars\n` +
        `**Medium servers (50-500 members):** 3-5 stars\n` +
        `**Large servers (500+ members):** 5-10 stars\n\n` +
        `### <:Shield:1473038669831995494> Other Commands\n` +
        `\`-starboard-disable\` - Disable the starboard\n` +
        `\`-starboard-stats\` - View starboard statistics`;
}

module.exports = {
    category: 'automation',
    prefix: 'starboard-setup',
    description: 'Setup and manage the starboard for your server',
    usage: 'starboard-setup <#channel> [threshold]',
    aliases: ['starboard'],
    data: null,

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            const container = new ContainerBuilder()
                .setAccentColor(0xED4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Permission Denied\n\n` +
                        `You need the **Manage Server** permission to configure the starboard.`
                    )
                );
            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        if (!args.length || args[0]?.toLowerCase() === 'help') {
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(buildHelpPanel())
                );
            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (args[0]?.toLowerCase() === 'disable') {
            const starboard = getStarboard();
            if (starboard[message.guild.id]) {
                delete starboard[message.guild.id];
                saveStarboard(starboard);
                
                const container = new ContainerBuilder()
                    .setAccentColor(0xED4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# <:Cancel:1473037949187657818> Starboard Disabled\n\n` +
                            `The starboard has been disabled for this server.\n\n` +
                            `*Use \`-starboard #channel\` to re-enable it.*`
                        )
                    );
                return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } else {
                return message.reply('<:Cancel:1473037949187657818> Starboard is not currently enabled!');
            }
        }

        if (args[0]?.toLowerCase() === 'status' || args[0]?.toLowerCase() === 'view') {
            const starboard = getStarboard();
            const config = starboard[message.guild.id];
            
            if (!config) {
                return message.reply('<:Cancel:1473037949187657818> Starboard is not configured! Use `-starboard #channel` to set it up.');
            }
            
            const channel = message.guild.channels.cache.get(config.channelId);
            const starredCount = Object.keys(config.starredMessages || {}).length;
            
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Fire:1473038604812161218> Starboard Status\n\n` +
                        `**Channel:** ${channel || '*Channel not found*'}\n` +
                        `**Threshold:** ${config.threshold} stars\n` +
                        `**Starred Messages:** ${starredCount}\n\n` +
                        `*Use \`-starboard #new-channel [threshold]\` to update settings*`
                    )
                );
            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        const channel = message.mentions.channels.first();
        const threshold = parseInt(args[1]) || 3;
        
        if (!channel) {
            const container = new ContainerBuilder()
                .setAccentColor(0xED4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Missing Channel\n\n` +
                        `Please mention a channel for the starboard.\n\n` +
                        `**Usage:** \`-starboard #channel [threshold]\`\n` +
                        `**Example:** \`-starboard #starboard 5\``
                    )
                );
            return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (threshold < 1 || threshold > 100) {
            return message.reply('<:Cancel:1473037949187657818> Threshold must be between 1 and 100!');
        }
        
        const starboard = getStarboard();
        starboard[message.guild.id] = {
            channelId: channel.id,
            threshold: threshold,
            starredMessages: starboard[message.guild.id]?.starredMessages || {}
        };
        saveStarboard(starboard);
        
        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(buildStarboardSetupPanel(channel, threshold, true))
            );
        
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
};
