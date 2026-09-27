import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, LOGIN_DOMAIN } from './config.js';

// ---------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------
const BUCKET = 'vehicle-photos';
const PURGE_DAYS = 30;

const SERVICES = [
  { key: 'first',   label: 'First Clean', role: 'firstClean' },
  { key: 'full',    label: 'Full Valet',  role: 'fullValet', commission: true },
  { key: 'polish',  label: 'Polish',      role: 'polish' },
  { key: 'decrome', label: 'Decrome',     role: null },
];
const SERVICE = Object.fromEntries(SERVICES.map(s => [s.key, s]));
const ROLES = SERVICES.filter(s => s.role);
const DEFAULT_SERVICES = ['first', 'full'];
const NEXT_STATE = { pending: 'doing', doing: 'done', done: 'pending' };

const COLOURS = [
  ['White', '#ffffff'], ['Black', '#111111'], ['Grey', '#8a8f98'], ['Silver', '#c9ccd1'],
  ['Blue', '#2f5fd0'], ['Red', '#c9302c'], ['Green', '#2e8b57'], ['Beige', '#d8c8a8'],
  ['Brown', '#7a4e2d'], ['Orange', '#f08a24'], ['Yellow', '#f2c230'],
];
const COLOUR_HEX = Object.fromEntries(COLOURS.map(([n, h]) => [n.toLowerCase(), h]));

const TAB_TITLE = { stock: 'Stock', in_prep: 'In prep', delivered: 'Delivered' };

const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><circle cx="17" cy="9" r="2.8"/><path d="M16.5 14.6c2.6.2 4.4 2 5 4.9"/></svg>',
  report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.3l1.6-2.2h7.2L17.2 7h2.3A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/><circle cx="12" cy="13" r="3.8"/></svg>',
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
  team: Object.fromEntries(ROLES.map(r => [r.role, new Set()])),
  vehicles: new Map(),      // id → row
  photoUrls: new Map(),     // storage path → signed URL
  tab: 'in_prep',
  view: 'main',
  search: '',
  onlyMine: false,
  channel: null,
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

function canMark(key) {
  if (!S.me) return false;
  if (isAdmin() || key === 'decrome') return true;
  return S.team[SERVICE[key].role]?.has(S.me.id) ?? false;
}

function whoCanMark(key) {
  const role = SERVICE[key].role;
  if (!role) return 'Anyone';
  const names = [...S.team[role]].map(nameOf);
  return names.length ? `${names.join(', ')} (or an admin)` : 'Admins only (nobody assigned yet)';
}

// ---------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------
async function loadAll() {
  const [p, t, v] = await Promise.all([
    sb.from('profiles').select('id, display_name, is_admin'),
    sb.from('team_members').select('role, user_id'),
    sb.from('vehicles').select('*'),
  ]);
  const err = p.error || t.error || v.error;
  if (err) throw err;

  S.profiles = new Map(p.data.map(x => [x.id, x]));
  S.me = S.profiles.get(S.session.user.id) ?? null;
  setTeam(t.data);
  S.vehicles = new Map(v.data.map(x => [x.id, x]));
  await refreshPhotoUrls();
}

function setTeam(rows) {
  for (const r of ROLES) S.team[r.role] = new Set();
  for (const row of rows) S.team[row.role]?.add(row.user_id);
}

async function reloadTeam() {
  const { data, error } = await sb.from('team_members').select('role, user_id');
  if (!error) { setTeam(data); renderAll(); }
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
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, reloadTeam)
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
  $('#backBtn').hidden = view === 'main';
  $('#viewTitle').textContent = { main: 'Vehicle prep', team: 'Team', report: 'Pay report' }[view];
  window.scrollTo(0, 0);
  if (view === 'team') renderTeam();
  if (view === 'report') renderReport();
}

function renderAll() {
  document.body.classList.toggle('is-admin', isAdmin());
  $('#meBtn').textContent = initials(S.me?.display_name);
  renderTabs();
  renderList();
  if (S.view === 'team') renderTeam();
}

