/**
 * Monitoring Prospek & Pengerjaan — backend Google Sheets
 * Versi API untuk aplikasi PWA. Pasang dari spreadsheet: Ekstensi > Apps Script, isi Code.gs,
 * lalu Deploy sebagai Web App (Execute as: Me, Who has access: Anyone).
 * Login: sheet "Pengguna" (Nama | PIN | Peran). Peran "admin" melihat semua data,
 * peran "pic" hanya melihat & mengubah klien miliknya sendiri.
 * Opsional (Project Settings > Script properties):
 *   SHEET_ID = ID spreadsheet lain, jika script tidak dibuat dari spreadsheet tujuan
 */

const SHEET_DATA = 'Prospek';
const SHEET_SET = 'Pengaturan';
const SHEET_USER = 'Pengguna';
const SHEET_INV = 'Brand Invoice';
const SESSION_DAYS = 30;
const PROC = ['Waiting DP', 'TTD Draft Akta', 'NPWP dan NIB', 'PKP', 'Waiting Lunas', 'Lunas', 'Rekening Bank', 'Serah Terima'];

// Urutan kolom sheet "Prospek" (kolom A, B, C, ... mengikuti urutan ini)
const FIELDS = [
  ['no', 'No'], ['created', 'Tanggal Masuk'], ['sumber', 'Sumber'], ['perusahaan', 'Perusahaan'],
  ['vo', 'VO Partner'], ['kota', 'Kab/Kota'], ['brand', 'Brand'], ['paket', 'Paket'], ['statuses', 'Status'],
  ['pic', 'PIC'], ['bulanNo', 'Bulan'], ['bulanTxt', 'Bulan (Teks)'], ['tahun', 'Tahun'],
  ['priceDeal', 'Price Deal'], ['dp', 'Nominal DP'], ['lunas', 'Nominal Pelunasan'], ['keterangan', 'Keterangan'], ['grup', 'Grup'],
  ['nama', 'Nama'], ['wa', 'WhatsApp'], ['layanan', 'Layanan'], ['tahap', 'Tahap Terakhir'], ['sisa', 'Sisa Tagihan'],
  ['diskon', 'Diskon'], ['ppn', 'PPN 11%'], ['pph', 'Potong PPh'], ['retur', 'Return'],
  ['tglDp', 'Tanggal DP'], ['tglLunas', 'Tanggal Pelunasan'], ['selesai', 'Tanggal Serah Terima'],
  ['nilai', 'Estimasi Nilai'], ['catatan', 'Catatan'], ['followup', 'Follow-up'],
  ['fuDone', 'Follow-up Selesai'], ['fuChoice', 'Pilihan Inbox FU'],
  ['invBrand', 'Brand Invoice'], ['invNo', 'No Invoice'], ['invDate', 'Tanggal Invoice'], ['invDue', 'Jatuh Tempo'],
  ['alamat', 'Alamat Klien'], ['email', 'Email Klien'], ['invItems', 'Rincian Invoice'], ['invNote', 'Catatan Invoice'],
  ['invRek', 'Rekening Invoice'], ['bulan', 'Bulan Rekap'], ['minggu', 'Minggu Ke'],
  ['updated', 'Diupdate'], ['updatedBy', 'Diupdate Oleh'], ['id', 'ID']
];
// nama kolom lama -> kunci (untuk memindahkan data dari urutan lama)
const FIELD_ALIAS = { 'Bulan': 'bulan' };
const ID_COL = FIELDS.findIndex(f => f[0] === 'id') + 1;
const NO_COL = FIELDS.findIndex(f => f[0] === 'no') + 1;
const MON_TXT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PIC_COL = FIELDS.findIndex(f => f[0] === 'pic') + 1;
const INVNO_COL = FIELDS.findIndex(f => f[0] === 'invNo') + 1;
const INVB_FIELDS = [
  ['brand', 'Brand'], ['legal', 'Nama Legal'], ['prefix', 'Prefix Nomor'], ['warna', 'Warna'], ['alamat', 'Alamat'],
  ['telp', 'Telepon'], ['email', 'Email'], ['web', 'Website'], ['bank', 'Bank'], ['norek', 'No Rekening'],
  ['an', 'Atas Nama'], ['rekening', 'Daftar Rekening (JSON)'], ['sign', 'Penanda Tangan'], ['signTitle', 'Jabatan'], ['footer', 'Catatan Kaki'], ['logo', 'Logo (data)']
];
const INVB_ALIAS = { 'Nama Perusahaan': 'legal', 'No. Rekening': 'norek', 'Warna (hex)': 'warna', 'Kode': 'prefix' };
const INVB_DEFAULT = [
  { brand: 'Vorent Office Indonesia', prefix: 'VOI', warna: '#14213D' },
  { brand: 'Izinin', prefix: 'IZN', warna: '#15803D' },
  { brand: 'Echoffice', prefix: 'ECO', warna: '#0369A1' }
];
const NUM = ['no', 'nilai', 'priceDeal', 'diskon', 'dp', 'retur', 'pph', 'lunas', 'sisa', 'bulanNo', 'tahun'];
const COMPUTED = ['tahap', 'sisa', 'bulanNo', 'bulanTxt', 'tahun'];

