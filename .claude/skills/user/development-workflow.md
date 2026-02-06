# Development Workflow for Step-to-Step

## CRITICAL: Branch and Merge Strategy

### Always Create Feature Branches
- NEVER commit directly to main branch
- Create branch for each task: `git checkout -b feature/task-name`
- Examples: `feature/fix-menu-highlight`, `feature/admin-forms`, `feature/chat-system`

### Testing Before Merge
- Test all changes in feature branch
- Run manual tests
- Wait for user approval
- Only after approval: merge to main

### Merge Process
```bash
Skill 2: Workflow и правила разработки
Создай файл: .claude\skills\user\development-workflow.md
bashnotepad development-workflow.md
Скопируй и вставь:
markdown# Development Workflow for Step-to-Step

## CRITICAL: Branch and Merge Strategy

### Always Create Feature Branches
- NEVER commit directly to main branch
- Create branch for each task: `git checkout -b feature/task-name`
- Examples: `feature/fix-menu-highlight`, `feature/admin-forms`, `feature/chat-system`

### Testing Before Merge
- Test all changes in feature branch
- Run manual tests
- Wait for user approval
- Only after approval: merge to main

### Merge Process
```bash
# After user approves:
git checkout main
git merge feature/task-name
git push origin main
# Delete feature branch after successful merge
git branch -d feature/task-name
```

## Git Workflow Commands

### Starting New Task
```bash
git checkout main
git pull origin main
git checkout -b feature/descriptive-name
```

### During Development
```bash
git add .
git commit -m "[TYPE] Description"
git push origin feature/branch-name
```

### After User Approval
```bash
git checkout main
git merge feature/branch-name
git push origin main
git branch -d feature/branch-name
```

## Commit Message Format
```
[TYPE] Short description

Details:
- What changed: specific changes
- Variables: list of new/modified variables
- Reason: why this change was necessary
- Result: what now works

Files modified:
- Code.gs: function names
- Index.html: UI changes
```

Types:
- [FIX] - bug fixes
- [FEATURE] - new functionality
- [REFACTOR] - code improvement
- [DOCS] - documentation
- [TEST] - testing additions

## Pre-Development Interview

Before starting ANY task, conduct mini-interview:

1. **Clarify Logic**
   - "How should this feature behave in edge cases?"
   - "What happens if user does X?"

2. **UI/UX Preferences**
   - "Do you want this button here or there?"
   - "What color scheme for this element?"

3. **Dependencies**
   - "Does this affect other features?"
   - "What data do we need from other sheets?"

4. **Architecture Changes**
   - If need new columns: "I suggest adding column X to table Y because Z"
   - Wait for confirmation before proceeding

## Development Process

### Phase 1: Planning
1. Break task into subtasks
2. Identify files to modify
3. List required changes
4. Get user confirmation

### Phase 2: Implementation
1. Create feature branch
2. Implement subtask 1
3. Commit with detailed message
4. Repeat for each subtask

### Phase 3: Testing
1. Test locally
2. Push to feature branch
3. Ask user to test
4. Fix issues if any
5. Get final approval

### Phase 4: Deployment
1. Merge to main (only after approval!)
2. Push to GitHub
3. Sync with Google Apps Script via clasp
4. Verify deployment

## Logging Requirements

### PROJECT_LOG.md Format
```markdown
## [Date] - Task Name

### Interview
- Q: Question asked
- A: User answer

### Architecture Changes
- Added column X to sheet Y
- Reason: needed for feature Z

### Implementation
- Modified Code.gs: functions A, B, C
- Modified Index.html: sections D, E
- Added new file: F.gs

### Commits
- [FEATURE] Added admin form 1
- [FIX] Fixed menu highlighting

### Testing
- Tested scenario 1: ✓ passed
- Tested scenario 2: ✓ passed

### Issues Encountered
- Issue: Description
- Solution: How resolved

### Next Steps
- [ ] Task 1
- [ ] Task 2
```

## Clasp Integration

### Always sync after GitHub push
```bash
git push origin main
clasp push
```

### Before pulling from GitHub
```bash
git pull origin main
clasp pull
```

## File Modification Rules

### Code.gs
- Always maintain existing function structure
- Add comments for new functions
- Use consistent naming: camelCase

### Index.html
- Maintain existing CSS structure
- Add new styles at end of <style> section
- Test on multiple screen sizes

### New Files
- Create only when necessary
- Document purpose in header comment
- Update PROJECT_LOG.md

## Safety Rules

1. **Never delete** existing functionality without user approval
2. **Always backup** before major refactoring
3. **Test incrementally** - don't make 10 changes at once
4. **Ask if unsure** - better to clarify than assume
5. **Document everything** - future you will thank you

## Collaboration with User

### Response Format
After completing task:
```
✅ Completed: [Task name]

