const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { buildSuccessResponse, buildErrorResponse, buildPermissionDenied, buildInvalidUsage } = require('../../utils/responseBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sticker-delete')
        .setDescription('Delete a sticker from the server')
        .addStringOption(option =>
            option.setName('sticker')
                .setDescription('Name or ID of the sticker to delete')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions),
    
    prefix: 'sticker-delete',
    description: 'Delete a sticker from the server',
    usage: 'sticker-delete <sticker name or ID>',
    category: 'admin',
    aliases: ['deletesticker', 'stickerdelete', 'rmsticker'],
    
    async execute(interaction) {
        const stickerInput = interaction.options.getString('sticker');

        try {
            const stickers = await interaction.guild.stickers.fetch();
            let sticker = stickers.get(stickerInput) ||
                stickers.find(s => s.name.toLowerCase() === stickerInput.toLowerCase());

            if (!sticker) {
                const container = buildErrorResponse(
                    'Sticker Not Found',
                    `No sticker with name or ID \`${stickerInput}\` was found.`,
                    'Use the sticker name or its ID.'
                );
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const stickerName = sticker.name;
            await sticker.delete(`Deleted by ${interaction.user.username}`);

            const container = buildSuccessResponse(
                'Sticker Deleted',
                `Successfully deleted the sticker.`,
                {
                    'Sticker': stickerName,
                    'Deleted By': `${interaction.user.username}`
                }
            );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Sticker Delete Error:', error);
            const container = buildErrorResponse(
                'Failed to Delete Sticker',
                'An error occurred while deleting the sticker.',
                `Error: ${error.message}`
            );
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
            const container = buildPermissionDenied('Manage Expressions');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (!args.length) {
            const container = buildInvalidUsage(
                'sticker-delete',
                '-sticker-delete <sticker name or ID>',
                ['-sticker-delete MyStickerName', '-sticker-delete 123456789012345678']
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const stickerInput = args.join(' ');

        try {
            const stickers = await message.guild.stickers.fetch();
            let sticker = stickers.get(stickerInput) ||
                stickers.find(s => s.name.toLowerCase() === stickerInput.toLowerCase());

            if (!sticker) {
                // Also check if the message has stickers
                if (message.stickers.size > 0) {
                    const msgSticker = message.stickers.first();
                    sticker = stickers.get(msgSticker.id);
                }
            }

            if (!sticker) {
                const container = buildErrorResponse(
                    'Sticker Not Found',
                    `No sticker with name or ID \`${stickerInput}\` was found.`,
                    'Use the sticker name or its ID.'
                );
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const stickerName = sticker.name;
            await sticker.delete(`Deleted by ${message.author.username}`);

            const container = buildSuccessResponse(
                'Sticker Deleted',
                `Successfully deleted the sticker.`,
                {
                    'Sticker': stickerName,
                    'Deleted By': `${message.author.username}`
                }
            );

            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Sticker Delete Error:', error);
            const container = buildErrorResponse(
                'Failed to Delete Sticker',
                'An error occurred while deleting the sticker.',
                `Error: ${error.message}`
            );
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
