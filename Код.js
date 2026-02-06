// ====== ТАБЕЛЬ РАБОЧЕГО ВРЕМЕНИ (Gate/SoftGate) ======
// Проект: Посещаемость
// Таблица: https://docs.google.com/spreadsheets/d/1yF9iuHcFaTyJ2X6PntO7661HFukmSgQWydhZsukHsC8

const TIMESHEET_SPREADSHEET_ID = '1yF9iuHcFaTyJ2X6PntO7661HFukmSgQWydhZsukHsC8';
const SHEET_GATE_RAW = 'Sheet1';       // Сырые данные из Gate
const SHEET_GATE_EVENTS = 'gate_events'; // Плоская таблица событий
const SHEET_TABEL = 'табель';           // Сводный табель
const GATE_FOLDER_NAME = 'Отчёты Gate'; // Папка для загрузки файлов из Gate
const GATE_PROCESSED_PREFIX = '[Обработан] '; // Префикс для обработанных файлов

/**
 * Открыть spreadsheet табеля
 */
function getTimesheetSS_() {
  return SpreadsheetApp.openById(TIMESHEET_SPREADSHEET_ID);
}

/**
 * Найти папку "Отчёты Gate" на Google Drive
 */
function getGateFolder_() {
  var folders = DriveApp.getFoldersByName(GATE_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  // Если папки нет — создаём
  return DriveApp.createFolder(GATE_FOLDER_NAME);
}

/**
 * Найти новые (необработанные) файлы в папке Gate
 * Ищем Excel файлы (.xlsx, .xls) которые не начинаются с [Обработан]
 */
function findNewGateFiles_() {
  var folder = getGateFolder_();
  var files = folder.getFiles();
  var newFiles = [];

  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName();

    // Пропускаем уже обработанные
    if (name.indexOf(GATE_PROCESSED_PREFIX) === 0) continue;

    // Ищем Excel файлы или Google Sheets
    var mimeType = file.getMimeType();
    if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || // xlsx
        mimeType === 'application/vnd.ms-excel' || // xls
        mimeType === 'application/vnd.google-apps.spreadsheet') { // Google Sheets
      newFiles.push(file);
    }
  }

  return newFiles;
}

/**
 * Импортировать данные из Excel файла в лист Sheet1 таблицы табеля
 */
function importGateFile_(file) {
  var ss = getTimesheetSS_();
  var rawSh = ss.getSheetByName(SHEET_GATE_RAW);

  if (!rawSh) {
    throw new Error('Лист ' + SHEET_GATE_RAW + ' не найден');
  }

  var mimeType = file.getMimeType();
  var data;

  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    // Уже Google Sheets — просто читаем
    var srcSS = SpreadsheetApp.openById(file.getId());
    var srcSheet = srcSS.getSheets()[0]; // Первый лист
    data = srcSheet.getDataRange().getValues();
  } else {
    // Excel файл — конвертируем в Google Sheets
    var blob = file.getBlob();
    var resource = {
      title: file.getName() + '_temp',
      mimeType: MimeType.GOOGLE_SHEETS
    };

    // Создаём временный Google Sheets из Excel
    var tempFile = Drive.Files.insert(resource, blob, {convert: true});
    var tempSS = SpreadsheetApp.openById(tempFile.id);
    var tempSheet = tempSS.getSheets()[0];
    data = tempSheet.getDataRange().getValues();

    // Удаляем временный файл
    DriveApp.getFileById(tempFile.id).setTrashed(true);
  }

  // Очищаем Sheet1 и вставляем новые данные
  rawSh.clearContents();
  if (data.length > 0 && data[0].length > 0) {
    rawSh.getRange(1, 1, data.length, data[0].length).setValues(data);
  }

  return data.length;
}

/**
 * Пометить файл как обработанный (добавить префикс)
 */
function markFileProcessed_(file) {
  var oldName = file.getName();
  if (oldName.indexOf(GATE_PROCESSED_PREFIX) !== 0) {
    file.setName(GATE_PROCESSED_PREFIX + oldName);
  }
}

