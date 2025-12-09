const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const statusMessage = document.getElementById('status-message');
const loginForm = document.getElementById('login-form');
const tokenInput = document.getElementById('admin-token');
const ridesTableBody = document.querySelector('#rides-table tbody');
const bookingsTableBody = document.querySelector('#bookings-table tbody');
const ridesCountEl = document.getElementById('rides-count');
const activeRidesCountEl = document.getElementById('active-rides-count');
const bookingsCountEl = document.getElementById('bookings-count');
const refreshButton = document.getElementById('refresh-data');
const cleanupButton = document.getElementById('cleanup-expired');
const logoutButton = document.getElementById('logout');

let currentToken = '';

function setStatus(message, type = '') {
    statusMessage.textContent = message;
    statusMessage.className = `status${type ? ` ${type}` : ''}`;
}

function formatDateTime(value) {
    if (!value) {
        return '—';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString();
}

function toggleView(showDashboard) {
    if (showDashboard) {
        loginSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');
    } else {
        dashboardSection.classList.add('hidden');
        loginSection.classList.remove('hidden');
    }
}

async function fetchAdmin(url, options = {}) {
    const headers = options.headers ? { ...options.headers } : {};
    headers['x-admin-token'] = currentToken;
    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        throw new Error('UNAUTHORIZED');
    }

    if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(payload.error || 'Ошибка запроса');
    }

    return response.json();
}

function renderRides(rides) {
    ridesTableBody.innerHTML = '';
    if (rides.length === 0) {
        ridesTableBody.innerHTML = '<tr><td colspan="8">Нет данных</td></tr>';
        return;
    }

    rides.forEach(ride => {
        const row = document.createElement('tr');
        const active = ride.is_active;
        row.innerHTML = `
            <td>${ride.id}</td>
            <td>${ride.driver_name || '—'}<br><small>${ride.driver_telegram_id || '—'}</small></td>
            <td>${ride.route || '—'}</td>
            <td>${ride.departure_date || '—'}</td>
            <td>${ride.departure_time || '—'}</td>
            <td>${ride.available_seats}/${ride.total_seats}</td>
            <td>${ride.price != null ? `${ride.price} ₽` : '—'}</td>
            <td><span class="badge${active ? '' : ' inactive'}">${active ? 'Активна' : 'Закрыта'}</span></td>
        `;
        ridesTableBody.appendChild(row);
    });
}

function renderBookings(bookings) {
    bookingsTableBody.innerHTML = '';
    if (bookings.length === 0) {
        bookingsTableBody.innerHTML = '<tr><td colspan="7">Нет данных</td></tr>';
        return;
    }

    bookings.forEach(booking => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${booking.id}</td>
            <td>${booking.ride_id}</td>
            <td>${booking.passenger_name || '—'}<br><small>${booking.passenger_telegram_id || '—'}</small></td>
            <td>${booking.passenger_username ? `@${booking.passenger_username}` : '—'}</td>
            <td>${booking.status || '—'}</td>
            <td>${formatDateTime(booking.created_at)}</td>
            <td>${formatDateTime(booking.updated_at)}</td>
        `;
        bookingsTableBody.appendChild(row);
    });
}

async function loadData(silent = false) {
    try {
        if (!silent) {
            setStatus('Загружаем данные...');
        }
        const [ridesResponse, bookingsResponse] = await Promise.all([
            fetchAdmin('/api/admin/rides'),
            fetchAdmin('/api/admin/bookings')
        ]);
        const rides = ridesResponse.rides || [];
        const bookings = bookingsResponse.bookings || [];

        renderRides(rides);
        renderBookings(bookings);

        ridesCountEl.textContent = rides.length;
        activeRidesCountEl.textContent = rides.filter(r => r.is_active).length;
        bookingsCountEl.textContent = bookings.length;

        setStatus('Данные обновлены', 'success');
        return true;
    } catch (error) {
        if (error.message === 'UNAUTHORIZED') {
            setStatus('Токен недействителен. Введите новый токен.', 'error');
            localStorage.removeItem('adminToken');
            currentToken = '';
            toggleView(false);
        } else {
            setStatus(error.message || 'Ошибка загрузки данных', 'error');
        }
        return false;
    }
}

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const token = tokenInput.value.trim();
    if (!token) {
        setStatus('Введите токен', 'error');
        return;
    }

    currentToken = token;
    const ok = await loadData();
    if (ok) {
        localStorage.setItem('adminToken', token);
        toggleView(true);
    }
});

refreshButton.addEventListener('click', () => {
    if (!currentToken) {
        setStatus('Сначала войдите с токеном', 'error');
        toggleView(false);
        return;
    }
    loadData();
});

cleanupButton.addEventListener('click', async () => {
    if (!currentToken) {
        setStatus('Сначала войдите с токеном', 'error');
        toggleView(false);
        return;
    }

    try {
        setStatus('Запускаем очистку...');
        const response = await fetchAdmin('/api/admin/cleanup', {
            method: 'POST'
        });
        const count = response.deletedCount ?? 0;
        setStatus(`Удалено поездок: ${count}`, 'success');
        await loadData(true);
    } catch (error) {
        if (error.message === 'UNAUTHORIZED') {
            setStatus('Токен недействителен. Введите новый токен.', 'error');
            localStorage.removeItem('adminToken');
            currentToken = '';
            toggleView(false);
        } else {
            setStatus(error.message || 'Ошибка очистки', 'error');
        }
    }
});

logoutButton.addEventListener('click', () => {
    localStorage.removeItem('adminToken');
    currentToken = '';
    tokenInput.value = '';
    setStatus('Вы вышли из панели');
    toggleView(false);
});

(function bootstrap() {
    const storedToken = localStorage.getItem('adminToken');
    if (storedToken) {
        currentToken = storedToken;
        tokenInput.value = storedToken;
        toggleView(true);
        loadData();
    } else {
        toggleView(false);
    }
})();
