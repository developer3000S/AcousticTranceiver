import React, { useState, useEffect, useMemo } from 'react';
import { playMessage, generateMessageWav } from '../services/audioService';
import logger from '../services/logger';
import { ProtocolId, PROTOCOLS, Protocol, TEXT_ENCODING_MAP } from '../constants';
import TransmissionVisualizer from './TransmissionVisualizer';
import soundService from '../services/soundService';

interface SenderProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const Sender: React.FC<SenderProps> = ({ isCollapsed, onToggle }) => {
  const [message, setMessage] = useState<string>('Привет!');
  const [isTransmitting, setIsTransmitting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  
  const [transmissionProgress, setTransmissionProgress] = useState(0);
  const [transmittingChar, setTransmittingChar] = useState<string | null>(null);
  const [transmittingFreq, setTransmittingFreq] = useState<number | null>(null);
  
  const [protocolId, setProtocolId] = useState<ProtocolId>('dtmf_standard');
  const [volume, setVolume] = useState<number>(1);
  const [toneDuration, setToneDuration] = useState<number>(PROTOCOLS.dtmf_standard.toneDuration);
  const [pauseDuration, setPauseDuration] = useState<number>(PROTOCOLS.dtmf_standard.pauseDuration);

  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [wavUrl, setWavUrl] = useState<string | null>(null);

  const initialTemplates = ["Да", "Как дела?", "Нет", "Перезвони мне", "Пока", "Привет!", "Скоро буду", "Спасибо!", "Хорошо", "Я за рулем"];

  const [templates, setTemplates] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('messageTemplates');
      return saved ? JSON.parse(saved).sort((a: string, b: string) => a.localeCompare(b)) : initialTemplates;
    } catch (error) {
      logger.error('Failed to parse templates from localStorage', error);
      return initialTemplates;
    }
  });
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  
  const currentProtocol = useMemo((): Protocol => {
    if (protocolId === 'custom') {
      return {
        ...PROTOCOLS.custom,
        toneDuration,
        pauseDuration,
      };
    }
    return PROTOCOLS[protocolId];
  }, [protocolId, toneDuration, pauseDuration]);
  
  useEffect(() => {
    if (protocolId !== 'custom') {
      setToneDuration(currentProtocol.toneDuration);
      setPauseDuration(currentProtocol.pauseDuration);
    }
  }, [protocolId, currentProtocol]);

  useEffect(() => {
    try {
      localStorage.setItem('messageTemplates', JSON.stringify(templates));
    } catch (error) {
      logger.error('Failed to save templates to localStorage', error);
    }
  }, [templates]);

  useEffect(() => {
    return () => {
        if (wavUrl) URL.revokeObjectURL(wavUrl);
    };
  }, [wavUrl]);

  const handleRemoveTemplate = () => {
    soundService.playClick();
    if (!selectedTemplate) return;
    const templateToRemove = selectedTemplate;
    setTemplates(templates.filter(t => t !== templateToRemove));
    setSelectedTemplate('');
    if (message === templateToRemove) {
      setMessage('');
    }
    logger.info(`Шаблон удален: "${templateToRemove}"`);
  };

  const handleSelectTemplate = (template: string) => {
    soundService.playClick();
    if (template) {
      if (template === message) {
        setSelectedTemplate('');
        return;
      }
      setSelectedTemplate(template);
      setMessage(template);
      setError(null);
    }
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    if (selectedTemplate && e.target.value !== selectedTemplate) {
      setSelectedTemplate('');
    }
    if (wavUrl) {
        setWavUrl(null);
    }
  };

  const handleSaveMessageAsTemplate = () => {
    soundService.playClick();
    const trimmedMessage = message.trim();
    if (!trimmedMessage || templates.includes(trimmedMessage)) return;
    const newTemplates = [...templates, trimmedMessage].sort((a, b) => a.localeCompare(b));
    setTemplates(newTemplates);
    setSelectedTemplate(trimmedMessage);
    logger.info(`Сообщение сохранено как шаблон: "${trimmedMessage}"`);
  };
  
  const commonButtonDisabled = isTransmitting || isSaving || isTesting;

  const isCharSupported = (char: string): boolean => {
    return TEXT_ENCODING_MAP.has(char.toLowerCase()) && !['*', '#'].includes(char);
  };

  const getTransmissionPayload = (msg: string): string => {
    return msg.split('').filter(isCharSupported).join('');
  }

  const handleTransmit = async () => {
    soundService.playClick();
    if (wavUrl) {
        setWavUrl(null);
    }
    if (!message || commonButtonDisabled) return;
    setError(null);
    setIsTransmitting(true);
    try {
      const payload = getTransmissionPayload(message);
      if (!payload) {
        logger.warn("Передача отменена: в сообщении нет поддерживаемых символов.");
        setIsTransmitting(false);
        return;
      }
      logger.info(`Начало передачи аудио (протокол: ${currentProtocol.name})...`);
      
      await playMessage(
        payload, 
        volume, 
        currentProtocol,
        (index, totalLength, token, freq) => {
            setTransmittingFreq(freq);
            setTransmittingChar(token);
            if (index !== null) {
                setTransmissionProgress(((index + 1) / totalLength) * 100);
            } else {
                setTransmissionProgress(0);
                setTransmittingFreq(null);
                setTransmittingChar(null);
            }
        }
      );
      setMessage('');
      setSelectedTemplate('');
    } catch (err) {
      logger.error('Ошибка при передаче аудио', err);
      setError('Не удалось передать аудио.');
      soundService.playError();
    } finally {
      setIsTransmitting(false);
      setTransmissionProgress(0);
    }
  };
  
  const handleTestConnection = async () => {
    soundService.playClick();
    if (commonButtonDisabled) return;

    const messageToTest = "тест 123";
    
    setError(null);
    setIsTesting(true);
    try {
        const payload = getTransmissionPayload(messageToTest);
        logger.info(`Начало тестовой передачи (протокол: ${currentProtocol.name})...`);
        await playMessage(
            payload, 
            volume, 
            currentProtocol,
            (index, totalLength, token, freq) => {
                setTransmittingFreq(freq);
                setTransmittingChar(token);
                if (index !== null) {
                    setTransmissionProgress(((index + 1) / totalLength) * 100);
                } else {
                    setTransmissionProgress(0);
                    setTransmittingFreq(null);
                    setTransmittingChar(null);
                }
            }
        );
        logger.info('Тестовая передача завершена.');
    } catch (err) {
        logger.error('Ошибка во время тестовой передачи', err);
        setError('Не удалось выполнить тестовую передачу.');
        soundService.playError();
    } finally {
        setIsTesting(false);
        setTransmissionProgress(0);
    }
  };

  const handleSave = async () => {
    soundService.playClick();
    if (wavUrl) {
        setWavUrl(null);
    }
    if (!message || commonButtonDisabled) return;
    setError(null);
    setIsSaving(true);
    try {
      const payload = getTransmissionPayload(message);
      if (!payload) {
        logger.warn("Сохранение отменено: в сообщении нет поддерживаемых символов.");
        setIsSaving(false);
        return;
      }
      logger.info(`Начало генерации WAV файла (протокол: ${currentProtocol.name})...`);
      const blob = await generateMessageWav(payload, volume, currentProtocol);

      if (blob) {
        const url = URL.createObjectURL(blob);
        setWavUrl(url);
        const a = document.createElement('a');
        a.href = url;
        a.download = `message_${Date.now()}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        logger.info('WAV файл успешно сохранен.');
        soundService.playSuccess();
        setMessage('');
        setSelectedTemplate('');
      } else {
        throw new Error('Сгенерированный blob имеет значение null.');
      }
    } catch (err) {
      logger.error('Не удалось сохранить WAV файл', err);
      setError('Не удалось сохранить WAV файл.');
      soundService.playError();
    } finally {
      setIsSaving(false);
    }
  };

  const renderMessageWithHighlight = () => {
    return message.split('').map((char, index) => (
      <span
        key={index}
        className={`transition-colors duration-100 ${!isCharSupported(char) ? 'text-red-400 underline decoration-wavy decoration-red-500' : (isTransmitting ? 'text-gray-500 dark:text-gray-600' : 'text-gray-700 dark:text-gray-400')}`}
      >
        {char}
      </span>
    ));
  };

  const hasUnsupportedChars = useMemo(() => message.split('').some(char => !isCharSupported(char)), [message]);
  const canSaveAsTemplate = message.trim() && !templates.includes(message.trim());
  
  const effectiveMessageLength = useMemo(() => {
    const payload = getTransmissionPayload(message);
    return currentProtocol.transform(payload).length;
  }, [message, currentProtocol]);

  const getDisplayChar = (char: string | null): string => {
    if (char === ' ') return '⎵';
    if (char === null) return '-';
    return char;
  };

  return (
    <div className="bg-white dark:bg-gray-950 rounded-lg p-4 sm:p-6 shadow-lg border border-gray-200 dark:border-gray-800">
      <button
        onClick={onToggle}
        className="w-full flex justify-between items-center text-left focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-950 focus:ring-cyan-500 rounded-md"
        aria-expanded={!isCollapsed}
        aria-controls="sender-content"
      >
        <div className="flex items-center">
          <div className="w-10 h-10 bg-cyan-500/10 dark:bg-cyan-500/20 rounded-full flex items-center justify-center mr-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-cyan-500 dark:text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Отправитель</h2>
        </div>
        <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-6 w-6 transition-transform duration-300 text-gray-500 dark:text-gray-400 ${isCollapsed ? '' : 'rotate-180'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div
        id="sender-content"
        className={`transition-all duration-500 ease-in-out overflow-hidden ${isCollapsed ? 'max-h-0' : 'max-h-[2200px]'}`}
      >
        <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-800">
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-3 rounded-md relative mb-4" role="alert">
                <span className="block sm:inline">{error}</span>
                <button onClick={() => setError(null)} className="absolute top-0 bottom-0 right-0 px-4 py-3" aria-label="Закрыть">
                    <svg className="fill-current h-6 w-6 text-red-400" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Закрыть</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/></svg>
                </button>
            </div>
          )}
          
          <div className="space-y-6">
            <div>
              <label htmlFor="message-input" className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Сообщение для передачи</label>
              <div className={`relative bg-gray-100 dark:bg-black rounded-md p-2 pr-8 border border-gray-300 dark:border-gray-700 transition-all ${isTransmitting ? 'bg-gray-200 dark:bg-gray-900' : 'focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-500'}`}>
                <div className="font-mono text-lg h-10 overflow-x-auto whitespace-pre flex items-center">
                  {message ? renderMessageWithHighlight() : <span className="text-gray-500">Введите ваше сообщение...</span>}
                </div>
                <textarea
                  id="message-input" value={message} onChange={handleMessageChange}
                  className="absolute top-0 left-0 w-full h-full bg-transparent border-0 text-transparent caret-cyan-400 resize-none p-2 focus:outline-none focus:ring-0"
                  disabled={commonButtonDisabled} aria-label="Message to transmit"
                />
              </div>
              <div className="flex justify-between items-center mt-1 px-1 text-xs">
                {hasUnsupportedChars ? (
                  <p className="text-amber-500 dark:text-amber-400">Неподдерживаемые символы <span className="text-red-400 underline decoration-wavy decoration-red-500">подчеркнуты</span>.</p>
                ) : (
                  <p className="text-gray-500">Все символы поддерживаются.</p>
                )}
                <p className="text-gray-500">{message.length} символов</p>
              </div>
            </div>

            <div>
              <label htmlFor="template-select" className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Шаблоны</label>
              <div className="flex flex-wrap gap-2 items-center">
                  <select
                      id="template-select" value={selectedTemplate} onChange={(e) => handleSelectTemplate(e.target.value)} disabled={commonButtonDisabled}
                      className={`w-full sm:w-auto sm:flex-grow bg-white dark:bg-black border rounded-md px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 disabled:opacity-50 transition-colors ${selectedTemplate ? 'border-cyan-500' : 'border-gray-300 dark:border-gray-700'}`}
                      aria-label="Выберите шаблон"
                  >
                      <option value="" disabled>Выберите из списка...</option>
                      {templates.map((template) => (<option key={template} value={template}>{template}</option>))}
                  </select>
                   <button
                      onClick={handleRemoveTemplate} disabled={commonButtonDisabled || !selectedTemplate}
                      className="p-2 bg-gray-200 dark:bg-gray-800 hover:bg-red-500/20 dark:hover:bg-red-600/50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-white rounded-md transition-colors"
                      aria-label="Удалить выбранный шаблон" title="Удалить выбранный шаблон"
                  >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                  <button
                      onClick={handleSaveMessageAsTemplate} disabled={commonButtonDisabled || !canSaveAsTemplate}
                      className="p-2 bg-gray-200 dark:bg-gray-800 hover:bg-green-500/20 dark:hover:bg-green-600/50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-white rounded-md transition-colors"
                      aria-label="Сохранить текущее сообщение как шаблон" title="Сохранить текущее сообщение как шаблон"
                  >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                  </button>
              </div>
            </div>

            <TransmissionVisualizer currentFrequency={transmittingFreq} charToFreqMap={currentProtocol.charToFreqMap} />

            <button
              onClick={() => { soundService.playClick(); setShowSettings(!showSettings); }}
              className="w-full flex justify-between items-center text-left text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors py-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-950 focus:ring-cyan-500 rounded-md px-2"
              aria-expanded={showSettings} aria-controls="sender-settings"
            >
              <span className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <span>Настройки передачи</span>
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-300 ${showSettings ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div
              id="sender-settings"
              className={`transition-all duration-500 ease-in-out overflow-hidden ${showSettings ? 'max-h-[800px] opacity-100 pt-4 mt-2 border-t border-gray-200 dark:border-gray-800' : 'max-h-0 opacity-0'}`}
            >
              <div className="space-y-6">
                <fieldset>
                    <legend className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Режим передачи</legend>
                    <div className="space-y-2">
                        {Object.values(PROTOCOLS).filter(p => p.id !== 'custom').map(protocol => (
                            <label key={protocol.id} className="flex items-start p-3 bg-gray-100 dark:bg-gray-900 rounded-md cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-800 has-[:checked]:border-cyan-500 has-[:checked]:bg-cyan-500/10 dark:has-[:checked]:bg-cyan-900/20">
                                <input
                                    type="radio" name="protocol" value={protocol.id} checked={protocolId === protocol.id}
                                    onChange={() => setProtocolId(protocol.id)}
                                    className="h-4 w-4 mt-1 text-cyan-600 bg-gray-300 dark:bg-gray-700 border-gray-400 dark:border-gray-600 focus:ring-cyan-500"
                                    disabled={commonButtonDisabled}
                                />
                                <div className="ml-3 text-sm">
                                    <span className="font-medium text-gray-900 dark:text-white">{protocol.name}</span>
                                    <p className="text-gray-600 dark:text-gray-400">{protocol.description}</p>
                                </div>
                            </label>
                        ))}
                    </div>
                </fieldset>

                <div className="p-4 bg-gray-100 dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-800 space-y-4">
                  <p className={`text-sm font-medium text-center transition-colors ${protocolId === 'custom' ? 'text-cyan-500 dark:text-cyan-400' : 'text-gray-600 dark:text-gray-300'}`}>
                    {protocolId === 'custom' ? 'Выбран пользовательский режим' : 'Ручная настройка (переключит в Пользовательский режим)'}
                  </p>
                  <div>
                    <label htmlFor="tone-duration-slider" className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Длительность тона</label>
                    <div className="flex items-center gap-4">
                      <input
                        id="tone-duration-slider" type="range" min="50" max="600" step="10" value={toneDuration}
                        onChange={(e) => { setToneDuration(parseInt(e.target.value, 10)); setProtocolId('custom'); }}
                        className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50"
                        disabled={commonButtonDisabled}
                      />
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-12 text-right">{toneDuration} мс</span>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="pause-slider" className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Пауза между символами</label>
                    <div className="flex items-center gap-4">
                      <input
                        id="pause-slider" type="range" min="25" max="500" step="5" value={pauseDuration}
                        onChange={(e) => { setPauseDuration(parseInt(e.target.value, 10)); setProtocolId('custom'); }}
                        className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50"
                        disabled={commonButtonDisabled}
                      />
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-12 text-right">{pauseDuration} мс</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <label htmlFor="volume-slider" className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Громкость передачи</label>
                  <div className="flex items-center gap-4">
                    <input
                      id="volume-slider" type="range" min="0" max="1" step="0.01" value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50"
                      disabled={commonButtonDisabled}
                    />
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-12 text-right">{Math.round(volume * 100)}%</span>
                  </div>
                </div>
              </div>
            </div>
            
            {(isTransmitting || isTesting) && (
              <div className="pt-2">
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-cyan-500 dark:text-cyan-300">{isTesting ? 'Прогресс теста:' : 'Передача:'}</span>
                    <span className="font-mono text-lg px-2 py-0.5 bg-gray-200 dark:bg-gray-800 rounded text-cyan-500 dark:text-cyan-300">{getDisplayChar(transmittingChar)}</span>
                    {transmittingFreq && (
                      <span className="text-xs font-mono text-cyan-500 dark:text-cyan-400">
                        {Math.round(transmittingFreq)} Гц
                      </span>
                    )}
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">({Math.ceil(transmissionProgress / 100 * effectiveMessageLength)}/{effectiveMessageLength})</span>
                  </div>
                  <span className="text-sm font-medium text-cyan-500 dark:text-cyan-300">{transmissionProgress.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-gray-300 dark:bg-gray-700 rounded-full h-2.5">
                  <div className="bg-cyan-500 h-2.5 rounded-full transition-all duration-150 ease-linear" style={{ width: `${transmissionProgress}%` }} />
                </div>
              </div>
            )}

            <div className="flex items-center justify-center h-8 text-sm">
              {isTransmitting || isSaving || isTesting ? (
                <div className="flex items-center text-cyan-500 dark:text-cyan-400" role="status" aria-live="assertive">
                  <svg className="animate-spin mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <span>Статус: {isTransmitting ? 'Передача...' : isSaving ? 'Сохранение...' : 'Тестирование...'}</span>
                </div>
              ) : (
                <div className="flex items-center text-green-600 dark:text-green-400" role="status">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span>Статус: Готово к работе</span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleTransmit} disabled={commonButtonDisabled || !message}
                className="w-full flex justify-center items-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black focus:ring-cyan-500 disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-all"
              >
                Передать аудио
              </button>
              <button
                onClick={handleSave} disabled={commonButtonDisabled || !message}
                className="w-full flex justify-center items-center px-4 py-3 border border-gray-400 dark:border-gray-700 text-base font-medium rounded-md shadow-sm text-gray-800 dark:text-gray-200 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black focus:ring-gray-500 disabled:bg-gray-400 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-all"
              >
                Сохранить .wav
              </button>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-800 my-4"></div>
            <button
                onClick={handleTestConnection} disabled={commonButtonDisabled}
                className="w-full flex justify-center items-center gap-2 px-4 py-2 border border-yellow-500/50 text-base font-medium rounded-md shadow-sm text-yellow-600 dark:text-yellow-300 bg-yellow-500/10 dark:bg-yellow-600/20 hover:bg-yellow-500/20 dark:hover:bg-yellow-600/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                Проверить связь
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sender;