/**
 * ГЛАВНАЯ ФУНКЦИЯ: Обработать новые файлы из папки Gate
 * Вызывать вручную или по расписанию
 */
function processNewGateFiles() {
  var newFiles = findNewGateFiles_();

  if (newFiles.length === 0) {
    Logger.log('Новых файлов не найдено в папке "' + GATE_FOLDER_NAME + '"');
    return {
      ok: true,
      message: 'Новых файлов не найдено',
      processed: 0,
      folder: GATE_FOLDER_NAME
    };
  }

  var results = [];

  for (var i = 0; i < newFiles.length; i++) {
    var file = newFiles[i];
    var fileName = file.getName();

    try {
      Logger.log('Обработка файла: ' + fileName);

      // 1. Импортируем данные
      var rowsImported = importGateFile_(file);
      Logger.log('Импортировано строк: ' + rowsImported);

      // 2. Парсим данные
      var parseResult = parseGateData();
      if (!parseResult.ok) {
        throw new Error(parseResult.error);
      }
      Logger.log('Распарсено событий: ' + parseResult.events_count);

      // 3. Строим табель
      var buildResult = buildTimesheet();
      if (!buildResult.ok) {
        throw new Error(buildResult.error);
      }
      Logger.log('Табель построен: ' + buildResult.employees + ' сотрудников');

      // 4. Форматируем таблицы
      formatTimesheetTables();

      // 5. Помечаем файл как обработанный
      markFileProcessed_(file);

      results.push({
        file: fileName,
        ok: true,
        rows: rowsImported,
        events: parseResult.events_count,
        employees: buildResult.employees
      });

    } catch (e) {
      Logger.log('Ошибка при обработке ' + fileName + ': ' + e.message);
      results.push({
        file: fileName,
        ok: false,
        error: e.message
      });
    }
  }

  return {
    ok: true,
    processed: results.filter(function(r) { return r.ok; }).length,
    failed: results.filter(function(r) { return !r.ok; }).length,
    results: results
  };
}

/**
 * Парсинг сырых данных Gate в плоскую таблицу событий
 * Запускать вручную или по кнопке
 */
function parseGateData() {
  var ss = getTimesheetSS_();
  var rawSh = ss.getSheetByName(SHEET_GATE_RAW);
  var eventsSh = ss.getSheetByName(SHEET_GATE_EVENTS);

  if (!rawSh) {
    Logger.log('Лист ' + SHEET_GATE_RAW + ' не найден');
    return { ok: false, error: 'Лист сырых данных не найден' };
  }
  if (!eventsSh) {
    Logger.log('Лист ' + SHEET_GATE_EVENTS + ' не найден');
    return { ok: false, error: 'Лист событий не найден' };
  }

  var rawData = rawSh.getDataRange().getValues();
  var events = [];

  var currentFio = '';
  var currentKey = '';
  var i = 0;

  while (i < rawData.length) {
    var row = rawData[i];

    // Проверяем, это строка с ФИО? (колонка D = "Номер ключа:")
    if (row[3] === 'Номер ключа:') {
      currentFio = String(row[0] || '').trim();
      currentKey = String(row[4] || '').trim();
      i++;
      continue;
    }

    // Пропускаем заголовок и пустые строки
    if (!row[0] && !row[3]) {
      i++;
      continue;
    }
    if (row[0] === 'Устройство входа') {
      i++;
      continue;
    }
    if (row[4] === 'Всего времени:') {
      i++;
      continue;
    }
    if (row[4] === 'Страница') {
      i++;
      continue;
    }

    // Это строка с событием
    var entryDevice = String(row[0] || '').trim();
    var entryDate = String(row[1] || '').trim();
    var entryTime = String(row[2] || '').trim();
    var exitDevice = String(row[3] || '').trim();
    var exitDate = String(row[4] || '').trim();
    var exitTime = String(row[5] || '').trim();
    var duration = String(row[6] || '').trim();

    // Парсим событие
    if (entryDevice && entryDate && entryTime && exitDevice && exitDate && exitTime) {
      // Полная пара вход-выход
      var minutes = parseGateDuration_(duration);
      events.push({
        fio: currentFio,
        key: currentKey,
        date: entryDate,
        entry_time: entryTime,
        exit_time: exitTime,
        minutes: minutes,
        hours: formatHoursMinutes_(minutes),
        type: 'полный'
      });
    } else if (entryDevice && entryDate && entryTime && !exitDevice) {
      // Только вход (ещё не ушёл)
      events.push({
        fio: currentFio,
        key: currentKey,
        date: entryDate,
        entry_time: entryTime,
        exit_time: '',
        minutes: 0,
        hours: '',
        type: 'вход'
      });
    } else if (!entryDevice && exitDevice && exitDate && exitTime) {
      // Только выход (вход был вчера или не зафиксирован)
      events.push({
        fio: currentFio,
        key: currentKey,
        date: exitDate,
        entry_time: '',
        exit_time: exitTime,
        minutes: 0,
        hours: '',
        type: 'выход'
      });
    }

    i++;
  }

  // Очистить старые данные в gate_events (кроме заголовка)
  if (eventsSh.getLastRow() > 1) {
    eventsSh.getRange(2, 1, eventsSh.getLastRow() - 1, 8).clearContent();
  }

  // Записать события
  if (events.length > 0) {
    var rows = events.map(function(e) {
      return [e.fio, e.key, e.date, e.entry_time, e.exit_time, e.minutes, e.hours, e.type];
    });
    eventsSh.getRange(2, 1, rows.length, 8).setValues(rows);
  }

  Logger.log('Распарсено событий: ' + events.length);
  return { ok: true, events_count: events.length };
}

