"use strict";
/* ================= sound (Web Audio, synthesized) =================
   Sound is the only feedback channel this app has: navigator.vibrate does not
   exist in Safari on iOS and desktop has no vibration hardware, so every buzz()
   call is a no-op on both of the devices this is used on.

   Seventeen sounds in three amplitude tiers. Tier is set by loudness, not by
   omission — routine interactions are audible texture, events are events, and
   fanfares are rare. That ordering is what keeps a daily-use app from becoming
   exhausting, and it is asserted in the verification suite.

   Designed for a desktop with earphones, so the full range is load-bearing:
   bossSlain leans on sub-bass deliberately. */
const sfx = (() => {
  let ctx = null, master = null, limiter = null;
  function ensure(){
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx){
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 1;
      // Brickwall-ish limiter. Mandatory at these levels, not a nicety: clearing
      // the last quest of a perfect day fires questClear + perfectDay + bossSlain
      // + levelUp inside a second, and that sum clips without it. The loudest
      // single sound sits *at* the threshold, so it is transparent alone and only
      // engages on overlap. (Chrome adds ~6ms lookahead latency — irrelevant here.)
      limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      // .0005, not the .003 the plan specified: at .003 the attack is slow enough
      // that the opening transient of a four-sound overlap slips past the limiter,
      // and the stress test measured >1.0 on 2 of 4 runs. .0005 catches it (peak
      // .943, never clipped) and costs nothing — solo levels are identical to
      // two decimals, so the "very loud" decision is untouched.
      limiter.attack.value = .0005;
      limiter.release.value = .15;
      master.connect(limiter); limiter.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  // keydown as well as pointerdown: a desktop session that starts at the keyboard
  // would otherwise stay silent until something is clicked.
  ["pointerdown","keydown"].forEach(ev => document.addEventListener(ev, ensure, {once:true}));

  /* ---- primitives ---- */
  function tone(freq, type, dur, when, vol, glideTo, detune){
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime + (when || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur);
    if (detune) o.detune.setValueAtTime(detune, t0);
    const atk = Math.min(.006, dur * .25);   // a tiny attack ramp; setValueAtTime alone clicks
    g.gain.setValueAtTime(.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + .05);
  }
  function noise(dur, when, vol, cutoff){      // filtered noise burst — impact transients
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime + (when || 0);
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random()*2 - 1) * (1 - i/n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cutoff || 900;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + .02);
  }
  /* Tier 1 answers to the UI toggle, tiers 2-3 to the events toggle. Undefined
     reads as on, so a save written before these flags existed still makes noise. */
  const audible = tier => tier === 1 ? state.player.sndUI !== false : state.player.sndEvents !== false;
  const S = (tier, fn) => () => { if (audible(tier) && ensure()) fn(); };

  return {
    /* ---- tier 1: texture, but audible, -22.3 to -16.8 dBFS ----
       Two earlier cuts were inaudible. Perceived loudness integrates over
       ~100-200ms, so a very short click needs far more amplitude than its peak
       suggests to register — peak is a poor proxy for what an ear hears. These
       are still the quietest things in the app, but comfortably present. */
    tap:        S(1, () => tone(1200, "triangle", .035, 0, .1507)),
    sheetOpen:  S(1, () => tone(420, "sine", .09, 0, .1507, 900)),
    sheetClose: S(1, () => tone(900, "sine", .09, 0, .137, 420)),
    dragLift:   S(1, () => { tone(180, "sine", .07, 0, .1644); noise(.035, 0, .0822, 400); }),
    dragCross:  S(1, () => tone(1600, "triangle", .018, 0, .0822)),  // fires repeatedly mid-drag: shortest and quietest
    uncheck:    S(1, () => tone(700, "triangle", .08, 0, .1507, 350)),

    /* ---- tier 2: events, -13.8 to -7.9 dBFS ---- */
    questClear: S(2, () => { buzz(15); tone(987, "sine", .09, 0, .2877); tone(1319, "sine", .2, .09, .2877); tone(1325, "sine", .2, .09, .1233); }),
    sideClear:  S(2, () => { buzz(12); tone(784, "triangle", .07, 0, .2192); tone(1047, "triangle", .13, .07, .1973); }),
    partial:    S(2, () => tone(880, "triangle", .07, 0, .2192)),
    titleUnlock:S(2, () => { buzz(20); [1047,1319,1568].forEach((f,i) => { tone(f, "sine", .34, i*.05, .1781); tone(f, "sine", .34, i*.05, .0795, 0, 7); }); }),
    masteryUp:  S(2, () => [659,880,1175].forEach((f,i) => tone(f, "triangle", .16, i*.08, .2137))),
    weekGoal:   S(2, () => { tone(784, "sine", .1, 0, .2521); tone(1175, "sine", .22, .1, .2521); }),
    reminder:   S(2, () => { tone(1319, "sine", .07, 0, .2137); tone(1319, "sine", .07, .12, .2137); }),

    /* ---- tier 3: fanfares, -5.8 to -3.0 dBFS, rare ---- */
    // Tier 3 levels are set so the quietest fanfare still beats the loudest
    // tier-2 event. Peak is a function of how much overlaps, not just vol, so
    // these were tuned against measured output rather than chosen on paper.
    // bossSlain is the ceiling and sits on the limiter threshold by design.
    levelUp:    S(3, () => { buzz([30,40,60]); [523,659,784].forEach((f,i) => tone(f, "sawtooth", .13, i*.11, .3836)); tone(1047, "sawtooth", .55, .33, .4932); tone(1052, "sine", .55, .33, .274); }),
    // the biggest sound in the app: sub-bass impact, then a rising tail
    bossSlain:  S(3, () => {
                  buzz([40,60,80]);
                  noise(.12, 0, .6165, 300);
                  tone(55, "sine", .5, 0, .6576);
                  tone(82, "sine", .45, .02, .4384);
                  tone(220, "sawtooth", .5, .12, .3288, 880);
                  tone(1047, "sine", .5, .3, .274);
                  tone(1568, "sine", .45, .38, .2);
                }),
    perfectDay: S(3, () => { buzz([20,30,40]); [784,988,1175,1568,2093].forEach((f,i) => tone(f, "sine", .3, i*.07, .4384)); }),
    warn:       S(3, () => { tone(110, "sawtooth", .3, 0, .411, 95); tone(55, "sine", .3, 0, .3425); tone(110, "sawtooth", .3, .42, .411, 95); tone(55, "sine", .3, .42, .3425); }),

    /* Verification hook. The tier ordering and the sub-bass in bossSlain are
       claims about real output, so the suite taps this bus and measures the
       actual signal rather than re-implementing the sounds against a mock.
       `limiter` is the last node before destination — measure there, not at
       `master`, or the stress test reads pre-limiting peaks and proves nothing. */
    _bus: () => { const c = ensure(); return c ? { ctx: c, master, limiter } : null; }
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
      sfx.questClear();
      toast(st.n > 1
        ? `QUEST CLEAR — +${xp} EXP (🔥${st.n}${st.weekly ? "w" : "d"} +${sBonus})`
        : `QUEST CLEAR — +${xp} EXP`);
      if (masteryFromClears(lifetimeClears(q) - 1).name !== mastery.name){
        sfx.masteryUp();
        setTimeout(() => toast(`QUEST RANK UP — ${q.name} reaches ${mastery.name}-RANK`), 1700);
      }
      if (!wasSatisfied && weekSatisfied(q, dateKey)){
        sfx.weekGoal();
        sysAlert(`Weekly goal met — ${q.name} (${freqOf(q)}/${freqOf(q)}). Gate exempt for the rest of the week.`);
      }
      if (!wasAll && allDone(t)){
        led._perfect = PERFECT_XP; grantXP(PERFECT_XP);
        sfx.perfectDay(); particles();
        setTimeout(() => toast(`ALL GATES CLEARED — +${PERFECT_XP} BONUS EXP`), 900);
      }
      const raidNow = currentRaid();
      if (raidNow && raidNow.killed && !(raidBefore && raidBefore.killed)){
        sfx.bossSlain(); particles();
        sysAlert(`GATE BOSS SLAIN — ${raidNow.boss} falls! ${raidNow.rune.name} acquired.`);
      }
    } else if (wasDone && !nowDone){
      buzz(8); sfx.uncheck();
      if (led[q.id]){ revokeXP(led[q.id]); delete led[q.id]; }
      if (led._perfect && !allDone(t)){ revokeXP(led._perfect); delete led._perfect; }
    } else if (value > 0){
      sfx.partial();
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
      sfx.sideClear(); toast(`SIDE QUEST CLEAR — +${xp} EXP`);
    } else {
      sfx.partial();
    }
  } else {
    buzz(8); sfx.uncheck();
    const doneToday = td.doneOn === t;
    td.done = false; td.doneOn = null;
    // refund only same-day completions — retro edits never change EXP
    if (doneToday && led[key]){ revokeXP(led[key]); delete led[key]; td.rewardedOn = null; }
  }
  checkTitles(false); checkLevelUp(); save(); renderAll();
}

