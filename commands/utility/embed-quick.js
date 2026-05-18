const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('embed-quick')
        .setDescription('Quick embed templates')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    
    async execute(interaction) {
        const selectMenu = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('embed_template')
                    .setPlaceholder('Choose an embed template')
                    .addOptions([
                        {
                            label: 'Announcement',
                            description: 'Create an announcement embed',
                            value: 'announcement',
                            emoji: '<:Bullhorn:1473038903157199093>'
                        },
                        {
                            label: 'Warning',
                            description: 'Create a warning embed',
                            value: 'warning',
                            emoji: '<:Infotriangle:1473038460456800459>'
                        },
                        {
                            label: 'Success',
                            description: 'Create a success embed',
                            value: 'success',
                            emoji: '<:Checkedbox:1473038547165384804>'
                        },
                        {
                            label: 'Error',
                            description: 'Create an error embed',
                            value: 'error',
                            emoji: '<:Cancel:1473037949187657818>'
                        },
                        {
                            label: 'Info',
                            description: 'Create an info embed',
                            value: 'info',
                            emoji: '<:Folderopen:1473039552783323348>'
                        },
                        {
                            label: 'Rules',
                            description: 'Create a rules embed',
                            value: 'rules',
                            emoji: '📜'
                        }
                    ])
            );
        
        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# <:Document:1473039496995143731> Quick Embed Templates\n\nSelect a template below to create a pre-designed embed!`)
            );
        
        await interaction.reply({ components: [container, selectMenu], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },
    
    async handleSelectMenu(interaction, lavalinkManager) {
        const template = interaction.values[0];
        
        let embed;
        switch (template) {
            case 'announcement':
                embed = new EmbedBuilder()
                    .setTitle('<:Bullhorn:1473038903157199093> Server Announcement')
                    .setDescription('Important announcement for all members!')
                    .setColor(0xCAD7E6)
                    .setTimestamp();
                break;
            case 'warning':
                embed = new EmbedBuilder()
                    .setTitle('<:Infotriangle:1473038460456800459> Warning')
                    .setDescription('Please read this warning carefully.')
                    .setColor(0xFFA500)
                    .setTimestamp();
                break;
            case 'success':
                embed = new EmbedBuilder()
                    .setTitle('<:Checkedbox:1473038547165384804> Success')
                    .setDescription('Operation completed successfully!')
                    .setColor(0x00FF00)
                    .setTimestamp();
                break;
            case 'error':
                embed = new EmbedBuilder()
                    .setTitle('<:Cancel:1473037949187657818> Error')
                    .setDescription('An error has occurred.')
                    .setColor(0xFF0000)
                    .setTimestamp();
                break;
            case 'info':
                embed = new EmbedBuilder()
                    .setTitle('<:Folderopen:1473039552783323348> Information')
                    .setDescription('Here is some important information.')
                    .setColor(0x00BFFF)
                    .setTimestamp();
                break;
            case 'rules':
                embed = new EmbedBuilder()
                    .setTitle('📜 Server Rules')
                    .setDescription('**Rule 1:** Be respectful\n**Rule 2:** No spam\n**Rule 3:** Follow Discord TOS')
                    .setColor(0x9B59B6)
                    .setTimestamp();
                break;
        }
        
        await interaction.channel.send({ embeds: [embed] });
        
        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# <:Checkedbox:1473038547165384804> Embed Created\n\nYour ${template} embed has been sent!`)
            );
        
        await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply('<:Cancel:1473037949187657818> You need Manage Messages permission to use this command!');
        }

        if (!args[0]) {
            return message.reply('<:Cancel:1473037949187657818> Usage: `-embed-quick <template>`\nTemplates: announcement, warning, success, error, info, rules');
        }

        const template = args[0].toLowerCase();
        let embed;

        switch (template) {
            case 'announcement':
                embed = new EmbedBuilder()
                    .setTitle('<:Bullhorn:1473038903157199093> Server Announcement')
                    .setDescription('Important announcement for all members!')
                    .setColor(0xCAD7E6)
                    .setTimestamp();
                break;
            case 'warning':
                embed = new EmbedBuilder()
                    .setTitle('<:Infotriangle:1473038460456800459> Warning')
                    .setDescription('Please read this warning carefully.')
                    .setColor(0xFFA500)
                    .setTimestamp();
                break;
            case 'success':
                embed = new EmbedBuilder()
                    .setTitle('<:Checkedbox:1473038547165384804> Success')
                    .setDescription('Operation completed successfully!')
                    .setColor(0x00FF00)
                    .setTimestamp();
                break;
            case 'error':
                embed = new EmbedBuilder()
                    .setTitle('<:Cancel:1473037949187657818> Error')
                    .setDescription('An error has occurred.')
                    .setColor(0xFF0000)
                    .setTimestamp();
                break;
            case 'info':
                embed = new EmbedBuilder()
                    .setTitle('<:Folderopen:1473039552783323348> Information')
                    .setDescription('Here is some important information.')
                    .setColor(0x00BFFF)
                    .setTimestamp();
                break;
            case 'rules':
                embed = new EmbedBuilder()
                    .setTitle('📜 Server Rules')
                    .setDescription('**Rule 1:** Be respectful\n**Rule 2:** No spam\n**Rule 3:** Follow Discord TOS')
                    .setColor(0x9B59B6)
                    .setTimestamp();
                break;
            default:
                return message.reply('<:Cancel:1473037949187657818> Invalid template! Available: announcement, warning, success, error, info, rules');
        }

        await message.channel.send({ embeds: [embed] });
        await message.delete().catch(() => {});
    }
};
