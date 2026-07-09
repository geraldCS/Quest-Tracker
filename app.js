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

/* ================= state & migration ================= */
function baseState(){
  return {
    version: 2,
    player: { name:null, exp:0, title:null, titles:[], muted:false, seenLevel:1 },
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
  let n = 0;
  for (let i = 0; i < 7; i++) if (isDone(q, fmt(addDays(monday, i)))) n++;
  return n;
}
/* a freq<7 quest that already hit its weekly count is exempt from the daily gate */
const weekSatisfied = (q, dateKey) =>
  freqOf(q) < 7 && weekHitsM(q, mondayOf(parseD(dateKey))) >= freqOf(q);
function weekStreakOf(q){             // consecutive weeks hitting the target; current week pending doesn't break it
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
}
/* streak in the quest's own unit: days for daily quests, weeks for freq<7 */
const questStreak = q => freqOf(q) < 7
  ? { n: weekStreakOf(q), weekly: true }
  : { n: streakOf(q), weekly: false };

function streakOf(q){
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
}
/* every quest is either done today or exempt via its met weekly goal */
const allDone = key => state.quests.length > 0 && state.quests.every(q => isDone(q,key) || weekSatisfied(q,key));
const totalCompletions = () =>
  state.quests.reduce((n,q) => n + Object.keys(q.log).filter(k => q.log[k] >= targetOf(q)).length, 0);
/* daily-streak titles measure daily (freq-7) quests only; week-streaks aren't comparable */
const maxStreak = () => {
  const daily = state.quests.filter(q => freqOf(q) >= 7);
  return daily.length ? Math.max(...daily.map(streakOf)) : 0;
};
/* stat points are derived from completion logs — retro-consistent, nothing extra stored */
function statPoints(){
  const pts = {str:0, agi:0, vit:0, int:0, wis:0};
  state.quests.forEach(q => {
    const s = STATS[q.stat] ? q.stat : "str";
    pts[s] += Object.keys(q.log).filter(k => q.log[k] >= targetOf(q)).length;
  });
  return pts;
}

/* ---- quest mastery (derived from lifetime clears) ---- */
const lifetimeClears = q => Object.keys(q.log).filter(k => q.log[k] >= targetOf(q)).length;
function masteryFromClears(n){
  let m = MASTERY[0];
  for (const x of MASTERY) if (n >= x[1]) m = x;
  return { name:m[0], color:m[2], bonus:m[3] };
}
const masteryOf = q => masteryFromClears(lifetimeClears(q));

/* ---- weekly gate raid (boss + runes, fully derived from logs) ---- */
function raidInfo(monday){
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
}
const currentRaid = () => raidInfo(mondayOf(new Date()));
/* rune ownership = list of weeks whose boss died; pure derivation, retro-consistent */
function runesEarned(){
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
}
/* penalty: last week's boss escaped → runes sleep until 3 clears land this week */
function runesDormant(){
  const last = raidInfo(addDays(mondayOf(new Date()), -7));
  if (!last || last.killed) return false;
  const cur = currentRaid();
  return !cur || cur.clears < 3;
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
  {id:"novice",   name:"Novice Hunter",        test:() => totalCompletions() >= 1},
  {id:"wolf",     name:"Wolf Slayer",          test:() => maxStreak() >= 7},
  {id:"awakened", name:"Awakened",             test:() => playerLevel() >= 10},
  {id:"regular",  name:"Dungeon Regular",      test:() => totalCompletions() >= 100},
  {id:"elite",    name:"Elite Hunter",         test:() => playerLevel() >= 25},
  {id:"demon",    name:"Demon Slayer",         test:() => maxStreak() >= 30},
  {id:"monarchC", name:"Monarch Candidate",    test:() => playerLevel() >= 50},
  {id:"shadow",   name:"Shadow Monarch",       test:() => playerLevel() >= 55},
  {id:"legend",   name:"Legend of the Gates",  test:() => totalCompletions() >= 500},
  {id:"ruler",    name:"Ruler's Bane",         test:() => maxStreak() >= 100},
  {id:"ironbody", name:"Iron Body",            test:() => statPoints().str >= 50},
  {id:"phantom",  name:"Phantom Step",         test:() => statPoints().agi >= 50},
  {id:"undying",  name:"Undying",              test:() => statPoints().vit >= 50},
  {id:"scholar",  name:"Arcane Scholar",       test:() => statPoints().int >= 50},
  {id:"oracle",   name:"Oracle of the Gate",   test:() => statPoints().wis >= 50},
  {id:"gatebreak",  name:"Gatebreaker",        test:() => runesEarned().length >= 1},
  {id:"raidmaster", name:"Raid Master",        test:() => runesEarned().length >= 10},
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

/* ================= sound (Web Audio, synthesized) ================= */
const sfx = (() => {
  let ctx = null, master = null;
  function ensure(){
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx){ ctx = new AC(); master = ctx.createGain(); master.gain.value = .5; master.connect(ctx.destination); }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  document.addEventListener("pointerdown", ensure, {once:true});
  function blip(freq, type, dur, when, vol, glideTo){
    if (state.player.muted || !ensure()) return;
    const t0 = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + .05);
  }
  const buzz = ms => { try{ if (navigator.vibrate) navigator.vibrate(ms); }catch(_){} };
  return {
    tick:     () => blip(880, "triangle", .05, 0, .06),
    complete: () => { buzz(15); blip(987, "sine", .09, 0, .12); blip(1319, "sine", .2, .09, .12); blip(1325, "sine", .2, .09, .05); },
    levelup:  () => { buzz([30,40,60]); [523,659,784].forEach((f,i) => blip(f, "sawtooth", .13, i*.11, .07)); blip(1047, "sawtooth", .55, .33, .09); blip(1052, "sine", .55, .33, .05); },
    warn:     () => { blip(110, "sawtooth", .3, 0, .12, 95); blip(55, "sine", .3, 0, .1); blip(110, "sawtooth", .3, .42, .12, 95); blip(55, "sine", .3, .42, .1); }
  };
})();

/* ================= progress engine (XP rules live here) ================= */
function setProgress(q, dateKey, value){
  const t = todayStr();
  const wasDone = isDone(q, dateKey);
  const wasAll = allDone(t);
  const wasSatisfied = weekSatisfied(q, dateKey);
  const raidBefore = currentRaid();
  value = Math.max(0, Math.min(value, targetOf(q)));
  if (value <= 0) delete q.log[dateKey]; else q.log[dateKey] = value;
  if (value > 0 && dateKey < q.createdAt) q.createdAt = dateKey;   // backfill extends history
  const nowDone = isDone(q, dateKey);

  if (dateKey === t){   // XP only for today's gate — retro edits fix history, never EXP
    const led = (state.meta.xpLedger[t] = state.meta.xpLedger[t] || {});
    if (!wasDone && nowDone){
      const st = questStreak(q);
      const sBonus = 2*Math.min(st.n, 15);
      const mastery = masteryOf(q);                 // includes this clear
      const rBonus = runeBonusXP();                 // after-mutation: a reactivating clear counts itself
      const xp = BASE_XP + sBonus + mastery.bonus + rBonus;
      led[q.id] = xp; grantXP(xp);
      sfx.complete();
      toast(st.n > 1
        ? `QUEST CLEAR — +${xp} EXP (🔥${st.n}${st.weekly ? "w" : "d"} +${sBonus})`
        : `QUEST CLEAR — +${xp} EXP`);
      if (masteryFromClears(lifetimeClears(q) - 1).name !== mastery.name){
        sfx.levelup();
        setTimeout(() => toast(`QUEST RANK UP — ${q.name} reaches ${mastery.name}-RANK`), 1700);
      }
      if (!wasSatisfied && weekSatisfied(q, dateKey)){
        sysAlert(`Weekly goal met — ${q.name} (${freqOf(q)}/${freqOf(q)}). Gate exempt for the rest of the week.`);
      }
      if (!wasAll && allDone(t)){
        led._perfect = PERFECT_XP; grantXP(PERFECT_XP);
        particles();
        setTimeout(() => toast(`ALL GATES CLEARED — +${PERFECT_XP} BONUS EXP`), 900);
      }
      const raidNow = currentRaid();
      if (raidNow && raidNow.killed && !(raidBefore && raidBefore.killed)){
        sfx.levelup(); particles();
        sysAlert(`GATE BOSS SLAIN — ${raidNow.boss} falls! ${raidNow.rune.name} acquired.`);
      }
    } else if (wasDone && !nowDone){
      if (led[q.id]){ revokeXP(led[q.id]); delete led[q.id]; }
      if (led._perfect && !allDone(t)){ revokeXP(led._perfect); delete led._perfect; }
    } else if (value > 0){
      sfx.tick();
    }
  }
  checkTitles(false);
  checkLevelUp();
  save();
  renderAll();
}
const toggleQuest = (q, dateKey) => setProgress(q, dateKey, isDone(q, dateKey) ? 0 : targetOf(q));

function toggleTodo(td){
  const t = todayStr();
  const led = (state.meta.xpLedger[t] = state.meta.xpLedger[t] || {});
  const key = "s:" + td.id;
  if (!td.done){
    td.done = true; td.doneOn = t;
    // XP rules (anti-cheese): dailies earn once per day; one-offs earn once ever.
    // Untapping across midnight can't farm — yesterday's grant is never re-armed.
    const eligible = !led[key] && (td.daily ? td.rewardedOn !== t : !td.rewardedOn);
    if (eligible){
      const xp = diffXP(td);
      led[key] = xp; grantXP(xp); td.rewardedOn = t;
      sfx.complete(); toast(`SIDE QUEST CLEAR — +${xp} EXP`);
    } else {
      sfx.tick();
    }
  } else {
    const doneToday = td.doneOn === t;
    td.done = false; td.doneOn = null;
    // refund only same-day completions — retro edits never change EXP
    if (doneToday && led[key]){ revokeXP(led[key]); delete led[key]; td.rewardedOn = null; }
  }
  checkTitles(false); checkLevelUp(); save(); renderAll();
}

/* ================= header (STATUS window) ================= */
function renderHeader(){
  const now = new Date(), t = todayStr();
  document.getElementById("dateLine").textContent =
    now.toLocaleDateString(undefined,{weekday:"short", month:"short", day:"numeric"}).toUpperCase();

  const { level, into, need } = levelFromExp(state.player.exp);
  document.getElementById("lvNum").textContent = level;
  document.getElementById("playerName").textContent = state.player.name || "HUNTER";
  const rk = rankOf(level);
  const badge = document.getElementById("rankBadge");
  badge.textContent = rk.name + "-RANK";
  badge.style.color = rk.color;
  const tl = document.getElementById("titleLine");
  if (state.player.titles.length){
    tl.disabled = false;
    tl.textContent = state.player.title ? `« ${titleName(state.player.title)} »` : "« Select a title »";
  } else { tl.disabled = true; tl.textContent = "— No Title —"; }
  document.getElementById("expFill").style.width = (100*into/need) + "%";
  document.getElementById("expText").textContent = `${into} / ${need} EXP`;

  const pts = statPoints();
  document.getElementById("statGrid").innerHTML = STAT_ORDER.map(s =>
    `<div class="stat-cell" style="color:${STATS[s].color}" title="${STATS[s].label} — grows as you clear ${STATS[s].ab} quests">
       ${STAT_ICONS[s]}<b>${pts[s]}</b><span>${STATS[s].ab}</span>
     </div>`).join("");

  document.getElementById("questsDate").textContent =
    now.toLocaleDateString(undefined,{month:"short", day:"numeric"}).toUpperCase();

  /* today's gate: quests done today plus quests still expected (weekly-satisfied ones are exempt) */
  const active = state.quests.filter(q => isDone(q,t) || !weekSatisfied(q,t));
  const total = active.length;
  const done = active.filter(q => isDone(q,t)).length;
  const C = 2*Math.PI*32;
  document.getElementById("ringFg").style.strokeDashoffset = total ? C*(1 - done/total) : C;
  document.getElementById("ringCount").textContent = `${done}/${total}`;
  document.getElementById("headSub").textContent =
    total === 0 ? "No quests registered. The System awaits your command." :
    done === total ? "All gates cleared. The System acknowledges your strength." :
    done === 0 ? "Daily Quests have arrived. Begin when ready, Hunter." :
    `${total - done} gate${total-done>1?"s":""} remaining. Do not falter.`;

  document.getElementById("muteBtn").textContent = state.player.muted ? "🔇" : "🔊";
}

/* ================= quest list ================= */
const checkSVG = `<svg viewBox="0 0 24 24"><path d="M4.5 12.5l5 5 10-10"/></svg>`;

function renderQuests(){
  const list = document.getElementById("questList");
  const t = todayStr();
  if (!state.quests.length){
    list.innerHTML = `<li class="empty"><span class="big">⚔️</span>No Daily Quests registered.<br>Tap “+ NEW QUEST” to receive your first.</li>`;
    return;
  }
  list.innerHTML = "";
  state.quests.forEach(q => {
    const done = isDone(q,t), prog = progressOf(q,t), tgt = targetOf(q);
    const li = document.createElement("li");
    li.className = "quest panel sortable" + (done ? " done" : "");
    li.style.setProperty("--hc", q.color);
    const st = questStreak(q), s = st.n;
    const tier = st.weekly
      ? (s >= 12 ? " s3" : s >= 4 ? " s2" : "")
      : (s >= 30 ? " s3" : s >= 7 ? " s2" : "");
    const satisfied = weekSatisfied(q, t);
    const weekBit = freqOf(q) < 7
      ? (satisfied
          ? ` &nbsp;<span class="clear-tag">◆ WEEK GOAL MET</span>`
          : ` &nbsp;<span class="week-bit">${weekHitsM(q, mondayOf(new Date()))}/${freqOf(q)} wk</span>`)
      : "";
    const streakTxt = st.weekly ? `${s}w streak` : `${s} day${s>1?"s":""} streak`;
    const meta = done
      ? `<span class="clear-tag">✔ CLEAR</span>${s>1?` &nbsp;<span class="streak-hot${tier}">🔥 ${s}${st.weekly?"w":"d"}</span>`:""}${weekBit}`
      : (s > 0 ? `<span class="streak-hot${tier}">🔥 ${streakTxt}</span>` : `Begin your streak today`) + weekBit +
        (q.reminder ? ` &nbsp;<span class="rem-dot">⏰ ${q.reminder}</span>` : "");
    const m = masteryOf(q);
    const nameHTML = `${glyphOf(q)}${esc(q.name)}<span class="m-rank" style="color:${m.color}" title="Mastery — ${lifetimeClears(q)} lifetime clears">${m.name}</span>`;
    if (q.target){
      const amtOpen = openAmounts.has(q.id);
      li.innerHTML = `
        <span class="drag-handle" aria-hidden="true">⠿</span>
        <button class="check" aria-label="Toggle ${esc(q.name)}">${checkSVG}</button>
        <div class="quest-info">
          <div class="quest-name">${nameHTML}</div>
          <div class="quest-meta">${meta}</div>
          <div class="q-progress">
            <div class="q-bar"><i style="width:${Math.min(100,100*prog/tgt)}%"></i></div>
            <span class="q-count">${prog}/${tgt} ${esc(unitOf(q))}</span>
          </div>
          <div class="amount-panel${amtOpen ? "" : " hiddenblock"}">
            <button class="step minus" aria-label="Remove progress">−</button>
            <input class="amount-input" type="number" inputmode="numeric" min="0" max="${tgt}" value="${prog}" aria-label="Progress amount">
            <button class="step plus" aria-label="Add progress">＋</button>
            <span class="amount-unit">${esc(unitOf(q))}</span>
          </div>
        </div>
        <button class="amt-btn${amtOpen ? " on" : ""}" aria-label="Set amount" title="Set an exact amount">±</button>
        <button class="more-btn" aria-label="Edit quest">⋯</button>`;
      li.querySelector(".check").onclick = () => toggleQuest(q, t);   // one tap = full clear
      li.querySelector(".amt-btn").onclick = () => {
        openAmounts.has(q.id) ? openAmounts.delete(q.id) : openAmounts.add(q.id);
        renderQuests();
      };
      const inp = li.querySelector(".amount-input");
      inp.onchange = () => setProgress(q, t, parseInt(inp.value, 10) || 0);
      inp.onkeydown = e => { if (e.key === "Enter") inp.blur(); };
      li.querySelector(".plus").onclick  = () => setProgress(q, t, prog + smartStep(q));
      li.querySelector(".minus").onclick = () => setProgress(q, t, prog - smartStep(q));
    } else {
      li.innerHTML = `
        <span class="drag-handle" aria-hidden="true">⠿</span>
        <button class="check" aria-label="Toggle ${esc(q.name)}">${checkSVG}</button>
        <div class="quest-info">
          <div class="quest-name">${nameHTML}</div>
          <div class="quest-meta">${meta}</div>
        </div>
        <button class="more-btn" aria-label="Edit quest">⋯</button>`;
      li.querySelector(".check").onclick = () => toggleQuest(q, t);
    }
    li.querySelector(".more-btn").onclick = () => openQuestSheet(q);
    list.appendChild(li);
  });
}
const openAmounts = new Set();   // quest ids whose amount panel is expanded

/* ================= side quests ================= */
function renderTodos(){
  const list = document.getElementById("todoList");
  const openCount = state.todos.filter(td => !td.done).length;
  const sc = document.getElementById("sideCount");
  sc.hidden = openCount === 0;
  sc.textContent = openCount;
  if (!state.todos.length){
    list.innerHTML = `<li class="empty"><span class="big">🗡️</span>No side quests logged. The board is clear.</li>`;
    return;
  }
  list.innerHTML = "";
  state.todos.forEach(td => {
    const li = document.createElement("li");
    li.className = "todo panel sortable" + (td.done ? " done" : "");
    const diffChip = td.diff && td.diff !== "easy"
      ? `<span class="diff-tag ${td.diff}">+${diffXP(td)}</span>` : "";
    li.innerHTML = `
      <span class="drag-handle" aria-hidden="true">⠿</span>
      <button class="check" aria-label="Toggle task">${checkSVG}</button>
      <div class="todo-text" role="button" title="Edit side quest">${esc(td.text)}${diffChip}${td.daily ? `<span class="daily-tag">DAILY</span>` : ""}</div>
      <button class="daily-btn${td.daily ? " on" : ""}" aria-label="Toggle daily repeat" title="${td.daily ? "Repeats daily — resets at midnight" : "Make this a daily side quest"}">⟳</button>
      <button class="del-btn" aria-label="Delete task">✕</button>`;
    li.querySelector(".check").onclick = () => toggleTodo(td);
    li.querySelector(".todo-text").onclick = () => openTodoSheet(td);
    li.querySelector(".daily-btn").onclick = () => {
      td.daily = !td.daily;
      save(); renderTodos();
      toast(td.daily ? "SIDE QUEST SET TO DAILY — resets at midnight" : "SIDE QUEST SET TO ONE-OFF");
    };
    li.querySelector(".del-btn").onclick = () => {
      state.meta.deleted[td.id] = todayStr();
      state.todos = state.todos.filter(x => x.id !== td.id); save(); renderTodos();
    };
    list.appendChild(li);
  });
}
document.getElementById("todoForm").addEventListener("submit", e => {
  e.preventDefault();
  const input = document.getElementById("todoInput");
  const text = input.value.trim();
  if (!text) return;
  state.todos.push({id:uid(), text, done:false, daily:false, doneOn:null, rewardedOn:null, diff:"easy"});
  input.value = ""; save(); renderTodos();
});

/* ================= daily / side segments ================= */
document.querySelectorAll(".seg-row .seg").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".seg-row .seg").forEach(b => b.classList.toggle("active", b === btn));
    document.getElementById("seg-daily").hidden = btn.dataset.seg !== "daily";
    document.getElementById("seg-side").hidden  = btn.dataset.seg !== "side";
  };
});

