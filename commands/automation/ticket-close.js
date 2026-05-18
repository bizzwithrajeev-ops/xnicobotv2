const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

const jsonStore = require('../../utils/jsonStore');

function loadConfig() {
    if (!jsonStore.has('tickets')) {
        jsonStore.write('tickets', {});
        return {};
    }
    const data = jsonStore.read('tickets');
    if (Array.isArray(data)) {
        jsonStore.write('tickets', {});
        return {};
    }
    return data;
}

function saveConfig(config) {
    jsonStore.write('tickets', config);
}

module.exports = {
    category: 'automation',
    data: new SlashCommandBuilder()
        .setName('ticket-close')
        .setDescription('Close the current ticket'),
    
    async execute(interaction) {
        try {
            const config = loadConfig();
            const guildConfig = config[interaction.guild.id];
            
            if (!guildConfig) {
                return interaction.reply({ content: '<:Cancel:1473037949187657818> Ticket system is not configured!', flags: MessageFlags.Ephemeral });
            }
            
            const ticketData = Object.entries(guildConfig.tickets || {}).find(([channelId]) => channelId === interaction.channel.id);
            
            if (!ticketData) {
                return interaction.reply({ content: '<:Cancel:1473037949187657818> This is not a ticket channel!', flags: MessageFlags.Ephemeral });
            }
            
            const [channelId, ticket] = ticketData;

            // Permission check - only ticket owner, support role, or admin can close
            const supportRole = interaction.guild.roles.cache.get(guildConfig.supportRoleId);
            const isSupport = supportRole && interaction.member.roles.cache.has(supportRole.id);
            const isTicketOwner = ticket.userId === interaction.user.id;
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

            if (!isSupport && !isTicketOwner && !isAdmin) {
                return interaction.reply({ content: '<:Cancel:1473037949187657818> Only the ticket owner, support team, or admins can close tickets!', flags: MessageFlags.Ephemeral });
            }
            
            const container = new ContainerBuilder()
                
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Lock:1473038513749491773> Ticket Closed\n\nThis ticket has been closed by **${interaction.user.username}**\n\nChannel will be deleted in 5 seconds...`)
                );
            
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            
            delete guildConfig.tickets[channelId];
            saveConfig(config);
            
            setTimeout(() => {
                interaction.channel.delete().catch(err => console.error(`Failed to delete ticket channel: ${err.message}`));
            }, 5000);
        } catch (error) {
            console.error(`Ticket close error: ${error.message}`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> Failed to close ticket!', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    async executePrefix(message) {
        try {
            const config = loadConfig();
            const guildConfig = config[message.guild.id];
            
            if (!guildConfig) {
                return message.reply('<:Cancel:1473037949187657818> Ticket system is not configured!');
            }
            
            const ticketData = Object.entries(guildConfig.tickets || {}).find(([channelId]) => channelId === message.channel.id);
            
            if (!ticketData) {
                return message.reply('<:Cancel:1473037949187657818> This is not a ticket channel!');
            }
            
            const [channelId, ticket] = ticketData;

            // Permission check - only ticket owner, support role, or admin can close
            const supportRole = message.guild.roles.cache.get(guildConfig.supportRoleId);
            const isSupport = supportRole && message.member.roles.cache.has(supportRole.id);
            const isTicketOwner = ticket.userId === message.author.id;
            const isAdmin = message.member.permissions.has(PermissionFlagsBits.ManageGuild);

            if (!isSupport && !isTicketOwner && !isAdmin) {
                return message.reply('<:Cancel:1473037949187657818> Only the ticket owner, support team, or admins can close tickets!');
            }
            
            const container = new ContainerBuilder()
                
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Lock:1473038513749491773> Ticket Closed\n\nThis ticket has been closed by **${message.author.username}**\n\nChannel will be deleted in 5 seconds...`)
                );
            
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            
            delete guildConfig.tickets[channelId];
            saveConfig(config);
            
            setTimeout(() => {
                message.channel.delete().catch(err => console.error(`Failed to delete ticket channel: ${err.message}`));
            }, 5000);
        } catch (error) {
            console.error(`Ticket close error: ${error.message}`, error);
        }
    }
};
