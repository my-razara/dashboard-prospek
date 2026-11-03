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
const SHEET_BUDGET = 'Budget Iklan';
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
  ['tglDp', 'Tanggal DP'], ['tglLunas', 'Tanggal Pelunasan'], ['bankDp', 'Bank DP'], ['bankLunas', 'Bank Pelunasan'], ['selesai', 'Tanggal Serah Terima'],
  ['nilai', 'Estimasi Nilai'], ['catatan', 'Catatan'],
  ['kualitas', 'Kualitas Lead'], ['alasanQ', 'Alasan Kualitas'], ['srcChat', 'Source Chat'], ['followup', 'Follow-up'],
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
  if (props.getProperty('LAYOUT_SIG') !== LAYOUT_SIG) {
    ensure_(ss_());
    props.setProperty('LAYOUT_SIG', LAYOUT_SIG);
  }
  if (!props.getProperty('LUNAS_FIX_1')) { fixLunas_(); props.setProperty('LUNAS_FIX_1', new Date().toISOString()); }
}

// sekali saja: data lama berstatus Lunas tapi masih ada sisa tagihan -> dicatat lunas
// (tanggal pelunasan = tanggal pelunasan yang sudah ada, kalau kosong tanggal terakhir diupdate)
function fixLunas_() {
  const ss = ss_(), sh = ss.getSheetByName(SHEET_DATA), last = sh.getLastRow();
  if (last < 2) return 0;
  const tz = ss.getSpreadsheetTimeZone(), si = FIELDS.findIndex(f => f[0] === 'statuses');
  const vals = sh.getRange(2, 1, last - 1, FIELDS.length).getValues();
  let n = 0;
  vals.forEach((r, i) => {
    if (!r[ID_COL - 1] || String(r[si]).split(',').map(x => x.trim()).indexOf('Lunas') < 0) return;
    const o = {};
    FIELDS.forEach((f, j) => { let v = r[j]; if (v instanceof Date) v = Utilities.formatDate(v, tz, f[0] === 'updated' ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd'); o[f[0]] = v; });
    o.statuses = String(o.statuses || '').split(',').map(x => x.trim()).filter(Boolean);
    const mo = money_(o);
    if (!mo.gross || mo.sisa <= 0) return;
    if (!o.tglLunas) o.tglLunas = String(o.updated || '').slice(0, 10) || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    const keepUpd = o.updated;
    const row = toRow_(o, r);
    row[FIELDS.findIndex(f => f[0] === 'updated')] = keepUpd;
    sh.getRange(i + 2, 1, 1, row.length).setValues([row]);
    n++;
  });
  if (n) bump_();
  return n;
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
    case 'adsStats': return adsStats(q.token);
    case 'adsSync': return adsSync(q.token);
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
    const adsDates = {};
    const vendMonths = {};
    const adsMark = (sumber, created) => {
      const sb = String(sumber || '').trim(), d = adsIso_(created, tz);
      if (ADS.map[sb] && d) adsDates[d] = 1;
      if (d && VENDORS.some(v => v.sumber === sb)) vendMonths[sb + '|' + d.slice(0, 7)] = 1;
    };
    const CR_I = FIELDS.findIndex(f => f[0] === 'created'), SB_I = FIELDS.findIndex(f => f[0] === 'sumber');
    const results = ops.map(op => {
      try {
        const id = String(op.id || '');
        if (!id) throw new Error('Data tidak valid');
        const hit = findRow_(sh, id);
        if (hit && u.role !== 'admin' && norm_(sh.getRange(hit, PIC_COL).getValue()) !== norm_(u.name)) throw new Error('FORBIDDEN');
        if (op.op === 'del') {
          if (hit) { const old = sh.getRange(hit, 1, 1, FIELDS.length).getValues()[0]; adsMark(old[SB_I], old[CR_I]); sh.deleteRow(hit); }
          return { id: id, ok: true };
        }
        const o = op.rec || {};
        if (!o.nama || String(o.id) !== id) throw new Error('Data tidak valid');
        if (u.role !== 'admin') o.pic = u.name;
        o.updatedBy = u.name;
        const ex = hit ? sh.getRange(hit, 1, 1, FIELDS.length).getValues()[0] : null;
        if (ex) adsMark(ex[SB_I], ex[CR_I]);
        adsMark(o.sumber, o.created);
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
    // isi otomatis jumlah chat iklan ke spreadsheet Google Ads (gagal di sini tidak membatalkan simpan data)
    if (Object.keys(adsDates).length) { try { adsWrite_(Object.keys(adsDates)); } catch (e) { adsErr_(e); } }
    // laporan kualitas leads ke spreadsheet vendor (Vorent / Izinin)
    if (Object.keys(vendMonths).length) vendorSync_(Object.keys(vendMonths));
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
    .map(o => ({ pic: o.pic, created: o.created, layanan: o.layanan, sumber: o.sumber, statuses: o.statuses, paid: (Number(o.dp) || 0) > 0 || (Number(o.lunas) || 0) > 0, mine: norm_(o.pic) === norm_(u.name) }));
}

function saveSettings(token, s) {
  const u = auth_(token);
  if (u.role !== 'admin') throw new Error('FORBIDDEN');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = ss_();
    // versi aplikasi lama tidak mengirim alasanQ -> pertahankan yang lama
    if (s.alasanQ === undefined) s.alasanQ = readSettings_(ss).alasanQ;
    writeSettings_(ss.getSheetByName(SHEET_SET), s);
    if (Array.isArray(s.budget)) writeBudget_(ss, s.budget);
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
    budget: u.role === 'admin' ? readBudget_(ss) : [],
    ver: getVersion()
  };
}

// Budget iklan per bulan per brand (diisi admin di Pengaturan)
function readBudget_(ss) {
  const sh = ss.getSheetByName(SHEET_BUDGET);
  if (!sh || sh.getLastRow() < 2) return [];
  const tz = ss.getSpreadsheetTimeZone();
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues()
    .map(r => ({ m: r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM') : String(r[0] || '').trim().replace(/^'/, '').slice(0, 7), v: Number(r[1]) || 0, i: Number(r[2]) || 0, e: Number(r[3]) || 0 }))
    .filter(x => /^\d{4}-\d{2}$/.test(x.m));
}

function writeBudget_(ss, list) {
  const sh = ss.getSheetByName(SHEET_BUDGET) || ss.insertSheet(SHEET_BUDGET);
  const rows = [['Bulan', 'Vorent', 'Izinin', 'Echoffice']].concat(list
    .filter(x => x && /^\d{4}-\d{2}$/.test(String(x.m || '')))
    .sort((a, b) => String(a.m).localeCompare(String(b.m)))
    .map(x => ["'" + x.m, Number(x.v) || 0, Number(x.i) || 0, Number(x.e) || 0]));
  sh.clearContents();
  sh.getRange(1, 1, rows.length, 4).setValues(rows);
  sh.getRange(1, 1, 1, 4).setFontWeight('bold');
  sh.getRange(2, 2, Math.max(1, rows.length - 1), 3).setNumberFormat('#,##0');
  sh.setFrozenRows(1);
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
    let nm = 'Cadangan Prospek ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HHmmss'), k = 2;
    while (ss.getSheetByName(nm)) nm = nm.replace(/ \(\d+\)$/, '') + ' (' + (k++) + ')';
    sh.copyTo(ss).setName(nm);
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
    // Price Deal versi baru (total item - diskon - PPh + PPN); sisa tagihan tidak berubah
    const mo = money_(o);
    if (mo.gross) { if (mo.items) o.invItems = mo.items; o.priceDeal = mo.net; o.sisa = mo.sisa; }
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

// Price Deal = total item invoice - diskon - PPh + PPN (PPN 11% hanya Sewa Virtual Office yang dipilih "Ya").
// Data lama tanpa rincian item: Price Deal lama dianggap total item (sebelum diskon) lalu dijadikan 1 item.
function money_(o) {
  let its = [];
  try { its = typeof o.invItems === 'string' ? JSON.parse(o.invItems || '[]') : (o.invItems || []); } catch (e) { its = []; }
  if (!Array.isArray(its)) its = [];
  its = its.filter(x => x && (x.d || Number(x.h)));
  let gross = its.reduce((a, x) => a + (Number(x.q) || 1) * (Number(x.h) || 0), 0);
  let items = null;
  if (!gross && (Number(o.priceDeal) || 0) > 0) {
    gross = Number(o.priceDeal);
    const d = (its[0] && its[0].d) || (o.layanan ? o.layanan + (o.paket ? ' (Paket ' + o.paket + ')' : '') : 'Layanan');
    items = JSON.stringify([{ d: d, q: 1, h: gross }]);
  }
  const disk = Number(o.diskon) || 0, pph = Number(o.pph) || 0;
  const ppn = (o.layanan === 'Sewa Virtual Office' && o.ppn === 'Ya') ? Math.round(Math.max(0, gross - disk) * 0.11) : 0;
  const net = gross - disk - pph + ppn;
  return { gross: gross, net: net, items: items, sisa: gross ? net - (Number(o.dp) || 0) - (Number(o.lunas) || 0) : '' };
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
  let mo = money_(o);
  // status Lunas dicentang tapi masih ada sisa -> catat pelunasan otomatis
  if (st.indexOf('Lunas') >= 0 && mo.gross && mo.sisa > 0) {
    const tz = Session.getScriptTimeZone(), t = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    o = Object.assign({}, o, { lunas: (Number(o.lunas) || 0) + mo.sisa, tglLunas: o.tglLunas ? adsIso_(o.tglLunas, tz) || t : t });
    if (!String(o.invNo || '').trim() || !o.invDate || o.invDate < o.tglLunas) o.invDate = o.tglLunas;
    mo = money_(o);
  }
  const x = Object.assign({}, o, mo.items ? { invItems: mo.items } : {}, {
    priceDeal: mo.gross ? mo.net : (o.priceDeal === '' || o.priceDeal == null ? '' : 0),
    statuses: st.join(', '),
    tahap: c >= 0 ? PROC[c] : '',
    sisa: mo.sisa,
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
  const s = { sumber: [], brands: [], pics: [], vo: [], kota: [], promoText: '', waTpl: {}, alasanQ: null, invBrands: readInvBrands_(ss) };
  if (last < 2) return s;
  const v = sh.getRange(2, 1, last - 1, Math.max(9, Math.min(10, sh.getLastColumn()))).getValues();
  v.forEach(r => {
    if (r[0]) s.sumber.push({ n: String(r[0]).trim(), b: String(r[1]).trim() });
    if (r[3]) s.brands.push(String(r[3]).trim());
    if (r[4]) s.pics.push(String(r[4]).trim());
    if (r[5]) s.vo.push(String(r[5]).trim());
    if (r[6]) s.kota.push(String(r[6]).trim());
    if (r[7] && !s.promoText) s.promoText = String(r[7]).trim();
    if (r[8] && !Object.keys(s.waTpl).length) { try { s.waTpl = JSON.parse(String(r[8])) || {}; } catch (e) {} }
    if (r[9] && !s.alasanQ) { try { s.alasanQ = JSON.parse(String(r[9])) || null; } catch (e) {} }
  });
  return s;
}

function writeSettings_(sh, s) {
  const cols = [
    (s.sumber || []).map(x => x.n), (s.sumber || []).map(x => x.b), [],
    s.brands || [], s.pics || [], s.vo || [], s.kota || [], s.promoText ? [String(s.promoText)] : [],
    s.waTpl && Object.keys(s.waTpl).length ? [JSON.stringify(s.waTpl)] : [],
    s.alasanQ ? [JSON.stringify(s.alasanQ)] : []
  ];
  const n = Math.max(1, ...cols.map(c => c.length));
  const rows = [['Sumber', 'Brand (untuk sumber)', '', 'Daftar Brand', 'PIC', 'VO Partner', 'Kab/Kota', 'Teks Saran Promosi 1', 'Template WA (JSON)', 'Alasan Kualitas (JSON)']];
  for (let i = 0; i < n; i++) rows.push(cols.map(c => c[i] == null ? '' : c[i]));
  sh.clearContents();
  if (sh.getMaxColumns() < 10) sh.insertColumnsAfter(sh.getMaxColumns(), 10 - sh.getMaxColumns());
  sh.getRange(1, 1, rows.length, 10).setValues(rows);
  sh.getRange(1, 1, 1, 10).setFontWeight('bold');
  sh.setFrozenRows(1);
}

/* ---------------- Spreadsheet Google Ads (sheet "WA") ---------------- */
// Jumlah chat dari iklan per tanggal masuk otomatis ditulis ke kolom wa-vo / wa-iz / wa-ec.
// Kolom Conv tidak pernah diubah. Hanya tanggal mulai ADS.start ke atas yang diisi.
const ADS = {
  id: '1aGyJVbfYVSv9NrvhaxKaOdR--YxwR2EKttbbWJeLXl8',
  sheet: 'WA',
  start: '2026-11-01',
  map: { 'ads-lopo': 'wa-vo', 'ads-gusti': 'wa-iz', 'ads-echo': 'wa-ec' },
  cols: ['wa-vo', 'wa-iz', 'wa-ec']
};
const ADS_MON = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };
const ADS_MON_TXT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function adsIso_(v, tz) {
  if (v instanceof Date) return isNaN(v) ? '' : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const t = String(v == null ? '' : v).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = t.match(/^(\d{1,2})[-\/ ]([A-Za-z]{3,})[-\/ ](\d{2,4})$/);
  if (m && ADS_MON[m[2].slice(0, 3).toLowerCase()]) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return y + '-' + ('0' + ADS_MON[m[2].slice(0, 3).toLowerCase()]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  }
  return '';
}

function adsErr_(e) {
  PropertiesService.getScriptProperties().setProperty('ADS_ERR', new Date().toISOString() + ' ' + String((e && e.message) || e));
}

function adsOpen_() {
  const id = PropertiesService.getScriptProperties().getProperty('ADS_SHEET_ID') || ADS.id;
  const ss = SpreadsheetApp.openById(id);
  const sh = ss.getSheetByName(ADS.sheet);
  if (!sh) throw new Error('Sheet "' + ADS.sheet + '" tidak ditemukan di spreadsheet Google Ads');
  const tz = ss.getSpreadsheetTimeZone();
  const last = sh.getLastRow(), lc = sh.getLastColumn();
  const vals = sh.getRange(1, 1, Math.max(last, 1), Math.max(lc, 1)).getValues();
  let hr = -1;
  for (let i = 0; i < Math.min(vals.length, 30); i++) if (vals[i].map(x => String(x).trim().toLowerCase()).indexOf('wa-vo') >= 0) { hr = i; break; }
  if (hr < 0) throw new Error('Judul kolom wa-vo tidak ditemukan di sheet ' + ADS.sheet);
  const head = vals[hr].map(x => String(x).trim().toLowerCase());
  const cols = {};
  ADS.cols.forEach(c => { const i = head.indexOf(c); if (i < 0) throw new Error('Kolom ' + c + ' tidak ditemukan'); cols[c] = i + 1; });
  const rows = {};
  let maxD = '', maxRow = hr + 1;
  for (let i = hr + 1; i < vals.length; i++) {
    const d = adsIso_(vals[i][0], tz);
    if (!d) continue;
    rows[d] = i + 1;
    if (d > maxD) { maxD = d; maxRow = i + 1; }
  }
  return { ss: ss, sh: sh, tz: tz, hr: hr + 1, cols: cols, rows: rows, maxD: maxD, maxRow: maxRow, vals: vals };
}

// tambah baris tanggal baru di bawah (format & rumus kolom B-D mengikuti baris terakhir)
function adsAppend_(ctx, d) {
  if (!ctx.maxD || d <= ctx.maxD) return 0;
  const sh = ctx.sh;
  let cur = ctx.maxD, row = ctx.maxRow;
  while (cur < d) {
    const nx = new Date(Number(cur.slice(0, 4)), Number(cur.slice(5, 7)) - 1, Number(cur.slice(8, 10)) + 1);
    cur = nx.getFullYear() + '-' + ('0' + (nx.getMonth() + 1)).slice(-2) + '-' + ('0' + nx.getDate()).slice(-2);
    const prev = sh.getRange(row, 1, 1, 4), nr = row + 1;
    if (nr > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 100);
    const tgt = sh.getRange(nr, 1, 1, 4);
    const f = prev.getFormulasR1C1()[0];
    const auto = [nx, nx.getDate(), ADS_MON_TXT[nx.getMonth()], nx.getFullYear()];
    tgt.setValues([auto]);
    const fm = f.map((x, j) => j > 0 && x ? x : '');
    fm.forEach((x, j) => { if (x) sh.getRange(nr, j + 1).setFormulaR1C1(x); });
    try { sh.getRange(nr, 1).setNumberFormat(sh.getRange(row, 1).getNumberFormat()); } catch (e) {}
    ctx.rows[cur] = nr;
    row = nr;
  }
  ctx.maxD = d; ctx.maxRow = row;
  return ctx.rows[d] || 0;
}

// hitung ulang tanggal-tanggal tertentu dan tulis ke kolom chat
function adsWrite_(dates) {
  const ss = ss_(), tz = ss.getSpreadsheetTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const want = dates.filter(d => d && d >= ADS.start && d <= today).sort();
  if (!want.length) return 0;
  const set = {}; want.forEach(d => set[d] = { 'wa-vo': {}, 'wa-iz': {}, 'wa-ec': {} });
  readAll_(ss).forEach(o => {
    const c = ADS.map[String(o.sumber || '').trim()], d = adsIso_(o.created, tz);
    if (c && set[d]) set[d][c][o.grup || o.id] = 1;   // 1 grup (banyak PT sekaligus) = 1 chat
  });
  const ctx = adsOpen_();
  const rowsOf = {};
  want.forEach(d => { const r = ctx.rows[d] || adsAppend_(ctx, d); if (r) rowsOf[d] = r; });
  const ds = Object.keys(rowsOf).sort((a, b) => rowsOf[a] - rowsOf[b]);
  if (!ds.length) return 0;
  // tulis per blok baris yang berurutan (baris lain tidak disentuh)
  const runs = [];
  ds.forEach(d => { const L = runs[runs.length - 1]; if (L && rowsOf[d] === L.r + L.d.length) L.d.push(d); else runs.push({ r: rowsOf[d], d: [d] }); });
  runs.forEach(run => ADS.cols.forEach(c => {
    ctx.sh.getRange(run.r, ctx.cols[c], run.d.length, 1).setValues(run.d.map(d => [Object.keys(set[d][c]).length]));
  }));
  const rs = ds;
  PropertiesService.getScriptProperties().setProperty('ADS_OK', new Date().toISOString());
  PropertiesService.getScriptProperties().deleteProperty('ADS_ERR');
  return rs.length;
}

function adsAllDates_() {
  const tz = ss_().getSpreadsheetTimeZone(), out = [];
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  let d = new Date(Number(ADS.start.slice(0, 4)), Number(ADS.start.slice(5, 7)) - 1, Number(ADS.start.slice(8, 10)));
  for (let i = 0; i < 4000; i++) {
    const s = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    if (s > today) break;
    out.push(s); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  return out;
}

// dipanggil pemicu harian: hitung ulang 7 hari terakhir
function adsNightly() {
  try { const a = adsAllDates_(); adsWrite_(a.slice(-7)); } catch (e) { adsErr_(e); }
  // laporan vendor: bulan ini & bulan lalu (status deal / bayar bisa berubah belakangan)
  const tz = ss_().getSpreadsheetTimeZone(), now = new Date();
  const ms = [0, 1].map(k => Utilities.formatDate(new Date(now.getFullYear(), now.getMonth() - k, 1), tz, 'yyyy-MM'));
  vendorSync_(VENDORS.reduce((a, v) => a.concat(ms.map(m => v.sumber + '|' + m)), []));
}

// JALANKAN SEKALI dari editor Apps Script (pilih fungsi ini lalu klik Run) untuk:
// memberi izin akses spreadsheet Google Ads, memasang pemicu harian, dan mengisi ulang sejak 1 November.
function setupGoogleAds() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'adsNightly').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('adsNightly').timeBased().everyDays(1).atHour(1).create();
  const n = adsWrite_(adsAllDates_());
  Logger.log('Selesai: ' + n + ' tanggal diisi di sheet ' + ADS.sheet + '. Pemicu harian jam 01.00 terpasang.');
  // laporan kualitas leads: semua bulan sejak November
  const tz = ss_().getSpreadsheetTimeZone(), months = {};
  adsAllDates_().forEach(d => months[d.slice(0, 7)] = 1);
  const res = vendorSync_(VENDORS.reduce((a, v) => a.concat(Object.keys(months).map(m => v.sumber + '|' + m)), []));
  Logger.log('Laporan vendor: ' + JSON.stringify(res));
  Logger.log('Isi celah Izinin 21-31 Okt: ' + vendorBackfillIzinin_());
}

// admin: isi ulang semua tanggal sejak 1 November dari aplikasi
function adsSync(token) {
  const u = auth_(token);
  if (u.role !== 'admin') throw new Error('FORBIDDEN');
  let n = 0;
  try { n = adsWrite_(adsAllDates_()); } catch (e) { adsErr_(e); throw e; }
  const months = {};
  adsAllDates_().forEach(d => months[d.slice(0, 7)] = 1);
  const vend = vendorSync_(VENDORS.reduce((a, v) => a.concat(Object.keys(months).map(m => v.sumber + '|' + m)), []));
  return { n: n, vendor: vend };
}

// admin: data chat & conversion per tanggal untuk kartu di Ringkasan
function adsStats(token) {
  const u = auth_(token);
  if (u.role !== 'admin') throw new Error('FORBIDDEN');
  const props = PropertiesService.getScriptProperties();
  const ctx = adsOpen_();
  const conv = ADS.cols.map(c => ctx.cols[c] + 1);
  const rows = [];
  Object.keys(ctx.rows).sort().forEach(d => {
    const r = ctx.vals[ctx.rows[d] - 1];
    if (!r) return;
    const n = i => Number(r[i - 1]) || 0;
    rows.push([d].concat(ADS.cols.map((c, k) => [n(ctx.cols[c]), n(conv[k])]).reduce((a, x) => a.concat(x), [])));
  });
  return { rows: rows, start: ADS.start, ok: props.getProperty('ADS_OK') || '', err: props.getProperty('ADS_ERR') || '',
    vendor: VENDORS.map(v => ({ brand: v.brand, ok: props.getProperty('VEND_OK_' + v.brand) || '', err: props.getProperty('VEND_ERR_' + v.brand) || '' })) };
}

/* ---------------- Laporan kualitas leads untuk vendor iklan ---------------- */
// Tabel kiri di tab bulan disusun ulang dari data aplikasi (1 baris = 1 chat dari iklan, 1 grup = 1 baris).
// Contoh, catatan, ringkasan di sebelah kanan dan tab sebelum November tidak disentuh.
const VENDORS = [
  { brand: 'Vorent', sumber: 'ads-lopo', id: '1clQrRJ61ZPLiBorUKbMkmUeDsN8D6GN4LVyFNVnPuiI', deal: ['Deals', 'Belum Deal'], style: 'full' },
  { brand: 'Izinin', sumber: 'ads-gusti', id: '1VtcUCMCFc1w-EetGloldDZy424gV_AlMOigx-miwgdk', deal: ['Deals', 'Belum Deals'], style: 'short' }
];
const VEND_START = '2026-11';
const VEND_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const VEND_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
const VEND_SHORT_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const VEND_HEAD = { no: 'no.', tgl: 'tanggal', keb: 'kebutuhan', kual: 'berkualitas/tidak', deal: 'deals', stat: 'stat invoice', src: 'source', alasan: 'alasan berkualitas / tidak berkualitas', notes: 'notes', kode: 'kode chat' };
const VEND_REQ = ['no', 'tgl', 'keb', 'kual', 'deal', 'src', 'alasan', 'notes'];

function vendKebutuhan_(l) {
  return { 'Pendirian PT Perorangan': 'PT Perorangan', 'Pendirian PT PMDN': 'Pendirian PT', 'Pendirian PT PMA': 'PMA', 'Pendirian CV': 'Pendirian CV', 'Sewa Virtual Office': 'Virtual Office' }[l] || 'Others';
}

// 1 baris laporan dari 1 lead (data pemimpin grup) + status gabungan semua PT di grup
function vendRow_(lead, group, v, tz) {
  const st = o => (Array.isArray(o.statuses) ? o.statuses : String(o.statuses || '').split(',')).map(x => String(x).trim());
  const paid = group.some(o => (Number(o.dp) || 0) > 0 || (Number(o.lunas) || 0) > 0);
  const deal = paid || group.some(o => { const s = st(o); return PROC.some(x => s.indexOf(x) >= 0) || s.indexOf('Klien') >= 0; });
  const s0 = st(lead), spam = s0.indexOf('Spam') >= 0 || lead.layanan === 'Spam';
  const closed = s0.some(x => x === 'Lose' || x === 'Spam' || x === 'Delete');
  const keb = vendKebutuhan_(lead.layanan);
  const d = adsIso_(lead.created, tz);
  return {
    tgl: d ? new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) : '',
    keb: keb,
    kual: lead.kualitas || (spam ? 'Tidak Berkualitas' : ''),
    deal: deal ? v.deal[0] : v.deal[1],
    stat: paid ? 'Sudah Bayar' : deal ? 'Nunggu Bayar' : closed ? 'Ghosting' : '',
    src: lead.srcChat === 'Tanpa Keterangan' ? 'Tanpa Keterangan' : 'Ads',
    alasan: lead.alasanQ || (spam ? 'Chat spam' : ''),
    notes: keb === 'Others' && lead.layanan && lead.layanan !== 'Spam' && lead.layanan !== 'Lainnya' ? lead.layanan : '',
    kode: ''
  };
}

function vendLeads_(all, v, from, to, tz) {
  const g = {};
  all.forEach(o => {
    if (String(o.sumber || '').trim() !== v.sumber) return;
    const d = adsIso_(o.created, tz);
    if (!d || d < from || d > to) return;
    (g[o.grup || o.id] = g[o.grup || o.id] || []).push(o);
  });
  return Object.keys(g).map(k => {
    const arr = g[k], lead = arr.find(o => o.id === k) || arr[0];
    return { lead: lead, group: arr, d: adsIso_(lead.created, tz) };
  }).sort((a, b) => a.d.localeCompare(b.d) || (Number(a.lead.no) || 0) - (Number(b.lead.no) || 0));
}

// cari baris judul & kolom tabel kiri berdasarkan nama judul
function vendLayout_(sh) {
  const lc = Math.max(sh.getLastColumn(), 1), top = sh.getRange(1, 1, Math.min(10, Math.max(sh.getLastRow(), 1)), lc).getValues();
  for (let r = 0; r < top.length; r++) {
    const h = top[r].map(x => String(x).trim().toLowerCase().replace(/\s+/g, ' '));
    if (h.indexOf('tanggal') < 0 || h.indexOf('kebutuhan') < 0) continue;
    const col = {};
    Object.keys(VEND_HEAD).forEach(k => { const i = h.indexOf(VEND_HEAD[k]); if (i >= 0) col[k] = i + 1; });
    // hanya tabel kiri: kolom sebelum kolom kosong pemisah
    const gap = h.findIndex((x, i) => i > (col.notes || 1) - 1 && !x);
    Object.keys(col).forEach(k => { if (gap >= 0 && col[k] > gap) delete col[k]; });
    const miss = VEND_REQ.filter(k => !col[k]);
    if (miss.length) throw new Error('Kolom ' + miss.map(k => '"' + VEND_HEAD[k] + '"').join(', ') + ' tidak ditemukan di tab ' + sh.getName());
    return { hr: r + 1, col: col };
  }
  throw new Error('Judul tabel (Tanggal, Kebutuhan) tidak ditemukan di tab ' + sh.getName());
}

// tab untuk bulan tertentu; dibuat dari tab bulan sebelumnya kalau belum ada
function vendTab_(ss, v, ym) {
  const y = ym.slice(0, 4), m = Number(ym.slice(5, 7)) - 1, tz = ss.getSpreadsheetTimeZone();
  const names = v.style === 'full' ? [VEND_FULL[m] + ' ' + y, VEND_FULL[m]] : [VEND_SHORT[m] + ' ' + y, VEND_SHORT_EN[m] + ' ' + y];
  for (let i = 0; i < names.length; i++) {
    const sh = ss.getSheetByName(names[i]);
    if (!sh) continue;
    if (names[i].indexOf(y) >= 0) return sh;
    // tab tanpa tahun (mis. "November"): pastikan isinya memang tahun yang sama
    const L = vendLayout_(sh), n = Math.max(0, sh.getLastRow() - L.hr);
    const ds = n ? sh.getRange(L.hr + 1, L.col.tgl, n, 1).getValues().map(r => adsIso_(r[0] instanceof Date ? r[0] : vendDate_(r[0]), tz)).filter(Boolean) : [];
    if (!ds.length || ds.every(d => d.slice(0, 4) === y)) return sh;
  }
  // buat tab baru dari tab bulan sebelumnya
  let tpl = null;
  for (let k = 1; k <= 12 && !tpl; k++) {
    const pm = new Date(Number(y), m - k, 1), py = String(pm.getFullYear()), pmi = pm.getMonth();
    const cand = v.style === 'full' ? [VEND_FULL[pmi] + ' ' + py, VEND_FULL[pmi]] : [VEND_SHORT[pmi] + ' ' + py, VEND_SHORT_EN[pmi] + ' ' + py];
    cand.forEach(c => { if (!tpl) tpl = ss.getSheetByName(c); });
  }
  if (!tpl) throw new Error('Tab bulan ' + names[0] + ' belum ada dan tidak ada tab bulan sebelumnya untuk dicontoh');
  const sh = tpl.copyTo(ss).setName(names[0]);
  const L = vendLayout_(sh), n = Math.max(0, sh.getLastRow() - L.hr);
  if (n) Object.keys(L.col).filter(k => k !== 'no').forEach(k => sh.getRange(L.hr + 1, L.col[k], n, 1).clearContent());
  return sh;
}

// tanggal teks dd/MM/yyyy -> objek tanggal
function vendDate_(v) {
  const m = String(v || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : v;
}

function vendWriteMonth_(v, ym, all, tz) {
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('VEND_ID_' + v.brand) || v.id);
  const sh = vendTab_(ss, v, ym), L = vendLayout_(sh), c = L.col;
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  const last = new Date(y, m, 0).getDate();
  const leads = vendLeads_(all, v, ym + '-01', ym + '-' + ('0' + last).slice(-2), tz);
  const rows = leads.map(x => vendRow_(x.lead, x.group, v, tz));
  // jumlah baris yang sekarang terisi (untuk dibersihkan kalau datanya berkurang)
  const lr = sh.getLastRow(), cur = Math.max(0, lr - L.hr);
  let used = 0;
  if (cur) sh.getRange(L.hr + 1, c.tgl, cur, 1).getValues().forEach((r, i) => { if (String(r[0]).trim()) used = i + 1; });
  const total = Math.max(rows.length, used);
  if (!total) return 0;
  if (L.hr + total > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), L.hr + total - sh.getMaxRows());
  const keys = Object.keys(c).filter(k => k !== 'no');
  keys.forEach(k => {
    const vals = [];
    for (let i = 0; i < total; i++) vals.push([i < rows.length ? rows[i][k] : '']);
    const rg = sh.getRange(L.hr + 1, c[k], total, 1).setValues(vals);
    if (k === 'tgl') rg.setNumberFormat('dd/MM/yyyy');
  });
  // nomor urut: lanjutkan kalau baris bernomor kurang
  const nos = sh.getRange(L.hr + 1, c.no, total, 1).getValues();
  let fix = false;
  nos.forEach((r, i) => { if (!String(r[0]).trim()) { r[0] = i + 1; fix = true; } });
  if (fix) sh.getRange(L.hr + 1, c.no, total, 1).setValues(nos);
  return rows.length;
}

// keys: ["ads-lopo|2026-11", ...]
function vendorSync_(keys) {
  const props = PropertiesService.getScriptProperties(), out = {};
  const ss = ss_(), tz = ss.getSpreadsheetTimeZone();
  let all = null;
  VENDORS.forEach(v => {
    const ms = keys.filter(k => k.split('|')[0] === v.sumber).map(k => k.split('|')[1]).filter(m => m >= VEND_START);
    if (!ms.length) return;
    try {
      if (!all) all = readAll_(ss);
      ms.filter((m, i) => ms.indexOf(m) === i).sort().forEach(m => { out[v.brand + ' ' + m] = vendWriteMonth_(v, m, all, tz); });
      props.setProperty('VEND_OK_' + v.brand, new Date().toISOString());
      props.deleteProperty('VEND_ERR_' + v.brand);
    } catch (e) {
      props.setProperty('VEND_ERR_' + v.brand, new Date().toISOString() + ' ' + String((e && e.message) || e));
      out[v.brand] = 'GAGAL: ' + String((e && e.message) || e);
    }
  });
  return out;
}

// sekali saja: isi celah Izinin 21-31 Okt 2026 di tab "SEP - OKT 2026" (baris lama tidak disentuh)
function vendorBackfillIzinin_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('IZN_BACKFILL')) return 'sudah pernah';
  const v = VENDORS.find(x => x.brand === 'Izinin');
  const ss = SpreadsheetApp.openById(props.getProperty('VEND_ID_Izinin') || v.id);
  const sh = ss.getSheetByName('SEP - OKT 2026');
  if (!sh) return 'tab SEP - OKT 2026 tidak ada';
  const src = ss_(), tz = src.getSpreadsheetTimeZone();
  const L = vendLayout_(sh), c = L.col;
  const leads = vendLeads_(readAll_(src), v, '2026-10-21', '2026-10-31', tz);
  const n = Math.max(0, sh.getLastRow() - L.hr);
  let used = 0;
  if (n) sh.getRange(L.hr + 1, c.tgl, n, 1).getValues().forEach((r, i) => { if (String(r[0]).trim()) used = i + 1; });
  leads.forEach((x, i) => {
    const r = vendRow_(x.lead, x.group, v, tz), row = L.hr + used + 1 + i;
    if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 10);
    Object.keys(c).forEach(k => { if (k !== 'no') sh.getRange(row, c[k]).setValue(r[k]); });
    sh.getRange(row, c.tgl).setNumberFormat('dd/MM/yyyy');
    if (!String(sh.getRange(row, c.no).getValue()).trim()) sh.getRange(row, c.no).setValue(used + 1 + i);
  });
  props.setProperty('IZN_BACKFILL', new Date().toISOString());
  return leads.length + ' baris ditambahkan';
}

