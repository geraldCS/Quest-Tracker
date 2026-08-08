"use strict";
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
  touchState();   // must land here: the XP block below re-reads currentRaid() to detect a kill
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
      buzz(8);
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
    buzz(8);
    const doneToday = td.doneOn === t;
    td.done = false; td.doneOn = null;
    // refund only same-day completions — retro edits never change EXP
    if (doneToday && led[key]){ revokeXP(led[key]); delete led[key]; td.rewardedOn = null; }
  }
  checkTitles(false); checkLevelUp(); save(); renderAll();
}

