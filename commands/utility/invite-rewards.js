const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { setReward, removeReward, getRewards } = require('../../utils/inviteManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite-rewards')
        .setDescription('Manage invite reward roles')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a reward role for reaching invite milestones')
                .addIntegerOption(option =>
                    option.setName('invites')
                        .setDescription('Number of invites required')
                        .setMinValue(1)
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Role to give when milestone is reached')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove an invite reward')
                .addIntegerOption(option =>
                    option.setName('invites')
                        .setDescription('Invite count to remove reward for')
                        .setMinValue(1)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all invite rewards'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'add') {
            const invites = interaction.options.getInteger('invites');
            const role = interaction.options.getRole('role');
            
            setReward(interaction.guild.id, invites, role.id);
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Reward Added\n\n**Milestone:** ${invites} invites\n**Role:** ${role}\n\nUsers will automatically receive this role when they reach ${invites} total invites!`)
                );
            
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        else if (subcommand === 'remove') {
            const invites = interaction.options.getInteger('invites');
            
            removeReward(interaction.guild.id, invites);
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Reward Removed\n\nReward for **${invites} invites** has been removed.`)
                );
            
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        else if (subcommand === 'list') {
            const rewards = getRewards(interaction.guild.id);
            
            if (rewards.length === 0) {
                return interaction.reply({ content: '<:Cancel:1473037949187657818> No invite rewards configured yet!', flags: MessageFlags.Ephemeral });
            }
            
            let rewardText = '# <:Present:1473038450465706076> Invite Rewards\n\n';
            
            for (const reward of rewards) {
                const role = interaction.guild.roles.cache.get(reward.roleId);
                const roleName = role ? role.toString() : 'Unknown Role';
                rewardText += `• **${reward.invites} invites** → ${roleName}\n`;
            }
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(rewardText)
                );
            
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('<:Cancel:1473037949187657818> You need Manage Guild permission to use this command!');
        }

        const action = args[0]?.toLowerCase();
        
        if (action === 'add') {
            const invites = parseInt(args[1]);
            const role = message.mentions.roles.first();
            
            if (!invites || !role) {
                return message.reply('<:Cancel:1473037949187657818> Usage: `-invite-rewards add <invites> @role`');
            }
            
            setReward(message.guild.id, invites, role.id);
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Reward Added\n\n**Milestone:** ${invites} invites\n**Role:** ${role}\n\nUsers will automatically receive this role when they reach ${invites} total invites!`)
                );
            
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        else if (action === 'remove') {
            const invites = parseInt(args[1]);
            
            if (!invites) {
                return message.reply('<:Cancel:1473037949187657818> Usage: `-invite-rewards remove <invites>`');
            }
            
            removeReward(message.guild.id, invites);
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Reward Removed\n\nReward for **${invites} invites** has been removed.`)
                );
            
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        else if (action === 'list') {
            const rewards = getRewards(message.guild.id);
            
            if (rewards.length === 0) {
                return message.reply('<:Cancel:1473037949187657818> No invite rewards configured yet!');
            }
            
            let rewardText = '# <:Present:1473038450465706076> Invite Rewards\n\n';
            
            for (const reward of rewards) {
                const role = message.guild.roles.cache.get(reward.roleId);
                const roleName = role ? role.toString() : 'Unknown Role';
                rewardText += `• **${reward.invites} invites** → ${roleName}\n`;
            }
            
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(rewardText)
                );
            
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        
        else {
            message.reply('<:Cancel:1473037949187657818> Usage: `-invite-rewards <add|remove|list> [args]`');
        }
    }
};
