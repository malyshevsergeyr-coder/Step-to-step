# Production Domain Knowledge — TMK Glass Manufacturing

## When to use
When working with production data, creating reports, analyzing orders, understanding glass manufacturing terminology, or designing new features related to the production process.

## Company Overview
- **TMK Corporation** — group of ~15 production facilities
- **Glass production** — ~40 employees, Tver, Russia
- **Products:** insulated glass units (стеклопакеты), tempered glass, fire-resistant glass
- **Volume:** 1-2 orders per day
- **Director:** technically savvy, wants to eliminate manual spreadsheet work

## Glass Manufacturing Terminology

### Product Types
- **СПО** — стеклопакет однокамерный (single-chamber insulated glass unit)
- **СПД** — стеклопакет двухкамерный (double-chamber insulated glass unit)
- **Триплекс** — laminated glass (e.g., 4.2.4 = 4mm glass + 2mm PVB + 4mm glass)

### Glass Marks
- **М1** — float glass grade M1
- **И** — low-emissivity (i-glass)
- **зак** — tempered (закалённое)
- **StPh** — SunGuard brand coating
- **PlGrey** — Planibel Grey tinted glass
- **EIW60** — fire-resistant glass (60 min rating)

### Formula Format
Example: `СПД 6Изакх12ArхИ6закх12Arх4.1.4`
- 6Изак = 6mm i-glass tempered
- 12Ar = 12mm argon-filled gap
- И6зак = 6mm i-glass tempered (inner)
- 12Ar = 12mm argon gap
- 4.1.4 = 4mm + 1mm PVB + 4mm laminated

### Spacer Types
- **Алюминий** — aluminum spacer bar
- **Гиб** — flexible warm-edge spacer (ГибArх = гибкая рамка с аргоном)
- **зал** — залитая (sealed)

### Production Stages
1. **Раскрой** — glass cutting
2. **Кромка** — edge processing
3. **Закалка** — tempering (in furnace)
4. **Покраска** — painting/coating
5. **Плёнка** — film application
6. **Рамка** — spacer bar assembly
7. **Сборка** — final assembly of insulated glass unit
8. **Чиллер** — cooling unit (after tempering)

### Defect Types (from Учёт брака)
- Стёрто покрытие — coating removed
- Разбилось в чиллере — broke in chiller
- Разбилось при перевозке — broke during transport
- Лопнул СП — insulated glass unit cracked
- Микротрещина — micro crack
- Не в размер — wrong dimensions
- Царапина — scratch
- Капли краски — paint drops

### Production Areas
- **б.печь** — большая печь (main tempering furnace)
- **сп** — участок стеклопакетов (insulated glass unit area)
- **CMS** — cutting machine station

### Cutting Stations (3 posts)
| Station | Gate | Machine | Capability |
|---------|------|---------|------------|
| РАСКРОЙ 1 | 6 ворота | Китаец (Chinese) | Standard + 10mm |
| РАСКРОЙ 2 | 9 ворота | Лисик 2 (Lisec 2) | Max 10mm + coating removal |
| РАСКРОЙ 3 | 5 ворота | Лисик 1 (Lisec 1) | Triplex 4.2.4 + max 10mm |

### Complexity Coefficients (for capacity planning)
| Type | Coefficient |
|------|-------------|
| Simple glass units | 1.30 |
| СПО shaped | 2.60 |
| СПД shaped | 2.60 |
| СПО warm-edge | 2.83 |
| СПД warm-edge | 3.68 |
| СПО with muntins | 2.72 |
| СПД with muntins | 4.01 |

### Key Terms
- **Дискета** — batch/order file from optimization software (Окна Софт)
- **Номинал** — individual glass pane within an insulated glass unit
- **Условная площадь** — weighted area (actual area × complexity coefficient)
- **Пирамида** — glass storage rack (wooden or metal)
- **УПД** — universal transfer document (shipping document)
- **СКУД** — access control system (turnstiles)

## Key People
- **Сергей Малышев** — sysadmin, project lead (2 weeks at company)
- **Саков Антон** — master, responsible for order transfers (+7 920 159 94 48)
- **Sales managers:** Григорьева, Голубева, Котова, Куземов, Лейман, Орлова

## Current Pain Points
1. Manual status updates across multiple spreadsheets
2. No real-time tracking of orders through production
3. Defect tracking is manual and disconnected
4. Director spends 2+ hours daily filling spreadsheets
5. Double data entry (spreadsheets + 1C)
6. Lost orders, confusion about statuses

## Priority Goals
1. Order tracking through production stages (QR-based)
2. Automatic cutting task generation
3. Integration with 1C (import orders, export shipments)
