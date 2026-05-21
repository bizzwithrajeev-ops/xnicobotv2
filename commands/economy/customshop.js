'use strict';

/**
 * Custom Shop System — Admins create custom items with custom actions.
 *
 * Actions an item can perform when bought:
 *   - give_role: Assign a role to the buyer
 *   - remove_role: Remove a role from the buyer
 *   - send_dm: Send a DM to the buyer with custom text
 *   - add_coins: Give bonus coins
 *   - custom_reply: Send a custom message in channel
 *
 * Setup: /customshop add <name> <price> <action> [role/message]
 * Buy:   /customshop buy <item>
 * List:  /customshop list
 */

const {
    SlashCommandBuilder, PermissionFlagsBits, MessageFlags,
    ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const jsonStore = require('../../utils/jsonStore');
const economyManager = require('../../utils/economyManager');

const STORE = 'custom-shop';

const E = {
    shop:   '<:Folder:1473039340425973972>',
    coin:   '<:Money:1473377877239140529>',
    check:  '<:Checkedbox:1473038547165384804>',
    cancel: '<:Cancel:1473037949187657818>',
    add:    '<:Add:1473038100862337035>',
    trash:  '<:Trash:1473038090074591293>',
    edit:   '<:Editalt:1473038138577256670>',
    star:   '<:Star:1473038501766369300>',
    cart:   '<:Attach:1473037923979886694>',
    info:   '<:Inforect:1473038624172937287>',
    role:   '<:Shield:1473038669831995494>',
    dm:     '<:Envelope:1473038885364695113>',
    fire:   '<:Fire:1473038604812161218>',
};

function getShop(guildId) {
    const all = jsonStore.peek(STORE) || {};
    return all[guildId] || { items: [], currency: 'coins' };
}

function saveShop(guildId, shop) {
    const all = jsonStore.read(STORE) || {};
    all[guildId] = shop;
    jsonStore.write(STORE, all);
}

function buildShopPanel(guild, shop) {
    const items = shop.items || [];

    const container = new ContainerBuilder().setAccentColor(0xFBBF24);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## ${E.shop} ${guild.name}'s Custom Shop\n-# ${items.length} item${items.length !== 1 ? 's' : ''} available`
    ));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    if (items.length === 0) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `${E.info} No items in the shop yet.\n\n` +
            `Admins can add items with:\n` +
            `> \`/customshop add\` or \`-customshop add <name> <price> <action>\`\n\n` +
            `**Available actions:**\n` +
            `> ${E.role} \`give_role\` — Assign a role on purchase\n` +
            `> ${E.role} \`remove_role\` — Remove a role on purchase\n` +
            `> ${E.dm} \`send_dm\` — DM buyer with custom text\n` +
            `> ${E.coin} \`add_coins\` — Give bonus coins\n` +
            `> ${E.fire} \`custom_reply\` — Send custom message in channel`
        ));
    } else {
        let itemList = '';
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const actionLabel = { give_role: '🛡️ Role', remove_role: '🛡️ -Role', send_dm: '📩 DM', add_coins: '💰 Coins', custom_reply: '💬 Reply' }[item.action] || item.action;
            itemList += `> \`${i + 1}.\` **${item.name}** — ${E.coin} ${item.price.toLocaleString()} · ${actionLabel}\n`;
        }
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(itemList));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# Use \`/customshop buy <item name>\` or \`-customshop buy <number>\` to purchase`
    ));

    return container;
}

