"use strict";
/* ================= cross-device sync via private GitHub Gist =================
   The save travels as a single JSON file in a private gist. Each device holds
   its own fine-grained token (Gists read/write only) in localStorage; the token
   is never synced. Merging is collection-union — never last-write-wins — so a
   split-brain day across two devices loses nothing.                          */

const SYNC_TOKEN_KEY = "arise-sync-token";
const SYNC_GIST_KEY  = "arise-sync-gist";
const SYNC_DEV_KEY   = "arise-device-id";
const SYNC_STAMP_KEY = "arise-sync-stamp";      // when this device last changed state
const GIST_DESC = "ARISE habit tracker save (sync)";
const GIST_FILE = "arise-save.json";
const GH_API = "https://api.github.com";

if (!localStorage.getItem(SYNC_DEV_KEY)) localStorage.setItem(SYNC_DEV_KEY, uid());
const syncToken = () => localStorage.getItem(SYNC_TOKEN_KEY);
const syncGist  = () => localStorage.getItem(SYNC_GIST_KEY);

let syncStatus = "off";          // off | syncing | ok | error
let syncReady = false;           // a pull (or gist creation) succeeded — only then is pushing safe
let syncBusy = false, pushTimer = null, lastSyncAt = null;

function setSyncStatus(s){
  syncStatus = s;
  const btn = document.getElementById("syncBtn");
  btn.classList.toggle("spin", s === "syncing");
  btn.classList.toggle("err", s === "error");
  btn.textContent = s === "off" ? "○" : s === "syncing" ? "↻" : s === "error" ? "⚠" : "✓";
  btn.title = s === "off" ? "Sync not connected — tap to set up"
    : s === "syncing" ? "Syncing…"
    : s === "error" ? "Sync error — will retry; tap for details"
    : "Synced" + (lastSyncAt ? " · " + lastSyncAt.toLocaleTimeString() : "");
}

const gh = (path, opts = {}) => fetch(GH_API + path, Object.assign({}, opts, {
  headers: Object.assign({
    "Authorization": "Bearer " + syncToken(),
    "Accept": "application/vnd.github+json"
  }, opts.headers || {})
}));

const syncPayload = () => JSON.stringify({
  savedAt: new Date().toISOString(),
  device: localStorage.getItem(SYNC_DEV_KEY),
  state
}, null, 1);

/* ---- merge: collections union, scalars from the newer side ---- */
function mergeStates(local, remote, localStamp, remoteStamp){
  const localNewer = String(localStamp || "") >= String(remoteStamp || "");
  const N = localNewer ? local : remote;          // newer side (wins scalars + ordering)
  const O = localNewer ? remote : local;          // older side (its history still merges in)
  const m = JSON.parse(JSON.stringify(N));

  m.meta.deleted = Object.assign({}, (O.meta && O.meta.deleted) || {}, m.meta.deleted || {});

  const oldQ = new Map((O.quests || []).map(q => [q.id, q]));
  m.quests.forEach(q => {
    const o = oldQ.get(q.id);
    if (!o) return;
    for (const k of Object.keys(o.log || {}))     // logs: union, larger amount wins a date
      if (!(k in q.log) || o.log[k] > q.log[k]) q.log[k] = o.log[k];
    if (o.createdAt < q.createdAt) q.createdAt = o.createdAt;
    oldQ.delete(q.id);
  });
  for (const o of oldQ.values()) m.quests.push(JSON.parse(JSON.stringify(o)));

  const haveT = new Set(m.todos.map(t => t.id));
  (O.todos || []).forEach(t => { if (!haveT.has(t.id)) m.todos.push(JSON.parse(JSON.stringify(t))); });

  m.quests = m.quests.filter(q => !m.meta.deleted[q.id]);
  m.todos  = m.todos.filter(t => !m.meta.deleted[t.id]);

  const oP = O.player || {};
  m.player.exp = Math.max(m.player.exp || 0, oP.exp || 0);   // rare split-brain undercount beats double-counting
  m.player.seenLevel = Math.max(m.player.seenLevel || 1, oP.seenLevel || 1);
  m.player.titles = [...new Set([...(m.player.titles || []), ...(oP.titles || [])])];

  const oL = (O.meta && O.meta.xpLedger) || {};
  for (const day of Object.keys(oL)){
    const dst = (m.meta.xpLedger[day] = m.meta.xpLedger[day] || {});
    for (const k of Object.keys(oL[day]))
      if (!(k in dst) || oL[day][k] > dst[k]) dst[k] = oL[day][k];
  }
  return m;
}

/* ---- engine ---- */
async function findOrCreateGist(){
  const list = await gh("/gists?per_page=100");
  if (!list.ok) throw new Error("token rejected (" + list.status + ")");
  const hit = (await list.json()).find(g => g.description === GIST_DESC);
  if (hit){ localStorage.setItem(SYNC_GIST_KEY, hit.id); return hit.id; }
  const made = await gh("/gists", {
    method: "POST",
    body: JSON.stringify({ description: GIST_DESC, public: false, files: { [GIST_FILE]: { content: syncPayload() } } })
  });
  if (!made.ok) throw new Error("could not create gist (" + made.status + ")");
  const g = await made.json();
  localStorage.setItem(SYNC_GIST_KEY, g.id);
  syncReady = true;                                // we authored the remote — nothing older to pull
  return g.id;
}