const DEFAULT_SETTINGS = {
  sumber: [
    { n: 'ads-lopo', b: 'Vorent' }, { n: 'vorepeat', b: 'Vorent' },
    { n: 'ads-gusti', b: 'izinin' }, { n: 'repeat', b: 'izinin' },
    { n: 'ads-echo', b: 'Echoffice' }, { n: 'corepeat', b: 'Echoffice' }
  ],
  brands: ['Vorent', 'izinin', 'Echoffice'],
  pics: ['Eko', 'Mayang', 'Deny', 'Yona', 'Razan'],
  vo: [],
  kota: []
};

/* ---------------- Web App (API JSON untuk aplikasi PWA) ---------------- */

// Buka URL /exec sekali di browser untuk membuat sheet Prospek, Pengaturan, dan Pengguna.
function doGet() {
  ensure_(ss_());
  return json_({ ok: true, data: 'API Monitoring Prospek aktif' });
}

function doPost(e) {
  let out;
  try {
    const q = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = { ok: true, data: route_(q) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return json_(out);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Tanda tata letak kolom saat ini. Kalau berbeda dengan yang tersimpan, sheet disusun ulang dulu
// sebelum aksi apa pun (termasuk simpan), supaya data tidak pernah ditulis ke kolom yang salah.
const LAYOUT_SIG = FIELDS.map(f => f[0]).join(',');
function ensureLayout_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('LAYOUT_SIG') === LAYOUT_SIG) return;
  ensure_(ss_());
  props.setProperty('LAYOUT_SIG', LAYOUT_SIG);
}

function route_(q) {
  if (q.action !== 'version' && q.action !== 'logout') ensureLayout_();
  switch (q.action) {
    case 'names': { const ss = ss_(); ensure_(ss); return readUsers_(ss).filter(u => u.pin).map(u => u.name); }
    case 'login': ensure_(ss_()); return login(q.name, q.pin);
    case 'logout': return logout(q.token);
    case 'version': return getVersion();
    case 'getAll': return getAll(q.token);
    case 'batch': return batch(q.token, q.ops);
    case 'saveSettings': return saveSettings(q.token, q.settings);
    case 'checkWa': return checkWa(q.token, q.wa, q.id, q.grup);
  }
  throw new Error('UNKNOWN');
}

/* ---------------- API ---------------- */

function getVersion() {
  return PropertiesService.getScriptProperties().getProperty('VER') || '0';
}

function login(name, pin) {
  const cache = CacheService.getScriptCache();
  const fk = 'F_' + norm_(name);
  const fails = Number(cache.get(fk) || 0);
  if (fails >= 5) throw new Error('LOCK');
  const ss = ss_();
  const u = readUsers_(ss).find(x => norm_(x.name) === norm_(name) && x.pin && x.pin === String(pin || '').trim());
  if (!u) { cache.put(fk, String(fails + 1), 900); throw new Error('BAD'); }
  cache.remove(fk);
  const token = Utilities.getUuid();
  const props = PropertiesService.getScriptProperties();
  cleanupSessions_(props);
  props.setProperty('T_' + token, JSON.stringify({ n: u.name, r: u.role, e: Date.now() + SESSION_DAYS * 864e5 }));
  return Object.assign({ token: token }, payload_(ss, u));
}

function logout(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty('T_' + token);
  return true;
}

function getAll(token) {
  const u = auth_(token);
  return payload_(ss_(), u);
}

// Menyimpan banyak perubahan sekaligus (antrean dari mode offline) dalam satu kunci
function batch(token, ops) {
  const u = auth_(token);
  if (!Array.isArray(ops)) throw new Error('Data tidak valid');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = ss_();
    const sh = ss.getSheetByName(SHEET_DATA);
    const tz = ss.getSpreadsheetTimeZone();
    const brands = readInvBrands_(ss);
    let waSet = null;
    const results = ops.map(op => {
      try {
        const id = String(op.id || '');
        if (!id) throw new Error('Data tidak valid');
        const hit = findRow_(sh, id);
        if (hit && u.role !== 'admin' && norm_(sh.getRange(hit, PIC_COL).getValue()) !== norm_(u.name)) throw new Error('FORBIDDEN');
        if (op.op === 'del') {
          if (hit) sh.deleteRow(hit);
          return { id: id, ok: true };
        }
        const o = op.rec || {};
        if (!o.nama || String(o.id) !== id) throw new Error('Data tidak valid');
        if (u.role !== 'admin') o.pic = u.name;
        o.updatedBy = u.name;
        const ex = hit ? sh.getRange(hit, 1, 1, FIELDS.length).getValues()[0] : null;
        if (!String(o.invNo || '').trim()) {
          const old = ex ? String(ex[INVNO_COL - 1] || '').trim() : '';
          // nomor invoice hanya diterbitkan jika status sudah Waiting DP atau tahap setelahnya
          const st = Array.isArray(o.statuses) ? o.statuses : String(o.statuses || '').split(',').map(x => x.trim());
          const stage = PROC.some(x => st.indexOf(x) >= 0);
          o.invNo = old || (o.invBrand && stage ? nextInvNo_(sh, o, brands, tz) : '');
        }
        // data baru berlabel "Prospek Baru" tapi nomor WA-nya sudah pernah tercatat -> jadi "Prospek Lama"
        let stOut = null;
        if (!hit && !(o.grup && o.grup !== o.id) && Array.isArray(o.statuses) && o.statuses.indexOf('Prospek Baru') >= 0 && waKey_(o.wa)) {
          if (!waSet) waSet = waSet_(sh);
          if (waSet[waKey_(o.wa)]) { o.statuses = o.statuses.map(x => x === 'Prospek Baru' ? 'Prospek Lama' : x); stOut = o.statuses; }
        }
        if (!hit) o.no = nextNo_(sh);
        const row = toRow_(o, ex);
        const r = hit || Math.max(sh.getLastRow() + 1, 2);
        if (r > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 500);
        sh.getRange(r, 1, 1, row.length).setValues([row]);
        if (waSet && waKey_(o.wa)) waSet[waKey_(o.wa)] = 1;
        return stOut ? { id: id, ok: true, invNo: o.invNo || '', statuses: stOut } : { id: id, ok: true, invNo: o.invNo || '' };
      } catch (err) {
        return { id: op && op.id, ok: false, error: String((err && err.message) || err) };
      }
    });
    const v = results.some(r => r.ok) ? bump_() : { prev: getVersion(), ver: getVersion() };
    return { results: results, prev: v.prev, ver: v.ver };
  } finally {
    lock.releaseLock();
  }
}

