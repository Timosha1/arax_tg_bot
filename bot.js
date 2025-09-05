import { Telegraf, Scenes, session, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { shops, basicRecepie, products } from './data.js';
import 'dotenv/config';

const TOKEN = process.env.TELEGRAM_TOKEN;
if (!TOKEN) throw new Error("Не задан TELEGRAM_TOKEN в переменных окружения");

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
if (!ADMIN_CHAT_ID) throw new Error("Не задан ADMIN_CHAT_ID в переменных окружения");

const bot = new Telegraf(TOKEN);

const userCarts = {}; // { userId: [{ id, name, quantity }] }

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

// Функция для отображения корзины
function showCart(ctx) {
  const userId = ctx.from.id;
  const cart = userCarts[userId];

  if (!cart || cart.length === 0) {
      return ctx.reply("Ваша корзина пуста.", mainKeyboard); // Возвращаем в главное меню
  }

  let cartMessage = "🛒 *Ваша корзина:*\n\n";
  cart.forEach(item => {
      cartMessage += `▪️ ${item.name} \- *${item.quantity} шт.*\n`;
  });

  // Отправляем или редактируем сообщение
  if (ctx.callbackQuery) {
      // Если это результат нажатия inline-кнопки, редактируем сообщение
      ctx.editMessageText(cartMessage, { parse_mode: "Markdown", ...cartKeyboard });
  } else {
      // Иначе отправляем новое
      ctx.reply(cartMessage, { parse_mode: "Markdown", ...cartKeyboard });
  }
}

// ================== Клавиатура для геопозиции ==================
const locationKeyboard = Markup.keyboard([
  [{ text: "📍 Отправить геопозицию", request_location: true }]
]).resize();

// ================== Главное меню ==================
const mainKeyboard = Markup.keyboard([
  [{ text: "📍 Показать точки продажи", request_location: true  }],
  [{ text: "💩 Рецепты с ARAX" }],
  [{ text: "🛒 Сделать заказ" }],
]).resize();

// Инлайн-клавиатура отмены оформления заказа
const cancelOrderInlineKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("❌ Отменить оформление", "cancel_order")]
]);

// Клавиатура для управления корзиной
const cartKeyboard = Markup.inlineKeyboard([
  Markup.button.callback("✅ Оформить заказ", "checkout"),
  Markup.button.callback("🗑 Очистить корзину", "clear_cart"),
  Markup.button.callback("⬅️ Выбрать еще", "back_to_products")
]);

// Функция для создания клавиатуры с продуктами 
const createProductsKeyboard = () => {
  const flavorButtons = products.map(product =>
      Markup.button.callback(product.name, `recipe_${product.id}`)
  );
  return Markup.inlineKeyboard(
      Array.from({ length: Math.ceil(flavorButtons.length / 2) }, (_, i) =>
          flavorButtons.slice(i * 2, i * 2 + 2)
      )
  );
};

// ============ НАСТРОЙКА СЦЕН ДЛЯ СБОРА ДАННЫХ ===============

// Сцена для запроса количества товара
const quantityScene = new Scenes.WizardScene(
  'quantityScene',
  // Шаг 1: Спрашиваем количество
  async (ctx) => {
      const productId = ctx.wizard.state.productId;
      const product = products.find(p => p.id === productId);
      await ctx.reply(`Сколько "${product.name}" вы хотите заказать?`);
      return ctx.wizard.next();
  },
  // Шаг 2: Добавляем в корзину и возвращаемся к выбору товаров
  async (ctx) => {
      const quantity = parseInt(ctx.message.text);
      const productId = ctx.wizard.state.productId;
      const product = products.find(p => p.id === productId);
      const userId = ctx.from.id;

      if (isNaN(quantity) || quantity <= 0) {
          await ctx.reply('Пожалуйста, введите корректное количество (число больше 0):');
          return; // Остаемся на том же шаге
      }

      // Инициализируем корзину, если ее нет
      if (!userCarts[userId]) {
          userCarts[userId] = [];
      }

      // Проверяем, есть ли уже такой товар в корзине
      const cartItem = userCarts[userId].find(item => item.id === productId);

      if (cartItem) {
          cartItem.quantity += quantity; // Увеличиваем количество
      } else {
          userCarts[userId].push({ ...product, quantity: quantity }); // Добавляем новый товар
      }

      await ctx.reply(`✅ "${product.name}" (${quantity} шт.) добавлен в корзину!`);

      // Показываем корзину
      showCart(ctx);

      // Завершаем сцену
      return ctx.scene.leave();
  }
);

