require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const db = require('./database');

// Инициализация приложения
const app = express();
const PORT = process.env.PORT || 3000;

// Инициализация Telegram бота
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Инициализация базы данных
db.initializeDatabase();

// ============= API ENDPOINTS =============

// Health check endpoint для UptimeRobot
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Получить все поездки
app.get('/api/rides', (req, res) => {
    try {
        const rides = db.getAllRides();
        res.json({ success: true, rides });
    } catch (error) {
        console.error('Error getting rides:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Получить поездки водителя
app.get('/api/rides/driver/:telegramId', (req, res) => {
    try {
        const rides = db.getRidesByDriver(parseInt(req.params.telegramId));
        res.json({ success: true, rides });
    } catch (error) {
        console.error('Error getting driver rides:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Создать новую поездку
app.post('/api/rides', (req, res) => {
    try {
        const rideId = db.createRide(req.body);
        res.json({ success: true, rideId });
    } catch (error) {
        console.error('Error creating ride:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Создать бронирование
app.post('/api/bookings', (req, res) => {
    try {
        const ride = db.getRideById(req.body.ride_id);
        if (!ride) {
            return res.status(404).json({ success: false, error: 'Поездка не найдена' });
        }
        if (ride.available_seats <= 0) {
            return res.status(400).json({ success: false, error: 'Нет доступных мест' });
        }
        
        const bookingId = db.createBooking(req.body);
        res.json({ success: true, bookingId });
    } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Получить бронирования для поездки
app.get('/api/bookings/ride/:rideId', (req, res) => {
    try {
        const bookings = db.getBookingsByRide(parseInt(req.params.rideId));
        res.json({ success: true, bookings });
    } catch (error) {
        console.error('Error getting bookings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Получить бронирования пользователя
app.get('/api/bookings/user/:telegramId', (req, res) => {
    try {
        const bookings = db.getBookingsByUser(parseInt(req.params.telegramId));
        res.json({ success: true, bookings });
    } catch (error) {
        console.error('Error getting user bookings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Удалить бронирование
app.delete('/api/bookings/:id', (req, res) => {
    try {
        db.deleteBooking(parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting booking:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Удалить поездку
app.delete('/api/rides/:id', async (req, res) => {
    try {
        const rideId = parseInt(req.params.id);
        const ride = db.getRideById(rideId);
        
        if (!ride) {
            return res.status(404).json({ success: false, error: 'Поездка не найдена' });
        }
        
        const result = db.deleteRide(rideId);
        
        // Отправляем уведомления всем пассажирам
        if (result.passengers && result.passengers.length > 0) {
            const message = `
❌ Поездка завершена

Водитель: ${ride.driver_name}
Маршрут: ${ride.route}
Время: ${ride.departure_time}

Поездка была завершена водителем.
            `.trim();
            
            for (const passenger of result.passengers) {
                try {
                    await bot.sendMessage(passenger.telegram_id, message);
                } catch (error) {
                    console.error(`Failed to notify passenger ${passenger.telegram_id}:`, error);
                }
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting ride:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Отправить уведомление водителю о бронировании
app.post('/api/notify', async (req, res) => {
    try {
        const { driver_telegram_id, passenger_name, passenger_username, ride_id } = req.body;
        
        const ride = db.getRideById(ride_id);
        if (!ride) {
            return res.status(404).json({ success: false, error: 'Ride not found' });
        }

        const message = `
🚗 Новая заявка на поездку!

Пассажир: ${passenger_name} ${passenger_username ? `(@${passenger_username})` : ''}
Маршрут: ${ride.route === 'nvk-guk' ? 'НВК → ГУК' : 'ГУК → НВК'}
Время: ${ride.departure_time}

Свяжитесь с пассажиром для уточнения деталей.
        `.trim();

        await bot.sendMessage(driver_telegram_id, message);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error sending notification:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============= TELEGRAM BOT HANDLERS =============

// Команда /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const webAppUrl = `${process.env.APP_URL}`;
    
    bot.sendMessage(chatId, 
        '🚗 Добро пожаловать в NVK-Driver!\n\n' +
        'Студенческий трансфер НВК - удобный способ добраться на пары.',
        {
            reply_markup: {
                inline_keyboard: [[
                    { text: '🚀 Открыть приложение', web_app: { url: webAppUrl } }
                ]]
            }
        }
    );
});

// Команда /help
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
        '📖 Помощь по использованию NVK-Driver:\n\n' +
        '👤 Для пассажиров:\n' +
        '- Выберите роль "Пассажир"\n' +
        '- Просмотрите доступные поездки\n' +
        '- Нажмите на поездку для деталей\n' +
        '- Забронируйте место\n\n' +
        '🚗 Для водителей:\n' +
        '- Выберите роль "Водитель"\n' +
        '- Заполните форму создания поездки\n' +
        '- Управляйте своими поездками\n\n' +
        '💡 По вопросам пишите @your_support'
    );
});

// Обработка ошибок бота
bot.on('polling_error', (error) => {
    console.error('Bot polling error:', error);
});

// ============= SERVER START =============

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║                                           ║
║        🚗 NVK-Driver Server 🚗           ║
║                                           ║
║  ✅ Server running on port ${PORT}         ║
║  ✅ Database initialized                  ║
║  ✅ Telegram bot connected                ║
║                                           ║
║  📱 Open: http://localhost:${PORT}        ║
║                                           ║
╚═══════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down server...');
    bot.stopPolling();
    process.exit(0);
});
