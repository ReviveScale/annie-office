/* Annie Office job desk. Talks to one webhook: board, update, create, reset, ask. */
(function(){
"use strict";
var API = (window.AO_API || "https://n8n.revivescale.com/webhook/annie-office");
var KEY = "ao-7Hn3qW9x";
var STAGES = ["Accepted","Make safe","Assess","Works","Drying","Complete","Invoiced","Paid"];
var SHORT = {"Accepted":"New","Make safe":"Safe","Assess":"Assess","Works":"Works","Drying":"Dry","Complete":"Done","Invoiced":"Billed","Paid":"Paid"};
var CLIENTS = ["Rizon Building","Coastal Builders Group","Northside Strata Management","Apex Rapid Plumbing","Direct"];
var EVENTS = ["Water damage","Burst pipe / leak","Storm / roof leak","Flood","Sewage","Mould","Fire / smoke","Other"];
var SAMPLES = [
  {customer:"Hannah Cole",phone:"0491 570 156",address:"8 Ocean St, Bondi NSW 2026",event:"Burst pipe / leak",urgency:"Emergency",client:"Apex Rapid Plumbing",no:"AP-3318",instructions:"Burst flexi hose under the kitchen sink. Water through kitchen and into the dining room. Plumber has isolated the supply."},
  {customer:"Marcus Webb",phone:"0491 570 313",address:"27 King St, Newtown NSW 2042",event:"Storm / roof leak",urgency:"Standard",client:"Rizon Building",no:"725411",instructions:"Water through the hallway ceiling after last night's storm. Roofer booked by the builder. Make safe and assess."},
  {customer:"Sofia Russo",phone:"0491 570 737",address:"Unit 12/5 Bay Rd, Waverton NSW 2060",event:"Mould",urgency:"Standard",client:"Northside Strata Management",no:"NS-2304",instructions:"Mould across the bedroom ceiling. Strata wants an assessment report and a quote before any works."}
];
var SUGS = {
  base:["What needs chasing?","What's on today?","Liam's done final readings at Priya Nair's, all 10 points dry. Pull the gear out.","Alana Brooks is finished. Invoice it.","Who owes us money?"],
  Accepted:["Liam's on site, make safe done. Tarp's on and photos are in."],
  "Make safe":["Make safe report is done and sent to the builder."],
  Assess:["Assessment's done. Write the report, do the quote and book Jess in Monday 9am."],
  Works:["Strip-out's finished, drying starts tomorrow."],
  Drying:["Final readings are all dry. Pull the gear out."],
  Complete:["Invoice this job."],
  Invoiced:["They've paid. Mark it as paid."]
};
var IC = {
  overview:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
  jobs:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/></svg>',
  money:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v5M17.5 9.5v5"/></svg>',
  schedule:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  activity:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg>'
};
var NAV = [["overview","Overview"],["jobs","Job board"],["schedule","Schedule"],["money","Money"],["activity","Activity"]];

var S = { jobs:[], session:null, loaded:false, err:false, view:"overview", jobId:null, feed:[], seen:{}, ids:{}, pending:{}, asking:false, q:"", tech:"All", hint:null, flash:{}, lastOk:0, notes:{} };

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function money(n){ n = Number(n) || 0; return "$" + n.toLocaleString("en-AU", {maximumFractionDigits:0}); }
function ago(t){
  var d = (Date.now() - new Date(t).getTime()) / 1000;
  if (!isFinite(d)) return "";
  if (d < 45) return "just now";
  if (d < 3600) return Math.round(d/60) + " min ago";
  if (d < 86400) return Math.round(d/3600) + " h ago";
  var days = Math.round(d/86400);
  return days === 1 ? "yesterday" : days + " days ago";
}
function fmtPhone(p){ p = String(p || ""); var m = p.replace(/\s/g, "").match(/^\+61(4\d{2})(\d{3})(\d{3})$/); return m ? "0" + m[1] + " " + m[2] + " " + m[3] : p; }
function first(n){ return String(n || "").split(" ")[0]; }
function byKind(by){ by = String(by || ""); if (/inbox|email/i.test(by)) return "em"; if (/whatsapp/i.test(by)) return "wa"; if (/annie/i.test(by)) return "an"; if (/system/i.test(by)) return "sys"; return "of"; }
function byLabel(by){ var k = byKind(by); return k === "em" ? "Annie, from the job inbox" : k === "wa" ? "Annie on WhatsApp" : k === "an" ? "Annie" : k === "sys" ? "Job desk" : (by || "Office"); }
function toast(t){ var e = $("toast"); e.textContent = t; e.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(function(){ e.classList.remove("on"); }, 3200); }

function api(body, ms){
  body.key = KEY;
  var ctl = window.AbortController ? new AbortController() : null;
  var tm = ctl ? setTimeout(function(){ ctl.abort(); }, ms || 20000) : null;
  return fetch(API, { method:"POST", headers:{"Content-Type":"text/plain;charset=UTF-8"}, body:JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
    .then(function(r){ if (!r.ok) throw new Error("http " + r.status); return r.text(); })
    .then(function(t){ var j; try { j = JSON.parse(t); } catch (e) { throw new Error("bad reply"); } if (j && j.ok === false) throw new Error(j.error || "failed"); return j; })
    .finally(function(){ if (tm) clearTimeout(tm); });
}

/* ---------- board sync ---------- */
function job(id){ for (var i = 0; i < S.jobs.length; i++) if (S.jobs[i].id === id) return S.jobs[i]; return null; }
function applyPatch(j, p){
  if (p.stage) j.stage = p.stage;
  if (p.fields) Object.keys(p.fields).forEach(function(k){ j[k] = p.fields[k]; });
  if (p.value != null) j.value = p.value;
  if (p.log) { j.data = j.data || {}; j.data.log = [p.log].concat((j.data.log || []).filter(function(l){ return l.x !== p.log.x; })); }
}
function ingest(r, quiet){
  var now = Date.now();
  var jobs = (r.jobs || []).map(function(j){
    j.data = j.data || {};
    var p = S.pending[j.id];
    if (p) {
      var hasLog = !p.log || (j.data.log || []).some(function(l){ return l.x === p.log.x; });
      var caught = (!p.stage || j.stage === p.stage) && hasLog;
      if (caught || now > p.until) delete S.pending[j.id];
      else applyPatch(j, p);
    }
    return j;
  });
  var first = !S.loaded;
  var fresh = [];
  jobs.forEach(function(j){
    if (!S.ids[j.id] && !first) S.flash[j.id] = now;
    S.ids[j.id] = 1;
    (j.data.log || []).forEach(function(l){
      var k = j.id + "|" + l.t + "|" + l.x;
      if (S.seen[k]) return;
      S.seen[k] = 1;
      var e = { t:l.t, x:l.x, by:l.by, id:j.id, who:j.customer };
      if (first) S.feed.push(e);
      else { fresh.push(e); S.flash[j.id] = now; }
    });
  });
  if (first) S.feed.sort(function(a,b){ return new Date(b.t) - new Date(a.t); });
  fresh.sort(function(a,b){ return new Date(a.t) - new Date(b.t); });
  fresh.forEach(function(e){ e.isNew = true; if (!e.who) { var jj = jobs.filter(function(x){ return x.id === e.id; })[0]; e.who = jj ? jj.customer : ""; } S.feed.unshift(e); });
  S.feed = S.feed.slice(0, 80);
  if (S.session !== null && r.session !== S.session) { resetChat("Fresh demo session started. I've cleared my notes from the last one."); }
  S.session = r.session;
  S.jobs = jobs;
  S.loaded = true; S.err = false; S.lastOk = now;
  setTimeout(function(){ scanDocs(first); }, 50);
  conn();
  if (!quiet && fresh.length) {
    var ext = fresh.filter(function(e){ return byKind(e.by) === "wa" || byKind(e.by) === "em" || (byKind(e.by) === "an" && !S.asking); });
    if (ext.length) { var le = ext[ext.length-1]; if (byKind(le.by) === "em" && /New job created/.test(le.x)) { toast("📥 New job from the job inbox: " + le.who); } else toast(byLabel(le.by) + ": " + le.x); }
  }
  return fresh.length;
}
var polling = null, inflight = null;
function refresh(quiet, force){
  if (inflight) return force ? inflight.then(function(){ return refresh(quiet); }) : inflight;
  inflight = api({ action:"board" }, 20000).then(function(r){ var n = ingest(r, quiet); render(n > 0); })
    .catch(function(){ S.err = true; conn(); if (!S.loaded) $("view").innerHTML = '<div class="card"><p class="empty">Couldn\'t reach the job board. Check the connection, then <button class="sm" type="button" data-act="retry">Try again</button></p></div>'; })
    .finally(function(){ inflight = null; });
  return inflight;
}
function schedule(){
  clearTimeout(polling);
  polling = setTimeout(function(){ if (!document.hidden) refresh().finally(schedule); else schedule(); }, S.asking ? 3000 : 7000);
}
function conn(){
  [["conn","connTxt"],["conn2","connTxt2"]].forEach(function(p){
    var c = $(p[0]), t = $(p[1]); if (!c) return;
    c.className = "conn " + (S.err ? "bad" : S.loaded ? "ok" : "");
    t.textContent = S.err ? "Reconnecting…" : S.loaded ? "Live · session " + S.session : "Connecting…";
  });
}

/* ---------- writes ---------- */
function update(id, patch, okMsg){
  var j = job(id); if (!j) return Promise.resolve();
  var now = Date.now();
  var line = patch.log || (patch.stage && patch.stage !== j.stage ? "Moved to " + patch.stage + "." : "");
  var p = { stage:patch.stage, fields:patch.fields, value:patch.value, at:now - 1500, until:now + 25000, log: line ? { t:new Date().toISOString(), x:line, by:"Office" } : null };
  S.pending[id] = p;
  applyPatch(j, p);
  if (p.log) { var k = id + "|" + p.log.t + "|" + p.log.x; S.seen[k] = 1; S.feed.unshift({ t:p.log.t, x:p.log.x, by:"Office", id:id, who:j.customer, isNew:true }); }
  S.flash[id] = now;
  render(true);
  return api({ action:"update", id:id, stage:patch.stage || "", fields:patch.fields || {}, log:line, value:patch.value, by:"Office" }, 20000)
    .then(function(){ if (okMsg) toast(okMsg); })
    .catch(function(){ delete S.pending[id]; toast("That didn't save. Try again in a moment."); refresh(true); });
}
function nextStage(s){ var i = STAGES.indexOf(s); return i >= 0 && i < STAGES.length - 1 ? STAGES[i+1] : null; }
function moveTo(id, st){
  var j = job(id); if (!j || !st || st === j.stage) return;
  var f = {};
  if (st === "Paid") { f.invoice = "Paid " + new Date().toLocaleDateString("en-AU",{day:"numeric",month:"short"}); f.next = "Nothing. Job closed."; f.who = "Admin"; }
  return update(id, { stage:st, fields:f }, j.customer + " moved to " + st);
}

/* ---------- views ---------- */
function stats(){
  var live = S.jobs.filter(function(j){ return j.stage !== "Paid"; });
  var emg = S.jobs.filter(function(j){ return j.data.urgency === "Emergency" && (j.stage === "Accepted" || j.stage === "Make safe"); });
  var ready = S.jobs.filter(function(j){ return j.stage === "Complete"; });
  var owed = S.jobs.filter(function(j){ return j.stage === "Invoiced"; });
  var sum = function(a){ return a.reduce(function(s,j){ return s + (Number(j.value)||0); }, 0); };
  return { live:live, emg:emg, ready:ready, owed:owed, readyV:sum(ready), owedV:sum(owed), pipeV:sum(live.filter(function(j){ return j.stage !== "Invoiced"; })) };
}
function nav(){
  var st = stats();
  var cnt = { overview: st.emg.length, money: st.ready.length };
  var h = NAV.map(function(n){ return '<button type="button" data-go="' + n[0] + '"' + (S.view === n[0] || (S.view === "job" && n[0] === "jobs") ? ' aria-current="page"' : "") + ' aria-label="' + n[1] + '">' + IC[n[0]] + '<span class="lbl">' + n[1] + "</span>" + (cnt[n[0]] ? '<span class="cnt">' + cnt[n[0]] + "</span>" : "") + "</button>"; }).join("");
  $("nav").innerHTML = h;
  $("tabs").innerHTML = NAV.map(function(n){ return '<button type="button" data-go="' + n[0] + '"' + (S.view === n[0] || (S.view === "job" && n[0] === "jobs") ? ' aria-current="page"' : "") + ">" + IC[n[0]] + "<span>" + n[1].replace("Job board","Jobs").replace("Schedule","Diary") + "</span></button>"; }).join("");
}
function pillsFor(j){
  var p = [];
  if (j.data.urgency === "Emergency") p.push('<span class="pill amb">Emergency</span>');
  p.push('<span class="pill">' + esc(j.type || j.data.event || "Job") + "</span>");
  if (j.stage === "Complete" && /^not/i.test(j.invoice || "")) p.push('<span class="pill grn">Ready to invoice</span>');
  if (j.stage === "Invoiced") p.push('<span class="pill cy">' + esc(/^draft/i.test(j.invoice) ? "Draft invoice" : "Awaiting payment") + "</span>");
  return p.join("");
}
function evRow(e){
  var k = byKind(e.by);
  var ic = k === "em" ? '<span class="ic em">✉</span>' : k === "an" ? '<span class="ic an">A</span>' : k === "wa" ? '<span class="ic wa">WA</span>' : k === "sys" ? '<span class="ic">•</span>' : '<span class="ic">' + esc(String(e.by || "O").charAt(0).toUpperCase()) + "</span>";
  return '<div class="ev' + (e.isNew ? " new" : "") + '">' + ic + '<div><div class="x"><b>' + esc(e.who || "") + "</b> · " + esc(e.x) + '</div><div class="m">' + esc(byLabel(e.by)) + " · " + esc(ago(e.t)) + "</div></div></div>";
}
function vOverview(){
  var st = stats();
  var needs = S.jobs.filter(function(j){ return j.stage !== "Paid" && (j.who === "Admin" || st.emg.indexOf(j) >= 0 || /overdue|waiting on/i.test(j.next || "")); })
    .sort(function(a,b){ return (b.data.urgency === "Emergency") - (a.data.urgency === "Emergency"); });
  var max = 1, per = STAGES.map(function(s){ var a = S.jobs.filter(function(j){ return j.stage === s; }); max = Math.max(max, a.length); return { s:s, n:a.length, v:a.reduce(function(t,j){ return t + (Number(j.value)||0); }, 0) }; });
  var hr = new Date().getHours(), hi = hr < 12 ? "Morning" : hr < 17 ? "Afternoon" : "Evening";
  return '<div class="head"><div><h1>' + hi + ', ABC Restoration</h1><p>' + st.live.length + " live jobs · " + money(st.pipeV) + " in work</p></div>" +
    '<div class="acts"><button type="button" data-ask="What needs doing today?">Ask Annie what\'s on today</button><button class="primary" type="button" data-act="new">+ New job</button></div></div>' +
    '<div class="kpis">' +
      '<button class="kpi' + (st.emg.length ? " hot" : "") + '" type="button" data-go="jobs"><div class="n">' + st.emg.length + '</div><div class="l">Emergencies to attend</div></button>' +
      '<button class="kpi" type="button" data-go="jobs"><div class="n">' + st.live.length + '</div><div class="l">Live jobs</div></button>' +
      '<button class="kpi go" type="button" data-go="money"><div class="n">' + money(st.readyV) + '</div><div class="l">Ready to invoice (' + st.ready.length + ")</div></button>" +
      '<button class="kpi" type="button" data-go="money"><div class="n">' + money(st.owedV) + '</div><div class="l">Waiting on payment (' + st.owed.length + ")</div></button>" +
    "</div>" +
    '<div class="grid2"><div style="display:flex;flex-direction:column;gap:16px;min-width:0">' +
      '<section class="card"><h2>Needs you <small>Admin to act, and emergencies</small></h2><div class="rows">' +
        (needs.length ? needs.map(function(j){ return '<button class="r" type="button" data-job="' + j.id + '"><div class="g"><div class="t">' + esc(j.customer) + " · " + esc(j.suburb) + '</div><div class="s">' + esc(j.next || "") + "</div></div>" + pillsFor(j).split("</span>")[0] + "</span></button>"; }).join("") : '<p class="empty">Nothing waiting on the office. Nice.</p>') +
      "</div></section>" +
      '<section class="card"><h2>Jobs by stage <small>count and value</small></h2><div class="bars">' +
        per.map(function(p){ return '<div class="bar"><span>' + p.s + '</span><div class="tr"><div class="fi" style="width:' + Math.round(p.n / max * 100) + '%"></div></div><b>' + p.n + (p.v ? " · " + money(p.v).replace(/,\d{3}$/, "k") : "") + "</b></div>"; }).join("") +
      "</div></section></div>" +
      '<section class="card"><h2>Live activity <small>office, Annie and WhatsApp</small></h2><div class="feed">' + (S.feed.slice(0, 14).map(evRow).join("") || '<p class="empty">No activity yet.</p>') + "</div></section>" +
    "</div>";
}
function vJobs(){
  var q = S.q.toLowerCase();
  var list = S.jobs.filter(function(j){ return (S.tech === "All" || j.tech === S.tech) && (!q || (j.customer + " " + j.suburb + " " + j.type + " " + j.source + " " + j.ref).toLowerCase().indexOf(q) >= 0); });
  var techs = ["All"]; S.jobs.forEach(function(j){ if (j.tech && techs.indexOf(j.tech) < 0 && j.tech !== "Unassigned") techs.push(j.tech); });
  var now = Date.now();
  return '<div class="head"><div><h1>Job board</h1><p>' + (window.innerWidth > 900 ? "Drag a job to move it, or tell Annie what happened." : "Tap a job to open it, or tell Annie what happened.") + '</p></div><div class="acts"><button class="primary" type="button" data-act="new">+ New job</button></div></div>' +
    '<div class="toolbar"><input id="q" type="search" placeholder="Search name, suburb, job no" aria-label="Search jobs" value="' + esc(S.q) + '">' +
    techs.map(function(t){ return '<button class="sm' + (S.tech === t ? " primary" : "") + '" type="button" data-tech="' + esc(t) + '">' + esc(t === "All" ? "All techs" : t) + "</button>"; }).join("") + "</div>" +
    '<div class="board">' + STAGES.map(function(s){
      var a = list.filter(function(j){ return j.stage === s; });
      var v = a.reduce(function(t,j){ return t + (Number(j.value)||0); }, 0);
      return '<div class="col" data-stage="' + s + '"><h3><span style="color:var(--ink2);font-size:13px">' + s + "<em>" + (v ? money(v) : "&nbsp;") + "</em></span><span>" + a.length + "</span></h3>" +
        (a.map(function(j){
          var fl = S.flash[j.id] && now - S.flash[j.id] < 2500;
          var lb = j.data.log && j.data.log[0]; var recent = lb && (now - new Date(lb.t).getTime() < 120000) && byKind(lb.by) !== "sys";
          return '<button class="jc' + (j.data.urgency === "Emergency" && (s === "Accepted" || s === "Make safe") ? " emg" : "") + (fl ? " flash" : "") + (S.pending[j.id] ? " saving" : "") + '" type="button" draggable="true" data-job="' + j.id + '">' +
            (recent ? '<span class="by">' + (byKind(lb.by) === "wa" ? "WhatsApp" : byKind(lb.by) === "an" ? "Annie" : "Updated") + "</span>" : "") +
            '<span class="t">' + esc(j.customer) + '</span><span class="s">' + esc(j.suburb) + " · " + esc(j.source) + '</span><span class="s">' + esc(j.next || "") + '</span><span class="m">' + pillsFor(j) + (j.value ? '<span class="pill">' + money(j.value) + "</span>" : "") + "</span></button>";
        }).join("") || '<p class="empty" style="padding:8px 4px;font-size:12.5px">No jobs</p>') + "</div>";
    }).join("") + "</div>";
}
function vJob(){
  var j = job(S.jobId);
  if (!j) return '<div class="card"><p class="empty">That job isn\'t on the board any more.</p><button type="button" data-go="jobs">Back to the board</button></div>';
  var d = j.data, i = STAGES.indexOf(j.stage), nx = nextStage(j.stage);
  var sugs = (SUGS[j.stage] || []).concat(j.stage === "Complete" ? [] : []);
  var miss = String(j.missing || "").split(";").map(function(s){ return s.trim(); }).filter(Boolean);
  return '<button class="ghost sm back" type="button" data-go="jobs">← Job board</button>' +
    '<div class="jhead"><div><h1>' + esc(j.customer) + '</h1><p class="sub">' + esc((d.event || j.type) + " · " + j.suburb + " · " + (j.source || "")) + (j.ref ? " · Job " + esc(j.ref) : "") + "</p></div>" +
    '<div class="head acts" style="margin:0">' + pillsFor(j) + (j.value ? '<span class="pill">' + money(j.value) + "</span>" : "") + "</div></div>" +
    '<div class="steps" role="group" aria-label="Stage">' + STAGES.map(function(s, k){ return '<button type="button" class="' + (k < i ? "done" : k === i ? "cur" : "") + '" data-move="' + s + '" aria-label="Move to ' + s + '"' + (k === i ? ' aria-current="step"' : "") + '><span class="lg">' + s + '</span><span class="sm">' + SHORT[s] + "</span></button>"; }).join("") + "</div>" +
    '<div class="grid2"><div style="display:flex;flex-direction:column;gap:16px;min-width:0">' +
      '<div class="callout' + (miss.length ? " warn" : "") + '"><small>Next step · ' + esc(j.who || "Admin") + '</small><b>' + esc(j.next || "—") + "</b>" + (miss.length ? '<div style="margin-top:6px;font-size:13.5px;color:#fde68a">Missing: ' + esc(miss.join(", ")) + "</div>" : "") + "</div>" +
      '<section class="card"><h2>Job details</h2><div class="kv">' +
        kv("Address", d.address || j.suburb) + kv("Phone", fmtPhone(j.phone)) + kv("Technician", j.tech) + kv("Sent by", j.source) + kv("Claim no", d.claim || "—") + kv("Property", d.ptype || "—") + kv("Invoice", j.invoice || "—") + kv("Reports", j.report || "—") +
        '<div style="grid-column:1/-1"><small>Instructions</small><b style="font-weight:500">' + esc(d.instructions || "—") + "</b></div>" +
        (d.notes ? '<div style="grid-column:1/-1"><small>Notes</small><b style="font-weight:500">' + esc(d.notes) + "</b></div>" : "") +
      "</div>" +
      '<div class="quick">' + (nx ? '<button class="primary" type="button" data-move="' + nx + '">Move to ' + nx + "</button>" : "") +
        '<button type="button" data-focus="' + j.id + '">Ask Annie about this job</button>' +
        sugs.map(function(s){ return '<button class="ghost" type="button" data-ask="' + esc(s) + '" data-hint="' + j.id + '">“' + esc(s) + '”</button>'; }).join("") + "</div></section>" +
      draftCard(j) + docsCard(j) + quoteCard(j) + reportsCard(j) + photosCard(j) +
    "</div>" +
    '<div style="display:flex;flex-direction:column;gap:16px;min-width:0">' + visitsCard(j) + notesCard(j) + '<section class="card"><h2>Job log <small>newest first</small></h2>' +
      '<form class="quick" id="logForm" style="margin:0 0 10px"><input id="logIn" placeholder="Add to the job log…" aria-label="Add to the job log"><button type="submit">Add</button></form>' +
      '<ul class="log">' + (d.log || []).slice().sort(function(x, y){ return new Date(y.t) - new Date(x.t); }).map(function(l){ var k = byKind(l.by); return '<li><span class="ev" style="padding:0;border:0;display:block">' + (k === "an" ? '<span class="ic an" style="width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--grad);color:#04222b;font-weight:700;font-size:12px">A</span>' : k === "wa" ? '<span class="ic wa" style="width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--wa);color:#04220f;font-weight:700;font-size:11px">WA</span>' : '<span style="width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--raise);color:var(--ink2);font-weight:700;font-size:12px">' + (k === "sys" ? "•" : esc(String(l.by || "O").charAt(0))) + "</span>") + "</span><div>" + esc(l.x) + "<time>" + esc(byLabel(l.by)) + " · " + esc(ago(l.t)) + "</time></div></li>"; }).join("") + "</ul>" +
    "</section></div></div>";
}

/* ---------- quotes, reports, photos, visits, notes ---------- */
var BIZ = { name:"ABC Restoration", addr:"24 George St, The Rocks NSW 2000", phone:"0412 345 678", web:"www.abcrestoration.com.au" };
var SAMPLE_PHOTOS = [["photos/33ee8890bda7457edb31a44d7be06f75.jpg","Ceiling mould near exhaust fan"],["photos/26efd1daa69bc03e8dc2cc08941cdcda.jpg","Moisture reading on affected area"],["photos/c44bb0948c06f490d5d082834d015e78.jpg","Mould in wall and ceiling corner"]];
function fmtWhen(t){ var d = new Date(t); if (isNaN(d)) return ""; return d.toLocaleString("en-AU",{ weekday:"short", day:"numeric", month:"short", hour:"numeric", minute:"2-digit", timeZone:"Australia/Sydney" }).replace(/\s?([ap])m/i, function(m, x){ return x.toLowerCase() + "m"; }); }
function quoteCard(j){
  var q = j.data.quote;
  if (!q || !q.items || !q.items.length) return '<section class="card"><h2>Quote</h2><p class="empty" style="padding-top:0">No quote on this job yet.</p><button type="button" data-ask="Put a quote together for this job." data-hint="' + j.id + '">Ask Annie to write the quote</button></section>';
  return '<section class="card"><h2>Quote <small>' + esc(q.at ? "written " + ago(q.at) : "") + '</small></h2>' + (q.scope ? '<p style="color:var(--ink2);font-size:14px;margin-bottom:8px">' + esc(q.scope) + "</p>" : "") +
    '<table><tbody>' + q.items.map(function(i){ return '<tr><td>' + esc(i.name) + '</td><td class="num">' + money(i.amount) + "</td></tr>"; }).join("") + '<tr><td><b>Total (inc GST)</b></td><td class="num"><b>' + money(q.total) + "</b></td></tr></tbody></table>" +
    '<div class="quick"><button type="button" data-doc="quote">Open quote</button><button class="ghost" type="button" data-ask="Update the quote on this job." data-hint="' + j.id + '">Ask Annie to change it</button></div></section>';
}
function reportsCard(j){
  var rs = j.data.reports || [];
  return '<section class="card"><h2>Reports</h2>' + (rs.map(function(r, i){ return '<div class="rep"><span>' + esc(r.tpl) + (r.at ? '<small style="display:block;color:var(--faint);font-size:12px">' + esc(byLabel(r.by)) + " · " + esc(ago(r.at)) + "</small>" : "") + '</span><span style="display:flex;gap:8px;align-items:center">' + (r.body ? '<button class="sm" type="button" data-doc="report" data-i="' + i + '">Open</button>' : "") + '<span class="pill ' + (r.status === "Complete" ? "grn" : r.status === "Draft" ? "" : "amb") + '">' + esc(r.status) + "</span></span></div>"; }).join("") || '<p class="empty">No reports yet.</p>') +
    '<div class="quick"><button class="ghost" type="button" data-ask="Write up the report for this job." data-hint="' + j.id + '">Ask Annie to write a report</button></div></section>';
}
function photosCard(j){
  var ps = j.data.photos || [];
  return '<section class="card"><h2>Photos <small>' + ps.length + "</small></h2>" + (ps.length ? '<div class="pgrid">' + ps.map(function(p, i){ return '<button class="ph" type="button" data-photo="' + i + '"><img src="' + esc(p.url) + '" alt="' + esc(p.cap || "Job photo") + '" loading="lazy"><span>' + esc(p.cap || "") + "</span></button>"; }).join("") + "</div>" : '<p class="empty" style="padding-top:0">No photos yet.</p>') +
    '<div class="quick"><label class="btn" for="photoIn">Add photos</label><input id="photoIn" type="file" accept="image/*" multiple hidden><button class="ghost" type="button" data-samples="1">Use sample photos</button><span id="upMsg" style="color:var(--muted);font-size:13px;align-self:center"></span></div></section>';
}
function visitsCard(j){
  var vs = (j.data.visits || []).slice().sort(function(a,b){ return new Date(a.start) - new Date(b.start); });
  var ts = j.data.tasks || [];
  var d = new Date(Date.now() + 86400000); var dv = d.toLocaleDateString("en-CA", { timeZone:"Australia/Sydney" });
  return '<section class="card"><h2>Visits and tasks</h2>' +
    ((vs.map(function(v){ return '<div class="rep"><span><b style="font-weight:600">' + esc(v.what) + "</b> · " + esc(v.tech) + '<small style="display:block;color:var(--faint);font-size:12px">' + esc(byLabel(v.by)) + (v.apptId ? " · in the calendar" : "") + '</small></span><span class="pill cy">' + esc(fmtWhen(v.start)) + "</span></div>"; }).join("") +
     ts.map(function(t){ return '<div class="rep"><span>☐ ' + esc(t.title) + '<small style="display:block;color:var(--faint);font-size:12px">Task · ' + esc(byLabel(t.by)) + '</small></span><span class="pill amb">' + esc(fmtWhen(t.due)) + "</span></div>"; }).join("")) || '<p class="empty" style="padding-top:0">Nothing booked.</p>') +
    '<details class="more"><summary>Book a visit</summary><form id="bookForm" class="fields" style="margin-top:8px"><div><label class="f" for="bDate">Day</label><input id="bDate" type="date" value="' + dv + '"></div><div><label class="f" for="bTime">Time</label><input id="bTime" type="time" value="09:00" step="900"></div>' +
    '<div><label class="f" for="bWhat">Visit</label>' + sel("bWhat", ["Make safe","Assessment","Drying check","Works","Final inspection"], j.stage === "Drying" ? "Drying check" : j.stage === "Accepted" ? "Make safe" : "Assessment") + '</div><div><label class="f" for="bTech">Technician</label>' + sel("bTech", ["Liam Carter","Jess Morgan"], j.tech) + '</div><div class="full"><button class="primary" type="submit" id="bGo">Book visit</button></div></form></details></section>';
}
function notesCard(j){
  var n = S.notes[j.contactId];
  return '<section class="card"><h2>Notes</h2><form class="quick" id="noteForm" style="margin:0 0 10px"><input id="noteIn" placeholder="Add a note…" aria-label="Add a note"><button type="submit">Add</button></form>' +
    (n === undefined ? '<p class="empty">Loading notes…</p>' : n.length ? '<ul class="log">' + n.map(function(x){ return '<li style="grid-template-columns:minmax(0,1fr)"><div style="white-space:pre-wrap">' + esc(x.body) + "<time>" + esc(ago(x.at)) + "</time></div></li>"; }).join("") + "</ul>" : '<p class="empty">No notes yet.</p>') + "</section>";
}
function loadNotes(id){
  var j = job(id); if (!j || !j.contactId) return;
  api({ action:"job", contactId:j.contactId }, 20000).then(function(r){ S.notes[j.contactId] = r.notes || []; if (S.view === "job" && S.jobId === id) render(true); }).catch(function(){ S.notes[j.contactId] = S.notes[j.contactId] || []; });
}
function vSchedule(){
  var items = [];
  S.jobs.forEach(function(j){
    (j.data.visits || []).forEach(function(v){ items.push({ t:v.start, kind:"visit", j:j, v:v }); });
    (j.data.tasks || []).forEach(function(t){ items.push({ t:t.due, kind:"task", j:j, v:t }); });
  });
  items = items.filter(function(x){ return new Date(x.t).getTime() > Date.now() - 86400000; }).sort(function(a,b){ return new Date(a.t) - new Date(b.t); });
  var days = {}, order = [];
  items.forEach(function(x){ var k = new Date(x.t).toLocaleDateString("en-AU",{ weekday:"long", day:"numeric", month:"long", timeZone:"Australia/Sydney" }); if (!days[k]) { days[k] = []; order.push(k); } days[k].push(x); });
  return '<div class="head"><div><h1>Schedule</h1><p>Site visits and follow-ups. Tell Annie to book one, or book it from the job.</p></div><div class="acts"><button type="button" data-ask="What\'s on this week?">Ask Annie what\'s on this week</button></div></div>' +
    (order.length ? order.map(function(k){ return '<section class="card" style="margin-bottom:12px"><h2>' + esc(k) + '</h2><div class="rows">' + days[k].map(function(x){
      var tm = new Date(x.t).toLocaleTimeString("en-AU",{ hour:"numeric", minute:"2-digit", timeZone:"Australia/Sydney" });
      return '<button class="r" type="button" data-job="' + x.j.id + '"><span class="pill ' + (x.kind === "visit" ? "cy" : "amb") + '" style="min-width:78px;justify-content:center">' + esc(tm) + '</span><div class="g"><div class="t">' + (x.kind === "visit" ? esc(x.v.what) + " · " + esc(x.v.tech) : "Task: " + esc(x.v.title)) + '</div><div class="s">' + esc(x.j.customer) + " · " + esc(x.j.suburb) + "</div></div></button>";
    }).join("") + "</div></section>"; }).join("") : '<section class="card"><p class="empty">Nothing booked yet.</p></section>');
}
function docHtml(kind, j, i){
  var d = j.data, today = new Date().toLocaleDateString("en-AU",{ day:"numeric", month:"long", year:"numeric" });
  var head = '<div class="dh"><div><b>' + BIZ.name + '</b><br>' + BIZ.addr + '<br>' + BIZ.phone + ' · ' + BIZ.web + '</div><div style="text-align:right"><b>' + (kind === "quote" ? "QUOTE" : esc(d.reports[i].tpl).toUpperCase()) + '</b><br>' + today + (j.ref ? '<br>Job ' + esc(j.ref) : "") + "</div></div>" +
    '<dl><dt>Customer</dt><dd>' + esc(j.customer) + '</dd><dt>Site</dt><dd>' + esc(d.address || j.suburb) + '</dd><dt>Sent by</dt><dd>' + esc(j.source) + (d.claim ? " · Claim " + esc(d.claim) : "") + "</dd></dl>";
  var body = kind === "quote" ? (d.quote.scope ? "<p>" + esc(d.quote.scope) + "</p>" : "") + '<table>' + d.quote.items.map(function(x, n){ return "<tr><td>" + (n + 1) + ". " + esc(x.name) + '</td><td class="n">' + money(x.amount) + "</td></tr>"; }).join("") + '<tr class="t"><td>Total (inc GST)</td><td class="n">' + money(d.quote.total) + "</td></tr></table><p class=\"fine\">Valid for 30 days. Prices include GST.</p>"
    : '<div class="rb">' + esc(d.reports[i].body).replace(/^([A-Z][A-Z &/\-]{2,})$/gm, "<h3>$1</h3>") + "</div>";
  return '<div class="doc">' + head + body + "</div>";
}
var DOC_CSS = ".doc{background:#fff;color:#14202b;font:14px/1.55 'IBM Plex Sans',system-ui,sans-serif;padding:28px;border-radius:10px}.doc .dh{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid #0e7490;padding-bottom:12px;margin-bottom:14px;font-size:13px;color:#5b6b78}.doc .dh b{color:#14202b;font-size:16px}.doc dl{display:grid;grid-template-columns:90px 1fr;gap:4px 12px;margin:0 0 14px;font-size:13.5px}.doc dt{color:#5b6b78}.doc dd{margin:0;font-weight:600}.doc table{width:100%;border-collapse:collapse}.doc td{padding:8px 4px;border-top:1px solid #e3e8ec}.doc td.n{text-align:right;white-space:nowrap}.doc tr.t td{font-weight:700;border-top:2px solid #14202b}.doc .fine{color:#5b6b78;font-size:12px}.doc h3{font-size:13px;letter-spacing:.04em;color:#0e7490;margin:16px 0 4px}.doc .rb{white-space:pre-wrap}";
function openDoc(kind, i){
  var j = job(S.jobId); if (!j) return;
  modal('<h2 id="mTitle">' + (kind === "quote" ? "Quote" : esc(j.data.reports[i].tpl)) + ' · ' + esc(j.customer) + '</h2><style>' + DOC_CSS + '</style><div style="margin:12px 0">' + docHtml(kind, j, i) + '</div><div class="btns"><button class="ghost" type="button" data-act="close">Close</button><button class="primary" type="button" data-print="' + kind + '" data-i="' + (i || 0) + '">Print or save as PDF</button></div>');
}
function printDoc(kind, i){
  var j = job(S.jobId); var w = window.open("", "_blank"); if (!w) { toast("Allow pop-ups to print."); return; }
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(j.customer) + '</title><style>body{margin:24px}' + DOC_CSS + '.doc{padding:0}</style></head><body>' + docHtml(kind, j, i) + '<script>setTimeout(function(){print()},300)<\/script></body></html>');
  w.document.close();
}
function openPhoto(i){
  var j = job(S.jobId); var p = j && (j.data.photos || [])[i]; if (!p) return;
  modal('<h2 id="mTitle">' + esc(p.cap || "Photo") + '</h2><p class="lead">' + esc(byLabel(p.by)) + " · " + esc(ago(p.t)) + '</p><img src="' + esc(p.url) + '" alt="' + esc(p.cap || "Job photo") + '" style="width:100%;border-radius:10px;display:block"><div class="btns"><button class="primary" type="button" data-act="close">Close</button></div>');
}
function shrink(blob){
  return new Promise(function(res, rej){
    var img = new Image(), url = URL.createObjectURL(blob);
    img.onload = function(){ var m = 1600, w = img.width, h = img.height, k = Math.min(1, m / Math.max(w, h)); var c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.82).split(",")[1]); };
    img.onerror = function(){ URL.revokeObjectURL(url); rej(new Error("not an image")); };
    img.src = url;
  });
}
function uploadPhotos(list){
  var id = S.jobId, n = 0, total = list.length, msg = function(t){ var e = $("upMsg"); if (e) e.textContent = t; };
  if (!total) return;
  msg("Uploading 1 of " + total + "…");
  var chain = Promise.resolve();
  list.forEach(function(it, k){
    chain = chain.then(function(){ msg("Uploading " + (k + 1) + " of " + total + "…"); return (it.blob ? Promise.resolve(it.blob) : fetch(it.url).then(function(r){ return r.blob(); })).then(shrink).then(function(b64){
      return api({ action:"photo", id:id, by:"Office", cap:it.cap || "", file:{ name:(it.name || "photo").replace(/\.\w+$/, "") + ".jpg", mime:"image/jpeg", b64:b64 } }, 60000);
    }).then(function(){ n++; }).catch(function(){}); });
  });
  chain.then(function(){ msg(n === total ? "" : (total - n) + " didn't upload"); toast(n + " photo" + (n === 1 ? "" : "s") + " added"); return refresh(true, true); });
}
/* talk to type */
function setupMic(){
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
  var b = document.createElement("button"); b.type = "button"; b.id = "micBtn"; b.className = "ghost"; b.setAttribute("aria-label", "Talk to Annie"); b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>';
  $("askForm").insertBefore(b, $("askBtn"));
  var rec = null, on = false;
  b.addEventListener("click", function(){
    if (on && rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = "en-AU"; rec.interimResults = true; rec.continuous = false;
    var base = $("askIn").value ? $("askIn").value + " " : "";
    rec.onresult = function(ev){ var t = ""; for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; $("askIn").value = base + t; };
    rec.onend = function(){ on = false; b.classList.remove("rec"); $("askIn").placeholder = "Message Annie…"; if ($("askIn").value.trim()) $("askForm").requestSubmit(); };
    rec.onerror = function(){ on = false; b.classList.remove("rec"); };
    on = true; b.classList.add("rec"); $("askIn").placeholder = "Listening…"; rec.start();
  });
}


function draftCard(j){
  var d = j.data.draft; if (!d || !d.body) return "";
  return '<section class="card" style="border-color:#145061"><h2>' + esc(d.kind || "Chaser") + ' <small><span class="pill grn">Ready to send</span></small></h2><div class="mail"><div><small>To</small> ' + esc(d.to || "") + '</div><div><small>Subject</small> ' + esc(d.subject || "") + '</div><pre>' + esc(d.body) + '</pre></div><div class="quick"><button type="button" data-copydraft="' + j.id + '">Copy</button><span style="color:var(--muted);font-size:13px;align-self:center">' + esc(byLabel(d.by)) + " · " + esc(ago(d.at)) + "</span></div></section>";
}
function docsCard(j){
  var ds = j.data.docs || [];
  if (!ds.length) return "";
  return '<section class="card"><h2>Documents <small>saved in the job and the media library</small></h2>' + ds.slice().reverse().map(function(x){ return '<div class="rep"><span>📄 ' + esc(x.name) + '<small style="display:block;color:var(--faint);font-size:12px">' + esc(byLabel(x.by)) + " · " + esc(ago(x.t)) + '</small></span><a class="btn sm" href="' + esc(x.url) + '" target="_blank" rel="noopener">Open PDF</a></div>'; }).join("") + "</section>";
}
/* live documents: when Annie writes a quote or report, build it on screen, then save it as a PDF */
var docQueue = [], docBusy = false;
function docSig(j){ var q = j.data.quote; var sig = { q:q && q.at ? q.at : "", d:j.data.draft && j.data.draft.at ? j.data.draft.at : "" }; (j.data.reports || []).forEach(function(r, i){ if (r.at) sig["r" + r.tpl] = r.at; }); return sig; }
function scanDocs(first){
  S.docSig = S.docSig || {};
  S.jobs.forEach(function(j){
    var now = docSig(j), old = S.docSig[j.id];
    if (!first && old) {
      var fresh = function(t){ return Date.now() - new Date(t).getTime() < 300000; };
      if (now.q && now.q !== old.q && fresh(now.q) && /^Annie/.test((j.data.quote && j.data.quote.by) || "Annie")) docQueue.push({ id:j.id, kind:"quote" });
      if (now.d && now.d !== old.d && fresh(now.d)) docQueue.push({ id:j.id, kind:"draft" });
      Object.keys(now).forEach(function(k){ if (k.charAt(0) === "r" && now[k] !== old[k] && fresh(now[k])) { var rs = j.data.reports || [], r = null; for (var x = rs.length - 1; x >= 0; x--) { if ("r" + rs[x].tpl === k && rs[x].body) { r = rs[x]; break; } } if (r && /^Annie/.test(r.by || "")) docQueue.push({ id:j.id, kind:"report", tpl:r.tpl }); } });
    }
    S.docSig[j.id] = now;
  });
  nextDoc();
}
function nextDoc(){
  if (docBusy || !docQueue.length || !$("modal").hidden) return;
  var d = docQueue.shift(); var j = job(d.id); if (!j) return nextDoc();
  var i = 0; if (d.kind === "report") { i = -1; (j.data.reports || []).forEach(function(r, x){ if (r.tpl === d.tpl && r.body) i = x; }); }
  if (d.kind === "report" && i < 0) return nextDoc();
  docBusy = true;
  if (S.view !== "job" || S.jobId !== j.id) go("job", j.id);
  liveDoc(d.kind, i);
}
function liveDoc(kind, i){
  var j = job(S.jobId);
  if (kind === "draft") {
    var dr = j.data.draft;
    modal('<h2 id="mTitle"><span class="av think" style="width:26px;height:26px;font-size:12px;display:inline-grid;vertical-align:middle;margin-right:8px">A</span><span>Annie is drafting the ' + esc((dr.kind || "chaser").toLowerCase()) + ' · ' + esc(j.customer) + '</span></h2><div class="mail" style="margin:12px 0"><div><small>To</small> ' + esc(dr.to || "") + '</div><div><small>Subject</small> ' + esc(dr.subject || "") + '</div><pre id="draftBody"></pre></div><p id="docState" class="lead" style="margin:0">Writing…</p><div class="btns"><button class="ghost" type="button" data-act="closedoc">Close</button><button class="primary" type="button" data-copydraft="' + j.id + '">Copy</button></div>');
    var pre = $("draftBody"), t = dr.body, n = 0;
    var tk = setInterval(function(){ n = Math.min(t.length, n + Math.max(4, Math.round(t.length / 110))); pre.textContent = t.slice(0, n); if (n >= t.length) { clearInterval(tk); var av = document.querySelector("#mTitle .av"); if (av) av.classList.remove("think"); var h = document.querySelector("#mTitle span:last-child"); if (h) h.textContent = (dr.kind || "Chaser") + " · " + j.customer; $("docState").innerHTML = "✓ Saved on the job, ready to send."; docBusy = false; } }, 24);
    return;
  }
  var title = kind === "quote" ? "Quote" : j.data.reports[i].tpl;
  modal('<h2 id="mTitle"><span class="av think" style="width:26px;height:26px;font-size:12px;display:inline-grid;vertical-align:middle;margin-right:8px">A</span>Annie is writing the ' + esc(title.toLowerCase()) + ' · ' + esc(j.customer) + '</h2><style>' + DOC_CSS + '</style><div id="liveDoc" style="margin:12px 0"></div><p id="docState" class="lead" style="margin:0">Writing…</p><div class="btns"><button class="ghost" type="button" data-act="closedoc">Close</button><button class="primary" type="button" data-print="' + kind + '" data-i="' + (i || 0) + '">Print or save as PDF</button></div>');
  var box = $("liveDoc"); box.innerHTML = docHtml(kind, j, i);
  var doc = box.firstChild;
  var done = function(){ var av = document.querySelector("#mTitle .av"); if (av) av.classList.remove("think"); var h = $("mTitle"); if (h) h.lastChild.textContent = title + " · " + j.customer; savePdf(kind, i); };
  if (kind === "quote") {
    var rows = doc.querySelectorAll("tr"), k = 0;
    rows.forEach(function(r){ r.style.opacity = 0; });
    (function step(){ if (k < rows.length) { rows[k].style.transition = "opacity .35s"; rows[k].style.opacity = 1; k++; setTimeout(step, 380); } else done(); })();
  } else {
    var rb = doc.querySelector(".rb"), full = rb.innerHTML, txt = j.data.reports[i].body, n = 0;
    rb.textContent = "";
    var tick = setInterval(function(){
      n = Math.min(txt.length, n + Math.max(6, Math.round(txt.length / 160)));
      rb.innerHTML = esc(txt.slice(0, n)).replace(/^([A-Z][A-Z &/\-]{2,})$/gm, "<h3>$1</h3>") + (n < txt.length ? '<span class="caret">▍</span>' : "");
      box.scrollTop = box.scrollHeight;
      if (n >= txt.length) { clearInterval(tick); rb.innerHTML = full; done(); }
    }, 24);
  }
}
function savePdf(kind, i){
  var j = job(S.jobId); var st = $("docState");
  var name = (kind === "quote" ? "Quote" : j.data.reports[i].tpl) + " - " + j.customer + " (" + new Date().toLocaleDateString("en-AU", { day:"numeric", month:"short" }) + ")";
  if ((j.data.docs || []).some(function(x){ return x.name === name; })) { if (st) st.innerHTML = "✓ Already saved to the job as a PDF."; docBusy = false; return; }
  if (!window.html2pdf) { if (st) st.textContent = "Saved on the job."; docBusy = false; return; }
  if (st) st.textContent = "Saving as a PDF to the job…";
  var html = '<div style="width:720px;background:#fff"><style>' + DOC_CSS + '</style>' + docHtml(kind, j, i) + '</div>';
  window.html2pdf().set({ margin:10, filename:name + ".pdf", html2canvas:{ scale:2, backgroundColor:"#ffffff", scrollX:0, scrollY:0 }, jsPDF:{ unit:"mm", format:"a4" }, pagebreak:{ mode:["css","legacy"] } }).from(html, "string").outputPdf("datauristring").then(function(uri){
    return api({ action:"photo", kind:"doc", id:j.id, contactId:j.contactId, by:"Annie", cap:name, file:{ name:name.replace(/[^\w\- ]/g, "").replace(/\s+/g, "-") + ".pdf", mime:"application/pdf", b64:uri.split(",")[1] } }, 60000);
  }).then(function(){ if (st) st.innerHTML = "✓ Saved to the job and the media library as a PDF, with a note on the customer."; refresh(true, true); })
    .catch(function(){ if (st) st.textContent = "Saved on the job. The PDF copy didn't save this time."; })
    .finally(function(){ docBusy = false; });
}

function kv(k, v){ return "<div><small>" + esc(k) + "</small><b>" + esc(v || "—") + "</b></div>"; }
function vMoney(){
  var st = stats();
  var rows = S.jobs.filter(function(j){ return j.stage === "Complete" || j.stage === "Invoiced" || j.stage === "Paid"; })
    .sort(function(a,b){ return STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage); });
  return '<div class="head"><div><h1>Money</h1><p>' + money(st.readyV) + " ready to invoice · " + money(st.owedV) + " waiting on payment</p></div>" +
    '<div class="acts"><button type="button" data-ask="Who owes us money?">Ask Annie who owes us</button></div></div>' +
    '<section class="card"><table><thead><tr><th>Customer</th><th class="hide-m">Sent by</th><th>Status</th><th class="num">Value</th><th></th></tr></thead><tbody>' +
    (rows.map(function(j){
      var act = j.stage === "Complete" ? '<button class="sm" type="button" data-ask="Invoice ' + esc(j.customer) + "'s job." + '" data-hint="' + j.id + '">Ask Annie to invoice</button>' :
        j.stage === "Invoiced" && !/^draft/i.test(j.invoice) ? '<button class="sm ghost" type="button" data-paid="' + j.id + '">Mark paid</button>' :
        j.stage === "Invoiced" ? '<button class="sm" type="button" data-ask="Yes, send it." data-hint="' + j.id + '">Tell Annie to send</button>' : "";
      return '<tr class="click" data-job="' + j.id + '"><td><b>' + esc(j.customer) + '</b><div style="color:var(--muted);font-size:12.5px">' + esc(j.type) + " · " + esc(j.suburb) + '</div></td><td class="hide-m">' + esc(j.source) + "</td><td>" + (j.stage === "Complete" ? '<span class="pill grn">Ready to invoice</span>' : j.stage === "Paid" ? '<span class="pill">' + esc(j.invoice || "Paid") + "</span>" : '<span class="pill cy">' + esc(j.invoice) + "</span>") + '</td><td class="num">' + money(j.value) + "</td><td>" + act + "</td></tr>";
    }).join("") || '<tr><td colspan="5" class="empty">Nothing finished yet.</td></tr>') + "</tbody></table></section>";
}
function vActivity(){
  return '<div class="head"><div><h1>Activity</h1><p>Everything that changed, from the office, Annie and WhatsApp.</p></div></div><section class="card"><div class="feed" style="max-height:none">' + (S.feed.map(evRow).join("") || '<p class="empty">No activity yet.</p>') + "</div></section>";
}
var lastView = "";
function render(changed){
  if (!S.loaded) return;
  nav();
  var v = S.view;
  // don't clobber a focused input on the same screen
  var ae = document.activeElement, keepQ = ae && ae.id === "q", keepLog = ae && ae.id === "logIn" ? ae.value : null;
  if (!changed && v === lastView && (keepQ || keepLog !== null)) return;
  var h = v === "schedule" ? vSchedule() : v === "jobs" ? vJobs() : v === "job" ? vJob() : v === "money" ? vMoney() : v === "activity" ? vActivity() : vOverview();
  $("view").innerHTML = h;
  S.feed.forEach(function(e){ e.isNew = false; });
  if (keepQ) { var q = $("q"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  if (keepLog !== null) { var li = $("logIn"); if (li) { li.value = keepLog; li.focus(); } }
  if (v !== lastView) window.scrollTo(0, 0);
  lastView = v;
  sugs();
}
function go(v, id){ S.view = v; if (id) S.jobId = id; lastView = ""; render(true); if (v === "job") loadNotes(S.jobId); }

/* ---------- Annie ---------- */
function bubble(cls, html){ var d = document.createElement("div"); d.className = "b " + cls; d.innerHTML = html; $("chat").appendChild(d); scrollChat(); return d; }
function scrollChat(){ var c = $("chat"); c.scrollTop = c.scrollHeight; }
function resetChat(msg){ $("chat").innerHTML = '<div class="b a">' + esc(msg) + "</div>"; }
function setHint(id){
  S.hint = id; var j = job(id);
  $("ctx").hidden = !j; $("ctxTxt").textContent = j ? "Talking about: " + j.customer : "";
  sugs();
}
function sugs(){
  var j = S.hint ? job(S.hint) : (S.view === "job" ? job(S.jobId) : null);
  var list = j ? (SUGS[j.stage] || []).concat(["What's still missing on this job?"]) : SUGS.base;
  $("sugs").innerHTML = list.slice(0, 3).map(function(s){ return '<button type="button" data-ask="' + esc(s) + '"' + (j ? ' data-hint="' + j.id + '"' : "") + ">" + esc(s) + "</button>"; }).join("");
}
function ask(text, hintId){
  text = String(text || "").trim();
  if (!text || S.asking) return;
  if (hintId) setHint(hintId);
  var j = S.hint ? job(S.hint) : (S.view === "job" ? job(S.jobId) : null);
  document.body.classList.add("annie-open");
  bubble("u", esc(text));
  var w = document.createElement("div"); w.className = "work";
  w.innerHTML = '<div class="wt"><b>Annie is working</b><span class="tm" id="wtm">0.0s</span></div><div class="st run"><i></i><span>Reading your message' + (j ? " about " + esc(j.customer) : "") + "</span></div>";
  $("chat").appendChild(w); scrollChat();
  S.asking = true; $("av").classList.add("think"); $("aStatus").textContent = "Working on it…"; $("askBtn").disabled = true;
  var t0 = performance.now();
  var tick = setInterval(function(){ var e = $("wtm"); if (e) e.textContent = ((performance.now() - t0) / 1000).toFixed(1) + "s"; }, 100);
  schedule();
  api({ action:"ask", text:text, by:"Office", jobHint: j ? j.customer + " (" + (j.type || "") + ", " + j.suburb + ")" : "" }, 150000).then(function(r){
    clearInterval(tick);
    var secs = ((performance.now() - t0) / 1000).toFixed(1);
    var steps = r.steps || [];
    w.innerHTML = '<div class="wt"><b>' + (steps.length ? "What Annie did" : "Annie answered") + '</b><span class="tm">' + steps.length + " step" + (steps.length === 1 ? "" : "s") + " · " + secs + "s</span></div>";
    var k = 0;
    (function next(){
      if (k < steps.length) {
        var s = steps[k++]; var d = document.createElement("div"); d.className = "st";
        d.innerHTML = "<i>✓</i><span>" + esc(s.label) + (s.detail ? "<small>" + esc(s.detail) + "</small>" : "") + "</span>";
        w.appendChild(d); scrollChat(); setTimeout(next, 260);
      } else {
        bubble("a", esc(r.text || "Done."));
        done();
      }
    })();
  }).catch(function(e){
    clearInterval(tick);
    w.remove();
    bubble("a err", "Sorry, I didn't get that one through" + (/abort/i.test(String(e && e.name)) ? " in time" : "") + ". Give it another go.");
    done();
  });
  function done(){
    S.asking = false; $("av").classList.remove("think"); $("aStatus").textContent = "Office assistant · online"; $("askBtn").disabled = false;
    refresh(true, true).then(function(){ schedule(); if (S.view === "job") loadNotes(S.jobId); });
    setTimeout(function(){ refresh(true, true); }, 3500);
  }
}

/* ---------- modals ---------- */
function modal(h){ var m = $("modal"); m.innerHTML = '<div class="dlg">' + h + "</div>"; m.hidden = false; var f = m.querySelector("input,select,textarea,button"); if (f) f.focus(); }
function closeModal(){ $("modal").hidden = true; $("modal").innerHTML = ""; }
function sel(id, opts, v){ return '<select id="' + id + '">' + opts.map(function(o){ return "<option" + (o === v ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>"; }
function openNew(s){
  s = s || {};
  modal('<h2 id="mTitle">New job</h2><p class="lead">Adds the job and the customer to the board at Accepted.</p>' +
    '<div class="prefill"><button class="sm" type="button" data-sample="0">Sample: burst pipe (emergency)</button><button class="sm" type="button" data-sample="1">Sample: storm leak</button><button class="sm" type="button" data-sample="2">Sample: strata mould</button></div>' +
    '<form id="newForm"><div class="fields">' +
    '<div><label class="f" for="nCust">Customer name</label><input id="nCust" required value="' + esc(s.customer) + '"></div>' +
    '<div><label class="f" for="nPhone">Phone</label><input id="nPhone" inputmode="tel" value="' + esc(s.phone) + '"></div>' +
    '<div class="full"><label class="f" for="nAddr">Address</label><input id="nAddr" placeholder="Street, suburb NSW postcode" value="' + esc(s.address) + '"></div>' +
    '<div><label class="f" for="nEvent">What happened</label>' + sel("nEvent", EVENTS, s.event || "Water damage") + "</div>" +
    '<div><label class="f" for="nUrg">Urgency</label>' + sel("nUrg", ["Standard","Emergency"], s.urgency || "Standard") + "</div>" +
    '<div><label class="f" for="nClient">Sent by</label>' + sel("nClient", CLIENTS, s.client || "Direct") + "</div>" +
    '<div><label class="f" for="nNo">Their job no</label><input id="nNo" value="' + esc(s.no) + '"></div>' +
    '<div><label class="f" for="nTech">Technician</label>' + sel("nTech", ["Liam Carter","Jess Morgan","Unassigned"], s.tech || "Liam Carter") + "</div>" +
    '<div><label class="f" for="nVal">Estimated value ($)</label><input id="nVal" inputmode="numeric" value="' + esc(s.value) + '"></div>' +
    '<div class="full"><label class="f" for="nIns">Instructions</label><textarea id="nIns">' + esc(s.instructions) + "</textarea></div>" +
    '</div><p class="ferr" id="nErr" hidden></p><div class="btns"><button class="ghost" type="button" data-act="close">Cancel</button><button class="primary" id="nGo" type="submit">Add job</button></div></form>');
}
function submitNew(){
  var v = function(id){ return $(id).value.trim(); };
  if (!v("nCust")) { $("nErr").hidden = false; $("nErr").textContent = "Add the customer's name."; $("nCust").focus(); return; }
  var jobIn = { customer:v("nCust"), phone:v("nPhone"), address:v("nAddr"), event:v("nEvent"), urgency:v("nUrg"), client:v("nClient"), no:v("nNo"), tech:v("nTech"), value:v("nVal").replace(/[^\d.]/g, ""), instructions:v("nIns") };
  $("nGo").disabled = true; $("nGo").textContent = "Adding…";
  api({ action:"create", job:jobIn, by:"Office" }, 30000).then(function(r){
    closeModal(); toast("Job added: " + jobIn.customer);
    var id = r.id;
    return refresh(true, true).then(function(){ if (id && job(id)) { S.flash[id] = Date.now(); go("job", id); } else go("jobs"); });
  }).catch(function(){ $("nGo").disabled = false; $("nGo").textContent = "Add job"; $("nErr").hidden = false; $("nErr").textContent = "That didn't save. Check the connection and try again."; });
}
function openReset(){
  modal('<h2 id="mTitle">Reset the demo?</h2><p class="lead">Every demo job goes back to where it started. Jobs added during this demo come off the board, and Annie starts a fresh session. Nothing is deleted.</p><div class="btns"><button class="ghost" type="button" data-act="close">Cancel</button><button class="primary" id="rGo" type="button" data-act="doreset">Reset demo</button></div>');
}
function doReset(){
  $("rGo").disabled = true; $("rGo").textContent = "Resetting…";
  api({ action:"reset" }, 60000).then(function(r){
    closeModal(); S.pending = {}; S.seen = {}; S.ids = {}; S.feed = []; S.loaded = false; S.session = null;
    resetChat("All reset. Every job is back where it started.");
    setHint(null);
    toast("Demo reset · session " + r.session);
    return refresh(true, true).then(function(){ go("overview"); });
  }).catch(function(){ $("rGo").disabled = false; $("rGo").textContent = "Reset demo"; toast("Reset didn't go through. Try again."); });
}

/* ---------- events ---------- */
document.addEventListener("click", function(e){
  var t = e.target.closest("button,[data-job],tr[data-job]"); if (!t) return;
  if (t.dataset.go) { go(t.dataset.go); return; }
  if (t.dataset.sample) { openNew(SAMPLES[+t.dataset.sample]); return; }
  if (t.dataset.ask) { ask(t.dataset.ask, t.dataset.hint || null); return; }
  if (t.dataset.focus) { setHint(t.dataset.focus); document.body.classList.add("annie-open"); $("askIn").focus(); return; }
  if (t.dataset.move) { moveTo(S.jobId, t.dataset.move); return; }
  if (t.dataset.paid) { e.stopPropagation(); moveTo(t.dataset.paid, "Paid"); return; }
  if (t.dataset.tech) { S.tech = t.dataset.tech; render(true); return; }
  if (t.dataset.doc) { openDoc(t.dataset.doc, +(t.dataset.i || 0)); return; }
  if (t.dataset.print) { printDoc(t.dataset.print, +(t.dataset.i || 0)); return; }
  if (t.dataset.photo) { openPhoto(+t.dataset.photo); return; }
  if (t.dataset.copydraft) { var jd = job(t.dataset.copydraft); if (jd && jd.data.draft) { var txt = "Subject: " + jd.data.draft.subject + "\n\n" + jd.data.draft.body; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function(){ toast("Copied"); }).catch(function(){ toast("Select the text to copy it"); }); } return; }
  if (t.dataset.samples) { uploadPhotos(SAMPLE_PHOTOS.map(function(p){ return { url:p[0], cap:p[1], name:p[0].split("/").pop() }; })); return; }
  var a = t.dataset.act;
  if (a === "new") return openNew();
  if (a === "close") return closeModal();
  if (a === "closedoc") { closeModal(); setTimeout(nextDoc, 300); return; }
  if (a === "reset") return openReset();
  if (a === "doreset") return doReset();
  if (a === "retry") return refresh();
  if (t.dataset.job) { go("job", t.dataset.job); return; }
});
document.addEventListener("submit", function(e){
  e.preventDefault();
  if (e.target.id === "askForm") { var v = $("askIn").value; $("askIn").value = ""; ask(v); }
  if (e.target.id === "newForm") submitNew();
  if (e.target.id === "noteForm") { var nt = $("noteIn").value.trim(); var jn = job(S.jobId); if (nt && jn) { $("noteIn").value = ""; (S.notes[jn.contactId] = S.notes[jn.contactId] || []).unshift({ body:nt, at:new Date().toISOString() }); render(true); api({ action:"note", contactId:jn.contactId, text:nt }, 20000).then(function(){ toast("Note saved"); loadNotes(jn.id); }).catch(function(){ toast("That note didn't save."); }); } }
  if (e.target.id === "bookForm") { var jb = job(S.jobId); var st = new Date($("bDate").value + "T" + $("bTime").value + ":00+11:00"); if (jb && !isNaN(st)) { $("bGo").disabled = true; $("bGo").textContent = "Booking…"; api({ action:"book", id:jb.id, contactId:jb.contactId, customer:jb.customer, start:st.toISOString(), mins:60, tech:$("bTech").value, what:$("bWhat").value, by:"Office" }, 30000).then(function(){ toast("Visit booked"); return refresh(true, true); }).catch(function(){ toast("That booking didn't save."); if ($("bGo")) { $("bGo").disabled = false; $("bGo").textContent = "Book visit"; } }); } }
  if (e.target.id === "logForm") { var x = $("logIn").value.trim(); if (x) { $("logIn").value = ""; update(S.jobId, { log:x }, "Added to the job log"); } }
});
document.addEventListener("change", function(e){ if (e.target.id === "photoIn" && e.target.files.length) { uploadPhotos(Array.prototype.map.call(e.target.files, function(f){ return { blob:f, name:f.name, cap:"" }; })); e.target.value = ""; } });
document.addEventListener("input", function(e){ if (e.target.id === "q") { S.q = e.target.value; var p = e.target.selectionStart; render(true); var q = $("q"); q.focus(); q.setSelectionRange(p, p); } });
document.addEventListener("keydown", function(e){ if (e.key === "Escape") { if (!$("modal").hidden) closeModal(); else document.body.classList.remove("annie-open"); } });
$("modal").addEventListener("click", function(e){ if (e.target.id === "modal") closeModal(); });
$("fab").addEventListener("click", function(){ document.body.classList.add("annie-open"); setTimeout(function(){ $("askIn").focus(); }, 300); });
$("annieClose").addEventListener("click", function(){ document.body.classList.remove("annie-open"); });
$("ctxX").addEventListener("click", function(){ setHint(null); });
/* drag and drop */
var dragId = null;
document.addEventListener("dragstart", function(e){ var c = e.target.closest && e.target.closest(".jc"); if (!c) return; dragId = c.dataset.job; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", dragId); } catch (x) {} });
document.addEventListener("dragover", function(e){ var col = e.target.closest && e.target.closest(".col"); if (!col || !dragId) return; e.preventDefault(); document.querySelectorAll(".col.over").forEach(function(c){ if (c !== col) c.classList.remove("over"); }); col.classList.add("over"); });
document.addEventListener("dragleave", function(e){ var col = e.target.closest && e.target.closest(".col"); if (col && !col.contains(e.relatedTarget)) col.classList.remove("over"); });
document.addEventListener("drop", function(e){ var col = e.target.closest && e.target.closest(".col"); if (!col || !dragId) return; e.preventDefault(); col.classList.remove("over"); var id = dragId; dragId = null; moveTo(id, col.dataset.stage); });
document.addEventListener("dragend", function(){ dragId = null; document.querySelectorAll(".col.over").forEach(function(c){ c.classList.remove("over"); }); });
document.addEventListener("visibilitychange", function(){ if (!document.hidden && S.loaded) refresh(); });
setInterval(function(){ if (S.loaded && !document.activeElement.matches("input,textarea,select") && (S.view === "overview" || S.view === "activity")) render(true); }, 30000);

document.querySelectorAll(".rslogo").forEach(function(i){ i.src = window.LOGO || ""; });
setupMic();
sugs();
refresh(true).then(function(){ render(true); schedule(); });
window.AO = { S:S, refresh:refresh, ask:ask, go:go };
})();
