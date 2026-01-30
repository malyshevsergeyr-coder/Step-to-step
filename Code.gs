// ====== CONFIG ======
const SHEET_USERS = 'users';
const SHEET_SESSIONS = 'sessions';
const SESSION_TTL_HOURS = 72; // "запоминать" на 3 суток для пилота
const HASH_ALGO = 'SHA_256';

// ====== ENTRY ======
function doGet() {
  ensureSheets_();
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('Производство — вход')
    
}

// ====== PUBLIC API (called from client) ======
function apiBootstrap(payload) {
  ensureSheets_();
  const token = (payload && payload.token) ? String(payload.token) : '';
  if (!token) return { ok: true, auth: { isAuthed: false } };

  const session = validateSession_(token);
  if (!session) return { ok: true, auth: { isAuthed: false } };

  const user = getUserById_(session.user_id);
  if (!user || String(user.is_active).toUpperCase() !== 'TRUE') return { ok: true, auth: { isAuthed: false } };


  touchSession_(token);
  return {
    ok: true,
    auth: {
      isAuthed: true,
      token,
      user: {
        user_id: user.user_id,
        login: user.login,
        name: user.name,
        role: user.role,
        area: user.area
      }
    }
  };
}

function apiLogin(payload) {
  ensureSheets_();
  const login = payload && payload.login ? String(payload.login).trim() : '';
  const password = payload && payload.password ? String(payload.password) : '';
  if (!login || !password) return { ok: false, error: 'Введите логин и пароль.' };

  const user = getUserByLogin_(login);
  if (!user) return { ok: false, error: 'Неверный логин или пароль.' };
  if (String(user.is_active).toUpperCase() !== 'TRUE') return { ok: false, error: 'Пользователь отключён.' };


  // авто-инициализация пароля из таблицы (для удобства)
  if (!user.password_hash) {
  if (!user.password_plain) {
    return { ok: false, error: 'Пароль не инициализирован.' };
  }
  const newSalt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  const newHash = hashPassword_(user.password_plain, newSalt);
  savePasswordHash_(user.user_id, newHash, newSalt);
  user.password_hash = newHash;
  user.salt = newSalt;
}

// обычная проверка
const computed = hashPassword_(password, user.salt);
if (computed !== user.password_hash) {
  return { ok: false, error: 'Неверный логин или пароль.' };
}

  const token = newToken_();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_HOURS * 3600 * 1000);

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSIONS);
  sh.appendRow([
    token,
    user.user_id,
    iso_(now),
    iso_(expires),
    iso_(now),
    'FALSE'
  ]);

  updateUserLastLogin_(user.user_id);

  return {
    ok: true,
    token,
    user: {
      user_id: user.user_id,
      login: user.login,
      name: user.name,
      role: user.role,
      area: user.area
    }
  };
}

function savePasswordHash_(userId, hash, salt) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_USERS);
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const idx = indexMap_(header);

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idx.user_id]) !== userId) continue;
    sh.getRange(i + 1, idx.password_hash + 1).setValue(hash);
    sh.getRange(i + 1, idx.salt + 1).setValue(salt);
    sh.getRange(i + 1, idx.password_plain + 1).setValue('');
    return;
  }
}

function apiLogout(payload) {
  ensureSheets_();
  const token = payload && payload.token ? String(payload.token) : '';
  if (!token) return { ok: true };

  revokeSession_(token);
  return { ok: true };
}

function apiGetStaff(payload) {
  ensureSheets_();
  const token = payload && payload.token ? String(payload.token) : '';
  if (!token) return { ok: false, error: 'Нет сессии.' };

  const session = validateSession_(token);
  if (!session) return { ok: false, error: 'Сессия недействительна.' };

  const user = getUserById_(session.user_id);
  if (!user || String(user.is_active).toUpperCase() !== 'TRUE') {
    return { ok: false, error: 'Пользователь неактивен.' };
  }

  if (String(user.role || '').trim() !== 'Начальник') {
    return { ok: false, error: 'Недостаточно прав.' };
  }

  const users = getAllUsers_();
  const sessions = getActiveSessionsByUser_();

  const staff = users.map(u => {
    const sessionInfo = sessions[u.user_id] || null;
    return {
      user_id: u.user_id,
      name: u.name,
      area: u.area,
      is_active: sessionInfo ? true : false,
      session_started_at: sessionInfo ? sessionInfo.created_at : '',
      last_login_at: u.last_login_at
    };
  });

  const active = staff
    .filter(s => s.is_active)
    .sort((a, b) => dateValue_(b.session_started_at) - dateValue_(a.session_started_at));
  const inactive = staff
    .filter(s => !s.is_active)
    .sort((a, b) => dateValue_(b.last_login_at) - dateValue_(a.last_login_at));

  return { ok: true, active, inactive };
}