/* ================= side quest editor ================= */
const todoOverlay = document.getElementById("todoOverlay");
let editingTodo = null, selDiff = "easy";
function buildDiffRow(){
  const row = document.getElementById("diffRow");
  row.innerHTML = "";
  [["easy","EASY"],["normal","NORMAL"],["hard","HARD"]].forEach(([id,label]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "diff-opt" + (selDiff === id ? " sel" : "");
    b.innerHTML = `${label}<span>+${DIFF_XP[id]} EXP</span>`;
    b.onclick = () => { selDiff = id; buildDiffRow(); };
    row.appendChild(b);
  });
}
function openTodoSheet(td){
  editingTodo = td;
  selDiff = DIFF_XP[td.diff] ? td.diff : "easy";
  document.getElementById("todoTextInput").value = td.text;
  document.getElementById("todoDailyChk").checked = !!td.daily;
  buildDiffRow();
  todoOverlay.classList.add("open");
}
function closeTodoSheet(){ todoOverlay.classList.remove("open"); editingTodo = null; }
document.getElementById("todoSaveBtn").onclick = () => {
  if (!editingTodo) return;
  const text = document.getElementById("todoTextInput").value.trim();
  if (text) editingTodo.text = text.slice(0, 200);
  editingTodo.diff = selDiff;
  editingTodo.daily = document.getElementById("todoDailyChk").checked;
  save(); closeTodoSheet(); renderTodos();
};
document.getElementById("todoDeleteBtn").onclick = () => {
  if (!editingTodo) return;
  state.meta.deleted[editingTodo.id] = todayStr();
  state.todos = state.todos.filter(x => x.id !== editingTodo.id);
  save(); closeTodoSheet(); renderTodos();
};
todoOverlay.addEventListener("click", e => { if (e.target === todoOverlay) closeTodoSheet(); });