/**
 * Парсинг длительности "H:MM" в минуты
 */
function parseGateDuration_(str) {
  if (!str) return 0;
  var parts = String(str).split(':');
  if (parts.length !== 2) return 0;
  var hours = parseInt(parts[0], 10) || 0;
  var mins = parseInt(parts[1], 10) || 0;
  return hours * 60 + mins;
}

/**
 * Форматирование минут в "H:MM"
 */
function formatHoursMinutes_(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return '';
  var h = Math.floor(totalMinutes / 60);
  var m = totalMinutes % 60;
  return h + ':' + (m < 10 ? '0' : '') + m;
}

/**
 * Парсинг даты "DD.MM.YYYY" в Date
 */
function parseGateDate_(str) {
  if (!str) return null;
  var parts = String(str).split('.');
  if (parts.length !== 3) return null;
  var day = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10) - 1;
  var year = parseInt(parts[2], 10);
  return new Date(year, month, day);
}

/**
 * Нормализация даты в строку DD.MM.YYYY
 * (Google Sheets может вернуть Date объект или строку)
 */
function normalizeDateStr_(val) {
  if (!val) return '';
  // Если это Date объект
  if (val instanceof Date || (typeof val === 'object' && val.getTime)) {
    var d = val.getDate();
    var m = val.getMonth() + 1;
    var y = val.getFullYear();
    return (d < 10 ? '0' : '') + d + '.' + (m < 10 ? '0' : '') + m + '.' + y;
  }
  // Если строка содержит Date-представление (Mon Feb 03 2026...)
  var str = String(val);
  if (str.match(/^[A-Z][a-z]{2}\s/)) {
    var dt = new Date(str);
    if (!isNaN(dt.getTime())) {
      var d = dt.getDate();
      var m = dt.getMonth() + 1;
      var y = dt.getFullYear();
      return (d < 10 ? '0' : '') + d + '.' + (m < 10 ? '0' : '') + m + '.' + y;
    }
  }
  return str.trim();
}

/**
 * Вспомогательная функция для маппинга заголовков
 */
function indexMap_(headerRow) {
  var map = {};
  headerRow.forEach(function(h, i) {
    var key = String(h || '')
      .replace(/\u00A0/g, ' ')
      .trim()
      .toLowerCase();
    if (key) map[key] = i;
  });
  return map;
}

/**
 * Построение сводного табеля (ФИО × Дни месяца)
 */