// ====== ADMIN HELPERS (run manually from Script Editor) ======
function adminCreateUser(login, password, name, role, area) {
  ensureSheets_();

  const cleanLogin = String(login || '').trim();
  const cleanPass = String(password || '');
  if (!cleanLogin || !cleanPass) throw new Error('login/password обязательны');

  const existing = getUserByLogin_(cleanLogin);
  if (existing) throw new Error('Такой login уже существует');

  const userId = 'U' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  const salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  const hash = hashPassword_(cleanPass, salt);
  const now = new Date();

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_USERS);
  sh.appendRow([
    userId,
    cleanLogin,
    hash,
    salt,
    String(name || ''),
    String(role || ''),
    String(area || ''),
    'TRUE',
    iso_(now),
    ''
  ]);

  return { ok: true, user_id: userId };
}

function adminDisableUser(login) {
  ensureSheets_();
  const user = getUserByLogin_(String(login || '').trim());
  if (!user) throw new Error('Пользователь не найден');
  setUserActive_(user.user_id, false);
  revokeAllUserSessions_(user.user_id);
  return { ok: true };
}

function adminEnableUser(login) {
  ensureSheets_();
  const user = getUserByLogin_(String(login || '').trim());
  if (!user) throw new Error('Пользователь не найден');
  setUserActive_(user.user_id, true);
  return { ok: true };
}

// ====== INTERNALS ======
function ensureSheets_() {
  const ss = SpreadsheetApp.getActive();

  let shU = ss.getSheetByName(SHEET_USERS);
  if (!shU) shU = ss.insertSheet(SHEET_USERS);
  let shS = ss.getSheetByName(SHEET_SESSIONS);
  if (!shS) shS = ss.insertSheet(SHEET_SESSIONS);

  if (shU.getLastRow() === 0) {
    shU.appendRow([
      'user_id','login','password_hash','salt','name','role','area','is_active','created_at','last_login_at'
    ]);
  }
  if (shS.getLastRow() === 0) {
    shS.appendRow([
      'token','user_id','created_at','expires_at','last_seen_at','revoked'
    ]);
  }
}

function getUserByLogin_(login) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_USERS);
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const idx = indexMap_(header);

  const target = String(login || '').trim();
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowLogin = String(row[idx['login']] || '').trim();
    if (rowLogin === target) return rowToUser_(row, idx);
  }
  return null;
}

function getUserById_(userId) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_USERS);
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const idx = indexMap_(header);

  const target = String(userId || '').trim();
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowId = String(row[idx['user_id']] || '').trim();
    if (rowId === target) return rowToUser_(row, idx);
  }
  return null;
}

function rowToUser_(row, idx) {
  return {
    user_id: String(row[idx['user_id']] || ''),
    login: String(row[idx['login']] || ''),
    password_plain: String(row[idx['password_plain']] || ''),
    password_hash: String(row[idx['password_hash']] || ''),
    salt: String(row[idx['salt']] || ''),
    name: String(row[idx['name']] || ''),
    role: String(row[idx['role']] || ''),
    area: String(row[idx['area']] || ''),
    is_active: String(row[idx['is_active']] || ''),
    created_at: String(row[idx['created_at']] || ''),
    last_login_at: String(row[idx['last_login_at']] || '')
  };
}

function getAllUsers_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_USERS);
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const idx = indexMap_(header);
  const users = [];

  for (let i = 1; i < values.length; i++) {
    users.push(rowToUser_(values[i], idx));
  }
  return users;
}

function getActiveSessionsByUser_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSIONS);
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const idx = indexMap_(header);
  const now = new Date();
  const map = {};

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const revoked = String(row[idx.revoked]) === 'TRUE';
    if (revoked) continue;

    const expiresAt = new Date(String(row[idx.expires_at]));
    if (!(expiresAt instanceof Date) || isNaN(expiresAt.getTime())) continue;
    if (expiresAt.getTime() <= now.getTime()) continue;

    const userId = String(row[idx.user_id]);
    const createdAt = String(row[idx.created_at]);
    const existing = map[userId];
    if (!existing || dateValue_(createdAt) > dateValue_(existing.created_at)) {
      map[userId] = { created_at: createdAt };
    }
  }

  return map;
}

function dateValue_(value) {
  if (!value) return 0;
  const date = new Date(String(value));
  if (!(date instanceof Date) || isNaN(date.getTime())) return 0;
  return date.getTime();
}


function indexMap_(headerRow) {
  const map = {};
  headerRow.forEach((h, i) => {
    const key = String(h || '')
      .replace(/\u00A0/g, ' ')     // убираем неразрывные пробелы
      .trim()
      .toLowerCase();
    if (key) map[key] = i;
  });

  // алиасы на случай "человеческих" названий
  if (map['active'] != null && map['is_active'] == null) map['is_active'] = map['active'];
  if (map['активен'] != null && map['is_active'] == null) map['is_active'] = map['активен'];
  if (map['активность'] != null && map['is_active'] == null) map['is_active'] = map['активность'];

  return map;
}


