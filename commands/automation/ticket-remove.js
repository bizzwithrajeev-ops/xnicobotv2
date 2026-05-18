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

module.exports = {
    category: 'automation',
    data: new SlashCommandBuilder()
        .setName('ticket-remove')
        .setDescription('Remove a user from the ticket')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to remove from the ticket')
                .setRequired(true)),
    
    async execute(interaction) {
        try {
            const config = loadConfig();
            const guildConfig = config[interaction.guild.id];
            
            if (!guildConfig) {
                return interaction.reply({ content: '<:Cancel:1473037949187657818> Ticket system is not configured!', flags: MessageFlags.Ephemeral });
            }
            
            const ticketEntry = Object.entries(guildConfig.tickets || {}).find(([channelId]) => channelId === interaction.channel.id);
            
            if (!ticketEntry) {
                return interaction.reply({ content: '<:Cancel:1473037949187657818> This is not a ticket channel!', flags: MessageFlags.Ephemeral });
            }

            const [ticketChannelId, ticketData] = ticketEntry;

            // Allow: support role or admin only (ticket owner cannot remove others arbitrarily)
            const isSupport = guildConfig.supportRoleId ? interaction.member.roles.cache.has(guildConfig.supportRoleId) : false;
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            if (!isSupport && !isAdmin) {
                return interaction.reply({ content: '<:Cancel:1473037949187657818> Only the support team can remove users from tickets!', flags: MessageFlags.Ephemeral });
            }
            
            const user = interaction.options.getUser('user');

            // Guard: cannot remove ticket owner or the bot
            if (user.id === ticketData.userId) {
                return interaction.reply({ content: '<:Cancel:1473037949187657818> You cannot remove the ticket owner!', flags: MessageFlags.Ephemeral });
            }
            if (user.id === interaction.guild.members.me.id) {
                return interaction.reply({ content: '<:Cancel:1473037949187657818> You cannot remove the bot from the ticket!', flags: MessageFlags.Ephemeral });
            }
            
            await interaction.channel.permissionOverwrites.delete(user);

            // Update members list for transcript accuracy
            if (ticketData.members) {
                ticketData.members = ticketData.members.filter(id => id !== user.id);
            }
            jsonStore.write('tickets', config);
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Cancel:1473037949187657818> User Removed\n\n**${user.username}** has been removed from this ticket!`)
                );
            
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`Ticket remove error: ${error.message}`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> Failed to remove user from ticket!', flags: MessageFlags.Ephemeral }).catch(() => {});
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
            
            const ticketEntry = Object.entries(guildConfig.tickets || {}).find(([channelId]) => channelId === message.channel.id);
            
            if (!ticketEntry) {
                return message.reply('<:Cancel:1473037949187657818> This is not a ticket channel!');
            }

            const [ticketChannelId, ticketData] = ticketEntry;

            // Allow: support role or admin only
            const isSupport = guildConfig.supportRoleId ? message.member.roles.cache.has(guildConfig.supportRoleId) : false;
            const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
            if (!isSupport && !isAdmin) {
                return message.reply('<:Cancel:1473037949187657818> Only the support team can remove users from tickets!');
            }
            
            const user = message.mentions.users.first();
            if (!user) {
                return message.reply('<:Cancel:1473037949187657818> Please mention a user! Example: `-ticket-remove @user`');
            }

            if (user.id === ticketData.userId) {
                return message.reply('<:Cancel:1473037949187657818> You cannot remove the ticket owner!');
            }
            if (user.id === message.guild.members.me.id) {
                return message.reply('<:Cancel:1473037949187657818> You cannot remove the bot from the ticket!');
            }
            
            await message.channel.permissionOverwrites.delete(user);

            // Update members list for transcript accuracy
            if (ticketData.members) {
                ticketData.members = ticketData.members.filter(id => id !== user.id);
            }
            jsonStore.write('tickets', config);
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Cancel:1473037949187657818> User Removed\n\n**${user.username}** has been removed from this ticket!`)
                );
            
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`Ticket remove error: ${error.message}`, error);
        }
    }
};