/* ---------------- Pengingat email harian jam 08.00 untuk PIC ---------------- */
// Isi sama dengan "Tugas hari ini" di aplikasi, hanya data milik PIC tersebut.
// Email PIC disimpan di sheet Pengguna kolom D ("Email").
const REM_APP_URL = 'https://my-razara.github.io/dashboard-prospek/';
const REM_EMAIL_DEF = { eko: 'ekovorent@gmail.com', mayang: 'mayangvorent@gmail.com', deny: 'deny.echoffice@gmail.com' };
const REM_FU_BASE = [['FU1', 2], ['FU2', 5], ['FU3', 10], ['FU4', 17]], REM_FU_DP = [['FU5', 21], ['FU6', 26]], REM_FU_PRM = [['PRM1', 30], ['PRM2', 37]];
const REM_FU_LABELS = REM_FU_BASE.concat(REM_FU_DP, REM_FU_PRM).map(x => x[0]);

function remHas_(p, t) { return (Array.isArray(p.statuses) ? p.statuses : String(p.statuses || '').split(',')).map(x => String(x).trim()).indexOf(t) >= 0; }
function remHasDp_(p) { return (Number(p.dp) || 0) > 0 || !!p.tglDp; }
function remStep_(p) {
  let c = -1;
  PROC.forEach((s, i) => { if (remHas_(p, s)) c = i; });
  if (c < 0 && remHasDp_(p) && !remHas_(p, 'Lose') && !remHas_(p, 'Spam') && !remHas_(p, 'Delete')) c = 0;
  return c;
}
function remPhase_(p) {
  if (remHas_(p, 'Delete')) return 'delete';
  if (remHas_(p, 'Spam')) return 'spam';
  if (remHas_(p, 'Lose')) return 'lose';
  if (remHas_(p, 'Serah Terima')) return 'selesai';
  if (remHas_(p, 'Klien') || remStep_(p) >= 0) return 'proses';
  return 'prospek';
}
function remAddDays_(d, n) {
  const s = String(d).slice(0, 10), t = new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)) + n);
  return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);
}
function remDays_(a, b) { // b - a (hari)
  const d = s => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))).getTime();
  return Math.round((d(b) - d(a)) / 864e5);
}
// sama dengan fuState() di aplikasi
function remFu_(p, today) {
  if (p.grup && p.grup !== p.id) return { active: false };
  const ph = remPhase_(p);
  if (['lose', 'spam', 'delete', 'selesai'].indexOf(ph) >= 0 || remHas_(p, 'Klien') || remStep_(p) >= 1 || !p.created) return { active: false };
  const done = {};
  String(p.fuDone || '').split(';').forEach(x => { const a = x.split('@'), k = (a[0] || '').trim(); if (REM_FU_LABELS.indexOf(k) >= 0) done[k] = (a[1] || '').trim() || '1'; });
  const ch = p.fuChoice || (remHas_(p, 'Waiting DP') ? 'dp' : '');
  let seq = REM_FU_BASE.slice();
  if (done.FU4) { if (ch === 'dp') { seq = seq.concat(REM_FU_DP); if (done.FU6) seq = seq.concat(REM_FU_PRM); } else if (ch === 'promo') seq = seq.concat(REM_FU_PRM); }
  let idx = -1;
  seq.forEach((s, i) => { if (remAddDays_(p.created, s[1]) <= today) idx = i; });
  if (idx < 0) return { active: true, upcoming: true };
  const cur = seq[idx][0];
  return { active: true, label: cur, date: remAddDays_(p.created, seq[idx][1]), done: !!done[cur], missed: seq.slice(0, idx).filter(s => !done[s[0]]).map(s => s[0]), inbox: cur === 'FU4' && !!done.FU4 && !ch };
}

