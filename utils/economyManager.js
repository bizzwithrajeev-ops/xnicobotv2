const jsonStore = require('./jsonStore');
const log = require('./logger-styled');


const DEFAULT_USER_DATA = {
  coins: 0,
  bank: 0,
  lastDaily: 0,
  lastWeekly: 0,
  lastWork: 0,
  lastRob: 0,
  bonuses: { work: 0, daily: 0, gamble: 0, global: 0 },
  inventory: [],
  level: 1,
  xp: 0,
  achievements: [],
  streak: 0,
  battlesWon: 0,
  battlesLost: 0,
  fishCaught: 0,
  huntCount: 0,
  title: '',
  adventuresCompleted: 0,
  totalGambled: 0,
  totalWon: 0,
  totalLost: 0,
  lastHunt: 0,
  lastFish: 0,
  lastBattle: 0,
  boosts: {},
  crimeCount: 0,
  workCount: 0,
  miningCount: 0,
  oreInventory: {},
  crops: [],
  lastMine: 0,
  lastFarm: 0,
  loans: [],
  stockPortfolio: {},
  craftCount: 0,
  heistCount: 0,
  giftsSent: 0,
  harvestCount: 0,
  dailyStreak: 0,
  weeklyClaimCount: 0,
};

/* ═══════════════════════════════════════════════════════
   ACHIEVEMENTS REGISTRY
   ═══════════════════════════════════════════════════════ */

const ACHIEVEMENTS = {
  first_battle: { emoji: '⚔', name: 'First Blood', desc: 'Win your first battle' },
  battle_50: { emoji: '<:Award:1473038391632203887>', name: 'Veteran Warrior', desc: 'Win 50 battles' },
  fisher: { emoji: '🎣', name: 'Master Angler', desc: 'Catch 50 fish' },
  criminal: { emoji: '🦹', name: 'Crime Lord', desc: 'Commit 50 crimes' },
  gambler: { emoji: '🎰', name: 'High Roller', desc: 'Gamble over 1,000,000 coins total' },
  adventurer: { emoji: '🗺', name: 'Explorer', desc: 'Complete 25 adventures' },
  first_mine: { emoji: '⛏', name: 'First Strike', desc: 'Mine for the first time' },
  master_miner: { emoji: '💎', name: 'Master Miner', desc: 'Mine 100 times' },
  first_heist: { emoji: '🏦', name: 'Heist Initiate', desc: 'Complete your first heist' },
  master_crafter: { emoji: '🔨', name: 'Master Crafter', desc: 'Craft 25 items' },
  first_farm: { emoji: '🌾', name: 'Green Thumb', desc: 'Harvest your first crop' },
  generous: { emoji: '🎁', name: 'Generous Soul', desc: 'Gift 10 items to other players' },
  stock_trader: { emoji: '📈', name: 'Stock Trader', desc: 'Buy stocks for the first time' },
};

/* ═══════════════════════════════════════════════════════
   FILE HANDLING — now backed by PostgreSQL via jsonStore
   ═══════════════════════════════════════════════════════ */

function loadEconomy() {
  try {
    return jsonStore.read('economy') || {};
  } catch (err) {
    log.error('[ECONOMY] load failed', err);
    return {};
  }
}

function saveEconomy(data) {
  try {
    jsonStore.write('economy', data);
  } catch (err) {
    log.error('[ECONOMY] save failed', err);
  }
}

/* ═══════════════════════════════════════════════════════
   USER DATA NORMALIZATION
   ═══════════════════════════════════════════════════════ */

function normalizeUserData(data) {
  let changed = false;
  for (const k in DEFAULT_USER_DATA) {
    if (data[k] === undefined) {
      const def = DEFAULT_USER_DATA[k];
      if (Array.isArray(def)) {
        data[k] = [];
      } else if (typeof def === 'object' && def !== null) {
        data[k] = { ...def };
      } else {
        data[k] = def;
      }
      changed = true;
    }
  }
  if (!Array.isArray(data.inventory)) { data.inventory = []; changed = true; }
  if (!Array.isArray(data.achievements)) { data.achievements = []; changed = true; }
  if (!Array.isArray(data.loans)) { data.loans = []; changed = true; }
  if (!Array.isArray(data.crops)) { data.crops = []; changed = true; }
  if (typeof data.oreInventory !== 'object' || Array.isArray(data.oreInventory)) { data.oreInventory = {}; changed = true; }
  if (typeof data.stockPortfolio !== 'object' || Array.isArray(data.stockPortfolio)) { data.stockPortfolio = {}; changed = true; }
  if (typeof data.bonuses !== 'object' || data.bonuses === null) {
    data.bonuses = { ...DEFAULT_USER_DATA.bonuses };
    changed = true;
  } else {
    for (const bk in DEFAULT_USER_DATA.bonuses) {
      if (data.bonuses[bk] === undefined) {
        data.bonuses[bk] = DEFAULT_USER_DATA.bonuses[bk];
        changed = true;
      }
    }
  }
  return changed;
}

function getUser(economy, userId) {
  if (!economy[userId]) {
    economy[userId] = JSON.parse(JSON.stringify(DEFAULT_USER_DATA));
    return { userData: economy[userId], changed: true };
  }
  const changed = normalizeUserData(economy[userId]);
  return { userData: economy[userId], changed };
}

