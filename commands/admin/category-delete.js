const { ContainerBuilder, TextDisplayBuilder, StringSelectMenuBuilder, ButtonBuilder, ActionRowBuilder, MessageFlags, PermissionFlagsBits, ButtonStyle, ChannelType, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildExpiredPanel } = require('../../utils/responseBuilder');

module.exports = {
    name: 'category-delete',
    prefix: 'category-delete',
    description: 'Delete a category and all its channels',
    category: 'admin',
    usage: 'category-delete',
    permissions: ['ManageChannels'],

    async executePrefix(message, args) {
        if (!message.guild) return message.reply('<:Cancel:1473037949187657818> This command can only be used in a server.').catch(() => {});
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('<:Cancel:1473037949187657818> You need **Manage Channels** permission to use this command!');
        }

        const categories = message.guild.channels.cache
            .filter(c => c.type === ChannelType.GuildCategory)
            .sort((a, b) => a.position - b.position)
            .first(25);

        if (categories.length === 0) {
            return message.reply('<:Cancel:1473037949187657818> No categories found in this server!');
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('delete_category_select')
            .setPlaceholder('<:Folderopen:1473039552783323348> Select a category to delete')
            .addOptions(categories.map(cat => ({
                label: cat.name.slice(0, 100),
                description: `${cat.children.cache.size} channels`,
                value: cat.id,
                emoji: '<:Folderopen:1473039552783323348>'
            })));

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const container = new ContainerBuilder()
            .setAccentColor(0xED4245)
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# <:Folderopen:1473039552783323348> Delete Category\n\n> Select a category below to delete.\n> <:Cancel:1473037949187657818> **Warning:** This will permanently delete all channels inside!`)
            )
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addActionRowComponents(row);

        const reply = await message.reply({ 
            components: [container], 
            flags: MessageFlags.IsComponentsV2 
        });

        const collector = reply.createMessageComponentCollector({ 
            filter: i => i.user.id === message.author.id,
            time: 60000 
        });

        let selectedCategory = null;

        collector.on('collect', async (interaction) => {
            await interaction.deferUpdate();

            if (interaction.isStringSelectMenu()) {
                selectedCategory = message.guild.channels.cache.get(interaction.values[0]);
                if (!selectedCategory) {
                    return reply.edit({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Error\n\nCategory not found!'))], flags: MessageFlags.IsComponentsV2 });
                }

                const channelCount = selectedCategory.children.cache.size;

                const confirmBtn = new ButtonBuilder()
                    .setCustomId('catdel_confirm')
                    .setLabel('Delete Category')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('<:Trash:1473038090074591293>');

                const cancelBtn = new ButtonBuilder()
                    .setCustomId('catdel_cancel')
                    .setEmoji('<:Cancel:1473037949187657818>')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary);

                const buttonRow = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

                const confirmContainer = new ContainerBuilder()
                    .setAccentColor(0xED4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder()
                            .setContent(`# <:Infotriangle:1473038460456800459> Confirm Deletion\n\n> **Category:** \`${selectedCategory.name}\`\n> **Channels Inside:** ${channelCount}\n\n<:Cancel:1473037949187657818> **Warning:** This will permanently delete the category and all ${channelCount} channel(s) inside it!`)
                    )
                    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                    .addActionRowComponents(buttonRow);

                await reply.edit({ components: [confirmContainer], flags: MessageFlags.IsComponentsV2 });

            } else if (interaction.isButton()) {
                if (interaction.customId === 'catdel_confirm' && selectedCategory) {
                    const categoryName = selectedCategory.name;
                    const channelCount = selectedCategory.children.cache.size;

                    const loadingContainer = new ContainerBuilder()
                        .setAccentColor(0xCAD7E6)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder()
                                .setContent(`# <a:Load:1479681956273852607> Deleting Category\n\n> **Category:** \`${categoryName}\`\n> Removing ${channelCount} channels...`)
                        );

                    await reply.edit({ components: [loadingContainer], flags: MessageFlags.IsComponentsV2 });

                    try {
                        for (const [, channel] of selectedCategory.children.cache) {
                            await channel.delete().catch(() => {});
                        }
                        await selectedCategory.delete();

                        const successContainer = new ContainerBuilder()
                            .setAccentColor(0xCAD7E6)
                            .addTextDisplayComponents(
                                new TextDisplayBuilder()
                                    .setContent(`# <:Checkedbox:1473038547165384804> Category Deleted\n\n> **Category:** \`${categoryName}\`\n> **Channels Removed:** ${channelCount}\n\nThe category and all its channels have been permanently deleted.`)
                            );

                        await reply.edit({ components: [successContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
                    } catch (err) {
                        await reply.edit({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Failed to Delete

${err.message}`))], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
                    }
                    collector.stop();

                } else if (interaction.customId === 'catdel_cancel') {
                    const cancelContainer = new ContainerBuilder()
                        .setAccentColor(0xCAD7E6)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder()
                                .setContent(`# <:Folderopen:1473039552783323348> Cancelled\n\nCategory deletion has been cancelled. No changes were made.`)
                        );

                    await reply.edit({ components: [cancelContainer], flags: MessageFlags.IsComponentsV2 });
                    collector.stop();
                }
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                await reply.edit({ components: [buildExpiredPanel('category-delete', 'No category selected.')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            }
        });
    }
};
