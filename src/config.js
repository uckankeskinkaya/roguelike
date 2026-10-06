// Global constants shared by simulation, rendering and networking.

export const TICK_RATE = 60;            // simulation ticks per second
export const DT = 1 / TICK_RATE;        // seconds per tick
export const TICK_MS = 1000 / TICK_RATE;

export const ARENA_W = 1800;
export const ARENA_H = 1200;

export const MAX_PLAYERS = 8;
export const MAX_WEAPONS = 4;
export const FINAL_WAVE = 30;
export const BOSS_WAVES = [5, 10, 15, 20, 25, 30];

export const PLAYER_RADIUS = 14;
export const DASH_TICKS = 10;           // dash duration (~0.17 s)
export const DASH_SPEED = 900;          // px/s while dashing
export const PICK_TIMEOUT = 45 * TICK_RATE; // auto-pick after this many ticks in intermission
export const REVIVE_TICKS = 2 * TICK_RATE;

// Networking
export const PROTOCOL = 3;
export const PEER_PREFIX = 'neonkuyu-v3-';
export const SNAPSHOT_EVERY = 3;        // host sends a snapshot every N ticks (20 Hz)
export const INTERP_TICKS = 7;          // clients render this many ticks in the past
export const HEARTBEAT_MS = 1000;
export const TIMEOUT_MS = 6000;

export const PLAYER_COLORS = [
  '#4df0ff', '#ff5ad1', '#ffd23f', '#7dff6a',
  '#ff8a3d', '#a98bff', '#ff4d6d', '#e8f1ff',
];