/* ================= gate raid (weekly boss) ================= */
const raidOverlay = document.getElementById("raidOverlay");
function renderRaid(){
  const panel = document.getElementById("raidPanel");
  const raid = currentRaid();
  if (!raid){ panel.hidden = true; return; }
  panel.hidden = false;
  const dayIdx = (new Date().getDay() + 6) % 7;              // 0 = Monday
  const daysLeft = 7 - dayIdx;
  const enraged = !raid.killed && dayIdx >= 3 && raid.rawDmg < raid.hp * (dayIdx / 7);
  panel.classList.toggle("slain", raid.killed);
  panel.classList.toggle("enraged", enraged);
  panel.innerHTML = `
    <div class="raid-top">
      <span class="raid-tag">⬢ GATE RAID</span>
      <span class="raid-days">${raid.killed ? "GATE CLEARED" : `${daysLeft}D LEFT`}${enraged ? ` · <b class="enrage-tag">ENRAGED</b>` : ""}</span>
    </div>
    <div class="raid-name">${raid.boss}</div>
    <div class="hp-bar"><i style="width:${Math.round(100*raid.dmg/raid.hp)}%"></i></div>
    <div class="raid-sub">${raid.killed
      ? `SLAIN — ${raid.rune.name.toUpperCase()} SECURED`
      : `${raid.dmg} / ${raid.hp} DMG${runesDormant() ? " · RUNES DORMANT" : ""}`}</div>`;
  panel.onclick = openRaidSheet;
}
function openRaidSheet(){
  const raid = currentRaid();
  const det = document.getElementById("raidDetail");
  det.innerHTML = raid ? `
    <div class="raid-name">${raid.boss}</div>
    <div class="hp-bar"><i style="width:${Math.round(100*raid.dmg/raid.hp)}%"></i></div>
    <div class="raid-sub">${raid.dmg} / ${raid.hp} DMG · ${raid.clears} clear${raid.clears===1?"":"s"} this week${raid.killed ? " · SLAIN ✔" : ""}</div>`
    : `<div class="empty">Register Daily Quests to open the weekly gate.</div>`;
  const runes = runesEarned().slice().reverse();
  const dormant = runesDormant();
  const grid = document.getElementById("runeGrid");
  grid.innerHTML = "";
  if (!runes.length){
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">No runes yet. Slay a weekly boss to claim your first.</div>`;
  } else {
    runes.slice(0, 24).forEach(r => {
      const cell = document.createElement("div");
      cell.className = "rune-cell" + (dormant ? " dormant" : "");
      cell.style.color = STATS[r.rune.stat].color;
      cell.title = `${r.rune.name} — week of ${r.mondayKey}`;
      cell.innerHTML = `${STAT_ICONS[r.rune.stat]}<span>${r.rune.name.replace("Rune of ","")}</span>`;
      grid.appendChild(cell);
    });
  }
  const note = document.getElementById("runeStatus");
  if (note) note.remove();
  if (runes.length){
    const n = document.createElement("div");
    n.className = "sheet-note"; n.id = "runeStatus";
    n.textContent = dormant
      ? `Runes dormant — land ${Math.max(1, 3 - (raid ? raid.clears : 0))} more clear(s) this week to reawaken them.`
      : `Active: +${runeBonusXP()} EXP per quest clear (${runes.length} rune${runes.length>1?"s":""}, cap +5).`;
    grid.after(n);
  }
  raidOverlay.classList.add("open");
}
document.getElementById("raidClose").onclick = () => raidOverlay.classList.remove("open");
raidOverlay.addEventListener("click", e => { if (e.target === raidOverlay) raidOverlay.classList.remove("open"); });

