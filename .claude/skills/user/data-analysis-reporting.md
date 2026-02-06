# Data Analysis & Reporting Skill

## When to use
When Sergey asks for production analytics, reports, dashboards, defect analysis, capacity planning, or any data-driven insights from the TMK spreadsheets.

## Available Data Sources

### Defect Analysis (Учёт брака)
- ID: 19Ys3iyepFMDcYWg9o8m9Zy2UDPbu7zjOOq66xKFt0JI
- Monthly sheets (e.g., " январь 2026", "февраль 2026")
- Metrics: defect count, area lost (m²), cost, by type/cause/station/operator

### Production Capacity (Сменное задание)
- ID: 1NgmBLhsQ4joq-UyOFqOzSxMRfYf_cuPS9IOY0Rr-jA8
- Weekly sheets with plan vs fact per cutting station
- Metrics: items planned/completed, glass area, conditional area

### Order Pipeline (Планирование производства)
- ID: 1ywI1QDi5kIL62xOIeP69m_ABsykaKzgjYGuBXigB9MY
- Sheet "Загрузка" has monthly plan/fact in m²
- Sheet "План производства.2026" has all orders with statuses

### Order Fulfillment (Планирование СП)
- ID: 16rsin2q9kYBG8EWH9zCPpxrwIPDCLFBeGJXelRE2Q9A
- Full order lifecycle: sales → production → shipping

### Attendance (Отчёт посещаемости)
- ID: 1t8hnza6k99mqp1qlsoNKcB7gn-0xT7GhVFeisrjHLvQ
- Employee check-in/check-out times

## Report Types to Anticipate
1. **Defect summary** — by period, type, cause, station, operator
2. **Production throughput** — plan vs fact by week/month
3. **Order status dashboard** — how many in each status
4. **Capacity utilization** — conditional area per station per shift
5. **On-time delivery** — planned vs actual assembly/shipping dates
6. **Employee productivity** — attendance + output correlation

## Approach
1. Read data via MCP tools
2. Process and aggregate in Python if needed
3. Present results as formatted tables or summaries
4. Optionally write results back to a Google Sheet for sharing
