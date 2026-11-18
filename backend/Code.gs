/**
 * 왜 한국이었나요? — 설문 API (Google Apps Script)
 *
 * 이 파일은 Google Sheets에 연결된 Apps Script 프로젝트에 붙여 넣습니다.
 * - 응답 저장:  시트 'responses' (한 줄 = 한 응답), 시트 'raw_log' (원본 JSON, 추가만 함)
 * - 관리자 비밀번호: 코드에 쓰지 않습니다. [프로젝트 설정 → 스크립트 속성]에
 *   ADMIN_PASSWORD 라는 이름으로 넣습니다.
 * - 백업: 매일 새벽 3시에 스프레드시트 사본을 Drive 폴더에 저장합니다 (setup 실행 후).
 * - v2: nickname(이름·별명, 선택), q11(설문 불편 사항, 선택) 열을 맨 뒤에 추가. 기존 시트에는 자동으로 열 제목이 붙습니다.
 */

const SHEET_RESPONSES = 'responses';
const SHEET_RAW = 'raw_log';
const BACKUP_FOLDER = 'why-korea-survey-backups';
const BACKUP_KEEP = 30;          // 보관할 백업 사본 수
const TZ = 'Asia/Seoul';
const FAST_SEC = 45;             // 이보다 빨리 끝낸 응답은 'fast' 표시
const MAX_FAILS = 8;             // 비밀번호 연속 실패 허용 횟수
const LOCK_MIN = 10;             // 잠금 시간(분)
const TOKEN_HOURS = 6;           // 관리자 로그인 유지 시간

const COLUMNS = [
  'id', 'submitted_at', 'lang', 'src', 'device', 'duration_sec',
  'q1', 'q1_other', 'q2', 'q2_other', 'q3', 'q4',
  'q5_1', 'q5_2', 'q5_3', 'q5_other',
  'q6', 'q6_other', 'q7', 'q7_other', 'q7_why',
  'q8_study', 'q8_cost', 'q8_job', 'q8_visa', 'q8_korean', 'q8_support',
  'q9', 'q9_other', 'q9_sure', 'q10', 'q10_why',
  'flags', 'excluded', 'client_id',
  'nickname', 'q11'
];
const NUMERIC = ['duration_sec', 'q8_study', 'q8_cost', 'q8_job', 'q8_visa', 'q8_korean', 'q8_support', 'q9_sure', 'q10'];

const ALLOWED = {
  lang: ['ko', 'en', 'vi', 'zh'],
  device: ['mobile', 'desktop'],
  q1: ['VN', 'CN', 'MN', 'NP', 'ETC'],
  q2: ['d4', 'd2_ba', 'd2_ma', 'd2_phd', 'exch', 'other'],
  q3: ['le2020', '2021', '2022', '2023', '2024', '2025', '2026'],
  q4: ['moved', 'direct', 'plan', 'noplan', 'unsure'],
  q5: ['cost', 'schol', 'job', 'parttime', 'culture', 'quality', 'network', 'visa', 'other'],
  q6: ['agency', 'peers', 'sns', 'univ', 'gov', 'school', 'other'],
  q7: ['JP', 'US', 'AU', 'CN', 'EU', 'TW', 'other'],
  q8: ['study', 'cost', 'job', 'visa', 'korean', 'support'],
  q9: ['kr_job', 'kr_study', 'home', 'third', 'unsure', 'other']
};

/* ───────────── 진입점 ───────────── */

function doGet() {
  return json_({ ok: true, service: 'why-korea-survey', open: isOpen_() });
}