async function executeAction(interaction, member, item, guild) {
    const results = [];

    switch (item.action) {
        case 'give_role': {
            const role = guild.roles.cache.get(item.actionData);
            if (role) {
                await member.roles.add(role).catch(() => results.push('Failed to add role'));
                results.push(`${E.role} Received role **${role.name}**`);
            } else results.push('Role not found');
            break;
        }
        case 'remove_role': {
            const role = guild.roles.cache.get(item.actionData);
            if (role) {
                await member.roles.remove(role).catch(() => results.push('Failed to remove role'));
                results.push(`${E.role} Removed role **${role.name}**`);
            } else results.push('Role not found');
            break;
        }
        case 'send_dm': {
            try {
                await member.user.send(item.actionData || 'Thank you for your purchase!');
                results.push(`${E.dm} DM sent`);
            } catch { results.push('Could not DM (DMs disabled)'); }
            break;
        }
        case 'add_coins': {
            const bonus = parseInt(item.actionData) || 0;
            if (bonus > 0) {
                const economy = economyManager.loadEconomy();
                const { userData } = economyManager.getUser(economy, member.id);
                userData.coins += bonus;
                economyManager.saveEconomy(economy);
                results.push(`${E.coin} Received **${bonus.toLocaleString()}** bonus coins`);
            }
            break;
        }
        case 'custom_reply': {
            results.push(item.actionData || 'Item purchased!');
            break;
        }
        default:
            results.push('Item purchased');
    }

    return results;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('customshop')
        .setDescription('Custom server shop with configurable items')
        .addSubcommand(sub => sub.setName('list').setDescription('View the custom shop'))
        .addSubcommand(sub => sub
            .setName('buy')
            .setDescription('Buy an item from the custom shop')
            .addStringOption(o => o.setName('item').setDescription('Item name or number').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('Add an item to the shop (Admin)')
            .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
            .addIntegerOption(o => o.setName('price').setDescription('Price in coins').setRequired(true).setMinValue(1))
            .addStringOption(o => o.setName('action').setDescription('Action on purchase').setRequired(true)
                .addChoices(
                    { name: '🛡️ Give Role', value: 'give_role' },
                    { name: '🛡️ Remove Role', value: 'remove_role' },
                    { name: '📩 Send DM', value: 'send_dm' },
                    { name: '💰 Add Coins', value: 'add_coins' },
                    { name: '💬 Custom Reply', value: 'custom_reply' }
                ))
            .addStringOption(o => o.setName('data').setDescription('Role ID, DM text, coin amount, or reply text').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Remove an item from the shop (Admin)')
            .addStringOption(o => o.setName('item').setDescription('Item name or number').setRequired(true))),

    prefix: 'customshop',
    description: 'Custom server shop system',
    usage: 'customshop [list|buy|add|remove]',
    category: 'economy',
    aliases: ['cshop', 'servershop'],

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const shop = getShop(interaction.guild.id);

        if (sub === 'list') {
            const panel = buildShopPanel(interaction.guild, shop);
            return interaction.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        }

        if (sub === 'buy') {
            const input = interaction.options.getString('item');
            const idx = parseInt(input) - 1;
            const item = shop.items[idx] || shop.items.find(i => i.name.toLowerCase() === input.toLowerCase());

            if (!item) return interaction.reply({ content: `${E.cancel} Item not found. Use \`/customshop list\` to see available items.`, flags: MessageFlags.Ephemeral });

            const economy = economyManager.loadEconomy();
            const { userData } = economyManager.getUser(economy, interaction.user.id);

            if (userData.coins < item.price) {
                return interaction.reply({ content: `${E.cancel} You need **${item.price.toLocaleString()}** coins but only have **${userData.coins.toLocaleString()}**.`, flags: MessageFlags.Ephemeral });
            }

            userData.coins -= item.price;
            economyManager.saveEconomy(economy);

            const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
            const results = await executeAction(interaction, member, item, interaction.guild);

            const container = new ContainerBuilder().setAccentColor(0x57F287)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `## ${E.check} Purchase Successful!\n\n` +
                    `**Item:** ${item.name}\n` +
                    `**Cost:** ${E.coin} ${item.price.toLocaleString()}\n` +
                    `**Balance:** ${E.coin} ${userData.coins.toLocaleString()}\n\n` +
                    `### ${E.fire} Effects\n${results.map(r => `> ${r}`).join('\n')}`
                ));
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (sub === 'add') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ content: `${E.cancel} You need **Manage Server** permission.`, flags: MessageFlags.Ephemeral });
            }

            const name = interaction.options.getString('name');
            const price = interaction.options.getInteger('price');
            const action = interaction.options.getString('action');
            const data = interaction.options.getString('data');

            if (shop.items.length >= 25) return interaction.reply({ content: `${E.cancel} Maximum 25 items per shop.`, flags: MessageFlags.Ephemeral });
            if (shop.items.some(i => i.name.toLowerCase() === name.toLowerCase())) {
                return interaction.reply({ content: `${E.cancel} An item with that name already exists.`, flags: MessageFlags.Ephemeral });
            }

            shop.items.push({ name, price, action, actionData: data, createdBy: interaction.user.id, createdAt: Date.now() });
            saveShop(interaction.guild.id, shop);

            return interaction.reply({
                content: `${E.check} Added **${name}** to the shop for ${E.coin} ${price.toLocaleString()} (action: \`${action}\`)`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (sub === 'remove') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({ content: `${E.cancel} You need **Manage Server** permission.`, flags: MessageFlags.Ephemeral });
            }

            const input = interaction.options.getString('item');
            const idx = parseInt(input) - 1;
            const itemIdx = idx >= 0 && idx < shop.items.length ? idx : shop.items.findIndex(i => i.name.toLowerCase() === input.toLowerCase());

            if (itemIdx < 0) return interaction.reply({ content: `${E.cancel} Item not found.`, flags: MessageFlags.Ephemeral });

            const removed = shop.items.splice(itemIdx, 1)[0];
            saveShop(interaction.guild.id, shop);

            return interaction.reply({ content: `${E.trash} Removed **${removed.name}** from the shop.`, flags: MessageFlags.Ephemeral });
        }
    },

    async executePrefix(message, args) {
        const sub = args[0]?.toLowerCase();
        const shop = getShop(message.guild.id);

        if (!sub || sub === 'list') {
            const panel = buildShopPanel(message.guild, shop);
            return message.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        }

        if (sub === 'buy') {
            const input = args.slice(1).join(' ');
            if (!input) return message.reply(`${E.cancel} Usage: \`-customshop buy <item name or number>\``);

            const idx = parseInt(input) - 1;
            const item = (idx >= 0 && shop.items[idx]) || shop.items.find(i => i.name.toLowerCase() === input.toLowerCase());
            if (!item) return message.reply(`${E.cancel} Item not found. Use \`-customshop list\`.`);

            const economy = economyManager.loadEconomy();
            const { userData } = economyManager.getUser(economy, message.author.id);

            if (userData.coins < item.price) {
                return message.reply(`${E.cancel} You need **${item.price.toLocaleString()}** coins (you have ${userData.coins.toLocaleString()}).`);
            }

            userData.coins -= item.price;
            economyManager.saveEconomy(economy);

            const member = await message.guild.members.fetch(message.author.id).catch(() => null);
            const results = await executeAction(message, member, item, message.guild);

            const container = new ContainerBuilder().setAccentColor(0x57F287)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `## ${E.check} Purchase Successful!\n\n` +
                    `**Item:** ${item.name}\n` +
                    `**Cost:** ${E.coin} ${item.price.toLocaleString()}\n` +
                    `**Balance:** ${E.coin} ${userData.coins.toLocaleString()}\n\n` +
                    `### ${E.fire} Effects\n${results.map(r => `> ${r}`).join('\n')}`
                ));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (sub === 'add') {
            if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return message.reply(`${E.cancel} You need **Manage Server** permission.`);
            }
            // Format: -customshop add <name> <price> <action> <data>
            const name = args[1];
            const price = parseInt(args[2]);
            const action = args[3];
            const data = args.slice(4).join(' ');

            if (!name || !price || !action) {
                return message.reply(`${E.cancel} Usage: \`-customshop add <name> <price> <action> <data>\`\n\nActions: \`give_role\`, \`remove_role\`, \`send_dm\`, \`add_coins\`, \`custom_reply\``);
            }

            if (shop.items.length >= 25) return message.reply(`${E.cancel} Maximum 25 items.`);

            shop.items.push({ name, price, action, actionData: data || '', createdBy: message.author.id, createdAt: Date.now() });
            saveShop(message.guild.id, shop);

            return message.reply(`${E.check} Added **${name}** for ${E.coin} ${price.toLocaleString()} (action: \`${action}\`)`);
        }

        if (sub === 'remove') {
            if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return message.reply(`${E.cancel} You need **Manage Server** permission.`);
            }
            const input = args.slice(1).join(' ');
            const idx = parseInt(input) - 1;
            const itemIdx = idx >= 0 && idx < shop.items.length ? idx : shop.items.findIndex(i => i.name.toLowerCase() === input.toLowerCase());

            if (itemIdx < 0) return message.reply(`${E.cancel} Item not found.`);

            const removed = shop.items.splice(itemIdx, 1)[0];
            saveShop(message.guild.id, shop);
            return message.reply(`${E.trash} Removed **${removed.name}** from the shop.`);
        }

        // Unknown subcommand
        const panel = buildShopPanel(message.guild, shop);
        return message.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
    }
};
