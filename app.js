const $ = (id) => document.getElementById(id);
let teachers = [];
let currentDocTeacher = null;

async function api(url, opts = {}) {
  if (opts.body && !(opts.body instanceof FormData)) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') { showLogin(); throw new Error('Not logged in'); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Auth
function showLogin() { $('login').classList.remove('hidden'); $('app').classList.add('hidden'); }
async function showApp() {
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  const opts = await api('/api/options');
  $('fQual').innerHTML = opts.qualifications.map((v) => `<option>${v}</option>`).join('');
  $('fShift').innerHTML = opts.shifts.map((v) => `<option>${v}</option>`).join('');
  $('printDate').textContent = new Date().toLocaleDateString();
  refresh();
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('lerr').textContent = '';
  try {
    await api('/api/login', { method: 'POST', body: { username: $('lu').value, password: $('lp').value } });
    showApp();
  } catch (err) { $('lerr').textContent = err.message; }
});
$('logout').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); showLogin(); });

// ---------- Data
async function refresh() {
  const term = $('search').value.trim();
  [teachers] = await Promise.all([api('/api/teachers?q=' + encodeURIComponent(term)), loadStats()]);
  render();
}

async function loadStats() {
  const s = await api('/api/stats');
  const shifts = s.byShift.map((x) => `${esc(x.shift)}: ${x.c}`).join(' · ') || '—';
  $('stats').innerHTML = `
    <div class="stat"><div class="n">${s.total}</div><div class="l">Total teachers</div></div>
    <div class="stat"><div class="n">${s.avgExp}</div><div class="l">Avg. years of experience</div></div>
    <div class="stat"><div class="n">${s.docs}</div><div class="l">Uploaded documents</div></div>
    <div class="stat"><div class="l">By shift</div><div style="margin-top:8px;font-weight:600">${shifts}</div></div>`;
}

