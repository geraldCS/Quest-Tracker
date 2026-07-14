"use strict";
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
  tl.disabled = false;   // gallery is always browsable, even with zero titles
  tl.textContent = state.player.title ? `« ${titleName(state.player.title)} »`
    : state.player.titles.length ? "« Select a title »" : "— No Title —";
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
  renderRadar();
}

/* ================= stat radar (collapsible pentagon) ================= */
function renderRadar(){
  const open = state.player.radarOpen !== false;
  const wrap = document.getElementById("radarWrap");
  const tog = document.getElementById("radarToggle");
  wrap.classList.toggle("open", open);
  tog.setAttribute("aria-expanded", open);
  tog.querySelector(".chev").textContent = open ? "▾" : "▸";
  if (!open) return;
  const pts = statPoints();
  const max = Math.max(10, ...STAT_ORDER.map(s => pts[s]));
  const cx = 120, cy = 104, R = 74;
  const ang = i => -Math.PI/2 + i * 2*Math.PI/5;
  const px = (i,r) => (cx + r*Math.cos(ang(i))).toFixed(1);
  const py = (i,r) => (cy + r*Math.sin(ang(i))).toFixed(1);
  const ringPts = f => STAT_ORDER.map((_,i) => `${px(i,R*f)},${py(i,R*f)}`).join(" ");
  const poly = STAT_ORDER.map((s,i) => `${px(i, R*(pts[s]/max))},${py(i, R*(pts[s]/max))}`).join(" ");
  document.getElementById("radarSvg").innerHTML =
    [0.25, 0.5, 0.75, 1].map(f => `<polygon points="${ringPts(f)}" class="radar-ring"/>`).join("") +
    STAT_ORDER.map((_,i) => `<line x1="${cx}" y1="${cy}" x2="${px(i,R)}" y2="${py(i,R)}" class="radar-axis"/>`).join("") +
    `<polygon points="${poly}" class="radar-poly"/>` +
    STAT_ORDER.map((s,i) => `<circle cx="${px(i, R*(pts[s]/max))}" cy="${py(i, R*(pts[s]/max))}" r="3" fill="${STATS[s].color}"/>`).join("") +
    STAT_ORDER.map((s,i) => {
      const lx = +px(i, R+17) - 8, ly = +py(i, R+17) - 8;
      return `<g style="color:${STATS[s].color}" transform="translate(${lx},${ly})">` +
             STAT_ICONS[s].replace("<svg ", `<svg width="16" height="16" `) +
             `<title>${STATS[s].label}: ${pts[s]}</title></g>`;
    }).join("");
}
document.getElementById("radarToggle").onclick = () => {
  state.player.radarOpen = state.player.radarOpen === false;   // flip
  save(); renderRadar();
};

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
    listEl.classList.add("drag-live");   // kill entrance animations so inline transforms always win
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
    const clearLive = () => listEl.classList.remove("drag-live");
    setTimeout(clearLive, 250);                   // after the FLIP settle finishes
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
      void row.offsetHeight;                    // commit start position now (rAF can be throttled in background tabs)
      row.style.transition = "transform .18s ease";
      row.style.transform = "";
      setTimeout(() => { row.style.transition = ""; }, 220);
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

/* ================= records: year heatmap + view toggle ================= */
let recView = localStorage.getItem("arise-records-view") || "month";
function applyRecView(){
  document.querySelectorAll("#tab-records .seg").forEach(b => b.classList.toggle("active", b.dataset.rview === recView));
  document.getElementById("recMonth").hidden = recView !== "month";
  document.getElementById("recYear").hidden = recView !== "year";
}
document.querySelectorAll("#tab-records .seg").forEach(b => {
  b.onclick = () => { recView = b.dataset.rview; localStorage.setItem("arise-records-view", recView); applyRecView(); };
});
applyRecView();

