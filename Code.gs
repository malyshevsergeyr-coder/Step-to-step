// ====== CONFIG ======
const SHEET_USERS = 'users';
const SHEET_SESSIONS = 'sessions';
const SHEET_CUTTING_ORDERS = 'cutting_orders';
const SHEET_NOTIFICATIONS = 'notifications';
const SHEET_CHAT_MESSAGES = 'chat_messages';
const CHAT_UPLOADS_FOLDER = 'chat_uploads';
const CHAT_MAX_FILE_SIZE = 10 * 1024 * 1024;
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
  const auth = requireSession_(token);
  if (!auth.ok) return auth;
  if (!hasRole_(auth.user.role, 'Начальник')) {
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

function apiCreateCuttingOrder(payload) {
  ensureSheets_();
  const token = payload && payload.token ? String(payload.token) : '';
  const auth = requireSession_(token);
  if (!auth.ok) return auth;
  if (!hasRole_(auth.user.role, 'Администратор')) {
    return { ok: false, error: 'Недостаточно прав.' };
  }

  const data = payload && payload.data ? payload.data : {};
  const required = [
    'menu_title', 'id_product', 'direction', 'process', 'width_mm', 'height_mm',
    'quantity', 'formula', 'print', 'sticker', 'manual', 'allowance_mm'
  ];
  for (let i = 0; i < required.length; i++) {
    const key = required[i];
    const value = data[key];
    if (value === null || value === undefined || String(value).trim() === '') {
      return { ok: false, error: 'Заполните все поля перед отправкой.' };
    }
  }

  const now = new Date();
  const orderId = 'CO' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CUTTING_ORDERS);
  sh.appendRow([
    orderId,
    iso_(now),
    auth.user.user_id,
    auth.user.name,
    String(data.menu_title),
    'Создана',
    String(data.id_product),
    String(data.direction),
    String(data.process),
    formatNumber_(data.width_mm),
    formatNumber_(data.height_mm),
    formatNumber_(data.quantity),
    String(data.formula),
    String(data.print),
    String(data.sticker),
    String(data.manual),
    formatNumber_(data.allowance_mm),
    iso_(now),
    auth.user.user_id
  ]);

  notifyBosses_({
    title: 'Новая заявка на раскрой',
    message: `Создана заявка "${data.menu_title}" от ${auth.user.name || 'Администратор'}.`,
    related_order_id: orderId
  });

  return { ok: true, order_id: orderId };
}

function apiGetNotifications(payload) {
  ensureSheets_();
  const token = payload && payload.token ? String(payload.token) : '';
  const auth = requireSession_(token);
  if (!auth.ok) return auth;
  if (!hasRole_(auth.user.role, 'Начальник')) {
    return { ok: false, error: 'Недостаточно прав.' };
  }

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NOTIFICATIONS);
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const idx = indexMap_(header);
  const list = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (String(row[idx.deleted]) === 'TRUE') continue;
    if (String(row[idx.to_user_id]) !== auth.user.user_id) continue;
    list.push({
      notification_id: String(row[idx.notification_id] || ''),
      title: String(row[idx.title] || ''),
      message: String(row[idx.message] || ''),
      related_order_id: String(row[idx.related_order_id] || ''),
      created_at: String(row[idx.created_at] || ''),
      read_at: String(row[idx.read_at] || '')
    });
  }

  list.sort((a, b) => dateValue_(b.created_at) - dateValue_(a.created_at));
  return { ok: true, list };
}

function apiDeleteNotification(payload) {
  ensureSheets_();
  const token = payload && payload.token ? String(payload.token) : '';
  const auth = requireSession_(token);
  if (!auth.ok) return auth;
  if (!hasRole_(auth.user.role, 'Начальник')) {
    return { ok: false, error: 'Недостаточно прав.' };
  }

  const notificationId = payload && payload.notification_id ? String(payload.notification_id) : '';
  if (!notificationId) return { ok: false, error: 'Не указан идентификатор уведомления.' };
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NOTIFICATIONS);
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const idx = indexMap_(header);
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (String(row[idx.notification_id]) !== notificationId) continue;
    if (String(row[idx.to_user_id]) !== auth.user.user_id) continue;
    sh.getRange(i + 1, idx.deleted + 1).setValue('TRUE');
    return { ok: true };
  }
  return { ok: false, error: 'Уведомление не найдено.' };
}

