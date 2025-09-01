# Threads Bot (UA) + OpenAI

## Вимоги
- Node.js 18+ (на хостингу або локально із SSH)
- Можливість запускати cron (буде потрібно пізніше)
- OpenAI API ключ

## Встановлення
npm i

## Налаштування
1) Створи .env (див. приклад).
2) Перший запуск БЕЗ headless, щоб пройти 2FA та зберегти cookies.json:
   npm run post -- --prompt "Зроби короткий пост про менеджмент українською"

3) Подальші запуски на сервері (headless):
   HEADLESS=1 npm run post -- --prompt "Ще один короткий пост про лідерство"

4) (Опц.) Вказати готовий текст вручну:
   HEADLESS=1 npm run post -- --text "Мій тестовий пост без OpenAI"

5) (Опц.) Додати зображення:
   HEADLESS=1 npm run post -- --text "Пост з фото" --image "./media/pic.jpg"

## Дебаг
- Дивись error_screenshot.png у разі збоїв
- Оновлюй селектори в postThreads.js, якщо інтерфейс Threads зміниться


Як викликати бота (усі сценарії)

Запуск завжди через Node:

node postThreads.js --action=<дія> [опції]

Щоб випадково виконати одну з доступних дій (окрім логіну), використай `--action=random`.

1) Публікація треда
node postThreads.js --action=post [--type=story|tip|news] [--text="готовий текст"] [--image="шлях/до/фото.png"] [--headless=true]


Якщо --text не вказано, текст генерується автоматично через OpenAI за обраним --type.

--image опційно додає зображення.

Після публікації бот ще поставить 2–5 випадкових лайків (імітація “живої” активності).

Приклади:

node postThreads.js --action=post --type=story --headless=true
node postThreads.js --action=post --type=tip --image=./media/pic.jpg
node postThreads.js --action=post --text="Мій короткий пост без генерації" --headless=true

2) Пошук підприємців + підписки + лайки (м’які ліміти)
node postThreads.js --action=find-entrepreneurs [--maxFollows=3] [--headless=true]


Бере випадкові ключові слова з пулу типу: “підприємець”, “керівник”, “власник”, “бізнесмен”, “owner”, …

За прохід: 3–4 підписки максимум (контролюється --maxFollows, але обмежено до 4).

На кожному знайденому профілі: лайкає 3–4 пости.

Приклади:

node postThreads.js --action=find-entrepreneurs --headless=true
node postThreads.js --action=find-entrepreneurs --maxFollows=4

3) Залучення за ключовими словами: лайки + коментарі (коментарі через ChatGPT)
node postThreads.js --action=engage-keywords [--likeMin=5] [--likeMax=20] [--commentMin=1] [--commentMax=4] [--headless=true]


Шукає пости за розширеним списком слів (напр. “бізнес”, “керую”, “моя команда”, “зростаємо”, “скейлимо”, …).

Ставить від likeMin до likeMax лайків (рандомно).

Залишає від commentMin до commentMax коментарів (рандомно).

Для кожного коментаря бот:

відкриває пост, 2) зчитує текст, 3) надсилає його в OpenAI і 4) публікує короткий доречний коментар українською (fallback — зі списку шаблонів, якщо OpenAI недоступний).

Приклади:

node postThreads.js --action=engage-keywords --headless=true
node postThreads.js --action=engage-keywords --likeMin=6 --likeMax=12 --commentMin=2 --commentMax=3

Корисні загальні опції

--timeout=22000 — базовий таймаут очікувань (мс).

--headless=true — headless режим.

Енви:

THREADS_USERNAME

THREADS_PASSWORD

OPENAI_API_KEY (+ опційно OPENAI_MODEL, за замовчуванням gpt-4o-mini)

(ми вже передаємо --no-sandbox у Chromium флагах)