function remEmails_(ss) {
  const sh = ss.getSheetByName(SHEET_USER), out = {};
  if (!sh || sh.getLastRow() < 2 || sh.getLastColumn() < 4) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(r => { const e = String(r[3] || '').trim(); if (String(r[0]).trim() && /@/.test(e)) out[norm_(r[0])] = e; });
  return out;
}

function remTasks_(items, pic, today) {
  const mine = items.filter(p => norm_(p.pic) === norm_(pic));
  const act = mine.filter(p => ['prospek', 'proses'].indexOf(remPhase_(p)) >= 0);
  const fs = mine.map(p => [p, remFu_(p, today)]);
  const inbox = fs.filter(x => x[1].inbox).map(x => x[0]);
  const fu = fs.filter(x => x[1].active && x[1].label && !x[1].done).sort((a, b) => a[1].date.localeCompare(b[1].date)).map(x => ({ p: x[0], s: x[1] }));
  const dp = act.filter(p => remStep_(p) === 0 && !remHasDp_(p)).sort((a, b) => String(a.created).localeCompare(String(b.created)));
  const due = act.filter(p => { const m = money_(p); return m.gross && m.sisa > 0 && p.invDue && String(p.invDue) < today; }).sort((a, b) => String(a.invDue).localeCompare(String(b.invDue)));
  const lq = mine.filter(p => ADS.map[String(p.sumber || '').trim()] && !(p.grup && p.grup !== p.id) && !p.kualitas && String(p.created || '') >= ADS.start && String(p.created || '') < today && !remHas_(p, 'Spam') && p.layanan !== 'Spam' && !remHas_(p, 'Delete'));
  return { inbox: inbox, fu: fu, dp: dp, due: due, lq: lq };
}

