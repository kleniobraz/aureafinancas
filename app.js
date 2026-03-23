// ═══ SUPABASE CLIENT ══════════════════════════════════════════════════════════
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══ CONSTANTS ════════════════════════════════════════════════════════════════
const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const LS_CACHE    = 'financeiro_v4'; // localStorage cache key (fallback offline)

const CATS = {
  'Moradia':     { color: '#4D8EFF', bg: 'rgba(77,142,255,0.12)',  text: '#4D8EFF' },
  'Alimentação': { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  text: '#F59E0B' },
  'Transporte':  { color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', text: '#A78BFA' },
  'Saúde':       { color: '#F0506E', bg: 'rgba(240,80,110,0.12)',  text: '#F0506E' },
  'Educação':    { color: '#34D399', bg: 'rgba(52,211,153,0.12)',  text: '#34D399' },
  'Pessoal':     { color: '#F472B6', bg: 'rgba(244,114,182,0.12)', text: '#F472B6' },
  'Financeiro':  { color: '#94A3B8', bg: 'rgba(148,163,184,0.12)', text: '#94A3B8' },
};

function getC() {
  const light = document.body.classList.contains('light');
  return {
    bg:     light ? '#FFFFFF'               : '#0C1120',
    border: light ? 'rgba(29,78,216,0.16)'  : 'rgba(82,130,255,0.15)',
    text:   light ? '#0C1430'               : '#E8EDF8',
    muted:  light ? '#35456E'               : '#6E80A8',
    dim:    light ? '#5B6E9A'               : '#374260',
    grid:   light ? 'rgba(55,100,210,0.10)' : 'rgba(82,130,255,0.06)',
  };
}

// ═══ ANIMATION ════════════════════════════════════════════════════════════════
const HAS_GSAP = () => typeof gsap !== 'undefined';

function animStagger(selector, { y = 20, dur = 0.45, stagger = 0.07, delay = 0 } = {}) {
  if (!HAS_GSAP()) return;
  const els = typeof selector === 'string' ? document.querySelectorAll(selector) : selector;
  if (!els || !els.length) return;
  gsap.fromTo(els,
    { opacity: 0, y },
    { opacity: 1, y: 0, duration: dur, stagger, ease: 'power3.out', delay, clearProps: 'transform' }
  );
}
function animPanel(panelEl) {
  if (!HAS_GSAP()) return;
  gsap.fromTo(panelEl, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
}

let _sidebarAnimDone = false;
function animSidebar() {
  if (!HAS_GSAP() || _sidebarAnimDone) return;
  _sidebarAnimDone = true;
  gsap.fromTo('.nav-item',   { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.06, ease: 'power3.out', delay: 0.05 });
  gsap.fromTo('.month-item', { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.38, stagger: 0.04, ease: 'power3.out', delay: 0.25 });
}

function animCounters(scopeEl = document) {
  if (!HAS_GSAP()) return;
  scopeEl.querySelectorAll('.kpi-value').forEach(el => {
    const text = el.textContent.trim();
    if (!text.includes('R$')) return;
    const isNeg = text.startsWith('-');
    const raw = text.replace(/R\$\u00a0|R\$\s/g, '').replace('-', '').replace(/\./g, '').replace(',', '.');
    const target = parseFloat(raw);
    if (isNaN(target) || target === 0) return;
    const sign = isNeg ? '-' : '';
    const obj  = { v: 0 };
    gsap.to(obj, {
      v: target, duration: 1.1, ease: 'power2.out',
      onUpdate() {
        el.textContent = sign + 'R$\u00a0' + obj.v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      },
    });
  });
}

function handleRipple(e) {
  const btn = e.target.closest('.btn');
  if (!btn) return;
  const r    = document.createElement('span');
  r.className = 'btn-ripple';
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  r.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
  btn.appendChild(r);
  r.addEventListener('animationend', () => r.remove());
}

// ═══ DATA MODEL ═══════════════════════════════════════════════════════════════
let allData     = {};
let currentYear = new Date().getFullYear();
let currentMi   = new Date().getMonth(); // 0=Jan … 11=Dec
let donutChart, barChart, saldoChart;

function mKey(year, mi)  { return `${year}-${String(mi + 1).padStart(2, '0')}`; }
function curKey()        { return mKey(currentYear, currentMi); }
function getData(y, mi)  { const k = mKey(y, mi); if (!allData[k]) allData[k] = emptyMonth(); return allData[k]; }
function curData()       { return getData(currentYear, currentMi); }
function emptyMonth()    { return { isReal: false, incomes: [], expenses: [] }; }

function totalIncome(y = currentYear, mi = currentMi)  { return (getData(y, mi).incomes  || []).reduce((s, x) => s + (+x.value || 0), 0); }
function totalExpense(y = currentYear, mi = currentMi) { return (getData(y, mi).expenses || []).reduce((s, x) => s + (+x.value || 0), 0); }
function saldo(y = currentYear, mi = currentMi)        { return totalIncome(y, mi) - totalExpense(y, mi); }
function hasData(y, mi)  { const d = getData(y, mi); return d.incomes.length > 0 || d.expenses.length > 0; }
function catTotals(y = currentYear, mi = currentMi) {
  const map = {};
  (getData(y, mi).expenses || []).forEach(e => { map[e.cat] = (map[e.cat] || 0) + (+e.value || 0); });
  return map;
}

function seedCurrentMonth() {
  const key = curKey();
  allData[key] = {
    isReal: false,
    incomes: [
      { label: 'Salário principal', value: 0, note: '' },
      { label: 'Renda extra',       value: 0, note: '' },
    ],
    expenses: [
      { label: 'Moradia',      cat: 'Moradia',     value: 0, method: '' },
      { label: 'Alimentação',  cat: 'Alimentação', value: 0, method: '' },
      { label: 'Transporte',   cat: 'Transporte',  value: 0, method: '' },
    ],
  };
}

const fmt   = v => 'R$\u00a0' + (+v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct   = (v, t) => t === 0 ? 0 : Math.round((v / t) * 100);
const clone = o => JSON.parse(JSON.stringify(o));
const escHtml = s => String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ═══ AUTH ═════════════════════════════════════════════════════════════════════
const ON_LOGIN_PAGE     = !!document.getElementById('login-screen');
const ON_DASHBOARD_PAGE = !!document.getElementById('app');

function showLoginScreen() {
  window.location.replace('login.html');
}

function hideLoginScreen() {
  window.location.replace('dashboard.html');
}

function setLoginLoading(on) { _setBtnLoading('login-btn', on); }

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.style.display = 'block';
  if (HAS_GSAP()) gsap.fromTo(el, { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.25 });
}

async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  document.getElementById('login-error').style.display = 'none';

  if (!email || !password) { showLoginError('Preencha e-mail e senha.'); return; }

  setLoginLoading(true);
  const { error } = await sb.auth.signInWithPassword({ email, password });
  setLoginLoading(false);

  if (error) { showLoginError('E-mail ou senha incorretos.'); return; }
  await onAuthSuccess();
}

// ── View switcher (login / reset / reset-sent / new-password) ────────────────
const VIEW_TITLES = {
  'login':           'Planejamento 2026',
  'reset':           'Redefinir senha',
  'reset-sent':      'E-mail enviado',
  'new-password':    'Nova senha',
  'register':        'Criar conta',
  'register-sent':   'Confirme seu e-mail',
};
const ALL_VIEWS = ['login', 'reset', 'reset-sent', 'new-password', 'register', 'register-sent'];

function showView(name) {
  document.getElementById('login-error').style.display = 'none';

  // Main email+password fields only visible on login view
  document.getElementById('main-login-fields').style.display = name === 'login' ? '' : 'none';

  // Toggle views
  ALL_VIEWS.forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.style.display = v === name ? '' : 'none';
  });

  // Update subtitle
  const sub = document.querySelector('.login-subtitle');
  if (sub) sub.textContent = VIEW_TITLES[name] || '';

  // Animate in
  const viewEl = document.getElementById('view-' + name);
  if (viewEl && HAS_GSAP()) gsap.fromTo(viewEl, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' });

  // Focus
  const focusMap = { login: 'login-email', reset: 'reset-email', 'new-password': 'new-password', register: 'register-name' };
  if (focusMap[name]) setTimeout(() => document.getElementById(focusMap[name])?.focus(), 80);
}

