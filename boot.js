"use strict";

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
  renderYear();
  if (dayEditorDate) renderDayEditor();
}
checkTitles(true);       // unlock silently for migrated history — no toast spam on load
save();
renderAll();
if (!state.player.name) openNameSheet();
systemTick();

/* ================= PWA (no-op on file:// and on localhost dev) ================= */
if ("serviceWorker" in navigator && location.protocol !== "file:" && location.hostname !== "localhost"){
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
