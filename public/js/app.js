// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// API URL
const API_URL = window.location.origin;

// Глобальные переменные
let currentUser = null;
let allRides = [];
let userLocation = null;
let userBookings = [];

// Функция форматирования даты
function formatDate(dateString) {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}.${month}`;
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // Получаем данные пользователя из Telegram
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        currentUser = tg.initDataUnsafe.user;
        console.log('User:', currentUser);
    } else {
        // Для тестирования без Telegram - используем данные из localStorage или создаём нового
        const savedUser = localStorage.getItem('testUser');
        if (savedUser) {
            currentUser = JSON.parse(savedUser);
        } else {
            // Создаём тестового пользователя
            currentUser = {
                id: Math.floor(Math.random() * 1000000),
                first_name: 'Тестовый пользователь',
                username: 'test_user_' + Date.now()
            };
            localStorage.setItem('testUser', JSON.stringify(currentUser));
        }
    }

    // Применяем тему Telegram
    applyTelegramTheme();

    // Показываем начальный экран
    showScreen('role-selection');
}

function applyTelegramTheme() {
    if (tg.themeParams) {
        // Можно применить цвета темы Telegram
        // document.documentElement.style.setProperty('--bg-dark', tg.themeParams.bg_color);
    }
}

// Управление экранами
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');

    // Настройка кнопок Telegram
    if (screenId === 'role-selection') {
        tg.BackButton.hide();
    } else {
        tg.BackButton.show();
        tg.BackButton.onClick(() => showScreen('role-selection'));
    }
}

// Выбор роли
function selectRole(role) {
    if (role === 'passenger') {
        showScreen('passenger-screen');
        loadRides();
        loadUserBookings();
    } else if (role === 'driver') {
        showScreen('driver-screen');
        loadDriverRides();
        
        // Автозаполнение Telegram username
        console.log('🔍 Current user for autofill:', currentUser);
        console.log('📝 Username:', currentUser.username);
        
        const usernameInput = document.getElementById('telegram-username');
        if (currentUser && currentUser.username) {
            usernameInput.value = '@' + currentUser.username;
            console.log('✅ Username autofilled:', usernameInput.value);
        } else {
            console.warn('⚠️ No username found in user data');
            usernameInput.value = '';
            usernameInput.placeholder = '@username (установите username в Telegram)';
        }
        
        // Устанавливаем сегодняшнюю дату по умолчанию и минимальную дату
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('departure-date');
        dateInput.value = today;
        dateInput.min = today; // Запрещаем выбор прошедших дат
    }
}

// Загрузка поездок для пассажиров
async function loadRides() {
    const ridesList = document.getElementById('rides-list');
    ridesList.innerHTML = '<div class="loading">Загрузка поездок...</div>';

    try {
        const response = await fetch(`${API_URL}/api/rides`);
        const data = await response.json();
        
        if (data.success && data.rides.length > 0) {
            allRides = data.rides;
            displayRides(allRides);
        } else {
            ridesList.innerHTML = '<div class="empty-state">Пока нет доступных поездок</div>';
        }
    } catch (error) {
        console.error('Error loading rides:', error);
        ridesList.innerHTML = '<div class="empty-state">Ошибка загрузки поездок</div>';
    }
}

// Отображение поездок
function displayRides(rides) {
    const ridesList = document.getElementById('rides-list');
    
    if (rides.length === 0) {
        ridesList.innerHTML = '<div class="empty-state">Нет поездок по выбранным фильтрам</div>';
        return;
    }

    ridesList.innerHTML = rides.map(ride => `
        <div class="ride-card" onclick="showRideDetails(${ride.id})">
            <div class="ride-header">
                <div>
                    <div class="ride-route">${ride.route}</div>
                    <div style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 5px;">
                        ${ride.driver_name} ${ride.telegram_username || ''}
                    </div>
                </div>
                <div class="ride-time">
                    ${ride.departure_date ? formatDate(ride.departure_date) + ' ' : ''}${ride.departure_time}
                </div>
            </div>
            <div class="ride-info">
                <div class="ride-info-item">
                    <span>👥</span>
                    <span>${ride.available_seats} мест</span>
                </div>
                <div class="ride-info-item">
                    <span>💰</span>
                    <span>${ride.price} ₽</span>
                </div>
                ${ride.car_info ? `
                <div class="ride-info-item">
                    <span>🚗</span>
                    <span>${ride.car_info}</span>
                </div>
                ` : ''}
                ${ride.car_number ? `
                <div class="ride-info-item">
                    <span>🔢</span>
                    <span>${ride.car_number}</span>
                </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// Фильтрация поездок
function filterRides() {
    const routeFilter = document.getElementById('route-filter').value.toLowerCase();
    const dateFilter = document.getElementById('date-filter').value;
    const timeFilter = document.getElementById('time-filter').value;

    let filtered = allRides;

    if (routeFilter) {
        filtered = filtered.filter(ride => 
            ride.route.toLowerCase().includes(routeFilter)
        );
    }

    if (dateFilter) {
        filtered = filtered.filter(ride => ride.departure_date === dateFilter);
    }

    if (timeFilter) {
        filtered = filtered.filter(ride => ride.departure_time === timeFilter);
    }

    displayRides(filtered);
}

// Показать детали поездки
async function showRideDetails(rideId) {
    const ride = allRides.find(r => r.id === rideId);
    if (!ride) return;

    const modal = document.getElementById('ride-details-modal');
    const content = document.getElementById('ride-details-content');

    content.innerHTML = `
        <h2 style="color: var(--neon-cyan); margin-bottom: 20px;">Детали поездки</h2>
        
        <div style="margin-bottom: 20px;">
            <h3 style="color: var(--neon-magenta); font-size: 1.5rem;">${ride.route}</h3>
            <p style="color: var(--text-secondary);">Отправление: ${ride.departure_date ? formatDate(ride.departure_date) + ', ' : ''}${ride.departure_time}</p>
        </div>

        <div style="background: var(--bg-dark); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <p><strong>Водитель:</strong> ${ride.driver_name} ${ride.telegram_username ? `<a href="https://t.me/${ride.telegram_username.replace('@', '')}" target="_blank" style="color: var(--neon-cyan);">${ride.telegram_username}</a>` : ''}</p>
            <p><strong>Стоимость:</strong> ${ride.price} ₽</p>
            <p><strong>Доступно мест:</strong> ${ride.available_seats}</p>
            ${ride.car_info ? `<p><strong>Машина:</strong> ${ride.car_info}</p>` : ''}
            ${ride.car_number ? `<p><strong>Номер:</strong> ${ride.car_number}</p>` : ''}
            ${ride.description ? `<p><strong>Дополнительно:</strong> ${ride.description}</p>` : ''}
        </div>

        ${ride.location_lat && ride.location_lon ? `
            <div style="margin-bottom: 15px;">
                <p><strong>📍 Геолокация водителя</strong></p>
                <p style="font-size: 0.9rem; color: var(--text-secondary);">
                    ${ride.location_lat}, ${ride.location_lon}
                </p>
            </div>
        ` : ''}

        <button class="submit-btn" onclick="bookRide(${ride.id}, ${ride.driver_telegram_id})">
            Забронировать место
        </button>
    `;

    modal.classList.add('active');
}

// Закрыть модальное окно
function closeModal() {
    document.getElementById('ride-details-modal').classList.remove('active');
}

// Бронирование поездки
async function bookRide(rideId, driverTelegramId) {
    // Закрываем модальное окно сразу
    closeModal();
    
    // Показываем индикатор загрузки
    tg.MainButton.setText('Бронирование...');
    tg.MainButton.show();
    
    try {
        // Отправляем запрос на бронирование
        const response = await fetch(`${API_URL}/api/bookings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ride_id: rideId,
                passenger_telegram_id: currentUser.id,
                passenger_name: currentUser.first_name,
                passenger_username: currentUser.username
            })
        });

        const data = await response.json();

        if (data.success) {
            // Показываем уведомление об успехе
            tg.showPopup({
                title: '✅ Успешно!',
                message: 'Место забронировано! Водитель получил уведомление. Вы можете посмотреть детали в разделе "Мои бронирования".',
                buttons: [{type: 'ok'}]
            });
            
            // Отправляем уведомление водителю
            await fetch(`${API_URL}/api/notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    driver_telegram_id: driverTelegramId,
                    passenger_name: currentUser.first_name,
                    passenger_username: currentUser.username,
                    ride_id: rideId
                })
            });

            // Обновляем списки
            loadRides();
            loadUserBookings();
        } else {
            tg.showAlert('❌ ' + (data.error || 'Ошибка при бронировании'));
        }
    } catch (error) {
        console.error('Error booking ride:', error);
        tg.showAlert('❌ Ошибка при бронировании');
    } finally {
        tg.MainButton.hide();
    }
}

// Создание поездки водителем
async function createRide(event) {
    event.preventDefault();

    const btn = document.getElementById('create-ride-btn');
    btn.disabled = true;
    btn.textContent = 'Создание...';

    const formData = {
        driver_name: document.getElementById('driver-name').value,
        driver_telegram_id: currentUser.id,
        route: document.getElementById('route').value,
        departure_date: document.getElementById('departure-date').value,
        departure_time: document.getElementById('departure-time').value,
        available_seats: parseInt(document.getElementById('seats').value),
        price: parseInt(document.getElementById('price').value),
        car_info: document.getElementById('car-info').value,
        car_number: document.getElementById('car-number').value,
        telegram_username: document.getElementById('telegram-username').value,
        description: document.getElementById('description').value,
        location_lat: userLocation?.latitude || null,
        location_lon: userLocation?.longitude || null
    };

    try {
        const response = await fetch(`${API_URL}/api/rides`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            // Показываем уведомление
            tg.showPopup({
                title: '✅ Успешно!',
                message: 'Поездка создана! Пассажиры увидят вашу анкету.',
                buttons: [{type: 'ok'}]
            });
            
            // Очищаем форму
            document.getElementById('ride-form').reset();
            
            // Сразу обновляем список поездок водителя
            await loadDriverRides();
        } else {
            tg.showAlert('❌ Ошибка при создании поездки');
        }
    } catch (error) {
        console.error('Error creating ride:', error);
        tg.showAlert('❌ Ошибка при создании поездки');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Создать поездку';
    }
}

// Загрузка поездок водителя
async function loadDriverRides() {
    if (!currentUser) return;

    const driverRidesList = document.getElementById('driver-rides-list');
    
    try {
        const response = await fetch(`${API_URL}/api/rides/driver/${currentUser.id}`);
        const data = await response.json();

        if (data.success && data.rides.length > 0) {
            driverRidesList.innerHTML = data.rides.map(ride => `
                <div class="ride-card" style="position: relative;">
                    <div class="ride-route">${ride.route}</div>
                    <div style="margin-top: 10px;">
                        <p><strong>Дата и время:</strong> ${ride.departure_date ? formatDate(ride.departure_date) + ', ' : ''}${ride.departure_time}</p>
                        <p><strong>Мест доступно:</strong> ${ride.available_seats}</p>
                        <p><strong>Цена:</strong> ${ride.price} ₽</p>
                        <p><strong>Бронирований:</strong> ${ride.bookings_count || 0}</p>
                        <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 10px;">
                            Создано: ${new Date(ride.created_at).toLocaleString('ru-RU')}
                        </p>
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 15px;">
                        <button onclick="showRideBookings(${ride.id})" 
                                style="flex: 1; background: var(--neon-cyan); border: none; 
                                       color: var(--bg-dark); padding: 8px; border-radius: 5px; 
                                       cursor: pointer; font-weight: bold;">
                            Посмотреть заявки
                        </button>
                        <button onclick="deleteRide(${ride.id})" 
                                class="cancel-btn" style="flex: 1;">
                            Завершить поездку
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            driverRidesList.innerHTML = '<div class="empty-state">У вас пока нет активных поездок</div>';
        }
    } catch (error) {
        console.error('Error loading driver rides:', error);
        driverRidesList.innerHTML = '<div class="empty-state">Ошибка загрузки</div>';
    }
}