// ── Cadastro ──────────────────────────────────────────────────────────────────
async function doRegister() {
  const firstName = document.getElementById('register-name').value.trim();
  const lastName  = document.getElementById('register-lastname').value.trim();
  const email     = document.getElementById('register-email').value.trim();
  const pass      = document.getElementById('register-password').value;
  const conf      = document.getElementById('register-password-confirm').value;

  document.getElementById('login-error').style.display = 'none';

  const consent = document.getElementById('register-consent');

  if (!firstName)          { showLoginError('Digite seu nome.'); return; }
  if (!email)              { showLoginError('Digite seu e-mail.'); return; }
  if (pass.length < 8)     { showLoginError('A senha deve ter pelo menos 8 caracteres.'); return; }
  if (pass !== conf)        { showLoginError('As senhas não coincidem.'); return; }
  if (!consent.checked)    { showLoginError('Aceite a política de privacidade para continuar.'); return; }

  _setBtnLoading('register-btn', true);
  const { error } = await sb.auth.signUp({
    email, password: pass,
    options: { data: { first_name: firstName, last_name: lastName } },
  });
  _setBtnLoading('register-btn', false);

  if (error) {
    const msg = error.message.includes('already registered')
      ? 'Este e-mail já está cadastrado. Faça login ou redefina a senha.'
      : 'Erro ao criar conta. Tente novamente.';
    showLoginError(msg);
    return;
  }

  showView('register-sent');
}

// ── Password reset ────────────────────────────────────────────────────────────
async function sendPasswordReset() {
  const email = document.getElementById('reset-email').value.trim();
  if (!email) { showLoginError('Digite seu e-mail.'); return; }

  _setBtnLoading('reset-btn', true);
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/login.html',
  });
  _setBtnLoading('reset-btn', false);

  if (error) { showLoginError('Erro ao enviar e-mail. Verifique o endereço.'); return; }
  showView('reset-sent');
}

// ── Save new password (after clicking the reset link) ────────────────────────
async function saveNewPassword() {
  const pass = document.getElementById('new-password').value;
  const conf = document.getElementById('new-password-confirm').value;

  if (!pass || pass.length < 8) { showLoginError('A senha deve ter pelo menos 8 caracteres.'); return; }
  if (pass !== conf)             { showLoginError('As senhas não coincidem.'); return; }

  _setBtnLoading('new-pass-btn', true);
  const { error } = await sb.auth.updateUser({ password: pass });
  _setBtnLoading('new-pass-btn', false);

  if (error) { console.error('Erro ao salvar senha:', error.message); showLoginError('Erro ao salvar a nova senha. Tente novamente.'); return; }

  // Password saved — user is already authenticated, load the app
  await onAuthSuccess();
}

// ── Generic button loading helper ─────────────────────────────────────────────
function _setBtnLoading(btnId, on) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = on;
  btn.querySelector('.login-btn-text').style.display   = on ? 'none'   : '';
  btn.querySelector('.login-btn-spinner').style.display = on ? 'inline' : 'none';
}

async function doLogout() {
  await sb.auth.signOut();
  allData = {};
  _sidebarAnimDone = false;
  window.location.replace('login.html');
}

async function onAuthSuccess() {
  if (ON_LOGIN_PAGE) {
    window.location.replace('dashboard.html');
    return;
  }

  const { data: { user } } = await sb.auth.getUser();
  if (user) {
    const emailEl = document.getElementById('user-email');
    if (emailEl) emailEl.textContent = user.email;

    const displayName = user.user_metadata?.first_name
      || user.email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const greetingEl = document.getElementById('topbar-greeting');
    if (greetingEl) greetingEl.innerHTML = `Olá, <strong>${displayName}</strong>!`;
  }

  await dbLoad();

  // Migrar dados do localStorage antigo (primeira vez na nuvem)
  if (Object.keys(allData).length === 0) {
    const localRaw = localStorage.getItem(LS_CACHE);
    if (localRaw) {
      try {
        const local = JSON.parse(localRaw);
        if (local.allData && Object.keys(local.allData).length > 0) {
          if (confirm('Encontramos dados salvos localmente. Deseja importá-los para a nuvem?')) {
            allData = local.allData;
            await dbSave();
            localStorage.removeItem(LS_CACHE);
            showAlert('Dados locais importados para a nuvem!', 'success');
          }
        }
      } catch(e) {}
    }
  }

  if (Object.keys(allData).length === 0) seedCurrentMonth();

  renderAll();
}