function apiGetChatUsers(payload) {
  ensureSheets_();
  const token = payload && payload.token ? String(payload.token) : '';
  const auth = requireSession_(token);
  if (!auth.ok) return auth;

  const users = getAllUsers_();
  const sessions = getActiveSessionsByUser_();
  const now = new Date().getTime();
  const onlineThreshold = 5 * 60 * 1000;

  const list = users
    .filter(u => String(u.is_active).toUpperCase() === 'TRUE')
    .map(u => {
      const sessionInfo = sessions[u.user_id] || null;
      const lastSeenAt = sessionInfo ? sessionInfo.last_seen_at : '';
      const isOnline = sessionInfo && (now - dateValue_(lastSeenAt) <= onlineThreshold);
      return {
        user_id: u.user_id,
        name: u.name,
        role: u.role,
        is_online: isOnline,
        last_seen_at: lastSeenAt
      };
    });

  return { ok: true, list };
}

function apiGetChatThread(payload) {
  ensureSheets_();
  const token = payload && payload.token ? String(payload.token) : '';
  const auth = requireSession_(token);
  if (!auth.ok) return auth;
  const otherUserId = payload && payload.other_user_id ? String(payload.other_user_id) : '';
  if (!otherUserId) return { ok: false, error: 'Не выбран пользователь.' };

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CHAT_MESSAGES);
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const idx = indexMap_(header);
  const threadKey = threadKey_(auth.user.user_id, otherUserId);
  const list = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (String(row[idx.thread_key]) !== threadKey) continue;
    if (String(row[idx.deleted]) === 'TRUE') continue;
    list.push({
      message_id: String(row[idx.message_id] || ''),
      from_user_id: String(row[idx.from_user_id] || ''),
      to_user_id: String(row[idx.to_user_id] || ''),
      text: String(row[idx.text] || ''),
      attachment_url: String(row[idx.attachment_url] || ''),
      attachment_name: String(row[idx.attachment_name] || ''),
      attachment_type: String(row[idx.attachment_type] || ''),
      created_at: String(row[idx.created_at] || ''),
      read_at: String(row[idx.read_at] || '')
    });
  }

  list.sort((a, b) => dateValue_(a.created_at) - dateValue_(b.created_at));
  return { ok: true, list };
}

function apiMarkChatRead(payload) {
  ensureSheets_();
  const token = payload && payload.token ? String(payload.token) : '';
  const auth = requireSession_(token);
  if (!auth.ok) return auth;
  const otherUserId = payload && payload.other_user_id ? String(payload.other_user_id) : '';
  if (!otherUserId) return { ok: false, error: 'Не выбран пользователь.' };

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CHAT_MESSAGES);
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const idx = indexMap_(header);
  const threadKey = threadKey_(auth.user.user_id, otherUserId);
  const now = new Date();
  let updated = 0;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (String(row[idx.thread_key]) !== threadKey) continue;
    if (String(row[idx.to_user_id]) !== auth.user.user_id) continue;
    if (String(row[idx.read_at])) continue;
    sh.getRange(i + 1, idx.read_at + 1).setValue(iso_(now));
    updated++;
  }

  return { ok: true, updated };
}

function apiGetChatUnreadCount(payload) {
  ensureSheets_();
  const token = payload && payload.token ? String(payload.token) : '';
  const auth = requireSession_(token);
  if (!auth.ok) return auth;

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CHAT_MESSAGES);
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const idx = indexMap_(header);
  let count = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (String(row[idx.deleted]) === 'TRUE') continue;
    if (String(row[idx.to_user_id]) !== auth.user.user_id) continue;
    if (String(row[idx.read_at])) continue;
    count++;
  }
  return { ok: true, count };
}

