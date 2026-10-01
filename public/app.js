import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, LOGIN_DOMAIN, VAPID_PUBLIC_KEY } from './config.js';

// ---------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------
// Shown in the help sheet, so anyone can check their phone has the latest app.
// Keep in step with the ?v= in index.html.
const APP_VERSION = '55';
const BUCKET = 'vehicle-photos';
const PURGE_DAYS = 30;

// Keys are stored in the database; labels can change freely. Anyone on staff
// can mark any service (who/when is recorded by the database).
const SERVICES = [
  { key: 'first',      label: 'First Clean / Tar Remove' },
  { key: 'decrome',    label: 'Window Tint / Dechrome' },
  { key: 'polish',     label: 'Polish / Compound' },
  { key: 'full',       label: 'Full Valet' },
  { key: 'windscreen', label: 'Windscreen' },
  { key: 'repair',     label: 'Repair / Body Shop' },
];
const SERVICE = Object.fromEntries(SERVICES.map(s => [s.key, s]));
const NEXT_STATE = { pending: 'doing', doing: 'done', done: 'pending' };

const COLOURS = [
  ['White', '#ffffff'], ['Black', '#111111'], ['Grey', '#8a8f98'], ['Brooklyn Grey', '#8c949b'], ['Silver', '#c9ccd1'],
  ['Blue', '#2f5fd0'], ['Red', '#c9302c'], ['Green', '#2e8b57'], ['Beige', '#d8c8a8'],
  ['Brown', '#7a4e2d'], ['Orange', '#f08a24'], ['Yellow', '#f2c230'],
];
const COLOUR_HEX = Object.fromEntries(COLOURS.map(([n, h]) => [n.toLowerCase(), h]));

// Tabs are views, not the database status (see tabOf): the DB status
// 'in_prep' means "sold, not delivered yet".
const TAB_TITLE = { stock: 'Stock', in_prep: 'In prep', sold: 'Sold', bodyshop: 'Bodyshop', dent: 'Dent', loan: 'Loan', delivered: 'Delivered' };

const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><circle cx="17" cy="9" r="2.8"/><path d="M16.5 14.6c2.6.2 4.4 2 5 4.9"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.6-3 4.5"/><circle cx="12" cy="18" r=".6" fill="currentColor"/></svg>',
  report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.3l1.6-2.2h7.2L17.2 7h2.3A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/><circle cx="12" cy="13" r="3.8"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  // Car silhouette shown where a car has no photo yet
  car: '<svg viewBox="0 0 64 40" fill="currentColor" aria-hidden="true"><path d="M13 28a5 5 0 1 0 10 0 5 5 0 0 0-10 0zm28 0a5 5 0 1 0 10 0 5 5 0 0 0-10 0z" opacity=".9"/><path d="M8.5 27.5C5 27.3 3 25.8 3 23.2v-3.4c0-2 1.3-3.4 3.4-3.9l7.8-1.9 7.2-6.3C23.5 5.9 26 5 29 5h8.6c2.7 0 5 1 6.9 2.9l6.1 6.3 5.6 1.2c2.6.6 4.3 2.6 4.3 5.3v2.9c0 2.4-1.7 3.8-4.6 3.9h-1.2a7 7 0 0 0-13.4 0H23.6a7 7 0 0 0-13.4 0zM24.6 14.4h10.2V8.6h-5.3c-1.9 0-3.4.6-4.8 1.8l-4.6 4zm13.9 0h9.7l-4.4-4.5c-1.2-1.2-2.8-1.9-4.6-1.9h-.7z" opacity=".55"/></svg>',
  // Play button on a screen: training videos
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="3.5"/><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = v => String(v ?? '').trim();
const plate = v => clean(v).toUpperCase().replace(/\s+/g, ' ');
const norm = v => String(v ?? '').toLowerCase().replace(/[\s-]/g, '');

function fmtDate(ts, withTime = true) {
  if (!ts) return '';
  const d = new Date(ts);
  const date = d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
  return withTime ? `${date} ${d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })}` : date;
}

// Delivery dates are plain 'YYYY-MM-DD' strings in local time.
function dayDiff(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${dateStr}T00:00`) - today) / 864e5);
}

function dayName(dateStr) {
  const diff = dayDiff(dateStr);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return new Date(`${dateStr}T00:00`).toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
}

// "Today · 5PM", "Fri 2 Oct", or the old free-text day for older records.
function deliveryLabel(v) {
  const day = v.delivery_date ? dayName(v.delivery_date) : clean(v.delivery_day);
  return [day, clean(v.delivery_time)].filter(Boolean).join(' · ');
}

// "Ana Paula" → "ana.paula@m6.local". A full email (contains @) is used as-is.
function loginEmail(input) {
  const v = clean(input).toLowerCase();
  if (v.includes('@')) return v;
  const slug = v.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
  return `${slug}@${LOGIN_DOMAIN}`;
}

function loginName(email) {
  return email?.endsWith(`@${LOGIN_DOMAIN}`) ? email.slice(0, -LOGIN_DOMAIN.length - 1) : email;
}

function initials(name) {
  return clean(name).split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?';
}

function toast(message, { error = false, action = null, ms = 3500 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' error' : '');
  el.innerHTML = `<span>${esc(message)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { el.remove(); action.run(); };
    el.append(b);
  }
  $('#toasts').append(el);
  setTimeout(() => el.remove(), action ? Math.max(ms, 6000) : ms);
}

function errorText(err) {
  const msg = err?.message || String(err);
  if (/^This job belongs to/.test(msg)) return msg;
  if (err?.code === '42501' || /row-level security|not allowed/i.test(msg)) return 'You don’t have permission to do that.';
  if (/plate_required/.test(msg)) return 'Enter at least one registration.';
  return msg;
}

// Destructive buttons need a second tap within 3s.
function confirmTap(btn, label = 'Tap again to confirm') {
  if (btn.dataset.armed) {
    clearTimeout(+btn.dataset.armed);
    delete btn.dataset.armed;
    return true;
  }
  const original = btn.innerHTML;
  btn.classList.add('armed');
  btn.textContent = label;
  btn.dataset.armed = setTimeout(() => {
    delete btn.dataset.armed;
    btn.classList.remove('armed');
    btn.innerHTML = original;
  }, 3000);
  return false;
}

async function compressImage(file, maxSide = 1400, quality = 0.82) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise(res => canvas.toBlob(b => res(b || file), 'image/jpeg', quality));
  } catch {
    return file;
  }
}

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
const S = {
  session: null,
  me: null,                 // current user's profile
  profiles: new Map(),      // id → profile
  vehicles: new Map(),      // id → row
  photoUrls: new Map(),     // storage path → signed URL
  tab: 'sold',
  view: 'main',
  search: '',
  channel: null,
  supplies: [],
  suppliesReady: false,
  myMonth: null,            // my finished jobs this month (show_count), or null
};

const configured = !SUPABASE_URL.includes('YOUR-') && !SUPABASE_ANON_KEY.includes('YOUR-');
// "Keep me signed in": the session lives in localStorage (survives closing the
// browser) when ticked, otherwise in sessionStorage (gone when the browser closes).
const REMEMBER_KEY = 'm6.remember';
const LOGIN_KEY = 'm6.login';
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch {} },
};
const authStorage = {
  area() {
    try { return store.get(REMEMBER_KEY) === '0' ? sessionStorage : localStorage; } catch { return null; }
  },
  getItem(key) { try { return this.area()?.getItem(key) ?? null; } catch { return null; } },
  setItem(key, value) { try { this.area()?.setItem(key, value); } catch {} },
  removeItem(key) {
    try { localStorage.removeItem(key); } catch {}
    try { sessionStorage.removeItem(key); } catch {}
  },
};

const sb = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storage: authStorage, persistSession: true, autoRefreshToken: true } })
  : null;

const isAdmin = () => !!S.me?.is_admin;
const nameOf = id => S.profiles.get(id)?.display_name || 'Someone';

// ---------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------
async function loadAll() {
  const [p, v] = await Promise.all([
    sb.from('profiles').select('*'),
    sb.from('vehicles').select('*'),
  ]);
  const err = p.error || v.error;
  if (err) throw err;

  S.profiles = new Map(p.data.map(x => [x.id, x]));
  S.me = S.profiles.get(S.session.user.id) ?? null;
  S.vehicles = new Map(v.data.map(x => [x.id, x]));
  await Promise.all([refreshPhotoUrls(), loadSupplies(), loadMyMonth()]);
}

// Supplies requested by the team. Loaded separately so the app still works
// if the supplies table doesn't exist yet.
async function loadSupplies() {
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const { data, error } = await sb.from('supplies').select('*')
    .or(`status.neq.done,updated_at.gte.${since}`).order('requested_at');
  S.supplies = error ? [] : data;
  S.suppliesReady = !error;
}

async function refreshPhotoUrls() {
  const missing = [...S.vehicles.values()].map(v => v.photo_path).filter(p => p && !S.photoUrls.has(p));
  if (!missing.length) return;
  const { data } = await sb.storage.from(BUCKET).createSignedUrls([...new Set(missing)], 60 * 60 * 12);
  for (const item of data ?? []) if (item.signedUrl) S.photoUrls.set(item.path, item.signedUrl);
}

function upsertLocal(row) {
  S.vehicles.set(row.id, row);
}

let renderQueued = false;
function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(async () => {
    renderQueued = false;
    await refreshPhotoUrls();
    renderAll();
  });
}