function doPost(e) {
  var req;
  try {
    var body = (e && e.postData && e.postData.contents) || '';
    if (body.length > 20000) return json_({ ok: false, error: 'too_large' });
    req = JSON.parse(body);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  try {
    switch (req.action) {
      case 'status': return json_({ ok: true, open: isOpen_() });
      case 'submit': return json_(submit_(req));
      case 'admin_login': return json_(adminLogin_(req));
      case 'admin_list': return json_(withAdmin_(req, adminList_));
      case 'admin_exclude': return json_(withAdmin_(req, adminExclude_));
      case 'admin_set_open': return json_(withAdmin_(req, adminSetOpen_));
      case 'admin_backup': return json_(withAdmin_(req, function () { return { ok: true, name: backupNow_() }; }));
      default: return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server_error' });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ───────────── 응답 저장 ───────────── */

function submit_(req) {
  if (!isOpen_()) return { ok: false, error: 'closed' };
  var m = req.meta || {};
  if (m.hp) return { ok: true };                       // 자동 입력 봇: 저장하지 않고 조용히 끝냄
  var row = normalize_(req.answers || {}, m);
  if (!row) return { ok: false, error: 'invalid' };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_(SHEET_RESPONSES);
    if (row.client_id && hasClient_(sh, row.client_id)) return { ok: true, duplicate: true };
    sh.appendRow(COLUMNS.map(function (c) { return row[c]; }));
    sheet_(SHEET_RAW).appendRow([row.id, row.submitted_at, JSON.stringify({ answers: req.answers, meta: m })]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, id: row.id };
}

function normalize_(a, m) {
  var r = {};
  COLUMNS.forEach(function (c) { r[c] = ''; });

  r.id = Utilities.getUuid().slice(0, 8);
  r.submitted_at = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss");
  r.lang = pick_(m.lang, ALLOWED.lang) || 'ko';
  r.src = String(m.src || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
  r.device = pick_(m.device, ALLOWED.device);
  r.duration_sec = int_(m.duration_sec, 0, 86400);
  r.client_id = String(m.client_id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);

  r.q1 = pick_(a.q1, ALLOWED.q1);
  r.q1_other = r.q1 === 'ETC' ? text_(a.q1_other, 60) : '';
  r.q2 = pick_(a.q2, ALLOWED.q2);
  r.q2_other = r.q2 === 'other' ? text_(a.q2_other, 60) : '';
  r.q3 = pick_(a.q3, ALLOWED.q3);
  r.q4 = pick_(a.q4, ALLOWED.q4);

  var q5 = uniq_(a.q5, ALLOWED.q5).slice(0, 3);
  r.q5_1 = q5[0] || ''; r.q5_2 = q5[1] || ''; r.q5_3 = q5[2] || '';
  r.q5_other = q5.indexOf('other') >= 0 ? text_(a.q5_other, 60) : '';

  r.q6 = pick_(a.q6, ALLOWED.q6);
  r.q6_other = r.q6 === 'other' ? text_(a.q6_other, 60) : '';

  if (a.q7 === 'none') {
    r.q7 = 'none';
  } else {
    var q7 = uniq_(a.q7, ALLOWED.q7);
    r.q7 = q7.join('|');
    r.q7_other = q7.indexOf('other') >= 0 ? text_(a.q7_other, 60) : '';
    r.q7_why = text_(a.q7_why, 200);
  }

  var q8 = a.q8 || {};
  var q8vals = [];
  ALLOWED.q8.forEach(function (k) {
    var v = int_(q8[k], 1, 5);
    r['q8_' + k] = v;
    q8vals.push(v);
  });

  r.q9 = pick_(a.q9, ALLOWED.q9);
  r.q9_other = r.q9 === 'other' ? text_(a.q9_other, 60) : '';
  r.q9_sure = r.q9 === 'unsure' ? '' : int_(a.q9_sure, 0, 100);
  r.q10 = int_(a.q10, 0, 10);
  r.q10_why = text_(a.q10_why, 200);
  r.nickname = text_(a.nickname, 30);
  r.q11 = text_(a.q11, 300);

  // 필수 문항이 비어 있으면 저장하지 않는다
  var required = ['q1', 'q2', 'q3', 'q4', 'q5_1', 'q6', 'q7', 'q9'];
  for (var i = 0; i < required.length; i++) if (r[required[i]] === '') return null;
  if (r.q10 === '' || q8vals.indexOf('') >= 0) return null;

  var flags = [];
  if (r.duration_sec !== '' && r.duration_sec < FAST_SEC) flags.push('fast');
  if (q8vals.every(function (v) { return v === q8vals[0]; })) flags.push('straight');
  r.flags = flags.join(',');
  return r;
}

function pick_(v, allowed) { v = String(v == null ? '' : v); return allowed.indexOf(v) >= 0 ? v : ''; }
function int_(v, min, max) {
  if (v === '' || v === null || v === undefined) return '';
  var n = Math.round(Number(v));
  return isFinite(n) && n >= min && n <= max ? n : '';
}
function uniq_(arr, allowed) {
  var out = [];
  (Array.isArray(arr) ? arr : []).forEach(function (v) {
    v = String(v);
    if (allowed.indexOf(v) >= 0 && out.indexOf(v) < 0) out.push(v);
  });
  return out;
}
/** 자유 입력: 길이 제한 + 시트 수식으로 해석될 수 있는 첫 글자 제거 */
function text_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').replace(/^[=+\-@\s]+/, '').trim().slice(0, max);
}

function hasClient_(sh, cid) {
  var last = sh.getLastRow();
  if (last < 2) return false;
  var col = COLUMNS.indexOf('client_id') + 1;
  var vals = sh.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === cid) return true;
  return false;
}

/* ───────────── 관리자 ───────────── */

function adminLogin_(req) {
  var cache = CacheService.getScriptCache();
  if (cache.get('lock')) return { ok: false, error: 'locked', minutes: LOCK_MIN };
  var pw = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!pw) return { ok: false, error: 'no_password_set' };
  if (!safeEq_(String(req.password || ''), pw)) {
    var n = Number(cache.get('fails') || 0) + 1;
    if (n >= MAX_FAILS) {
      cache.put('lock', '1', LOCK_MIN * 60);
      cache.remove('fails');
      return { ok: false, error: 'locked', minutes: LOCK_MIN };
    }
    cache.put('fails', String(n), LOCK_MIN * 60);
    return { ok: false, error: 'bad_password', left: MAX_FAILS - n };
  }
  cache.remove('fails');
  var token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('tok_' + token, '1', TOKEN_HOURS * 3600);
  return { ok: true, token: token, hours: TOKEN_HOURS };
}

function safeEq_(a, b) {
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function withAdmin_(req, fn) {
  var token = String(req.token || '');
  if (!token || !CacheService.getScriptCache().get('tok_' + token)) return { ok: false, error: 'auth' };
  return fn(req);
}

function adminList_() {
  var sh = sheet_(SHEET_RESPONSES);
  var last = sh.getLastRow();
  var rows = [];
  if (last >= 2) {
    var vals = sh.getRange(1, 1, last, COLUMNS.length).getValues();
    var head = vals[0].map(String);
    for (var i = 1; i < vals.length; i++) {
      var o = {};
      for (var j = 0; j < head.length; j++) {
        if (head[j] === 'client_id' || !head[j]) continue;
        var v = vals[i][j];
        if (v instanceof Date) v = Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ss");
        o[head[j]] = v;
      }
      if (o.id !== '') rows.push(o);
    }
  }
  return {
    ok: true, rows: rows, open: isOpen_(),
    server_time: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss")
  };
}

function adminExclude_(req) {
  var sh = sheet_(SHEET_RESPONSES);
  var last = sh.getLastRow();
  if (last < 2) return { ok: false, error: 'not_found' };
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  var col = COLUMNS.indexOf('excluded') + 1;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(req.id)) {
      sh.getRange(i + 2, col, 1, 1).setValue(req.excluded ? '1' : '');
      return { ok: true };
    }
  }
  return { ok: false, error: 'not_found' };
}

function adminSetOpen_(req) {
  PropertiesService.getScriptProperties().setProperty('SURVEY_OPEN', req.open ? 'true' : 'false');
  return { ok: true, open: isOpen_() };
}

function isOpen_() {
  return PropertiesService.getScriptProperties().getProperty('SURVEY_OPEN') !== 'false';
}

/* ───────────── 시트 · 백업 · 초기 설정 ───────────── */

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ensureSheet_(ss, name, name === SHEET_RAW ? ['id', 'submitted_at', 'json'] : COLUMNS);
  else if (name === SHEET_RESPONSES) ensureColumns_(sh);
  return sh;
}

