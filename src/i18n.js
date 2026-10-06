import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import ko from './locales/ko.json'
import en from './locales/en.json'

const savedLanguage =
  localStorage.getItem('adscope_language') || 'ko'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ko: {
        translation: ko,
      },
      en: {
        translation: en,
      },
    },

    lng: savedLanguage,

    // 영어 번역이 아직 없는 곳은
    // 한국어로 표시
    fallbackLng: 'ko',

    supportedLngs: [
      'ko',
      'en',
    ],

    interpolation: {
      escapeValue: false,
    },
  })

document.documentElement.lang =
  i18n.language

i18n.on(
  'languageChanged',
  (language) => {
    localStorage.setItem(
      'adscope_language',
      language
    )

    document.documentElement.lang =
      language
  }
)

export default i18n