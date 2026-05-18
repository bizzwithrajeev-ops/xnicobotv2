const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require("discord.js");

const axios = require("axios");

const PER_PAGE = 5;
const MAX_RESULTS = 15;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const INNERTUBE_URL = `https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8`;

/* ─── Store: messageId → { query, results } ─── */
function getStore(client) {
    if (!client._ytStore) client._ytStore = new Map();
    return client._ytStore;
}

/* ─── YouTube InnerTube search ─── */
async function ytSearch(query) {
    const { data } = await axios.post(
        INNERTUBE_URL,
        {
            context: {
                client: {
                    clientName: "WEB",
                    clientVersion: "2.20240101.00.00",
                    hl: "en",
                    gl: "US",
                },
            },
            query,
        },
        {
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0",
            },
            timeout: 12000,
        },
    );

    const items =
        data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
            ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer
            ?.contents ?? [];

    const results = [];
    for (const item of items) {
        const v = item.videoRenderer;
        if (!v?.videoId) continue;

        results.push({
            title: v.title?.runs?.[0]?.text || "Unknown Title",
            channel: v.ownerText?.runs?.[0]?.text || "Unknown Channel",
            duration: v.lengthText?.simpleText || "Live",
            views: v.viewCountText?.simpleText || "",
            published: v.publishedTimeText?.simpleText || "",
            url: `https://www.youtube.com/watch?v=${v.videoId}`,
        });

        if (results.length >= MAX_RESULTS) break;
    }

    return results;
}

/* ─── Build the page container ─── */
function buildContainer(query, results, page, msgId) {
    const totalPages = Math.ceil(results.length / PER_PAGE);
    const start = (page - 1) * PER_PAGE;
    const slice = results.slice(start, start + PER_PAGE);

    let text = `# <:Search:1473038053219106847> YouTube Search\n`;
    text += `> **${query}**\n`;
    text += `> Results **${start + 1}–${start + slice.length}** of **${results.length}**\n\n`;

    for (let i = 0; i < slice.length; i++) {
        const r = slice[i];
        const num = start + i + 1;
        const meta = [
            `<:Clock:1473039102113878056> \`${r.duration}\``,
            r.views ? `<:Fire:1473038604812161218> ${r.views}` : null,
            r.published
                ? `<a:loading:1506015728871149770> ${r.published}`
                : null,
        ]
            .filter(Boolean)
            .join("  ");

        text += `**${num}.** [${r.title}](${r.url})\n`;
        text += `<:User:1473038971398520977> ${r.channel}  ${meta}\n\n`;
    }

    text += `-# <:Inforect:1473038624172937287> Page ${page} of ${totalPages}  •  Results expire in 5 minutes`;

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`yts_prev_${msgId}_${page}`)
            .setEmoji("<:Caretleft:1473038193057333409>")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1),
        new ButtonBuilder()
            .setCustomId(`yts_cur_${msgId}`)
            .setLabel(`${page} / ${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`yts_next_${msgId}_${page}`)
            .setEmoji("<:Caretright:1473038207221502106>")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages),
    );

    return new ContainerBuilder()
        .setAccentColor(0xff0000)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
        .addSeparatorComponents(
            new SeparatorBuilder()
                .setDivider(true)
                .setSpacing(SeparatorSpacingSize.Small),
        )
        .addActionRowComponents(row);
}

/* ─── Pagination button handler (called from index.js) ─── */
async function handlePageButton(interaction) {
    const { customId } = interaction;
    const store = getStore(interaction.client);

    let msgId, curPage, dir;

    if (customId.startsWith("yts_prev_")) {
        const tail = customId.slice("yts_prev_".length);
        const sep = tail.lastIndexOf("_");
        msgId = tail.slice(0, sep);
        curPage = parseInt(tail.slice(sep + 1));
        dir = -1;
    } else if (customId.startsWith("yts_next_")) {
        const tail = customId.slice("yts_next_".length);
        const sep = tail.lastIndexOf("_");
        msgId = tail.slice(0, sep);
        curPage = parseInt(tail.slice(sep + 1));
        dir = 1;
    } else {
        return;
    }

    const entry = store.get(msgId);
    if (!entry) {
        return interaction.reply({
            content:
                "<:Cancel:1473037949187657818> These results have expired. Run the command again.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const newPage = curPage + dir;
    const totalPages = Math.ceil(entry.results.length / PER_PAGE);

    if (newPage < 1 || newPage > totalPages) return interaction.deferUpdate();

    entry.page = newPage;
    const container = buildContainer(
        entry.query,
        entry.results,
        newPage,
        msgId,
    );
    await interaction.update({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });
}

/* ─── Slash command ─── */
async function execute(interaction) {
    const query = interaction.options.getString("query");

    await interaction.deferReply();

    try {
        const loadingMsg = await interaction.fetchReply();
        const msgId = loadingMsg.id;

        const results = await ytSearch(query);

        if (!results.length) {
            return interaction.editReply({
                components: [
                    new ContainerBuilder()
                        .setAccentColor(0xff4444)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `<:Cancel:1473037949187657818> No YouTube results found for **${query}**.\nTry a different search term.`,
                            ),
                        ),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const store = getStore(interaction.client);
        store.set(msgId, { query, results, page: 1 });
        setTimeout(() => store.delete(msgId), CACHE_TTL_MS);

        const container = buildContainer(query, results, 1, msgId);
        await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    } catch (err) {
        console.error("[yt]", err.message);
        await interaction.editReply(
            "<:Cancel:1473037949187657818> Failed to fetch YouTube results. Try again in a moment.",
        );
    }
}

/* ─── Prefix command ─── */
async function executePrefix(message, args) {
    const query = args.join(" ").trim();
    if (!query) {
        return message.reply(
            "<:Cancel:1473037949187657818> Please provide a search query.\n> **Example:** `yt how to make pasta`",
        );
    }

    const loadingMsg = await message.reply({
        components: [
            new ContainerBuilder()
                .setAccentColor(0xff0000)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `<:Search:1473038053219106847> Searching YouTube for **${query}**...`,
                    ),
                ),
        ],
        flags: MessageFlags.IsComponentsV2,
    });

    try {
        const msgId = loadingMsg.id;
        const results = await ytSearch(query);

        if (!results.length) {
            return loadingMsg.edit({
                components: [
                    new ContainerBuilder()
                        .setAccentColor(0xff4444)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `<:Cancel:1473037949187657818> No YouTube results found for **${query}**.\nTry a different search term.`,
                            ),
                        ),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const store = getStore(message.client);
        store.set(msgId, { query, results, page: 1 });
        setTimeout(() => store.delete(msgId), CACHE_TTL_MS);

        const container = buildContainer(query, results, 1, msgId);
        await loadingMsg.edit({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    } catch (err) {
        console.error("[yt prefix]", err.message);
        await loadingMsg
            .edit(
                "<:Cancel:1473037949187657818> Failed to fetch YouTube results. Try again in a moment.",
            )
            .catch(() => {});
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("yt")
        .setDescription("Search YouTube videos with paginated results")
        .addStringOption((opt) =>
            opt
                .setName("query")
                .setDescription("What to search on YouTube")
                .setRequired(true),
        ),
    execute,
    executePrefix,
    handlePageButton,
};