function render() {
  $('empty').classList.toggle('hidden', teachers.length > 0);
  $('tbody').innerHTML = teachers.map((t, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${esc(t.name)}</strong></td>
      <td>${esc(t.phone)}</td>
      <td>${esc(t.expertise)}</td>
      <td><span class="badge">${esc(t.qualification)}</span></td>
      <td>${t.experience} yrs</td>
      <td><span class="badge shift">${esc(t.shift)}</span></td>
      <td class="no-print"><button class="btn sm" data-docs="${t.id}">📎 ${t.doc_count}</button></td>
      <td class="no-print"><div class="row-actions">
        <button class="btn sm" data-edit="${t.id}">Edit</button>
        <button class="btn sm" data-profile="${t.id}">Print</button>
        <button class="btn sm danger" data-del="${t.id}">Delete</button>
      </div></td>
    </tr>`).join('');
}

$('tbody').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.edit) openForm(teachers.find((t) => t.id == b.dataset.edit));
  if (b.dataset.docs) openDocs(teachers.find((t) => t.id == b.dataset.docs));
  if (b.dataset.profile) printProfile(teachers.find((t) => t.id == b.dataset.profile));
  if (b.dataset.del) {
    const t = teachers.find((x) => x.id == b.dataset.del);
    if (confirm(`Delete ${t.name} and all their documents?`)) {
      await api('/api/teachers/' + t.id, { method: 'DELETE' });
      refresh();
    }
  }
});

let timer;
$('search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(refresh, 250); });

// ---------- Form
function openForm(t) {
  $('formTitle').textContent = t ? 'Edit Teacher' : 'Add Teacher';
  $('fId').value = t ? t.id : '';
  $('fName').value = t?.name || '';
  $('fPhone').value = t?.phone || '';
  $('fExp').value = t?.expertise || '';
  $('fQual').value = t?.qualification || $('fQual').options[0].value;
  $('fYears').value = t?.experience ?? 0;
  $('fShift').value = t?.shift || $('fShift').options[0].value;
  $('ferr').textContent = '';
  $('formModal').classList.remove('hidden');
  $('fName').focus();
}
$('addBtn').addEventListener('click', () => openForm(null));
$('teacherForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    name: $('fName').value, phone: $('fPhone').value, expertise: $('fExp').value,
    qualification: $('fQual').value, experience: $('fYears').value, shift: $('fShift').value,
  };
  try {
    const id = $('fId').value;
    await api(id ? '/api/teachers/' + id : '/api/teachers', { method: id ? 'PUT' : 'POST', body });
    $('formModal').classList.add('hidden');
    refresh();
  } catch (err) { $('ferr').textContent = err.message; }
});

// ---------- Documents
async function openDocs(t) {
  currentDocTeacher = t;
  $('docTeacher').textContent = t.name;
  $('derr').textContent = '';
  $('docFile').value = '';
  $('docModal').classList.remove('hidden');
  loadDocs();
}
async function loadDocs() {
  const docs = await api(`/api/teachers/${currentDocTeacher.id}/documents`);
  $('docList').innerHTML = docs.length
    ? docs.map((d) => `<li><a href="/files/${d.id}">${esc(d.original_name)}</a>
        <button class="btn sm danger" data-deldoc="${d.id}">Remove</button></li>`).join('')
    : '<li class="muted">No documents uploaded yet.</li>';
}
$('docList').addEventListener('click', async (e) => {
  const id = e.target.dataset.deldoc;
  if (id && confirm('Remove this document?')) {
    await api('/api/documents/' + id, { method: 'DELETE' });
    loadDocs(); refresh();
  }
});
$('docForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData();
  fd.append('file', $('docFile').files[0]);
  $('derr').textContent = '';
  try {
    await api(`/api/teachers/${currentDocTeacher.id}/documents`, { method: 'POST', body: fd });
    $('docFile').value = '';
    loadDocs(); refresh();
  } catch (err) { $('derr').textContent = err.message; }
});

// ---------- Modals
document.querySelectorAll('[data-close]').forEach((b) =>
  b.addEventListener('click', () => b.closest('.modal').classList.add('hidden')));
document.querySelectorAll('.modal').forEach((m) =>
  m.addEventListener('mousedown', (e) => { if (e.target === m) m.classList.add('hidden'); }));

// ---------- Print & Export
$('printBtn').addEventListener('click', () => window.print());
$('xlsBtn').addEventListener('click', () => (location.href = '/api/export/excel?q=' + encodeURIComponent($('search').value)));
$('csvBtn').addEventListener('click', () => (location.href = '/api/export/csv?q=' + encodeURIComponent($('search').value)));

function printProfile(t) {
  const w = window.open('', '_blank');
  const row = (l, v) => `<tr><th>${l}</th><td>${esc(v)}</td></tr>`;
  w.document.write(`<!doctype html><title>${esc(t.name)}</title>
    <style>body{font-family:Arial,sans-serif;padding:40px;color:#111}h1{margin:0 0 4px}
    .sub{color:#555;margin-bottom:24px}table{border-collapse:collapse;width:100%}
    th{width:30%;text-align:left;background:#f1f5f9}th,td{border:1px solid #cbd5e1;padding:10px 12px}
    .foot{margin-top:60px;display:flex;justify-content:space-between;color:#555;font-size:14px}</style>
    <h1>Teacher Profile</h1><div class="sub">Technical Teacher Management System</div>
    <table>${row('Full name', t.name)}${row('Phone', t.phone)}${row('Expertise', t.expertise)}
    ${row('Qualification', t.qualification)}${row('Experience', t.experience + ' years')}
    ${row('Teaching shift', t.shift)}${row('Documents on file', t.doc_count)}</table>
    <div class="foot"><span>Printed: ${new Date().toLocaleDateString()}</span><span>Signature: ____________________</span></div>
    <script>window.onload=()=>window.print()<\/script>`);
  w.document.close();
}

// ---------- Init
api('/api/me').then((r) => (r.admin ? showApp() : showLogin()));
