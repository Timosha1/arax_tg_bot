const { Telegraf, Markup } = require("telegraf");
const { message } = require("telegraf/filters");

require('dotenv').config();

const TOKEN = process.env.TELEGRAM_TOKEN;
if (!TOKEN) throw new Error("Не задан TELEGRAM_TOKEN в переменных окружения");

const bot = new Telegraf(TOKEN);

// ================== Список магазинов ==================
const shops = [
  { name: "Hummus Kimchi", lat: 40.186333, lon: 44.507424, yandexId: "10247476118" },
  { name: "Gargoyle & Kruzhok", lat: 40.180624, lon: 44.498734, yandexId: "84867664974" },
  { name: "Garage Ara Specialty Coffee", lat: 40.185853, lon: 44.506910, yandexId: "12566712203" },
  { name: "Tut. plantstore", lat: 40.184652, lon: 44.510679, yandexId: "100941354140" },
  { name: "Always Tea", lat: 40.174043, lon: 44.512515, yandexId: "182996070769" },
  { name: "13: 20", lat: 40.180022, lon: 44.511872, yandexId: "245019164323" },
];

// ================== Продукты ==================
const products = [  
  {
    name: "Фотосессия",
    description:
      "Это моя профессиональная фотосессия на современный фотоаппарат моего прадеда! Моя красота теперь доступна в 30-ти пикселях!",
    photo_url:
      "https://drive.google.com/uc?export=download&id=19NlVbqJ0uD5ZuJzgzSxOQYo0IK26IX9a",
  },
  {
    name: "Я на отдыхе",
    description: "Это я приехала в геленджик позагорать",
    photo_url:
      "https://drive.google.com/uc?export=download&id=1r-Q4jwRrxvGZdNXhKDDPFZXlQDzGIjKc",
  },
  {
    name: "Любовь",
    description:
      "Это моя тайная любовь - боевик из сосисочных повстанцев. Причина моих бессонных ночей😭",
    photo_url:
      "https://drive.google.com/uc?export=download&id=1av9zLKX5x-7XmWTLL3nTbEE9SGpxXY_4",
  },
  {
    name: "Чистейшая родниковая вода",
    description:
      "Вода прямиком из недр земли, прошла какие-то проверки",
    photo_url:
      "https://drive.google.com/uc?export=download&id=1xhs76oLEJaubgwupk0JgAJG1_ykrbxZk",
  },

];

// ================== Формула гаверсинуса ==================
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dlat = toRad(lat2 - lat1);
  const dlon = toRad(lon2 - lon1);
  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dlon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ================== Клавиатура для геопозиции ==================
const locationKeyboard = Markup.keyboard([
  [{ text: "📍 Отправить геопозицию", request_location: true }]
]).resize();

// ================== Главное меню ==================
const mainKeyboard = Markup.keyboard([
  [{ text: "📍 Показать точки продажи поблизости", request_location: true  }],
  [{ text: "Показать кринж" }]
]).resize();




// ================== Старт==================
bot.start((ctx) =>
  ctx.reply(
    "Привет! Выбери действие 👇",
    mainKeyboard
  )
);

// ================== Обработка кнопок ==================
bot.hears("📍 Где купить ARAX?", (ctx) =>
  ctx.reply(
    "Отправь своё местоположение 🏪",
    locationKeyboard
  )
);
bot.hears("Показать кринж", async (ctx) => {
  for (const product of products) {
    await ctx.replyWithPhoto(product.photo_url, {
      caption: `<b>${product.name}</b>\n${product.description}`,
      parse_mode: "HTML",
    });
  }
});

bot.command("show_locations", (ctx) =>
  ctx.reply(
    "Отправь своё местоположение, чтобы я показал где купить ARAX",
    locationKeyboard
  )
);





// ================== Обработка геолокации с улучшенной картой ==================
bot.on(message("location"), async (ctx) => {
  if (ctx.message.location) {
    const { latitude, longitude } = ctx.message.location;

    const nearest = shops
      .map((shop) => ({
        ...shop,
        dist: haversine(latitude, longitude, shop.lat, shop.lon),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 6);


    let text = "📍 Точки продажи:\n\n";
    nearest.forEach((shop, i) => {
      const yandexLink = `https://yandex.com/maps/org/${shop.yandexId}`;
      text += `${i + 1}. <a href="${yandexLink}">${shop.name}</a> — ${shop.dist.toFixed(2)} км\n\n`;
    });
    

    try {
      await ctx.reply(text, { parse_mode: "HTML", disable_web_page_preview: true });
    } catch (error) {
      if (error.response && error.response.error_code === 403) {
        console.log(`Не удалось отправить сообщение пользователю ${ctx.chat.id}: бот был заблокирован`);
      } else {
        console.error("Ошибка при отправке сообщения:", error);
      }
    }
  }
});



bot.command("show_cringe", async (ctx) => {
  for (const product of products) {
    await ctx.replyWithPhoto(product.photo_url, {
      caption: `<b>${product.name}</b>\n${product.description}`,
      parse_mode: "HTML",
    });
  }
});

// ================== Запуск бота ==================
bot.launch();
console.log("Бот запущен ✅");

bot.catch((err, ctx) => {
  if (err.response && err.response.error_code === 403) {
    console.log(`Бот был заблокирован пользователем ${ctx.chat.id}`);
  } else {
    console.error("Необработанная ошибка Telegraf:", err);
  }
});