function subscribe() {
  sb.getChannels().forEach(ch => sb.removeChannel(ch));
  S.channel = sb.channel(`prep-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, payload => {
      if (payload.eventType === 'DELETE') S.vehicles.delete(payload.old.id);
      else upsertLocal(payload.new);
      queueRender();
      queueMyMonth();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'supplies' }, async () => {
      await loadSupplies();
      renderAll();
    })
    .subscribe();
}

async function uploadPhoto(file) {
  const blob = await compressImage(file);
  const path = `${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}

async function removePhotos(paths) {
  paths = paths.filter(Boolean);
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);
}

async function updateVehicle(id, patch) {
  const { data, error } = await sb.from('vehicles').update(patch).eq('id', id).select().single();
  if (error) throw error;
  upsertLocal(data);
  return data;
}

// ---------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------
function showScreen(name) {
  $('#setupScreen').hidden = name !== 'setup';
  $('#loginScreen').hidden = name !== 'login';
  $('#appScreen').hidden = name !== 'app';
}

function setView(view) {
  S.view = view;
  $('#mainView').hidden = view !== 'main';
  $('#teamView').hidden = view !== 'team';
  $('#reportView').hidden = view !== 'report';
  $('#suppliesView').hidden = view !== 'supplies';
  $('#backBtn').hidden = view === 'main';
  $('#viewTitle').textContent = { main: 'Vehicle prep', team: 'Team', report: 'Pay report', supplies: 'Supplies' }[view];
  window.scrollTo(0, 0);
  if (view === 'team') renderTeam();
  if (view === 'report') renderReport();
  if (view === 'supplies') renderSupplies();
}

function renderAll() {
  document.body.classList.toggle('is-admin', isAdmin());
  $('#meBtn').textContent = initials(S.me?.display_name);
  const needed = (S.supplies ?? []).filter(s => s.status === 'needed').length;
  $('#suppliesBadge').textContent = needed || '';
  $('#suppliesBadge').hidden = !needed;
  renderMyMonth();
  renderTabs();
  renderList();
  if (S.view === 'team') renderTeam();
  if (S.view === 'supplies') renderSupplies();
}

// ---------------------------------------------------------------------
// Main list
// ---------------------------------------------------------------------
// Which tab a car shows in. Delivered is history; Loan takes the car out of
// the normal flow until it comes back; a car with someone working on it (any
// service "doing") is In prep; otherwise it's Sold or Stock.
// Dent is NOT a place: it's a written to-do list (dent_since set) — the car
// stays in its own tab and also appears on the Dent list.
const isWorking = v => v.services.some(k => v[`${k}_state`] === 'doing');
const inDent = v => !!v.dent_since && v.status !== 'delivered';

function tabOf(v) {
  if (v.status === 'delivered') return 'delivered';
  if (v.hold === 'loan') return 'loan';
  if (v.hold === 'bodyshop') return 'bodyshop';
  if (isWorking(v)) return 'in_prep';
  if (v.status === 'in_prep' && !soldOnArrival(v)) return 'sold';
  return 'stock';
}

// A car added already sold ("Already sold" / "Car not in stock") waits at the top
// of Stock with the cars to wash until its first job starts; then it goes the
// normal way (In prep → Sold). Cars imported before this existed are left alone.
const SOLD_ON_ARRIVAL_SINCE = Date.parse('2026-09-30T00:00:00Z');
function soldOnArrival(v) {
  const made = Date.parse(v.created_at ?? ''), sold = Date.parse(v.sold_at ?? '');
  return made >= SOLD_ON_ARRIVAL_SINCE && Math.abs(sold - made) < 5000 && untouched(v);
}

const isSold = v => v.status === 'in_prep';
// No job started or done yet on this car (its first wash comes first)
const untouched = v => SERVICES.every(s => (v[`${s.key}_state`] ?? 'pending') === 'pending');
// Stock order: nothing done yet → jobs under way → all done
const workStage = v => (untouched(v) ? 0 : v.services.length && v.done_at ? 2 : 1);
const onTab = (v, tab) => (tab === 'dent' ? inDent(v) : tabOf(v) === tab);

function renderTabs() {
  const counts = Object.fromEntries(Object.keys(TAB_TITLE).map(t => [t, 0]));
  for (const v of S.vehicles.values()) {
    counts[tabOf(v)]++;
    if (inDent(v)) counts.dent++;
  }
  for (const b of $$('.tabs button')) {
    b.setAttribute('aria-selected', b.dataset.tab === S.tab);
    $('.count', b).textContent = counts[b.dataset.tab];
  }
  // Red badge on Sold: how many go out today (overdue included)
  const today = [...S.vehicles.values()].filter(dueToday).length;
  const badge = $('[data-tab=sold] .today');
  badge.hidden = !today;
  badge.textContent = today;
  badge.title = `${today} to deliver today`;
  $('#purgeBtn').hidden = S.tab !== 'delivered';
  const print = $('#printBtn');
  print.hidden = !['sold', 'dent', 'loan', 'bodyshop'].includes(S.tab);
  print.textContent = `🖨 Print ${TAB_TITLE[S.tab]?.toLowerCase()} list`;
  const fab = $('#fab');
  // Adding stock and recording sales are admin-only (also enforced in the database)
  fab.hidden = !['stock', 'sold'].includes(S.tab) || !isAdmin();
  fab.innerHTML = `${ICON.plus}<span>${S.tab === 'stock' ? 'New stock' : 'Sold'}</span>`;
  $('#photosFab').hidden = S.tab !== 'stock' || !isAdmin();
}

function visibleVehicles() {
  const q = norm(S.search);
  let list = [...S.vehicles.values()].filter(v => onTab(v, S.tab));
  if (q) {
    list = list.filter(v => [v.reg_ie, v.reg_imp, v.make, v.model, v.seller, v.loan_to, `${v.make}${v.model}`]
      .some(f => norm(f).includes(q)));
  }

  const t = x => new Date(x ?? 0).getTime();
  const due = d => d ?? '9999-12-31';
  const sorts = {
    stock: (a, b) => (isSold(b) - isSold(a)) || (b.urgent - a.urgent) || (workStage(a) - workStage(b)) || (t(b.created_at) - t(a.created_at)),
    // Sold cars being worked on first (they're the priority), then by delivery date
    in_prep: (a, b) => (isSold(b) - isSold(a)) || (b.urgent - a.urgent) || due(a.delivery_date).localeCompare(due(b.delivery_date)),
    sold: (a, b) => due(a.delivery_date).localeCompare(due(b.delivery_date)) || (b.urgent - a.urgent)
      || clean(a.delivery_time).localeCompare(clean(b.delivery_time)),
    dent: (a, b) => due(a.dent_date).localeCompare(due(b.dent_date)) || (isSold(b) - isSold(a)) || (t(a.dent_since) - t(b.dent_since)),
    loan: (a, b) => due(a.loan_due).localeCompare(due(b.loan_due)),
    bodyshop: (a, b) => due(a.body_due).localeCompare(due(b.body_due)),
    delivered: (a, b) => t(b.delivered_at) - t(a.delivered_at),
  };
  return list.sort(sorts[S.tab]);
}

function plateHTML(v) {
  const out = [];
  if (clean(v.reg_ie)) out.push(`<span class="plate"><span class="band">IRL</span><span class="reg">${esc(v.reg_ie)}</span></span>`);
  if (clean(v.reg_imp)) out.push(`<span class="plate imp"><span class="band">IMP</span><span class="reg">${esc(v.reg_imp)}</span></span>`);
  return `<div class="plates">${out.join('')}</div>`;
}

function colourHTML(color) {
  if (!clean(color)) return '';
  const hex = COLOUR_HEX[clean(color).toLowerCase()];
  return `<span class="colour">${hex ? `<span class="dot" style="background:${hex}"></span>` : ''}${esc(color)}</span>`;
}

// Which service buttons this person gets on the cards: the jobs ticked for
// them on the Team screen (admins too). With nothing ticked (managers, the
// sold-cars person) they get a read-only summary instead (jobStatusHTML).
function myServiceKeys() {
  return S.me?.services ?? [];
}

// For people with no jobs ticked (managers, the sold-cars person): a small,
// read-only line of where each job on the car stands — nothing to tap.
function jobStatusHTML(v) {
  const keys = SERVICES.map(s => s.key).filter(k => v.services.includes(k) || v[`${k}_state`] !== 'pending');
  if (!keys.length) return '';
  return `<div class="job-status">${keys.map(k => {
    const st = v[`${k}_state`];
    const mark = { done: '✓', doing: '◐', pending: '○' }[st];
    const who = st === 'pending' ? '' : ` <em>${esc(nameOf(v[`${k}_by`]))}</em>`;
    return `<span class="js ${st}">${mark} ${esc(SERVICE[k].label)}${who}</span>`;
  }).join('')}</div>`;
}

// About the jobs this person has no button for: who is working on one right
// now (so you can see who has the car), then a quiet count, e.g.
// "◐ Lucas — Polish / Compound" / "Other jobs: 1 done · 2 to do"
function otherJobsHTML(v) {
  const hidden = SERVICES.map(s => s.key).filter(k => !myServiceKeys().includes(k)
    && (v.services.includes(k) || v[`${k}_state`] !== 'pending'));
  if (!hidden.length) return '';
  const doing = hidden.filter(k => v[`${k}_state`] === 'doing')
    .map(k => `<div class="other-doing"><span class="ring half"></span> <strong>${esc(nameOf(v[`${k}_by`]))}</strong> — ${esc(SERVICE[k].label)}</div>`);
  const count = st => hidden.filter(k => v[`${k}_state`] === st).length;
  const parts = [[count('done'), 'done'], [count('pending'), 'to do']].filter(([n]) => n).map(([n, w]) => `${n} ${w}`);
  const label = myServiceKeys().length ? 'Other jobs' : 'Jobs';
  return doing.join('') + (parts.length ? `<div class="other-jobs">${label}: ${esc(parts.join(' · '))}</div>` : '');
}

// A service this car wasn't asked for (and nobody has touched): shown faded
// with "+"; tapping it adds it to the car and starts it.
const isExtra = (v, key) => !v.services.includes(key) && v[`${key}_state`] === 'pending';

// A job someone else started or finished is theirs: only they or an admin can
// finish, undo or change it (also enforced in the database, 020_*.sql).
function jobOwner(v, key) {
  const by = v[`${key}_by`];
  return v[`${key}_state`] !== 'pending' && by && by !== S.me?.id && !isAdmin() ? by : null;
}

// One bubble per service: grey = to do, amber = someone is on it, green ✓ = done.
function serviceHTML(v, key) {
  const s = SERVICE[key];
  const state = v[`${key}_state`];
  if (isExtra(v, key)) {
    return `<button type="button" class="svc extra" data-act="svc" data-key="${key}" title="${esc(`${s.label} — not requested. Tap to add it and start`)}">
      <span class="plus">+</span><span class="svc-text"><strong>${esc(s.label)}</strong></span>
    </button>`;
  }
  const by = v[`${key}_by`];
  const who = state === 'doing' ? nameOf(by) : state === 'done' ? `${nameOf(by)} · ${fmtDate(v[`${key}_done_at`], false)}` : '';
  const owner = jobOwner(v, key);
  const hint = owner ? `${nameOf(owner)}’s job — only they or a manager can change it`
    : { pending: 'Tap to start', doing: 'Tap when finished', done: 'Done — tap twice to undo' }[state];
  const mark = { pending: '<span class="ring"></span>', doing: '<span class="ring half"></span>', done: ICON.check }[state];
  return `<button type="button" class="svc ${state}${owner ? ' locked' : ''}" data-act="svc" data-key="${key}" title="${esc(`${s.label} — ${hint}`)}">
    ${mark}<span class="svc-text"><strong>${esc(s.label)}</strong>${who ? `<small>${esc(who)}</small>` : ''}</span>${owner ? `<span class="svc-lock">${ICON.lock}</span>` : ''}
  </button>`;
}

function detailRow(label, value, html = null) {
  return clean(value) ? `<div><dt>${label}</dt><dd>${html ?? esc(value)}</dd></div>` : '';
}

// ---------------------------------------------------------------------
// "Ready to go": the sold-cars person (profiles.handles_sold, not admins
// automatically) taps Start prep (people with sold alerts get a notification),
// then Ready to go when done. Dent / Bodyshop are per-person permissions too.
// ---------------------------------------------------------------------
const canReady = () => !!S.me?.handles_sold;
const canDent = () => !!S.me?.can_dent;
const canBodyshop = () => !!S.me?.can_bodyshop;
const dueToday = v => isSold(v) && !!v.delivery_date && dayDiff(v.delivery_date) <= 0;

function readyButtons(v) {
  if (!canReady()) return '';
  const undo = label => `<button class="btn small ghost" data-act="unready" title="Back to not started">${label}</button>`;
  if (v.ready_state === 'doing') return undo('Cancel') + `<button class="btn small accent" data-act="ready">${ICON.check} Ready to go</button>`;
  if (v.ready_state === 'done') return undo('↺ Undo') + `<button class="btn small ghost" data-act="deliver">Delivered</button>`;
  return `<button class="btn small primary" data-act="ready">▶ Start prep</button>`;
}

// Everyone sees where the delivery prep is at
function readyStatusHTML(v) {
  if (v.ready_state === 'doing') {
    return `<div class="ready-bar doing"><span class="ring half"></span> Prep for delivery · <strong>${esc(nameOf(v.ready_by))}</strong> since ${esc(fmtDate(v.ready_started_at))}</div>`;
  }
  if (v.ready_state === 'done') {
    return `<div class="ready-bar done">${ICON.check} Ready to go · ${esc(nameOf(v.ready_by))} · ${esc(fmtDate(v.ready_at))}</div>`;
  }
  return '';
}

// next: 'doing' / 'done', or 'pending' to undo (Cancel / ↺ Undo)
async function cycleReady(v, btn, next = v.ready_state === 'doing' ? 'done' : 'doing') {
  if (!canReady()) return;
  if (next === 'pending' && btn && !confirmTap(btn, 'Tap again to undo')) return;
  if (next === 'done' && !v.done_at && !confirmTap(btn, 'Jobs not all done — tap again')) return;
  const before = { ...v };
  const now = new Date().toISOString();
  S.vehicles.set(v.id, next === 'pending'
    ? { ...v, ready_state: 'pending', ready_by: null, ready_started_at: null, ready_at: null }
    : { ...v, ready_state: next, ready_by: v.ready_by ?? S.me.id, ready_started_at: v.ready_started_at ?? now, ready_at: next === 'done' ? now : null });
  renderAll();
  try {
    const saved = await updateVehicle(v.id, { ready_state: next });
    if (next === 'doing') toast('Prep started — the boss has been told');
    else if (next === 'done') toast('Ready to go ✓', { action: { label: 'Undo', run: () => cycleReady(saved, null, 'doing') } });
    else toast('Back to not started');
  } catch (err) {
    S.vehicles.set(v.id, before);
    toast(errorText(err), { error: true });
  }
  renderAll();
}

function cardHTML(v) {
  const url = v.photo_path && S.photoUrls.get(v.photo_path);
  const tab = tabOf(v);
  const sold = isSold(v);
  const chips = [];

  if (tab === 'loan') {
    const late = v.loan_due && dayDiff(v.loan_due) < 0;
    chips.push(`<span class="chip hold">ON LOAN</span>`);
    if (v.loan_due) chips.push(`<span class="chip${late ? ' urgent' : ''}">${late ? 'OVERDUE · ' : ''}Back ${esc(dayName(v.loan_due))}</span>`);
  }
  if (tab === 'bodyshop') {
    const late = v.body_due && dayDiff(v.body_due) < 0;
    chips.push('<span class="chip body">AT BODYSHOP</span>');
    if (v.body_due) chips.push(`<span class="chip${late ? ' urgent' : ''}">${late ? 'OVERDUE · ' : ''}Back ${esc(dayName(v.body_due))}</span>`);
  }
  if (inDent(v)) chips.push(`<span class="chip hold">DENT${v.dent_date ? ` · ${esc(dayName(v.dent_date))}` : ''}</span>`);
  if (sold && tab !== 'sold') chips.push('<span class="chip sold">SOLD</span>');
  if (v.urgent && v.status !== 'delivered') chips.push('<span class="chip urgent">URGENT</span>');
  if (!sold && v.status === 'stock' && v.stock_status === 'due_in') chips.push('<span class="chip warn">Due in</span>');
  if (sold) {
    const when = deliveryLabel(v);
    const soon = v.delivery_date && dayDiff(v.delivery_date) <= 0;
    if (when) chips.push(`<span class="chip${soon ? ' warn' : ''}">Delivery: ${esc(when)}</span>`);
    chips.push(v.stock_status === 'due_in' ? '<span class="chip warn">Due in</span>' : '<span class="chip">On site</span>');
  }
  if (sold && v.ready_state === 'done') chips.push(`<span class="chip ok ready">✓ READY TO GO</span>`);
  if (v.status !== 'delivered' && v.services.length && v.done_at && v.ready_state !== 'done') chips.push('<span class="chip ok">All services done</span>');
  if (v.status === 'delivered') chips.push(`<span class="chip ok">Delivered ${esc(fmtDate(v.delivered_at))}</span>`);

  const phone = clean(v.loan_phone);
  const details = [
    tab === 'loan' ? detailRow('Customer', v.loan_to) : '',
    tab === 'loan' ? detailRow('Phone', phone, `<a href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">${esc(phone)}</a>`) : '',
    tab === 'loan' ? detailRow('Out since', v.loan_since && fmtDate(v.loan_since)) : '',
    inDent(v) ? detailRow('Dent', v.dent_notes || 'On the dent list') : '',
    tab === 'bodyshop' ? detailRow('Work', v.body_notes) : '',
    tab === 'bodyshop' ? detailRow('Bodyshop', v.body_place) : '',
    tab === 'bodyshop' ? detailRow('Since', v.body_since && fmtDate(v.body_since)) : '',
    sold ? detailRow('Salesperson', v.seller) : '',
    sold ? detailRow('VRT / NCT', v.vrt_nct) : '',
    sold ? detailRow('Mechanical', v.mechanical_notes) : '',
    sold ? detailRow('Estimate', v.estimate) : '',
  ].join('');

  const b = (act, label, cls = 'ghost') => `<button class="btn small ${cls}" data-act="${act}">${label}</button>`;
  // Dent is for the people given "Can use Dent" on the Team screen (also enforced in the DB)
  const dent = canDent() ? b('dent', inDent(v) ? 'Dent ✓' : 'Dent') : '';
  const edit = isAdmin() ? b('edit', 'Edit') : '';  // editing car details is admin-only (also in the DB)
  // Bodyshop is for the people given "Can use Bodyshop" on the Team screen (also enforced in the DB)
  const body = canBodyshop() ? b('bodyshop', 'Bodyshop') : '';
  let actions;
  if (tab === 'delivered') actions = b('reopen', 'Reopen');
  else if (tab === 'bodyshop') actions = edit + (canBodyshop() ? b('bodyshop', 'Details') + b('release', `${ICON.check} Back from bodyshop`, 'accent') : '');
  else if (tab === 'loan') actions = edit + (isAdmin() ? b('loan', 'Loan details') + b('release', `${ICON.check} Returned`, 'accent') : '');
  else if (sold) {
    // Managers can hand a car over too: going out today / overdue, or ready to go
    const ryannHasIt = canReady() && v.ready_state === 'done';  // readyButtons already shows Delivered
    const deliver = isAdmin() && !ryannHasIt && (dueToday(v) || v.ready_state === 'done')
      ? b('deliver', `${ICON.check} Delivered`, 'accent') : '';
    actions = edit + body + dent + readyButtons(v) + deliver;
  }
  else actions = edit + (isAdmin() ? b('loan', 'Loan') : '') + body + dent + (isAdmin() ? b('sell', 'Mark sold', 'primary') : '');
  const remove = isAdmin() && v.status !== 'delivered' ? `${b('remove', 'Delete', 'ghost danger')}<span class="spacer"></span>` : '';

  // Red outline: urgent, going out today (or overdue), or a loan / bodyshop car that's late back
  const flagged = (v.status !== 'delivered' && v.urgent) || (sold && dueToday(v)) || (tab === 'loan' && v.loan_due && dayDiff(v.loan_due) < 0)
    || (tab === 'bodyshop' && v.body_due && dayDiff(v.body_due) < 0);
  return `<article class="card${flagged ? ' urgent' : ''}" data-id="${v.id}">
    <div class="card-head">
      ${url ? `<img class="thumb" src="${esc(url)}" alt="" data-act="photo" loading="lazy">`
        : `<span class="thumb placeholder"${isAdmin() ? ' data-act="edit" title="Add a photo"' : ''}>${ICON.car}</span>`}
      <div class="card-title">
        ${plateHTML(v)}
        <div class="vehicle-name">${esc([v.make, v.model].map(clean).filter(Boolean).join(' ') || 'Unknown vehicle')} ${colourHTML(v.color)}</div>
      </div>
    </div>
    ${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}
    ${details ? `<dl class="details">${details}</dl>` : ''}
    ${clean(v.notes) ? `<div class="notes">${esc(v.notes)}</div>` : ''}
    ${myServiceKeys().length ? `<div class="services">${SERVICES
      // Only the viewer's own jobs (see myServiceKeys); extras faded — delivered cars show what was done
      .filter(s => myServiceKeys().includes(s.key))
      .filter(s => v.status !== 'delivered' || !isExtra(v, s.key))
      .map(s => serviceHTML(v, s.key)).join('')}</div>
    ${otherJobsHTML(v)}` : jobStatusHTML(v)}
    ${sold ? readyStatusHTML(v) : ''}
    <div class="card-actions">${remove}${actions}</div>
  </article>`;
}

// Delivery-day heading for sold cars (screen and printed list)
function deliveryGroup(v) {
  if (!v.delivery_date) return { key: 'none', title: 'No delivery date yet', cls: 'none' };
  const diff = dayDiff(v.delivery_date);
  const long = new Date(`${v.delivery_date}T00:00`).toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'short' });
  if (diff < 0) return { key: 'overdue', title: 'Overdue', cls: 'overdue' };
  if (diff === 0) return { key: 'today', title: `Today — ${long}`, cls: 'today' };
  if (diff === 1) return { key: 'tomorrow', title: `Tomorrow — ${long}`, cls: '' };
  return { key: v.delivery_date, title: long, cls: '' };
}