// Сцена для сбора информации о заказе
const orderScene = new Scenes.WizardScene(
  'orderScene',
  // Шаг 1: Спрашиваем имя
  async (ctx) => {
      await ctx.reply('Как вас зовут?', cancelOrderInlineKeyboard);
      return ctx.wizard.next();
  },
  // Шаг 2: Спрашиваем номер телефона
  async (ctx) => {
      if (!ctx.message || !ctx.message.text) {
          await ctx.reply('Пожалуйста, введите текст:');
          return; // Остаемся на том же шаге
      }
      // Отмена оформления
      const text = ctx.message.text.trim();
      if (/^отмена$/i.test(text) || /^❌ Отменить оформление$/i.test(text)) {
          await ctx.reply('❌ Оформление заказа отменено.', mainKeyboard);
          return ctx.scene.leave();
      }
      ctx.wizard.state.name = ctx.message.text; // Сохраняем имя
      await ctx.reply('Укажите номер телефона:', cancelOrderInlineKeyboard);
      return ctx.wizard.next();
  },
  // Шаг 3: Спрашиваем адрес
  async (ctx) => {
      if (!ctx.message || !ctx.message.text) {
          await ctx.reply('Пожалуйста, введите номер телефона:');
          return; // Остаемся на том же шаге
      }
      // Отмена оформления
      const text = ctx.message.text.trim();
      if (/^отмена$/i.test(text) || /^❌ Отменить оформление$/i.test(text)) {
          await ctx.reply('❌ Оформление заказа отменено.', mainKeyboard);
          return ctx.scene.leave();
      }
      ctx.wizard.state.phone = ctx.message.text; // Сохраняем телефон
      await ctx.reply('Укажите адрес доставки: ', cancelOrderInlineKeyboard);
      return ctx.wizard.next();
  },
  // Шаг 4: Подтверждение и отправка заказа
  async (ctx) => {
      if (!ctx.message || !ctx.message.text) {
          await ctx.reply('Пожалуйста, введите адрес доставки:');
          return; // Остаемся на том же шаге
      }
      // Отмена оформления
      const text = ctx.message.text.trim();
      if (/^отмена$/i.test(text) || /^❌ Отменить оформление$/i.test(text)) {
          await ctx.reply('❌ Оформление заказа отменено.', mainKeyboard);
          return ctx.scene.leave();
      }
      ctx.wizard.state.address = ctx.message.text; // Сохраняем адрес
      const userId = ctx.from.id;
      const cart = userCarts[userId];
      const { name, phone, address } = ctx.wizard.state;

      // Формируем текст заказа
      let orderText = `*🔥 Новый заказ! 🔥*\n\n`;
      orderText += `*Клиент:* ${name}\n`;
      orderText += `*Телефон:* ${phone}\n`;
      orderText += `*Адрес:* ${address}\n`;
      
      // Добавляем Telegram username если есть
      if (ctx.from.username) {
          const safeUsername = ctx.from.username.replace(/_/g, "\\_");
          orderText += `*Telegram username:* @${safeUsername}\n`;
      } else {
          orderText += `*Telegram ID:* ${ctx.from.id}\n`;
      }
      
      orderText += `\n*Состав заказа:*\n`;
      cart.forEach(item => {
          orderText += `- ${item.name}: ${item.quantity} шт.\n`;
      });

      // ID чата, куда будут приходить заказы (это может быть ваш ID или ID группы)
      const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // <-- Укажите ID в .env файле
      if(!ADMIN_CHAT_ID) throw new Error("Не задан ADMIN_CHAT_ID");


      // Отправляем заказ администратору
      await bot.telegram.sendMessage(ADMIN_CHAT_ID, orderText, { parse_mode: 'Markdown' });

      // Сообщаем пользователю об успехе
      await ctx.reply('✅ Спасибо! Ваш заказ принят. Мы скоро с вами свяжемся.');

      // Очищаем корзину
      userCarts[userId] = [];

      // Завершаем сцену
      return ctx.scene.leave();
  }
);

// Создаем менеджер сцен и регистрируем наши сцены
const stage = new Scenes.Stage([quantityScene, orderScene]);
bot.use(session());
bot.use(stage.middleware());

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

// Обработчик кнопки "Сделать заказ"
bot.hears("🛒 Сделать заказ", (ctx) => {
  let message = "Выберите товары для заказа:\n";

  // Создаем inline-кнопки для каждого товара
  const productButtons = products.map(p => [
      Markup.button.callback(
          `➕ ${p.name}`, // Текст кнопки
          `select_product_${p.id}` // Callback-данные для обработчика
      )
  ]);

  ctx.reply(message, Markup.inlineKeyboard(productButtons));
});

