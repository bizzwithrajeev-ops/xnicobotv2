const { ShardingManager } = require('discord.js');
const path = require('path');
const { fork } = require('child_process');
require('dotenv').config();
const log = require('./utils/logger-styled');

log.installConsoleInterceptors();

// ── Dashboard Server ──
let dashboardProcess = null;

function startDashboard() {
    const dashboardPath = path.join(__dirname, 'dashboard', 'server.js');
    try {
        require('fs').accessSync(dashboardPath);
        dashboardProcess = fork(dashboardPath, [], {
            cwd: path.join(__dirname, 'dashboard'),
            env: { ...process.env, DASHBOARD_PORT: process.env.DASHBOARD_PORT || '3500' },
            silent: false
        });
        dashboardProcess.on('error', (err) => {
            log.error(`[Dashboard] Error: ${err.message}`);
        });
        dashboardProcess.on('exit', (code) => {
            if (code !== 0) log.warning(`[Dashboard] Exited with code ${code}`);
        });
        log.success(`[Dashboard] Started on port ${process.env.DASHBOARD_PORT || 3500}`);
    } catch (e) {
        log.warning('[Dashboard] server.js not found, skipping dashboard');
    }
}

startDashboard();

// ── Shard Manager ──
const manager = new ShardingManager(path.join(__dirname, 'index.js'), {
    token: process.env.TOKEN,
    totalShards: 1,
    respawn: true,
    mode: 'process'
});

manager.on('shardCreate', shard => {
    log.info(`[Shard ${shard.id}] Launched`);
    
    shard.on('spawn', () => {
        log.success(`[Shard ${shard.id}] Spawned and initializing...`);
    });
    
    shard.on('disconnect', () => {
        log.warning(`[Shard ${shard.id}] Disconnected`);
    });
    
    shard.on('reconnecting', () => {
        log.info(`[Shard ${shard.id}] Reconnecting`);
    });
    
    shard.on('death', (process) => {
        log.critical(`[Shard ${shard.id}] Died with exit code ${process.exitCode}`);
    });
    
    shard.on('error', (error) => {
        log.error(`[Shard ${shard.id}] Error`, error);
    });
});

// Cleanup dashboard on exit
process.on('SIGINT', () => {
    if (dashboardProcess) dashboardProcess.kill();
    process.exit(0);
});
process.on('SIGTERM', () => {
    if (dashboardProcess) dashboardProcess.kill();
    process.exit(0);
});

log.info('Starting Discord bot with 1 shard...');
manager.spawn({ timeout: 120000 }).then(() => {
    log.success('All shards spawned successfully!');
}).catch(error => {
    log.critical('Failed to spawn shards', error);
});