// ═══ DATABASE (Supabase) ══════════════════════════════════════════════════════
async function dbLoad() {
  try {
    const { data, error } = await sb.from('months_data').select('year, month, data');
    if (error) throw error;
    allData = {};
    (data || []).forEach(row => {
      allData[mKey(row.year, row.month - 1)] = row.data;
    });
    // cache local
    localStorage.setItem(LS_CACHE, JSON.stringify({ allData, savedAt: new Date().toISOString() }));
    return true;
  } catch(e) {
    console.warn('Supabase offline, usando cache local:', e.message);
    return dbLoadLocal();
  }
}

function dbLoadLocal() {
  try {
    const raw = localStorage.getItem(LS_CACHE);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (d.allData) { allData = d.allData; return d.savedAt; }
    return false;
  } catch(e) { return false; }
}

async function dbSave() {
  // Salva apenas meses que têm dados
  const rows = Object.entries(allData)
    .filter(([, d]) => d.incomes.length > 0 || d.expenses.length > 0)
    .map(([key, monthData]) => {
      const [y, m] = key.split('-');
      return { year: +y, month: +m, data: monthData, updated_at: new Date().toISOString() };
    });

  try {
    if (rows.length > 0) {
      const { error } = await sb.from('months_data').upsert(rows, { onConflict: 'user_id,year,month' });
      if (error) throw error;
    }
    localStorage.setItem(LS_CACHE, JSON.stringify({ allData, savedAt: new Date().toISOString() }));
    updateStorageInfo();
  } catch(e) {
    console.error('Erro ao salvar:', e.message);
    showAlert('Erro ao salvar na nuvem. Verifique a conexão.', 'danger');
    localStorage.setItem(LS_CACHE, JSON.stringify({ allData, savedAt: new Date().toISOString() }));
  }
}

function updateStorageInfo() {
  try {
    const raw = localStorage.getItem(LS_CACHE);
    const el  = document.getElementById('storage-info');
    if (el && raw) {
      const d = JSON.parse(raw);
      el.textContent = `☁ Salvo em ${new Date(d.savedAt).toLocaleString('pt-BR')}`;
    }
  } catch(e) {}
}

function exportJSON() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ allData, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' }));
  a.download = 'financeiro2026_backup.json'; a.click();
}
function importJSON() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
  inp.onchange = e => {
    const r = new FileReader(); r.readAsText(e.target.files[0]);
    r.onload = async ev => {
      try {
        const d = JSON.parse(ev.target.result);
        if (!d || typeof d.allData !== 'object' || Array.isArray(d.allData)) throw new Error('Schema inválido');
        // Valida estrutura básica de cada mês
        for (const [key, month] of Object.entries(d.allData)) {
          if (!/^\d{4}-\d{2}$/.test(key)) throw new Error('Chave inválida: ' + key);
          if (!Array.isArray(month.incomes) || !Array.isArray(month.expenses)) throw new Error('Mês sem arrays válidos');
        }
        allData = d.allData;
        await dbSave(); renderAll(); showAlert('Backup importado!', 'success');
      } catch (err) { showAlert('Erro ao importar: arquivo inválido ou corrompido.', 'danger'); }
    };
  };
  inp.click();
}

// ═══ ALERT ════════════════════════════════════════════════════════════════════
function showAlert(msg, type = 'success') {
  const el = document.getElementById('global-alert');
  el.innerHTML = `<span>${type === 'success' ? '✓' : '✕'}</span> ${msg}`;
  el.className = `show ${type}`;
  if (HAS_GSAP()) gsap.fromTo(el, { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    if (HAS_GSAP()) gsap.to(el, { opacity: 0, duration: 0.2, onComplete: () => el.classList.remove('show') });
    else el.classList.remove('show');
  }, 4000);
}

// ═══ SIDEBAR ══════════════════════════════════════════════════════════════════
function renderSidebar() {
  document.getElementById('year-label').textContent = currentYear;
  document.getElementById('month-list').innerHTML = MONTH_NAMES.map((name, mi) => {
    const sl = saldo(currentYear, mi);
    const hd = hasData(currentYear, mi);
    const slHtml = hd
      ? `<span class="month-saldo ${sl >= 0 ? 'pos' : 'neg'}">${sl >= 0 ? '+' : ''}${(sl / 1000).toFixed(1)}k</span>`
      : `<span class="month-saldo"></span>`;
    return `<div class="month-item${mi === currentMi ? ' active' : ''}${hd ? ' has-data' : ''}" onclick="selectMonth(${mi})">
      <div class="month-item-left"><span class="month-dot"></span><span>${name}</span></div>
      ${slHtml}
    </div>`;
  }).join('');
  animSidebar();
}

function selectMonth(mi) {
  currentMi = mi;
  renderSidebar();
  const active = document.querySelector('.panel.active');
  if (active) {
    const id = active.id.replace('panel-', '');
    if (id === 'visao') renderVisao();
    else if (id === 'dados') renderEditTab();
    else if (id === 'dicas') renderAnalysis();
  }
  closeSidebar();
}