function saveRecord(token, o) {
  const u = auth_(token);
  if (!o || !o.id || !o.nama) throw new Error('Data tidak lengkap');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = ss_().getSheetByName(SHEET_DATA);
    const hit = findRow_(sh, o.id);
    if (u.role !== 'admin') {
      if (hit && norm_(sh.getRange(hit, PIC_COL).getValue()) !== norm_(u.name)) throw new Error('FORBIDDEN');
      o.pic = u.name;
    }
    o.updatedBy = u.name;
    const row = toRow_(o, hit ? sh.getRange(hit, 1, 1, FIELDS.length).getValues()[0] : null);
    const r = hit || Math.max(sh.getLastRow() + 1, 2);
    if (r > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 500);
    sh.getRange(r, 1, 1, row.length).setValues([row]);
    return bump_();
  } finally {
    lock.releaseLock();
  }
}

function deleteRecord(token, id) {
  const u = auth_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = ss_().getSheetByName(SHEET_DATA);
    const r = findRow_(sh, id);
    if (r && u.role !== 'admin' && norm_(sh.getRange(r, PIC_COL).getValue()) !== norm_(u.name)) throw new Error('FORBIDDEN');
    if (r) sh.deleteRow(r);
    return bump_();
  } finally {
    lock.releaseLock();
  }
}

