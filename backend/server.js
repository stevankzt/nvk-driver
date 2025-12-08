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
// В production используем webhook, в development - polling
const useWebhook = process.env.NODE_ENV === 'production' && process.env.APP_URL;
const bot = new TelegramBot(process.env.BOT_TOKEN, { 
    polling: !useWebhook 
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Инициализация базы данных
db.initializeDatabase();

// Автоматическая очистка устаревших поездок каждые 5 минут
setInterval(() => {
    db.cleanupExpiredRides();
}, 5 * 60 * 1000); // 5 минут

// Запускаем первую очистку сразу
db.cleanupExpiredRides();

// ============= API ENDPOINTS =============

// Health check endpoint для UptimeRobot
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Получить все поездки (для пассажиров - только с доступными местами)
app.get('/api/rides', (req, res) => {
    try {
        const allRides = db.getAllRides();
        // Фильтруем поездки: показываем только с available_seats > 0
        const availableRides = allRides.filter(ride => ride.available_seats > 0);
        res.json({ success: true, rides: availableRides });
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

Вы также можете связаться с пассажиром для уточнения деталей.
        `.trim();

        await bot.sendMessage(driver_telegram_id, message);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error sending notification:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============= TELEGRAM BOT HANDLERS =============

// Установка меню команд бота
bot.setMyCommands([
    { command: 'start', description: '🚀 Запустить приложение' },
    { command: 'help', description: '📖 Помощь по использованию' },
    { command: 'myrides', description: '🚗 Мои поездки (водитель)' },
    { command: 'mybookings', description: '🎫 Мои бронирования (пассажир)' },
    { command: 'about', description: 'ℹ️ О сервисе' }
]);

// Команда /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name || 'друг';
    const webAppUrl = `${process.env.APP_URL}`;
    
    bot.sendMessage(chatId, 
        `👋 Привет, ${firstName}!\n\n` +
        '🚗 *NVK-Driver* - твой студенческий трансфер!\n\n' +
        '🎯 Что умеет бот:\n' +
        '• Найти попутчиков для поездки\n' +
        '• Создать свою поездку\n' +
        '• Забронировать место у водителя\n' +
        '• Отслеживать свои поездки\n\n' +
        '👇 Нажми кнопку ниже, чтобы начать:',
        {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    [{ text: '🚀 Открыть приложение', web_app: { url: webAppUrl } }],
                    [{ text: '📖 Помощь' }, { text: 'ℹ️ О сервисе' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        }
    );
});

// Команда /help и текстовая кнопка "📖 Помощь"
bot.onText(/\/help/, (msg) => {
    sendHelpMessage(msg.chat.id);
});

bot.on('message', (msg) => {
    if (msg.text === '📖 Помощь') {
        sendHelpMessage(msg.chat.id);
    } else if (msg.text === 'ℹ️ О сервисе') {
        sendAboutMessage(msg.chat.id);
    }
});

function sendHelpMessage(chatId) {
    bot.sendMessage(chatId,
        '📖 *Инструкция по использованию*\n\n' +
        '👤 *Для пассажиров:*\n' +
        '1️⃣ Откройте приложение\n' +
        '2️⃣ Выберите "Я пассажир"\n' +
        '3️⃣ Просмотрите доступные поездки\n' +
        '4️⃣ Выберите подходящую и забронируйте место\n' +
        '5️⃣ Свяжитесь с водителем через Telegram\n\n' +
        '🚗 *Для водителей:*\n' +
        '1️⃣ Откройте приложение\n' +
        '2️⃣ Выберите "Я водитель"\n' +
        '3️⃣ Заполните форму поездки (маршрут, время, цена)\n' +
        '4️⃣ Отслеживайте заявки от пассажиров\n' +
        '5️⃣ Завершите поездку после выполнения\n\n' +
        '💡 *Полезные команды:*\n' +
        '/start - Запустить бота\n' +
        '/help - Показать эту справку\n' +
        '/myrides - Мои поездки (водитель)\n' +
        '/mybookings - Мои бронирования\n' +
        '/about - О сервисе',
        { parse_mode: 'Markdown' }
    );
}

// Команда /about и текстовая кнопка "ℹ️ О сервисе"
bot.onText(/\/about/, (msg) => {
    sendAboutMessage(msg.chat.id);
});

function sendAboutMessage(chatId) {
    bot.sendMessage(chatId,
        'ℹ️ *О сервисе NVK-Driver*\n\n' +
        '🎓 Студенческий трансфер для жителей общежития НВК\n\n' +
        '🚗 *Что мы предлагаем:*\n' +
        '• Быстрый поиск попутчиков\n' +
        '• Экономия на такси\n' +
        '• Безопасные поездки с однокурсниками\n' +
        '• Удобное бронирование через Telegram\n\n' +
        '📍 *Популярные маршруты:*\n' +
        '• Общежитие НВК ↔ ГУК\n' +
        '• Общежитие НВК ↔ Учебные корпуса\n\n' +
        '👥 *Команда проекта:*\n' +
        '• Разработка: @DickUpRio\n' +
        '• Поддержка: @DickUpRio\n\n' +
        '💬 По всем вопросам: @DickUpRio',
        { parse_mode: 'Markdown' }
    );
}

// Команда /myrides - показать поездки водителя
bot.onText(/\/myrides/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
        const rides = db.getRidesByDriver(userId);
        
        if (rides.length === 0) {
            bot.sendMessage(chatId, 
                '🚗 У вас пока нет активных поездок.\n\n' +
                'Откройте приложение и создайте свою первую поездку!',
                {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🚀 Открыть приложение', web_app: { url: process.env.APP_URL } }
                        ]]
                    }
                }
            );
        } else {
            let message = '🚗 *Ваши активные поездки:*\n\n';
            
            rides.forEach((ride, index) => {
                message += `${index + 1}. *${ride.route}*\n`;
                message += `   📅 ${ride.departure_date ? formatDate(ride.departure_date) + ', ' : ''}${ride.departure_time}\n`;
                message += `   👥 Мест: ${ride.available_seats}/${ride.total_seats}\n`;
                message += `   💰 ${ride.price} ₽\n`;
                message += `   📋 Бронирований: ${ride.bookings_count || 0}\n\n`;
            });
            
            message += 'Управляйте поездками через приложение 👇';
            
            bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🚀 Открыть приложение', web_app: { url: process.env.APP_URL } }
                    ]]
                }
            });
        }
    } catch (error) {
        console.error('Error getting driver rides:', error);
        bot.sendMessage(chatId, '❌ Ошибка при загрузке поездок. Попробуйте позже.');
    }
});

// Команда /mybookings - показать бронирования пассажира
bot.onText(/\/mybookings/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
        const bookings = db.getBookingsByUser(userId);
        
        if (bookings.length === 0) {
            bot.sendMessage(chatId, 
                '🎫 У вас пока нет забронированных поездок.\n\n' +
                'Откройте приложение и найдите попутчиков!',
                {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🚀 Открыть приложение', web_app: { url: process.env.APP_URL } }
                        ]]
                    }
                }
            );
        } else {
            let message = '🎫 *Ваши бронирования:*\n\n';
            
            bookings.forEach((booking, index) => {
                message += `${index + 1}. *${booking.ride_route}*\n`;
                message += `   📅 ${booking.ride_date ? formatDate(booking.ride_date) + ', ' : ''}${booking.ride_time}\n`;
                message += `   🚗 Водитель: ${booking.driver_name}\n`;
                message += `   💰 ${booking.ride_price} ₽\n`;
                if (booking.driver_username) {
                    message += `   📱 ${booking.driver_username}\n`;
                }
                message += '\n';
            });
            
            message += 'Детали в приложении 👇';
            
            bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🚀 Открыть приложение', web_app: { url: process.env.APP_URL } }
                    ]]
                }
            });
        }
    } catch (error) {
        console.error('Error getting user bookings:', error);
        bot.sendMessage(chatId, '❌ Ошибка при загрузке бронирований. Попробуйте позже.');
    }
});

// Вспомогательная функция форматирования даты
function formatDate(dateString) {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}.${month}`;
}

// Обработка ошибок бота
bot.on('polling_error', (error) => {
    console.error('Bot polling error:', error);
});

// ============= SERVER START =============

app.listen(PORT, async () => {
    // Настройка webhook для production
    if (useWebhook) {
        const webhookUrl = `${process.env.APP_URL}/bot${process.env.BOT_TOKEN}`;
        
        try {
            // Удаляем старый webhook
            await bot.deleteWebHook();
            console.log('🗑️ Old webhook deleted');
            
            // Устанавливаем новый webhook
            await bot.setWebHook(webhookUrl);
            console.log('✅ Webhook set to:', webhookUrl);
            
            // Обработчик webhook
            app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
                bot.processUpdate(req.body);
                res.sendStatus(200);
            });
        } catch (error) {
            console.error('❌ Webhook setup failed:', error.message);
            console.log('⚠️ Falling back to polling mode');
        }
    } else {
        console.log('📡 Bot running in polling mode');
    }
    
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
    if (!useWebhook) {
        bot.stopPolling();
    }
    process.exit(0);
});
