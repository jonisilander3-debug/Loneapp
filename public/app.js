// ── State ───────────────────────────────────────────────────────────────────
const state = {
  user: null,
  isAdmin: false,
  currentPage: 'salary',
  week: getCurrentWeek(),
  projects: [],
  employees: [],
  chatData: [],
  affiliateData: [],
  salaryAdjustments: {},
  lockedWeeks: []
};

// ── Utils ────────────────────────────────────────────────────────────────────
function getCurrentWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now - start) / 86400000);
  return { year: now.getFullYear(), week: Math.ceil((days + start.getDay() + 1) / 7) };
}

async function api(endpoint, options = {}) {
  const res = await fetch(endpoint, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (res.status === 401) { window.location.reload(); return; }
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Request failed'); }
  return res.json();
}

function toast(msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function modal(html, onClose) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = '<div class="modal-overlay" id="modalOverlay"><div class="modal" id="modalBox">' + html + '</div></div>';
  const overlay = document.getElementById('modalOverlay');
  overlay.addEventListener('click', function(e) { if (e.target === overlay) { window.closeModal(); if (onClose) onClose(); } });
  window.closeModal = function() { root.innerHTML = ''; };
  window.modalClose = function() { root.innerHTML = ''; if (onClose) onClose(); };
}

function confirmModal(title, msg, onOk) {
  modal('<h3>' + title + '</h3><p style="color:var(--text-dim);margin-bottom:8px">' + msg + '</p><div class="modal-actions"><button class="btn-ghost" onclick="modalClose()">Avbryt</button><button class="btn-primary btn-danger" onclick="modalClose();window._confirmOk()">Ja, fortsätt</button></div>', function() { window._confirmOk = null; });
  window._confirmOk = onOk;
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmt(n) { return (parseFloat(n)||0).toLocaleString('sv-SE', {minimumFractionDigits:2, maximumFractionDigits:2}); }

function downloadCSV(rows, filename) {
  const csv = rows.map(function(r) { return r.map(function(v) { return '"' + String(v).replace(/"/g,'""') + '"'; }).join(','); }).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

// ── Auth ─────────────────────────────────────────────────────────────────────
async function login(e) {
  e.preventDefault();
  const u = document.getElementById('username').value.trim();
  const p = document.getElementById('password').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  try {
    const res = await api('/api/login', { method: 'POST', body: { username: u, password: p } });
    state.user = res.user;
    state.isAdmin = res.user.role === 'admin';
    window.location.href = '/app.html';
  } catch (e) { errEl.textContent = e.message || 'Inloggning misslyckades'; }
}

async function logout() {
  await api('/api/logout', { method: 'POST' });
  window.location.href = '/';
}

async function checkAuth() {
  try {
    const res = await api('/api/me');
    state.user = res.user;
    state.isAdmin = res.user.role === 'admin';
  } catch { window.location.href = '/'; }
}

// ── Nav ──────────────────────────────────────────────────────────────────────
function navigate(page) {
  state.currentPage = page;
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.toggle('active', n.dataset.page === page); });
  document.querySelectorAll('.admin-only').forEach(function(el) { el.style.display = state.isAdmin ? '' : 'none'; });
  renderPage();
}

function renderPage() {
  const content = document.getElementById('pageContent');
  const title = document.getElementById('pageTitle');
  const actions = document.getElementById('topbarActions');
  actions.innerHTML = '';
  switch (state.currentPage) {
    case 'salary': title.textContent = 'Löneöversikt'; renderSalaryOverview(actions); break;
    case 'data-input': title.textContent = 'Datainmatning'; renderDataInput(actions); break;
    case 'employees': title.textContent = 'Anställda'; renderEmployees(actions); break;
    case 'projects': title.textContent = 'Projekt'; renderProjects(actions); break;
    case 'reader-projects': title.textContent = 'Läsbehörigheter'; renderReaderProjects(actions); break;
  }
}

// ── Week Selector ─────────────────────────────────────────────────────────────
function renderWeekSelector(actions) {
  const year = state.week.year;
  const week = state.week.week;
  const locked = state.lockedWeeks.some(function(w) { return w.year === year && w.week_number === week; });
  var yOpts = [year-1,year,year+1].map(function(y) { return '<option value="'+y+'" '+(y===year?'selected':'')+'>'+y+'</option>'; }).join('');
  var wOpts = Array.from({length:53},function(_,i) { return i+1; }).map(function(w) { return '<option value="'+w+'" '+(w===week?'selected':'')+'>v'+w+'</option>'; }).join('');
  actions.insertAdjacentHTML('beforeend', '<div class="week-selector"><label>År</label><select class="year-select" id="weekYear" onchange="onWeekChange()">'+yOpts+'</select><label>Vecka</label><select class="week-select" id="weekNum" onchange="onWeekChange()">'+wOpts+'</select>'+(locked?'<span class="lock-badge">&#128274; Låst</span>':'')+'</div>');
  window.onWeekChange = function() {
    state.week.year = parseInt(document.getElementById('weekYear').value);
    state.week.week = parseInt(document.getElementById('weekNum').value);
    renderPage();
  };
}

// ── Salary Overview ────────────────────────────────────────────────────────────
async function renderSalaryOverview(actions) {
  renderWeekSelector(actions);
  if (state.isAdmin) {
    actions.insertAdjacentHTML('beforeend', '<button class="btn-secondary" onclick="exportSalaryCSV()">&#8595; Exportera CSV</button>');
    actions.insertAdjacentHTML('beforeend', '<button class="btn-primary" onclick="finalizeWeek()">&#128274; Färdigställ vecka</button>');
  }
  await loadSalaryData();
  const year = state.week.year;
  const week = state.week.week;
  const locked = state.lockedWeeks.some(function(w) { return w.year === year && w.week_number === week; });
  const content = document.getElementById('pageContent');
  if (!state.employees.length) {
    content.innerHTML = '<div class="empty-state"><h3>Inga anställda</h3><p>Lägg till anställda under fliken Anställda.</p></div>';
    return;
  }
  const rows = state.employees.map(function(emp) {
    const adj = state.salaryAdjustments[emp.id] || {};
    const chatt = parseFloat(emp.totalEarnings || 0);
    const affiliate = parseFloat(emp.totalAffiliate || 0);
    const delad = parseFloat(adj.delad_affe || 0);
    const bonus = parseFloat(adj.bonus || 0);
    const admin = parseFloat(adj.admin_pay || 0);
    const avdrag = parseFloat(adj.avdrag || 0);
    const total = chatt + affiliate + delad + bonus + admin - avdrag;
    return { emp: emp, chatt: chatt, affiliate: affiliate, delad: delad, bonus: bonus, admin: admin, avdrag: avdrag, total: total };
  });
  const g = rows.reduce(function(s,r) { return {chatt:s.chatt+r.chatt,affiliate:s.affiliate+r.affiliate,delad:s.delad+r.delad,bonus:s.bonus+r.bonus,admin:s.admin+r.admin,avdrag:s.avdrag+r.avdrag,total:s.total+r.total}; }, {chatt:0,affiliate:0,delad:0,bonus:0,admin:0,avdrag:0,total:0});
  const edit = state.isAdmin && !locked;
  var trs = rows.map(function(r) {
    var editCell = edit ? '<td><button class="btn-icon" onclick="showEmpDetails('+r.emp.id+')">&#9998;</button></td>' : '';
    var deladCell = edit ? '<input type="number" step="0.01" value="'+r.delad+'" onchange="saveAdj('+r.emp.id+',\'delad_affe\',this.value)" style="width:80px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:4px 6px;border-radius:4px;text-align:right">' : fmt(r.delad);
    var bonusCell = edit ? '<input type="number" step="0.01" value="'+r.bonus+'" onchange="saveAdj('+r.emp.id+',\'bonus\',this.value)" style="width:80px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:4px 6px;border-radius:4px;text-align:right">' : fmt(r.bonus);
    var adminCell = edit ? '<input type="number" step="0.01" value="'+r.admin+'" onchange="saveAdj('+r.emp.id+',\'admin_pay\',this.value)" style="width:80px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:4px 6px;border-radius:4px;text-align:right">' : fmt(r.admin);
    var avdragCell = edit ? '<input type="number" step="0.01" value="'+r.avdrag+'" onchange="saveAdj('+r.emp.id+',\'avdrag\',this.value)" style="width:80px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:4px 6px;border-radius:4px;text-align:right">' : fmt(r.avdrag);
    return '<tr><td>'+escHtml(r.emp.name)+'</td><td class="text-dim">'+escHtml(r.emp.nickname||'–')+'</td><td class="numeric data-cell">'+fmt(r.chatt)+'</td><td class="numeric data-cell">'+fmt(r.affiliate)+'</td><td class="numeric">'+deladCell+'</td><td class="numeric">'+bonusCell+'</td><td class="numeric">'+adminCell+'</td><td class="numeric">'+avdragCell+'</td><td class="numeric total-col">'+fmt(r.total)+'</td>'+editCell+'</tr>';
  }).join('');
  var editFoot = edit ? '<td></td>' : '';
  content.innerHTML = '<div class="card"><div class="table-wrap"><table class="salary-table"><thead><tr><th>Namn</th><th>Nickname</th><th class="numeric">Chatt</th><th class="numeric">Affiliate</th><th class="numeric">Delad affe</th><th class="numeric">Bonus</th><th class="numeric">Admin</th><th class="numeric">Avdrag</th><th class="numeric">Total</th>'+(edit?'<th></th>':'')+'</tr></thead><tbody>'+trs+'<tr style="background:rgba(233,69,96,0.08);font-weight:700"><td colspan="2">Total</td><td class="numeric total-col">'+fmt(g.chatt)+'</td><td class="numeric total-col">'+fmt(g.affiliate)+'</td><td class="numeric total-col">'+fmt(g.delad)+'</td><td class="numeric total-col">'+fmt(g.bonus)+'</td><td class="numeric total-col">'+fmt(g.admin)+'</td><td class="numeric total-col">'+fmt(g.avdrag)+'</td><td class="numeric total-col">'+fmt(g.total)+'</td>'+editFoot+'</tr></tbody></table></div></div>';
}

async function loadSalaryData() {
  const year = state.week.year;
  const week = state.week.week;
  state.employees = await api('/api/employees?year='+year+'&week='+week);
  state.salaryAdjustments = {};
  for (var i = 0; i < state.employees.length; i++) {
    var emp = state.employees[i];
    var adj = await api('/api/salary-adjustments?year='+year+'&week='+week+'&employeeId='+emp.id);
    if (adj) state.salaryAdjustments[emp.id] = adj;
  }
  state.lockedWeeks = await api('/api/locked-weeks');
}

async function saveAdj(empId, field, value) {
  const year = state.week.year;
  const week = state.week.week;
  var obj = { year: year, week: week, employeeId: empId };
  obj[field] = parseFloat(value) || 0;
  await api('/api/salary-adjustments', { method: 'POST', body: obj });
  toast('Sparad');
}

async function exportSalaryCSV() {
  const year = state.week.year;
  const week = state.week.week;
  var data = await api('/api/salary-export?year='+year+'&week='+week);
  var rows = [['Namn','Nickname','IBAN','Email','Chatt','Affiliate','Delad affe','Bonus','Admin','Avdrag','Total']];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    rows.push([r.name, r.nickname||'', r.iban||'', r.email||'', r.chatt, r.affiliate, r.delad_affe, r.bonus, r.admin_pay, r.avdrag, r.total]);
  }
  downloadCSV(rows, 'loneoversikt_v'+week+'_'+year+'.csv');
}

async function finalizeWeek() {
  const year = state.week.year;
  const week = state.week.week;
  confirmModal('Färdigställ vecka', 'Vill du låsa vecka '+week+' år '+year+'? Detta kan inte ångras.', async function() {
    try {
      await api('/api/finalize-week', {method:'POST', body:{year:year, week:week}});
      toast('Vecka '+week+' låst');
      await loadSalaryData();
      renderPage();
    } catch(e) { toast(e.message, 'error'); }
  });
}

function showEmpDetails(empId) {
  var emp = state.employees.find(function(e) { return e.id === empId; });
  if (!emp) return;
  modal('<h3>'+escHtml(emp.name)+'</h3>'+
    '<div class="form-group"><label>Namn</label><input id="mName" value="'+escHtml(emp.name)+'"></div>'+
    '<div class="form-group"><label>Nickname</label><input id="mNick" value="'+escHtml(emp.nickname||'')+'"></div>'+
    '<div class="form-group"><label>IBAN</label><input id="mIban" value="'+escHtml(emp.iban||'')+'"></div>'+
    '<div class="form-group"><label>Email</label><input id="mEmail" value="'+escHtml(emp.email||'')+'"></div>'+
    '<div class="modal-actions"><button class="btn-ghost" onclick="modalClose()">Avbryt</button><button class="btn-primary" onclick="updateEmployee('+empId+')">Spara</button></div>');
}

async function updateEmployee(empId) {
  var name = document.getElementById('mName').value.trim();
  var nickname = document.getElementById('mNick').value.trim();
  var iban = document.getElementById('mIban').value.trim();
  var email = document.getElementById('mEmail').value.trim();
  try {
    await api('/api/employees/'+empId, {method:'PUT', body:{name:name, nickname:nickname, iban:iban, email:email}});
    toast('Uppdaterad');
    window.modalClose();
    renderPage();
  } catch(e) { toast(e.message, 'error'); }
}

// ── Data Input ────────────────────────────────────────────────────────────────
var CHAT_COLS = ['Username','Date','Total Message','Live Message','Reminders','ASA','Matched','Customer Answers','Average Time','Effectiveness','Earnings','Average Char Count'];
var AFF_COLS = ['Username','Paid Earning','Unpaid Earnings','Total Sales','Rate'];
var GRID_ROWS = 20;

function buildGrid(cols, rows, idPrefix) {
  var html = '<div class="grid-cell header-cell"><span></span></div>';
  for (var c = 0; c < cols.length; c++) {
    html += '<div class="grid-cell header-cell"><span>'+escHtml(cols[c])+'</span></div>';
  }
  for (var r = 0; r < rows; r++) {
    html += '<div class="grid-cell" style="grid-column:1"><span style="padding:6px 8px;color:var(--text-dim)">'+(r+1)+'</span></div>';
    for (c = 0; c < cols.length; c++) {
      html += '<div class="grid-cell" id="'+idPrefix+'_'+r+'_'+c+'"><input type="text" id="'+idPrefix+'_inp_'+r+'_'+c+'" onpaste="handlePaste(event,\''+idPrefix+'\')"></div>';
    }
  }
  return html;
}

function buildChatGrid() { return buildGrid(CHAT_COLS, GRID_ROWS, 'chat'); }
function buildAffGrid() { return buildGrid(AFF_COLS, GRID_ROWS, 'aff'); }

function handlePaste(e, prefix) {
  e.preventDefault();
  var text = (e.clipboardData || window.clipboardData).getData('text');
  if (!text) return;
  var grid = document.getElementById(prefix + 'Grid');
  if (grid) grid.classList.add('paste-active');
  var lines = text.split('\n');
  var cols = prefix === 'chat' ? CHAT_COLS.length : AFF_COLS.length;
  var startRow = 0;
  // Skip header row if it looks like headers
  if (lines.length > 0) {
    var firstLine = lines[0].split('\t');
    var likelyHeader = false;
    if (firstLine.length >= cols) {
      var headerStr = lines[0].toLowerCase();
      if (headerStr.indexOf('username') !== -1 || headerStr.indexOf('earnings') !== -1 || headerStr.indexOf('paid') !== -1) {
        likelyHeader = true;
      }
    }
    if (likelyHeader) startRow = 1;
  }
  for (var i = 0; i < lines.length && (startRow + i) < GRID_ROWS; i++) {
    var cells = lines[i].split('\t');
    for (var c = 0; c < Math.min(cells.length, cols); c++) {
      var val = cells[c].trim();
      var inp = document.getElementById(prefix+'_inp_'+(startRow+i)+'_'+c);
      if (inp) {
        inp.value = val;
        inp.classList.add('filled');
      }
    }
  }
  setTimeout(function() { if (grid) grid.classList.remove('paste-active'); }, 800);
}

function clearChatGrid() {
  var grid = document.getElementById('chatGrid');
  if (grid) grid.querySelectorAll('input').forEach(function(inp) { inp.value = ''; inp.classList.remove('filled'); });
}

function clearAffGrid() {
  var grid = document.getElementById('affGrid');
  if (grid) grid.querySelectorAll('input').forEach(function(inp) { inp.value = ''; inp.classList.remove('filled'); });
}

function getGridData(prefix, cols) {
  var data = [];
  for (var r = 0; r < GRID_ROWS; r++) {
    var row = {};
    var empty = true;
    for (var c = 0; c < cols.length; c++) {
      var inp = document.getElementById(prefix+'_inp_'+r+'_'+c);
      var val = inp ? inp.value.trim() : '';
      if (val) empty = false;
      row[cols[c]] = val;
    }
    if (!empty) data.push(row);
  }
  return data;
}

async function saveChatData() {
  var projectId = document.getElementById('dataProject') ? document.getElementById('dataProject').value : state.projects[0].id;
  var year = state.week.year;
  var week = state.week.week;
  var data = getGridData('chat', CHAT_COLS);
  try {
    await api('/api/chat-data', {method:'POST', body:{year:year, week:week, projectId:projectId, data:data}});
    toast('Chatt-data sparat');
  } catch(e) { toast(e.message, 'error'); }
}

async function saveAffData() {
  var projectId = document.getElementById('dataProject') ? document.getElementById('dataProject').value : state.projects[0].id;
  var year = state.week.year;
  var week = state.week.week;
  var data = getGridData('aff', AFF_COLS);
  try {
    await api('/api/affiliate-data', {method:'POST', body:{year:year, week:week, projectId:projectId, data:data}});
    toast('Affiliate-data sparat');
  } catch(e) { toast(e.message, 'error'); }
}

async function loadChatData() {
  var projectId = document.getElementById('dataProject') ? document.getElementById('dataProject').value : state.projects[0].id;
  var year = state.week.year;
  var week = state.week.week;
  clearChatGrid();
  try {
    var rows = await api('/api/chat-data?year='+year+'&week='+week+'&projectId='+projectId);
    for (var i = 0; i < rows.length && i < GRID_ROWS; i++) {
      for (var c = 0; c < CHAT_COLS.length; c++) {
        var inp = document.getElementById('chat_inp_'+i+'_'+c);
        var val = rows[i][CHAT_COLS[c].replace(/ /g,'_').toLowerCase()] || rows[i][CHAT_COLS[c]] || '';
        if (inp) { inp.value = val; if (val) inp.classList.add('filled'); }
      }
    }
    toast('Chatt-data laddat');
  } catch(e) { toast(e.message, 'error'); }
}

async function loadAffData() {
  var projectId = document.getElementById('dataProject') ? document.getElementById('dataProject').value : state.projects[0].id;
  var year = state.week.year;
  var week = state.week.week;
  clearAffGrid();
  try {
    var rows = await api('/api/affiliate-data?year='+year+'&week='+week+'&projectId='+projectId);
    for (var i = 0; i < rows.length && i < GRID_ROWS; i++) {
      for (var c = 0; c < AFF_COLS.length; c++) {
        var inp = document.getElementById('aff_inp_'+i+'_'+c);
        var val = rows[i][AFF_COLS[c].replace(/ /g,'_').toLowerCase()] || rows[i][AFF_COLS[c]] || '';
        if (inp) { inp.value = val; if (val) inp.classList.add('filled'); }
      }
    }
    toast('Affiliate-data laddat');
  } catch(e) { toast(e.message, 'error'); }
}

async function renderDataInput(actions) {
  renderWeekSelector(actions);
  state.projects = await api('/api/projects');
  state.lockedWeeks = await api('/api/locked-weeks');
  var year = state.week.year;
  var week = state.week.week;
  var locked = state.lockedWeeks.some(function(w) { return w.year === year && w.week_number === week; });
  var content = document.getElementById('pageContent');
  if (!state.projects.length) {
    content.innerHTML = '<div class="empty-state"><h3>Inga projekt</h3><p>Skapa projekt under fliken Projekt.</p></div>';
    return;
  }
  var projOptions = state.projects.map(function(p) { return '<option value="'+p.id+'">'+escHtml(p.name)+'</option>'; }).join('');
  content.innerHTML = '<div class="card">'+
    '<div class="card-header">'+
      '<div class="form-group" style="margin:0;min-width:200px"><label>Projekt</label><select id="dataProject" onchange="switchDataTab(currentDataTab||\'chat\')">'+projOptions+'</select></div>'+
    '</div>'+
    '<div class="data-tabs">'+
      '<button class="data-tab active" onclick="switchDataTab(\'chat\')" id="tabChat">Chatt-data</button>'+
      '<button class="data-tab" onclick="switchDataTab(\'affiliate\')" id="tabAffiliate">Affiliate-data</button>'+
    '</div>'+
    '<div id="chatSection" class="grid-section">'+
      '<h4>Klistra in chatt-data (tabb-separerad)</h4>'+
      '<div class="paste-target chat-grid" id="chatGrid" tabindex="0" style="display:grid;grid-template-columns:repeat(13,minmax(100px,1fr));gap:1px;background-color:var(--border)">'+
        buildChatGrid()+
        '<div class="paste-hint" id="chatHint">Markera rutnätet och klistra in (Ctrl+V) — data fylls i automatiskt</div>'+
      '</div>'+
      '<div class="grid-actions">'+
        '<button class="btn-secondary" onclick="loadChatData()">Ladda sparad</button>'+
        (!locked ? '<button class="btn-primary" onclick="saveChatData()">&#128190; Spara</button>' : '<span class="lock-badge">&#128274; Låst</span>')+
        '<button class="btn-ghost" onclick="clearChatGrid()">Rensa</button>'+
      '</div>'+
    '</div>'+
    '<div id="affSection" class="grid-section hidden">'+
      '<h4>Klistra in affiliate-data (tabb-separerad)</h4>'+
      '<div class="paste-target aff-grid" id="affGrid" tabindex="0" style="display:grid;grid-template-columns:repeat(6,minmax(100px,1fr));gap:1px;background-color:var(--border)">'+
        buildAffGrid()+
        '<div class="paste-hint" id="affHint">Markera rutnätet och klistra in (Ctrl+V)</div>'+
      '</div>'+
      '<div class="grid-actions">'+
        '<button class="btn-secondary" onclick="loadAffData()">Ladda sparad</button>'+
        (!locked ? '<button class="btn-primary" onclick="saveAffData()">&#128190; Spara</button>' : '<span class="lock-badge">&#128274; Låst</span>')+
        '<button class="btn-ghost" onclick="clearAffGrid()">Rensa</button>'+
      '</div>'+
    '</div>'+
  '</div>';
  window.currentDataTab = 'chat';
}

function switchDataTab(tab) {
  window.currentDataTab = tab;
  document.getElementById('tabChat').classList.toggle('active', tab === 'chat');
  document.getElementById('tabAffiliate').classList.toggle('active', tab === 'affiliate');
  document.getElementById('chatSection').classList.toggle('hidden', tab !== 'chat');
  document.getElementById('affSection').classList.toggle('hidden', tab !== 'affiliate');
  var hint = document.getElementById('chatHint');
  if (hint) hint.style.display = tab === 'chat' ? 'flex' : 'none';
}

// ── Employees ────────────────────────────────────────────────────────────────
async function renderEmployees(actions) {
  actions.insertAdjacentHTML('beforeend', '<button class="btn-primary" onclick="addEmployee()">+ Lägg till anställd</button>');
  state.employees = await api('/api/employees');
  state.projects = await api('/api/projects');
  var content = document.getElementById('pageContent');
  if (!state.employees.length) {
    content.innerHTML = '<div class="empty-state"><h3>Inga anställda</h3><p>Klicka på "Lägg till anställd" för att börja.</p></div>';
    return;
  }
  var trs = state.employees.map(function(e) {
    return '<tr><td>'+escHtml(e.name)+'</td><td>'+escHtml(e.nickname||'–')+'</td><td>'+escHtml(e.email||'–')+'</td><td>'+escHtml(e.iban||'–')+'</td><td>'+
      '<button class="btn-icon" onclick="editEmployee('+e.id+')">&#9998;</button> '+
      '<button class="btn-icon" onclick="deleteEmployee('+e.id+')">&#128465;</button></td></tr>';
  }).join('');
  content.innerHTML = '<div class="card"><div class="table-wrap"><table><thead><tr><th>Namn</th><th>Nickname</th><th>Email</th><th>IBAN</th><th></th></tr></thead><tbody>'+trs+'</tbody></table></div></div>';
}

function addEmployee() {
  var projOptions = state.projects.map(function(p) { return '<label class="checkbox-item"><input type="checkbox" name="empProj" value="'+p.id+'"> '+escHtml(p.name)+'</label>'; }).join('');
  modal('<h3>Lägg till anställd</h3>'+
    '<div class="form-group"><label>Namn</label><input id="eName" placeholder="Fullständigt namn"></div>'+
    '<div class="form-group"><label>Nickname</label><input id="eNick" placeholder="Nickname (används i data)"></div>'+
    '<div class="form-group"><label>Email</label><input id="eEmail" placeholder="Email"></div>'+
    '<div class="form-group"><label>IBAN</label><input id="eIban" placeholder="IBAN"></div>'+
    '<div class="form-group"><label>Tilldelade projekt</label><div class="checkbox-group">'+projOptions+'</div></div>'+
    '<div class="modal-actions"><button class="btn-ghost" onclick="modalClose()">Avbryt</button><button class="btn-primary" onclick="createEmployee()">Skapa</button></div>');
}

async function createEmployee() {
  var name = document.getElementById('eName').value.trim();
  var nickname = document.getElementById('eNick').value.trim();
  var email = document.getElementById('eEmail').value.trim();
  var iban = document.getElementById('eIban').value.trim();
  var projs = Array.from(document.querySelectorAll('input[name="empProj"]:checked')).map(function(cb) { return parseInt(cb.value); });
  if (!name) { toast('Namn krävs', 'error'); return; }
  try {
    await api('/api/employees', {method:'POST', body:{name:name, nickname:nickname, email:email, iban:iban, projectIds:projs}});
    toast('Anställd skapad');
    window.modalClose();
    renderPage();
  } catch(e) { toast(e.message, 'error'); }
}

function editEmployee(empId) {
  var emp = state.employees.find(function(e) { return e.id === empId; });
  if (!emp) return;
  var projOptions = state.projects.map(function(p) {
    var checked = emp.projects && emp.projects.indexOf(p.id) !== -1 ? 'checked' : '';
    return '<label class="checkbox-item"><input type="checkbox" name="empProj" value="'+p.id+'" '+checked+'> '+escHtml(p.name)+'</label>';
  }).join('');
  modal('<h3>Redigera anställd</h3>'+
    '<div class="form-group"><label>Namn</label><input id="eName" value="'+escHtml(emp.name)+'"></div>'+
    '<div class="form-group"><label>Nickname</label><input id="eNick" value="'+escHtml(emp.nickname||'')+'"></div>'+
    '<div class="form-group"><label>Email</label><input id="eEmail" value="'+escHtml(emp.email||'')+'"></div>'+
    '<div class="form-group"><label>IBAN</label><input id="eIban" value="'+escHtml(emp.iban||'')+'"></div>'+
    '<div class="form-group"><label>Projekt</label><div class="checkbox-group">'+projOptions+'</div></div>'+
    '<div class="modal-actions"><button class="btn-ghost" onclick="modalClose()">Avbryt</button><button class="btn-primary" onclick="updateEmployee('+empId+')">Spara</button></div>');
}

async function updateEmployee(empId) {
  var name = document.getElementById('eName').value.trim();
  var nickname = document.getElementById('eNick').value.trim();
  var email = document.getElementById('eEmail').value.trim();
  var iban = document.getElementById('eIban').value.trim();
  var projs = Array.from(document.querySelectorAll('input[name="empProj"]:checked')).map(function(cb) { return parseInt(cb.value); });
  if (!name) { toast('Namn krävs', 'error'); return; }
  try {
    await api('/api/employees/'+empId, {method:'PUT', body:{name:name, nickname:nickname, email:email, iban:iban, projectIds:projs}});
    toast('Uppdaterad');
    window.modalClose();
    renderPage();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteEmployee(empId) {
  confirmModal('Ta bort anställd?', 'Detta går inte att ångra.', async function() {
    try {
      await api('/api/employees/'+empId, {method:'DELETE'});
      toast('Borttagen');
      renderPage();
    } catch(e) { toast(e.message, 'error'); }
  });
}

// ── Projects ─────────────────────────────────────────────────────────────────
async function renderProjects(actions) {
  actions.insertAdjacentHTML('beforeend', '<button class="btn-primary" onclick="addProject()">+ Nytt projekt</button>');
  state.projects = await api('/api/projects');
  var content = document.getElementById('pageContent');
  if (!state.projects.length) {
    content.innerHTML = '<div class="empty-state"><h3>Inga projekt</h3><p>Skapa ditt första projekt.</p></div>';
    return;
  }
  var trs = state.projects.map(function(p) {
    return '<tr><td>'+escHtml(p.name)+'</td><td>'+(p.employee_count||0)+' anställda</td><td>'+
      '<button class="btn-icon" onclick="editProject('+p.id+')">&#9998;</button> '+
      '<button class="btn-icon" onclick="deleteProject('+p.id+')">&#128465;</button></td></tr>';
  }).join('');
  content.innerHTML = '<div class="card"><div class="table-wrap"><table><thead><tr><th>Namn</th><th>Anställda</th><th></th></tr></thead><tbody>'+trs+'</tbody></table></div></div>';
}

function addProject() {
  modal('<h3>Nytt projekt</h3><div class="form-group"><label>Projektnamn</label><input id="pName" placeholder="t.ex. Projekt X"></div><div class="modal-actions"><button class="btn-ghost" onclick="modalClose()">Avbryt</button><button class="btn-primary" onclick="createProject()">Skapa</button></div>');
}

async function createProject() {
  var name = document.getElementById('pName').value.trim();
  if (!name) { toast('Namn krävs', 'error'); return; }
  try {
    await api('/api/projects', {method:'POST', body:{name:name}});
    toast('Projekt skapat');
    window.modalClose();
    renderPage();
  } catch(e) { toast(e.message, 'error'); }
}

function editProject(projId) {
  var proj = state.projects.find(function(p) { return p.id === projId; });
  if (!proj) return;
  modal('<h3>Redigera projekt</h3><div class="form-group"><label>Namn</label><input id="pName" value="'+escHtml(proj.name)+'"></div><div class="modal-actions"><button class="btn-ghost" onclick="modalClose()">Avbryt</button><button class="btn-primary" onclick="updateProject('+projId+')">Spara</button></div>');
}

async function updateProject(projId) {
  var name = document.getElementById('pName').value.trim();
  if (!name) { toast('Namn krävs', 'error'); return; }
  try {
    await api('/api/projects/'+projId, {method:'PUT', body:{name:name}});
    toast('Uppdaterat');
    window.modalClose();
    renderPage();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteProject(projId) {
  confirmModal('Ta bort projekt?', 'Allt data för detta projekt raderas. Detta går inte att ångra.', async function() {
    try {
      await api('/api/projects/'+projId, {method:'DELETE'});
      toast('Borttaget');
      renderPage();
    } catch(e) { toast(e.message, 'error'); }
  });
}

// ── Reader Projects ────────────────────────────────────────────────────────────
async function renderReaderProjects(actions) {
  actions.insertAdjacentHTML('beforeend', '<button class="btn-primary" onclick="assignReaderProjects()">Tilldela projekt</button>');
  var readers = await api('/api/users?role=reader');
  state.projects = await api('/api/projects');
  var content = document.getElementById('pageContent');
  if (!readers.length) {
    content.innerHTML = '<div class="empty-state"><h3>Inga läsare</h3></div>';
    return;
  }
  var html = '<div class="card"><div class="assign-grid">';
  for (var i = 0; i < readers.length; i++) {
    var r = readers[i];
    var projChecks = state.projects.map(function(p) {
      var checked = r.project_ids && r.project_ids.indexOf(p.id) !== -1 ? 'checked' : '';
      return '<label class="checkbox-item"><input type="checkbox" name="rp_'+r.id+'" value="'+p.id+'" '+checked+'> '+escHtml(p.name)+'</label>';
    }).join('');
    html += '<div class="assign-item"><h5>'+escHtml(r.display_name)+' <span style="color:var(--text-dim)">(@'+escHtml(r.username)+')</span></h5><div class="checkbox-group">'+projChecks+'</div></div>';
  }
  html += '</div><div class="mt-2"><button class="btn-primary" onclick="saveReaderProjects()">Spara behörigheter</button></div></div>';
  content.innerHTML = html;
}

async function saveReaderProjects() {
  var readers = await api('/api/users?role=reader');
  var updates = {};
  for (var i = 0; i < readers.length; i++) {
    var r = readers[i];
    var checked = Array.from(document.querySelectorAll('input[name="rp_'+r.id+'"]:checked')).map(function(cb) { return parseInt(cb.value); });
    updates[r.id] = checked;
  }
  try {
    await api('/api/reader-projects', {method:'POST', body: updates});
    toast('Behörigheter sparade');
  } catch(e) { toast(e.message, 'error'); }
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', login);
    return;
  }
  await checkAuth();
  document.getElementById('userDisplay').textContent = state.user.display_name;
  document.getElementById('roleDisplay').textContent = state.isAdmin ? 'Admin' : 'Läsare';
  document.querySelectorAll('.nav-item').forEach(function(n) {
    n.addEventListener('click', function() { navigate(this.dataset.page); });
  });
  document.querySelectorAll('.admin-only').forEach(function(el) {
    el.style.display = state.isAdmin ? '' : 'none';
  });
  navigate('salary');
}

init();