// Cek nomor WA dobel di SEMUA data (termasuk milik PIC lain).
// Yang dikirim balik hanya nama PIC, tanggal, layanan & status, bukan data klien.
function checkWa(token, wa, id, grup) {
  const u = auth_(token);
  const key = waKey_(wa);
  if (!key) return [];
  return readAll_(ss_())
    .filter(o => waKey_(o.wa) === key && o.id !== String(id || '') && !(grup && o.grup === grup))
    .sort((a, b) => String(b.created).localeCompare(String(a.created)))
    .slice(0, 5)
    .map(o => ({ pic: o.pic, created: o.created, layanan: o.layanan, statuses: o.statuses, mine: norm_(o.pic) === norm_(u.name) }));
}

function saveSettings(token, s) {
  const u = auth_(token);
  if (u.role !== 'admin') throw new Error('FORBIDDEN');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = ss_();
    writeSettings_(ss.getSheetByName(SHEET_SET), s);
    if (Array.isArray(s.invBrands)) {
      writeInvBrands_(ss.getSheetByName(SHEET_INV) || ss.insertSheet(SHEET_INV), s.invBrands);
    }
    return bump_();
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- Internal ---------------- */

function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function norm_(s) {
  return String(s == null ? '' : s).trim().toLowerCase();
}

function auth_(token) {
  if (!token) throw new Error('AUTH');
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('T_' + token);
  if (!raw) throw new Error('AUTH');
  const t = JSON.parse(raw);
  if (t.e < Date.now()) { props.deleteProperty('T_' + token); throw new Error('AUTH'); }
  // pastikan user masih terdaftar & perannya terbaru (bisa dicabut dari sheet Pengguna)
  const u = readUsers_(ss_()).find(x => norm_(x.name) === norm_(t.n) && x.pin);
  if (!u) { props.deleteProperty('T_' + token); throw new Error('AUTH'); }
  return u;
}

function cleanupSessions_(props) {
  const all = props.getProperties(), now = Date.now();
  Object.keys(all).forEach(k => {
    if (k.indexOf('T_') !== 0) return;
    try { if (JSON.parse(all[k]).e < now) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

function payload_(ss, u) {
  let items = readAll_(ss);
  if (u.role !== 'admin') items = items.filter(o => norm_(o.pic) === norm_(u.name));
  return {
    user: { name: u.name, role: u.role, sheetUrl: u.role === 'admin' ? ss.getUrl() : '' },
    items: items,
    settings: readSettings_(ss),
    ver: getVersion()
  };
}

function readInvBrands_(ss) {
  const sh = ss.getSheetByName(SHEET_INV);
  if (!sh || sh.getLastRow() < 2) return [];
  const nc = sh.getLastColumn();
  const vals = sh.getRange(1, 1, sh.getLastRow(), nc).getValues();
  const keys = vals[0].map(h => {
    h = String(h).trim();
    const f = INVB_FIELDS.find(x => x[1] === h);
    return f ? f[0] : (INVB_ALIAS[h] || '');
  });
  return vals.slice(1).filter(r => String(r[0]).trim()).map(r => {
    const o = {};
    keys.forEach((k, i) => { if (k) o[k] = String(r[i] == null ? '' : r[i]).trim(); });
    return o;
  });
}

function writeInvBrands_(sh, list) {
  const rows = [INVB_FIELDS.map(f => f[1])].concat((list || []).map(b => INVB_FIELDS.map(f => {
    let v = b[f[0]] == null ? '' : String(b[f[0]]);
    if (f[0] === 'logo' && v.length > 49000) v = '';
    if (f[0] !== 'logo' && /^[=+\-@]/.test(v)) v = "'" + v;
    return v;
  })));
  sh.clearContents();
  if (sh.getMaxColumns() < INVB_FIELDS.length) sh.insertColumnsAfter(sh.getMaxColumns(), INVB_FIELDS.length - sh.getMaxColumns());
  sh.getRange(1, 1, rows.length, INVB_FIELDS.length).setNumberFormat('@').setValues(rows);
  sh.getRange(1, 1, 1, INVB_FIELDS.length).setFontWeight('bold');
  sh.setFrozenRows(1);
}

// Nomor invoice: PREFIX/YYYY/MM/001, berurutan per brand per bulan (dibuat di server supaya tidak dobel)
function nextInvNo_(sh, o, brands, tz) {
  const prof = brands.find(b => b.brand === o.invBrand) || INVB_DEFAULT.find(b => b.brand === o.invBrand) || {};
  const prefix = String(prof.prefix || 'INV').trim();
  const d = String(o.invDate || o.created || '') || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const base = prefix + '/' + d.slice(0, 4) + '/' + d.slice(5, 7) + '/';
  let max = 0;
  const last = sh.getLastRow();
  if (last >= 2) {
    sh.getRange(2, INVNO_COL, last - 1, 1).getValues().forEach(r => {
      const v = String(r[0] || '');
      if (v.indexOf(base) === 0) { const n = parseInt(v.slice(base.length), 10); if (n > max) max = n; }
    });
  }
  const n = String(max + 1);
  return base + (n.length < 3 ? ('00' + n).slice(-3) : n);
}

function readUsers_(ss) {
  const sh = ss.getSheetByName(SHEET_USER);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues()
    .filter(r => String(r[0]).trim())
    .map(r => ({
      name: String(r[0]).trim(),
      pin: String(r[1]).trim(),
      role: norm_(r[2]) === 'admin' ? 'admin' : 'pic'
    }));
}

function bump_() {
  const p = PropertiesService.getScriptProperties();
  const prev = p.getProperty('VER') || '0';
  const ver = String(Date.now());
  p.setProperty('VER', ver);
  return { prev: prev, ver: ver };
}

function ensure_(ss) {
  let sh = ss.getSheetByName(SHEET_DATA);
  if (!sh) {
    sh = ss.insertSheet(SHEET_DATA);
    if (sh.getMaxColumns() < FIELDS.length) sh.insertColumnsAfter(sh.getMaxColumns(), FIELDS.length - sh.getMaxColumns());
    fmtSheet_(sh);
  }
  // kalau urutan / nama kolom berbeda dari FIELDS, susun ulang (data tetap aman + cadangan dibuat)
  const lc = Math.max(sh.getLastColumn(), 1);
  const head = sh.getRange(1, 1, 1, lc).getValues()[0].map(h => String(h == null ? '' : h).trim());
  if (FIELDS.some((f, i) => head[i] !== f[1])) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const h2 = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(h => String(h == null ? '' : h).trim());
      if (FIELDS.some((f, i) => h2[i] !== f[1])) migrate_(ss, sh);
    } finally {
      lock.releaseLock();
    }
  }
  if (!ss.getSheetByName(SHEET_INV)) writeInvBrands_(ss.insertSheet(SHEET_INV), INVB_DEFAULT);
  let us = ss.getSheetByName(SHEET_USER);
  if (!us) {
    us = ss.insertSheet(SHEET_USER);
    const used = {};
    const pin = () => { let p; do { p = String(Math.floor(100000 + Math.random() * 900000)); } while (used[p]); used[p] = 1; return p; };
    const rows = [['Nama', 'PIN', 'Peran (admin / pic)']]
      .concat([['Razan', pin(), 'admin']])
      .concat(['Eko', 'Mayang', 'Deny', 'Yona'].map(n => [n, pin(), 'pic']));
    us.getRange(1, 1, rows.length, 3).setNumberFormat('@').setValues(rows);
    us.getRange(1, 1, 1, 3).setFontWeight('bold');
    us.setFrozenRows(1);
    us.getRange(2, 2, 200, 1).setNumberFormat('@');
  }
  let st = ss.getSheetByName(SHEET_SET);
  if (!st) {
    st = ss.insertSheet(SHEET_SET);
    writeSettings_(st, DEFAULT_SETTINGS);
  }
}

function waKey_(s) {
  let n = String(s == null ? '' : s).replace(/\D/g, '');
  if (n.indexOf('62') === 0) n = '0' + n.slice(2); else if (n.indexOf('8') === 0) n = '0' + n;
  return n.length >= 8 ? n : '';
}

function waSet_(sh) {
  const set = {}, last = sh.getLastRow(), col = FIELDS.findIndex(f => f[0] === 'wa') + 1;
  if (last >= 2) sh.getRange(2, col, last - 1, 1).getValues().forEach(r => { const k = waKey_(r[0]); if (k) set[k] = 1; });
  return set;
}

function monthOf_(d) {
  const m = Number(String(d || '').slice(5, 7));
  return m >= 1 && m <= 12 ? m : 0;
}

function nextNo_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return 1;
  let max = 0;
  sh.getRange(2, NO_COL, last - 1, 1).getValues().forEach(r => { const n = Number(r[0]) || 0; if (n > max) max = n; });
  return max + 1;
}

function fmtSheet_(sh) {
  const n = sh.getMaxRows() - 1;
  sh.getRange(1, 1, 1, FIELDS.length).setValues([FIELDS.map(f => f[1])])
    .setFontWeight('bold').setBackground('#14213D').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.setFrozenColumns(4);
  FIELDS.forEach((f, i) => sh.getRange(2, i + 1, n, 1).setNumberFormat(NUM.indexOf(f[0]) >= 0 ? '#,##0' : '@'));
  sh.getRange(2, NO_COL, n, 1).setNumberFormat('0');
  ['bulanNo', 'tahun'].forEach(k => sh.getRange(2, FIELDS.findIndex(f => f[0] === k) + 1, n, 1).setNumberFormat('0'));
  sh.showColumns(1, sh.getMaxColumns());
  sh.hideColumns(ID_COL);
}

// Menyusun ulang kolom sheet "Prospek" sesuai FIELDS tanpa menghapus data.
// Sebelum diubah, salinan sheet disimpan sebagai cadangan.
function migrate_(ss, sh) {
  const lastCol = Math.max(sh.getLastColumn(), 1), last = sh.getLastRow();
  const vals = sh.getRange(1, 1, Math.max(last, 1), lastCol).getValues();
  const head = vals[0].map(h => String(h == null ? '' : h).trim());
  if (last >= 2) {
    const tz = ss.getSpreadsheetTimeZone();
    sh.copyTo(ss).setName('Cadangan Prospek ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HHmm'));
  }
  const byLabel = {};
  FIELDS.forEach(f => byLabel[f[1]] = f[0]);
  // header lama yang namanya sama dengan header baru tapi artinya beda
  const oldIsLegacy = head.indexOf('Bulan (Teks)') < 0;
  const keyOf = h => (oldIsLegacy && FIELD_ALIAS[h]) || byLabel[h] || '';
  const extra = head.map((h, i) => ({ h, i })).filter(x => x.h && !keyOf(x.h));
  const tz = ss.getSpreadsheetTimeZone();
  const isId = v => /^p[a-z0-9]{8,}$/.test(String(v || ''));
  const oldIdIdx = head.indexOf('ID');
  const rows = vals.slice(1).filter(r => r.some(v => v !== '' && v != null)).map((r, n) => {
    const o = {};
    // baris yang sudah terlanjur ditulis dengan urutan baru (ID ada di posisi kolom ID baru) dibaca apa adanya
    const already = oldIdIdx !== ID_COL - 1 && isId(r[ID_COL - 1]) && !isId(r[oldIdIdx]);
    if (already) FIELDS.forEach((f, i) => { o[f[0]] = r[i]; });
    else head.forEach((h, i) => { const k = keyOf(h); if (k && o[k] === undefined) o[k] = r[i]; });
    Object.keys(o).forEach(k => { if (o[k] instanceof Date) o[k] = Utilities.formatDate(o[k], tz, k === 'updated' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd'); });
    if (!o.no) o.no = n + 1;
    const m = monthOf_(o.created);
    o.bulanNo = m || ''; o.bulanTxt = m ? MON_TXT[m - 1] : ''; o.tahun = Number(String(o.created || '').slice(0, 4)) || '';
    return FIELDS.map(f => (o[f[0]] == null ? '' : o[f[0]])).concat(extra.map(x => r[x.i]));
  });
  const width = FIELDS.length + extra.length;
  if (sh.getMaxColumns() < width) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
  if (rows.length + 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 1 - sh.getMaxRows());
  sh.clearContents();
  fmtSheet_(sh);
  if (extra.length) sh.getRange(1, FIELDS.length + 1, 1, extra.length).setValues([extra.map(x => x.h)]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, width).setValues(rows);
}

function findRow_(sh, id) {
  if (sh.getLastRow() < 2) return 0;
  const f = sh.getRange(2, ID_COL, sh.getLastRow() - 1, 1)
    .createTextFinder(String(id)).matchEntireCell(true).findNext();
  return f ? f.getRow() : 0;
}

function readAll_(ss) {
  const sh = ss.getSheetByName(SHEET_DATA);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const tz = ss.getSpreadsheetTimeZone();
  const vals = sh.getRange(2, 1, last - 1, FIELDS.length).getValues();
  const out = [];
  vals.forEach(r => {
    if (!r[ID_COL - 1]) return;
    const o = {};
    FIELDS.forEach((f, i) => {
      const k = f[0];
      if (COMPUTED.indexOf(k) >= 0) return;
      let v = r[i];
      if (v instanceof Date) v = Utilities.formatDate(v, tz, k === 'updated' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
      if (k === 'statuses') v = String(v || '').split(',').map(x => x.trim()).filter(Boolean);
      else if (NUM.indexOf(k) >= 0) v = Number(v) || 0;
      else v = (v === '' || v == null) ? '' : String(v);
      o[k] = v;
    });
    out.push(o);
  });
  return out;
}

function toRow_(o, ex) {
  // kolom yang tidak dikirim (misal dari aplikasi versi lama) tetap memakai isi yang sudah ada
  if (ex) {
    const base = {};
    FIELDS.forEach((f, i) => { base[f[0]] = ex[i] instanceof Date ? Utilities.formatDate(ex[i], Session.getScriptTimeZone(), 'yyyy-MM-dd') : ex[i]; });
    base.statuses = String(base.statuses || '').split(',').map(x => x.trim()).filter(Boolean);
    o = Object.assign(base, o);
  }
  if (Array.isArray(o.invItems)) o = Object.assign({}, o, { invItems: JSON.stringify(o.invItems) });
  const st = Array.isArray(o.statuses) ? o.statuses : [];
  let c = -1;
  PROC.forEach((s, i) => { if (st.indexOf(s) >= 0) c = i; });
  const pd = Number(o.priceDeal) || 0;
  // PPN 11% hanya untuk Sewa Virtual Office bila dipilih "Ya"
  const ppn = (o.layanan === 'Sewa Virtual Office' && o.ppn === 'Ya') ? Math.round(Math.max(0, pd - (+o.diskon || 0)) * 0.11) : 0;
  const sisa = pd ? pd - (+o.diskon || 0) + ppn - (+o.dp || 0) - (+o.lunas || 0) - (+o.pph || 0) : '';
  const x = Object.assign({}, o, {
    statuses: st.join(', '),
    tahap: c >= 0 ? PROC[c] : '',
    sisa: sisa,
    bulanNo: monthOf_(o.created) || '',
    bulanTxt: monthOf_(o.created) ? MON_TXT[monthOf_(o.created) - 1] : '',
    tahun: Number(String(o.created || '').slice(0, 4)) || '',
    updated: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
  });
  return FIELDS.map(f => {
    const k = f[0], v = x[k];
    if (NUM.indexOf(k) >= 0) return v === '' || v == null ? '' : (Number(v) || 0);
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s) && k !== 'wa' && k !== 'invItems') s = "'" + s; // cegah teks terbaca sebagai rumus
    return s;
  });
}

function readSettings_(ss) {
  const sh = ss.getSheetByName(SHEET_SET);
  const last = sh.getLastRow();
  const s = { sumber: [], brands: [], pics: [], vo: [], kota: [], promoText: '', waTpl: {}, invBrands: readInvBrands_(ss) };
  if (last < 2) return s;
  const v = sh.getRange(2, 1, last - 1, 9).getValues();
  v.forEach(r => {
    if (r[0]) s.sumber.push({ n: String(r[0]).trim(), b: String(r[1]).trim() });
    if (r[3]) s.brands.push(String(r[3]).trim());
    if (r[4]) s.pics.push(String(r[4]).trim());
    if (r[5]) s.vo.push(String(r[5]).trim());
    if (r[6]) s.kota.push(String(r[6]).trim());
    if (r[7] && !s.promoText) s.promoText = String(r[7]).trim();
    if (r[8] && !Object.keys(s.waTpl).length) { try { s.waTpl = JSON.parse(String(r[8])) || {}; } catch (e) {} }
  });
  return s;
}

function writeSettings_(sh, s) {
  const cols = [
    (s.sumber || []).map(x => x.n), (s.sumber || []).map(x => x.b), [],
    s.brands || [], s.pics || [], s.vo || [], s.kota || [], s.promoText ? [String(s.promoText)] : [],
    s.waTpl && Object.keys(s.waTpl).length ? [JSON.stringify(s.waTpl)] : []
  ];
  const n = Math.max(1, ...cols.map(c => c.length));
  const rows = [['Sumber', 'Brand (untuk sumber)', '', 'Daftar Brand', 'PIC', 'VO Partner', 'Kab/Kota', 'Teks Saran Promosi 1', 'Template WA (JSON)']];
  for (let i = 0; i < n; i++) rows.push(cols.map(c => c[i] == null ? '' : c[i]));
  sh.clearContents();
  if (sh.getMaxColumns() < 9) sh.insertColumnsAfter(sh.getMaxColumns(), 9 - sh.getMaxColumns());
  sh.getRange(1, 1, rows.length, 9).setValues(rows);
  sh.getRange(1, 1, 1, 9).setFontWeight('bold');
  sh.setFrozenRows(1);
}