/* ================= drag reorder (pointer events) ================= */
function makeSortable(listEl, getArr){
  let drag = null;
  listEl.addEventListener("pointerdown", e => {
    const handle = e.target.closest(".drag-handle");
    if (!handle || !e.isPrimary) return;
    const row = handle.closest("li.sortable");
    if (!row) return;
    e.preventDefault();
    const items = [...listEl.querySelectorAll("li.sortable")];
    const mids = items.map(it => { const r = it.getBoundingClientRect(); return r.top + r.height/2; });
    drag = { row, items, mids, start: items.indexOf(row), cur: items.indexOf(row),
             y: e.clientY, h: row.getBoundingClientRect().height + 9 };
    row.classList.add("dragging");
    try{ handle.setPointerCapture(e.pointerId); }catch(_){}
  });
  listEl.addEventListener("pointermove", e => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    drag.row.style.transform = `translateY(${dy}px) scale(1.03) rotate(.8deg)`;   // lift
    const center = drag.mids[drag.start] + dy;
    let ni = 0;
    drag.mids.forEach((m,i) => { if (i !== drag.start && center > m) ni++; });
    if (ni !== drag.cur){
      drag.cur = ni;
      try{ if (navigator.vibrate) navigator.vibrate(8); }catch(_){}   // slot-crossing tick
      drag.items.forEach((it,i) => {
        if (it === drag.row) return;
        let off = 0;
        if (drag.start < ni && i > drag.start && i <= ni) off = -drag.h;
        else if (drag.start > ni && i >= ni && i < drag.start) off = drag.h;
        it.style.transition = "transform .15s";
        it.style.transform = off ? `translateY(${off}px)` : "";
      });
    }
  });
  const end = () => {
    if (!drag) return;
    const { row, items, start, cur } = drag;
    drag = null;
    row.classList.remove("dragging");
    const before = row.getBoundingClientRect();   // visual spot at release
    items.forEach(it => { it.style.transform = ""; it.style.transition = ""; });
    if (cur !== start){
      const arr = getArr();
      const [m] = arr.splice(start, 1);
      arr.splice(cur, 0, m);
      save();
      // move the DOM node directly — a full re-render would replay every row's entrance animation
      listEl.insertBefore(row, cur > start ? items[cur].nextSibling : items[cur]);
    }
    // FLIP settle: glide from the release point into the final slot
    const after = row.getBoundingClientRect();
    const dy = before.top - after.top;
    if (dy){
      row.style.transition = "none";
      row.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        row.style.transition = "transform .18s ease";
        row.style.transform = "";
        setTimeout(() => { row.style.transition = ""; }, 220);
      });
    }
  };
  listEl.addEventListener("pointerup", end);
  listEl.addEventListener("pointercancel", end);
}
makeSortable(document.getElementById("questList"), () => state.quests);
makeSortable(document.getElementById("todoList"),  () => state.todos);

