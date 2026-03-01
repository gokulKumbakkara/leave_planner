/**
 * Leave Tracker — Frontend Logic
 */

let currentYear = new Date().getFullYear();
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let currentMode = 'leave'; // 'leave', 'planned', or 'holiday'
let appData = null;

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
    loadData();

    document.getElementById('carry-forward').addEventListener('change', async (e) => {
        let val = parseInt(e.target.value);
        if (isNaN(val) || val < 0) val = 0;
        e.target.value = val;
        await updateSetting({ carry_forward: val });
    });
});

// ---- Year Selector ----
function changeYear(delta) {
    currentYear += delta;
    document.getElementById('year-display').textContent = currentYear;
    loadData();
}

// ---- Data Loading ----
async function loadData() {
    try {
        const res = await fetch(`/api/leaves?year=${currentYear}`);
        appData = await res.json();

        document.getElementById('carry-forward').value = appData.carry_forward;
        document.getElementById('year-display').textContent = currentYear;

        renderStats();
        renderCalendar();
        renderProjections();
        renderHolidayManager();
        renderHistory();
    } catch (err) {
        showToast('Failed to load data', 'error');
        console.error(err);
    }
}

// ---- Settings ----
async function updateSetting(payload) {
    try {
        const res = await fetch(`/api/settings?year=${currentYear}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            await loadData();
        } else {
            showToast('Failed to save', 'error');
        }
    } catch (err) {
        showToast('Network error', 'error');
    }
}

// ---- Mode Toggle ----
function setMode(mode) {
    currentMode = mode;
    document.getElementById('mode-leave').classList.toggle('active', mode === 'leave');
    document.getElementById('mode-planned').classList.toggle('active', mode === 'planned');
    document.getElementById('mode-holiday').classList.toggle('active', mode === 'holiday');

    const plannedBtn = document.getElementById('mode-planned');
    const holidayBtn = document.getElementById('mode-holiday');
    plannedBtn.classList.toggle('planned-mode', mode === 'planned');
    holidayBtn.classList.toggle('holiday-mode', mode === 'holiday');
}

// ---- Stats ----
function renderStats() {
    document.getElementById('stat-balance').textContent = appData.balance;
    document.getElementById('stat-holidays').textContent = appData.holidays.length;
}

function editBalance() {
    const currentVal = appData.balance;
    // Use a styled modal instead of prompt()
    const existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal">
      <h3>Edit Balance</h3>
      <input type="number" id="modal-input" min="0" value="${currentVal}" autocomplete="off" />
      <div class="modal-actions">
        <button class="modal-btn secondary" id="modal-cancel">Cancel</button>
        <button class="modal-btn primary" id="modal-confirm">Save</button>
      </div>
    </div>
  `;

    document.body.appendChild(overlay);
    const input = document.getElementById('modal-input');
    input.focus();
    input.select();

    document.getElementById('modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const save = () => {
        const num = parseInt(input.value);
        if (isNaN(num) || num < 0) return;
        overlay.remove();
        updateSetting({ balance_override: num });
    };

    document.getElementById('modal-confirm').addEventListener('click', save);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') overlay.remove();
    });
}

function resetBalance() {
    updateSetting({ balance_override: 0 });
}

// ---- Calendar ----
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    const leaveSet = new Set(appData.leaves.map(l => l.date));
    const plannedSet = new Set(appData.planned_leaves.map(p => p.date));
    const holidaySet = new Set(appData.holidays.map(h => h.date));
    const leaveMap = {};
    const plannedMap = {};
    const holidayMap = {};
    appData.leaves.forEach(l => { leaveMap[l.date] = l.reason; });
    appData.planned_leaves.forEach(p => { plannedMap[p.date] = p.reason; });
    appData.holidays.forEach(h => { holidayMap[h.date] = h.name; });

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    for (let month = 0; month < 12; month++) {
        const card = document.createElement('div');
        card.className = 'month-card';

        const monthName = document.createElement('div');
        monthName.className = 'month-name';
        monthName.textContent = MONTH_NAMES[month];
        card.appendChild(monthName);

        const dayHeaders = document.createElement('div');
        dayHeaders.className = 'day-headers';
        DAY_LABELS.forEach(d => {
            const hdr = document.createElement('div');
            hdr.className = 'day-header';
            hdr.textContent = d;
            dayHeaders.appendChild(hdr);
        });
        card.appendChild(dayHeaders);

        const daysGrid = document.createElement('div');
        daysGrid.className = 'days-grid';

        const firstDay = new Date(currentYear, month, 1).getDay();
        const daysInMonth = new Date(currentYear, month + 1, 0).getDate();

        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement('div');
            empty.className = 'day-cell empty';
            daysGrid.appendChild(empty);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayOfWeek = new Date(currentYear, month, day).getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            const cell = document.createElement('div');
            cell.className = 'day-cell';
            cell.textContent = day;

            if (isWeekend) cell.classList.add('weekend');
            if (dateStr === todayStr) cell.classList.add('today');

            const isLeave = leaveSet.has(dateStr);
            const isPlanned = plannedSet.has(dateStr);
            const isHoliday = holidaySet.has(dateStr);

            if (isLeave) {
                cell.classList.add('leave');
                if (leaveMap[dateStr]) cell.setAttribute('data-tooltip', leaveMap[dateStr]);
            }
            if (isPlanned) {
                cell.classList.add('planned');
                if (plannedMap[dateStr]) cell.setAttribute('data-tooltip', plannedMap[dateStr]);
            }
            if (isHoliday) {
                cell.classList.add('holiday');
                if (holidayMap[dateStr]) cell.setAttribute('data-tooltip', holidayMap[dateStr]);
            }

            if (!isWeekend) {
                cell.addEventListener('click', () => handleDayClick(dateStr, isLeave, isPlanned, isHoliday));
            }

            daysGrid.appendChild(cell);
        }

        card.appendChild(daysGrid);
        grid.appendChild(card);
    }
}