bot.hears("💩 Рецепты с ARAX", async (ctx) => {

  const keyboard = createProductsKeyboard();

  // Отправляем фото с базовым рецептом И прикрепляем клавиатуру
  await ctx.replyWithPhoto(basicRecepie.photo_url, {
      caption: `<b>${basicRecepie.name}</b>\n${basicRecepie.description}`,
      parse_mode: "HTML",
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
    // Создаем клавиатуру с кнопкой "Назад"
    const backKeyboard = Markup.inlineKeyboard([
        Markup.button.callback("⬅️ Назад", "back_to_basic_recipe")
    ]);
    //Редактируем исходное сообщение
    await ctx.editMessageMedia({
      type: 'photo',
      media: product.photo_url,
      caption: `<b>${product.name}</b>\n${product.description}`,
      parse_mode: 'HTML'
    }, backKeyboard);
  }

  // 4. Сообщаем Телеграму, что мы обработали нажатие.
  await ctx.answerCbQuery();
});


// Обработчик выбора товара (переход к запросу количества)
bot.action(/select_product_(.+)/, async (ctx) => {
  const productId = ctx.match[1];
  const product = products.find(p => p.id === productId);

  if (!product) {
      return ctx.answerCbQuery("Товар не найден!");
  }

  // Запускаем сцену запроса количества с передачей productId
  await ctx.scene.enter('quantityScene', { productId: productId });
});

// Очистка корзины
bot.action("clear_cart", async (ctx) => {
  const userId = ctx.from.id;
  userCarts[userId] = []; // Просто очищаем массив
  await ctx.answerCbQuery("Корзина очищена!");
  await ctx.editMessageText("Ваша корзина пуста.");
});

// Начало оформления заказа
bot.action("checkout", async (ctx) => {
  const userId = ctx.from.id;
  if (!userCarts[userId] || userCarts[userId].length === 0) {
      return ctx.answerCbQuery("Ваша корзина пуста!");
  }

  // Начинаем диалог с пользователем для сбора данных
  await ctx.scene.enter('orderScene');
});

// Обработчик кнопки "Назад" - возврат к ассортименту продуктов
bot.action("back_to_products", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage();

  let message = "Выберите товары для заказа:\n";
  const productButtons = products.map(p => [
      Markup.button.callback(
          `➕ ${p.name}`,
          `select_product_${p.id}`
      )
  ]);

  await ctx.reply(message, Markup.inlineKeyboard(productButtons));
});

bot.action("back_to_menu", async (ctx) => {
  // 1. Убираем "часики" с кнопки, сообщая Telegram, что мы обработали нажатие
  await ctx.answerCbQuery();

  // 2. Удаляем сообщение с корзиной и ее кнопками
  await ctx.deleteMessage();

  // 3. Отправляем новое сообщение с клавиатурой главного меню
  await ctx.reply("Вы в главном меню 👇", mainKeyboard);
});

// Обработка инлайн-отмены оформления
bot.action("cancel_order", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('❌ Оформление заказа отменено.', mainKeyboard);
  // Если пользователь в сцене — выходим
  if (ctx.scene && ctx.scene.current) {
    await ctx.scene.leave();
  }
});


// Обработчик для кнопки "Назад"
bot.action("back_to_basic_recipe", async (ctx) => {
  // Получаем клавиатуру со всеми продуктами
  const keyboard = createProductsKeyboard();

  // Редактируем текущее сообщение, возвращая его к базовому рецепту
  await ctx.editMessageMedia({
      type: 'photo',
      media: basicRecepie.photo_url,
      caption: `<b>${basicRecepie.name}</b>\n${basicRecepie.description}`,
      parse_mode: "HTML"
  }, keyboard);

  await ctx.answerCbQuery();
});

bot.command("show_locations", (ctx) =>
  ctx.reply(
    "Отправь своё местоположение, чтобы я показал где купить ARAX",
    locationKeyboard
  )
);

// ================== Обработка геолокации с картой ==================
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

// Функция для корректной остановки
const gracefulStop = (signal) => {
  console.log(`Получен сигнал ${signal}. Останавливаю бота...`);
  bot.stop(signal).then(() => {
    console.log('Бот остановлен. Завершаю процесс.');
    process.exit(0);
  });
};

// Ловим сигналы для корректного завершения
process.once("SIGINT", () => gracefulStop("SIGINT"));
process.once("SIGTERM", () => gracefulStop("SIGTERM"));