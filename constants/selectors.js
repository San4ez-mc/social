// constants/selectors.js
// Стабільні селектори без прив'язки до локалізації UI

export const THREADS_HOME_URLS = [
    "https://www.threads.com/?hl=uk",
    "https://www.threads.net/?hl=uk",
    "https://threads.net/?hl=uk",
];

// На головній (неавторизовано)
// 1) canonical <a href="/login">
// 2) будь-який видимий елемент з role="button", що виглядає як SSO Instagram
export const THREADS_LOGIN_ANCHOR = 'a[href^="/login"]';

// Текст посилання/кнопки входу
export const THREADS_LOGIN_ENTRY_TEXT = /Увійти|Log in/i;

// На сторінці /login — SSO-посилання/кнопка
export const THREADS_CONTINUE_WITH_IG = 'a[href*="instagram.com"], a[href="/login"], button[data-testid="login"]';

// Підказка для текстового пошуку (не CSS! — використовується у page.evaluate)
export const THREADS_LOGIN_BUTTON_TEXT = /Продовжити з Instagram|Continue with Instagram/i;

// Ознаки авторизованого фіду
export const THREADS_PROFILE_LINK = 'a[href^="/@"]';
export const THREADS_COMPOSER_ANY = 'span,[role="textbox"],[contenteditable="true"]';

// Instagram (форма логіну)
export const IG_LOGIN_FORM = 'form#loginForm';
export const IG_USER_INPUT = 'input[name="username"]';
export const IG_PASS_INPUT = 'input[name="password"]';
export const IG_SUBMIT_BTN = 'button[type="submit"]';

// Шляхи для cookies
export const COOKIES_THREADS_PATH = "cookies.json";
export const COOKIES_IG_PATH = "cookies_instagram.json";

// Узагальнені селектори для дій у Threads
export const SELECTORS = {
  nav: {
    home: 'a[href="/"]',
    backOrHome: 'a[href="/"], button[aria-label="Back"], div[role="button"][aria-label="Back"]'
  },
  feed: {
    searchButton: 'a[href="/search"], button[aria-label="Search"], [aria-label="Search"]'
  },
  search: {
    input: 'input[type="search"], input[role="searchbox"], input[placeholder]',
    results: {
      profileCards: 'div[role="dialog"] a[href^="/@"], div[role="listitem"] a[href^="/@"], div a[href^="/@"]'
    }
  },
  profile: {
    followButton: 'button:has(span:matches-css(^Підписатися$)), button:has(span:matches-css(^Follow$))',
    followingButton: 'button:has(span:matches-css(^Ви підписані$)), button:has(span:matches-css(^Following$))',
    posts: {
      likeButtons: {
        root: 'main, div[role="main"]',
        item: 'button[aria-label="Like"], div[role="button"][aria-label="Like"], div[aria-label="Like"]'
      },
      firstPost: 'article, div[role="article"], div[data-testid="post"]'
    }
  },
  post: {
    comment: {
      input: 'textarea, [contenteditable="true"]',
      submit: 'button[type="submit"], button[aria-label="Post"], div[role="button"][aria-label="Post"]'
    },
    closeModal: 'button[aria-label="Close"], [data-testid="sheet-close"], div[role="button"][aria-label="Close"]'
  }
};
