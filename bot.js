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

// ================== Рецепты ==================
const basicRecepie =   {
  name: "Как готовить коктейли с АРАКС",
  description: `✨ Одна бутылка АРАКС = 3 коктейля
  <b>Базовый рецепт</b>
  40 мл любого алкоголя (джин, ром, текила, водка, бурбон — что вам ближе)
  150 мл АРАКС (любого вкуса)
  Лёд — щедро, чтобы напиток был свежим
  Украшение — по вашему вкусу: долька цитруса, веточка мяты, ягода, специя
  Просто смешайте всё в большом бокале, украсьте и наслаждайтесь.`, 

  photo_url: "https://drive.google.com/uc?export=download&id=1H05dIACPl_DruQwtdA5rpPFFS0RWl9bS",
}

const products = [  
  {
    id: "strawberry_paprika",
    name: "🍓 Клубника с паприкой",
    description:
      " Клубника–паприка + текила или мескаль → пикантный мексиканский акцент. Также отлично с пивом в виде радлера.",
    photo_url:
      "https://drive.google.com/uc?export=download&id=19NlVbqJ0uD5ZuJzgzSxOQYo0IK26IX9a",
  },
  {
    id: "mandarin_cardamom",
    name: "🍊 Мандарин с кардамоном",
    description: " Мандарин–кардамон + джин → лёгкий цитрусово-пряный коктейль. С пивом тоже супер!",
    photo_url:
      "https://drive.google.com/uc?export=download&id=1r-Q4jwRrxvGZdNXhKDDPFZXlQDzGIjKc",
  },
  {
    id: "lavender_jasmine",
    name: "🌸 Лаванда, жасмин и гандпаудер ",
    description:
      "Лаванда–жасмин–ганпаудер + водка или джин → чистый, цветочно-чайный вкус",
    photo_url:
      "https://drive.google.com/uc?export=download&id=1av9zLKX5x-7XmWTLL3nTbEE9SGpxXY_4",
  },
  {
    id: "melon_mint",
    name: "🍈 Дыня с мятой",
    description:
      "Дыня–мята + светлый ром → летний тропический бриз. Можно с темным ромом чтобы сделать коктейль более пряным и согревающим",
    photo_url:
      "https://drive.google.com/uc?export=download&id=1xhs76oLEJaubgwupk0JgAJG1_ykrbxZk",
  },
  {
    id: "cola_plum",
    name: "🥤 Кола со сливой",
    description:
      "Кола–слива + бурбон или ром → насыщенный и уютный микс",
    photo_url:
      "https://drive.google.com/uc?export=download&id=1xhs76oLEJaubgwupk0JgAJG1_ykrbxZk",
  },
  {
    id: "orange_grapefruit",
    name: "🍊 Горький апельсин и красный грейпфрут",
    description:
      "Горький апельсин–красный грейпфрут + джин или водка → яркий цитрусовый твист",
    photo_url:
      "https://drive.google.com/uc?export=download&id=1xhs76oLEJaubgwupk0JgAJG1_ykrbxZk",
  },
  {
    id: "rose_dahongpao",
    name: "🌹 Роза, дахунпао и бергамот",
    description:
      "Роза–дахунпао–бергамот + ром → чувственный восточный аромат",
    photo_url:
      "https://drive.google.com/uc?export=download&id=1xhs76oLEJaubgwupk0JgAJG1_ykrbxZk",
  },
  {
    id: "cherry_pie",
    name: "🍒 Вишневый пирог",
    description:
      "Вишнёвый пирог + бурбон или ром → сладкий десертный коктейль. Можно попробовать с вином",
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
  [{ text: "Рецепты с ARAX💩" }]
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


// bot.hears("Рецепты с ARAX💩", async (ctx) => {
//   await ctx.replyWithPhoto(basicRecepie.photo_url, {
//     caption: `<b>${basicRecepie.name}</b>\n${basicRecepie.description}`,
//     parse_mode: "HTML",
//   });
// });

bot.hears("Рецепты с ARAX💩", async (ctx) => {
  // 1. Создаем кнопки для каждого вкуса из массива products
  const flavorButtons = products.map(product =>
      Markup.button.callback(product.name, `recipe_${product.id}`)
  );

  // 2. Собираем клавиатуру, располагая по 2 кнопки в ряд
  const keyboard = Markup.inlineKeyboard(
      Array.from({ length: Math.ceil(flavorButtons.length / 2) }, (_, i) =>
          flavorButtons.slice(i * 2, i * 2 + 2)
      )
  );

  // 3. Отправляем фото с базовым рецептом И прикрепляем клавиатуру
  await ctx.replyWithPhoto(basicRecepie.photo_url, {
      caption: `<b>${basicRecepie.name}</b>\n${basicRecepie.description}`,
      parse_mode: "HTML",
      //reply_markup: keyboard
      ...keyboard
  });
});

// ================== ОБРАБОТЧИК НАЖАТИЙ НА INLINE-КНОПКИ ==================
bot.action(/recipe_(.+)/, async (ctx) => {
  // 1. Получаем название продукта из данных кнопки 
  const productId  = ctx.match[1];

  // 2. Находим продукт в нашем массиве по имени
  const product = products.find(p => p.id === productId);

  // 3. Если нашли, отправляем информацию о нем в новом сообщении
  if (product) {
      await ctx.replyWithPhoto(product.photo_url, {
          caption: `<b>${product.name}</b>\n${product.description}`,
          parse_mode: "HTML",
      });
  }

  // 4. Сообщаем Телеграму, что мы обработали нажатие.
  // У пользователя пропадет значок "загрузки" на кнопке.
  await ctx.answerCbQuery();
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



bot.command("show_lemonades", async (ctx) => {
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