function renderYear(){
  const el = document.getElementById("yearGrid");
  const today = new Date(); today.setHours(0,0,0,0);
  const first = addDays(today, -364);
  const start = mondayOf(first);
  const weeks = [];
  for (let d = new Date(start); d <= today; d = addDays(d, 7)) weeks.push(new Date(d));
  let labels = "", cols = "";
  let prevMonth = -1;
  for (const w of weeks){
    const m = w.getMonth();
    labels += `<span>${m !== prevMonth ? w.toLocaleDateString(undefined,{month:"short"}).toUpperCase() : ""}</span>`;
    prevMonth = m;
    let col = "";
    for (let i = 0; i < 7; i++){
      const d = addDays(w, i);
      if (d > today || d < first){ col += `<i class="yg-cell off"></i>`; continue; }
      const key = fmt(d);
      const existing = state.quests.filter(q => parseD(q.createdAt) <= d);
      const done = existing.filter(q => isDone(q, key)).length;
      const frac = existing.length ? done / existing.length : 0;
      const idx = !existing.length || frac === 0 ? 0 : frac < .34 ? 1 : frac < .67 ? 2 : frac < 1 ? 3 : 4;
      col += `<i class="yg-cell" style="background:${HEAT[idx]}" title="${key} — ${done}/${existing.length} cleared"></i>`;
    }
    cols += `<div class="yg-col">${col}</div>`;
  }
  el.innerHTML = `<div class="yg-labels">${labels}</div><div class="yg-cols">${cols}</div>`;
}

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
function openGallery(){
  const wrap = document.getElementById("titleOpts");
  wrap.innerHTML = "";
  const sub = document.createElement("div");
  sub.className = "gal-sub";
  sub.textContent = `TITLES — ${state.player.titles.length}/${TITLES.length} UNLOCKED`;
  wrap.appendChild(sub);
  TITLES.forEach(t => {
    const unlocked = state.player.titles.includes(t.id);
    const worn = state.player.title === t.id;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "title-opt" + (worn ? " sel" : "") + (unlocked ? "" : " title-locked");
    b.innerHTML = unlocked
      ? `<span class="t-name">« ${t.name} »</span><span class="t-desc">${t.desc}</span>${worn ? `<span class="t-worn">EQUIPPED</span>` : ""}`
      : `<span class="t-name">🔒 ???</span><span class="t-desc">${t.desc}</span>`;
    if (unlocked) b.onclick = () => { state.player.title = t.id; save(); renderHeader(); openGallery(); };
    wrap.appendChild(b);
  });
  const runes = runesEarned(), dormant = runesDormant();
  const rSub = document.createElement("div");
  rSub.className = "gal-sub";
  rSub.textContent = `RUNES — ${runes.length} CLAIMED${runes.length && dormant ? " · DORMANT" : ""}`;
  wrap.appendChild(rSub);
  const grid = document.createElement("div");
  grid.className = "rune-grid";
  if (!runes.length){
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">Slay a weekly gate boss to claim your first rune.</div>`;
  } else {
    runes.slice(-24).reverse().forEach(r => {
      const cell = document.createElement("div");
      cell.className = "rune-cell" + (dormant ? " dormant" : "");
      cell.style.color = STATS[r.rune.stat].color;
      cell.title = `${r.rune.name} — week of ${r.mondayKey}`;
      cell.innerHTML = `${STAT_ICONS[r.rune.stat]}<span>${r.rune.name.replace("Rune of ","")}</span>`;
      grid.appendChild(cell);
    });
  }
  wrap.appendChild(grid);
  titleOverlay.classList.add("open");
}
document.getElementById("titleLine").onclick = openGallery;
titleOverlay.addEventListener("click", e => { if (e.target === titleOverlay) titleOverlay.classList.remove("open"); });

/* ================= shared sheet UX (close, focus return, scroll fade) ================= */
const closeOverlay = ov => { if (ov) ov.click(); };   // reuse each overlay's own backdrop-close cleanup
document.addEventListener("click", e => {
  const x = e.target.closest(".sheet-x");
  if (x) closeOverlay(x.closest(".overlay"));
});
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const open = [...document.querySelectorAll(".overlay.open")].pop();
  if (open && open.id !== "nameOverlay") closeOverlay(open);   // registration can't be dismissed
});
function updateSheetFade(ov){
  const body = ov.querySelector(".sheet-body");
  if (!body) return;
  body.classList.toggle("can-scroll", body.scrollHeight - body.scrollTop - body.clientHeight > 6);
}
const sheetFocusMemo = new Map();
const overlayObserver = new MutationObserver(muts => {
  muts.forEach(m => {
    const ov = m.target;
    const isOpen = ov.classList.contains("open");
    const wasOpen = (m.oldValue || "").split(" ").includes("open");
    if (isOpen && !wasOpen){
      sheetFocusMemo.set(ov, document.activeElement);
      updateSheetFade(ov);
      setTimeout(() => updateSheetFade(ov), 320);   // re-check after the materialize animation
    } else if (!isOpen && wasOpen){
      const el = sheetFocusMemo.get(ov);
      sheetFocusMemo.delete(ov);
      if (el && el.isConnected){ try{ el.focus({preventScroll:true}); }catch(_){} }
    }
  });
});
document.querySelectorAll(".overlay").forEach(ov => {
  overlayObserver.observe(ov, {attributes:true, attributeFilter:["class"], attributeOldValue:true});
  const body = ov.querySelector(".sheet-body");
  if (body) body.addEventListener("scroll", () => updateSheetFade(ov), {passive:true});
});

/* ================= mute ================= */
document.getElementById("muteBtn").onclick = () => {
  state.player.muted = !state.player.muted;
  save(); renderHeader();
};

/* ================= settings hub ================= */
const settingsOverlay = document.getElementById("settingsOverlay");
function openSettings(){
  document.getElementById("setName").textContent = state.player.name || "HUNTER";
  document.getElementById("setSyncStatus").textContent =
    localStorage.getItem("arise-sync-token") ? "Connected — gist backup active" : "Not connected";
  settingsOverlay.classList.add("open");
}
document.getElementById("settingsBtn").onclick = openSettings;
settingsOverlay.addEventListener("click", e => { if (e.target === settingsOverlay) settingsOverlay.classList.remove("open"); });
document.getElementById("setRename").onclick = () => { settingsOverlay.classList.remove("open"); openNameSheet(); };
document.getElementById("setOpenSync").onclick = () => { settingsOverlay.classList.remove("open"); openSyncSheet(); };
document.getElementById("resetBtn").onclick = () => {
  if (!confirm("Reset ALL data on this device?")) return;
  if (!confirm("Really? Quests, history, EXP — everything will be wiped.")) return;
  localStorage.removeItem(V2_KEY);
  location.reload();
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
