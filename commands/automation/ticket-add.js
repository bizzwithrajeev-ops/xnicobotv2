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
        .setName('ticket-add')
        .setDescription('Add a user to the ticket')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to add to the ticket')
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

            // Allow: support role, admin, or ticket owner
            const isSupport = guildConfig.supportRoleId ? interaction.member.roles.cache.has(guildConfig.supportRoleId) : false;
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            const isTicketOwner = ticketData.userId === interaction.user.id;
            if (!isSupport && !isAdmin && !isTicketOwner) {
                return interaction.reply({ content: '<:Cancel:1473037949187657818> Only the ticket owner or support team can add users!', flags: MessageFlags.Ephemeral });
            }
            
            const user = interaction.options.getUser('user');
            
            await interaction.channel.permissionOverwrites.create(user, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });

            // Track added member for transcript accuracy
            ticketData.members = ticketData.members || [];
            if (!ticketData.members.includes(user.id)) {
                ticketData.members.push(user.id);
            }
            jsonStore.write('tickets', config);
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> User Added\n\n**${user.username}** has been added to this ticket!`)
                );
            
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`Ticket add error: ${error.message}`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> Failed to add user to ticket!', flags: MessageFlags.Ephemeral }).catch(() => {});
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

            // Allow: support role, admin, or ticket owner
            const isSupport = guildConfig.supportRoleId ? message.member.roles.cache.has(guildConfig.supportRoleId) : false;
            const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
            const isTicketOwner = ticketData.userId === message.author.id;
            if (!isSupport && !isAdmin && !isTicketOwner) {
                return message.reply('<:Cancel:1473037949187657818> Only the ticket owner or support team can add users!');
            }
            
            const user = message.mentions.users.first();
            if (!user) {
                return message.reply('<:Cancel:1473037949187657818> Please mention a user! Example: `-ticket-add @user`');
            }
            
            await message.channel.permissionOverwrites.create(user, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });

            // Track added member for transcript accuracy
            ticketData.members = ticketData.members || [];
            if (!ticketData.members.includes(user.id)) {
                ticketData.members.push(user.id);
            }
            jsonStore.write('tickets', config);
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> User Added\n\n**${user.username}** has been added to this ticket!`)
                );
            
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error(`Ticket add error: ${error.message}`, error);
        }
    }
};
