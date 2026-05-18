const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('components-quick')
        .setDescription('Quick Components v2 templates')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    
    async execute(interaction) {
        const selectMenu = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('component_template')
                    .setPlaceholder('Choose a Components v2 template')
                    .addOptions([
                        {
                            label: 'Announcement',
                            description: 'Create an announcement display',
                            value: 'announcement',
                            emoji: '<a:announce:1435683544302223420>'
                        },
                        {
                            label: 'Warning',
                            description: 'Create a warning display',
                            value: 'warning',
                            emoji: '<:Inforect:1473038624172937287>'
                        },
                        {
                            label: 'Success',
                            description: 'Create a success display',
                            value: 'success',
                            emoji: '<:Checkedbox:1473038547165384804>'
                        },
                        {
                            label: 'Error',
                            description: 'Create an error display',
                            value: 'error',
                            emoji: '<:Cancel:1473037949187657818>'
                        },
                        {
                            label: 'Info',
                            description: 'Create an info display',
                            value: 'info',
                            emoji: '<:Inforect:1473038624172937287>'
                        },
                        {
                            label: 'Welcome',
                            description: 'Create a welcome display',
                            value: 'welcome',
                            emoji: '<:Money:1473377877239140529>'
                        },
                        {
                            label: 'Rules',
                            description: 'Create a rules display',
                            value: 'rules',
                            emoji: '<:Bookopen:1473038576391557130>'
                        }
                    ])
            );
        
        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# <:Caretright:1473038207221502106> Quick Components v2 Templates\n\nSelect a template below to create a pre-designed Components v2 display!`)
            )
            .addActionRowComponents(selectMenu);
        
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },
    
    async handleSelectMenu(interaction) {
        const template = interaction.values[0];
        
        let content;
        switch (template) {
            case 'announcement':
                content = `# <a:announce:1435683544302223420> Server Announcement\n\nImportant announcement for all members!`;
                break;
            case 'warning':
                content = `# <:Inforect:1473038624172937287> Warning\n\nPlease read this warning carefully.`;
                break;
            case 'success':
                content = `# <:Checkedbox:1473038547165384804> Success\n\nOperation completed successfully!`;
                break;
            case 'error':
                content = `# <:Cancel:1473037949187657818> Error\n\nAn error has occurred.`;
                break;
            case 'info':
                content = `# <:Inforect:1473038624172937287> Information\n\nHere is some important information.`;
                break;
            case 'welcome':
                content = `# <:Money:1473377877239140529> Welcome!\n\nWelcome to our server! We're glad to have you here.`;
                break;
            case 'rules':
                content = `# <:Bookopen:1473038576391557130> Server Rules\n\n**Rule 1:** Be respectful to all members\n**Rule 2:** No spam or advertising\n**Rule 3:** Follow Discord Terms of Service\n**Rule 4:** Keep conversations in appropriate channels`;
                break;
        }
        
        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(content)
            );
        
        await interaction.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
        
        const confirmContainer = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# <:Checkedbox:1473038547165384804> Component Created\n\nYour ${template} Components v2 display has been sent!`)
            );
        
        await interaction.update({ components: [confirmContainer], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply(`<:Cancel:1473037949187657818> You need Manage Messages permission to use this command!`);
        }

        if (!args[0]) {
            return message.reply(`<:Cancel:1473037949187657818> Usage: \`-components-quick <template>\`\nTemplates: announcement, warning, success, error, info, welcome, rules`);
        }

        const template = args[0].toLowerCase();
        let content;

        switch (template) {
            case 'announcement':
                content = `# <a:announce:1435683544302223420> Server Announcement\n\nImportant announcement for all members!`;
                break;
            case 'warning':
                content = `# <:Inforect:1473038624172937287> Warning\n\nPlease read this warning carefully.`;
                break;
            case 'success':
                content = `# <:Checkedbox:1473038547165384804> Success\n\nOperation completed successfully!`;
                break;
            case 'error':
                content = `# <:Cancel:1473037949187657818> Error\n\nAn error has occurred.`;
                break;
            case 'info':
                content = `# <:Inforect:1473038624172937287> Information\n\nHere is some important information.`;
                break;
            case 'welcome':
                content = `# <:Money:1473377877239140529> Welcome!\n\nWelcome to our server! We're glad to have you here.`;
                break;
            case 'rules':
                content = `# <:Bookopen:1473038576391557130> Server Rules\n\n**Rule 1:** Be respectful to all members\n**Rule 2:** No spam or advertising\n**Rule 3:** Follow Discord Terms of Service\n**Rule 4:** Keep conversations in appropriate channels`;
                break;
            default:
                return message.reply(`<:Cancel:1473037949187657818> Invalid template! Available: announcement, warning, success, error, info, welcome, rules`);
        }

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(content)
            );

        await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
        await message.delete().catch(() => {});
    }
};