async function syncPull(){
  if (!syncToken() || !syncGist() || syncBusy) return;
  syncBusy = true; setSyncStatus("syncing");
  try{
    const res = await gh("/gists/" + syncGist());
    if (!res.ok) throw new Error("pull failed (" + res.status + ")");
    const g = await res.json();
    const f = g.files && g.files[GIST_FILE];
    if (!f) throw new Error("save file missing from gist");
    const content = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
    const remote = JSON.parse(content);
    if (!remote || !remote.state || remote.state.version !== 2) throw new Error("remote save unreadable");
    const localJSON = JSON.stringify(state);
    const remoteJSON = JSON.stringify(remote.state);
    const merged = mergeStates(state, normalize(remote.state),
      localStorage.getItem(SYNC_STAMP_KEY) || "", remote.savedAt || "");
    syncReady = true;
    const mergedJSON = JSON.stringify(merged);
    if (mergedJSON !== localJSON){
      state = normalize(merged);
      save();                                      // wrapped: persists + queues a push-back
      renderAll();
    } else if (mergedJSON !== remoteJSON){
      queuePush();                                 // local already has extras the remote lacks
    }
    lastSyncAt = new Date(); setSyncStatus("ok");
  }catch(e){
    setSyncStatus("error");
  }finally{
    syncBusy = false;
  }
}

async function syncPush(){
  if (!syncToken() || !syncGist() || !syncReady) return;   // never clobber remote before first merge
  if (syncBusy){ queuePush(); return; }
  syncBusy = true; setSyncStatus("syncing");
  try{
    const res = await gh("/gists/" + syncGist(), {
      method: "PATCH",
      body: JSON.stringify({ files: { [GIST_FILE]: { content: syncPayload() } } })
    });
    if (!res.ok) throw new Error("push failed (" + res.status + ")");
    lastSyncAt = new Date(); setSyncStatus("ok");
  }catch(e){
    setSyncStatus("error");
  }finally{
    syncBusy = false;
  }
}

function queuePush(){
  if (!syncToken() || !syncGist()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncPush, 2500);
}

/* every save stamps this device's change time and schedules a push */
const _appSave = save;
save = function(){
  _appSave();
  localStorage.setItem(SYNC_STAMP_KEY, new Date().toISOString());
  queuePush();
};

/* ---- sync sheet ---- */
const syncOverlay = document.getElementById("syncOverlay");
function openSyncSheet(){
  const connected = !!syncToken();
  document.getElementById("syncTokenInput").value = "";
  document.getElementById("syncConnectBtn").textContent = connected ? "RECONNECT" : "CONNECT";
  document.getElementById("syncDisconnectBtn").hidden = !connected;
  document.getElementById("syncInfo").textContent = connected
    ? `Connected — private gist ${String(syncGist() || "").slice(0, 8)}…` +
      (lastSyncAt ? ` · last sync ${lastSyncAt.toLocaleTimeString()}` : "") +
      (syncStatus === "error" ? " · last attempt failed, will retry" : "")
    : "Not connected — this device keeps its own save until you link it.";
  syncOverlay.classList.add("open");
}
document.getElementById("syncBtn").onclick = openSyncSheet;
document.getElementById("syncClose").onclick = () => syncOverlay.classList.remove("open");
syncOverlay.addEventListener("click", e => { if (e.target === syncOverlay) syncOverlay.classList.remove("open"); });

document.getElementById("syncConnectBtn").onclick = async () => {
  const tok = document.getElementById("syncTokenInput").value.trim();
  if (!tok){ document.getElementById("syncTokenInput").focus(); return; }
  localStorage.setItem(SYNC_TOKEN_KEY, tok);
  setSyncStatus("syncing");
  try{
    await findOrCreateGist();
    await syncPull();
    if (syncStatus === "error") throw new Error("sync failed");
    syncOverlay.classList.remove("open");
    toast("SYNC LINKED — your save now travels with you.");
  }catch(e){
    localStorage.removeItem(SYNC_TOKEN_KEY);
    localStorage.removeItem(SYNC_GIST_KEY);
    syncReady = false;
    setSyncStatus("off");
    sysAlert("Sync setup failed — check the token has Gists read & write permission.");
  }
};
document.getElementById("syncDisconnectBtn").onclick = () => {
  localStorage.removeItem(SYNC_TOKEN_KEY);
  localStorage.removeItem(SYNC_GIST_KEY);
  syncReady = false;
  setSyncStatus("off");
  syncOverlay.classList.remove("open");
  toast("SYNC DISCONNECTED — this device is on its own save.");
};

/* ---- triggers ---- */
document.addEventListener("visibilitychange", () => { if (!document.hidden) syncPull(); });
setSyncStatus(syncToken() ? "syncing" : "off");
if (syncToken()){
  (syncGist() ? Promise.resolve() : findOrCreateGist())
    .then(() => syncPull())
    .catch(() => setSyncStatus("error"));
}