function remHtml_(pic, t, today) {
  const e = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rp = n => 'Rp' + Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const BL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const HR = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const td = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  const tgl = HR[td.getDay()] + ', ' + td.getDate() + ' ' + BL[td.getMonth()] + ' ' + td.getFullYear();
  const fd = s => { s = String(s || ''); return s ? Number(s.slice(8, 10)) + ' ' + BL[Number(s.slice(5, 7)) - 1].slice(0, 3) : '–'; };
  const wa = w => { let n = String(w || '').replace(/\D/g, ''); if (!n) return ''; if (n.indexOf('0') === 0) n = '62' + n.slice(1); else if (n.indexOf('8') === 0) n = '62' + n; return 'https://wa.me/' + n; };
  const who = p => '<div style="font-weight:700;color:#0f172a;font-size:15px">' + e(p.nama) + '</div><div style="color:#64748b;font-size:13px;margin-top:2px">' + e([p.layanan, p.paket].filter(Boolean).join(' · ') || '–') + '</div>';
  const pill = (txt, bg, fg) => '<span style="display:inline-block;padding:3px 9px;border-radius:999px;background:' + bg + ';color:' + fg + ';font-size:12px;font-weight:700;white-space:nowrap">' + e(txt) + '</span>';
  const waBtn = p => wa(p.wa) ? '<a href="' + wa(p.wa) + '" style="display:inline-block;padding:7px 12px;border-radius:9px;background:#dcfce7;color:#166534;font-weight:700;font-size:13px;text-decoration:none">WhatsApp</a>' : '';
  const row = (p, mid) => '<tr><td style="padding:12px 0;border-bottom:1px solid #eef2f7;vertical-align:top">' + who(p) + '<div style="margin-top:6px">' + mid + '</div></td><td style="padding:12px 0 12px 10px;border-bottom:1px solid #eef2f7;text-align:right;vertical-align:middle;width:1%">' + waBtn(p) + '</td></tr>';
  const MAX = 10;
  const sec = (title, sub, color, list, fn) => {
    if (!list.length) return '';
    return '<tr><td style="padding:22px 24px 4px"><div style="border-left:4px solid ' + color + ';padding-left:10px"><div style="font-size:16px;font-weight:800;color:#0f172a">' + e(title) + ' <span style="color:' + color + '">(' + list.length + ')</span></div><div style="font-size:13px;color:#64748b;margin-top:2px">' + e(sub) + '</div></div>'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px">' + list.slice(0, MAX).map(fn).join('') + '</table>'
      + (list.length > MAX ? '<div style="font-size:13px;color:#64748b;padding-top:8px">+' + (list.length - MAX) + ' lainnya, lihat di aplikasi</div>' : '') + '</td></tr>';
  };
  const tiles = [['Inbox', t.inbox.length, '#4f46e5'], ['Follow-up', t.fu.length, '#d97706'], ['Waiting DP', t.dp.length, '#059669'], ['Tagihan telat', t.due.length, '#dc2626'], ['Lead belum dinilai', t.lq.length, '#0284c7']];
  const total = tiles.reduce((a, x) => a + x[1], 0);
  return '<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:20px 10px"><tr><td align="center">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.08)">'
    + '<tr><td style="background:#1e3a8a;background:linear-gradient(135deg,#1e3a8a,#4f46e5);padding:26px 24px;color:#ffffff">'
    + '<div style="font-size:13px;opacity:.85">' + e(tgl) + '</div>'
    + '<div style="font-size:22px;font-weight:800;margin-top:4px">Selamat pagi, ' + e(pic) + ' 👋</div>'
    + '<div style="font-size:14px;opacity:.9;margin-top:6px">Ada <b>' + total + ' tugas</b> yang perlu kamu kerjakan hari ini.</div></td></tr>'
    + '<tr><td style="padding:18px 16px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
    + tiles.map(x => '<td align="center" style="padding:4px"><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px 4px"><div style="font-size:22px;font-weight:800;color:' + (x[1] ? x[2] : '#94a3b8') + '">' + x[1] + '</div><div style="font-size:11px;color:#64748b;margin-top:2px;line-height:1.2">' + e(x[0]) + '</div></div></td>').join('')
    + '</tr></table></td></tr>'
    + sec('Inbox follow-up', 'FU4 selesai, pilih lanjutannya: Waiting DP atau Saran promosi.', '#4f46e5', t.inbox, p => row(p, pill('Pilih lanjutan', '#eef2ff', '#4338ca')))
    + sec('Follow-up jatuh tempo', 'Kirim pesan follow-up, lalu tandai "Sudah" di aplikasi.', '#d97706', t.fu, x => { const d = remDays_(x.s.date, today); return row(x.p, pill(x.s.label, '#fef3c7', '#92400e') + ' <span style="font-size:12.5px;color:' + (d > 0 ? '#dc2626' : '#64748b') + '">' + (d > 0 ? d + ' hari lewat' : 'hari ini') + '</span>' + (x.s.missed.length ? ' <span style="font-size:12px;color:#b45309">· ' + e(x.s.missed.join(', ')) + ' terlewat</span>' : '')); })
    + sec('Waiting DP, belum bayar', 'Kirim invoice / ingatkan pembayaran DP.', '#059669', t.dp, p => { const m = money_(p); return row(p, (m.gross ? pill('Deal ' + rp(m.net), '#dcfce7', '#166534') : pill('Price deal belum diisi', '#f1f5f9', '#475569')) + ' <span style="font-size:12.5px;color:#64748b">masuk ' + fd(p.created) + '</span>'); })
    + sec('Tagihan lewat jatuh tempo', 'Ingatkan pelunasan ke klien.', '#dc2626', t.due, p => row(p, pill('Sisa ' + rp(money_(p).sisa), '#fee2e2', '#991b1b') + ' <span style="font-size:12.5px;color:#dc2626">jatuh tempo ' + fd(p.invDue) + '</span>'))
    + sec('Lead iklan belum dinilai', 'Nilai Berkualitas / Tidak di menu Tugas hari ini (tidak wajib, untuk laporan vendor iklan).', '#0284c7', t.lq, p => row(p, pill(String(p.sumber || ''), '#e0f2fe', '#075985') + ' <span style="font-size:12.5px;color:#64748b">masuk ' + fd(p.created) + '</span>'))
    + '<tr><td align="center" style="padding:26px 24px 8px"><a href="' + REM_APP_URL + '" style="display:inline-block;padding:13px 26px;border-radius:12px;background:#4f46e5;color:#ffffff;font-weight:800;font-size:15px;text-decoration:none">Buka aplikasi Prospek</a></td></tr>'
    + '<tr><td style="padding:10px 24px 24px;text-align:center;font-size:12px;color:#94a3b8">Email otomatis setiap pagi dari aplikasi Monitoring Prospek. Tugas yang sudah dikerjakan di aplikasi tidak muncul lagi besok.</td></tr>'
    + '</table></td></tr></table></body></html>';
}

