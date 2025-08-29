import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import Sender from './components/Sender';
import Receiver from './components/Receiver';
import LogPanel from './components/LogPanel';
import soundService from './services/soundService';

const SunIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const MoonIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
  </svg>
);

const App: React.FC = () => {
  const [isHowItWorksVisible, setIsHowItWorksVisible] = useState(false);
  const [isSenderCollapsed, setIsSenderCollapsed] = useState(false);
  const [isReceiverCollapsed, setIsReceiverCollapsed] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  const [theme, setTheme] = useState(() => {
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [theme]);

  const toggleTheme = () => {
    soundService.playClick();
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const toggleHowItWorks = () => {
    soundService.playClick();
    setIsHowItWorksVisible(!isHowItWorksVisible);
  };

  const toggleSender = () => {
    soundService.playClick();
    setIsSenderCollapsed(!isSenderCollapsed);
  };
  
  const toggleReceiver = () => {
    soundService.playClick();
    setIsReceiverCollapsed(!isReceiverCollapsed);
  };

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 dark:bg-black dark:text-gray-200 font-sans">
      <div className="sticky top-0 z-50 bg-gray-100/80 dark:bg-black/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <header className="relative text-center max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:py-6">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-cyan-600 dark:text-cyan-400 tracking-tight">
            Акустический текстовый трансивер
          </h1>
          {!isNative && (
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
              Передавайте текстовые сообщения с помощью аудиосигналов во время звонка, интернет не требуется.
            </p>
          )}
          <div className="absolute top-1/2 right-4 -translate-y-1/2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-black focus:ring-cyan-500 transition-colors"
              aria-label="Переключить тему"
              title="Переключить тему"
            >
              {theme === 'light' ? <MoonIcon /> : <SunIcon />}
            </button>
          </div>
        </header>
      </div>

      <div className="max-w-7xl mx-auto p-2 sm:p-4 lg:p-8">
        <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl shadow-2xl p-4 sm:p-6 mb-8">
          <div className={`border-b-2 pb-2 ${isHowItWorksVisible ? 'border-cyan-500' : 'border-transparent'}`}>
            <button
              onClick={toggleHowItWorks}
              className="w-full flex justify-between items-center text-left text-2xl font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-950 focus:ring-cyan-500 rounded-md"
              aria-expanded={isHowItWorksVisible}
              aria-controls="how-it-works-content"
            >
              <span>Как это работает</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-6 w-6 transition-transform duration-300 text-gray-500 dark:text-gray-400 ${
                  isHowItWorksVisible ? 'rotate-180' : ''
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          <div
            id="how-it-works-content"
            className={`transition-all duration-500 ease-in-out overflow-hidden ${
              isHowItWorksVisible ? 'max-h-96 pt-4' : 'max-h-0'
            }`}
          >
            <div className="text-gray-600 dark:text-gray-300 space-y-2">
                <p>1. <span className="font-semibold text-cyan-600 dark:text-cyan-400">Отправитель:</span> Введите сообщение и нажмите «Передать». Приложение преобразует каждый символ в уникальный звуковой тон и воспроизводит его.</p>
                <p>2. <span className="font-semibold text-cyan-600 dark:text-cyan-400">Звонок:</span> Во время телефонного разговора воспроизведите эти тоны. Звук будет уловлен телефоном другого человека.</p>
                <p>3. <span className="font-semibold text-cyan-600 dark:text-cyan-400">Получатель:</span> Человек на другом конце провода использует это приложение и нажимает «Начать прослушивание». Приложение слушает через микрофон и в реальном времени декодирует тоны обратно в текст.</p>
                <p className="text-sm pt-2 text-amber-600 dark:text-amber-400">
                  <span className="font-bold">Примечание:</span> Для достижения наилучших результатов убедитесь, что громкость отправителя высокая, а получатель находится в тихой обстановке. Производительность может варьироваться из-за сжатия при вызове и фонового шума.
                </p>
            </div>
          </div>
        </div>


        <main className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Sender isCollapsed={isSenderCollapsed} onToggle={toggleSender} />
          <Receiver isCollapsed={isReceiverCollapsed} onToggle={toggleReceiver} />
        </main>

        <section aria-labelledby="log-panel-heading">
          <LogPanel />
        </section>

        <footer className="text-center mt-12 text-gray-500 text-sm">
          <p>2025 © All rights reserved. Created by developer3000@mail.ru</p>
        </footer>
      </div>
    </div>
  );
};

export default App;