/** 새 버전에서 열이 늘었을 때: 기존 시트 맨 뒤에 빠진 열 제목을 붙인다 */
function ensureColumns_(sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol >= COLUMNS.length) return;
  var head = sh.getRange(1, 1, 1, Math.max(lastCol, 1)).getValues()[0].map(String);
  var rows = Math.max(sh.getMaxRows() - 1, 1);
  for (var c = lastCol; c < COLUMNS.length; c++) {
    if (head.indexOf(COLUMNS[c]) >= 0) continue;
    sh.getRange(1, c + 1).setValue(COLUMNS[c]).setFontWeight('bold');
    if (NUMERIC.indexOf(COLUMNS[c]) < 0) sh.getRange(2, c + 1, rows, 1).setNumberFormat('@');
  }
}

function ensureSheet_(ss, name, header) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(header);
    sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    // 숫자 열을 뺀 나머지는 '일반 텍스트'로: 입력값이 날짜·수식으로 바뀌지 않게 한다
    var rows = Math.max(sh.getMaxRows() - 1, 1);
    for (var c = 0; c < header.length; c++) {
      if (NUMERIC.indexOf(header[c]) < 0) sh.getRange(2, c + 1, rows, 1).setNumberFormat('@');
    }
  }
  return sh;
}

function backupNow_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER);
  var name = ss.getName() + '_backup_' + Utilities.formatDate(new Date(), TZ, 'yyyyMMdd_HHmmss');
  DriveApp.getFileById(ss.getId()).makeCopy(name, folder);
  var files = [];
  var fit = folder.getFiles();
  while (fit.hasNext()) files.push(fit.next());
  files.sort(function (x, y) { return y.getDateCreated().getTime() - x.getDateCreated().getTime(); });
  files.slice(BACKUP_KEEP).forEach(function (f) { f.setTrashed(true); });
  return name;
}

/** 시간 기반 트리거가 매일 실행하는 함수 */
function dailyBackup() {
  backupNow_();
}

/** 처음 한 번만 편집기에서 직접 실행: 시트 생성 + 매일 백업 예약 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEET_RESPONSES, COLUMNS);
  ensureSheet_(ss, SHEET_RAW, ['id', 'submitted_at', 'json']);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyBackup') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(3).create();
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SURVEY_OPEN') === null) props.setProperty('SURVEY_OPEN', 'true');
  backupNow_();   // Drive 권한을 지금 승인받고, 첫 백업을 만들어 둔다
  Logger.log(props.getProperty('ADMIN_PASSWORD')
    ? '설정 완료. 관리자 비밀번호가 등록되어 있습니다.'
    : '설정 완료. 단, 스크립트 속성에 ADMIN_PASSWORD가 없습니다. [프로젝트 설정]에서 추가하세요.');
}