// ---- Day Click ----
async function handleDayClick(dateStr, isLeave, isPlanned, isHoliday) {
    if (currentMode === 'leave') {
        if (isHoliday) { showToast('Already a holiday', 'info'); return; }
        if (isPlanned) {
            showModal('Confirm Leave', dateStr, 'Reason (optional)', async (reason, dayVal) => {
                await markLeave(dateStr, reason, dayVal);
            }, true);
            return;
        }
        if (isLeave) {
            await unmarkeLeave(dateStr);
        } else {
            showModal('Mark Leave', dateStr, 'Reason (optional)', async (reason, dayVal) => {
                await markLeave(dateStr, reason, dayVal);
            }, true);
        }
    } else if (currentMode === 'planned') {
        if (isHoliday) { showToast('Already a holiday', 'info'); return; }
        if (isLeave) { showToast('Already a confirmed leave', 'info'); return; }
        if (isPlanned) {
            await unmarkPlanned(dateStr);
        } else {
            showModal('Mark Planned Leave', dateStr, 'Reason (optional)', async (reason, dayVal) => {
                await markPlanned(dateStr, reason, dayVal);
            }, true);
        }
    } else {
        if (isLeave) { showToast('Already a leave', 'info'); return; }
        if (isPlanned) { showToast('Already a planned leave', 'info'); return; }
        if (isHoliday) {
            await unmarkHoliday(dateStr);
        } else {
            showModal('Mark Holiday', dateStr, 'Holiday name (optional)', async (name) => {
                await markHoliday(dateStr, name);
            });
        }
    }
}

// ---- API Calls ----
async function markLeave(dateStr, reason, value = 1) {
    try {
        const res = await fetch(`/api/leaves/mark?year=${currentYear}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: dateStr, reason: reason || '', value: value })
        });
        if (!res.ok) {
            const data = await res.json();
            showToast(data.detail || 'Failed', 'error');
            return;
        }
        await loadData();
    } catch (err) { showToast('Network error', 'error'); }
}

async function unmarkeLeave(dateStr) {
    try {
        const res = await fetch(`/api/leaves/${dateStr}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json();
            showToast(data.detail || 'Failed', 'error');
            return;
        }
        await loadData();
    } catch (err) { showToast('Network error', 'error'); }
}

async function markPlanned(dateStr, reason, value = 1) {
    try {
        const res = await fetch(`/api/planned/mark?year=${currentYear}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: dateStr, reason: reason || '', value: value })
        });
        if (!res.ok) {
            const data = await res.json();
            showToast(data.detail || 'Failed', 'error');
            return;
        }
        await loadData();
    } catch (err) { showToast('Network error', 'error'); }
}

async function unmarkPlanned(dateStr) {
    try {
        const res = await fetch(`/api/planned/${dateStr}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json();
            showToast(data.detail || 'Failed', 'error');
            return;
        }
        await loadData();
    } catch (err) { showToast('Network error', 'error'); }
}

async function markHoliday(dateStr, name) {
    try {
        const res = await fetch(`/api/holidays/mark?year=${currentYear}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: dateStr, name: name || '' })
        });
        if (!res.ok) {
            const data = await res.json();
            showToast(data.detail || 'Failed', 'error');
            return;
        }
        await loadData();
    } catch (err) { showToast('Network error', 'error'); }
}

async function unmarkHoliday(dateStr) {
    try {
        const res = await fetch(`/api/holidays/${dateStr}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json();
            showToast(data.detail || 'Failed', 'error');
            return;
        }
        await loadData();
    } catch (err) { showToast('Network error', 'error'); }
}

