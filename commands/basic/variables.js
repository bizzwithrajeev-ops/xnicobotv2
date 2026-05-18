const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');

/* ─── Variable pages ─── */
const PAGES = [
    `## <:Bookopen:1473038576391557130> Variables Reference
> Works in: Welcomer, Embeds, Containers, Sticky Messages, Components, Tickets & Auto-responder

<:User:1473038971398520977> **User**
> \`{user}\` mention · \`{username}\` name · \`{displayname}\` nickname · \`{userid}\` ID · \`{usertag}\` tag
> \`{useravatar}\` / \`{usericon}\` avatar URL · \`{userbanner}\` banner URL
> \`{usercreated}\` account age · \`{userjoined}\` join date

<:Folder:1473039340425973972> **Server**
> \`{server}\` / \`{servername}\` name · \`{serverid}\` ID · \`{servericon}\` icon · \`{serverbanner}\` banner
> \`{serverowner}\` owner mention · \`{membercount}\` members · \`{boostcount}\` boosts · \`{boostlevel}\` tier

<:Bullhorn:1473038903157199093> **Channel**
> \`{channelname}\` name · \`{channelid}\` ID · \`{channelmention}\` mention

<:wcrown:1386229254403919903> **Role & Position**
> \`{roles}\` role list · \`{highestrole}\` highest role · \`{joinposition}\` join #

-# Page 1/2 · Variables`,

    `## <:Fire:1473038604812161218> Usage Examples

**Welcomer:** \`Welcome {user} to {server}! You are member #{membercount}\`
**Sticky:** \`{user} - Read the rules in {channelmention}!\`
**Embed Title:** \`{displayname} joined {server}!\`
**Embed Footer:** \`Member #{joinposition} • Joined {userjoined}\`
**Ticket:** \`Hello {user}, your support ticket has been created!\`

<:Settings:1473037894703779851> **Supported Systems**
> <:Checkedbox:1473038547165384804> Welcomer · <:Checkedbox:1473038547165384804> Sticky Messages · <:Checkedbox:1473038547165384804> Embed Builder
> <:Checkedbox:1473038547165384804> Components Builder · <:Checkedbox:1473038547165384804> Tickets · <:Checkedbox:1473038547165384804> Auto-responder

-# Variables are auto-replaced when messages are sent
-# Page 2/2 · Variables`,
];

const MAX_VAR_SESSIONS = 200;

function buildVarContainer(page) {
    const container = new ContainerBuilder().setAccentColor(0xCAD7E6);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(PAGES[page]));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('var_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId('var_page').setLabel(`${page + 1}/${PAGES.length}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId('var_next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= PAGES.length - 1),
    ));
    return container;
}

function trackVarSession(msgId, userId, page) {
    if (!global.varSessions) global.varSessions = new Map();
    if (global.varSessions.size >= MAX_VAR_SESSIONS) {
        const oldest = [...global.varSessions.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 50);
        for (const [k] of oldest) global.varSessions.delete(k);
    }
    global.varSessions.set(msgId, { ts: Date.now(), userId, page });
    setTimeout(() => { global.varSessions?.delete(msgId); }, 300000);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('variables')
        .setDescription('View all available template variables'),
    prefix: 'variables',
    aliases: ['vars'],
    description: 'View all available template variables',
    usage: 'variables',
    category: 'basic',

    async execute(interaction) {
        try {
            const container = buildVarContainer(0);
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            const reply = await interaction.fetchReply();
            trackVarSession(reply.id, interaction.user.id, 0);
        } catch (error) {
            console.error(`[VARIABLES] Error:`, error);
            const content = '<:Cancel:1473037949187657818> An error occurred while running this command.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content }).catch(() => {});
            } else {
                await interaction.reply({ content, ephemeral: true }).catch(() => {});
            }
        }
    },

    async executePrefix(message) {
        try {
            const container = buildVarContainer(0);
            const reply = await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            trackVarSession(reply.id, message.author.id, 0);
        } catch (error) {
            console.error(`[VARIABLES] Error:`, error);
        }
    },

    async handleButton(interaction) {
        const { customId } = interaction;
        if (customId !== 'var_prev' && customId !== 'var_next') return false;

        if (!global.varSessions) global.varSessions = new Map();
        const session = global.varSessions.get(interaction.message.id);

        if (session && session.userId !== interaction.user.id) {
            await interaction.reply({ content: '<:Cancel:1473037949187657818> Use `/variables` to open your own.', flags: MessageFlags.Ephemeral });
            return true;
        }

        const curPage = session?.page || 0;
        const newPage = customId === 'var_prev' ? Math.max(0, curPage - 1) : Math.min(PAGES.length - 1, curPage + 1);
        if (session) session.page = newPage;
        else trackVarSession(interaction.message.id, interaction.user.id, newPage);

        const container = buildVarContainer(newPage);
        await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
        return true;
    },
};