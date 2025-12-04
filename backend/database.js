const fs = require('fs');
const path = require('path');

// Путь к файлу базы данных
const dbPath = path.join(__dirname, 'database.json');

// Структура базы данных
let db = {
    rides: [],
    bookings: []
};

// Загрузить данные из файла
function loadDatabase() {
    try {
        if (fs.existsSync(dbPath)) {
            const data = fs.readFileSync(dbPath, 'utf8');
            db = JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading database:', error);
        db = { rides: [], bookings: [] };
    }
}

// Сохранить данные в файл
function saveDatabase() {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving database:', error);
    }
}

// Создание таблиц при первом запуске
function initializeDatabase() {
    loadDatabase();
    console.log('✅ Database initialized');
}

// Получить все активные поездки
function getAllRides() {
    loadDatabase();
    return db.rides.filter(ride => ride.is_active);
}

// Получить поездки водителя
function getRidesByDriver(driverTelegramId) {
    loadDatabase();
    return db.rides.filter(ride => 
        ride.driver_telegram_id === driverTelegramId && ride.is_active
    );
}

// Создать новую поездку
function createRide(rideData) {
    loadDatabase();
    
    const newRide = {
        id: db.rides.length > 0 ? Math.max(...db.rides.map(r => r.id)) + 1 : 1,
        driver_name: rideData.driver_name,
        driver_telegram_id: rideData.driver_telegram_id,
        route: rideData.route,
        departure_time: rideData.departure_time,
        available_seats: rideData.available_seats,
        total_seats: rideData.available_seats,
        price: rideData.price,
        car_info: rideData.car_info || null,
        car_number: rideData.car_number || null,
        telegram_username: rideData.telegram_username || null,
        car_photo: rideData.car_photo || null,
        description: rideData.description || null,
        location_lat: rideData.location_lat || null,
        location_lon: rideData.location_lon || null,
        created_at: new Date().toISOString(),
        is_active: true,
        bookings_count: 0
    };
    
    db.rides.push(newRide);
    saveDatabase();
    
    return newRide.id;
}

// Удалить поездку
function deleteRide(rideId) {
    loadDatabase();
    
    const ride = db.rides.find(r => r.id === rideId);
    if (ride) {
        ride.is_active = false;
        saveDatabase();
    }
    
    return { changes: ride ? 1 : 0 };
}

// Получить поездку по ID
function getRideById(rideId) {
    loadDatabase();
    return db.rides.find(r => r.id === rideId && r.is_active);
}

// Создать бронирование
function createBooking(bookingData) {
    loadDatabase();
    
    const newBooking = {
        id: db.bookings.length > 0 ? Math.max(...db.bookings.map(b => b.id)) + 1 : 1,
        ride_id: bookingData.ride_id,
        passenger_telegram_id: bookingData.passenger_telegram_id,
        passenger_name: bookingData.passenger_name,
        passenger_username: bookingData.passenger_username || null,
        created_at: new Date().toISOString(),
        status: 'pending'
    };
    
    db.bookings.push(newBooking);
    
    // Уменьшаем количество мест
    const ride = db.rides.find(r => r.id === bookingData.ride_id);
    if (ride) {
        ride.available_seats -= 1;
        ride.bookings_count = (ride.bookings_count || 0) + 1;
        
        // Если мест не осталось, помечаем как неактивную
        if (ride.available_seats <= 0) {
            ride.is_active = false;
        }
    }
    
    saveDatabase();
    
    return newBooking.id;
}

// Получить бронирования для поездки
function getBookingsByRide(rideId) {
    loadDatabase();
    return db.bookings.filter(b => b.ride_id === rideId);
}

// Получить бронирования пользователя
function getBookingsByUser(userTelegramId) {
    loadDatabase();
    const userBookings = db.bookings.filter(b => b.passenger_telegram_id === userTelegramId);
    
    // Добавляем информацию о поездке к каждому бронированию
    return userBookings.map(booking => {
        const ride = db.rides.find(r => r.id === booking.ride_id);
        return {
            ...booking,
            ride_route: ride?.route || '',
            ride_time: ride?.departure_time || '',
            ride_price: ride?.price || 0,
            driver_name: ride?.driver_name || '',
            driver_username: ride?.telegram_username || '',
            car_info: ride?.car_info || '',
            car_number: ride?.car_number || '',
            description: ride?.description || '',
            location_lat: ride?.location_lat || null,
            location_lon: ride?.location_lon || null
        };
    });
}

// Удалить бронирование
function deleteBooking(bookingId) {
    loadDatabase();
    
    const booking = db.bookings.find(b => b.id === bookingId);
    if (booking) {
        // Возвращаем место
        const ride = db.rides.find(r => r.id === booking.ride_id);
        if (ride) {
            ride.available_seats += 1;
            ride.bookings_count = Math.max(0, (ride.bookings_count || 0) - 1);
            ride.is_active = true; // Снова делаем активной
        }
        
        // Удаляем бронирование
        db.bookings = db.bookings.filter(b => b.id !== bookingId);
        saveDatabase();
    }
    
    return { changes: booking ? 1 : 0 };
}

// Экспорт функций
module.exports = {
    initializeDatabase,
    getAllRides,
    getRidesByDriver,
    createRide,
    deleteRide,
    getRideById,
    createBooking,
    getBookingsByRide,
    getBookingsByUser,
    deleteBooking
};
