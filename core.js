"use strict";
/* ================= constants & helpers ================= */
const V2_KEY = "system-habits-v2", V1_KEY = "sunrise-habits-v1";
const NEON = ["#4aa8ff","#8b5cf6","#22d3ee","#34d399","#f5c542","#ff5c8a"];

/* stats — game-style stroke glyphs, colored via currentColor */
const STATS = {
  str: { ab:"STR", label:"Strength",  color:"#ff5c6a" },
  agi: { ab:"AGI", label:"Agility",   color:"#34d399" },
  vit: { ab:"VIT", label:"Vitality",  color:"#f5c542" },
  int: { ab:"INT", label:"Intellect", color:"#4aa8ff" },
  wis: { ab:"WIS", label:"Wisdom",    color:"#8b5cf6" }
};
const STAT_ORDER = ["str","agi","vit","int","wis"];
const SVGA = `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
const STAT_ICONS = {
  str: `<svg ${SVGA}><path d="M12 2.5l2.5 3.5v8.5h-5V6l2.5-3.5z"/><path d="M7 17.5h10M12 17.5V21M9.8 21h4.4"/></svg>`,
  agi: `<svg ${SVGA}><path d="M13 2L5 13.5h5L9.5 22l8.5-11.5h-5L13 2z"/></svg>`,
  vit: `<svg ${SVGA}><path d="M12 20.5C6.2 16.2 3 12.6 3 9 3 6.3 5.1 4.2 7.7 4.2c1.7 0 3.3.9 4.3 2.3 1-1.4 2.6-2.3 4.3-2.3C18.9 4.2 21 6.3 21 9c0 3.6-3.2 7.2-9 11.5z"/><path d="M6.8 11.5h3l1.3-2.4 1.8 4.4 1.3-2h3"/></svg>`,
  int: `<svg ${SVGA}><path d="M12 6C10 4.4 7.4 3.8 4.5 3.8v13.4c2.9 0 5.5.6 7.5 2.2 2-1.6 4.6-2.2 7.5-2.2V3.8C16.6 3.8 14 4.4 12 6z"/><path d="M12 6v13.4"/></svg>`,
  wis: `<svg ${SVGA}><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><path d="M12 8.8L14.6 12 12 15.2 9.4 12 12 8.8z"/></svg>`
};
const glyphOf = q => `<span class="q-glyph">${STAT_ICONS[q.stat] || STAT_ICONS.str}</span>`;
/* legacy emoji → stat, for migrating old saves */
const EMOJI_STAT = {"💪":"str","⚔️":"str","🛡️":"str","🏃":"agi","🧹":"agi","📖":"int","✍️":"int","💧":"vit","🥗":"vit","😴":"vit","🧘":"wis","🌅":"wis"};

/* quest mastery tiers: [letter, lifetime clears needed, color, flat XP bonus] */
const MASTERY = [["E",0,"#8b9bb4",0],["D",10,"#34d399",2],["C",25,"#4aa8ff",4],["B",50,"#8b5cf6",6],["A",100,"#ff5c6a",8],["S",200,"#f5c542",10]];

/* side quest difficulty → XP */
const DIFF_XP = { easy:5, normal:10, hard:15 };
const diffXP = td => DIFF_XP[td.diff] || DIFF_XP.easy;

/* weekly gate bosses — picked deterministically per week */
const BOSSES = [
  "IGRIS, BLOOD-RED COMMANDER",
  "KARGALGAN, HIGH ORC SHAMAN",
  "BARAN, THE WHITE FLAME MONARCH",
  "TUSK OF THE GIANT'S GATE",
  "CERBERUS, HELLHOUND WARDEN",
  "VULCAN, ARMORED DEMON KNIGHT",
  "THE ARCHITECT OF THE TRIAL",
  "METUS, PHANTOM OF THE MIST",
  "GRAVAK, STONE GOLEM TYRANT",
  "SILA, QUEEN OF THE SWARM"
];
const RUNE_TYPES = [
  { id:"iron",    stat:"str", name:"Rune of Iron" },
  { id:"haste",   stat:"agi", name:"Rune of Haste" },
  { id:"vigor",   stat:"vit", name:"Rune of Vigor" },
  { id:"focus",   stat:"int", name:"Rune of Focus" },
  { id:"insight", stat:"wis", name:"Rune of Insight" }
];
const hashStr = s => { let h = 0; for (const c of s) h = (h*31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
const BASE_XP = 20, SIDE_XP = 5, PERFECT_XP = 25;
const DAY_LETTERS = ["M","T","W","T","F","S","S"];

const pad = n => String(n).padStart(2,"0");
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseD = s => { const [y,m,dd] = s.split("-").map(Number); return new Date(y, m-1, dd); };
const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const todayStr = () => fmt(new Date());
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)");
const buzz = ms => { try{ if (!REDUCED_MOTION.matches && navigator.vibrate) navigator.vibrate(ms); }catch(_){} };

/* ================= derived-value memo =================
   Stats, mastery, raids and runes are all derived by scanning quest logs, and a
   full render asks for them ~40 times. One invalidation point covers the lot:
   touchState(), called at every write to a log or to the quest set.

   Invalidate at the MUTATION, never at the render boundary — setProgress reads
   currentRaid() before the log write and again after it to detect a boss kill.
   A per-render cache would hand back the stale "before" value and the kill would
   never register.

   touchState() clears rather than tags entries, so the map can't grow without
   bound and the before/after pair is correct by construction: the first call
   caches, the clear drops it, the second recomputes.

   The current day is a guard too — currentRaid()/streakOf() read `new Date()`,
   so a midnight rollover has to invalidate even when nothing was written. */
let _srev = 0;                     // revision counter; the verification suite asserts on it
const _memo = new Map();
let _memoDay = todayStr();
function touchState(){ _srev++; _memo.clear(); }
function memo(key, fn){
  const d = todayStr();
  if (d !== _memoDay){ _memoDay = d; _memo.clear(); }
  if (_memo.has(key)) return _memo.get(key);   // has(), not truthiness — raidInfo caches null
  const v = fn();
  _memo.set(key, v);
  return v;
}

/* ================= state & migration ================= */
function baseState(){
  return {
    version: 2,
    player: { name:null, exp:0, title:null, titles:[], muted:false, seenLevel:1, radarOpen:true },
    quests: [], todos: [],
    meta: { xpLedger:{}, remindersFired:{}, warnedOn:null, deleted:{} }
  };
}
function defaultState(){
  const st = baseState(), t = todayStr();
  st.quests = [
    {id:uid(), name:"Train body",    stat:"str", color:NEON[0], createdAt:t, target:{amount:30,unit:"min"}, reminder:null, log:{}},
    {id:uid(), name:"Read grimoire", stat:"int", color:NEON[1], createdAt:t, target:{amount:20,unit:"pages"}, reminder:null, log:{}},
    {id:uid(), name:"Hydrate",       stat:"vit", color:NEON[2], createdAt:t, target:{amount:8,unit:"glasses"}, reminder:null, log:{}}
  ];
  return st;
}
/* bring any loaded/imported save up to the current shape */
function normalize(st){
  const base = baseState();
  st.version = 2;
  st.player = Object.assign(base.player, st.player || {});
  st.meta   = Object.assign(base.meta,   st.meta   || {});
  st.quests = (st.quests || []).map(q => {
    if (!STATS[q.stat]) q.stat = EMOJI_STAT[q.emoji] || "str";
    if (q.target && "step" in q.target) delete q.target.step;
    q.freq = Math.min(7, Math.max(1, parseInt(q.freq, 10) || 7));
    return q;
  });
  st.todos = (st.todos || []).map(td => Object.assign({daily:false, doneOn:null, rewardedOn:null, diff:"easy"}, td));
  if (!st.meta.deleted || typeof st.meta.deleted !== "object") st.meta.deleted = {};
  return st;
}
function migrate(){
  try{
    const v2 = JSON.parse(localStorage.getItem(V2_KEY));
    if (v2 && v2.version === 2 && Array.isArray(v2.quests)) return v2;
  }catch(e){}
  try{
    const v1 = JSON.parse(localStorage.getItem(V1_KEY));   // v1 key is never deleted (backup)
    if (v1 && Array.isArray(v1.habits)){
      const st = baseState();
      st.quests = v1.habits.map((h,i) => ({
        id: h.id || uid(), name: h.name || "Quest", stat: EMOJI_STAT[h.emoji] || "str",
        color: NEON[i % NEON.length], createdAt: h.createdAt || todayStr(),
        target: null, reminder: null,
        log: Object.fromEntries(Object.keys(h.log || {}).map(k => [k, 1]))
      }));
      st.todos = (v1.todos || []).map(t => ({id: t.id || uid(), text: t.text || "", done: !!t.done}));
      const completions = st.quests.reduce((n,q) => n + Object.keys(q.log).length, 0);
      st.player.exp = completions * BASE_XP;
      st.player.seenLevel = levelFromExp(st.player.exp).level;
      return st;
    }
  }catch(e){}
  return defaultState();
}

/* ================= quest math ================= */
const targetOf   = q => q.target ? q.target.amount : 1;
const smartStep  = q => q.target ? Math.max(1, Math.round(targetOf(q)/10)) : 1;   // ~10% of target
const unitOf     = q => q.target ? q.target.unit : "";
const progressOf = (q,key) => q.log[key] || 0;
const isDone     = (q,key) => progressOf(q,key) >= targetOf(q);

/* ---- weekly frequency (any N of 7, Mon–Sun weeks) ---- */
const freqOf = q => q.freq || 7;
const mondayOf = d => { const x = new Date(d); x.setHours(0,0,0,0); return addDays(x, -((x.getDay()+6)%7)); };
function weekHitsM(q, monday){        // done-days within that week
  return memo("wh:" + q.id + ":" + fmt(monday), () => {
    let n = 0;
    for (let i = 0; i < 7; i++) if (isDone(q, fmt(addDays(monday, i)))) n++;
    return n;
  });
}
/* a freq<7 quest that already hit its weekly count is exempt from the daily gate */
const weekSatisfied = (q, dateKey) =>
  freqOf(q) < 7 && weekHitsM(q, mondayOf(parseD(dateKey))) >= freqOf(q);
function weekStreakOf(q){             // consecutive weeks hitting the target; current week pending doesn't break it
  return memo("ws:" + q.id, () => {
    const f = freqOf(q);
    let mon = mondayOf(new Date()), streak = 0;
    if (weekHitsM(q, mon) >= f) streak++;
    mon = addDays(mon, -7);
    const createdMon = mondayOf(parseD(q.createdAt));
    while (mon >= createdMon && streak < 520){
      if (weekHitsM(q, mon) >= f) { streak++; mon = addDays(mon, -7); }
      else break;
    }
    return streak;
  });
}
/* streak in the quest's own unit: days for daily quests, weeks for freq<7 */
const questStreak = q => freqOf(q) < 7
  ? { n: weekStreakOf(q), weekly: true }
  : { n: streakOf(q), weekly: false };

function streakOf(q){
  return memo("st:" + q.id, () => {
    const created = parseD(q.createdAt);
    let d = new Date(); d.setHours(0,0,0,0);
    if (!isDone(q, fmt(d))) d = addDays(d,-1);      // today pending doesn't break it
    let streak = 0, lastGrace = null;
    while (d >= created && streak < 3650){
      if (isDone(q, fmt(d))) streak++;
      else {
        const graceOk = streak > 0 && (!lastGrace || (lastGrace - d) / 864e5 >= 7);
        if (graceOk) lastGrace = new Date(d);
        else break;
      }
      d = addDays(d,-1);
    }
    return streak;
  });
}
/* every quest is either done today or exempt via its met weekly goal */
const allDone = key => state.quests.length > 0 && state.quests.every(q => isDone(q,key) || weekSatisfied(q,key));
const totalCompletions = () => memo("tc", () =>
  state.quests.reduce((n,q) => n + Object.keys(q.log).filter(k => q.log[k] >= targetOf(q)).length, 0));
/* daily-streak titles measure daily (freq-7) quests only; week-streaks aren't comparable */
const maxStreak = () => memo("ms", () => {
  const daily = state.quests.filter(q => freqOf(q) >= 7);
  return daily.length ? Math.max(...daily.map(q => streakOf(q))) : 0;
});
/* stat points are derived from completion logs — retro-consistent, nothing extra stored */
function statPoints(){   // callers read the result, never mutate it — it is shared
  return memo("stats", () => {
    const pts = {str:0, agi:0, vit:0, int:0, wis:0};
    state.quests.forEach(q => {
      const s = STATS[q.stat] ? q.stat : "str";
      pts[s] += Object.keys(q.log).filter(k => q.log[k] >= targetOf(q)).length;
    });
    return pts;
  });
}

/* ---- quest mastery (derived from lifetime clears) ---- */
const lifetimeClears = q => memo("lc:" + q.id, () =>
  Object.keys(q.log).filter(k => q.log[k] >= targetOf(q)).length);
function masteryFromClears(n){
  let m = MASTERY[0];
  for (const x of MASTERY) if (n >= x[1]) m = x;
  return { name:m[0], color:m[2], bonus:m[3] };
}
const masteryOf = q => masteryFromClears(lifetimeClears(q));

/* ---- weekly gate raid (boss + runes, fully derived from logs) ---- */
function raidInfo(monday){
  return memo("raid:" + fmt(monday), () => {
    const weekEndKey = fmt(addDays(monday, 6));
    const qs = state.quests.filter(q => q.createdAt <= weekEndKey);
    const expected = qs.reduce((n,q) => n + freqOf(q), 0);
    if (!expected) return null;
    const hp = Math.max(10, Math.round(expected * 10 * 0.8));   // kill ≈ 80% of expected clears
    let clears = 0, perfectDays = 0;
    for (let i = 0; i < 7; i++){
      const key = fmt(addDays(monday, i));
      let dayClears = 0, dayExpected = 0;
      qs.forEach(q => { if (q.createdAt <= key){ dayExpected++; if (isDone(q, key)){ clears++; dayClears++; } } });
      if (dayExpected > 0 && dayClears === dayExpected) perfectDays++;
    }
    const dmg = clears * 10 + perfectDays * 15;
    const h = hashStr(fmt(monday));
    return {
      mondayKey: fmt(monday), boss: BOSSES[h % BOSSES.length], rune: RUNE_TYPES[h % RUNE_TYPES.length],
      hp, dmg: Math.min(dmg, hp), rawDmg: dmg, killed: dmg >= hp, expected, clears
    };
  });
}
const currentRaid = () => raidInfo(mondayOf(new Date()));
/* rune ownership = list of weeks whose boss died; pure derivation, retro-consistent */
function runesEarned(){
  return memo("runes", () => {
    if (!state.quests.length) return [];
    const first = state.quests.reduce((m,q) => q.createdAt < m ? q.createdAt : m, todayStr());
    let mon = mondayOf(parseD(first));
    const thisMon = mondayOf(new Date());
    const runes = [];
    for (let i = 0; i < 520 && mon <= thisMon; i++, mon = addDays(mon, 7)){
      const r = raidInfo(mon);
      if (r && r.killed) runes.push(r);
    }
    return runes;
  });
}
/* penalty: last week's boss escaped → runes sleep until 3 clears land this week */
function runesDormant(){
  return memo("dormant", () => {
    const last = raidInfo(addDays(mondayOf(new Date()), -7));
    if (!last || last.killed) return false;
    const cur = currentRaid();
    return !cur || cur.clears < 3;
  });
}
/* each awake rune adds +1 EXP per quest clear, capped at +5 */
function runeBonusXP(){
  return runesDormant() ? 0 : Math.min(runesEarned().length, 5);
}

/* ================= player: levels, ranks, titles ================= */
function need(L){ return 100 + 20*(L-1); }
function levelFromExp(exp){
  let L = 1, rem = Math.max(0, exp|0);
  while (rem >= need(L) && L < 999){ rem -= need(L); L++; }
  return { level:L, into:rem, need:need(L) };
}
const RANKS = [["E",1,"#8b9bb4"],["D",5,"#34d399"],["C",10,"#4aa8ff"],["B",20,"#8b5cf6"],["A",35,"#ff5c6a"],["S",55,"#f5c542"]];
function rankOf(level){
  let r = RANKS[0];
  for (const x of RANKS) if (level >= x[1]) r = x;
  return { name:r[0], color:r[2] };
}
const TITLES = [
  {id:"novice",   name:"Novice Hunter",        desc:"Clear your first quest",        test:() => totalCompletions() >= 1},
  {id:"wolf",     name:"Wolf Slayer",          desc:"Reach a 7-day streak",          test:() => maxStreak() >= 7},
  {id:"awakened", name:"Awakened",             desc:"Reach level 10",                test:() => playerLevel() >= 10},
  {id:"regular",  name:"Dungeon Regular",      desc:"100 lifetime quest clears",     test:() => totalCompletions() >= 100},
  {id:"elite",    name:"Elite Hunter",         desc:"Reach level 25",                test:() => playerLevel() >= 25},
  {id:"demon",    name:"Demon Slayer",         desc:"Reach a 30-day streak",         test:() => maxStreak() >= 30},
  {id:"monarchC", name:"Monarch Candidate",    desc:"Reach level 50",                test:() => playerLevel() >= 50},
  {id:"shadow",   name:"Shadow Monarch",       desc:"Reach level 55",                test:() => playerLevel() >= 55},
  {id:"legend",   name:"Legend of the Gates",  desc:"500 lifetime quest clears",     test:() => totalCompletions() >= 500},
  {id:"ruler",    name:"Ruler's Bane",         desc:"Reach a 100-day streak",        test:() => maxStreak() >= 100},
  {id:"ironbody", name:"Iron Body",            desc:"Earn 50 STR points",            test:() => statPoints().str >= 50},
  {id:"phantom",  name:"Phantom Step",         desc:"Earn 50 AGI points",            test:() => statPoints().agi >= 50},
  {id:"undying",  name:"Undying",              desc:"Earn 50 VIT points",            test:() => statPoints().vit >= 50},
  {id:"scholar",  name:"Arcane Scholar",       desc:"Earn 50 INT points",            test:() => statPoints().int >= 50},
  {id:"oracle",   name:"Oracle of the Gate",   desc:"Earn 50 WIS points",            test:() => statPoints().wis >= 50},
  {id:"gatebreak",  name:"Gatebreaker",        desc:"Slay your first gate boss",     test:() => runesEarned().length >= 1},
  {id:"raidmaster", name:"Raid Master",        desc:"Slay 10 gate bosses",           test:() => runesEarned().length >= 10},
];
const playerLevel = () => levelFromExp(state.player.exp).level;
const titleName = id => { const t = TITLES.find(t => t.id === id); return t ? t.name : null; };

function checkTitles(silent){
  TITLES.forEach(t => {
    if (!state.player.titles.includes(t.id) && t.test()){
      state.player.titles.push(t.id);
      if (!state.player.title) state.player.title = t.id;
      if (!silent){ toast(`TITLE UNLOCKED — ${t.name}`); sfx.complete(); }
    }
  });
}
function checkLevelUp(){
  const L = playerLevel();
  if (L > state.player.seenLevel){
    const from = state.player.seenLevel;
    state.player.seenLevel = L;
    showLevelUp(from, L);
  } else if (L < state.player.seenLevel){
    state.player.seenLevel = L;   // same-day XP reversal crossed a boundary back down
  }
}
function grantXP(xp){ state.player.exp += xp; }
function revokeXP(xp){ state.player.exp = Math.max(0, state.player.exp - xp); }

let state = normalize(migrate());
function save(){
  const cutoff = fmt(addDays(new Date(), -2));
  for (const k of Object.keys(state.meta.xpLedger)) if (k < cutoff) delete state.meta.xpLedger[k];
  const tombCutoff = fmt(addDays(new Date(), -90));   // tombstones only need to outlive sync gaps
  for (const id of Object.keys(state.meta.deleted)) if (state.meta.deleted[id] < tombCutoff) delete state.meta.deleted[id];
  try{
    localStorage.setItem(V2_KEY, JSON.stringify(state));
  }catch(e){
    toast("⚠ SAVE FAILED — storage full? Export your data!");
  }
}