function hashPassword_(password, salt) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm[HASH_ALGO],
    salt + '|' + password,
    Utilities.Charset.UTF_8
  );
  return bytesToHex_(bytes);
}

function bytesToHex_(bytes) {
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function newToken_() {
  // UUID + timestamp mix
  return Utilities.getUuid().replace(/-/g, '') + '_' + Date.now().toString(36);
}

function iso_(d) {
  return Utilities.formatDate(d, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
}

function validateSession_(token) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSIONS);
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const idx = indexMap_(header);

  const now = new Date();
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (String(row[idx.token]) !== token) continue;

    const revoked = String(row[idx.revoked]) === 'TRUE';
    if (revoked) return null;

    const expiresAt = new Date(String(row[idx.expires_at]));
    if (!(expiresAt instanceof Date) || isNaN(expiresAt.getTime())) return null;
    if (expiresAt.getTime() <= now.getTime()) return null;

    return {
      rowIndex: i + 1,
      user_id: String(row[idx.user_id]),
      expires_at: expiresAt
    };
  }
  return null;
}

function touchSession_(token) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSIONS);
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const idx = indexMap_(header);
  const now = new Date();

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (String(row[idx.token]) !== token) continue;
    sh.getRange(i + 1, idx.last_seen_at + 1).setValue(iso_(now));
    return;
  }
}

function revokeSession_(token) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSIONS);
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const idx = indexMap_(header);

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idx.token]) !== token) continue;
    sh.getRange(i + 1, idx.revoked + 1).setValue('TRUE');
    return;
  }
}

function revokeAllUserSessions_(userId) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_SESSIONS);
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const idx = indexMap_(header);

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idx.user_id]) !== userId) continue;
    sh.getRange(i + 1, idx.revoked + 1).setValue('TRUE');
  }
}

function setUserActive_(userId, isActive) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_USERS);
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const idx = indexMap_(header);

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idx.user_id]) !== userId) continue;
    sh.getRange(i + 1, idx.is_active + 1).setValue(isActive ? 'TRUE' : 'FALSE');
    return;
  }
}

function updateUserLastLogin_(userId) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_USERS);
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const idx = indexMap_(header);
  const now = new Date();

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idx.user_id]) !== userId) continue;
    sh.getRange(i + 1, idx.last_login_at + 1).setValue(iso_(now));
    return;
  }
}

function adminDebugUser(login) {
  ensureSheets_();
  const u = getUserByLogin_(String(login || '').trim());
  Logger.log('USER=' + JSON.stringify(u, null, 2));

  const sh = SpreadsheetApp.getActive().getSheetByName('users');
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  Logger.log('HEADER=' + JSON.stringify(header));

  return u;
}

function adminAuthDebug(login, password) {
  ensureSheets_();
  const u = getUserByLogin_(String(login || '').trim());
  if (!u) {
    Logger.log('USER NOT FOUND');
    return null;
  }

  Logger.log('USER=' + JSON.stringify({
    user_id: u.user_id,
    login: u.login,
    is_active: u.is_active,
    has_plain: !!u.password_plain,
    hash_len: (u.password_hash || '').length,
    salt_len: (u.salt || '').length
  }));

  // что получится, если посчитать хэш от введённого пароля
  const computed = (u.salt ? hashPassword_(String(password || ''), u.salt) : '');
  Logger.log('COMPUTED=' + computed);
  Logger.log('STORED  =' + (u.password_hash || ''));

  return { computed, stored: u.password_hash || '', salt: u.salt || '' };
}

function exportSchemaToMarkdown() {
  const ss = SpreadsheetApp.getActive();
  const sheets = ss.getSheets();

  let md = '';
  md += '# 📊 Структура данных (Google Sheets)\n\n';
  md += `Источник: **${ss.getName()}**\n\n`;
  md += `Дата генерации: ${new Date().toISOString()}\n\n`;
  md += '---\n\n';

  sheets.forEach(sheet => {
    const name = sheet.getName();
    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) return;

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    md += `## Лист: \`${name}\`\n\n`;
    md += '| № | Колонка |\n';
    md += '|---|--------|\n';

    headers.forEach((h, i) => {
      const colName = String(h || '').trim();
      if (!colName) return;
      md += `| ${i + 1} | \`${colName}\` |\n`;
    });

    md += '\n';
  });

  // создаём файл .md на Google Drive
  const fileName = `schema_${ss.getName().replace(/\s+/g, '_')}.md`;
  const file = DriveApp.createFile(fileName, md, MimeType.PLAIN_TEXT);

  Logger.log('Markdown schema created: ' + file.getUrl());
  return file.getUrl();
}
