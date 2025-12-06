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

// Получить поездки водителя (показывает все, даже с 0 местами)
function getRidesByDriver(driverTelegramId) {
    loadDatabase();
    // Водитель видит все свои активные поездки, независимо от available_seats
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
        departure_date: rideData.departure_date || null,
        departure_time: rideData.departure_time,
        available_seats: rideData.available_seats,
        total_seats: rideData.available_seats,
        price: rideData.price,
        car_info: rideData.car_info || null,
        car_number: rideData.car_number || null,
        telegram_username: rideData.telegram_username || null,
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
        
        // Получаем всех пассажиров этой поездки для уведомлений
        const passengers = db.bookings
            .filter(b => b.ride_id === rideId)
            .map(b => ({
                telegram_id: b.passenger_telegram_id,
                name: b.passenger_name,
                username: b.passenger_username
            }));
        
        // Удаляем все бронирования этой поездки
        db.bookings = db.bookings.filter(b => b.ride_id !== rideId);
        
        saveDatabase();
        
        return { changes: 1, passengers };
    }
    
    return { changes: 0, passengers: [] };
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
        
        // Поездка остается active, но скроется для пассажиров через available_seats
        // Водитель продолжает видеть поездку
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
            ride_date: ride?.departure_date || '',
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
            // Поездка остается active - водитель ее видит
        }
        
        // Удаляем бронирование
        db.bookings = db.bookings.filter(b => b.id !== bookingId);
        saveDatabase();
    }
    
    return { changes: booking ? 1 : 0 };
}

// Автоудаление устаревших поездок (через 20 минут после отправления)
function cleanupExpiredRides() {
    loadDatabase();
    
    const now = new Date();
    let deletedCount = 0;
    
    db.rides.forEach(ride => {
        if (!ride.is_active || !ride.departure_date || !ride.departure_time) return;
        
        // Создаем дату отправления + 20 минут
        const [hours, minutes] = ride.departure_time.split(':');
        const departureDateTime = new Date(ride.departure_date);
        departureDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        
        // Добавляем 20 минут
        const expirationTime = new Date(departureDateTime.getTime() + 20 * 60 * 1000);
        
        // Если прошло более 20 минут - удаляем
        if (now > expirationTime) {
            ride.is_active = false;
            // Удаляем все бронирования этой поездки
            db.bookings = db.bookings.filter(b => b.ride_id !== ride.id);
            deletedCount++;
        }
    });
    
    if (deletedCount > 0) {
        saveDatabase();
        console.log(`🧹 Cleaned up ${deletedCount} expired ride(s)`);
    }
    
    return deletedCount;
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
    deleteBooking,
    cleanupExpiredRides
};