// dipanggil pemicu harian jam 08.00
function kirimPengingatPagi() {
  const ss = ss_(), tz = ss.getSpreadsheetTimeZone(), today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const items = readAll_(ss), emails = remEmails_(ss), out = [];
  readUsers_(ss).filter(u => u.role !== 'admin').forEach(u => {
    const to = emails[norm_(u.name)];
    if (!to) { out.push(u.name + ': email belum diisi'); return; }
    const t = remTasks_(items, u.name, today);
    const n = t.inbox.length + t.fu.length + t.dp.length + t.due.length + t.lq.length;
    if (!n) { out.push(u.name + ': tidak ada tugas, email tidak dikirim'); return; }
    const parts = [[t.fu.length, 'follow-up'], [t.inbox.length, 'inbox'], [t.dp.length, 'waiting DP'], [t.due.length, 'tagihan telat'], [t.lq.length, 'lead belum dinilai']].filter(x => x[0]).map(x => x[0] + ' ' + x[1]);
    try {
      MailApp.sendEmail({ to: to, subject: 'Tugas hari ini, ' + u.name + ': ' + parts.join(', '), htmlBody: remHtml_(u.name, t, today), name: 'Monitoring Prospek' });
      out.push(u.name + ': terkirim ke ' + to + ' (' + n + ' tugas)');
    } catch (e) { out.push(u.name + ': GAGAL ' + String((e && e.message) || e)); }
  });
  PropertiesService.getScriptProperties().setProperty('REM_LAST', today + ' ' + out.join(' | '));
  return out;
}