// ---------------------------------------------------------------------
// Main list
// ---------------------------------------------------------------------
function renderTabs() {
  const counts = { stock: 0, in_prep: 0, delivered: 0 };
  for (const v of S.vehicles.values()) counts[v.status]++;
  for (const b of $$('.tabs button')) {
    b.setAttribute('aria-selected', b.dataset.tab === S.tab);
    $('.count', b).textContent = counts[b.dataset.tab];
  }
  $('#onlyMineWrap').hidden = S.tab !== 'in_prep';
  $('#purgeBtn').hidden = S.tab !== 'delivered';
  const fab = $('#fab');
  fab.hidden = S.tab === 'delivered';
  fab.innerHTML = `${ICON.plus}<span>${S.tab === 'stock' ? 'New stock' : 'Sold'}</span>`;
}

function pendingForMe(v) {
  return v.services.some(k => v[`${k}_state`] !== 'done' && canMark(k));
}

function visibleVehicles() {
  const q = norm(S.search);
  let list = [...S.vehicles.values()].filter(v => v.status === S.tab);
  if (q) {
    list = list.filter(v => [v.reg_ie, v.reg_imp, v.make, v.model, v.seller, `${v.make}${v.model}`].some(f => norm(f).includes(q)));
  }
  if (S.tab === 'in_prep' && S.onlyMine) list = list.filter(pendingForMe);

  const t = x => new Date(x ?? 0).getTime();
  if (S.tab === 'stock') list.sort((a, b) => t(b.created_at) - t(a.created_at));
  if (S.tab === 'in_prep') list.sort((a, b) => (b.urgent - a.urgent) || (t(a.sold_at) - t(b.sold_at)));
  if (S.tab === 'delivered') list.sort((a, b) => t(b.delivered_at) - t(a.delivered_at));
  return list;
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

function serviceHTML(v, key) {
  const s = SERVICE[key];
  const state = v[`${key}_state`];
  const by = v[`${key}_by`];
  const allowed = canMark(key);
  let sub = 'Pending';
  if (state === 'doing') sub = `Doing · ${nameOf(by)}`;
  if (state === 'done') sub = `Done · ${nameOf(by)} · ${fmtDate(v[`${key}_done_at`], false)}`;
  const title = allowed ? `Tap to change (${state} → ${NEXT_STATE[state]})` : `Only ${whoCanMark(key)} can mark ${s.label}`;
  return `<button type="button" class="svc ${state}${allowed ? '' : ' locked'}" data-act="svc" data-key="${key}" title="${esc(title)}">
    <strong>${state === 'done' ? ICON.check : ''}${esc(s.label)}${s.commission ? '<span class="coin" title="Commission">€</span>' : ''}${allowed ? '' : ICON.lock}</strong>
    <small>${esc(sub)}</small>
  </button>`;
}

function detailRow(label, value) {
  return clean(value) ? `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>` : '';
}

function cardHTML(v) {
  const url = v.photo_path && S.photoUrls.get(v.photo_path);
  const sold = v.status !== 'stock';
  const chips = [];
  if (sold && v.urgent && v.status === 'in_prep') chips.push('<span class="chip urgent">URGENT</span>');
  if (sold) {
    const when = [v.delivery_day, v.delivery_time].map(clean).filter(Boolean).join(' · ');
    if (when && v.status === 'in_prep') chips.push(`<span class="chip">Delivery: ${esc(when)}</span>`);
    if (v.status === 'in_prep') chips.push(v.stock_status === 'due_in' ? '<span class="chip warn">Due in</span>' : '<span class="chip">On site</span>');
  }
  if (v.status !== 'delivered' && v.services.length) {
    chips.push(v.done_at ? '<span class="chip ok">All services done</span>' : '');
  }
  if (v.status === 'delivered') chips.push(`<span class="chip ok">Delivered ${esc(fmtDate(v.delivered_at))}</span>`);

  const details = sold ? [
    detailRow('Salesperson', v.seller),
    detailRow('VRT / NCT', v.vrt_nct),
    detailRow('Mechanical', v.mechanical_notes),
    detailRow('Estimate', v.estimate),
  ].join('') : '';

  let actions = '';
  if (v.status === 'stock') {
    actions = `<button class="btn small ghost" data-act="edit">Edit</button>
      <button class="btn small primary" data-act="sell">Mark sold</button>`;
  } else if (v.status === 'in_prep') {
    actions = `<button class="btn small ghost" data-act="edit">Edit</button>
      <button class="btn small accent" data-act="deliver">${ICON.check} Delivered</button>`;
  } else {
    actions = `<button class="btn small ghost" data-act="reopen">Reopen</button>`;
  }
  const remove = isAdmin() && v.status !== 'delivered' ? '<button class="btn small ghost danger" data-act="remove">Remove</button><span class="spacer"></span>' : '';

  return `<article class="card${sold && v.urgent && v.status === 'in_prep' ? ' urgent' : ''}" data-id="${v.id}">
    <div class="card-head">
      ${url ? `<img class="thumb" src="${esc(url)}" alt="" data-act="photo" loading="lazy">` : ''}
      <div class="card-title">
        ${plateHTML(v)}
        <div class="vehicle-name">${esc([v.make, v.model].map(clean).filter(Boolean).join(' ') || 'Unknown vehicle')} ${colourHTML(v.color)}</div>
      </div>
    </div>
    ${chips.filter(Boolean).length ? `<div class="chips">${chips.join('')}</div>` : ''}
    ${details ? `<dl class="details">${details}</dl>` : ''}
    ${clean(v.notes) ? `<div class="notes">${esc(v.notes)}</div>` : ''}
    ${v.services.length ? `<div class="services">${SERVICES.filter(s => v.services.includes(s.key)).map(s => serviceHTML(v, s.key)).join('')}</div>` : ''}
    <div class="card-actions">${remove}${actions}</div>
  </article>`;
}

function renderList() {
  const list = visibleVehicles();
  const el = $('#list');
  if (!list.length) {
    let msg = { stock: 'No vehicles in stock.', in_prep: 'Nothing in prep.', delivered: 'No deliveries yet.' }[S.tab];
    if (S.search) msg = 'No vehicles match your search.';
    else if (S.tab === 'in_prep' && S.onlyMine) msg = 'Nothing pending for you. 👍';
    el.innerHTML = `<p class="empty">${msg}</p>`;
    return;
  }
  el.innerHTML = list.map(cardHTML).join('');
}

async function onListClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('[data-id]')?.dataset.id;
  const v = S.vehicles.get(id);
  if (!v) return;
  const act = btn.dataset.act;

  if (act === 'svc') return cycleService(v, btn.dataset.key, btn);
  if (act === 'edit') return openVehicleForm({ vehicle: v });
  if (act === 'sell') return openVehicleForm({ vehicle: v, convert: true });
  if (act === 'photo') return openPhoto(v);

  if (act === 'deliver') {
    if (!v.done_at && !confirmTap(btn, 'Not finished — tap again')) return;
    return setStatus(v, 'delivered', { undo: true });
  }
  if (act === 'reopen') return setStatus(v, 'in_prep');
  if (act === 'remove') {
    if (!confirmTap(btn)) return;
    try {
      const { error } = await sb.from('vehicles').delete().eq('id', v.id);
      if (error) throw error;
      S.vehicles.delete(v.id);
      await removePhotos([v.photo_path]);
      renderAll();
      toast('Vehicle removed');
    } catch (err) { toast(errorText(err), { error: true }); }
  }
}