function changeYear(delta) {
  currentYear += delta;
  renderSidebar();
  const active = document.querySelector('.panel.active');
  if (active) {
    const id = active.id.replace('panel-', '');
    if (id === 'visao') renderVisao();
    else if (id === 'dados') renderEditTab();
    else if (id === 'dicas') renderAnalysis();
    else if (id === 'anual') renderAnual();
  }
  if (HAS_GSAP()) {
    gsap.fromTo('#year-label',  { opacity: 0, y: delta > 0 ? 8 : -8 },  { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
    gsap.fromTo('.month-item',  { opacity: 0, x: delta > 0 ? 12 : -12 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.03, ease: 'power2.out' });
  }
}

// ═══ VISÃO GERAL ══════════════════════════════════════════════════════════════
function renderVisao() {
  const ti = totalIncome(), te = totalExpense(), sl = saldo();
  const p  = pct(te, ti);
  const annualSl = MONTH_NAMES.reduce((s, _, mi) => s + saldo(currentYear, mi), 0);

  document.getElementById('kpi-grid').innerHTML = `
    <div class="kpi">
      <div class="kpi-label">Renda · ${MONTH_NAMES[currentMi]}</div>
      <div class="kpi-value green">${fmt(ti)}</div>
      <div class="kpi-sub">${curData().incomes.length} fonte(s)</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Despesas · ${MONTH_NAMES[currentMi]}</div>
      <div class="kpi-value red">${fmt(te)}</div>
      <div class="kpi-sub">${curData().expenses.length} lançamento(s)</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Saldo livre</div>
      <div class="kpi-value ${sl >= 0 ? 'green' : 'red'}">${fmt(sl)}</div>
      <div class="kpi-sub">
        <div class="kpi-bar"><div class="kpi-bar-fill" style="width:${Math.min(p,100)}%;background:${sl>=0?'var(--accent)':'var(--red)'}"></div></div>
        ${p}% comprometido
      </div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Acumulado ${currentYear}</div>
      <div class="kpi-value ${annualSl >= 0 ? 'amber' : 'red'}" style="font-size:20px">${fmt(annualSl)}</div>
      <div class="kpi-sub">Jan–Dez ${currentYear}</div>
    </div>`;

  document.getElementById('topbar-title').textContent = `${MONTH_NAMES[currentMi]} ${currentYear}`;
  const greeting = document.getElementById('topbar-greeting');
  if (HAS_GSAP() && greeting) gsap.fromTo(greeting, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.35, ease: 'back.out(1.5)' });

  buildDonut(); buildBar(); renderBreakdown();
  animStagger('#panel-visao .kpi',      { stagger: 0.08 });
  animStagger('#panel-visao .chart-card', { stagger: 0.1, delay: 0.15 });
  animCounters(document.getElementById('panel-visao'));
}

function buildDonut() {
  const C = getC();
  const ct = catTotals(), labels = Object.keys(ct);
  const data = labels.map(k => ct[k]), colors = labels.map(k => CATS[k]?.color || '#888');
  const total = data.reduce((s, v) => s + v, 0);

  document.getElementById('donut-legend').innerHTML = labels.map((l, i) =>
    `<span class="legend-item"><span class="legend-dot" style="background:${colors[i]}"></span>${l} <span style="color:var(--text-3)">${pct(data[i],total)}%</span></span>`
  ).join('');

  if (donutChart) donutChart.destroy();
  if (!labels.length) return;
  donutChart = new Chart(document.getElementById('donutChart'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 8, borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '72%',
      animation: { animateRotate: true, duration: 900, easing: 'easeOutQuart' },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)} (${pct(ctx.raw,total)}%)` }, backgroundColor: C.bg, borderColor: C.border, borderWidth: 1, titleColor: C.text, bodyColor: C.muted, padding: 12, cornerRadius: 12 } },
    },
  });
}

function buildBar() {
  const C = getC();
  const incArr = MONTH_NAMES.map((_, mi) => totalIncome(currentYear, mi));
  const expArr = MONTH_NAMES.map((_, mi) => totalExpense(currentYear, mi));
  const slArr  = MONTH_NAMES.map((_, mi) => saldo(currentYear, mi));

  if (barChart) barChart.destroy();
  barChart = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: { labels: MONTH_NAMES, datasets: [
      { label: 'Renda',    data: incArr, backgroundColor: MONTH_NAMES.map((_, mi) => mi===currentMi?'#34D399':'rgba(52,211,153,0.22)'), borderRadius: 6, borderSkipped: false },
      { label: 'Despesas', data: expArr, backgroundColor: MONTH_NAMES.map((_, mi) => mi===currentMi?'#F0506E':'rgba(240,80,110,0.22)'), borderRadius: 6, borderSkipped: false },
      { type: 'line', label: 'Saldo', data: slArr, borderColor: '#4D8EFF', backgroundColor: 'rgba(77,142,255,0.10)', fill: true, pointBackgroundColor: '#4D8EFF', pointRadius: 4, pointBorderWidth: 0, borderWidth: 2, tension: 0.4 },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 800, easing: 'easeOutQuart' },
      plugins: { legend: { display: true, labels: { color: C.muted, boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'rect', font: { size: 11 } } }, tooltip: { backgroundColor: C.bg, borderColor: C.border, borderWidth: 1, titleColor: C.text, bodyColor: C.muted, padding: 12, cornerRadius: 12 } },
      scales: {
        x: { grid: { display: false }, ticks: { color: C.dim, font: { size: 11 } }, border: { display: false } },
        y: { grid: { color: C.grid }, border: { display: false }, ticks: { color: C.dim, font: { size: 11 }, callback: v => 'R$'+(v/1000).toFixed(0)+'k' } },
      },
    },
  });
}

function renderBreakdown() {
  const ct = catTotals(), te = totalExpense();
  if (!Object.keys(ct).length) {
    document.getElementById('breakdown-body').innerHTML = '<div class="empty-state">Sem despesas registradas neste mês.</div>';
    return;
  }
  document.getElementById('breakdown-body').innerHTML = Object.entries(ct).sort((a,b)=>b[1]-a[1]).map(([cat,val])=>{
    const p = pct(val,te), c = CATS[cat];
    return `<tr>
      <td><span class="cat-badge" style="background:${c.bg};color:${c.text}">${cat}</span></td>
      <td class="mono text-2">${fmt(val)}</td>
      <td style="width:180px"><div style="display:flex;align-items:center;gap:8px">
        <div class="bar-track" style="flex:1"><div class="bar-fill" style="width:${p}%;background:${c.color}"></div></div>
        <span style="font-size:11px;color:var(--text-3);width:28px;text-align:right">${p}%</span>
      </div></td>
    </tr>`;
  }).join('');
  animStagger('#breakdown-body tr', { y: 8, stagger: 0.05, delay: 0.2 });
}

// ═══ EDITAR MÊS ═══════════════════════════════════════════════════════════════
function renderEditTab() {
  const m = curData();
  document.getElementById('edit-month-title').textContent = `${MONTH_NAMES[currentMi]} ${currentYear}`;
  document.getElementById('edit-month-tag').innerHTML = m.isReal
    ? '<span class="m-tag real">Dados reais</span>'
    : hasData(currentYear, currentMi) ? '<span class="m-tag plan">Planejamento</span>' : '<span class="m-tag empty">Vazio</span>';

  const hasPrev = currentMi > 0 ? hasData(currentYear, currentMi-1) : hasData(currentYear-1, 11);
  document.getElementById('copy-prev-btn').style.display = hasPrev ? '' : 'none';

  renderIncomeRows(); renderExpenseRows();
  animStagger('#panel-dados .section', { stagger: 0.1 });
}

function renderIncomeRows() {
  const m = curData();
  document.getElementById('income-rows').innerHTML = m.incomes.length
    ? m.incomes.map((inc,i)=>`<tr>
        <td><input type="text" class="il-text" value="${escHtml(inc.label)}" placeholder="Fonte" onchange="curData().incomes[${i}].label=this.value"></td>
        <td><input type="number" class="il-num" value="${escHtml(inc.value)}" step="0.01" onchange="curData().incomes[${i}].value=+this.value;updateTotals()"></td>
        <td><input type="text" class="il-text" value="${escHtml(inc.note)}" placeholder="Observação" onchange="curData().incomes[${i}].note=this.value"></td>
        <td><button class="btn-icon" onclick="removeIncome(${i})" title="Remover">✕</button></td>
      </tr>`).join('')
    : `<tr><td colspan="4"><div class="empty-state" style="padding:20px">Nenhuma entrada — clique em "+ Adicionar" abaixo.</div></td></tr>`;
  updateTotals();
}

function renderExpenseRows() {
  const m = curData();
  document.getElementById('expense-rows').innerHTML = m.expenses.length
    ? m.expenses.map((ex,i)=>{
        const opts = Object.keys(CATS).map(k=>`<option value="${k}"${k===ex.cat?' selected':''}>${k}</option>`).join('');
        return `<tr>
          <td><input type="text" class="il-text" value="${escHtml(ex.label)}" placeholder="Descrição" onchange="curData().expenses[${i}].label=this.value"></td>
          <td><select class="il-sel" onchange="curData().expenses[${i}].cat=this.value">${opts}</select></td>
          <td><input type="number" class="il-num" value="${escHtml(ex.value)}" step="0.01" onchange="curData().expenses[${i}].value=+this.value;updateTotals()"></td>
          <td><input type="text" class="il-text" value="${escHtml(ex.method)}" placeholder="PIX, cartão..." onchange="curData().expenses[${i}].method=this.value"></td>
          <td><button class="btn-icon" onclick="removeExpense(${i})" title="Remover">✕</button></td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5"><div class="empty-state" style="padding:20px">Nenhuma despesa — clique em "+ Adicionar" abaixo.</div></td></tr>`;
  updateTotals();
}

function updateTotals() {
  document.getElementById('income-total').textContent  = fmt(totalIncome());
  document.getElementById('expense-total').textContent = fmt(totalExpense());
}

function addIncome()      { const m=getData(currentYear,currentMi); m.incomes.push({label:'Nova entrada',value:0,note:''}); m.isReal=true; renderIncomeRows(); renderSidebar(); }
function addExpense()     { const m=getData(currentYear,currentMi); m.expenses.push({label:'Nova despesa',cat:'Pessoal',value:0,method:'PIX'}); m.isReal=true; renderExpenseRows(); renderSidebar(); }
function removeIncome(i)  { curData().incomes.splice(i,1);  renderIncomeRows(); }
function removeExpense(i) { curData().expenses.splice(i,1); renderExpenseRows(); }

function copyFromPrev() {
  const prevY = currentMi > 0 ? currentYear : currentYear-1;
  const prevMi = currentMi > 0 ? currentMi-1 : 11;
  if (!hasData(prevY,prevMi)) return showAlert(`${MONTH_NAMES[prevMi]} ${prevY} não tem dados.`,'danger');
  if (!confirm(`Copiar dados de ${MONTH_NAMES[prevMi]} ${prevY} para ${MONTH_NAMES[currentMi]} ${currentYear}?`)) return;
  allData[curKey()] = clone(getData(prevY, prevMi));
  allData[curKey()].isReal = false;
  renderEditTab(); renderSidebar();
  showAlert(`Dados de ${MONTH_NAMES[prevMi]} ${prevY} copiados!`,'success');
}

function clearMonth() {
  if (!confirm(`Limpar todos os dados de ${MONTH_NAMES[currentMi]} ${currentYear}?`)) return;
  allData[curKey()] = emptyMonth();
  renderEditTab(); renderSidebar();
  showAlert(`${MONTH_NAMES[currentMi]} ${currentYear} limpo.`,'success');
}

async function saveData() {
  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = 'Salvando…';
  await dbSave();
  renderAll();
  showAlert('Dados salvos na nuvem!','success');
  btn.disabled = false;
  btn.textContent = 'Salvar dados';
}

// ═══ RESUMO ANUAL ═════════════════════════════════════════════════════════════
function renderAnual() {
  let cum=0, ti_total=0, te_total=0;
  const rows = MONTH_NAMES.map((name,mi)=>{
    const ti=totalIncome(currentYear,mi), te=totalExpense(currentYear,mi), sl=saldo(currentYear,mi);
    cum+=sl; ti_total+=ti; te_total+=te;
    const d=getData(currentYear,mi);
    const tag=d.isReal?'<span class="m-tag real">real</span>':hasData(currentYear,mi)?'<span class="m-tag plan">plan</span>':'<span class="m-tag empty">—</span>';
    return `<tr${mi===currentMi?' class="annual-row-current"':''}>
      <td class="${mi===currentMi?'fw-600 text-2':'text-2'}">${name} ${tag}</td>
      <td class="mono ${ti?'text-green':'text-muted'}">${ti?fmt(ti):'—'}</td>
      <td class="mono ${te?'text-red':'text-muted'}">${te?fmt(te):'—'}</td>
      <td class="mono fw-600 ${sl>=0?'text-green':'text-red'}">${(ti||te)?fmt(sl):'—'}</td>
      <td class="mono ${cum>=0?'text-green':'text-red'}">${(ti||te)?fmt(cum):'—'}</td>
    </tr>`;
  }).join('');

  document.getElementById('annual-table').innerHTML = `
    <thead><tr><th>Mês</th><th>Renda</th><th>Despesas</th><th>Saldo</th><th>Acumulado</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td>Total ${currentYear}</td>
      <td class="${ti_total?'text-green':''}">${fmt(ti_total)}</td>
      <td class="${te_total?'text-red':''}">${fmt(te_total)}</td>
      <td class="${(ti_total-te_total)>=0?'text-green':'text-red'}">${fmt(ti_total-te_total)}</td>
      <td></td>
    </tr></tfoot>`;

  const el = document.getElementById('annual-section-title');
  if (el) el.textContent = `Mês a mês · ${currentYear}`;

  document.getElementById('annual-kpi').innerHTML = `
    <div class="kpi"><div class="kpi-label">Renda total ${currentYear}</div><div class="kpi-value green" style="font-size:20px">${fmt(ti_total)}</div></div>
    <div class="kpi"><div class="kpi-label">Despesas total ${currentYear}</div><div class="kpi-value red" style="font-size:20px">${fmt(te_total)}</div></div>
    <div class="kpi"><div class="kpi-label">Saldo acumulado</div><div class="kpi-value ${(ti_total-te_total)>=0?'amber':'red'}" style="font-size:20px">${fmt(ti_total-te_total)}</div></div>`;

  let acc=0;
  const accArr = MONTH_NAMES.map((_,mi)=>{ acc+=saldo(currentYear,mi); return acc; });
  const C = getC();
  if (saldoChart) saldoChart.destroy();
  saldoChart = new Chart(document.getElementById('saldoChart'),{
    type:'line',
    data:{labels:MONTH_NAMES,datasets:[{label:'Saldo acumulado',data:accArr,borderColor:'#4D8EFF',backgroundColor:'rgba(77,142,255,0.09)',fill:true,pointBackgroundColor:accArr.map(v=>v>=0?'#34D399':'#F0506E'),pointRadius:5,pointBorderWidth:0,borderWidth:2.5,tension:0.4}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:900,easing:'easeOutQuart'},plugins:{legend:{display:false},tooltip:{backgroundColor:C.bg,borderColor:C.border,borderWidth:1,titleColor:C.text,bodyColor:C.muted,padding:12,cornerRadius:12}},scales:{x:{grid:{display:false},ticks:{color:C.dim,font:{size:11}},border:{display:false}},y:{grid:{color:C.grid},border:{display:false},ticks:{color:C.dim,font:{size:11},callback:v=>'R$'+(v/1000).toFixed(0)+'k'}}}},
  });

  animStagger('#annual-kpi .kpi',       { stagger: 0.09 });
  animStagger('#annual-table tbody tr', { y: 6, stagger: 0.04, delay: 0.1 });
  animCounters(document.getElementById('annual-kpi'));
}

// ═══ ANÁLISE & DICAS ══════════════════════════════════════════════════════════
function renderAnalysis() {
  const ti=totalIncome(), te=totalExpense(), sl=saldo(), ct=catTotals();
  document.getElementById('analysis-month-label').textContent = `${MONTH_NAMES[currentMi]} ${currentYear}`;

  if (!ti&&!te) {
    document.getElementById('analysis-content').innerHTML='<div class="empty-state"><strong>Sem dados neste mês</strong>Adicione receitas e despesas em "Editar Mês".</div>';
    document.getElementById('tips-content').innerHTML=''; return;
  }

  // ── Métricas base ──────────────────────────────────────────────────────────
  const pctComp   = pct(te, ti);
  const savingRate= ti>0 ? Math.round((sl/ti)*100) : 0;
  const pctMor    = pct(ct['Moradia']||0, ti);      // moradia como % da renda
  const pctAlim   = pct(ct['Alimentação']||0, te);
  const pctTran   = pct(ct['Transporte']||0, te);
  const pctPes    = pct(ct['Pessoal']||0, te);
  const pctFin    = pct(ct['Financeiro']||0, te);

  // ── Comparação com mês anterior ──────────────────────────────────────────
  const prevMi  = currentMi>0 ? currentMi-1 : 11;
  const prevY   = currentMi>0 ? currentYear : currentYear-1;
  const hasPrev = hasData(prevY, prevMi);
  const prevTe  = hasPrev ? totalExpense(prevY, prevMi) : 0;
  const diffTe  = hasPrev ? te - prevTe : 0;
  const diffPct = hasPrev&&prevTe>0 ? Math.round((diffTe/prevTe)*100) : 0;

  // ── Meses à frente sem planejamento ──────────────────────────────────────
  const mVazios = MONTH_NAMES.filter((_,mi)=>!hasData(currentYear,mi)&&mi>currentMi).length;

  // ── KPIs da análise ───────────────────────────────────────────────────────
  const budgetColor  = pctComp>90?'var(--red)':pctComp>75?'var(--amber)':'var(--accent)';
  const budgetStatus = pctComp>90?'Crítico':pctComp>75?'Atenção':pctComp>50?'Moderado':'Saudável';
  const savColor     = savingRate>=20?'var(--accent)':savingRate>=10?'var(--amber)':'var(--red)';
  const savStatus    = savingRate>=20?'Excelente':savingRate>=10?'Razoável':'Baixa';

  const kpis = [
    ['Comprometido', pctComp+'%',   budgetColor, budgetStatus],
    ['Economia',     savingRate+'%', savColor,    savStatus],
    ...(ct['Alimentação'] ? [['Alimentação', pctAlim+'%', pctAlim>30?'var(--red)':pctAlim>20?'var(--amber)':'var(--accent)', pctAlim>30?'Alta':pctAlim>20?'Atenção':'OK']] : []),
    ...(ct['Transporte']  ? [['Transporte',  pctTran+'%', pctTran>25?'var(--red)':pctTran>15?'var(--amber)':'var(--accent)', pctTran>25?'Alto':pctTran>15?'Moderado':'OK']] : []),
  ];

  document.getElementById('analysis-content').innerHTML=`
    <div class="analysis-kpi-grid">
      ${kpis.map(([label,val,color,status])=>`
        <div class="analysis-kpi" style="border-left:3px solid ${color}">
          <div class="label">${label}</div>
          <div class="val" style="color:${color}">${val}</div>
          <div class="status" style="color:${color};opacity:0.7">${status}</div>
        </div>`).join('')}
    </div>
    <div style="font-size:13px;color:var(--text-2);line-height:1.9;margin-top:4px">
      <p>
        <span style="color:var(--text)">Saldo livre:</span>
        <span class="mono ${sl>=0?'text-green':'text-red'}">${fmt(sl)}</span>
        ${ti>0?' · '+savingRate+'% da renda.':''}
        ${sl>0&&savingRate>=20?' Excelente — continue poupando!':sl>0&&savingRate>=10?' Há espaço para poupar mais.':sl>0?' Margem baixa — tente reduzir ao menos uma categoria.':sl===0?' Equilibrado, mas sem margem de segurança.':' Despesas acima da renda — atenção urgente.'}
      </p>
      ${hasPrev&&prevTe>0?`<p style="margin-top:8px">
        <span style="color:var(--text)">Vs. ${MONTH_NAMES[prevMi]}:</span>
        despesas ${diffTe>0?`aumentaram ${fmt(Math.abs(diffTe))} (+${diffPct}%)`:diffTe<0?`diminuíram ${fmt(Math.abs(diffTe))} (${diffPct}%)`:'ficaram iguais'}.
      </p>`:''}
      ${ct['Moradia']?`<p style="margin-top:8px">
        <span style="color:var(--text)">Moradia (${fmt(ct['Moradia'])}):</span>
        ${pctMor}% da renda. ${pctMor>40?'Acima do recomendado — o ideal é até 30% da renda.':pctMor>30?'Levemente acima do ideal (30%).':'Dentro do esperado.'}
      </p>`:''}
      ${ct['Financeiro']?`<p style="margin-top:8px">
        <span style="color:var(--text)">Dívidas e juros (${fmt(ct['Financeiro'])}):</span>
        ${pctFin}% das despesas. ${pctFin>15?'Nível preocupante — priorize quitar as dívidas mais caras.':'Controlado.'}
      </p>`:''}
    </div>`;

  // ── Dicas personalizadas ──────────────────────────────────────────────────
  const tips = [
    // Saldo negativo — prioridade máxima
    sl < 0 &&
      { type:'danger', icon:'🚨', title:'Despesas acima da renda',
        text:`Você gastou ${fmt(Math.abs(sl))} a mais do que recebeu em ${MONTH_NAMES[currentMi]}. Identifique ao menos uma despesa para cortar ou renegociar imediatamente.` },

    // Orçamento crítico mas saldo positivo
    pctComp>90 && sl>=0 &&
      { type:'danger', icon:'⚠️', title:'Orçamento crítico',
        text:`${pctComp}% da renda está comprometida — sobram apenas ${fmt(sl)}. Qualquer imprevisto pode gerar dívida. Tente reduzir pelo menos uma categoria.` },

    // Ótima economia
    sl>0 && savingRate>=20 &&
      { type:'success', icon:'🏆', title:'Taxa de economia excelente',
        text:`Você está economizando ${savingRate}% da renda (${fmt(sl)}). Para esse dinheiro trabalhar, considere CDB, Tesouro Direto ou fundo de renda fixa.` },

    // Economia possível mas baixa
    sl>0 && savingRate>0 && savingRate<20 &&
      { type:'success', icon:'💰', title:'Guarde agora',
        text:`Você tem ${fmt(sl)} de sobra em ${MONTH_NAMES[currentMi]}. Transfira ao menos ${fmt(sl*0.5)} para uma conta separada — a meta ideal é poupar 20% da renda.` },

    // Reserva de emergência
    te>0 && sl<(te*3) &&
      { type:'info', icon:'🏦', title:'Construa sua reserva de emergência',
        text:`Com ${fmt(te)} de despesas mensais, a reserva ideal é de ${fmt(te*3)} a ${fmt(te*6)} (3 a 6 meses). Comece separando um valor fixo todo mês, mesmo que pequeno.` },

    // Moradia cara
    ct['Moradia'] && pctMor > 40 &&
      { type:'warning', icon:'🏠', title:'Moradia acima do ideal',
        text:`Moradia consome ${pctMor}% da renda (${fmt(ct['Moradia'])}). O recomendado é até 30%. Avalie renegociar aluguel, dividir despesas fixas ou reduzir contas de serviços.` },

    // Alimentação cara
    ct['Alimentação'] && pctAlim > 30 &&
      { type:'warning', icon:'🍽️', title:'Alimentação elevada',
        text:`Alimentação representa ${pctAlim}% das despesas (${fmt(ct['Alimentação'])}). Planejar as refeições da semana e cozinhar em casa pode reduzir esse gasto em até 30%.` },

    // Transporte alto
    ct['Transporte'] && pctTran > 25 &&
      { type:'warning', icon:'🚗', title:'Transporte alto',
        text:`Transporte representa ${pctTran}% das despesas (${fmt(ct['Transporte'])}). Revise corridas por aplicativo, combustível e estacionamentos — pequenos ajustes fazem diferença.` },

    // Gastos pessoais altos
    ct['Pessoal'] && pctPes > 20 &&
      { type:'warning', icon:'👤', title:'Gastos pessoais elevados',
        text:`Gastos pessoais correspondem a ${pctPes}% das despesas (${fmt(ct['Pessoal'])}). Revise assinaturas, lazer e compras não essenciais para liberar margem.` },

    // Dívidas altas
    ct['Financeiro'] && pctFin > 15 &&
      { type:'danger', icon:'💳', title:'Atenção com dívidas',
        text:`Juros e parcelas representam ${pctFin}% das despesas (${fmt(ct['Financeiro'])}). Priorize quitar as dívidas com maior taxa de juros primeiro — isso libera renda no médio prazo.` },

    // Investindo em educação — reforço positivo
    ct['Educação'] &&
      { type:'success', icon:'📚', title:'Investindo em educação',
        text:`Você destinou ${fmt(ct['Educação'])} para educação este mês. Esse é um dos investimentos com melhor retorno a longo prazo — continue!` },

    // Tendência de aumento de despesas
    hasPrev && diffTe>0 && diffPct>=15 &&
      { type:'warning', icon:'📈', title:'Despesas crescendo',
        text:`Suas despesas aumentaram ${diffPct}% em relação a ${MONTH_NAMES[prevMi]} (${fmt(diffTe)} a mais). Identifique o que mudou e avalie se é necessário ou passageiro.` },

    // Tendência de queda — reforço positivo
    hasPrev && diffTe<0 && Math.abs(diffPct)>=10 &&
      { type:'success', icon:'📉', title:'Despesas em queda',
        text:`Ótimo! Você reduziu ${fmt(Math.abs(diffTe))} em despesas comparado a ${MONTH_NAMES[prevMi]} (−${Math.abs(diffPct)}%). Esse controle faz grande diferença no acumulado do ano.` },

    // Meses sem planejamento
    mVazios>0 &&
      { type:'info', icon:'📅', title:`${mVazios} ${mVazios===1?'mês':'meses'} sem planejamento`,
        text:`Você ainda não planejou ${mVazios} ${mVazios===1?'mês':'meses'} restante${mVazios===1?'':'s'} do ano. Use "Copiar mês anterior" para preencher rapidamente e ter uma visão completa.` },
  ].filter(Boolean);

  document.getElementById('tips-content').innerHTML = tips.length
    ? tips.map(t=>`<div class="tip-card ${t.type}"><div class="tip-icon">${t.icon}</div><div class="tip-title">${t.title}</div><div class="tip-text">${t.text}</div></div>`).join('')
    : '<div class="empty-state"><strong>Tudo sob controle!</strong>Nenhuma recomendação crítica para este mês. Continue assim.</div>';

  animStagger('.analysis-kpi',{stagger:0.08});
  animStagger('.tip-card',{y:16,stagger:0.1,delay:0.2});
}

// ═══ TABS ═════════════════════════════════════════════════════════════════════
function showTab(id, el) {
  const prev = document.querySelector('.panel.active');
  function doSwitch() {
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    document.querySelectorAll('.bnav-item').forEach(n=>n.classList.remove('active'));
    const panel = document.getElementById('panel-'+id);
    panel.classList.add('active');
    el.classList.add('active');
    // Sincroniza sidebar nav e bottom nav
    const sideNav = document.querySelector(`.nav-item[onclick*="'${id}'"]`);
    if (sideNav) sideNav.classList.add('active');
    const bNav = document.querySelector(`.bnav-item[data-tab="${id}"]`);
    if (bNav) bNav.classList.add('active');
    if (id==='anual') renderAnual();
    else if (id==='dicas') renderAnalysis();
    else if (id==='dados') renderEditTab();
    else renderVisao();
    animPanel(panel);
    closeSidebar();
  }
  if (prev && HAS_GSAP()) gsap.to(prev,{opacity:0,duration:0.15,ease:'power1.in',onComplete:doSwitch});
  else doSwitch();
}

// ═══ MOBILE DRAWER ════════════════════════════════════════════════════════════
function toggleSidebar() {
  const app = document.getElementById('app');
  app.classList.toggle('sidebar-open');
}
function closeSidebar() {
  document.getElementById('app').classList.remove('sidebar-open');
}

// ═══ TEMA ═════════════════════════════════════════════════════════════════════
function initTheme() {
  const isLight = localStorage.getItem('theme')==='light';
  if (isLight) document.body.classList.add('light');
  _updateThemeBtn(isLight); // _updateThemeBtn already calls _swapLogo
}
function toggleTheme() {
  document.body.classList.add('theme-switching');
  const isLight = document.body.classList.toggle('light');
  localStorage.setItem('theme', isLight?'light':'dark');
  _updateThemeBtn(isLight);
  const active = document.querySelector('.panel.active');
  if (active) { const id=active.id.replace('panel-',''); if(id==='visao'){buildDonut();buildBar();} if(id==='anual')renderAnual(); }
  setTimeout(() => document.body.classList.remove('theme-switching'), 450);
}
function _updateThemeBtn(isLight=document.body.classList.contains('light')) {
  const icon=document.getElementById('theme-icon'), btn=document.getElementById('theme-toggle');
  if (!icon||!btn) return;
  icon.textContent = isLight?'☀️':'🌙';
  btn.title = isLight?'Modo noturno':'Modo claro';
  _swapLogo(isLight);
}
function _swapLogo(isLight) {
  const logo = document.getElementById('sidebar-logo-img');
  if (!logo) return;
  const next = isLight ? 'assets/images/aurea-black.png' : 'assets/images/aurea.png';
  if (logo.src.endsWith(next.split('/').pop())) return; // já é a logo certa
  logo.classList.add('logo-fading');
  setTimeout(() => {
    logo.src = next;
    logo.classList.remove('logo-fading');
  }, 180);
}

// ═══ RENDER ALL & INIT ════════════════════════════════════════════════════════
function renderAll() { renderSidebar(); renderVisao(); updateStorageInfo(); }

// Enter key — ativa o botão primário da view atual (só na página de login)
if (ON_LOGIN_PAGE) {
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (document.getElementById('view-reset').style.display        !== 'none') { sendPasswordReset(); return; }
    if (document.getElementById('view-new-password').style.display !== 'none') { saveNewPassword();   return; }
    if (document.getElementById('view-login').style.display        !== 'none') { doLogin();           return; }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  document.addEventListener('click', handleRipple);

  const { data: { session: activeSession } } = await sb.auth.getSession();

  if (ON_LOGIN_PAGE) {
    // Se já logado, vai direto pro dashboard
    if (activeSession) {
      window.location.replace('dashboard.html');
      return;
    }
    // Mostra card de login com animação
    if (HAS_GSAP()) gsap.fromTo('.login-card', { opacity: 0, y: 24, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'power3.out' });
    // Warn se credenciais não preenchidas
    if (SUPABASE_URL.includes('COLE_') || SUPABASE_ANON_KEY.includes('COLE_')) {
      document.getElementById('login-config-warn').style.display = 'block';
      document.getElementById('login-btn').disabled = true;
    }
    // Detecta link de recuperação de senha
    sb.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') showView('new-password');
    });

  } else if (ON_DASHBOARD_PAGE) {
    // Se não logado, redireciona pro login
    if (!activeSession) {
      window.location.replace('login.html');
      return;
    }
    await onAuthSuccess();
    sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') window.location.replace('login.html');
    });
  }
});