// Удаление поездки
async function deleteRide(rideId) {
    if (!confirm('Вы уверены, что хотите отменить эту поездку?')) return;

    try {
        const response = await fetch(`${API_URL}/api/rides/${rideId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            tg.showAlert('✅ Поездка отменена');
            loadDriverRides();
        }
    } catch (error) {
        console.error('Error deleting ride:', error);
        tg.showAlert('❌ Ошибка при удалении');
    }
}

// Показать бронирования для поездки водителя
async function showRideBookings(rideId) {
    try {
        const response = await fetch(`${API_URL}/api/bookings/ride/${rideId}`);
        const data = await response.json();

        const modal = document.getElementById('ride-details-modal');
        const content = document.getElementById('ride-details-content');

        if (data.success && data.bookings.length > 0) {
            content.innerHTML = `
                <h2 style="color: var(--neon-cyan); margin-bottom: 20px;">Заявки на поездку</h2>
                ${data.bookings.map(booking => `
                    <div style="background: var(--bg-dark); padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                        <p><strong>Пассажир:</strong> ${booking.passenger_name}</p>
                        <p><strong>Telegram:</strong> <a href="https://t.me/${booking.passenger_username}" target="_blank" style="color: var(--neon-cyan);">@${booking.passenger_username}</a></p>
                        <p><strong>Время заявки:</strong> ${new Date(booking.created_at).toLocaleString('ru-RU')}</p>
                        <span class="booking-status ${booking.status}">${booking.status === 'confirmed' ? 'Подтверждено' : 'Ожидает'}</span>
                    </div>
                `).join('')}
            `;
        } else {
            content.innerHTML = `
                <h2 style="color: var(--neon-cyan); margin-bottom: 20px;">Заявки на поездку</h2>
                <div class="empty-state">Пока нет заявок на эту поездку</div>
            `;
        }

        modal.classList.add('active');
    } catch (error) {
        console.error('Error loading bookings:', error);
        tg.showAlert('Ошибка при загрузке заявок');
    }
}

// Переключение вкладок пассажира
function showPassengerTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    if (tab === 'available') {
        document.querySelector('.tab-btn:first-child').classList.add('active');
        document.getElementById('available-rides-tab').classList.add('active');
    } else {
        document.querySelector('.tab-btn:last-child').classList.add('active');
        document.getElementById('booked-rides-tab').classList.add('active');
        loadUserBookings();
    }
}

// Загрузка забронированных поездок пассажира
async function loadUserBookings() {
    if (!currentUser) return;

    try {
        const response = await fetch(`${API_URL}/api/bookings/user/${currentUser.id}`);
        const data = await response.json();

        const bookedList = document.getElementById('booked-rides-list');

        if (data.success && data.bookings.length > 0) {
            userBookings = data.bookings;
            bookedList.innerHTML = data.bookings.map(booking => `
                <div class="ride-card">
                    <div class="ride-route">${booking.ride_route}</div>
                    <div style="margin-top: 10px;">
                        <p><strong>Водитель:</strong> ${booking.driver_name}</p>
                        <p><strong>Telegram:</strong> <a href="https://t.me/${booking.driver_username?.replace('@', '')}" style="color: var(--neon-cyan);">${booking.driver_username}</a></p>
                        <p><strong>Дата и время:</strong> ${booking.ride_date ? formatDate(booking.ride_date) + ', ' : ''}${booking.ride_time}</p>
                        <p><strong>Цена:</strong> ${booking.ride_price} ₽</p>
                        ${booking.car_info ? `<p><strong>Машина:</strong> ${booking.car_info}</p>` : ''}
                        ${booking.car_number ? `<p><strong>Номер:</strong> ${booking.car_number}</p>` : ''}
                        ${booking.description ? `<p><strong>Детали:</strong> ${booking.description}</p>` : ''}
                        
                        ${booking.location_lat && booking.location_lon ? `
                            <p style="margin-top: 10px;">
                                <strong>📍 Геолокация водителя:</strong><br>
                                <a href="https://yandex.ru/maps/?pt=${booking.location_lon},${booking.location_lat}&z=16&l=map" 
                                   target="_blank" 
                                   style="color: var(--neon-cyan); text-decoration: underline;">
                                    Открыть на Яндекс.Картах
                                </a>
                            </p>
                        ` : ''}
                        
                        <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 10px;">
                            Забронировано: ${new Date(booking.created_at).toLocaleString('ru-RU')}
                        </p>
                        <span class="booking-status ${booking.status}">${booking.status === 'confirmed' ? '✅ Подтверждено' : '⏳ Ожидает'}</span>
                    </div>
                    <button onclick="cancelBooking(${booking.id})" class="cancel-btn" style="width: 100%; margin-top: 10px;">
                        Отменить бронирование
                    </button>
                </div>
            `).join('');
        } else {
            bookedList.innerHTML = '<div class="empty-state">У вас пока нет забронированных мест</div>';
        }
    } catch (error) {
        console.error('Error loading bookings:', error);
    }
}

// Отмена бронирования
async function cancelBooking(bookingId) {
    if (!confirm('Вы уверены, что хотите отменить бронирование?')) return;

    try {
        const response = await fetch(`${API_URL}/api/bookings/${bookingId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            tg.showAlert('✅ Бронирование отменено');
            loadUserBookings();
            loadRides(); // Обновляем список доступных поездок
        }
    } catch (error) {
        console.error('Error cancelling booking:', error);
        tg.showAlert('❌ Ошибка при отмене');
    }
}

// Получение геолокации
document.getElementById('show-location')?.addEventListener('change', (e) => {
    if (e.target.checked) {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    userLocation = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    };
                    tg.showAlert('Геолокация получена');
                },
                (error) => {
                    console.error('Error getting location:', error);
                    e.target.checked = false;
                    tg.showAlert('Не удалось получить геолокацию');
                }
            );
        } else {
            e.target.checked = false;
            tg.showAlert('Геолокация не поддерживается');
        }
    } else {
        userLocation = null;
    }
});

// Закрытие модального окна по клику вне его
document.getElementById('ride-details-modal').addEventListener('click', (e) => {
    if (e.target.id === 'ride-details-modal') {
        closeModal();
    }
});
