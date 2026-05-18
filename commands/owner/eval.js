const { isOwner } = require('../../utils/helpers');
const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const util = require('util');

function buildEvalContainer(code, output, isError = false) {
    return new ContainerBuilder()
        .setAccentColor(isError ? 0xFF0000 : 0x00FF00)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# ${isError ? '<:Cancel:1473037949187657818> Eval Error' : '<:Bookopen:1473038576391557130> Eval Result'}\n\n` +
                `**<:Fire:1473038604812161218> Input:**\n\`\`\`js\n${code.substring(0, 1000)}\n\`\`\`\n` +
                `**<:Image:1473039533112033508> ${isError ? 'Error' : 'Output'}:**\n\`\`\`js\n${output}\n\`\`\``
            )
        );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('eval')
        .setDescription('<:Lock:1473038513749491773> Owner Only: Execute JavaScript code')
        .addStringOption(option =>
            option.setName('code')
                .setDescription('The code to execute')
                .setRequired(true)),
    
    async execute(interaction, lavalinkManager) {
        if (!isOwner(interaction.user.id)) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> This command is only available to the bot owner!', flags: MessageFlags.Ephemeral });
        }

        const code = interaction.options.getString('code');
        
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
            
            let evaled = eval(code);
            
            if (evaled instanceof Promise) {
                evaled = await evaled;
            }
            
            let output = typeof evaled === 'string' ? evaled : util.inspect(evaled, { depth: 0 });
            
            if (output.length > 1500) {
                output = output.substring(0, 1500) + '...';
            }

            const container = buildEvalContainer(code, output);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            const container = buildEvalContainer(code, error.message, true);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async executePrefix(message, args, lavalinkManager) {
        if (!isOwner(message.author.id)) {
            return message.reply('<:Cancel:1473037949187657818> This command is only available to the bot owner!');
        }

        const code = args.join(' ');
        if (!code) return message.reply('<:Cancel:1473037949187657818> Please provide code to evaluate!');
        
        try {
            let evaled = eval(code);
            
            if (evaled instanceof Promise) {
                evaled = await evaled;
            }
            
            let output = typeof evaled === 'string' ? evaled : util.inspect(evaled, { depth: 0 });
            
            if (output.length > 1500) {
                output = output.substring(0, 1500) + '...';
            }

            const container = buildEvalContainer(code, output);
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            const container = buildEvalContainer(code, error.message, true);
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
