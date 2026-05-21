const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');

async function buildUserInfo(user, guild) {
    const member = await guild.members.fetch(user.id).catch(() => null);
    
    const headerSection = new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# ${user.username}${user.bot ? ' <:bots:1473368718120849500>' : ''}`)
        )
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: user.displayAvatarURL({ size: 256 }) } }));

    const container = new ContainerBuilder()
        .setAccentColor(member?.displayColor || 0xCAD7E6)
        .addSectionComponents(headerSection)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### <:User:1473038971398520977> User Information\n` +
                `<:User:1473038971398520977> ID: \`${user.id}\`\n` +
                `<:Shield:1473038669831995494> Account Created: <t:${Math.floor(user.createdTimestamp / 1000)}:R>`
            )
        );

    if (member) {
        const roles = member.roles.cache
            .filter(role => role.id !== guild.id)
            .sort((a, b) => b.position - a.position)
            .map(role => role.toString())
            .slice(0, 10);

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### <:Folder:1473039340425973972> Server Information\n` +
                `<:Lightning:1473038797540298792> Joined: <t:${Math.floor(member.joinedTimestamp / 1000)}:R>\n` +
                `<:Editalt:1473038138577256670> Nickname: ${member.nickname || 'None'}\n` +
                `<:Award:1473038391632203887> Highest Role: ${member.roles.highest}\n` +
                `<:Caretright:1473038207221502106> Color: ${member.displayHexColor || 'Default'}`
            )
        );

        if (roles.length > 0) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`\n**Roles (${member.roles.cache.size - 1})**\n${roles.join(' ')}${roles.length < member.roles.cache.size - 1 ? ` +${member.roles.cache.size - 1 - roles.length} more` : ''}`)
            );
        }

        if (member.premiumSince) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`\n<:Sketch:1473038248493453352> Boosting since: <t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>`)
            );
        }

        const permissions = member.permissions.toArray();
        if (permissions.includes('Administrator')) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`\n<:Shield:1473038669831995494> **Administrator**`)
            );
        } else {
            const keyPerms = permissions.filter(p => 
                ['ManageGuild', 'ManageRoles', 'ManageChannels', 'KickMembers', 'BanMembers', 'ModerateMembers'].includes(p)
            );
            if (keyPerms.length) {
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`\n<:Shield:1473038669831995494> Key Permissions: ${keyPerms.map(p => `\`${p}\``).join(', ')}`)
                );
            }
        }
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));

    return container;
}

module.exports = {
    prefix: 'userinfo',
    description: 'Display detailed user information',
    usage: 'userinfo [@user]',
    category: 'basic',
    aliases: ['ui', 'user', 'whois'],
    
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Display detailed user information')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to get information about')
                .setRequired(false)),

    async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const container = await buildUserInfo(user, interaction.guild);
        await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },

    async executePrefix(message, args) {
        let user = message.author;
        if (message.mentions.users.size > 0) {
            user = message.mentions.users.first();
        } else if (args[0]) {
            try { user = await message.client.users.fetch(args[0]); } catch {}
        }
        const container = await buildUserInfo(user, message.guild);
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