/* ================= week view ================= */
function renderWeek(){
  const el = document.getElementById("tab-week");
  const today = new Date(); today.setHours(0,0,0,0);
  const monday = addDays(today, -((today.getDay()+6)%7));
  if (!state.quests.length){
    el.innerHTML = `<div class="empty"><span class="big">📅</span>Register Daily Quests to see your week.</div>`;
    return;
  }
  el.innerHTML = "";
  const sunday = addDays(monday, 6);
  const rangeFmt = d => d.toLocaleDateString(undefined,{month:"short", day:"numeric"}).toUpperCase();
  const range = document.createElement("div");
  range.className = "week-range";
  range.textContent = `◈ ${rangeFmt(monday)} — ${rangeFmt(sunday)}`;
  el.appendChild(range);
  state.quests.forEach(q => {
    const card = document.createElement("div");
    card.className = "week-card panel";
    card.style.setProperty("--hc", q.color);
    let doneCount = 0, daysHTML = "";
    for (let i = 0; i < 7; i++){
      const d = addDays(monday, i), key = fmt(d);
      const isFuture = d > today;
      const on = isDone(q, key);
      const frac = q.target ? Math.min(1, progressOf(q,key)/targetOf(q)) : 0;
      if (on && !isFuture) doneCount++;
      daysHTML += `
        <div class="day-col">
          <span class="day-letter">${DAY_LETTERS[i]}</span>
          <span class="day-num">${d.getDate()}</span>
          <button class="day-dot${on?" on":""}${key===todayStr()?" today-dot":""}${isFuture?" future":""}"
                  data-date="${key}" ${isFuture?"disabled":""} aria-label="${esc(q.name)} on ${key}">
            ${(!on && frac>0) ? `<span class="fill" style="height:${Math.round(frac*100)}%"></span>` : ""}
          </button>
        </div>`;
    }
    const mw = masteryOf(q);
    const pct = freqOf(q) < 7
      ? (doneCount >= freqOf(q) ? `${doneCount}/${freqOf(q)} · GOAL MET ✓` : `${doneCount}/${freqOf(q)} THIS WEEK`)
      : `${doneCount}/7 CLEARED`;
    card.innerHTML = `
      <div class="week-card-head">
        <span class="quest-name">${glyphOf(q)}${esc(q.name)}<span class="m-rank" style="color:${mw.color}">${mw.name}</span></span>
        <span class="week-pct">${pct}</span>
      </div>
      <div class="week-days">${daysHTML}</div>`;
    card.querySelectorAll(".day-dot:not(.future)").forEach(btn => {
      btn.onclick = () => {
        if (q.target) openDayEditor(btn.dataset.date);   // amounts are ambiguous as a toggle
        else toggleQuest(q, btn.dataset.date);
      };
    });
    el.appendChild(card);
  });
  const note = document.createElement("div");
  note.className = "grace-note";
  note.textContent = "◈ The System forgives one missed day per week. Streaks endure.";
  el.appendChild(note);
}