// JALANKAN SEKALI dari editor Apps Script: isi email PIC, pasang pemicu jam 08.00, lalu kirim contoh ke email admin
function setupPengingat() {
  const ss = ss_(), sh = ss.getSheetByName(SHEET_USER);
  if (String(sh.getRange(1, 4).getValue()).trim() !== 'Email') sh.getRange(1, 4).setValue('Email').setFontWeight('bold');
  if (sh.getLastRow() >= 2) {
    const rg = sh.getRange(2, 1, sh.getLastRow() - 1, 4), v = rg.getValues();
    v.forEach(r => { const d = REM_EMAIL_DEF[norm_(r[0])]; if (d && !String(r[3]).trim()) r[3] = d; });
    sh.getRange(2, 4, v.length, 1).setValues(v.map(r => [r[3]]));
  }
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'kirimPengingatPagi').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('kirimPengingatPagi').timeBased().everyDays(1).atHour(8).nearMinute(0).inTimezone(ss.getSpreadsheetTimeZone()).create();
  Logger.log('Pemicu jam 08.00 (' + ss.getSpreadsheetTimeZone() + ') terpasang. Email PIC: ' + JSON.stringify(remEmails_(ss)));
  // contoh tampilan ke pemilik script, supaya bisa dicek dulu
  const me = Session.getEffectiveUser().getEmail(), tz = ss.getSpreadsheetTimeZone(), today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const pic = readUsers_(ss).find(u => u.role !== 'admin');
  if (me && pic) {
    const t = remTasks_(readAll_(ss), pic.name, today);
    MailApp.sendEmail({ to: me, subject: '[Contoh] Pengingat pagi untuk ' + pic.name, htmlBody: remHtml_(pic.name, t, today), name: 'Monitoring Prospek' });
    Logger.log('Contoh pengingat (data ' + pic.name + ') dikirim ke ' + me);
  }
}

/* ---------------- Bersih-bersih sheet yang tidak dipakai aplikasi ---------------- */
// JALANKAN dari editor Apps Script (pilih fungsi ini lalu Run). Menghapus semua tab di spreadsheet database
// selain yang dipakai aplikasi. Kalau ada yang ternyata masih perlu, kembalikan lewat File > Riwayat versi.
const SHEETS_DIPAKAI = [SHEET_DATA, SHEET_SET, SHEET_USER, SHEET_INV, SHEET_BUDGET];
function hapusSheetTakTerpakai() {
  const ss = ss_(), hapus = ss.getSheets().filter(sh => SHEETS_DIPAKAI.indexOf(sh.getName()) < 0);
  if (!hapus.length) { Logger.log('Tidak ada sheet yang perlu dihapus.'); return []; }
  const names = hapus.map(sh => sh.getName());
  hapus.forEach(sh => ss.deleteSheet(sh));
  Logger.log('Dihapus (' + names.length + '): ' + names.join(', '));
  Logger.log('Tersisa: ' + ss.getSheets().map(sh => sh.getName()).join(', '));
  return names;
}