📝 Changes made:
- File 1: change description
- File 2: change description

🧪 How to test:
1. Step 1
2. Step 2
3. Expected result

🔍 Please verify:
- [ ] Feature works as expected
- [ ] No existing functionality broken
- [ ] UI looks correct on your device

📌 Next suggested tasks:
- Task A
- Task B
```

### When Blocked
If cannot proceed:
```
⚠️ Need clarification on: [specific point]

Options:
A) Approach 1: pros and cons
B) Approach 2: pros and cons

Which do you prefer?
```

## CRITICAL REMINDERS

- ❌ NEVER merge to main without user approval
- ❌ NEVER push untested code
- ❌ NEVER modify database structure without confirmation
- ✅ ALWAYS work in feature branches
- ✅ ALWAYS test before requesting approval
- ✅ ALWAYS document changes
- ✅ ALWAYS keep user informed
Сохрани (Ctrl+S) и закрой.

Skill 3: Technical Requirements
Создай файл: .claude\skills\user\technical-requirements.md
bashnotepad technical-requirements.md
Скопируй и вставь:
markdown# Technical Requirements - Step-to-Step

## UI/UX Standards

### Design Style
- Minimalist, premium aesthetic
- Centered forms
- Border styling on form elements
- Hover and input animations
- Fully responsive (desktop, tablet, mobile)

### Color Scheme
- Online status: green border
- Offline status: gray border
- Unread messages: red badge with number
- Primary actions: accent color
- Disabled elements: gray with reduced opacity

### Form Standards
- All input fields equal size (except textarea)
- No overlapping elements
- Clear visual hierarchy
- Labels in Russian
- Validation: cannot submit with empty required fields
- Error messages: red text below field
- Success messages: green notification

### Responsive Breakpoints
- Desktop: 1200px+
- Tablet: 768px - 1199px
- Mobile: < 768px

## Functional Requirements

### Authentication
- Check login + password against users sheet
- Read role from column G
- Redirect based on role:
  - Администратор → admin interface
  - Начальник → manager interface
  - Работник → worker interface
- Store session in sessionStorage
- Auto-logout after 30 minutes inactivity

### Menu System (Admin Only)
- Three menu items: "Задание на раскрой 1", "Задание на раскрой 2", "Задание на раскрой 3"
- Active menu item highlighted
- Smooth transitions between sections
- Persistent state (remember last opened)

### Chat System

#### Chat Icon
- Fixed position (bottom-right corner)
- Red badge showing unread count
- Pulse animation when new message arrives
- Opens on click, closes on click outside

#### Chat Window
- User selector dropdown:
  - Online users first (green indicator)
  - Offline users second (gray indicator)
  - Search by name
  - Show role under name
- Message input field:
  - Minimum height: 60px
  - Auto-expand up to 200px
  - Placeholder: "Введите сообщение..."
- Attachment button:
  - Icon: paperclip (not "Фото" text)
  - Accept: images, PDFs, max 10MB
  - Upload to Google Drive
  - Show upload progress
- Message history:
  - Newest at bottom
  - Auto-scroll to latest
  - Show delivery/read indicators:
    - ✓ sent
    - ✓✓ delivered
    - ✓✓ blue - read
  - Timestamp on hover

#### Chat Functionality
- Real-time updates (poll every 3 seconds)
- Mark messages as read when chat opened
- Store messages in chat_messages sheet
- Store files in Google Drive folder: /Step-to-Step/Chat-Files/

### Notifications System
- Notification icon in header
- Badge with unread count
- Dropdown panel on click
- Notification types:
  - New order created
  - Order status changed
  - New message received
- Mark as read on click
- "Mark all as read" button
- Store in notifications sheet

### Admin Forms (Cutting Orders)

#### Form Layout
- Centered on page
- Max width: 600px
- Card-style with shadow
- Premium border styling

#### Form Fields
All fields required unless specified:

1. id_product (текст)
   - Label: "Номер изделия"
   - Placeholder: "Введите номер"
   - Pattern: alphanumeric

2. direction (select)
   - Label: "Направление"
   - Options: Восполнение, Резка

3. process (select)
   - Label: "Следующий процесс"
   - Options: Сборка, Закалка, Обработка, Дабл, Триплекс

4. width (number)
   - Label: "Ширина (мм)"
   - Min: 1
   - Step: 1

5. height (number)
   - Label: "Высота (мм)"
   - Min: 1
   - Step: 1

6. quantity (number)
   - Label: "Количество"
   - Min: 1
   - Step: 1

7. formula (текст)
   - Label: "Формула"
   - Placeholder: "Введите формулу раскроя"

8. print (checkbox)
   - Label: "Печать"

9. sticker (checkbox)
   - Label: "Стикер"

10. manual (checkbox)
    - Label: "В ручную"

11. allowance (number)
    - Label: "Припуск (мм)"
    - Min: 0
    - Step: 0.01
    - Format: XX.00

#### Form Validation
- Disable submit button until all required fields filled
- Show error messages immediately on blur
- Highlight invalid fields in red
- Show success message after submission
- Clear form after successful submission

#### Form Submission
1. Validate all fields
2. Generate order_id (auto-increment)
3. Get user_id from session
4. Set status: "Создана"
5. Set timestamps: created_at, updated_at
6. Insert into order sheet
7. Create notification for Начальник
8. Show success message
9. Clear form
10. Offer to create another or view orders

### Automatic Functions

#### User Creation
- Auto-assign user_id (formula: =MAX(A:A)+1)
- Auto-set created_at (formula: =NOW())
- Role must be selected manually
- Generate salt automatically
- Hash password with salt

#### Online Status
- Update sessions sheet on every user action
- last_activity = current timestamp
- is_online = TRUE if last_activity < 5 minutes ago
- Background script checks every minute

### Data Storage

#### Google Sheets
- All user data in sheets (see architecture skill)
- Atomic operations (no partial writes)
- Transaction-like behavior for critical operations

#### Google Drive
- Chat files: /Step-to-Step/Chat-Files/YYYY/MM/
- Naming: {timestamp}_{user_id}_{original_name}
- Permissions: only project users can access

## Performance Requirements

### Load Times
- Initial page load: < 3 seconds
- Form submission: < 2 seconds
- Chat message send: < 1 second
- File upload: depends on size

### Optimization
- Minimize Apps Script API calls
- Cache user data in sessionStorage
- Lazy load chat history (last 50 messages)
- Compress images before upload

### Error Handling
- Never show technical errors to user
- Log all errors to errors sheet
- Show friendly error messages
- Retry failed operations (up to 3 times)

## Security Requirements

### Password Handling
- Hash with SHA-256 + salt
- Salt: unique per user, random 32 chars
- Never log passwords
- Never send passwords in URLs

### Session Management
- Session token in sessionStorage
- Validate session on every request
- Timeout: 30 minutes
- Clear session on logout

### Authorization
- Check role on every protected action
- Админ: can create/edit/delete orders
- Начальник: can view/change status
- Работник: can view assigned, update status

### Data Validation
- Server-side validation always
- Client-side for UX only
- Sanitize all inputs
- Prevent SQL injection (not applicable but good practice)

## Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile: iOS Safari 14+, Chrome Android 90+

## Accessibility
- Keyboard navigation support
- ARIA labels on interactive elements
- Focus indicators visible
- Minimum contrast ratio: 4.5:1
- Font size minimum: 14px

## Priority Order (from interview)

### Phase 1: Critical Bugs (URGENT)
1. Menu highlighting fix
2. Form field sizing and structure
3. Mobile responsiveness
4. Chat input field sizing

### Phase 2: Chat Functionality
1. Message sending and storage
2. File attachments
3. Read/delivery indicators
4. User selector with online status

### Phase 3: Admin Cabinet
1. Three cutting order forms
2. Field validation
3. Data storage in order sheet
4. Form submission flow

### Phase 4: Notifications
1. Notification system architecture
2. Chat notifications
3. Order notifications
4. In-app notification UI

## Testing Checklist

Before requesting user approval, test:

- [ ] Desktop (1920x1080)
- [ ] Tablet (768x1024)
- [ ] Mobile (375x667)
- [ ] All forms submit correctly
- [ ] Data appears in sheets
- [ ] Chat sends messages
- [ ] Files upload successfully
- [ ] Notifications appear
- [ ] No console errors
- [ ] Buttons animate on hover
- [ ] Loading states work
- [ ] Error messages display
- [ ] Success messages display

## Code Quality Standards

### JavaScript
- Use ES6+ features (const, let, arrow functions)
- No var declarations
- Async/await for promises
- Error handling with try-catch
- Descriptive function names

### HTML
- Semantic elements (header, main, footer, nav)
- Accessible form labels
- Valid HTML5
- No inline styles (use classes)

### CSS
- Mobile-first approach
- CSS Grid or Flexbox for layouts
- CSS variables for colors/spacing
- BEM naming convention (optional but preferred)
- Animations with CSS transitions

### Google Apps Script
- Modular functions (single responsibility)
- Error handling in all functions
- Logging for debugging
- Comments for complex logic
- Consistent naming conventions