// Sold tab: full cards under delivery-day headings (list is already sorted)
function soldHTML(list) {
  const groups = new Map();
  for (const v of list) {
    const g = deliveryGroup(v);
    if (!groups.has(g.key)) groups.set(g.key, { ...g, items: [] });
    groups.get(g.key).items.push(v);
  }
  return [...groups.values()].map(g => `<section class="deliv-group ${g.cls}">
    <h3>${esc(g.title)} <span class="count">${g.items.length}</span></h3>
    ${g.items.map(cardHTML).join('')}
  </section>`).join('');
}

// Dent day heading (screen and printed list)
function dentGroup(v) {
  if (!v.dent_date) return { key: 'none', title: 'No day set yet', cls: 'none' };
  const diff = dayDiff(v.dent_date);
  const long = new Date(`${v.dent_date}T00:00`).toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'short' });
  if (diff < 0) return { key: 'overdue', title: `Missed — was ${long}`, cls: 'overdue' };
  if (diff === 0) return { key: 'today', title: `Today — ${long}`, cls: 'today' };
  if (diff === 1) return { key: 'tomorrow', title: `Tomorrow — ${long}`, cls: '' };
  return { key: v.dent_date, title: long, cls: '' };
}

// Where the car is right now, in words (for the Dent list)
function whereLabel(v) {
  const tab = tabOf(v);
  if (tab === 'loan') return `On loan to ${clean(v.loan_to) || 'a customer'}`;
  if (isSold(v)) return `Sold${deliveryLabel(v) ? ` · delivery ${deliveryLabel(v)}` : ''}${tab === 'in_prep' ? ' · in prep' : ''}`;
  return tab === 'in_prep' ? 'Stock · in prep' : 'Stock';
}

// Dent tab: a plain written to-do list grouped by the day of the dent service
function dentHTML(list) {
  const groups = new Map();
  for (const v of list) {
    const g = dentGroup(v);
    if (!groups.has(g.key)) groups.set(g.key, { ...g, items: [] });
    groups.get(g.key).items.push(v);
  }
  const row = v => `<div class="dent-row${v.urgent ? ' urgent' : ''}" data-id="${v.id}">
    <div class="dent-car">${plateHTML(v)}
      <span class="vehicle-name">${esc([v.make, v.model].map(clean).filter(Boolean).join(' ') || 'Unknown vehicle')} ${colourHTML(v.color)}</span>
      <span class="dent-where">${esc(whereLabel(v))}</span>
    </div>
    <div class="dent-fix">${esc(v.dent_notes || '—')}</div>
    ${canDent() ? `<div class="dent-actions">
      <button class="btn small ghost" data-act="dent">Edit</button>
      <button class="btn small accent" data-act="dentdone">${ICON.check} Done</button>
    </div>` : ''}
  </div>`;
  return [...groups.values()].map(g => `<section class="deliv-group dent-group ${g.cls}">
    <h3>${esc(g.title)} <span class="count">${g.items.length}</span></h3>
    ${g.items.map(row).join('')}
  </section>`).join('');
}

const EMPTY = {
  stock: 'No vehicles in stock.',
  in_prep: 'Nobody is working on a car right now. Tap a service on a car to start it.',
  sold: 'No sold cars waiting for delivery.',
  dent: 'The dent list is empty. Tap “Dent” on a car to add it.',
  loan: 'No cars out on loan.',
  bodyshop: 'No cars at the bodyshop.',
  delivered: 'No deliveries yet.',
};

function renderList() {
  $('#list').innerHTML = listHTML(S.tab);
}

// The list for any tab (used to draw the neighbouring tab while swiping)
function listHTML(tab) {
  const current = S.tab;
  S.tab = tab;
  try {
    const list = visibleVehicles();
    if (!list.length) return `<p class="empty">${S.search ? 'No vehicles match your search.' : EMPTY[tab]}</p>`;
    return tab === 'sold' ? soldHTML(list) : tab === 'dent' ? dentHTML(list) : list.map(cardHTML).join('');
  } finally {
    S.tab = current;
  }
}

// ---------------------------------------------------------------------
// Printed lists (Sold / Dent / Loan)
// ---------------------------------------------------------------------
const carCell = v => `<strong>${esc([v.make, v.model].map(clean).filter(Boolean).join(' ') || 'Unknown vehicle')}</strong>${clean(v.color) ? `<br>${esc(v.color)}` : ''}`;
const plateCell = v => [v.reg_ie, v.reg_imp].map(clean).filter(Boolean).map(esc).join('<br>')
  + (v.urgent && v.status !== 'delivered' ? '<div class="urgent-tag">URGENT</div>' : '');

function jobsCell(v) {
  return SERVICES.filter(s => v.services.includes(s.key)).map(s => {
    const state = v[`${s.key}_state`];
    if (state === 'done') return `<span class="done">✓ ${esc(s.label)} <small>(${esc(nameOf(v[`${s.key}_by`]))})</small></span>`;
    return `<span>☐ ${esc(s.label)}${state === 'doing' ? ` <small>(started: ${esc(nameOf(v[`${s.key}_by`]))})</small>` : ''}</span>`;
  }).join('') || '<span class="muted">No services</span>';
}