async function cycleService(v, key, btn) {
  if (!canMark(key)) {
    toast(`Only ${whoCanMark(key)} can mark ${SERVICE[key].label}.`);
    return;
  }
  const state = v[`${key}_state`];
  if (state === 'done' && !confirmTap(btn, 'Tap again to reset')) return;
  const next = NEXT_STATE[state];

  // Optimistic update; the server fills in the real who/when.
  const before = { ...v };
  S.vehicles.set(v.id, {
    ...v,
    [`${key}_state`]: next,
    [`${key}_by`]: next === 'pending' ? null : (v[`${key}_by`] ?? S.me.id),
    [`${key}_done_at`]: next === 'done' ? new Date().toISOString() : null,
  });
  renderAll();
  try {
    await updateVehicle(v.id, { [`${key}_state`]: next });
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
      toast('Moved back to In prep');
    }
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
        ${url ? `<img class="thumb" src="${esc(url)}" alt="">` : ''}
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
  const title = convert ? 'Mark as sold' : isNew ? (sold ? 'New sale' : 'New stock vehicle') : 'Edit vehicle';
  const services = isNew ? DEFAULT_SERVICES : v.services;
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
    <fieldset><legend>Services</legend><div class="pills">${SERVICES.map(svcPill).join('')}</div></fieldset>
    ${soldFields ? `
      <div class="section-label">Sale</div>
      <div class="pills">
        <label class="pill urgent"><input type="checkbox" name="urgent" ${v.urgent ? 'checked' : ''}><span>Urgent</span></label>
        <label class="pill"><input type="radio" name="stock_status" value="in_stock" ${v.stock_status !== 'due_in' ? 'checked' : ''}><span>On site</span></label>
        <label class="pill"><input type="radio" name="stock_status" value="due_in" ${v.stock_status === 'due_in' ? 'checked' : ''}><span>Due in</span></label>
      </div>
      <div class="grid2">
        <label>Delivery day<input name="delivery_day" value="${esc(v.delivery_day)}" placeholder="e.g. Friday"></label>
        <label>Delivery time<input name="delivery_time" value="${esc(v.delivery_time)}" placeholder="e.g. 5PM"></label>
      </div>
      <label>Salesperson<input name="seller" value="${esc(v.seller)}" list="sellerList" autocapitalize="words"></label>
      <datalist id="sellerList">${sellers.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
      <label>VRT / NCT<input name="vrt_nct" value="${esc(v.vrt_nct)}" placeholder="e.g. done, VRT pending, 12 Oct"></label>
      <label>Mechanical<textarea name="mechanical_notes" rows="2">${esc(v.mechanical_notes)}</textarea></label>
      <label>Estimate<input name="estimate" value="${esc(v.estimate)}"></label>` : ''}
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
    };
    if (!row.reg_ie && !row.reg_imp) return showError('Enter at least one registration (IRL or IMP).');
    if (soldFields) Object.assign(row, {
      urgent: f.urgent.checked,
      stock_status: form.querySelector('[name=stock_status]:checked')?.value ?? 'in_stock',
      delivery_day: clean(f.delivery_day.value),
      delivery_time: clean(f.delivery_time.value),
      seller: clean(f.seller.value),
      vrt_nct: clean(f.vrt_nct.value),
      mechanical_notes: clean(f.mechanical_notes.value),
      estimate: clean(f.estimate.value),
    });
    if (isNew) row.status = sold ? 'in_prep' : 'stock';
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
      if (saved.status !== S.tab) switchTab(saved.status);
      renderAll();
      toast(convert ? 'Marked as sold — now in prep' : isNew ? 'Vehicle added' : 'Saved');
    } catch (err) {
      if (uploaded) await removePhotos([uploaded]);
      showError(errorText(err));
      saveBtn.disabled = false;
      saveBtn.textContent = convert ? 'Mark as sold' : 'Save';
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
  <form class="form" id="pwChange" style="margin-top:18px">
    <div class="section-label">Change password</div>
    <label>New password<input name="pw" type="password" minlength="6" autocomplete="new-password" required></label>
    <label>Repeat new password<input name="pw2" type="password" minlength="6" autocomplete="new-password" required></label>
    <p class="hint" style="margin:0">At least 6 characters.</p>
    <div class="sheet-actions"><button type="submit" class="btn">Change password</button></div>
  </form>`);
  $('#signOut', sheet).onclick = async () => { closeSheet(); await sb.auth.signOut(); };
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
    <label>New password<input name="pw" type="password" minlength="8" autocomplete="new-password" required></label>
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
function renderTeam() {
  const staff = [...S.profiles.values()].sort((a, b) => a.display_name.localeCompare(b.display_name));
  const roleBlock = r => {
    const members = [...S.team[r.role]].map(id => S.profiles.get(id)).filter(Boolean);
    const others = staff.filter(p => !S.team[r.role].has(p.id));
    return `<div class="panel" data-role="${r.role}">
      <h2>${esc(r.label)}</h2>
      <div class="member-chips">${members.length
        ? members.map(p => `<span class="member">${esc(p.display_name)}<button type="button" data-remove="${p.id}" aria-label="Remove">×</button></span>`).join('')
        : '<span class="muted">Nobody yet — only admins can mark this service.</span>'}</div>
      ${others.length ? `<div class="add-row">
        <select aria-label="Add team member"><option value="">Add someone…</option>${others.map(p => `<option value="${p.id}">${esc(p.display_name)}</option>`).join('')}</select>
        <button type="button" class="btn" data-add>Add</button>
      </div>` : ''}
    </div>`;
  };

  $('#teamView').innerHTML = `
    ${ROLES.map(roleBlock).join('')}
    <div class="panel">
      <h2>Decrome <span class="badge grey">Open</span></h2>
      <p class="muted">Anyone on staff can mark Decrome.</p>
    </div>
    <div class="panel" id="staffPanel">
      <h2>Staff</h2>
      <p class="muted">Everyone with a login is listed here. You can edit their name and choose who is an admin.</p>
      ${staff.map(p => `<div class="staff-row" data-id="${p.id}">
        <input value="${esc(p.display_name)}" aria-label="Display name" data-name>
        <label class="switch" title="Admin"><input type="checkbox" data-admin ${p.is_admin ? 'checked' : ''} ${p.id === S.me.id ? 'disabled' : ''}><span class="track"></span> Admin</label>
      </div>`).join('')}
    </div>`;
}

async function onTeamClick(e) {
  const panel = e.target.closest('[data-role]');
  if (!panel) return;
  const role = panel.dataset.role;
  const rm = e.target.closest('[data-remove]');
  const add = e.target.closest('[data-add]');
  try {
    if (rm) {
      const { error } = await sb.from('team_members').delete().match({ role, user_id: rm.dataset.remove });
      if (error) throw error;
      S.team[role].delete(rm.dataset.remove);
    } else if (add) {
      const userId = $('select', panel).value;
      if (!userId) return;
      const { error } = await sb.from('team_members').insert({ role, user_id: userId });
      if (error) throw error;
      S.team[role].add(userId);
    } else return;
    renderAll();
  } catch (err) { toast(errorText(err), { error: true }); }
}

async function onStaffChange(e) {
  const row = e.target.closest('.staff-row');
  if (!row) return;
  const id = row.dataset.id;
  const p = S.profiles.get(id);
  const patch = e.target.matches('[data-admin]')
    ? { is_admin: e.target.checked }
    : { display_name: clean(e.target.value) };
  if (patch.display_name === '') { e.target.value = p.display_name; return; }
  const { error } = await sb.from('profiles').update(patch).eq('id', id);
  if (error) {
    toast(errorText(error), { error: true });
    renderTeam();
    return;
  }
  Object.assign(p, patch);
  renderAll();
  toast('Saved');
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
        <button type="button" class="btn primary" id="printBtn">Print / Save PDF</button>
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
  $('#printBtn').addEventListener('click', () => window.print());
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
}

function wireUi() {
  $('#backBtn').innerHTML = ICON.back;
  $('#teamBtn').innerHTML = ICON.team;
  $('#reportBtn').innerHTML = ICON.report;

  try { S.tab = localStorage.getItem('m6.tab') || S.tab; } catch {}
  if (!TAB_TITLE[S.tab]) S.tab = 'in_prep';

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

  $('.tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) { switchTab(b.dataset.tab); window.scrollTo(0, 0); }
  });
  $('#search').addEventListener('input', e => { S.search = e.target.value; renderList(); });
  $('#onlyMine').addEventListener('change', e => { S.onlyMine = e.target.checked; renderList(); });
  $('#purgeBtn').addEventListener('click', purgeOld);
  $('#fab').addEventListener('click', () => (S.tab === 'stock' ? openVehicleForm() : openSoldPicker()));
  $('#list').addEventListener('click', onListClick);

  $('#teamBtn').addEventListener('click', () => setView('team'));
  $('#reportBtn').addEventListener('click', () => setView('report'));
  $('#backBtn').addEventListener('click', () => setView('main'));
  $('#meBtn').addEventListener('click', openAccount);
  $('#teamView').addEventListener('click', onTeamClick);
  $('#teamView').addEventListener('change', onStaffChange);

  $('#sheetBackdrop').addEventListener('click', e => {
    if (e.target.id === 'sheetBackdrop' || e.target.closest('[data-close]')) closeSheet();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheetBackdrop').hidden) closeSheet(); });
}

function boot() {
  if (!sb) { showScreen('setup'); return; }
  wireUi();
  sb.auth.onAuthStateChange((event, session) => {
    const changed = (session?.user?.id ?? null) !== (S.session?.user?.id ?? null) || event === 'INITIAL_SESSION';
    S.session = session;
    // Don't await Supabase calls inside this callback (supabase-js recommendation).
    if (changed) setTimeout(onSessionChange, 0);
    if (event === 'PASSWORD_RECOVERY') setTimeout(openNewPassword, 0);
  });
}

boot();