function apiSendChatMessage(payload) {
  ensureSheets_();
  const token = payload && payload.token ? String(payload.token) : '';
  const auth = requireSession_(token);
  if (!auth.ok) return auth;

  const toUserId = payload && payload.to_user_id ? String(payload.to_user_id) : '';
  if (!toUserId) return { ok: false, error: 'Не выбран получатель.' };

  const text = payload && payload.text ? String(payload.text) : '';
  const attachment = payload && payload.attachment ? payload.attachment : null;
  if (!text && !attachment) return { ok: false, error: 'Введите сообщение или прикрепите файл.' };

  let attachmentUrl = '';
  let attachmentName = '';
  let attachmentType = '';
  if (attachment) {
    const size = Number(attachment.size || 0);
    if (size > CHAT_MAX_FILE_SIZE) return { ok: false, error: 'Файл превышает 10 МБ.' };
    const content = attachment.content || '';
    if (!content) return { ok: false, error: 'Не удалось прочитать файл.' };
    const blob = Utilities.newBlob(Utilities.base64Decode(content), attachment.type || 'application/octet-stream', attachment.name || 'upload');
    const folder = getOrCreateFolder_(CHAT_UPLOADS_FOLDER);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    attachmentUrl = `https://drive.google.com/uc?export=view&id=${file.getId()}`;
    attachmentName = attachment.name || '';
    attachmentType = attachment.type || '';
  }

  const now = new Date();
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CHAT_MESSAGES);
  const messageId = 'MSG' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  sh.appendRow([
    messageId,
    threadKey_(auth.user.user_id, toUserId),
    auth.user.user_id,
    toUserId,
    text,
    attachmentUrl,
    attachmentName,
    attachmentType,
    iso_(now),
    '',
    'FALSE'
  ]);

  return { ok: true, message_id: messageId };
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
  let shC = ss.getSheetByName(SHEET_CUTTING_ORDERS);
  if (!shC) shC = ss.insertSheet(SHEET_CUTTING_ORDERS);
  let shN = ss.getSheetByName(SHEET_NOTIFICATIONS);
  if (!shN) shN = ss.insertSheet(SHEET_NOTIFICATIONS);
  let shChat = ss.getSheetByName(SHEET_CHAT_MESSAGES);
  if (!shChat) shChat = ss.insertSheet(SHEET_CHAT_MESSAGES);

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
  if (shC.getLastRow() === 0) {
    shC.appendRow([
      'order_id','created_at','created_by_user_id','created_by_name','menu_title','status',
      'id_product','direction','process','width_mm','height_mm','quantity','formula','print',
      'sticker','manual','allowance_mm','updated_at','updated_by_user_id'
    ]);
  }
  if (shN.getLastRow() === 0) {
    shN.appendRow([
      'notification_id','to_user_id','to_role','title','message','related_order_id',
      'created_at','read_at','deleted'
    ]);
  }
  if (shChat.getLastRow() === 0) {
    shChat.appendRow([
      'message_id','thread_key','from_user_id','to_user_id','text',
      'attachment_url','attachment_name','attachment_type','created_at','read_at','deleted'
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
    const lastSeenAt = String(row[idx.last_seen_at]);
    const existing = map[userId];
    if (!existing || dateValue_(createdAt) > dateValue_(existing.created_at)) {
      map[userId] = { created_at: createdAt, last_seen_at: lastSeenAt };
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

function saveChatAttachment_(attachment) {
  const data = String(attachment.data || '');
  if (!data) return '';

  const parsed = parseDataUrl_(data);
  if (!parsed || !parsed.bytes) return '';

  const folder = getOrCreateFolder_(CHAT_UPLOADS_FOLDER);
  const name = attachment.name ? String(attachment.name) : ('chat_' + Date.now() + '.bin');
  const type = attachment.type ? String(attachment.type) : parsed.mimeType || 'application/octet-stream';
  const blob = Utilities.newBlob(parsed.bytes, type, name);
  const file = folder.createFile(blob);
  return file.getUrl();
}

function parseDataUrl_(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const mimeType = match[1];
  const bytes = Utilities.base64Decode(match[2]);
  return { mimeType, bytes };
}

function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
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

function requireSession_(token) {
  if (!token) return { ok: false, error: 'Нет сессии.' };
  const session = validateSession_(token);
  if (!session) return { ok: false, error: 'Сессия недействительна.' };
  const user = getUserById_(session.user_id);
  if (!user || String(user.is_active).toUpperCase() !== 'TRUE') {
    return { ok: false, error: 'Пользователь неактивен.' };
  }
  touchSession_(token);
  return { ok: true, session, user };
}

function hasRole_(roles, targetRole) {
  if (!roles) return false;
  const list = String(roles)
    .split(',')
    .map(r => String(r).trim().toLowerCase())
    .filter(Boolean);
  return list.indexOf(String(targetRole || '').trim().toLowerCase()) >= 0;
}

function notifyBosses_(payload) {
  const bosses = getUsersByRole_('Начальник');
  if (!bosses.length) return;
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NOTIFICATIONS);
  const now = new Date();
  bosses.forEach(boss => {
    const notificationId = 'NT' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    sh.appendRow([
      notificationId,
      boss.user_id,
      'Начальник',
      String(payload.title || ''),
      String(payload.message || ''),
      String(payload.related_order_id || ''),
      iso_(now),
      '',
      'FALSE'
    ]);
  });
}

function getUsersByRole_(roleName) {
  const users = getAllUsers_();
  return users.filter(u => hasRole_(u.role, roleName) && String(u.is_active).toUpperCase() === 'TRUE');
}

function threadKey_(a, b) {
  const first = String(a || '');
  const second = String(b || '');
  return [first, second].sort().join('__');
}

function formatNumber_(value) {
  const num = Number(String(value).replace(',', '.'));
  if (Number.isNaN(num)) return '';
  return num.toFixed(2);
}

function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
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
