// ====== ТАБЕЛЬ РАБОЧЕГО ВРЕМЕНИ (Gate/SoftGate) ======
// Проект: Посещаемость
// Таблица: https://docs.google.com/spreadsheets/d/1yF9iuHcFaTyJ2X6PntO7661HFukmSgQWydhZsukHsC8

const TIMESHEET_SPREADSHEET_ID = '1yF9iuHcFaTyJ2X6PntO7661HFukmSgQWydhZsukHsC8';
const SHEET_GATE_RAW = 'Sheet1';       // Сырые данные из Gate
const SHEET_GATE_EVENTS = 'gate_events'; // Плоская таблица событий
const SHEET_TABEL = 'табель';           // Сводный табель
const GATE_FOLDER_NAME = 'Отчёты Gate'; // Папка для загрузки файлов из Gate
const GATE_PROCESSED_PREFIX = '[Обработан] '; // Префикс для обработанных файлов
const TABEL_DATA_START_ROW = 7;        // Строка начала данных в табеле (после шапки)

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
 * Поддерживает разные форматы выгрузки из Gate
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

  // Используем getDisplayValues чтобы получить текст как он отображается в ячейках
  // Это избегает проблем с преобразованием дат/времени
  var rawData = rawSh.getDataRange().getDisplayValues();
  var events = [];

  Logger.log('Всего строк в Sheet1: ' + rawData.length);

  var currentFio = '';
  var currentKey = '';
  var i = 0;

  while (i < rawData.length) {
    var row = rawData[i];

    // getDisplayValues уже возвращает строки - просто trim
    var rowStr = row.map(function(cell) {
      return String(cell || '').trim();
    });

    // Ищем "Номер ключа:" в любой колонке
    var keyIndex = rowStr.indexOf('Номер ключа:');
    if (keyIndex >= 0) {
      currentFio = rowStr[0]; // ФИО всегда в первой колонке
      currentKey = rowStr[keyIndex + 2] || rowStr[keyIndex + 1] || ''; // Ключ через 1-2 колонки
      i++;
      continue;
    }

    // Пропускаем заголовки и служебные строки
    if (rowStr[0] === 'Устройство входа' || rowStr[0] === 'Суммарный отчет рабочего времени') {
      i++;
      continue;
    }
    if (rowStr.indexOf('Всего времени:') >= 0 || rowStr.indexOf('Страница') >= 0) {
      i++;
      continue;
    }

    // Пропускаем полностью пустые строки
    var hasData = rowStr.some(function(s) { return s.length > 0; });
    if (!hasData) {
      i++;
      continue;
    }

    // Ищем данные события по паттернам
    // Дата: DD.MM.YYYY, Время: HH:MM или H:MM
    var datePattern = /^\d{2}\.\d{2}\.\d{4}$/;
    var timePattern = /^\d{1,2}:\d{2}$/;

    // Находим все даты и времена в строке
    var dates = [];
    var times = [];
    var devices = [];

    for (var j = 0; j < rowStr.length; j++) {
      var val = rowStr[j];
      if (datePattern.test(val)) {
        dates.push({ idx: j, val: val });
      } else if (timePattern.test(val)) {
        times.push({ idx: j, val: val });
      } else if (val && !datePattern.test(val) && !timePattern.test(val) && val.length > 2) {
        // Устройство - непустая строка, не дата, не время
        devices.push({ idx: j, val: val });
      }
    }

    // Если нашли хотя бы дату и время - это событие
    if (dates.length > 0 && times.length > 0) {
      var entryDevice = '';
      var entryDate = '';
      var entryTime = '';
      var exitDevice = '';
      var exitDate = '';
      var exitTime = '';
      var duration = '';

      if (dates.length >= 2 && times.length >= 2) {
        // Полная пара: вход и выход
        // Первая дата/время - вход, вторая - выход
        entryDate = dates[0].val;
        entryTime = times[0].val;
        exitDate = dates[1].val;
        exitTime = times[1].val;

        // Устройства: первое до первой даты - вход, между датами - выход
        for (var d = 0; d < devices.length; d++) {
          if (devices[d].idx < dates[0].idx) {
            entryDevice = devices[d].val;
          } else if (devices[d].idx > times[0].idx && devices[d].idx < dates[1].idx) {
            exitDevice = devices[d].val;
          }
        }

        // Ищем длительность (последний элемент типа H:MM после второго времени)
        for (var t = times.length - 1; t >= 0; t--) {
          if (times[t].idx > times[1].idx) {
            duration = times[t].val;
            break;
          }
        }
        // Или берём последний столбец если похож на время
        if (!duration) {
          var lastVal = rowStr[rowStr.length - 1];
          if (timePattern.test(lastVal)) {
            duration = lastVal;
          }
        }

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

      } else if (dates.length === 1 && times.length === 1) {
        // Только один набор дата+время
        var theDate = dates[0].val;
        var theTime = times[0].val;
        var theDevice = devices.length > 0 ? devices[0].val : '';

        // Определяем это вход или выход по позиции устройства
        // Если устройство в левой части (индекс < 5) - вход, иначе - выход
        var isEntry = devices.length > 0 && devices[0].idx < 5;

        if (isEntry) {
          events.push({
            fio: currentFio,
            key: currentKey,
            date: theDate,
            entry_time: theTime,
            exit_time: '',
            minutes: 0,
            hours: '',
            type: 'вход'
          });
        } else {
          events.push({
            fio: currentFio,
            key: currentKey,
            date: theDate,
            entry_time: '',
            exit_time: theTime,
            minutes: 0,
            hours: '',
            type: 'выход'
          });
        }
      }
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

    // Проверяем что dateStr это валидная дата (DD.MM.YYYY)
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) continue;

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

  // Фильтруем только валидные даты (формат DD.MM.YYYY или DD.MM)
  var dateList = Object.keys(dateSet).filter(function(d) {
    // Проверяем что это дата, а не время или мусор
    return /^\d{2}\.\d{2}(\.\d{4})?$/.test(d);
  }).sort(function(a, b) {
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

  // Определяем период
  var firstDate = dateList[0] || '';
  var lastDate = dateList[dateList.length - 1] || '';

  // Строка начала данных (оставляем место для шапки)
  var DATA_START_ROW = 7;

  // Очистить лист
  tabelSh.clearContents();
  tabelSh.clearFormats();

  // === ШАПКА ===
  // Строка 1: Заголовок
  tabelSh.getRange(1, 1).setValue('ТАБЕЛЬ УЧЁТА РАБОЧЕГО ВРЕМЕНИ');
  tabelSh.getRange(1, 1).setFontSize(16).setFontWeight('bold').setFontColor('#1e3a5f');

  // Строка 2: Период
  tabelSh.getRange(2, 1).setValue('Период: ' + firstDate + ' - ' + lastDate);
  tabelSh.getRange(2, 1).setFontSize(11).setFontColor('#555555');

  // Строка 3: Статистика
  tabelSh.getRange(3, 1).setValue('Сотрудников: ' + fioList.length + '  |  Дней: ' + dateList.length);
  tabelSh.getRange(3, 1).setFontSize(10).setFontColor('#777777');

  // Строка 4: Дата обновления
  var now = new Date();
  var updateStr = Utilities.formatDate(now, 'Europe/Moscow', 'dd.MM.yyyy HH:mm');
  tabelSh.getRange(4, 1).setValue('Обновлено: ' + updateStr);
  tabelSh.getRange(4, 1).setFontSize(10).setFontColor('#999999').setFontStyle('italic');

  // Строка 5-6: Пустые (место для кнопки справа)

  // === ДАННЫЕ ТАБЕЛЯ ===
  if (tabelRows.length > 0 && tabelRows[0].length > 0) {
    tabelSh.getRange(DATA_START_ROW, 1, tabelRows.length, tabelRows[0].length).setValues(tabelRows);
  }

  // Форматирование заголовка данных
  tabelSh.getRange(DATA_START_ROW, 1, 1, tabelRows[0].length).setFontWeight('bold');
  tabelSh.setFrozenRows(DATA_START_ROW);
  tabelSh.setFrozenColumns(1);

  Logger.log('Табель построен: ' + fioList.length + ' сотрудников, ' + dateList.length + ' дней');
  return { ok: true, employees: fioList.length, days: dateList.length, period: firstDate + ' - ' + lastDate };
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
    .addItem('Обработать файлы из папки Gate', 'обработатьGateСКнопки')
    .addSeparator()
    .addItem('1. Парсинг Gate -> события', 'parseGateData')
    .addItem('2. Построить табель', 'buildTimesheet')
    .addItem('3. Оформить таблицы', 'formatTimesheetTables')
    .addToUi();
}

/**
 * Функция для кнопки - обрабатывает файлы и показывает результат
 * Назначить эту функцию на кнопку-рисунок
 */
function обработатьGateСКнопки() {
  var ui = SpreadsheetApp.getUi();

  try {
    // Проверяем есть ли новые файлы
    var newFiles = findNewGateFiles_();

    if (newFiles.length === 0) {
      ui.alert(
        'Нет новых файлов',
        'В папке "' + GATE_FOLDER_NAME + '" нет новых файлов для обработки.\n\n' +
        'Загрузите Excel-файл из Gate в эту папку на Google Диске.',
        ui.ButtonSet.OK
      );
      return;
    }

    // Спрашиваем подтверждение
    var fileNames = newFiles.map(function(f) { return '• ' + f.getName(); }).join('\n');
    var response = ui.alert(
      'Обработать файлы?',
      'Найдено файлов: ' + newFiles.length + '\n\n' + fileNames + '\n\nНачать обработку?',
      ui.ButtonSet.YES_NO
    );

    if (response !== ui.Button.YES) {
      return;
    }

    // Обрабатываем
    var result = processNewGateFiles();

    if (result.ok) {
      var msg = 'Обработка завершена!\n\n';

      if (result.results && result.results.length > 0) {
        result.results.forEach(function(r) {
          if (r.ok) {
            msg += '✓ ' + r.file + '\n';
            msg += '   Событий: ' + r.events + ', Сотрудников: ' + r.employees + '\n\n';
          } else {
            msg += '✗ ' + r.file + '\n';
            msg += '   Ошибка: ' + r.error + '\n\n';
          }
        });
      }

      msg += 'Обработано: ' + result.processed;
      if (result.failed > 0) {
        msg += ', Ошибок: ' + result.failed;
      }

      ui.alert('Готово!', msg, ui.ButtonSet.OK);
    } else {
      ui.alert('Ошибка', result.error || 'Неизвестная ошибка', ui.ButtonSet.OK);
    }

  } catch (e) {
    ui.alert('Ошибка', 'Произошла ошибка:\n' + e.message, ui.ButtonSet.OK);
  }
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
  // Дата - форматируем как дату dd.MM.yyyy
  sh.setColumnWidth(3, 90);
  if (lastRow > 1) {
    sh.getRange(2, 3, lastRow - 1, 1).setNumberFormat('dd.MM.yyyy');
  }
  // Время входа/выхода - форматируем как время
  sh.setColumnWidth(4, 80);
  sh.setColumnWidth(5, 80);
  if (lastRow > 1) {
    sh.getRange(2, 4, lastRow - 1, 2).setNumberFormat('HH:mm');
  }
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
  var headerRow = TABEL_DATA_START_ROW; // Строка заголовка данных (после шапки)

  // Шрифт для всей таблицы
  sh.getRange(1, 1, lastRow, lastCol)
    .setFontFamily('Roboto')
    .setFontSize(10)
    .setVerticalAlignment('middle');

  // === ШАПКА (строки 1-5) ===
  sh.getRange(1, 1).setFontFamily('Roboto').setFontSize(16).setFontWeight('bold').setFontColor('#1e3a5f');
  sh.getRange(2, 1).setFontFamily('Roboto').setFontSize(11).setFontColor('#555555');
  sh.getRange(3, 1).setFontFamily('Roboto').setFontSize(10).setFontColor('#777777');
  sh.getRange(4, 1).setFontFamily('Roboto').setFontSize(10).setFontColor('#999999').setFontStyle('italic');

  // Разделительная линия перед данными
  sh.getRange(headerRow - 1, 1, 1, lastCol).setBorder(null, null, true, null, false, false, '#1e3a5f', SpreadsheetApp.BorderStyle.SOLID);

  // === ЗАГОЛОВОК ДАННЫХ ===
  var headerRange = sh.getRange(headerRow, 1, 1, lastCol);
  headerRange
    .setFontWeight('bold')
    .setFontSize(11)
    .setBackground('#1e3a5f')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');

  sh.setRowHeight(headerRow, 36);

  // Нижняя граница заголовка — толстая
  headerRange.setBorder(null, null, true, null, false, false, '#0d2137', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // === КОЛОНКА ФИО ===
  sh.setColumnWidth(1, 280);
  if (lastRow > headerRow) {
    sh.getRange(headerRow + 1, 1, lastRow - headerRow, 1)
      .setFontWeight('bold')
      .setHorizontalAlignment('left')
      .setBackground('#f8f9fa');
  }

  // Правая граница ФИО — толстая (только для данных)
  sh.getRange(headerRow, 1, lastRow - headerRow + 1, 1).setBorder(null, null, null, true, false, false, '#1e3a5f', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // === КОЛОНКИ ДАТ ===
  for (var c = 2; c < lastCol; c++) {
    sh.setColumnWidth(c, 55);
  }

  // Центрирование и границы данных
  if (lastRow > headerRow && lastCol > 2) {
    var dataRange = sh.getRange(headerRow + 1, 2, lastRow - headerRow, lastCol - 2);
    dataRange
      .setHorizontalAlignment('center')
      .setBorder(true, true, true, true, true, true, '#e0e0e0', SpreadsheetApp.BorderStyle.SOLID);
  }

  // === КОЛОНКА ИТОГО ===
  sh.setColumnWidth(lastCol, 70);
  sh.getRange(headerRow, lastCol, lastRow - headerRow + 1, 1)
    .setBackground('#1e3a5f')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  // === ЦВЕТОВАЯ ШКАЛА ЧАСОВ ===
  for (var r = headerRow + 1; r <= lastRow; r++) {
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
  for (var r = headerRow + 1; r <= lastRow; r++) {
    var totalVal = sh.getRange(r, lastCol).getValue();
    if (totalVal && totalVal !== '') {
      sh.getRange(r, lastCol).setFontColor('#ffffff');
    }
  }

  // === ЧЕРЕДУЮЩИЕСЯ СТРОКИ (только ФИО) ===
  for (var r = headerRow + 1; r <= lastRow; r++) {
    if ((r - headerRow) % 2 === 0) {
      sh.getRange(r, 1).setBackground('#ecf0f1');
    }
  }

  // === ЗАКРЕПЛЕНИЕ ===
  sh.setFrozenRows(headerRow); // Закрепляем шапку + заголовок данных
  sh.setFrozenColumns(1);

  // === НИЖНЯЯ ГРАНИЦА ТАБЛИЦЫ ===
  sh.getRange(lastRow, 1, 1, lastCol).setBorder(null, null, true, null, false, false, '#1e3a5f', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

// ====== КОНЕЦ ТАБЕЛЯ ======