// rows: [{ group?: title } | { cells: [html…] }]
function printDoc({ title, summary, how, columns, rows }) {
  const now = new Date();
  let n = 0;
  const body = rows.map(r => r.group
    ? `<tr class="group"><td colspan="${columns.length + 1}">${esc(r.group)}</td></tr>`
    : `<tr><td class="num">${++n}</td>${r.cells.map(c => `<td${c.cls ? ` class="${c.cls}"` : ''}>${c.html}</td>`).join('')}</tr>`).join('');
  $('#printSheet').innerHTML = `
    <header>
      <div><h1>M6 Motors · ${esc(title)}</h1>
        <p>${esc(now.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))} · ${esc(summary)}</p></div>
      <p class="how">${esc(how)}</p>
    </header>
    <table>
      <thead><tr><th>#</th>${columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    <footer>Printed ${esc(fmtDate(now.toISOString()))} by ${esc(S.me?.display_name ?? '')}</footer>`;

  document.body.classList.add('printing-sheet');
  const done = () => { document.body.classList.remove('printing-sheet'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Daily job sheet: every sold car not yet delivered (wherever it is right
// now), overdue → today → tomorrow → later → no date; urgent first per day.
function printSoldList() {
  const cars = [...S.vehicles.values()].filter(isSold);
  if (!cars.length) return toast('No sold cars waiting for delivery.');
  const due = d => d ?? '9999-12-31';
  cars.sort((a, b) => due(a.delivery_date).localeCompare(due(b.delivery_date)) || (b.urgent - a.urgent)
    || clean(a.delivery_time).localeCompare(clean(b.delivery_time)));
  const rows = [];
  let current = null;
  for (const v of cars) {
    const g = deliveryGroup(v);
    if (g.key !== current) { current = g.key; rows.push({ group: g.title }); }
    const where = (v.hold === 'loan' ? '<strong>ON LOAN</strong>'
      : v.hold === 'bodyshop' ? '<strong>AT BODYSHOP</strong>'
      : v.stock_status === 'due_in' ? '<strong>NOT ON SITE YET</strong>' : 'On site')
      + (v.ready_state === 'done' ? '<br><strong>✓ READY TO GO</strong>'
        : v.ready_state === 'doing' ? `<br>Prep: ${esc(nameOf(v.ready_by))}` : '');
    const notes = [clean(v.notes), clean(v.mechanical_notes) && `Mechanical: ${clean(v.mechanical_notes)}`,
      clean(v.vrt_nct) && `VRT/NCT: ${clean(v.vrt_nct)}`, inDent(v) && `Dent: ${clean(v.dent_notes) || 'on the dent list'}`]
      .filter(Boolean).map(esc).join('<br>');
    rows.push({ cells: [
      { html: plateCell(v), cls: 'plate-cell' },
      { html: `${carCell(v)}${clean(v.seller) ? `<br><small>Sold by ${esc(v.seller)}</small>` : ''}` },
      { html: `${esc(deliveryLabel(v) || '—')}<br><small>${where}</small>` },
      { html: jobsCell(v), cls: 'svc-cell' },
      { html: notes, cls: 'notes-cell' },
    ] });
  }
  printDoc({
    title: 'Sold cars', summary: `${plural(cars.length, 'car')} to prepare`,
    how: 'Work top to bottom. Tick ☐ when a job is done — and tap it in the app too.',
    columns: ['Plate', 'Car', 'Delivery', 'Jobs', 'Notes'], rows,
  });
}

function visibleDentList() {
  const due = d => d ?? '9999-12-31';
  return [...S.vehicles.values()].filter(inDent)
    .sort((a, b) => due(a.dent_date).localeCompare(due(b.dent_date)) || (isSold(b) - isSold(a))
      || new Date(a.dent_since ?? 0) - new Date(b.dent_since ?? 0));
}

function printDentList() {
  // Same order as the Dent tab: by dent day, sold cars first within a day
  const cars = visibleDentList();
  if (!cars.length) return toast('The dent list is empty.');
  const rows = [];
  let current = null;
  for (const v of cars) {
    const g = dentGroup(v);
    if (g.key !== current) { current = g.key; rows.push({ group: g.title }); }
    rows.push({ cells: [
      { html: plateCell(v), cls: 'plate-cell' },
      { html: carCell(v) },
      { html: esc(v.dent_notes || '—').replace(/\n/g, '<br>'), cls: 'notes-cell' },
      { html: isSold(v) ? `<strong>SOLD</strong><br>${esc(deliveryLabel(v) || 'No delivery date')}` : esc(whereLabel(v)) },
      { html: '<span class="tick">☐</span>' },
    ] });
  }
  printDoc({
    title: 'Dent list', summary: plural(cars.length, 'car'),
    how: 'Sold cars first each day. Tick ☐ when the repair is done — then tap “Done” on the Dent list in the app.',
    columns: ['Plate', 'Car', 'What to fix', 'Stock / sold', 'Done'], rows,
  });
}

function printLoanList() {
  const cars = [...S.vehicles.values()].filter(v => tabOf(v) === 'loan')
    .sort((a, b) => (a.loan_due ?? '9999').localeCompare(b.loan_due ?? '9999'));
  if (!cars.length) return toast('No cars out on loan.');
  printDoc({
    title: 'Loan cars', summary: plural(cars.length, 'car') + ' out',
    how: 'Earliest return first. Overdue cars are marked.',
    columns: ['Plate', 'Car', 'Customer', 'Phone', 'Out since', 'Back by'],
    rows: cars.map(v => ({ cells: [
      { html: plateCell(v), cls: 'plate-cell' },
      { html: carCell(v) },
      { html: `<strong>${esc(v.loan_to || '—')}</strong>` },
      { html: esc(v.loan_phone || '—') },
      { html: esc(v.loan_since ? fmtDate(v.loan_since) : '—') },
      { html: v.loan_due ? `${esc(dayName(v.loan_due))}${dayDiff(v.loan_due) < 0 ? '<br><strong>OVERDUE</strong>' : ''}` : '—' },
    ] })),
  });
}

function printBodyshopList() {
  const cars = [...S.vehicles.values()].filter(v => tabOf(v) === 'bodyshop')
    .sort((a, b) => (a.body_due ?? '9999').localeCompare(b.body_due ?? '9999'));
  if (!cars.length) return toast('No cars at the bodyshop.');
  printDoc({
    title: 'Bodyshop', summary: plural(cars.length, 'car') + ' out',
    how: 'Earliest return first. Overdue cars are marked.',
    columns: ['Plate', 'Car', 'Work', 'Bodyshop', 'Out since', 'Back by', 'Sold?'],
    rows: cars.map(v => ({ cells: [
      { html: plateCell(v), cls: 'plate-cell' },
      { html: carCell(v) },
      { html: esc(v.body_notes || '—').replace(/\n/g, '<br>'), cls: 'notes-cell' },
      { html: esc(v.body_place || '—') },
      { html: esc(v.body_since ? fmtDate(v.body_since) : '—') },
      { html: v.body_due ? `${esc(dayName(v.body_due))}${dayDiff(v.body_due) < 0 ? '<br><strong>OVERDUE</strong>' : ''}` : '—' },
      { html: isSold(v) ? `<strong>SOLD</strong><br>${esc(deliveryLabel(v) || 'No date')}` : 'Stock' },
    ] })),
  });
}

function printCurrentList() {
  ({ sold: printSoldList, dent: printDentList, loan: printLoanList, bodyshop: printBodyshopList })[S.tab]?.();
}

// ---------------------------------------------------------------------
// Card actions
// ---------------------------------------------------------------------
async function onListClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('[data-id]')?.dataset.id;
  const v = S.vehicles.get(id);
  if (!v) return;
  const act = btn.dataset.act;

  if (act === 'svc') return cycleService(v, btn.dataset.key, btn);
  if (act === 'edit') return isAdmin() && openVehicleForm({ vehicle: v });
  if (act === 'sell') return isAdmin() && openVehicleForm({ vehicle: v, convert: true });
  if (act === 'photo') return openPhoto(v);
  if (act === 'loan') return isAdmin() && openHoldForm(v, act);  // loans are admin-only (also in the DB)
  if (act === 'dent') return canDent() && openHoldForm(v, act);
  if (act === 'bodyshop') return canBodyshop() && openBodyshopForm(v);
  if (act === 'release') return (v.hold === 'bodyshop' ? canBodyshop() : isAdmin()) && releaseHold(v);
  if (act === 'dentdone') return canDent() && dentDone(v);

  if (act === 'ready') return cycleReady(v, btn);
  if (act === 'unready') return cycleReady(v, btn, 'pending');
  if (act === 'deliver') {
    if (!v.done_at && !confirmTap(btn, 'Not finished — tap again')) return;
    return setStatus(v, 'delivered', { undo: true });
  }
  if (act === 'reopen') return setStatus(v, 'in_prep');
  if (act === 'remove') {
    if (!confirmTap(btn, 'Tap again to delete')) return;
    try {
      const { error } = await sb.from('vehicles').delete().eq('id', v.id);
      if (error) throw error;
      S.vehicles.delete(v.id);
      await removePhotos([v.photo_path]);
      renderAll();
      toast('Vehicle deleted');
    } catch (err) { toast(errorText(err), { error: true }); }
  }
}

// When the viewer's own action moves the car to another tab, follow it there:
// switch tab, scroll to the card and highlight it.
function announceMove(before, after) {
  const from = tabOf(before), to = tabOf(after);
  if (from === to) return;
  if (S.tab === from) followCard(after.id, to);
  else toast(`Moved to ${TAB_TITLE[to]}`, { action: { label: 'Show', run: () => followCard(after.id, to) } });
}

function followCard(id, tab) {
  S.search = '';
  $('#search').value = '';
  switchTab(tab);
  requestAnimationFrame(() => {
    const card = document.querySelector(`.card[data-id="${id}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('flash');
    void card.offsetWidth; // restart the animation
    card.classList.add('flash');
  });
  toast(`Moved to ${TAB_TITLE[tab]}`);
}

async function cycleService(v, key, btn) {
  if (!S.me) return;
  const owner = jobOwner(v, key);
  if (owner) return toast(`${SERVICE[key].label} is ${nameOf(owner)}’s job — only ${nameOf(owner)} or a manager can change it.`);
  const state = v[`${key}_state`];
  if (state === 'done' && !confirmTap(btn, 'Tap again to reset')) return;
  const next = NEXT_STATE[state];
  const patch = { [`${key}_state`]: next };
  // Tapping a service the car wasn't asked for adds it to the car and starts it
  if (!v.services.includes(key)) patch.services = SERVICES.map(s => s.key).filter(k => v.services.includes(k) || k === key);

  // Optimistic update; the server fills in the real who/when.
  const before = { ...v };
  S.vehicles.set(v.id, {
    ...v,
    ...patch,
    [`${key}_by`]: next === 'pending' ? null : (v[`${key}_by`] ?? S.me.id),
    [`${key}_done_at`]: next === 'done' ? new Date().toISOString() : null,
  });
  renderAll();
  try {
    const saved = await updateVehicle(v.id, patch);
    announceMove(before, saved);
  } catch (err) {
    S.vehicles.set(v.id, before);
    toast(errorText(err), { error: true });
  }
  renderAll();
}

async function setStatus(v, status, { undo = false } = {}) {
  try {
    await updateVehicle(v.id, { status });
    renderAll();
    if (status === 'delivered') {
      toast('Marked as delivered', undo ? { action: { label: 'Undo', run: () => setStatus(v, 'in_prep') } } : {});
    } else {
      toast('Moved back to Sold');
    }
  } catch (err) { toast(errorText(err), { error: true }); }
}

// Loan (customer courtesy car) takes a car out of Stock until someone taps
// Returned. Dent (paintless dent repair) only puts the car on the written
// Dent list — it stays where it is — until someone taps Done.
const HOLD_FIELDS = {
  loan: ['loan_to', 'loan_phone', 'loan_due', 'loan_since'],
  dent: ['dent_notes', 'dent_date', 'dent_since'],
  bodyshop: ['body_notes', 'body_place', 'body_due', 'body_since'],
};

function openHoldForm(v, kind) {
  const loan = kind === 'loan';
  const editing = loan ? v.hold === 'loan' : inDent(v);
  const car = [v.make, v.model].map(clean).filter(Boolean).join(' ');
  const sheet = openSheet(`<form class="form" id="holdForm" novalidate>
    ${sheetHead(loan ? (editing ? 'Loan details' : 'Loan car to a customer') : (editing ? 'Dent list' : 'Add to Dent list'))}
    <div class="hold-car">${plateHTML(v)}<span class="muted">${esc(car)}</span></div>
    ${loan ? `
      <label>Customer name<input name="loan_to" value="${esc(v.loan_to)}" autocapitalize="words" required></label>
      <label>Phone<input name="loan_phone" type="tel" value="${esc(v.loan_phone)}" inputmode="tel"></label>
      <label>Back by<input name="loan_due" type="date" value="${esc(v.loan_due)}"></label>`
    : `<label>What needs fixing<textarea name="dent_notes" rows="3" placeholder="e.g. rear left door, small dent on bonnet">${esc(v.dent_notes)}</textarea></label>
      <label>Dent day<input name="dent_date" type="date" value="${esc(v.dent_date)}"></label>
      <p class="hint" style="margin:0">The car stays where it is — it’s just added to the Dent list to print on that day.</p>`}
    <p class="form-error" id="holdError" hidden></p>
    <div class="sheet-actions">
      ${!loan && editing ? `<button type="button" class="btn ghost danger" id="dentRemove">Take off list</button><span class="spacer"></span>` : ''}
      <button type="button" class="btn ghost" data-close>Cancel</button>
      <button type="submit" class="btn primary">${editing ? 'Save' : loan ? 'Loan car' : 'Add to Dent list'}</button>
    </div>
  </form>`);
  const form = $('#holdForm', sheet);
  form.onsubmit = async e => {
    e.preventDefault();
    const f = form.elements;
    const now = new Date().toISOString();
    const patch = loan
      ? { hold: 'loan', loan_to: clean(f.loan_to.value), loan_phone: clean(f.loan_phone.value),
          loan_due: f.loan_due.value || null, loan_since: editing ? v.loan_since : now }
      : { dent_notes: clean(f.dent_notes.value), dent_date: f.dent_date.value || null, dent_since: editing ? v.dent_since : now };
    const fail = msg => { const el = $('#holdError', form); el.textContent = msg; el.hidden = false; };
    if (loan && !patch.loan_to) return fail('Enter the customer’s name.');
    if (!loan && !patch.dent_notes) return fail('Write what needs fixing.');
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const saved = await updateVehicle(v.id, patch);
      closeSheet();
      renderAll();
      if (editing) toast('Saved');
      else if (loan) announceMove(v, saved);
      else toast('Added to the Dent list', { action: { label: 'Show', run: () => switchTab('dent') } });
    } catch (err) {
      btn.disabled = false;
      fail(errorText(err));
    }
  };
  $('#dentRemove', form)?.addEventListener('click', () => { closeSheet(); dentDone(v); });
}

// Bodyshop (panel beating & paint): the car goes out until "Back from bodyshop".
function openBodyshopForm(v) {
  const editing = v.hold === 'bodyshop';
  const car = [v.make, v.model].map(clean).filter(Boolean).join(' ');
  const sheet = openSheet(`<form class="form" id="bodyForm" novalidate>
    ${sheetHead(editing ? 'Bodyshop details' : 'Send to the bodyshop')}
    <div class="hold-car">${plateHTML(v)}<span class="muted">${esc(car)}</span></div>
    <label>What’s being done<textarea name="body_notes" rows="3" placeholder="e.g. respray rear bumper, repair driver door">${esc(v.body_notes)}</textarea></label>
    <label>Bodyshop<input name="body_place" value="${esc(v.body_place)}" placeholder="e.g. Longford Bodyworks" autocapitalize="words"></label>
    <label>Back by<input name="body_due" type="date" value="${esc(v.body_due)}"></label>
    <p class="form-error" id="bodyError" hidden></p>
    <div class="sheet-actions">
      <button type="button" class="btn ghost" data-close>Cancel</button>
      <button type="submit" class="btn primary">${editing ? 'Save' : 'Send to bodyshop'}</button>
    </div>
  </form>`);
  const form = $('#bodyForm', sheet);
  form.onsubmit = async e => {
    e.preventDefault();
    const f = form.elements;
    const patch = { hold: 'bodyshop', body_notes: clean(f.body_notes.value), body_place: clean(f.body_place.value),
      body_due: f.body_due.value || null, body_since: editing ? v.body_since : new Date().toISOString() };
    const fail = msg => { const el = $('#bodyError', form); el.textContent = msg; el.hidden = false; };
    if (!patch.body_notes) return fail('Write what’s being done.');
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const saved = await updateVehicle(v.id, patch);
      closeSheet();
      renderAll();
      if (editing) toast('Saved');
      else announceMove(v, saved);
    } catch (err) {
      btn.disabled = false;
      fail(errorText(err));
    }
  };
}

// Take a car off the Dent list (repair done), with Undo.
async function dentDone(v) {
  const patch = { dent_notes: '', dent_date: null, dent_since: null };
  const undo = { dent_notes: v.dent_notes, dent_date: v.dent_date, dent_since: v.dent_since };
  try {
    await updateVehicle(v.id, patch);
    renderAll();
    toast('Dent done — taken off the list', {
      action: { label: 'Undo', run: async () => { await updateVehicle(v.id, undo); renderAll(); } },
    });
  } catch (err) { toast(errorText(err), { error: true }); }
}

async function releaseHold(v) {
  const kind = v.hold;
  const patch = { hold: null };
  for (const k of HOLD_FIELDS[kind] ?? []) patch[k] = k.endsWith('_since') || k.endsWith('_due') ? null : '';
  const undo = { hold: kind };
  for (const k of HOLD_FIELDS[kind] ?? []) undo[k] = v[k];
  try {
    const saved = await updateVehicle(v.id, patch);
    renderAll();
    toast(`${{ loan: 'Returned', bodyshop: 'Back from bodyshop' }[kind] ?? 'Done'} — back in ${TAB_TITLE[tabOf(saved)]}`, {
      action: { label: 'Undo', run: async () => { await updateVehicle(v.id, undo); renderAll(); } },
    });
  } catch (err) { toast(errorText(err), { error: true }); }
}

async function purgeOld() {
  const btn = $('#purgeBtn');
  if (!confirmTap(btn, `Delete delivered > ${PURGE_DAYS} days? Tap again`)) return;
  const cutoff = new Date(Date.now() - PURGE_DAYS * 864e5).toISOString();
  try {
    const { data, error } = await sb.from('vehicles').delete()
      .eq('status', 'delivered').lt('delivered_at', cutoff).select('id, photo_path');
    if (error) throw error;
    data.forEach(r => S.vehicles.delete(r.id));
    await removePhotos(data.map(r => r.photo_path));
    renderAll();
    toast(data.length ? `Deleted ${data.length} old record${data.length === 1 ? '' : 's'}` : 'Nothing older than 30 days');
  } catch (err) { toast(errorText(err), { error: true }); }
}

// ---------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------
function openSheet(html) {
  const sheet = $('#sheet');
  sheet.onchange = null;  // drop handlers left by the previous sheet
  sheet.innerHTML = html;
  $('#sheetBackdrop').hidden = false;
  document.body.style.overflow = 'hidden';
  return sheet;
}

function closeSheet() {
  $('#sheetBackdrop').hidden = true;
  $('#sheet').innerHTML = '';
  document.body.style.overflow = '';
}

const sheetHead = title => `<div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${ICON.close}</button></div>`;

function openPhoto(v) {
  const url = S.photoUrls.get(v.photo_path);
  if (!url) return;
  openSheet(`${sheetHead([v.reg_ie, v.reg_imp].filter(Boolean).join(' / '))}<img class="photo-full" src="${esc(url)}" alt="">`);
}

// Stock → "Photos": tick the cars that need photos and print a list for the day.
function openPhotoPicker() {
  // Only cars on site (not out on loan or at the bodyshop)
  const cars = [...S.vehicles.values()].filter(v => v.status === 'stock' && !['loan', 'bodyshop'].includes(v.hold))
    .sort((a, b) => [a.make, a.model].join(' ').localeCompare([b.make, b.model].join(' ')));
  const picked = new Set();
  const sheet = openSheet(`${sheetHead('Photos list')}
    <p class="muted" style="margin:0 0 8px">Tick the cars that need photos, then print the list.</p>
    <input type="search" id="photoSearch" placeholder="Search stock by plate, make or model" autocomplete="off">
    <div class="photo-tools">
      <button type="button" class="link-btn" id="photoAll">Select all</button>
      <button type="button" class="link-btn" id="photoNone">Clear</button>
      <span class="muted" id="photoCount">0 selected</span>
    </div>
    <div class="pick-list" id="photoList"></div>
    <div class="sheet-actions">
      <button type="button" class="btn ghost" data-close>Cancel</button>
      <button type="button" class="btn primary" id="photoPrint" disabled>🖨 Print photo list</button>
    </div>`);

  const draw = () => {
    const q = norm($('#photoSearch', sheet).value);
    const shown = cars.filter(v => !q || [v.reg_ie, v.reg_imp, v.make, v.model].some(f => norm(f).includes(q)));
    $('#photoList', sheet).innerHTML = shown.length ? shown.map(v => {
      const url = v.photo_path && S.photoUrls.get(v.photo_path);
      return `<label class="pick photo-pick">
        <input type="checkbox" data-id="${v.id}" ${picked.has(v.id) ? 'checked' : ''}>
        ${url ? `<img class="thumb" src="${esc(url)}" alt="">` : `<span class="thumb placeholder">${ICON.car}</span>`}
        <span>${plateHTML(v)}<span class="muted">${esc([v.make, v.model].map(clean).filter(Boolean).join(' '))}${clean(v.color) ? ` · ${esc(v.color)}` : ''}</span></span>
      </label>`;
    }).join('') : '<p class="empty">No stock cars match.</p>';
  };
  const update = () => {
    $('#photoCount', sheet).textContent = `${picked.size} selected`;
    $('#photoPrint', sheet).disabled = !picked.size;
  };
  draw();
  $('#photoSearch', sheet).addEventListener('input', draw);
  $('#photoList', sheet).addEventListener('change', e => {
    const id = e.target.dataset.id;
    if (!id) return;
    e.target.checked ? picked.add(id) : picked.delete(id);
    update();
  });
  $('#photoAll', sheet).onclick = () => { $$('#photoList [data-id]', sheet).forEach(b => picked.add(b.dataset.id)); draw(); update(); };
  $('#photoNone', sheet).onclick = () => { picked.clear(); draw(); update(); };
  $('#photoPrint', sheet).onclick = () => printPhotoList(cars.filter(v => picked.has(v.id)));
}

function printPhotoList(cars) {
  if (!cars.length) return;
  printDoc({
    title: 'Photos', summary: plural(cars.length, 'car'),
    how: 'Tick ☐ when the photos of a car are done.',
    columns: ['Plate', 'Car', 'Colour', 'Notes', 'Photos done'],
    rows: cars.map(v => ({ cells: [
      { html: plateCell(v), cls: 'plate-cell' },
      { html: `<strong>${esc([v.make, v.model].map(clean).filter(Boolean).join(' ') || 'Unknown vehicle')}</strong>` },
      { html: esc(v.color || '—') },
      { html: esc(v.notes || ''), cls: 'notes-cell' },
      { html: '<span class="tick">☐</span>' },
    ] })),
  });
}

// "Sold" button: pick a stock car, or add one that was never in stock.
function openSoldPicker() {
  const sheet = openSheet(`${sheetHead('Which car was sold?')}
    <input type="search" id="pickSearch" placeholder="Search stock by plate, make or model" autocomplete="off">
    <div class="pick-list" id="pickList"></div>
    <button type="button" class="btn block" id="pickNew">${ICON.plus} Car not in stock — add it</button>`);

  const draw = () => {
    const q = norm($('#pickSearch').value);
    const cars = [...S.vehicles.values()]
      .filter(v => v.status === 'stock')
      .filter(v => !q || [v.reg_ie, v.reg_imp, v.make, v.model].some(f => norm(f).includes(q)))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    $('#pickList').innerHTML = cars.length ? cars.map(v => {
      const url = v.photo_path && S.photoUrls.get(v.photo_path);
      return `<button type="button" class="pick" data-id="${v.id}">
        ${url ? `<img class="thumb" src="${esc(url)}" alt="">` : `<span class="thumb placeholder">${ICON.car}</span>`}
        <span>${plateHTML(v)}<span class="muted">${esc(`${v.make} ${v.model}`.trim())}</span></span>
      </button>`;
    }).join('') : '<p class="empty">No stock vehicles match.</p>';
  };
  draw();
  $('#pickSearch').addEventListener('input', draw);
  $('#pickList').addEventListener('click', e => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (id) openVehicleForm({ vehicle: S.vehicles.get(id), convert: true });
  });
  $('#pickNew').addEventListener('click', () => openVehicleForm({ sold: true }));
  sheet.querySelector('#pickSearch').focus();
}

// Vehicle form. Modes:
//   {}                          new stock vehicle
//   { sold: true }              new sold vehicle (not from stock)
//   { vehicle }                 edit
//   { vehicle, convert: true }  stock → sold
function openVehicleForm({ vehicle = null, sold = false, convert = false } = {}) {
  const v = vehicle ?? {};
  const isNew = !vehicle;
  const soldFields = sold || convert || (vehicle && vehicle.status !== 'stock');
  const canBeSold = isNew && !sold;  // New stock: "Already sold" shows the sale fields
  const title = convert ? 'Mark as sold' : isNew ? (sold ? 'New sale' : 'New stock vehicle') : 'Edit vehicle';
  const services = isNew ? [] : v.services;  // new cars: pick what they need
  const sellers = [...new Set([...S.vehicles.values()].map(x => clean(x.seller)).filter(Boolean))].sort();

  let newFile = null;
  let removePhoto = false;
  const existingUrl = v.photo_path && S.photoUrls.get(v.photo_path);

  const svcPill = s => {
    const locked = !isNew && v[`${s.key}_state`] === 'done';
    return `<label class="pill"><input type="checkbox" name="svc_${s.key}" ${services.includes(s.key) ? 'checked' : ''}><span>${esc(s.label)}${locked ? ' ✓' : ''}</span></label>`;
  };

  const sheet = openSheet(`<form class="form" id="vform" novalidate>
    ${sheetHead(title)}
    <div class="photo-field">
      <div class="photo-preview" id="photoPreview">${existingUrl ? `<img src="${esc(existingUrl)}" alt="">` : ICON.camera}</div>
      <div class="photo-buttons">
        <label class="btn small">${existingUrl ? 'Change photo' : 'Add photo'}<input type="file" accept="image/*" id="photoInput" hidden></label>
        <button type="button" class="btn small ghost danger" id="photoRemove" ${existingUrl ? '' : 'hidden'}>Remove</button>
      </div>
    </div>
    <div class="grid2">
      <label>Irish reg (IRL)<input name="reg_ie" class="plate-input" value="${esc(v.reg_ie)}" autocapitalize="characters" autocomplete="off"></label>
      <label>Import reg (IMP)<input name="reg_imp" class="plate-input" value="${esc(v.reg_imp)}" autocapitalize="characters" autocomplete="off"></label>
    </div>
    <p class="hint">At least one registration is required.</p>
    <div class="grid2">
      <label>Make<input name="make" value="${esc(v.make)}" autocapitalize="words"></label>
      <label>Model<input name="model" value="${esc(v.model)}" autocapitalize="words"></label>
    </div>
    <label>Colour<input name="color" value="${esc(v.color)}" autocapitalize="words"></label>
    <div class="swatches" id="swatches">${COLOURS.map(([n, h]) => `<button type="button" class="swatch" data-colour="${n}"><span class="dot" style="background:${h}"></span>${n}</button>`).join('')}</div>
    <fieldset><legend>Services needed${isNew ? ' — pick at least one' : ''}</legend><div class="pills" id="svcPills">
      <label class="pill all"><input type="checkbox" id="svcAll" ${SERVICES.every(s => services.includes(s.key)) ? 'checked' : ''}><span>All</span></label>
      ${SERVICES.map(svcPill).join('')}
    </div></fieldset>
    <div class="section-label">Status</div>
    <div class="pills">
      <label class="pill urgent"><input type="checkbox" name="urgent" ${v.urgent ? 'checked' : ''}><span>Urgent</span></label>
      <label class="pill"><input type="radio" name="stock_status" value="in_stock" ${v.stock_status !== 'due_in' ? 'checked' : ''}><span>On site</span></label>
      <label class="pill"><input type="radio" name="stock_status" value="due_in" ${v.stock_status === 'due_in' ? 'checked' : ''}><span>Due in</span></label>
    </div>
    ${canBeSold ? `<label class="pill sold-toggle" style="margin-top:6px"><input type="checkbox" id="alreadySold"><span>✓ Already sold — stays on top of Stock until the first job starts</span></label>` : ''}
    ${soldFields || canBeSold ? `<div id="saleFields" ${soldFields ? '' : 'hidden'}>
      <div class="section-label">Sale</div>
      <div class="grid2">
        <label>Delivery date<input type="date" name="delivery_date" value="${esc(v.delivery_date)}"></label>
        <label>Delivery time<input name="delivery_time" value="${esc(v.delivery_time)}" placeholder="e.g. 5PM"></label>
      </div>
      ${!v.delivery_date && clean(v.delivery_day) ? `<p class="hint">Previously noted as “${esc(v.delivery_day)}” — pick the date above.</p>` : ''}
      <label>Salesperson<input name="seller" value="${esc(v.seller)}" list="sellerList" autocapitalize="words"></label>
      <datalist id="sellerList">${sellers.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
      <label>VRT / NCT<input name="vrt_nct" value="${esc(v.vrt_nct)}" placeholder="e.g. done, VRT pending, 12 Oct"></label>
      <label>Mechanical<textarea name="mechanical_notes" rows="2">${esc(v.mechanical_notes)}</textarea></label>
      <label>Estimate<input name="estimate" value="${esc(v.estimate)}"></label></div>` : ''}
    <label>Notes<textarea name="notes" rows="2">${esc(v.notes)}</textarea></label>
    <p class="form-error" id="formError" hidden></p>
    <div class="sheet-actions">
      <button type="button" class="btn ghost" data-close>Cancel</button>
      <button type="submit" class="btn primary" id="saveBtn">${convert ? 'Mark as sold' : 'Save'}</button>
    </div>
  </form>`);

  const form = $('#vform', sheet);
  const colourInput = form.elements.color;
  const markSwatch = () => $$('.swatch', form).forEach(b => b.classList.toggle('on', b.dataset.colour.toLowerCase() === clean(colourInput.value).toLowerCase()));
  markSwatch();
  $('#swatches', form).addEventListener('click', e => {
    const b = e.target.closest('[data-colour]');
    if (!b) return;
    colourInput.value = b.dataset.colour;
    markSwatch();
  });
  colourInput.addEventListener('input', markSwatch);

  // "All" ticks every service; it stays in sync when services are ticked one by one.
  const svcBoxes = SERVICES.map(s => form.elements[`svc_${s.key}`]);
  const allBox = $('#svcAll', form);
  allBox.addEventListener('change', () => svcBoxes.forEach(b => { b.checked = allBox.checked; }));
  svcBoxes.forEach(b => b.addEventListener('change', () => { allBox.checked = svcBoxes.every(x => x.checked); }));

  // Already sold: show the sale fields, and it's a priority (Urgent) unless unticked
  $('#alreadySold', form)?.addEventListener('change', e => {
    $('#saleFields', form).hidden = !e.target.checked;
    form.elements.urgent.checked = e.target.checked;
    $('#saveBtn', form).textContent = e.target.checked ? 'Save as sold' : 'Save';
  });

  $('#photoInput', form).addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    newFile = file;
    removePhoto = false;
    $('#photoPreview', form).innerHTML = `<img src="${URL.createObjectURL(file)}" alt="">`;
    $('#photoRemove', form).hidden = false;
  });
  $('#photoRemove', form).addEventListener('click', () => {
    newFile = null;
    removePhoto = true;
    $('#photoPreview', form).innerHTML = ICON.camera;
    $('#photoRemove', form).hidden = true;
    $('#photoInput', form).value = '';
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = form.elements;
    const showError = msg => { const el = $('#formError', form); el.textContent = msg; el.hidden = false; };

    const row = {
      reg_ie: plate(f.reg_ie.value) || null,
      reg_imp: plate(f.reg_imp.value) || null,
      make: clean(f.make.value),
      model: clean(f.model.value),
      color: clean(f.color.value),
      notes: clean(f.notes.value),
      services: SERVICES.filter(s => f[`svc_${s.key}`].checked).map(s => s.key),
      urgent: f.urgent.checked,
      stock_status: form.querySelector('[name=stock_status]:checked')?.value ?? 'in_stock',
    };
    if (!row.reg_ie && !row.reg_imp) return showError('Enter at least one registration (IRL or IMP).');
    if (isNew && !row.services.length) return showError('Choose the services this car needs (or tap All).');
    const soldNow = soldFields || !!$('#alreadySold', form)?.checked;
    if (soldNow) Object.assign(row, {
      delivery_date: f.delivery_date.value || null,
      delivery_time: clean(f.delivery_time.value),
      seller: clean(f.seller.value),
      vrt_nct: clean(f.vrt_nct.value),
      mechanical_notes: clean(f.mechanical_notes.value),
      estimate: clean(f.estimate.value),
    });
    if (isNew) row.status = soldNow ? 'in_prep' : 'stock';
    if (convert) row.status = 'in_prep';

    const saveBtn = $('#saveBtn', form);
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    let uploaded = null;
    try {
      if (newFile) uploaded = row.photo_path = await uploadPhoto(newFile);
      else if (removePhoto) row.photo_path = null;

      let saved;
      if (isNew) {
        const { data, error } = await sb.from('vehicles').insert(row).select().single();
        if (error) throw error;
        saved = data;
        upsertLocal(saved);
      } else {
        saved = await updateVehicle(v.id, row);
        if ((newFile || removePhoto) && v.photo_path) await removePhotos([v.photo_path]);
      }
      await refreshPhotoUrls();
      closeSheet();
      if (tabOf(saved) !== S.tab) switchTab(tabOf(saved));
      renderAll();
      toast(convert ? 'Marked as sold' : isNew ? (soldNow ? 'Sold car added' : 'Vehicle added') : 'Saved');
    } catch (err) {
      if (uploaded) await removePhotos([uploaded]);
      showError(errorText(err));
      saveBtn.disabled = false;
      saveBtn.textContent = convert ? 'Mark as sold' : soldNow && !soldFields ? 'Save as sold' : 'Save';
    }
  });
}

function openAccount() {
  const sheet = openSheet(`<form class="form" id="accForm">
    ${sheetHead('Account')}
    <p class="muted">Signed in as <strong>${esc(loginName(S.session.user.email))}</strong>${isAdmin() ? ' · Admin' : ''}</p>
    <label>Display name<input name="name" value="${esc(S.me?.display_name)}" required></label>
    <div class="sheet-actions">
      <button type="button" class="btn ghost danger" id="signOut">Sign out</button>
      <button type="submit" class="btn primary">Save</button>
    </div>
  </form>
  <div class="form" style="margin-top:18px">
    <div class="section-label">Notifications</div>
    <div id="pushBox" class="push-box"><p class="muted">Checking…</p></div>
  </div>
  <form class="form" id="pwChange" style="margin-top:18px">
    <div class="section-label">Change password</div>
    <label>New password<input name="pw" type="password" minlength="6" autocomplete="new-password" required></label>
    <label>Repeat new password<input name="pw2" type="password" minlength="6" autocomplete="new-password" required></label>
    <p class="hint" style="margin:0">At least 6 characters.</p>
    <div class="sheet-actions"><button type="submit" class="btn">Change password</button></div>
  </form>`);
  $('#signOut', sheet).onclick = async () => {
    closeSheet();
    // Stop notifications on this phone for the person signing out
    try { await disablePush(); } catch {}
    await sb.auth.signOut();
  };
  renderPushBox();
  $('#pwChange', sheet).onsubmit = async e => {
    e.preventDefault();
    const { pw, pw2 } = e.target.elements;
    if (pw.value !== pw2.value) return toast('The two passwords don’t match.', { error: true });
    const { error } = await sb.auth.updateUser({ password: pw.value });
    if (error) return toast(error.message, { error: true });
    closeSheet();
    toast('Password changed');
  };
  $('#accForm', sheet).onsubmit = async e => {
    e.preventDefault();
    const name = clean(e.target.elements.name.value);
    if (!name) return;
    const { error } = await sb.from('profiles').update({ display_name: name }).eq('id', S.me.id);
    if (error) return toast(errorText(error), { error: true });
    S.me.display_name = name;
    closeSheet();
    renderAll();
    toast('Name updated');
  };
}

function openNewPassword() {
  const sheet = openSheet(`<form class="form" id="pwForm">
    ${sheetHead('Choose a new password')}
    <label>New password<input name="pw" type="password" minlength="6" autocomplete="new-password" required></label>
    <div class="sheet-actions"><button type="submit" class="btn primary">Save password</button></div>
  </form>`);
  $('#pwForm', sheet).onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: e.target.elements.pw.value });
    if (error) return toast(error.message, { error: true });
    closeSheet();
    toast('Password updated');
  };
}

// ---------------------------------------------------------------------
// Team (admin)
// ---------------------------------------------------------------------
// Team screen: a short list of people (who they are at a glance); tapping one
// opens their settings. What each setting does:
//   services     — the jobs they do: they only see those bubbles on the cars
//                  (nothing ticked = a read-only summary; purely visual)
//   handles_sold — can Start prep / Ready to go / Delivered on sold cars
//   sold_alerts  — gets prep / ready notifications and the 8am list
//   loan_alerts  — gets a notification when a car is back from loan
//   can_dent / can_bodyshop — may use Dent / Bodyshop
//   show_count   — sees "my cars this month"
//   is_admin     — adds / sells / edits cars, loans, Team and Pay report
// The database enforces these too, and only admins can change them.
function personTags(p) {
  const tags = [];
  if (p.is_admin) tags.push('<span class="tag admin">Admin</span>');
  const jobs = SERVICES.filter(s => (p.services ?? []).includes(s.key)).map(s => s.label);
  if (jobs.length) tags.push(...jobs.map(j => `<span class="tag job">${esc(j)}</span>`));
  if (p.handles_sold) tags.push('<span class="tag sold">Prepares sold cars</span>');
  if (p.sold_alerts) tags.push('<span class="tag alerts">🔔 Sold notifications</span>');
  if (p.can_dent) tags.push('<span class="tag dent">Dent</span>');
  if (p.can_bodyshop) tags.push('<span class="tag body">Bodyshop</span>');
  if (p.loan_alerts) tags.push('<span class="tag alerts">🔔 Loan returns</span>');
  if (p.show_count) tags.push('<span class="tag">🏁 Counter</span>');
  if (!jobs.length && !p.handles_sold) tags.push('<span class="tag muted">Overview only</span>');
  return tags.join('');
}

function renderTeam() {
  const staff = [...S.profiles.values()].sort((a, b) => a.display_name.localeCompare(b.display_name));
  const row = p => `<button type="button" class="person-row" data-person="${p.id}">
    <span class="person-avatar">${esc(initials(p.display_name))}</span>
    <span class="person-main"><strong>${esc(p.display_name)}</strong><span class="person-tags">${personTags(p)}</span></span>
    <span class="person-chevron" aria-hidden="true">›</span>
  </button>`;
  const group = (title, people) => people.length ? `<div class="panel team-group">
    <h2>${title} <span class="badge grey">${people.length}</span></h2>
    ${people.map(row).join('')}
  </div>` : '';
  $('#teamView').innerHTML = `
    ${group('Managers', staff.filter(p => p.is_admin))}
    ${group('Team', staff.filter(p => !p.is_admin))}
    <p class="muted team-hint">Tap a person to change their jobs and settings. New people appear here once their login is created.</p>`;
}

function onTeamClick(e) {
  const btn = e.target.closest('[data-person]');
  if (btn) openPerson(btn.dataset.person);
}

function openPerson(id) {
  const p = S.profiles.get(id);
  if (!p) return;
  const me = p.id === S.me.id;
  const sw = (attr, on, title, help, disabled = false) => `<label class="setting">
    <span><strong>${title}</strong><small>${help}</small></span>
    <span class="switch"><input type="checkbox" ${attr} ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="track"></span></span>
  </label>`;
  const sheet = openSheet(`<div class="form person-sheet" data-person-id="${p.id}">
    ${sheetHead(p.display_name)}
    <label>Name<input data-field="display_name" value="${esc(p.display_name)}" autocapitalize="words"></label>

    <div class="section-label">Jobs they do</div>
    <p class="hint" style="margin:0">They get a button for these on the cars. Leave all off (managers) to just see a summary of every job.</p>
    <div class="pills">${SERVICES.map(s => `<label class="pill"><input type="checkbox" data-svc="${s.key}" ${(p.services ?? []).includes(s.key) ? 'checked' : ''}><span>${esc(s.label)}</span></label>`).join('')}</div>

    <div class="section-label">Sold cars</div>
    ${sw('data-flag="sold_alerts"', p.sold_alerts, '🔔 Sold car notifications', 'Only notifications — no buttons. When prep starts or a car is ready, and the day’s list at 8am.')}
    ${sw('data-flag="handles_sold"', p.handles_sold, 'Start prep / Ready to go buttons', 'Only for the person who prepares sold cars (Ryann). Adds these buttons on every sold car.')}

    ${'loan_alerts' in p ? `<div class="section-label">Loans</div>
    ${sw('data-flag="loan_alerts"', p.loan_alerts, '🔔 Back from loan notifications', 'A notification when a car comes back from loan, to get it ready again.')}` : ''}

    <div class="section-label">Dent</div>
    ${sw('data-flag="can_dent"', p.can_dent, 'Can use Dent', 'Add cars to the Dent list and mark them done.')}

    <div class="section-label">Bodyshop</div>
    ${sw('data-flag="can_bodyshop"', p.can_bodyshop, 'Can use Bodyshop', 'Send cars for panel beating & paint and mark them back.')}

    ${'show_count' in p ? `<div class="section-label">Counter</div>
    ${sw('data-flag="show_count"', p.show_count, '🏁 My cars this month', 'Shows them how many cars they’ve done this month, with the list.')}` : ''}

    <div class="section-label">Access</div>
    ${sw('data-flag="is_admin"', p.is_admin, 'Admin', me ? 'You can’t remove your own admin.' : 'Adds and sells cars, edits, loans, Team and Pay report.', me)}

    <p class="person-saved muted" aria-live="polite"></p>
    <div class="sheet-actions"><button type="button" class="btn primary" data-close>Done</button></div>
  </div>`);
  sheet.onchange = e => savePerson(p.id, e.target);
}

async function savePerson(id, input) {
  const p = S.profiles.get(id);
  const box = input.closest('.person-sheet');
  let patch;
  if (input.dataset.svc) patch = { services: $$('[data-svc]', box).filter(b => b.checked).map(b => b.dataset.svc) };
  else if (input.dataset.flag) patch = { [input.dataset.flag]: input.checked };
  else if (input.dataset.field === 'display_name') {
    const name = clean(input.value);
    if (!name) { input.value = p.display_name; return; }
    patch = { display_name: name };
  } else return;
  const { error } = await sb.from('profiles').update(patch).eq('id', id);
  if (error) {
    toast(errorText(error), { error: true });
    openPerson(id);  // put the switches back as they were
    return;
  }
  Object.assign(p, patch);
  if (patch.display_name) $('.sheet-head h2', box).textContent = patch.display_name;
  $('.person-saved', box).textContent = '✓ Saved';
  renderAll();
}

// ---------------------------------------------------------------------
// Pay report (admin)
// ---------------------------------------------------------------------
const REPORT_PRESETS = [
  ['this-week', 'This week'],
  ['last-week', 'Last week'],
  ['this-month', 'This month'],
  ['last-month', 'Last month'],
];
const report = { preset: 'this-week', start: null, end: null, rows: [] };

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const inputDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const longDate = d => d.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const csvDate = ts => {
  const d = new Date(ts);
  return `${inputDate(d).split('-').reverse().join('/')} ${d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })}`;
};

// [start, end) for a preset; weeks run Monday → Sunday.
function presetRange(preset) {
  const today = startOfDay(new Date());
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const y = today.getFullYear(), m = today.getMonth();
  return {
    'this-week': [monday, addDays(monday, 7)],
    'last-week': [addDays(monday, -7), monday],
    'this-month': [new Date(y, m, 1), new Date(y, m + 1, 1)],
    'last-month': [new Date(y, m - 1, 1), new Date(y, m, 1)],
  }[preset];
}

function periodLabel() {
  const last = addDays(report.end, -1);
  return report.start.getTime() === last.getTime() ? longDate(report.start) : `${longDate(report.start)} – ${longDate(last)}`;
}

function renderReport() {
  $('#reportView').innerHTML = `
    <div class="panel no-print">
      <h2>Period</h2>
      <div class="presets" id="presets">${REPORT_PRESETS.map(([k, label]) =>
        `<button type="button" class="btn small" data-preset="${k}">${label}</button>`).join('')}</div>
      <div class="grid2">
        <label>From<input type="date" id="fromDate"></label>
        <label>To<input type="date" id="toDate"></label>
      </div>
      <div class="report-actions">
        <button type="button" class="btn primary" id="reportPrintBtn">Print / Save PDF</button>
        <button type="button" class="btn" id="csvSummaryBtn">Download summary (Excel)</button>
        <button type="button" class="btn" id="csvListBtn">Download full list (Excel)</button>
      </div>
    </div>
    <div id="reportBody"><p class="empty">Loading…</p></div>`;

  $('#presets').addEventListener('click', e => {
    const b = e.target.closest('[data-preset]');
    if (b) setReportPreset(b.dataset.preset);
  });
  const onDates = () => {
    const from = $('#fromDate').value, to = $('#toDate').value;
    if (!from || !to) return;
    let start = startOfDay(new Date(`${from}T00:00`)), last = startOfDay(new Date(`${to}T00:00`));
    if (last < start) [start, last] = [last, start];
    report.preset = null;
    report.start = start;
    report.end = addDays(last, 1);
    loadReport();
  };
  $('#fromDate').addEventListener('change', onDates);
  $('#toDate').addEventListener('change', onDates);
  $('#reportPrintBtn').addEventListener('click', () => window.print());
  $('#csvSummaryBtn').addEventListener('click', exportSummaryCsv);
  $('#csvListBtn').addEventListener('click', exportListCsv);

  if (report.preset || !report.start) setReportPreset(report.preset || 'this-week');
  else loadReport();
}

function setReportPreset(preset) {
  report.preset = preset;
  [report.start, report.end] = presetRange(preset);
  loadReport();
}

async function loadReport() {
  for (const b of $$('#presets [data-preset]')) b.classList.toggle('primary', b.dataset.preset === report.preset);
  $('#fromDate').value = inputDate(report.start);
  $('#toDate').value = inputDate(addDays(report.end, -1));
  $('#reportBody').innerHTML = '<p class="empty">Loading…</p>';

  const { data, error } = await sb.from('service_completions')
    .select('service, user_id, user_name, plate, vehicle, done_at')
    .gte('done_at', report.start.toISOString()).lt('done_at', report.end.toISOString())
    .order('done_at');
  if (error) {
    $('#reportBody').innerHTML = `<p class="empty">${esc(errorText(error))}</p>`;
    return;
  }
  report.rows = data;
  drawReport();
}

// One entry per person: their cars and count per service.
function reportPeople() {
  const people = new Map();
  for (const r of report.rows) {
    const key = r.user_id ?? `name:${r.user_name}`;
    if (!people.has(key)) {
      people.set(key, { name: S.profiles.get(r.user_id)?.display_name || r.user_name || 'Unknown', items: [], counts: {} });
    }
    const p = people.get(key);
    p.items.push(r);
    p.counts[r.service] = (p.counts[r.service] ?? 0) + 1;
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function drawReport() {
  const body = $('#reportBody');
  if (!body) return;
  const people = reportPeople();
  const totals = Object.fromEntries(SERVICES.map(s => [s.key, report.rows.filter(r => r.service === s.key).length]));

  const head = `<div class="panel report-head">
    <h2>Pay report</h2>
    <p class="period">${esc(periodLabel())}</p>
    <div class="stat-row">${SERVICES.map(s => `<div class="stat"><strong>${totals[s.key]}</strong><span>${esc(s.label)}</span></div>`).join('')}</div>
    <p class="muted how">Each person below shows how many cars they finished in this period and the list of those cars.
      A car counts on the day its service was marked <strong>Done</strong>, by the person credited for it.</p>
  </div>`;

  if (!people.length) {
    body.innerHTML = head + '<p class="empty">No services were completed in this period.</p>';
    return;
  }

  const personBlock = p => {
    const lines = SERVICES.filter(s => p.counts[s.key]).map(s => {
      const n = p.counts[s.key];
      return `<tr><td>${esc(s.label)}</td><td>${n} car${n === 1 ? '' : 's'}</td></tr>`;
    }).join('');
    return `<div class="panel person">
      <div class="person-head">
        <h2>${esc(p.name)}</h2>
        <div class="person-total">${p.items.length} car${p.items.length === 1 ? '' : 's'}</div>
      </div>
      <table class="compact">
        <thead><tr><th>Service</th><th>Cars</th></tr></thead>
        <tbody>${lines}</tbody>
      </table>
      <details class="car-list" open>
        <summary>Cars done (${p.items.length})</summary>
        <table class="compact">
          <thead><tr><th>Date</th><th>Plate</th><th>Car</th><th>Service</th></tr></thead>
          <tbody>${p.items.map(i => `<tr>
            <td>${esc(fmtDate(i.done_at))}</td><td class="mono">${esc(i.plate)}</td>
            <td>${esc(i.vehicle)}</td><td>${esc(SERVICE[i.service]?.label ?? i.service)}</td></tr>`).join('')}</tbody>
        </table>
      </details>
    </div>`;
  };

  body.innerHTML = head + people.map(personBlock).join('');
}

function downloadCsv(filename, rows) {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const text = rows.map(r => r.map(q).join(',')).join('\r\n');
  // BOM so Excel opens accents and € correctly
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const reportFileTag = () => `${inputDate(report.start)}_to_${inputDate(addDays(report.end, -1))}`;

function exportSummaryCsv() {
  const rows = [['Period', 'Team member', 'Service', 'Cars']];
  for (const p of reportPeople()) {
    for (const s of SERVICES.filter(s => p.counts[s.key])) rows.push([periodLabel(), p.name, s.label, p.counts[s.key]]);
  }
  downloadCsv(`m6-pay-summary_${reportFileTag()}.csv`, rows);
}

function exportListCsv() {
  const rows = [['Date', 'Team member', 'Service', 'Plate', 'Car']];
  for (const p of reportPeople()) {
    for (const i of p.items) rows.push([csvDate(i.done_at), p.name, SERVICE[i.service]?.label ?? i.service, i.plate, i.vehicle]);
  }
  downloadCsv(`m6-cars-done_${reportFileTag()}.csv`, rows);
}

// ---------------------------------------------------------------------
// Push notifications (new stock for everyone; sold / loan alerts for the
// people chosen on the Team screen)
// ---------------------------------------------------------------------
const PUSH_BANNER_KEY = 'm6.pushBanner';
let swReg = null;

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

async function registerSw() {
  if (!('serviceWorker' in navigator)) return null;
  try { swReg = await navigator.serviceWorker.register('sw.js'); } catch { swReg = null; }
  return swReg;
}

function base64UrlToBytes(b64) {
  const padded = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

async function currentPushSubscription() {
  const reg = swReg || await navigator.serviceWorker?.getRegistration();
  return reg?.pushManager ? reg.pushManager.getSubscription() : null;
}

// 'needs-install' | 'unsupported' | 'blocked' | 'on' | 'off'
async function pushStatus() {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIos() && !isInstalled()) return 'needs-install';
  if (!supported || !VAPID_PUBLIC_KEY) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  return (await currentPushSubscription()) ? 'on' : 'off';
}

async function savePushSubscription(sub) {
  const { endpoint, keys } = sub.toJSON();
  const { error } = await sb.from('push_subscriptions')
    .upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth, user_id: S.me.id });
  if (error) throw error;
}

async function enablePush() {
  // Must be the first await after the tap: iPhone only asks from a user gesture.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed on this phone.');
  const reg = swReg || await registerSw();
  if (!reg) throw new Error('This browser can’t receive notifications.');
  const sub = await reg.pushManager.getSubscription()
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) });
  try {
    await savePushSubscription(sub);
  } catch (err) {
    await sub.unsubscribe();
    throw err;
  }
}

async function disablePush() {
  const sub = await currentPushSubscription();
  if (!sub) return;
  await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

async function turnOnPush() {
  try {
    await enablePush();
    toast('Notifications on for this phone');
  } catch (err) {
    toast(errorText(err), { error: true });
  }
  renderPushBox();
  renderPushBanner();
}

// Re-save this phone's subscription after login, in case it was lost.
async function syncPush() {
  try {
    if (await pushStatus() === 'on') await savePushSubscription(await currentPushSubscription());
  } catch {}
  renderPushBanner();
}

const PUSH_TEXT = {
  on: 'This phone gets the app’s notifications: new stock, and any alerts set for you.',
  off: 'Get notifications on this phone: new stock, and any alerts set for you.',
  'needs-install': 'On iPhone, notifications only work from the app on your home screen: in Safari tap Share → Add to Home Screen, then open M6 Prep from the new icon and turn them on here.',
  blocked: 'Notifications are blocked for this app. Allow them in your phone’s settings, then come back here.',
  unsupported: 'This browser can’t receive notifications. Try Chrome on Android or the home-screen app on iPhone.',
};

async function renderPushBox() {
  const box = $('#pushBox');
  if (!box) return;
  const status = await pushStatus();
  const button = status === 'on'
    ? '<button type="button" class="btn ghost" data-push="off">Turn off</button>'
    : status === 'off' ? `<button type="button" class="btn primary" data-push="on">${ICON.bell} Enable notifications</button>` : '';
  box.innerHTML = `<p class="${status === 'on' ? '' : 'muted'}">${status === 'on' ? '✅ ' : ''}${esc(PUSH_TEXT[status])}</p>${button}`;
  box.onclick = async e => {
    const b = e.target.closest('[data-push]');
    if (!b) return;
    b.disabled = true;
    if (b.dataset.push === 'on') return turnOnPush();
    try { await disablePush(); toast('Notifications off'); } catch (err) { toast(errorText(err), { error: true }); }
    renderPushBox();
    renderPushBanner();
  };
}

async function renderPushBanner() {
  const banner = $('#pushBanner');
  const status = await pushStatus();
  const show = (status === 'off' || status === 'needs-install') && store.get(PUSH_BANNER_KEY) !== 'dismissed';
  banner.hidden = !show;
  banner.dataset.status = status;
  if (!show) return;
  banner.innerHTML = `<span>${ICON.bell}</span>
    <p>Get a notification when a new car arrives in stock.</p>
    <button type="button" class="btn small primary" data-enable>${status === 'off' ? 'Turn on' : 'How?'}</button>
    <button type="button" class="icon-btn" data-dismiss aria-label="Dismiss">${ICON.close}</button>`;
}

// ---------------------------------------------------------------------
// My cars this month (people with profiles.show_count)
// ---------------------------------------------------------------------
// Their own finished jobs from the pay-report log (same credit rules as the
// pay report), refreshed when cars change.
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };
async function loadMyMonth() {
  if (!S.me?.show_count) { S.myMonth = null; return; }
  const { data, error } = await sb.from('service_completions')
    .select('service, plate, vehicle, done_at')
    .eq('user_id', S.me.id).gte('done_at', monthStart().toISOString())
    .order('done_at', { ascending: false });
  S.myMonth = error ? null : data;
}
let myMonthTimer = null;
function queueMyMonth() {
  if (!S.me?.show_count) return;
  clearTimeout(myMonthTimer);
  myMonthTimer = setTimeout(async () => { await loadMyMonth(); renderMyMonth(); }, 1500);
}
const carsIn = rows => new Set(rows.map(r => `${r.plate}|${r.vehicle}`)).size;

function renderMyMonth() {
  const btn = $('#myCount');
  btn.hidden = !S.myMonth;
  if (!S.myMonth) return;
  const month = new Date().toLocaleDateString('en-IE', { month: 'long' });
  const n = carsIn(S.myMonth);
  btn.innerHTML = `<span class="my-count-num">${n}</span><span>${n === 1 ? 'car' : 'cars'} done in ${esc(month)}</span><span class="my-count-more">See list ›</span>`;
}

function openMyMonth() {
  const rows = S.myMonth ?? [];
  const month = new Date().toLocaleDateString('en-IE', { month: 'long', year: 'numeric' });
  const per = SERVICES.map(sv => [sv.label, carsIn(rows.filter(r => r.service === sv.key))]).filter(([, n]) => n);
  openSheet(`${sheetHead(`My cars — ${month}`)}
    <div class="my-month-total"><strong>${carsIn(rows)}</strong> ${carsIn(rows) === 1 ? 'car' : 'cars'} done this month</div>
    ${per.length > 1 ? `<p class="muted" style="margin:0 0 10px">${per.map(([l, n]) => `${esc(l)}: <strong>${n}</strong>`).join(' · ')}</p>` : ''}
    ${rows.length ? `<div class="my-month-list">${rows.map(r => `<div class="my-month-row">
      <span class="my-month-day">${esc(new Date(r.done_at).toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' }))}</span>
      <span><strong>${esc(r.plate || '—')}</strong> ${esc(r.vehicle)}</span>
      <span class="muted">${esc(SERVICE[r.service]?.label ?? r.service)}</span>
    </div>`).join('')}</div>` : '<p class="empty">Nothing yet this month.</p>'}
    <p class="hint">A car counts for the person who started the job. It resets on the 1st of each month.</p>
    <div class="sheet-actions"><button type="button" class="btn primary" data-close>Close</button></div>`);
}

// ---------------------------------------------------------------------
// Supplies: the team asks for materials; the boss prints the list
// ---------------------------------------------------------------------
const SUPPLY_STATUS = { needed: 'Needed', ordered: 'Ordered', done: 'Got it' };

// Admins manage every request; others can change or remove their own.
const canEditSupply = s => isAdmin() || s.requested_by === S.me?.id;

function supplyRow(s) {
  const mine = canEditSupply(s);
  const meta = `${esc(nameOf(s.requested_by))} · ${esc(fmtDate(s.requested_at))}`
    + (s.status !== 'needed' && s.updated_by ? ` — ${esc(SUPPLY_STATUS[s.status].toLowerCase())} by ${esc(nameOf(s.updated_by))}` : '');
  const buttons = !mine ? '' : [
    s.status === 'needed' && isAdmin() ? '<button class="btn small ghost" data-supply="ordered">Ordered</button>' : '',
    s.status !== 'done' ? `<button class="btn small accent" data-supply="done">${ICON.check} Got it</button>` : '',
    s.status === 'done' ? '<button class="btn small ghost" data-supply="needed">Need again</button>' : '',
    s.status !== 'done' ? '<button class="btn small ghost danger" data-supply="delete" aria-label="Remove">✕</button>' : '',
  ].join('');
  return `<div class="supply-row ${s.status}" data-supply-id="${s.id}">
    <div class="supply-main">
      <strong>${esc(s.item)}</strong>${clean(s.qty) ? `<span class="supply-qty">× ${esc(s.qty)}</span>` : ''}
      ${clean(s.note) ? `<div class="supply-note">${esc(s.note)}</div>` : ''}
      <div class="supply-meta">${meta}</div>
    </div>
    <div class="supply-actions">${buttons}</div>
  </div>`;
}

function renderSupplies() {
  const view = $('#suppliesView');
  if (!S.suppliesReady) {
    view.innerHTML = '<div class="panel"><p class="muted">The supplies list isn’t set up yet (run 009_supplies.sql in Supabase).</p></div>';
    return;
  }
  const by = st => S.supplies.filter(s => s.status === st);
  const pastItems = [...new Set(S.supplies.map(s => clean(s.item)).filter(Boolean))].sort();
  const section = (st, title, empty) => {
    const items = by(st);
    return `<div class="panel">
      <h2>${title} <span class="badge${st === 'needed' ? '' : ' grey'}">${items.length}</span></h2>
      ${items.length ? items.map(supplyRow).join('') : `<p class="muted">${empty}</p>`}
    </div>`;
  };
  view.innerHTML = `
    <form class="panel form" id="supplyForm" autocomplete="off">
      <h2>Ask for supplies</h2>
      <p class="muted">Running low on something for the valet? Add it here — the manager sees it and prints the list.</p>
      <label>What do you need?<input name="supply_item" list="supplyItems" placeholder="e.g. Snow foam 5L, microfibre cloths" required></label>
      <datalist id="supplyItems">${pastItems.map(i => `<option value="${esc(i)}">`).join('')}</datalist>
      <div class="grid2">
        <label>How many?<input name="qty" placeholder="e.g. 2, 1 box"></label>
        <label>Note (optional)<input name="note" placeholder="brand, size, urgent…"></label>
      </div>
      <div class="sheet-actions" style="position:static"><button type="submit" class="btn primary">${ICON.plus} Add to list</button></div>
    </form>
    <div class="report-actions no-print"><button type="button" class="btn" id="printSuppliesBtn">🖨 Print supplies list</button></div>
    ${section('needed', 'Needed', 'Nothing needed right now. 👍')}
    ${section('ordered', 'Ordered', 'Nothing on order.')}
    ${section('done', 'Got it (last 14 days)', 'Nothing received recently.')}`;
}

async function onSuppliesSubmit(e) {
  if (e.target.id !== 'supplyForm') return;
  e.preventDefault();
  const f = e.target.elements;
  // (a field can't be called "item": form.elements.item is a built-in method)
  const row = { item: clean(f.supply_item.value), qty: clean(f.qty.value), note: clean(f.note.value) };
  if (!row.item) return;
  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true;
  const { error } = await sb.from('supplies').insert(row);
  btn.disabled = false;
  if (error) return toast(errorText(error), { error: true });
  await loadSupplies();
  renderAll();
  toast('Added to the supplies list');
}

async function onSuppliesClick(e) {
  if (e.target.closest('#printSuppliesBtn')) return printSuppliesList();
  const btn = e.target.closest('[data-supply]');
  if (!btn) return;
  const id = Number(btn.closest('[data-supply-id]').dataset.supplyId);
  const action = btn.dataset.supply;
  if (action === 'delete' && !confirmTap(btn, 'Remove?')) return;
  const q = sb.from('supplies');
  const { error } = action === 'delete' ? await q.delete().eq('id', id) : await q.update({ status: action }).eq('id', id);
  if (error) return toast(errorText(error), { error: true });
  await loadSupplies();
  renderAll();
}

function printSuppliesList() {
  const items = S.supplies.filter(s => s.status !== 'done');
  if (!items.length) return toast('Nothing on the supplies list.');
  const rows = [];
  for (const st of ['needed', 'ordered']) {
    const group = items.filter(s => s.status === st);
    if (!group.length) continue;
    rows.push({ group: `${SUPPLY_STATUS[st]} (${group.length})` });
    for (const s of group) rows.push({ cells: [
      { html: `<strong>${esc(s.item)}</strong>` },
      { html: esc(s.qty || '—') },
      { html: esc(s.note || ''), cls: 'notes-cell' },
      { html: `${esc(nameOf(s.requested_by))}<br><small>${esc(fmtDate(s.requested_at))}</small>` },
      { html: '<span class="tick">☐</span>' },
    ] });
  }
  printDoc({
    title: 'Supplies needed', summary: plural(items.length, 'item'),
    how: 'Tick ☐ when bought — then tap “Got it” in the app.',
    columns: ['Item', 'Qty', 'Note', 'Asked by', 'Bought'], rows,
  });
}

// ---------------------------------------------------------------------
// Help: a short guide from the "?" button in the corner
// ---------------------------------------------------------------------
// Training videos (YouTube): channels checked on 2026-10-01, plus a ready-made
// YouTube search per service so the list never goes stale.
const TRAINING_CHANNELS = [
  ['Forensic Detailing', 'https://www.youtube.com/@ForensicDetailing', 'UK detailer — machine polishing, paint correction, valeting.'],
  ['Pan The Organizer', 'https://www.youtube.com/@PanTheOrganizer', 'Step by step for beginners: washing, interiors, polishing.'],
  ['AMMO NYC', 'https://www.youtube.com/@AMMO-NYC', 'Larry Kosilla — pro tips, deep cleans, polishing.'],
  ['Wilson Auto Detailing', 'https://www.youtube.com/@WilsonAutoDetailing', 'Full details start to finish, products explained.'],
];
const TRAINING_SEARCHES = [
  ['First Clean / Tar Remove', 'car exterior wash tar and iron fallout removal how to'],
  ['Full Valet', 'full car valet interior and exterior step by step'],
  ['Polish / Compound', 'how to machine polish a car beginner dual action compound'],
  ['Window Tint / Dechrome', 'how to dechrome car trim vinyl wrap tutorial'],
  ['Windscreen', 'how to clean car windscreen streak free inside'],
];
const ytSearch = q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
const trainingHTML = () => `
    <p>Free video lessons on YouTube — they open in the YouTube app.</p>
    <div class="training">${TRAINING_CHANNELS.map(([name, url, about]) =>
      `<a class="training-link" href="${url}" target="_blank" rel="noopener"><strong>▶ ${esc(name)}</strong><small>${esc(about)}</small></a>`).join('')}</div>
    <p style="margin-top:10px"><b>Videos for each job:</b></p>
    <div class="training">${TRAINING_SEARCHES.map(([job, q]) =>
      `<a class="training-link" href="${ytSearch(q)}" target="_blank" rel="noopener"><strong>🔎 ${esc(job)}</strong></a>`).join('')}</div>`;

function openTraining() {
  openSheet(`${sheetHead('🎓 Training videos')}<div class="help-body">${trainingHTML()}</div>
    <div class="sheet-actions"><button type="button" class="btn primary" data-close>Close</button></div>`);
}

const HELP = [
  { id: 'jobs', title: 'Marking a job', tabs: ['stock', 'in_prep', 'sold'], body: `
    <p>Each service on a car is a bubble:</p>
    <ul><li><b>○ Grey</b> — still to do.</li>
      <li><b>◐ Amber</b> — someone is working on it (shows their name).</li>
      <li><b>✓ Green</b> — done (shows who and when).</li>
      <li><b>+ Faded</b> — not asked for on this car. Tap it to add it and start.</li></ul>
    <p><b>Tap once when you start</b>, <b>tap again when you finish</b>. The job goes in <b>your name</b> — that’s what the pay report counts, so always use your own login.</p>
    <p>Tapped by mistake on a green one? Tap it twice to undo.</p>
    <p>🔒 A job someone else started or finished is theirs: only they (or a manager) can change it.</p>` },
  { id: 'tabs', title: 'What the tabs mean', tabs: ['stock', 'in_prep', 'sold', 'delivered'], body: `
    <ul><li><b>Sold</b> — sold cars waiting for delivery, by delivery day.</li>
      <li><b>Stock</b> — cars not sold, nobody working on them. Urgent cars and cars with nothing done yet are on top. A car that arrived <b>already sold</b> waits here (SOLD) until its first job starts.</li>
      <li><b>In prep</b> — someone is working on it right now. When the job is done it goes back to Stock (or to Sold).</li>
      <li><b>Bodyshop</b> — out for panel beating & paint.</li>
      <li><b>Dent</b> — the written dent list.</li>
      <li><b>Loan</b> — cars lent to customers.</li>
      <li><b>Delivered</b> — history.</li></ul>
    <p>Swipe left / right on the list to change tab.</p>` },
  { id: 'sold', title: 'Sold cars & the daily sheet', tabs: ['sold'], body: `
    <p>The Sold tab groups cars by delivery day: <b>Overdue</b>, <b>Today</b>, <b>Tomorrow</b>…</p>
    <p>Each morning tap <b>🖨 Print sold list</b> for the day’s job sheet. Work top to bottom and tick ☐ as you go — and tap the job in the app too.</p>
    <p>Cars going out <b>today</b> have a red outline, and the red number on the Sold tab says how many.</p>
    <p><b>Delivery prep</b> (the sold-cars person): tap <b>▶ Start prep</b> when you take the car — the boss gets a notification — and <b>✓ Ready to go</b> when it’s done. When the customer takes it, tap <b>Delivered</b>.</p>` },
  { id: 'dent', title: 'Dent list', tabs: ['dent'], body: `
    <p>Tap <b>Dent</b> on a car, write what needs fixing and pick the <b>dent day</b>. The car stays where it is — it’s just added to the list.</p>
    <p>On the day, open the <b>Dent</b> tab and tap <b>🖨 Print dent list</b>. When a car is fixed, tap <b>Done</b>.</p>` },
  { id: 'bodyshop', title: 'Bodyshop', tabs: ['bodyshop'], body: `
    <p>When a car goes out for panel beating & paint, tap <b>Bodyshop</b> on it, write what’s being done, which bodyshop and when it’s due back. It moves to the <b>Bodyshop</b> tab (red when overdue).</p>
    <p>When it comes back, tap <b>Back from bodyshop</b> — it returns to Stock or Sold.</p>` },
  { id: 'loan', title: 'Loan cars (managers)', tabs: ['loan'], admin: true, body: `
    <p>Tap <b>Loan</b> on a stock car, enter the customer’s name, phone and the day it comes back. It moves to the <b>Loan</b> tab (red when overdue).</p>
    <p>When it’s back, tap <b>Returned</b> — the people set for loan alerts get a notification to get it ready again.</p>` },
  { id: 'supplies', title: 'Asking for supplies', tabs: [], body: `
    <p>Tap the <b>box icon</b> at the top, write what you need and how many, and tap <b>Add to list</b>.</p>
    <p>The manager marks it <b>Ordered</b>, and <b>Got it</b> when it arrives. They can print the list with <b>🖨 Print supplies list</b>.</p>` },
  { id: 'admin', title: 'Adding & selling cars (managers)', tabs: ['stock'], admin: true, body: `
    <p><b>+ New stock</b> (Stock tab): plate, make, model, colour, <b>the services the car needs</b> (or <b>All</b>) and Urgent / On site / Due in. Already sold? Tick <b>Already sold</b>.</p>
    <p><b>Mark sold</b> on a stock car, or <b>+ Sold</b> on the Sold tab: pick the delivery date and time.</p>
    <p>The <b>chart icon</b> is the pay report: tap <b>Last week</b> to see who did what.</p>` },
  { id: 'phone', title: 'Phone tips', tabs: [], body: `
    <ul><li><b>iPhone:</b> Safari → Share → <b>Add to Home Screen</b>. Open it from the icon.</li>
      <li><b>Notifications:</b> tap your initial (top right) → <b>Enable notifications</b>.</li>
      <li><b>Password:</b> tap your initial → <b>Change password</b>.</li>
      <li><b>Training videos:</b> the ▶ button at the top.</li>
      <li>The app updates itself; the version is at the bottom of this help.</li></ul>` },
];

function openHelp() {
  const topics = HELP.filter(h => !h.admin || isAdmin());
  const first = S.view === 'supplies' ? 'supplies' : (topics.find(h => h.tabs.includes(S.tab))?.id ?? 'jobs');
  openSheet(`${sheetHead('How to use the app')}
    <div class="help">${topics.map(h => `<details ${h.id === first ? 'open' : ''}>
      <summary>${esc(h.title)}</summary><div class="help-body">${h.body}</div>
    </details>`).join('')}</div>
    <p class="muted" style="font-size:13px;margin:14px 0 0">Still stuck? Ask the manager. · App version ${esc(APP_VERSION)}</p>`);
}

// ---------------------------------------------------------------------
// Swipe between tabs
// ---------------------------------------------------------------------
// Phones: swipe left / right to go to the next / previous tab. The list
// follows the finger and the neighbouring tab slides in beside it; let go past
// a quarter of the screen (or flick) to switch, otherwise it springs back.
function wireSwipeTabs() {
  const track = $('#listTrack');
  let g = null;  // current gesture

  const tabsInOrder = () => $$('.tabs button').map(b => b.dataset.tab);
  const setX = (x, animate) => {
    track.style.transition = animate ? 'transform .22s ease-out' : 'none';
    track.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
  };
  const dropPeek = () => { $('#listPeek')?.remove(); };

  document.addEventListener('touchstart', e => {
    const t = e.touches[0];
    const busy = S.view !== 'main' || $('#appScreen').hidden || e.touches.length > 1
      || !$('#sheetBackdrop').hidden || e.target.closest('input, textarea, select, .tabs, .topbar');
    g = busy ? null : { x: t.clientX, y: t.clientY, at: Date.now(), dx: 0, locked: null, next: null };
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!g) return;
    const t = e.touches[0];
    const dx = t.clientX - g.x, dy = t.clientY - g.y;
    if (g.locked === null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      g.locked = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';  // decide once: sideways or scrolling
      if (g.locked === 'y') { g = null; return; }
    }
    const tabs = tabsInOrder();
    const next = tabs[tabs.indexOf(S.tab) + (dx < 0 ? 1 : -1)] ?? null;
    if (next !== g.next) {
      dropPeek();
      g.next = next;
      if (next) {
        const peek = document.createElement('div');
        peek.id = 'listPeek';
        peek.className = 'list peek';
        peek.style.left = dx < 0 ? '100%' : '-100%';
        peek.innerHTML = listHTML(next);
        track.append(peek);
      }
    }
    g.dx = next ? dx : dx * 0.25;  // resist at the first / last tab
    setX(g.dx, false);
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!g || g.locked !== 'x') { g = null; return; }
    const { dx, next, at } = g;
    g = null;
    const width = track.offsetWidth;
    const flick = Math.abs(dx) > 40 && Date.now() - at < 250;
    if (!next || (Math.abs(dx) < width * 0.25 && !flick)) {
      setX(0, true);  // spring back
      setTimeout(dropPeek, 230);
      return;
    }
    setX(dx < 0 ? -width : width, true);  // slide the rest of the way
    setTimeout(() => {
      dropPeek();
      setX(0, false);
      switchTab(next);
      $(`.tabs [data-tab="${next}"]`).scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }, 220);
  }, { passive: true });
  document.addEventListener('touchcancel', () => {
    if (g?.locked === 'x') { setX(0, true); setTimeout(dropPeek, 230); }
    g = null;
  }, { passive: true });
}

// ---------------------------------------------------------------------
// Auth & boot
// ---------------------------------------------------------------------
function switchTab(tab) {
  S.tab = tab;
  try { localStorage.setItem('m6.tab', tab); } catch {}
  renderAll();
}

let sessionRun = 0;

async function onSessionChange() {
  const run = ++sessionRun;  // a newer call supersedes this one
  if (S.channel) { sb.removeChannel(S.channel); S.channel = null; }
  if (!S.session) {
    S.me = null;
    showScreen('login');
    return;
  }
  showScreen('app');
  setView('main');
  $('#fab').hidden = true;
  // A fresh login token can briefly look "issued in the future" to the API
  // when the Supabase servers' clocks differ by a second or two — retry.
  for (let attempt = 1; ; attempt++) {
    try {
      await loadAll();
      if (run !== sessionRun) return;
      break;
    } catch (err) {
      if (/issued at future/i.test(err?.message) && attempt < 5) {
        $('#list').innerHTML = '<p class="empty">Loading…</p>';
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }
      $('#list').innerHTML = `<p class="empty">Couldn’t load data: ${esc(errorText(err))}</p>`;
      return;
    }
  }
  if (!S.me) {
    $('#list').innerHTML = '<p class="empty">Your account has no staff profile yet. Ask an admin to check the setup.</p>';
    return;
  }
  renderAll();
  subscribe();
  syncPush();
}

function wireUi() {
  $('#backBtn').innerHTML = ICON.back;
  $('#teamBtn').innerHTML = ICON.team;
  $('#reportBtn').innerHTML = ICON.report;

  try { S.tab = localStorage.getItem('m6.tab') || S.tab; } catch {}
  // A tapped notification opens the app on its tab (e.g. ?tab=stock)
  const linkTab = new URLSearchParams(location.search).get('tab');
  if (TAB_TITLE[linkTab]) S.tab = linkTab;
  if (!TAB_TITLE[S.tab]) S.tab = 'sold';
  navigator.serviceWorker?.addEventListener('message', e => {
    if (e.data?.type !== 'open') return;
    const tab = new URL(e.data.url).searchParams.get('tab');
    if (TAB_TITLE[tab]) { setView('main'); switchTab(tab); }
  });

  $('#pushBanner').addEventListener('click', async e => {
    if (e.target.closest('[data-dismiss]')) {
      store.set(PUSH_BANNER_KEY, 'dismissed');
      $('#pushBanner').hidden = true;
    } else if (e.target.closest('[data-enable]')) {
      // Status is read from the rendered banner so the permission prompt
      // runs straight from the tap (iPhone requires that).
      if ($('#pushBanner').dataset.status === 'off') turnOnPush();
      else openAccount();
    }
  });

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target.elements;
    const errEl = $('#loginError');
    errEl.hidden = true;
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    const login = clean(f.login.value);
    const remember = f.remember.checked;
    store.set(REMEMBER_KEY, remember ? '1' : '0');
    const { error } = await sb.auth.signInWithPassword({ email: loginEmail(login), password: f.password.value });
    btn.disabled = false;
    if (error) {
      errEl.textContent = error.message === 'Invalid login credentials' ? 'Wrong name or password.' : error.message;
      errEl.hidden = false;
      return;
    }
    store.set(LOGIN_KEY, remember ? login : null);
    f.password.value = '';
  });

  // Pre-fill the last remembered name so only the password is needed.
  const savedLogin = store.get(LOGIN_KEY);
  const loginFields = $('#loginForm').elements;
  loginFields.remember.checked = store.get(REMEMBER_KEY) !== '0';
  if (savedLogin) loginFields.login.value = savedLogin;

  wireSwipeTabs();
  $('.tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) { switchTab(b.dataset.tab); window.scrollTo(0, 0); }
  });
  $('#search').addEventListener('input', e => { S.search = e.target.value; renderList(); });
  $('#purgeBtn').addEventListener('click', purgeOld);
  $('#printBtn').addEventListener('click', printCurrentList);
  $('#photosFab').innerHTML = `${ICON.camera}<span>Photos</span>`;
  $('#photosFab').addEventListener('click', openPhotoPicker);
  $('#myCount').addEventListener('click', openMyMonth);
  $('#fab').addEventListener('click', () => (S.tab === 'stock' ? openVehicleForm() : openSoldPicker()));
  $('#list').addEventListener('click', onListClick);

  $('#teamBtn').addEventListener('click', () => setView('team'));
  $('#reportBtn').addEventListener('click', () => setView('report'));
  $('#trainingBtn').innerHTML = ICON.video;
  $('#trainingBtn').addEventListener('click', openTraining);
  $('#suppliesBtn').insertAdjacentHTML('afterbegin', ICON.box);
  $('#suppliesBtn').addEventListener('click', () => setView('supplies'));
  $('#suppliesView').addEventListener('submit', onSuppliesSubmit);
  $('#suppliesView').addEventListener('click', onSuppliesClick);
  $('#helpBtn').innerHTML = ICON.help;
  $('#helpBtn').addEventListener('click', openHelp);
  $('#backBtn').addEventListener('click', () => setView('main'));
  $('#meBtn').addEventListener('click', openAccount);
  $('#teamView').addEventListener('click', onTeamClick);

  $('#sheetBackdrop').addEventListener('click', e => {
    if (e.target.id === 'sheetBackdrop' || e.target.closest('[data-close]')) closeSheet();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheetBackdrop').hidden) closeSheet(); });
}

// Header clock: "14:05" over "Mon 28 Sept"
function tickClock() {
  const now = new Date();
  $('#clock strong').textContent = now.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
  $('#clock span').textContent = now.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------------
// Staying up to date without closing the app
// ---------------------------------------------------------------------
// 1) New app version: the published index.html names the current version
//    (app.js?v=N). Check when the app comes back to the screen and every few
//    minutes; reload by itself unless someone is in the middle of a form.
// 2) Colleagues' changes: phones drop the live connection while the screen is
//    off, so reload the data and reconnect when the app comes back.
const VERSION_CHECK_MS = 3 * 60 * 1000;
let hiddenAt = null;
let updateOffered = false;

async function latestVersion() {
  try {
    const res = await fetch(`./?check=${Date.now()}`, { cache: 'no-store' });
    const m = (await res.text()).match(/app\.js\?v=(\d+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

const busyEditing = () => !$('#sheetBackdrop').hidden
  || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

// Load the new version from a fresh address, so no cached page gets in the
// way — and never more than once per version (no reload loops).
function loadVersion(latest) {
  try {
    if (sessionStorage.getItem('m6.updatedTo') === latest) return false;
    sessionStorage.setItem('m6.updatedTo', latest);
  } catch {}
  const tab = new URLSearchParams(location.search).get('tab');
  location.replace(`./?u=${latest}${tab ? `&tab=${tab}` : ''}`);
  return true;
}

async function checkForUpdate() {
  const latest = await latestVersion();
  if (!latest || Number(latest) <= Number(APP_VERSION)) return;
  if (!busyEditing() && loadVersion(latest)) return;
  if (updateOffered) return;
  updateOffered = true;
  toast('A new version of the app is ready', {
    action: { label: 'Update', run: () => { try { sessionStorage.removeItem('m6.updatedTo'); } catch {} loadVersion(latest); } },
    ms: 60000,
  });
}

async function refreshData() {
  if (!S.session || !S.me) return;
  try {
    await loadAll();
    renderAll();
    subscribe();
  } catch { /* offline for a moment — the next return will try again */ }
}

function wireAutoUpdate() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    const away = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = null;
    checkForUpdate();
    if (away > 20 * 1000) refreshData();  // back after a while: fresh data + live updates
  });
  window.addEventListener('online', refreshData);
  setInterval(() => { if (!document.hidden) checkForUpdate(); }, VERSION_CHECK_MS);
}

function boot() {
  if (!sb) { showScreen('setup'); return; }
  tickClock();
  setInterval(tickClock, 15000);
  registerSw();
  wireUi();
  wireAutoUpdate();
  sb.auth.onAuthStateChange((event, session) => {
    const changed = (session?.user?.id ?? null) !== (S.session?.user?.id ?? null) || event === 'INITIAL_SESSION';
    S.session = session;
    // Don't await Supabase calls inside this callback (supabase-js recommendation).
    if (changed) setTimeout(onSessionChange, 0);
    if (event === 'PASSWORD_RECOVERY') setTimeout(openNewPassword, 0);
  });
}

boot();
