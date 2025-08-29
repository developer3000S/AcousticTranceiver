# Теперь, чтобы создать APK, вам нужно будет выполнить следующие шаги уже на вашем компьютере:
#git commit -a
#git commit -m "Добавлены изменения"
#git add .
#git pull

## Шаг 1. Очистите кэш npm: 
npm cache clean --force

## Шаг 2. Удалите папку node_modules и android 
rm -rf node_modules
rm -rf node_modules
rm -rf android
rm -rf dist

## Шаг 3. Переустановите зависимости: 
rm package-lock.json
#npm install --legacy-peer-deps
npm install
# Пофиксили ошибки
npm audit fix --force

## Шаг 4. Локальный запуск:
#npm run dev

## Шаг 5. Соберите веб-приложение:
sed -i '' 's|Создано с помощью React, TypeScript и Tailwind CSS. Работает на Web Audio API.|2025 © All rights reserved. Created by developer3000@mail.ru|g' ./src/App.tsx
#npm run build:mobile
npm run build

## Шаг 6. Добавьте платформу Android:
npx cap add android
cp -R ./docs/AndroidManifest.xml ./android/app/src/main/

## Шаг 7: Синхронизация с Android-проектом
### Скопируйте собранные веб-файлы в нативный Android-проект.
npx cap sync android

## Шаг 8: Открытие проекта в Android Studio
### Откройте созданный нативный проект в Android Studio.
npx cap open android

## **Совет:** Для вашего удобства шаги 4, 5 и 6 объединены в один скрипт. Вы можете просто выполнить команду:
# ```bash
# npm run android
# ```

## Шаг 9: Сборка APK в Android Studio
#1.  После открытия проекта в Android Studio подождите, пока завершится синхронизация Gradle.
#2.  В верхнем меню выберите **Build** -> **Build Bundle(s) / APK(s)** -> **Build APK(s)**.
#3.  После завершения сборки появится уведомление. Нажмите на ссылку **"locate"**, чтобы найти сгенерированный файл `app-debug.apk` в папке `app/build/outputs/apk/debug/`.
#4.  Этот файл можно скопировать на ваш Android-телефон и установить.

#Для создания релизной версии (`release APK`) потребуется настроить подпись приложения. 
# Это можно сделать через меню **Build** -> **Generate Signed Bundle / APK**.