function buildTimesheet() {
  var ss = getTimesheetSS_();
  var eventsSh = ss.getSheetByName(SHEET_GATE_EVENTS);
  var tabelSh = ss.getSheetByName(SHEET_TABEL);

  if (!eventsSh || eventsSh.getLastRow() <= 1) {
    return { ok: false, error: 'Нет данных в gate_events. Сначала запустите parseGateData()' };
  }

  // Читаем события
  var eventsData = eventsSh.getDataRange().getValues();
  var header = eventsData[0];
  var idx = indexMap_(header);

  // Собираем данные по сотрудникам и датам
  var fioSet = {};
  var dateSet = {};
  var dataMap = {}; // fio -> date -> {totalMinutes, entries: [...]}

  for (var i = 1; i < eventsData.length; i++) {
    var row = eventsData[i];
    var fio = String(row[idx.фио] || row[0] || '').trim();
    var dateStr = normalizeDateStr_(row[idx.дата] || row[2] || '');
    var minutes = Number(row[idx.минут] || row[5] || 0);
    var entryTime = String(row[idx['время входа']] || row[3] || '').trim();
    var exitTime = String(row[idx['время выхода']] || row[4] || '').trim();
    var type = String(row[idx.тип] || row[7] || '').trim();

    if (!fio || !dateStr) continue;

    fioSet[fio] = true;
    dateSet[dateStr] = true;

    if (!dataMap[fio]) dataMap[fio] = {};
    if (!dataMap[fio][dateStr]) {
      dataMap[fio][dateStr] = { totalMinutes: 0, entries: [] };
    }

    dataMap[fio][dateStr].totalMinutes += minutes;
    dataMap[fio][dateStr].entries.push({
      entry: entryTime,
      exit: exitTime,
      minutes: minutes,
      type: type
    });
  }

  // Сортируем ФИО и даты
  var fioList = Object.keys(fioSet).sort();
  var dateList = Object.keys(dateSet).sort(function(a, b) {
    var da = parseGateDate_(a);
    var db = parseGateDate_(b);
    return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
  });

  // Формируем заголовок табеля: ФИО | Дата1 | Дата2 | ... | ИТОГО
  var tabelHeader = ['ФИО'];
  dateList.forEach(function(d) {
    // Выводим только день (без года)
    var parts = d.split('.');
    tabelHeader.push(parts[0] + '.' + parts[1]);
  });
  tabelHeader.push('ИТОГО');

  // Формируем строки табеля
  var tabelRows = [tabelHeader];

  fioList.forEach(function(fio) {
    var row = [fio];
    var totalForFio = 0;

    dateList.forEach(function(dateStr) {
      var cell = dataMap[fio] && dataMap[fio][dateStr];
      if (cell && cell.totalMinutes > 0) {
        row.push(formatHoursMinutes_(cell.totalMinutes));
        totalForFio += cell.totalMinutes;
      } else {
        row.push('');
      }
    });

    row.push(formatHoursMinutes_(totalForFio));
    tabelRows.push(row);
  });

  // Очистить и записать табель
  tabelSh.clearContents();
  if (tabelRows.length > 0 && tabelRows[0].length > 0) {
    tabelSh.getRange(1, 1, tabelRows.length, tabelRows[0].length).setValues(tabelRows);
  }

  // Форматирование заголовка
  tabelSh.getRange(1, 1, 1, tabelRows[0].length).setFontWeight('bold');
  tabelSh.setFrozenRows(1);
  tabelSh.setFrozenColumns(1);

  Logger.log('Табель построен: ' + fioList.length + ' сотрудников, ' + dateList.length + ' дней');
  return { ok: true, employees: fioList.length, days: dateList.length };
}

/**
 * Полный процесс: парсинг + построение табеля
 * Вызывать после загрузки новых данных из Gate
 */
function processGateAndBuildTimesheet() {
  var parseResult = parseGateData();
  if (!parseResult.ok) return parseResult;

  var buildResult = buildTimesheet();
  return {
    ok: buildResult.ok,
    events_parsed: parseResult.events_count,
    employees: buildResult.employees,
    days: buildResult.days
  };
}

