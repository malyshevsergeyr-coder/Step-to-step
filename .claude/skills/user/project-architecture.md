# Step-to-Step Project Architecture

## Project Overview
Production glass tracking system for TMK Corporation (Tver)
- Tech: Google Apps Script + Google Sheets + HTML/CSS/JS
- Repo: malyshevsergeyr-coder/Step-to-step
- Main Sheets ID: 1myrm7Pya1eeesh_qQDk1IyMYtrKZkXUOgiKp8lW-b-A
- Deployment ID: AKfycbzXHzPxDyLx26EbRCF6POkMQ5zItn-ivlfMQVgHdS9tbAyLkTCak-mWajX9fxNu9344
- Apps Script: https://script.google.com/
- Local files: C:\Users\office\Documents\Google Web\

## MCP Connection (Google Sheets)
- Server: mcp-google-sheets (via Service Account)
- SA Email: claude-mcp@tmk-corporation.iam.gserviceaccount.com
- Key: C:\Users\office\Documents\Google Web\tmk-corporation-b846b9cbd25b.json
- Owner email: malyshev.sergey.r@gmail.com

## All Spreadsheets Registry
See: .claude/SPREADSHEETS_REGISTRY.md for full details

### Quick Reference:
| Name | ID | Purpose |
|------|-----|---------|
| **ОСНОВНЫЕ** | | |
| Новая таблица | 1myrm7Pya1eeesh_qQDk1IyMYtrKZkXUOgiKp8lW-b-A | Web app backend (users, orders, sessions, disks, items, stages) |
| Табель рабочего времени | 1yF9iuHcFaTyJ2X6PntO7661HFukmSgQWydhZsukHsC8 | Парсинг Gate → табель посещаемости |
| Учёт стекла | 1Xp7RCA4wnaa7aef2fqvQIQhk-oWxhKoZebkLY1mkHqA | Складской учёт сырья по локациям |
| Штатная расстановка | 1IfFJYPEZEqWXfDAma7WHp74pvi515SaUEkoo_UqqZrY | Выгрузка сотрудников из 1С |
| СПРАВОЧНИК | 14D-OArIClwsJQ585RgHk4LBeXqWV_5ukfNMAHnKLotQ | Мастер-таблица (номенклатура, сотрудники, этапы) |
| **ПРОИЗВОДСТВО** | | |
| Движение заказа | 17IER5U5t3wAgoIFuLqhF21_AGPNprqEus0yceDWIHhY | МАКЕТ будущей QR-системы трекинга |
| Учёт брака | 19Ys3iyepFMDcYWg9o8m9Zy2UDPbu7zjOOq66xKFt0JI | Журнал брака помесячно |
| Сменное задание | 1NgmBLhsQ4joq-UyOFqOzSxMRfYf_cuPS9IOY0Rr-jA8 | Понедельное планирование раскроя (3 поста) |
| Планирование производства | 1ywI1QDi5kIL62xOIeP69m_ABsykaKzgjYGuBXigB9MY | Полный цикл заказов, план/факт |
| Планирование СП | 16rsin2q9kYBG8EWH9zCPpxrwIPDCLFBeGJXelRE2Q9A | Заказы от продажи до отгрузки |

## clasp Projects (Apps Script)
| Project | scriptId | Local Folder |
|---------|----------|--------------|
| Посещаемость (табель) | 1UEYbSqyWw34Tduy5RUfKFkTOAuvLVqRxECDw0pz_g_9JJRoSfJs1U5Qk | `Посещаемость\` |
| Основное веб-приложение | (в корне) | `Google Web\` |

## Google Drive Folders
| Folder | Purpose |
|--------|---------|
| Отчёты Gate/ | Выгрузки из SoftGate → автообработка в табель |
| Штатная расстановка/ | Выгрузки из 1С → сверка с Gate |

## Main Table Structure (Web App Backend)

### Sheet: users
| Column | Field | Notes |
|--------|-------|-------|
| A | user_id | unique ID |
| B | login | username |
| C | password_plain | plain password (legacy) |
| D | password_hash | SHA-256 hash |
| E | salt | random salt |
| F | name | display name |
| G | role | Администратор/Начальник/Работник |
| H | area | work area |
| I | is_active | TRUE/FALSE |
| J | created_at | ISO date |
| K | last_login_at | ISO date |

### Sheet: order
id_product, direction (Восполнение/Резка), process (Сборка/Закалка/Обработка/Дабл/Триплекс), width, height, quantity, formula, print, sticker, manual, allowance

### Sheet: sessions
token, user_id, created_at, expires_at, last_seen_at, revoked

### Sheet: cutting_orders
order_id, created_at, created_by_user_id, created_by_name, menu_title, status (Создана/В работе/Выполнена/Брак/Приостановлена), id_product, direction, process, width_mm, height_mm, quantity, formula, print, sticker, manual, allowance_mm, updated_at, updated_by_user_id

### Sheet: notifications
notification_id, to_user_id, to_role, title, message, related_order_id, created_at, read_at, deleted

### Sheet: chat_messages
message_id, thread_key, from_user_id, to_user_id, text, attachment_url, attachment_name, attachment_type, created_at, read_at, deleted

## Production Flow
```
Планирование СП → План производства → Сменное задание → Учёт брака
                                                          ↑
Движение заказа (QR-трекинг) ──── будущая замена ручных статусов
```

## 3 Cutting Stations
| Station | Gate | Machine | Specialization |
|---------|------|---------|----------------|
| РАСКРОЙ 1 | 6 ворота | Китаец | + 10mm glass |
| РАСКРОЙ 2 | 9 ворота | Лисик 2 | + max 10mm + coating removal |
| РАСКРОЙ 3 | 5 ворота | Лисик 1 | + triplex 4.2.4 + max 10mm |

## Production Stages (from Движение заказа)
РАСКРОЙ (always) → КРОМКА (if needed) → ЗАКАЛКА (if needed) → ПОКРАСКА (if needed) → ПЛЁНКА (if needed) → РАМКА (if argon) → СБОРКА (always)

## User Roles
### Администратор (Administrator)
- Access: create cutting orders, manage users
- Interface: admin cabinet

### Начальник (Manager)
- Access: view all orders, change statuses
- Receives: notifications about new orders

### Работник (Worker)
- Access: view assigned orders, update task status

## File Structure
- Code.js: Google Apps Script backend
- Index.html: Frontend (HTML + CSS + JS)
- appsscript.json: Apps Script manifest
- .clasp.json: clasp config for deployment