async function deleteHolidayById(id) {
    try {
        const res = await fetch(`/api/holidays/id/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            showToast('Failed to delete', 'error');
            return;
        }
        await loadData();
    } catch (err) { showToast('Network error', 'error'); }
}

// ---- History ----
function renderHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '';

    const items = [
        ...appData.leaves.map(l => ({ ...l, type: 'leave' })),
        ...appData.planned_leaves.map(p => ({ ...p, type: 'planned' })),
        ...appData.holidays.map(h => ({ ...h, type: 'holiday', reason: h.name }))
    ];

    items.sort((a, b) => a.date.localeCompare(b.date));

    if (items.length === 0) {
        list.innerHTML = '<li class="history-empty">No leaves or holidays marked yet.</li>';
        return;
    }

    items.forEach(item => {
        const li = document.createElement('li');
        li.className = `history-item ${item.type}-item`;

        const left = document.createElement('div');
        const dateText = document.createElement('span');
        dateText.className = 'date-text';
        dateText.textContent = formatDate(item.date);
        left.appendChild(dateText);

        if (item.reason || item.name) {
            const reasonText = document.createElement('span');
            reasonText.className = 'reason-text';
            reasonText.textContent = ` — ${item.reason || item.name}`;
            left.appendChild(reasonText);
        }

        const badge = document.createElement('span');
        badge.className = 'badge';
        if (item.type === 'leave') badge.textContent = 'Leave';
        else if (item.type === 'planned') badge.textContent = 'Planned';
        else badge.textContent = 'Holiday';

        li.appendChild(left);
        li.appendChild(badge);
        list.appendChild(li);
    });
}

// ---- Projections ----
function renderProjections() {
    const tbody = document.getElementById('projection-tbody');
    tbody.innerHTML = '';
    if (!appData.projections) return;

    appData.projections.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${MONTH_NAMES[p.month - 1]}</td>
      <td style="color: var(--accent-green)">${p.added > 0 ? '+' + p.added : '—'}</td>
      <td style="color: var(--accent-coral)">${p.taken > 0 ? '-' + p.taken : '—'}</td>
      <td style="font-weight: 700; color: ${p.balance > 0 ? 'var(--accent-green)' : 'var(--accent-coral)'}">${p.balance}</td>
    `;
        tbody.appendChild(tr);
    });
}

// ---- Holiday Manager ----
function renderHolidayManager() {
    const list = document.getElementById('holiday-manager-list');
    list.innerHTML = '';

    if (appData.holidays.length === 0) {
        list.innerHTML = '<li class="history-empty">No holidays added yet.</li>';
        return;
    }

    appData.holidays.forEach(h => {
        const li = document.createElement('li');
        li.className = 'hm-item';
        li.innerHTML = `
      <div class="hm-info">
        <span class="hm-name">${h.name || 'Holiday'}</span>
        <span class="hm-date">${formatDate(h.date)}</span>
      </div>
      <button class="hm-delete" onclick="deleteHolidayById(${h.id})" title="Delete">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18"></path>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;
        list.appendChild(li);
    });
}

function promptAddHoliday() {
    const existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal">
      <h3>Add Holiday</h3>
      <input type="date" id="modal-date-input" value="${currentYear}-01-01" />
      <input type="text" id="modal-name-input" placeholder="Holiday name (e.g., Independence Day)" autocomplete="off" />
      <div class="modal-actions">
        <button class="modal-btn secondary" id="modal-cancel">Cancel</button>
        <button class="modal-btn primary" id="modal-confirm">Add</button>
      </div>
    </div>
  `;

    document.body.appendChild(overlay);
    document.getElementById('modal-name-input').focus();

    document.getElementById('modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    document.getElementById('modal-confirm').addEventListener('click', async () => {
        const dVal = document.getElementById('modal-date-input').value;
        const nVal = document.getElementById('modal-name-input').value.trim();
        if (!dVal) return;
        overlay.remove();
        await markHoliday(dVal, nVal);
    });
}

// ---- Modal ----
function showModal(title, dateStr, placeholder, onConfirm, showDayToggle = false) {
    const existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();

    const toggleHTML = showDayToggle ? `
      <div class="day-toggle">
        <button class="day-toggle-btn active" id="toggle-full" onclick="setDayToggle(1)">Full Day</button>
        <button class="day-toggle-btn" id="toggle-half" onclick="setDayToggle(0.5)">Half Day</button>
      </div>
    ` : '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal">
      <h3>${title} — ${formatDate(dateStr)}</h3>
      ${toggleHTML}
      <input type="text" id="modal-input" placeholder="${placeholder}" autocomplete="off" />
      <div class="modal-actions">
        <button class="modal-btn secondary" id="modal-cancel">Cancel</button>
        <button class="modal-btn primary" id="modal-confirm">Confirm</button>
      </div>
    </div>
  `;

    document.body.appendChild(overlay);
    overlay._dayValue = 1;
    document.getElementById('modal-input').focus();

    document.getElementById('modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    document.getElementById('modal-confirm').addEventListener('click', () => {
        const val = document.getElementById('modal-input').value.trim();
        const dayVal = overlay._dayValue;
        overlay.remove();
        onConfirm(val, dayVal);
    });

    document.getElementById('modal-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = document.getElementById('modal-input').value.trim();
            const dayVal = overlay._dayValue;
            overlay.remove();
            onConfirm(val, dayVal);
        }
        if (e.key === 'Escape') overlay.remove();
    });
}

function setDayToggle(val) {
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) overlay._dayValue = val;
    document.getElementById('toggle-full').classList.toggle('active', val === 1);
    document.getElementById('toggle-half').classList.toggle('active', val === 0.5);
}

// ---- Toast ----
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3000);
}

// ---- Helpers ----
function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
