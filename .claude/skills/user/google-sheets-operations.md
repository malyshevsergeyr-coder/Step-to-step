# Google Sheets Operations Skill

## When to use
When working with any TMK Google Sheets: reading data, writing data, creating reports, analyzing production data, modifying spreadsheet structure.

## MCP Tools Available
All operations go through `mcp__google-sheets__*` tools via Service Account.

### Reading:
- `get_sheet_data` — read data from a sheet (with optional range)
- `get_sheet_formulas` — read formulas
- `get_multiple_sheet_data` — read from multiple sheets/ranges at once
- `get_multiple_spreadsheet_summary` — quick overview of multiple spreadsheets
- `list_sheets` — list all sheets in a spreadsheet
- `list_spreadsheets` — list all accessible spreadsheets

### Writing:
- `update_cells` — update a range of cells
- `batch_update_cells` — update multiple ranges at once
- `batch_update` — advanced operations (formatting, borders, conditional formatting, dimensions)

### Structure:
- `create_spreadsheet` — create new spreadsheet
- `create_sheet` — add new sheet tab
- `add_rows` / `add_columns` — add rows/columns
- `rename_sheet` — rename a sheet
- `copy_sheet` — copy sheet between spreadsheets

### Sharing:
- `share_spreadsheet` — share with users
- `list_folders` — list Drive folders

## Spreadsheet IDs Quick Reference
```
# Основные рабочие таблицы
MAIN_APP      = "1myrm7Pya1eeesh_qQDk1IyMYtrKZkXUOgiKp8lW-b-A"  # Веб-приложение
TIMESHEET     = "1yF9iuHcFaTyJ2X6PntO7661HFukmSgQWydhZsukHsC8"  # Табель рабочего времени
GLASS_STOCK   = "1Xp7RCA4wnaa7aef2fqvQIQhk-oWxhKoZebkLY1mkHqA"  # Учёт стекла
STAFF_1C      = "1IfFJYPEZEqWXfDAma7WHp74pvi515SaUEkoo_UqqZrY"  # Штатная расстановка
REFERENCE     = "14D-OArIClwsJQ585RgHk4LBeXqWV_5ukfNMAHnKLotQ"  # СПРАВОЧНИК

# Производственные таблицы
MOVEMENT      = "17IER5U5t3wAgoIFuLqhF21_AGPNprqEus0yceDWIHhY"  # Движение заказа (макет)
DEFECTS       = "19Ys3iyepFMDcYWg9o8m9Zy2UDPbu7zjOOq66xKFt0JI"  # Учёт брака
SHIFT_TASK    = "1NgmBLhsQ4joq-UyOFqOzSxMRfYf_cuPS9IOY0Rr-jA8"  # Сменное задание
PROD_PLANNING = "1ywI1QDi5kIL62xOIeP69m_ABsykaKzgjYGuBXigB9MY"  # Планирование производства
SP_PLANNING   = "16rsin2q9kYBG8EWH9zCPpxrwIPDCLFBeGJXelRE2Q9A"  # Планирование СП
```

## Google Drive Folders
```
Отчёты Gate/            — выгрузки из SoftGate для табеля
Штатная расстановка/    — выгрузки из 1С:УПП
```

## Apps Script Projects (clasp)
```
Посещаемость (табель):  scriptId = 1UEYbSqyWw34Tduy5RUfKFkTOAuvLVqRxECDw0pz_g_9JJRoSfJs1U5Qk
                        local    = C:\Users\office\Documents\Google Web\Посещаемость\
```

## Important Notes
- Service Account can only access explicitly shared spreadsheets
- Excel files (.xlsx) on Drive must be converted to Google Sheets first
- Sheet names are case-sensitive and may have leading spaces (e.g., " январь 2026")
- Use A1 notation for ranges (e.g., "A1:Z100")
- batch_update uses sheetId (numeric), not sheet name