/**
 * Добавить меню в таблицу табеля
 * Запускается автоматически при открытии таблицы
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Табель')
    .addItem('Обработать файлы из папки Gate', 'processNewGateFiles')
    .addSeparator()
    .addItem('1. Парсинг Gate -> события', 'parseGateData')
    .addItem('2. Построить табель', 'buildTimesheet')
    .addItem('3. Оформить таблицы', 'formatTimesheetTables')
    .addToUi();
}

/**
 * Профессиональное оформление таблиц в корпоративном стиле
 */
function formatTimesheetTables() {
  var ss = getTimesheetSS_();

  // === ОФОРМЛЕНИЕ gate_events ===
  formatEventsSheet_(ss);

  // === ОФОРМЛЕНИЕ табель ===
  formatTabelSheet_(ss);

  // === СКРЫТИЕ СЛУЖЕБНЫХ ЛИСТОВ ===
  var sheetsToHide = ['Sheet1', 'gate_raw', 'детали', 'Sheet1 (копия)'];
  sheetsToHide.forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (sh) sh.hideSheet();
  });

  Logger.log('Оформление завершено');
  return { ok: true };
}

/**
 * Оформление листа gate_events
 */
function formatEventsSheet_(ss) {
  var sh = ss.getSheetByName(SHEET_GATE_EVENTS);
  if (!sh || sh.getLastRow() === 0) return;

  var lastRow = sh.getLastRow();
  var lastCol = 8;

  // Шрифт для всей таблицы
  sh.getRange(1, 1, lastRow, lastCol)
    .setFontFamily('Roboto')
    .setFontSize(10)
    .setVerticalAlignment('middle');

  // === ЗАГОЛОВОК ===
  sh.getRange(1, 1, 1, lastCol)
    .setFontWeight('bold')
    .setFontSize(11)
    .setBackground('#2c3e50')
    .setFontColor('#ecf0f1')
    .setHorizontalAlignment('center');

  // Высота заголовка
  sh.setRowHeight(1, 32);

  // === ДАННЫЕ ===
  if (lastRow > 1) {
    var dataRange = sh.getRange(2, 1, lastRow - 1, lastCol);
    dataRange.setBackground('#ffffff');

    // Тонкие границы
    dataRange.setBorder(true, true, true, true, true, true, '#e0e0e0', SpreadsheetApp.BorderStyle.SOLID);
  }

  // Границы заголовка
  sh.getRange(1, 1, 1, lastCol).setBorder(true, true, true, true, false, false, '#1a252f', SpreadsheetApp.BorderStyle.SOLID);

  // === КОЛОНКИ ===
  // ФИО — шире
  sh.setColumnWidth(1, 250);
  // Ключ
  sh.setColumnWidth(2, 90);
  // Дата
  sh.setColumnWidth(3, 90);
  // Время входа/выхода
  sh.setColumnWidth(4, 80);
  sh.setColumnWidth(5, 80);
  // Минут
  sh.setColumnWidth(6, 60);
  // Часов
  sh.setColumnWidth(7, 60);
  // Тип
  sh.setColumnWidth(8, 80);

  // Центрирование числовых колонок
  if (lastRow > 1) {
    sh.getRange(2, 3, lastRow - 1, 6).setHorizontalAlignment('center');
  }

  // === ЧЕРЕДУЮЩИЕСЯ СТРОКИ ===
  for (var r = 2; r <= lastRow; r++) {
    if (r % 2 === 0) {
      sh.getRange(r, 1, 1, lastCol).setBackground('#f7f9fc');
    }
  }

  // === ЦВЕТОВАЯ МАРКИРОВКА ТИПА ===
  for (var r = 2; r <= lastRow; r++) {
    var typeVal = String(sh.getRange(r, 8).getValue()).toLowerCase();
    var cell = sh.getRange(r, 8);
    if (typeVal === 'полный') {
      cell.setBackground('#27ae60').setFontColor('#ffffff').setFontWeight('bold');
    } else if (typeVal === 'вход') {
      cell.setBackground('#3498db').setFontColor('#ffffff');
    } else if (typeVal === 'выход') {
      cell.setBackground('#e74c3c').setFontColor('#ffffff');
    }
  }

  // === ЗАКРЕПЛЕНИЕ И ФИЛЬТР ===
  sh.setFrozenRows(1);
  if (!sh.getFilter()) {
    sh.getRange(1, 1, lastRow, lastCol).createFilter();
  }
}

