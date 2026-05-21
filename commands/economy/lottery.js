const {
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const {
    createContainer,
    addTextDisplay,
    formatNumber,
    MessageFlags
} = require('../../utils/componentHelpers');
const economyManager = require('../../utils/economyManager');
const { gamblingGuard } = require('../../utils/economyGuards');

const jsonStore = require('../../utils/jsonStore');
/* ===================== PATH ===================== */

const LOTTERY_PATH = path.join(__dirname, '../../data/lottery.json');

/* ===================== CONFIG ===================== */

const LOTTERY_DURATION = 60 * 60 * 1000; // 1 hour
const GST_RATE = 0.18;

const BASE_TICKET_PRICE = 500;
const PRICE_STEP = 250;
const MAX_TICKETS = 20;

const REFRESH_RATE = 15_000;

/* ===================== FILE HANDLING ===================== */

function loadLottery() {
    if (!jsonStore.has('lottery')) {
        const fresh = {
            active: false,
            endsAt: 0,
            jackpot: 0,
            lastJackpot: 0,
            entries: {},
            history: {
                endedAt: null,
                gst: 0,
                winners: []
            }
        };
        jsonStore.write('lottery', fresh);
        return fresh;
    }
    return jsonStore.read('lottery');
}

function saveLottery(data) {
    jsonStore.write('lottery', data);
}

/* ===================== DRAW LOGIC ===================== */

function pickWinner(entries) {
    const pool = [];
    for (const [id, count] of Object.entries(entries)) {
        for (let i = 0; i < count; i++) pool.push(id);
    }
    return pool[Math.floor(Math.random() * pool.length)];
}

async function tryDraw() {
    const lottery = loadLottery();
    if (!lottery.active || Date.now() < lottery.endsAt) return null;

    const totalTickets = Object.values(lottery.entries).reduce((a, b) => a + b, 0);
    if (!totalTickets) {
        lottery.active = false;
        saveLottery(lottery);
        return null;
    }

    const economy = economyManager.loadEconomy();
    const gst = Math.floor(lottery.jackpot * GST_RATE);
    const pool = lottery.jackpot - gst;

    const tempEntries = { ...lottery.entries };
    const shares = [0.6, 0.25, 0.15];
    const winners = [];

    for (let i = 0; i < Math.min(3, Object.keys(tempEntries).length); i++) {
        const id = pickWinner(tempEntries);
        delete tempEntries[id];

        const { userData: drawUser } = economyManager.getUser(economy, id);
        const reward = Math.floor(pool * shares[i]);
        drawUser.coins += reward;

        winners.push({ id, reward });
    }

    economyManager.saveEconomy(economy);

    lottery.history = {
        endedAt: Date.now(),
        gst,
        winners
    };

    lottery.active = false;
    lottery.endsAt = 0;
    lottery.jackpot = 0;
    lottery.lastJackpot = 0;
    lottery.entries = {};

    saveLottery(lottery);
    return winners;
}

/* ===================== UI ===================== */

function buildUI(lottery, userId) {
    const totalTickets = Object.values(lottery.entries).reduce((a, b) => a + b, 0);
    const userTickets = lottery.entries[userId] || 0;
    const chance = totalTickets ? ((userTickets / totalTickets) * 100).toFixed(2) : '0.00';

    const nextPrice =
        userTickets >= MAX_TICKETS
            ? 'MAX'
            : BASE_TICKET_PRICE + (userTickets * PRICE_STEP);

    const timeLeft = Math.max(0, lottery.endsAt - Date.now());
    const m = Math.floor(timeLeft / 60000);
    const s = Math.floor((timeLeft % 60000) / 1000);

    const growth = Math.max(0, lottery.jackpot - (lottery._lastJackpotCache || 0));
    lottery._lastJackpotCache = lottery.jackpot;

    const gst = Math.floor(lottery.jackpot * GST_RATE);
    const payout = lottery.jackpot - gst;

    const c = createContainer(0xF1C40F);

    addTextDisplay(
        c,
        [
            `# 🎟️ Server Lottery`,
            `*Fair draw · Server-wide · Transparent*\n`,

            `## 💰 Jackpot`,
            `**${formatNumber(lottery.jackpot)} coins**`,
            `📈 Recent Growth: +${formatNumber(growth)}\n`,

            `## 🧾 Distribution`,
            `• GST (18%): ${formatNumber(gst)}`,
            `• Winner Pool: **${formatNumber(payout)}**\n`,

            `## 🎫 Participation`,
            `• Total Tickets Sold: **${totalTickets}**\n`,

            `## <:User:1473038971398520977> Your Entry`,
            `• Tickets: **${userTickets}/${MAX_TICKETS}**`,
            `• Win Chance: **${chance}%**`,
            `• Next Ticket Cost: **${nextPrice} coins**\n`,

            `## <:Clock:1473039102113878056> Draw Timer`,
            `**${m}m ${s}s remaining**\n`,

            `> Buy more tickets to increase your winning chance.`
        ].join('\n')
    );

    return c;
}

/* ===================== COMMAND ===================== */

module.exports = {
    data: new (require('discord.js').SlashCommandBuilder)()
        .setName('lottery')
        .setDescription('Join the server lottery and win big prizes'),
    prefix: 'lottery',
    category: 'economy',

    async executePrefix(message) {
        if (await gamblingGuard(message)) return;
        const winners = await tryDraw();
        if (winners) {
            let text = '# <:Present:1473038450465706076> Lottery Winners\n\n';
            const medals = ['🥇', '🥈', '🥉'];

            winners.forEach((w, i) => {
                text += `${medals[i]} <@${w.id}>\n`;
                text += `> 💰 ${formatNumber(w.reward)} coins\n\n`;
            });

            const c = createContainer(0x57F287);
            addTextDisplay(c, text);
            return message.reply({
                components: [c],
                flags: MessageFlags.IsComponentsV2
            });
        }

        const lottery = loadLottery();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`lottery_join_${message.author.id}_${Date.now()}`)
                .setLabel('🎫 Buy Ticket')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`lottery_refresh_${message.author.id}_${Date.now()}`)
                .setEmoji('<:History:1473037847568318605>')
                .setLabel('Refresh')
                .setStyle(ButtonStyle.Secondary)
        );

        const msg = await message.reply({
            components: [buildUI(lottery, message.author.id), row],
            flags: MessageFlags.IsComponentsV2
        });

        const interval = setInterval(async () => {
            const lot = loadLottery();
            if (!lot.active || Date.now() >= lot.endsAt) {
                clearInterval(interval);
                return;
            }

            await msg.edit({
                components: [buildUI(lot, message.author.id), row],
                flags: MessageFlags.IsComponentsV2
            }).catch(() => clearInterval(interval));
        }, REFRESH_RATE);

        const collector = msg.createMessageComponentCollector({ time: LOTTERY_DURATION });

        collector.on('collect', async i => {
            await i.deferUpdate();

            const economy = economyManager.loadEconomy();
            const lottery = loadLottery();

            if (i.customId.startsWith('lottery_join')) {
                const { userData: lotteryUser } = economyManager.getUser(economy, i.user.id);

                if (!lottery.active) {
                    lottery.active = true;
                    lottery.endsAt = Date.now() + LOTTERY_DURATION;
                }

                const owned = lottery.entries[i.user.id] || 0;
                if (owned >= MAX_TICKETS) return;

                const price = BASE_TICKET_PRICE + owned * PRICE_STEP;
                if (lotteryUser.coins < price) return;

                lotteryUser.coins -= price;
                lottery.entries[i.user.id] = owned + 1;
                lottery.jackpot += price;

                economyManager.saveEconomy(economy);
                saveLottery(lottery);
            }

            await msg.edit({
                components: [buildUI(lottery, i.user.id), row],
                flags: MessageFlags.IsComponentsV2
            }).catch(() => {});
        });

        collector.on('end', () => {
            clearInterval(interval);
        });
    },

    async execute(interaction) {
        await interaction.deferReply({ flags: 1 << 15 });
        if (await gamblingGuard(interaction)) return;
        const fakeMessage = {
            author: interaction.user,
            reply: (opts) => interaction.editReply(opts),
        };
        return module.exports.executePrefix(fakeMessage);
    },
};