/* ═══════════════════════════════════════════════════════
   FORMATTING HELPERS
   ═══════════════════════════════════════════════════════ */

function formatNumber(val) {
  return Number.isFinite(val) ? val.toLocaleString() : '0';
}

function formatTime(ms) {
  if (ms <= 0) return '0m';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(' ');
}

/* ═══════════════════════════════════════════════════════
   XP / LEVELING SYSTEM
   ═══════════════════════════════════════════════════════ */

function xpForLevel(level) {
  return level * 150;
}

function addXP(economy, userId, amount) {
  const { userData } = getUser(economy, userId);
  userData.xp = (userData.xp || 0) + amount;
  userData.level = userData.level || 1;

  let leveledUp = false;
  let newLevel = userData.level;

  let needed = xpForLevel(userData.level);
  while (userData.xp >= needed) {
    userData.xp -= needed;
    userData.level += 1;
    leveledUp = true;
    newLevel = userData.level;
    needed = xpForLevel(userData.level);
  }

  return { leveledUp, newLevel };
}

/* ═══════════════════════════════════════════════════════
   ACHIEVEMENT SYSTEM
   ═══════════════════════════════════════════════════════ */

function checkAchievement(economy, userId, achievementId) {
  const { userData } = getUser(economy, userId);
  if (!Array.isArray(userData.achievements)) {
    userData.achievements = [];
  }
  if (!userData.achievements.includes(achievementId) && ACHIEVEMENTS[achievementId]) {
    userData.achievements.push(achievementId);
    return true;
  }
  return false;
}

/* ═══════════════════════════════════════════════════════
   LOAN SYSTEM
   ═══════════════════════════════════════════════════════ */

function addLoan(economy, userId, amount) {
  const { userData } = getUser(economy, userId);
  if (!Array.isArray(userData.loans)) userData.loans = [];
  const loan = { amount, takenAt: Date.now(), interest: 0.10 };
  userData.loans.push(loan);
  userData.coins += amount;
  return loan;
}

function repayLoan(economy, userId, amount) {
  const { userData } = getUser(economy, userId);
  if (!Array.isArray(userData.loans) || userData.loans.length === 0) {
    return { error: 'No active loans.' };
  }
  if (userData.coins < amount) {
    return { error: 'Insufficient coins.' };
  }
  const loan = userData.loans[0];
  const daysElapsed = Math.floor((Date.now() - loan.takenAt) / 86400000);
  const totalOwed = Math.floor(loan.amount * Math.pow(1 + loan.interest, daysElapsed));
  const paid = Math.min(amount, totalOwed);
  userData.coins -= paid;
  if (paid >= totalOwed) {
    userData.loans.shift();
    return { paid, totalOwed, cleared: true };
  }
  loan.amount = totalOwed - paid;
  loan.takenAt = Date.now();
  return { paid, totalOwed, cleared: false };
}

/* ═══════════════════════════════════════════════════════
   BULK ACHIEVEMENT CHECK
   Checks all milestone-based achievements for a user.
   Call after mutating userData before saving economy.
   ═══════════════════════════════════════════════════════ */

function checkAllAchievements(economy, userId) {
  const { userData } = getUser(economy, userId);

  const checks = [
    ['first_mine',     (userData.miningCount || 0) >= 1],
    ['master_miner',   (userData.miningCount || 0) >= 100],
    ['first_heist',    (userData.heistCount  || 0) >= 1],
    ['master_crafter', (userData.craftCount  || 0) >= 25],
    ['first_farm',     (userData.harvestCount || 0) >= 1],
    ['generous',       (userData.giftsSent   || 0) >= 10],
    ['stock_trader',   Object.keys(userData.stockPortfolio || {}).length >= 1],
    ['gambler',        (userData.totalGambled|| 0) >= 1_000_000],
    ['criminal',       (userData.crimeCount  || 0) >= 50],
    ['fisher',         (userData.fishCaught  || 0) >= 50],
    ['first_battle',   (userData.battlesWon  || 0) >= 1],
    ['battle_50',      (userData.battlesWon  || 0) >= 50],
    ['adventurer',     (userData.adventuresCompleted || 0) >= 25],
  ];

  for (const [id, condition] of checks) {
    if (condition) checkAchievement(economy, userId, id);
  }
}

/* ═══════════════════════════════════════════════════════
   NET WORTH HELPER
   ═══════════════════════════════════════════════════════ */

function getNetWorth(userData, stockPrices) {
  const wallet = Number(userData.coins) || 0;
  const bank = Number(userData.bank) || 0;

  let stockValue = 0;
  if (stockPrices && userData.stockPortfolio) {
    for (const [symbol, shares] of Object.entries(userData.stockPortfolio)) {
      const price = stockPrices[symbol] || 0;
      stockValue += price * (shares || 0);
    }
  }

  const loanDebt = Array.isArray(userData.loans)
    ? userData.loans.reduce((sum, l) => sum + (l.amount || 0), 0)
    : 0;

  return wallet + bank + stockValue - loanDebt;
}

/* ═══════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════ */

module.exports = {
  DEFAULT_USER_DATA,
  ACHIEVEMENTS,
  loadEconomy,
  saveEconomy,
  getUser,
  formatNumber,
  formatTime,
  addXP,
  checkAchievement,
  checkAllAchievements,
  addLoan,
  repayLoan,
  getNetWorth,
};
