import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface ProcessProgress {
  current?: number;
  total?: number;
  message?: string;
  stage?: string;
}

export interface ProcessState {
  isProcessing: boolean;
  message: string;
  progress?: ProcessProgress | null;
}

interface ProcessContextType {
  isProcessing: boolean;
  message: string;
  progress: ProcessProgress | null;
  startProcess: (message?: string, progress?: ProcessProgress) => void;
  updateProcess: (update: { message?: string; progress?: ProcessProgress }) => void;
  endProcess: () => void;
  withProcess: <T>(message: string, task: (updateProgress: (p: ProcessProgress) => void) => Promise<T>) => Promise<T>;
}

const ProcessContext = createContext<ProcessContextType | undefined>(undefined);

export function ProcessProvider({ children }: { children: ReactNode }) {
  const [processCount, setProcessCount] = useState(0);
  const [message, setMessage] = useState('Procesando...');
  const [progress, setProgress] = useState<ProcessProgress | null>(null);

  const isProcessing = processCount > 0;

  // Actualizar la clase del cursor en el elemento raíz (body) cuando haya procesos activos
  useEffect(() => {
    if (isProcessing) {
      document.body.classList.add('cursor-progress');
      document.documentElement.classList.add('cursor-progress');
    } else {
      document.body.classList.remove('cursor-progress');
      document.documentElement.classList.remove('cursor-progress');
    }

    return () => {
      document.body.classList.remove('cursor-progress');
      document.documentElement.classList.remove('cursor-progress');
    };
  }, [isProcessing]);

  const startProcess = (msg: string = 'Procesando...', initialProgress?: ProcessProgress) => {
    setMessage(msg);
    if (initialProgress) {
      setProgress(initialProgress);
    } else {
      setProgress(null);
    }
    setProcessCount(prev => prev + 1);
  };

  const updateProcess = (update: { message?: string; progress?: ProcessProgress }) => {
    if (update.message) setMessage(update.message);
    if (update.progress !== undefined) setProgress(update.progress);
  };

  const endProcess = () => {
    setProcessCount(prev => {
      const next = Math.max(0, prev - 1);
      if (next === 0) {
        setProgress(null);
      }
      return next;
    });
  };

  const withProcess = async <T,>(
    msg: string,
    task: (updateProgress: (p: ProcessProgress) => void) => Promise<T>
  ): Promise<T> => {
    startProcess(msg);
    try {
      return await task((p: ProcessProgress) => {
        setProgress(p);
        if (p.message) setMessage(p.message);
      });
    } finally {
      endProcess();
    }
  };

  return (
    <ProcessContext.Provider
      value={{
        isProcessing,
        message,
        progress,
        startProcess,
        updateProcess,
        endProcess,
        withProcess
      }}
    >
      {children}
    </ProcessContext.Provider>
  );
}

export function useProcess() {
  const context = useContext(ProcessContext);
  if (!context) {
    throw new Error('useProcess must be used within a ProcessProvider');
  }
  return context;
}
