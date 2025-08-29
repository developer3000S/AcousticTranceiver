// A simple logger utility to standardize console output and provide on-screen logging.

export type LogLevel = 'LOG' | 'INFO' | 'WARN' | 'ERROR';
export type LogEntry = {
  timestamp: string;
  level: LogLevel;
  message: string;
};
type Listener = (logs: LogEntry[]) => void;

let logs: LogEntry[] = [];
let listeners: Listener[] = [];

const notifyListeners = () => {
  for (const listener of listeners) {
    // Return a copy to prevent mutation
    listener([...logs]);
  }
};

const addLog = (level: LogLevel, ...args: any[]) => {
  const timestamp = new Date().toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  
  const messageContent = args
    .map(arg => {
        if (arg instanceof Error) {
            return `${arg.name}: ${arg.message}`;
        }
        if (typeof arg === 'object' && arg !== null) {
            return JSON.stringify(arg, null, 2);
        }
        return String(arg);
    })
    .join(' ');

  const entry: LogEntry = { timestamp, level, message: `[${level}] ${messageContent}` };
  logs.push(entry);
  
  // Also log to console for development
  switch (level) {
    case 'INFO': console.info(`[${level}]`, ...args); break;
    case 'WARN': console.warn(`[${level}]`, ...args); break;
    case 'ERROR': console.error(`[${level}]`, ...args); break;
    default: console.log(`[${level}]`, ...args); break;
  }
  
  notifyListeners();
};

const logger = {
  log: (...args: any[]) => addLog('LOG', ...args),
  info: (...args: any[]) => addLog('INFO', ...args),
  warn: (...args: any[]) => addLog('WARN', ...args),
  error: (...args: any[]) => addLog('ERROR', ...args),
  
  subscribe: (listener: Listener): void => {
    listeners.push(listener);
    // Immediately provide current logs to the new subscriber
    listener([...logs]);
  },
  
  unsubscribe: (listener: Listener): void => {
    listeners = listeners.filter(l => l !== listener);
  },

  clearLogs: (): void => {
    logs = [];
    // A log message is added *after* clearing so the user knows it happened.
    addLog('INFO', 'Журнал очищен.');
  },
  
  getLogs: (): LogEntry[] => [...logs],
};

export default logger;