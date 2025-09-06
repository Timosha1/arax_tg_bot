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

function escapeMarkdownV2(text) {
  return String(text)
    .replace(/\\/g, '\\\\')                                // сначала экранируем обратный слэш
    .replace(/([_\*\[\]\(\)~`>#+\-=|{}\.!])/g, '\\$1');    // затем остальные спецсимволы V2
}

// Функция для отображения корзины
function showCart(ctx) {
  const userId = ctx.from.id;
  const cart = userCarts[userId];

  if (!cart || cart.length === 0) {
    return ctx.reply("Ваша корзина пуста.", mainKeyboard);
  }

  let cartMessage = "🛒 *Ваша корзина:*\n\n";
  let total = 0;

  cart.forEach(item => {
    const itemTotal = item.price * item.quantity;
    total += itemTotal;
    cartMessage += `▪️ ${escapeMarkdownV2(item.name)} — ${item.quantity} шт. × ${item.price} AMD = *${itemTotal} AMD*\n`;
  });

  cartMessage += `\n💰 *Итого:* ${total} AMD`;

  if (ctx.callbackQuery) {
    try {
      ctx.editMessageText(cartMessage, { 
        parse_mode: "Markdown", 
        reply_markup: cartKeyboard.reply_markup 
      });
    } catch (e) {
      if (e.description?.includes("message is not modified")) {
        return; // игнорируем
      }
      console.error("Ошибка при редактировании корзины:", e);
    }
  } else {
    ctx.reply(cartMessage, { 
      parse_mode: "Markdown", 
      reply_markup: cartKeyboard.reply_markup 
    });
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

// // Инлайн-клавиатура отмены оформления заказа
// const cancelOrderInlineKeyboard = Markup.inlineKeyboard([
//   [Markup.button.callback("❌ Отменить оформление", "cancel_order")]
// ]);

// клавиатура отмены оформления заказа
const cancelOrderKeyboard = Markup.keyboard([
  [{text: "❌ Отменить оформление"}]
]).resize();


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
  // Шаг 2: Добавляем в корзину и возвращаемся к выбору товаров
  async (ctx) => {
    const quantity = parseInt(ctx.message.text);
    const productId = ctx.wizard.state.productId;
    const product = products.find(p => p.id === productId);
    const userId = ctx.from.id;

    if (isNaN(quantity) || quantity <= 0 || quantity > 100) {
      await ctx.reply('Пожалуйста, введите корректное количество (от 1 до 100):');
      return; // остаёмся на шаге
    }

    if (!userCarts[userId]) {
      userCarts[userId] = [];
    }

    const cartItem = userCarts[userId].find(item => item.id === productId);
    if (cartItem) {
      cartItem.quantity += quantity;
    } else {
      userCarts[userId].push({ ...product, quantity });
    }

    await ctx.reply(`✅ "${escapeMarkdownV2(product.name)}" (${quantity} шт.) добавлен в корзину!`, { parse_mode: "Markdown" });

    showCart(ctx);

    return ctx.scene.leave();
  }
);

// Сцена для сбора информации о заказе
const orderScene = new Scenes.WizardScene(
  'orderScene',
  // Шаг 1: Спрашиваем имя
  async (ctx) => {
      await ctx.reply('Как вас зовут?', cancelOrderKeyboard);
      return ctx.wizard.next();
  },
  // Шаг 2: Спрашиваем номер телефона
  async (ctx) => {
      if (!ctx.message || !ctx.message.text) {
          await ctx.reply('Пожалуйста, введите ваше имя:');
          return; // Остаемся на том же шаге
      }
      ctx.wizard.state.name = ctx.message.text; // Сохраняем имя
      await ctx.reply('Укажите номер телефона:');
      return ctx.wizard.next();
  },
  // Шаг 3: Спрашиваем адрес
  async (ctx) => {
      if (!ctx.message || !ctx.message.text) {
          await ctx.reply('Пожалуйста, введите номер телефона:');
          return; // Остаемся на том же шаге
      }
      ctx.wizard.state.phone = ctx.message.text; // Сохраняем телефон
      await ctx.reply('Укажите адрес доставки:');
      return ctx.wizard.next();
  },
// Шаг 4: Подтверждение заказа
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('Пожалуйста, введите адрес доставки:');
      return;
    }

    ctx.wizard.state.address = ctx.message.text;
    const userId = ctx.from.id;
    const cart = userCarts[userId];
    const { name, phone, address } = ctx.wizard.state;

    if (!cart || cart.length === 0) {
      await ctx.reply("❌ Корзина пуста, оформление отменено.", mainKeyboard);
      return ctx.scene.leave();
    }
    // Сохраняем в session для confirm_order
    ctx.session.orderData = { name, phone, address };

    let summary = `Проверьте заказ:\n\n`;
    summary += `Имя: ${escapeMarkdownV2(name)}\n`;
    summary += `Телефон: ${escapeMarkdownV2(phone)}\n`;
    summary += `Адрес: ${escapeMarkdownV2(address)}\n\n`;
    summary += `🛒 Состав:\n`;

    let total = 0;
    cart.forEach(item => {
      const itemTotal = item.price * item.quantity;
      total += itemTotal;
      summary += `- ${escapeMarkdownV2(item.name)}: ${item.quantity} шт. × ${item.price} AMD = ${itemTotal} AMD\n`;
    });
    summary += `\n💰 *Итого:* ${total} AMD`;

    const confirmKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback("✅ Подтвердить заказ", "confirm_order")],
      [Markup.button.callback("❌ Отменить оформление", "cancel_order")]
    ]);

    await ctx.reply(summary, { parse_mode: "Markdown", reply_markup: confirmKeyboard.reply_markup });
    return ctx.scene.leave();
  }
);

// единый обработчик отмены для всей сцены
orderScene.hears(/^❌ Отменить оформление$/i, async (ctx) => {
  await ctx.reply('❌ Оформление заказа отменено.', mainKeyboard);
  return ctx.scene.leave();
});

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
  await ctx.answerCbQuery();
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

bot.action("confirm_order", async (ctx) => {
  const userId = ctx.from.id;
  const cart = userCarts[userId];
  if (!cart || cart.length === 0) {
    return ctx.answerCbQuery("Корзина пуста!");
  }

  // Собираем данные из сцены 
  const { name, phone, address } = ctx.session?.orderData || {};

  let orderText = `*🔥 Новый заказ! 🔥*\n\n`;
  orderText += `*Клиент:* ${escapeMarkdownV2(name)}\n`;
  orderText += `*Телефон:* ${escapeMarkdownV2(phone)}\n`;
  orderText += `*Адрес:* ${escapeMarkdownV2(address)}\n`;

  if (ctx.from.username) {
    orderText += `*Telegram:* @${escapeMarkdownV2(ctx.from.username)}\n`;
  } else {
    orderText += `*Telegram ID:* ${ctx.from.id}\n`;
  }

  orderText += `\n*Состав заказа:*\n`;
  let total = 0;
  cart.forEach(item => {
    const itemTotal = item.price * item.quantity;
    total += itemTotal;
    orderText += `- ${escapeMarkdownV2(item.name)}: ${item.quantity} шт. × ${item.price} AMD = ${itemTotal} AMD\n`;
  });

  orderText += `\n*💰 Итого:* ${total} AMD`;

  await bot.telegram.sendMessage(ADMIN_CHAT_ID, orderText, { parse_mode: "Markdown" });
  await ctx.reply("✅ Спасибо! Ваш заказ принят. Мы скоро с вами свяжемся.", mainKeyboard);


  userCarts[userId] = [];

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