/* ================= records (month) ================= */
let monthCursor = new Date(); monthCursor.setDate(1);
const HEAT = ["rgba(74,168,255,.06)","#123a6b","#1e5fae","#8b5cf6","#f5c542"];
function renderRecords(){
  const el = document.getElementById("monthGrid");
  const y = monthCursor.getFullYear(), m = monthCursor.getMonth();
  document.getElementById("monthTitle").textContent =
    monthCursor.toLocaleDateString(undefined,{month:"long", year:"numeric"}).toUpperCase();
  const today = new Date(); today.setHours(0,0,0,0);
  const firstDow = (new Date(y,m,1).getDay()+6)%7;
  const daysInMonth = new Date(y,m+1,0).getDate();
  let html = ["MO","TU","WE","TH","FR","SA","SU"].map(d=>`<div class="dow">${d}</div>`).join("");
  for (let i=0;i<firstDow;i++) html += `<div></div>`;
  for (let day=1; day<=daysInMonth; day++){
    const d = new Date(y,m,day), key = fmt(d);
    const isFuture = d > today;
    const existing = state.quests.filter(q => parseD(q.createdAt) <= d);
    const done = existing.filter(q => isDone(q,key)).length;
    let style = "", cls = "m-day";
    if (!isFuture && existing.length){
      const frac = done / existing.length;
      const idx = frac === 0 ? 0 : frac < .34 ? 1 : frac < .67 ? 2 : frac < 1 ? 3 : 4;
      style = `background:${HEAT[idx]};${idx>=2?"color:#fff":""}${idx===4?";color:#3a2c00":""}`;
    }
    if (isFuture) cls += " future";
    if (key === todayStr()) cls += " is-today";
    html += isFuture
      ? `<div class="${cls}">${day}</div>`
      : `<button class="${cls}" style="${style}" data-date="${key}" title="${done}/${existing.length} quests">${day}</button>`;
  }
  el.innerHTML = html;
  el.querySelectorAll("button.m-day").forEach(btn => {
    btn.onclick = () => openDayEditor(btn.dataset.date);
  });
}
document.getElementById("prevMonth").onclick = () => { monthCursor.setMonth(monthCursor.getMonth()-1); renderRecords(); };
document.getElementById("nextMonth").onclick = () => { monthCursor.setMonth(monthCursor.getMonth()+1); renderRecords(); };

/* ================= day editor ================= */
const dayOverlay = document.getElementById("dayOverlay");
let dayEditorDate = null;
function openDayEditor(dateKey){
  dayEditorDate = dateKey;
  renderDayEditor();
  dayOverlay.classList.add("open");
}
function renderDayEditor(){
  if (!dayEditorDate) return;
  const d = parseD(dayEditorDate);
  document.getElementById("dayTitle").textContent =
    "GATE RECORDS — " + d.toLocaleDateString(undefined,{weekday:"short", month:"short", day:"numeric"}).toUpperCase();
  const wrap = document.getElementById("dayRows");
  const quests = state.quests;   // all quests editable — backfilling extends a quest's history
  if (!quests.length){
    wrap.innerHTML = `<div class="empty">No quests registered.</div>`;
    return;
  }
  wrap.innerHTML = "";
  quests.forEach(q => {
    const prog = progressOf(q, dayEditorDate), tgt = targetOf(q), done = isDone(q, dayEditorDate);
    const row = document.createElement("div");
    row.className = "de-row" + (done ? " done" : "");
    row.style.setProperty("--hc", q.color);
    if (q.target){
      row.innerHTML = `
        <button class="check" aria-label="Toggle">${checkSVG}</button>
        <div class="quest-name">${glyphOf(q)}${esc(q.name)}</div>
        <div class="de-steppers">
          <button class="step minus" aria-label="Less">−</button>
          <span class="de-count">${prog}/${tgt} ${esc(unitOf(q))}</span>
          <button class="step plus" aria-label="More">＋</button>
        </div>`;
      row.querySelector(".check").onclick = () => toggleQuest(q, dayEditorDate);   // one tap = full clear
      row.querySelector(".plus").onclick  = () => setProgress(q, dayEditorDate, prog + smartStep(q));
      row.querySelector(".minus").onclick = () => setProgress(q, dayEditorDate, prog - smartStep(q));
    } else {
      row.innerHTML = `
        <button class="check" aria-label="Toggle">${checkSVG}</button>
        <div class="quest-name">${glyphOf(q)}${esc(q.name)}</div>`;
      row.querySelector(".check").onclick = () => toggleQuest(q, dayEditorDate);
    }
    wrap.appendChild(row);
  });
}
document.getElementById("dayClose").onclick = () => { dayOverlay.classList.remove("open"); dayEditorDate = null; };
dayOverlay.addEventListener("click", e => { if (e.target === dayOverlay){ dayOverlay.classList.remove("open"); dayEditorDate = null; } });

