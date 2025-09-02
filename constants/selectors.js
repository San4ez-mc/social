// constants/selectors.js
// Стабільні селектори без прив'язки до локалізації UI

export const THREADS_HOME_URLS = [
    "https://www.threads.com/login?hl=uk",
    "https://www.threads.com/",
    "https://threads.com/",
];

// На головній (неавторизовано)

// 1) canonical <a href="/login">
export const THREADS_LOGIN_ANCHOR = 'a[href^="/login"]';

// Текст посилання/кнопки входу
export const THREADS_LOGIN_ENTRY_TEXT = /Увійти|Log in/i;

// Форма логіну Threads
export const THREADS_LOGIN_USER_INPUT = 'input[type="text"], input[type="email"], input[name="username"], input[autocomplete="username"]';
export const THREADS_LOGIN_PASS_INPUT = 'input[type="password"], input[name="password"], input[autocomplete="current-password"]';
export const THREADS_LOGIN_SUBMIT = "//div[@role='button'][.//div[contains(normalize-space(), 'Увійти')]]";


// Ознаки авторизованого фіду
export const THREADS_PROFILE_LINK = 'a[href^="/@"]';
export const THREADS_COMPOSER_ANY = 'span,[role="textbox"],[contenteditable="true"]';

// Шляхи для cookies
export const COOKIES_THREADS_PATH = "cookies.json";

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