/**
 * Оформление листа табель
 */
function formatTabelSheet_(ss) {
  var sh = ss.getSheetByName(SHEET_TABEL);
  if (!sh || sh.getLastRow() === 0) return;

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();

  // Шрифт для всей таблицы
  sh.getRange(1, 1, lastRow, lastCol)
    .setFontFamily('Roboto')
    .setFontSize(10)
    .setVerticalAlignment('middle');

  // === ЗАГОЛОВОК ===
  var headerRange = sh.getRange(1, 1, 1, lastCol);
  headerRange
    .setFontWeight('bold')
    .setFontSize(11)
    .setBackground('#1e3a5f')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');

  sh.setRowHeight(1, 36);

  // Нижняя граница заголовка — толстая
  headerRange.setBorder(null, null, true, null, false, false, '#0d2137', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // === КОЛОНКА ФИО ===
  sh.setColumnWidth(1, 280);
  sh.getRange(2, 1, lastRow - 1, 1)
    .setFontWeight('bold')
    .setHorizontalAlignment('left')
    .setBackground('#f8f9fa');

  // Правая граница ФИО — толстая
  sh.getRange(1, 1, lastRow, 1).setBorder(null, null, null, true, false, false, '#1e3a5f', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // === КОЛОНКИ ДАТ ===
  for (var c = 2; c < lastCol; c++) {
    sh.setColumnWidth(c, 55);
  }

  // Центрирование и границы данных
  if (lastRow > 1 && lastCol > 2) {
    var dataRange = sh.getRange(2, 2, lastRow - 1, lastCol - 2);
    dataRange
      .setHorizontalAlignment('center')
      .setBorder(true, true, true, true, true, true, '#e0e0e0', SpreadsheetApp.BorderStyle.SOLID);
  }

  // === КОЛОНКА ИТОГО ===
  sh.setColumnWidth(lastCol, 70);
  sh.getRange(1, lastCol, lastRow, 1)
    .setBackground('#1e3a5f')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  // === ЦВЕТОВАЯ ШКАЛА ЧАСОВ ===
  for (var r = 2; r <= lastRow; r++) {
    for (var c = 2; c < lastCol; c++) {
      var val = sh.getRange(r, c).getValue();
      if (val && val !== '') {
        var parts = String(val).split(':');
        var hours = parseInt(parts[0], 10) || 0;
        var cell = sh.getRange(r, c);

        if (hours >= 8) {
          // Полный день — насыщенный зелёный
          cell.setBackground('#27ae60').setFontColor('#ffffff').setFontWeight('bold');
        } else if (hours >= 6) {
          // Почти полный — светло-зелёный
          cell.setBackground('#58d68d').setFontColor('#1e5631');
        } else if (hours >= 4) {
          // Полдня — жёлто-зелёный
          cell.setBackground('#f9e79f').setFontColor('#7d6608');
        } else if (hours > 0) {
          // Мало — оранжевый
          cell.setBackground('#f5b041').setFontColor('#784212');
        }
      }
    }
  }

  // === ИТОГО — выделение ===
  for (var r = 2; r <= lastRow; r++) {
    var totalVal = sh.getRange(r, lastCol).getValue();
    if (totalVal && totalVal !== '') {
      sh.getRange(r, lastCol).setFontColor('#ffffff');
    }
  }

  // === ЧЕРЕДУЮЩИЕСЯ СТРОКИ (только ФИО) ===
  for (var r = 2; r <= lastRow; r++) {
    if (r % 2 === 0) {
      sh.getRange(r, 1).setBackground('#ecf0f1');
    }
  }

  // === ЗАКРЕПЛЕНИЕ ===
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);

  // === НИЖНЯЯ ГРАНИЦА ТАБЛИЦЫ ===
  sh.getRange(lastRow, 1, 1, lastCol).setBorder(null, null, true, null, false, false, '#1e3a5f', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

// ====== КОНЕЦ ТАБЕЛЯ ======