/* ================= tabs ================= */
document.querySelectorAll(".tabs button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("active", b === btn));
    ["quests","week","records"].forEach(name => {
      document.getElementById("tab-"+name).hidden = name !== btn.dataset.tab;
    });
    renderAll();
  };
});

/* ================= quest sheet (add / edit) ================= */
const questOverlay = document.getElementById("questOverlay");
let editing = null, selStat = "str", selColor = NEON[0];

function buildPickers(){
  const sr = document.getElementById("statPicker");
  sr.innerHTML = "";
  STAT_ORDER.forEach(s => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "stat-opt" + (s === selStat ? " sel" : "");
    b.style.color = STATS[s].color;
    b.title = STATS[s].label;
    b.innerHTML = `${STAT_ICONS[s]}<span>${STATS[s].ab}</span>`;
    b.onclick = () => { selStat = s; buildPickers(); };
    sr.appendChild(b);
  });
  const cr = document.getElementById("colorRow");
  cr.innerHTML = "";
  NEON.forEach(c => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "color-opt" + (c === selColor ? " sel" : "");
    b.style.background = c; b.style.color = c; b.setAttribute("aria-label", c);
    b.onclick = () => { selColor = c; buildPickers(); };
    cr.appendChild(b);
  });
}
const targetToggle = document.getElementById("targetToggle");
const targetFields = document.getElementById("targetFields");
const targetUnitSel = document.getElementById("targetUnit");
const customUnitWrap = document.getElementById("customUnitWrap");
targetToggle.onchange = () => targetFields.classList.toggle("hiddenblock", !targetToggle.checked);
targetUnitSel.onchange = () => customUnitWrap.classList.toggle("hiddenblock", targetUnitSel.value !== "custom");
document.getElementById("clearReminder").onclick = () => { document.getElementById("reminderInput").value = ""; };

function openQuestSheet(quest){
  editing = quest || null;
  document.getElementById("sheetTitle").textContent = quest ? "EDIT QUEST" : "NEW QUEST";
  document.getElementById("questNameInput").value = quest ? quest.name : "";
  document.getElementById("deleteQuestBtn").hidden = !quest;
  selStat = quest && STATS[quest.stat] ? quest.stat : "str";
  selColor = quest ? quest.color : NEON[state.quests.length % NEON.length];
  buildPickers();
  const tgt = quest && quest.target;
  targetToggle.checked = !!tgt;
  targetFields.classList.toggle("hiddenblock", !tgt);
  document.getElementById("targetAmount").value = tgt ? tgt.amount : 30;
  document.getElementById("freqSelect").value = quest ? freqOf(quest) : 7;
  const presets = ["min","hr","glasses","reps","pages"];
  if (tgt && !presets.includes(tgt.unit)){
    targetUnitSel.value = "custom";
    document.getElementById("customUnit").value = tgt.unit;
    customUnitWrap.classList.remove("hiddenblock");
  } else {
    targetUnitSel.value = tgt ? tgt.unit : "min";
    document.getElementById("customUnit").value = "";
    customUnitWrap.classList.add("hiddenblock");
  }
  document.getElementById("reminderInput").value = quest && quest.reminder ? quest.reminder : "";
  const nn = document.getElementById("notifNote");
  nn.textContent = ("Notification" in window)
    ? "Alerts fire while this page is open in a tab."
    : "Browser notifications unsupported here — in-app alerts only.";
  questOverlay.classList.add("open");
  setTimeout(() => document.getElementById("questNameInput").focus(), 250);
}
function closeQuestSheet(){ questOverlay.classList.remove("open"); }
questOverlay.addEventListener("click", e => { if (e.target === questOverlay) closeQuestSheet(); });
document.getElementById("addQuestBtn").onclick = () => openQuestSheet(null);

document.getElementById("saveQuestBtn").onclick = () => {
  const name = document.getElementById("questNameInput").value.trim();
  if (!name){ document.getElementById("questNameInput").focus(); return; }
  let target = null;
  if (targetToggle.checked){
    const amount = Math.max(1, parseInt(document.getElementById("targetAmount").value, 10) || 1);
    let unit = targetUnitSel.value;
    if (unit === "custom") unit = (document.getElementById("customUnit").value.trim() || "units");
    target = { amount, unit };
  }
  const reminder = document.getElementById("reminderInput").value || null;
  const freq = Math.min(7, Math.max(1, parseInt(document.getElementById("freqSelect").value, 10) || 7));
  const hadReminder = editing && editing.reminder;
  if (editing){
    editing.name = name; editing.stat = selStat; editing.color = selColor;
    editing.target = target; editing.reminder = reminder; editing.freq = freq;
  } else {
    state.quests.push({id:uid(), name, stat:selStat, color:selColor, createdAt:todayStr(), target, reminder, freq, log:{}});
  }
  if (reminder && !hadReminder && ("Notification" in window) && Notification.permission === "default"){
    try{ Notification.requestPermission(); }catch(_){}
  }
  save(); closeQuestSheet(); renderAll();
};
document.getElementById("deleteQuestBtn").onclick = () => {
  if (!editing) return;
  if (!confirm(`Abandon quest “${editing.name}” and its records?`)) return;
  state.meta.deleted[editing.id] = todayStr();   // tombstone so sync propagates the deletion
  state.quests = state.quests.filter(q => q.id !== editing.id);
  save(); closeQuestSheet(); renderAll();
};
document.getElementById("questNameInput").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("saveQuestBtn").click();
});

/* ================= hunter name ================= */
const nameOverlay = document.getElementById("nameOverlay");
function openNameSheet(){
  document.getElementById("nameInput").value = state.player.name || "";
  nameOverlay.classList.add("open");
  setTimeout(() => document.getElementById("nameInput").focus(), 250);
}
document.getElementById("nameSave").onclick = () => {
  const v = document.getElementById("nameInput").value.trim();
  state.player.name = v || "Hunter";
  save(); nameOverlay.classList.remove("open"); renderHeader();
  toast(`REGISTERED — Welcome, ${state.player.name}.`);
};
document.getElementById("nameInput").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("nameSave").click();
});
document.getElementById("editNameBtn").onclick = openNameSheet;

/* ================= title picker ================= */
const titleOverlay = document.getElementById("titleOverlay");
document.getElementById("titleLine").onclick = () => {
  if (!state.player.titles.length) return;
  const wrap = document.getElementById("titleOpts");
  wrap.innerHTML = "";
  TITLES.forEach(t => {
    const unlocked = state.player.titles.includes(t.id);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "title-opt" + (state.player.title === t.id ? " sel" : "") + (unlocked ? "" : " title-locked");
    b.textContent = unlocked ? `« ${t.name} »` : "🔒 ???";
    if (unlocked) b.onclick = () => { state.player.title = t.id; save(); renderHeader(); titleOverlay.classList.remove("open"); };
    wrap.appendChild(b);
  });
  titleOverlay.classList.add("open");
};
document.getElementById("titleClose").onclick = () => titleOverlay.classList.remove("open");
titleOverlay.addEventListener("click", e => { if (e.target === titleOverlay) titleOverlay.classList.remove("open"); });

/* ================= mute ================= */
document.getElementById("muteBtn").onclick = () => {
  state.player.muted = !state.player.muted;
  save(); renderHeader();
};

/* ================= data safety: export / import ================= */
document.getElementById("exportBtn").onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `hunter-save-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("SAVE FILE EXPORTED");
};
const importFile = document.getElementById("importFile");
document.getElementById("importBtn").onclick = () => importFile.click();
importFile.onchange = () => {
  const f = importFile.files[0];
  importFile.value = "";
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try{
      const data = JSON.parse(r.result);
      if (!data || data.version !== 2 || !Array.isArray(data.quests)) throw new Error("bad shape");
      if (!confirm("Import this save file? Your current data will be replaced.")) return;
      state = normalize(data);
      save(); renderAll();
      toast("SAVE IMPORTED — Welcome back, Hunter.");
    }catch(e){
      sysAlert("Import failed — that is not a valid save file.");
    }
  };
  r.readAsText(f);
};

/* ================= level up / effects ================= */
const lvlOverlay = document.getElementById("lvlOverlay");
let lvlTimer;
function showLevelUp(from, to){
  document.getElementById("lvlNums").textContent = `LV.${from}  →  LV.${to}`;
  lvlOverlay.classList.add("show");
  sfx.levelup();
  particles();
  clearTimeout(lvlTimer);
  lvlTimer = setTimeout(() => lvlOverlay.classList.remove("show"), 2400);
}
lvlOverlay.addEventListener("click", () => lvlOverlay.classList.remove("show"));

function particles(){
  const colors = ["#4aa8ff","#8b5cf6","#22d3ee","#dbe9ff","#f5c542"];
  for (let i = 0; i < 55; i++){
    const p = document.createElement("div");
    p.className = "particle";
    p.style.left = Math.random()*100 + "vw";
    const c = colors[i % colors.length];
    p.style.background = c; p.style.color = c;
    p.style.animationDelay = Math.random()*0.4 + "s";
    p.style.setProperty("--x", (Math.random()*160-80) + "px");
    p.style.setProperty("--r", (Math.random()*720-360) + "deg");
    if (Math.random() > .5) p.style.borderRadius = "50%";
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 3200);
  }
}
let toastTimer;
function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}
function sysAlert(msg){
  const el = document.createElement("div");
  el.className = "sys-alert";
  el.innerHTML = `<b>[ SYSTEM ]</b>${esc(msg)}`;
  document.getElementById("alertStack").appendChild(el);
  setTimeout(() => el.remove(), 7000);
}

/* ================= reminders & penalty (system tick) ================= */
const warnBanner = document.getElementById("warnBanner");
document.getElementById("warnClose").onclick = () => warnBanner.classList.remove("show");
let lastDay = todayStr();

function systemTick(){
  const t = todayStr();
  if (t !== lastDay){   // midnight rollover
    lastDay = t;
    let rolled = false;
    state.todos.forEach(td => {   // daily side quests reset for the new day
      if (td.daily && td.done){ td.done = false; td.doneOn = null; rolled = true; }
    });
    if (rolled) save();
    renderAll();
  }
  const now = new Date();
  const hm = pad(now.getHours()) + ":" + pad(now.getMinutes());
  let dirty = false;
  state.quests.forEach(q => {
    if (q.reminder && hm >= q.reminder && !isDone(q,t) && !weekSatisfied(q,t) && state.meta.remindersFired[q.id] !== t){
      state.meta.remindersFired[q.id] = t; dirty = true;
      sysAlert(`Quest available: ${q.name}${q.target?` — ${targetOf(q)} ${unitOf(q)}`:""}`);
      sfx.complete();
      if ("Notification" in window && Notification.permission === "granted"){
        try{ new Notification("[SYSTEM] Daily Quest", { body:`${q.name} awaits completion, Hunter.` }); }catch(_){}
      }
    }
  });
  if (now.getHours() >= 20 && state.quests.some(q => !isDone(q,t) && !weekSatisfied(q,t)) && state.meta.warnedOn !== t){
    state.meta.warnedOn = t; dirty = true;
    warnBanner.classList.add("show");
    sfx.warn();
  }
  if (dirty) save();
}
setInterval(systemTick, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) systemTick(); });

/* ================= boot ================= */
function renderAll(){
  renderHeader();
  renderRaid();
  renderQuests();
  renderTodos();
  renderWeek();
  renderRecords();
  if (dayEditorDate) renderDayEditor();
}
checkTitles(true);       // unlock silently for migrated history — no toast spam on load
save();
renderAll();
if (!state.player.name) openNameSheet();
systemTick();

/* ================= PWA (no-op on file://) ================= */
if ("serviceWorker" in navigator && location.protocol !== "file:"){
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
