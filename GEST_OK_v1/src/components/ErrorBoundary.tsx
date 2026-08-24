import React from 'react';

interface Props {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  private handleResetState = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public override render() {
    if (this.state.hasError) {
      const isQuotaError = this.state.error?.message?.toLowerCase().includes('quota') ||
                           this.state.error?.message?.toLowerCase().includes('resource-exhausted') ||
                           this.state.error?.message?.toLowerCase().includes('rate limit');

      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 text-slate-800">
          <div className="bg-white max-w-lg w-full rounded-2xl shadow-xl border border-slate-200 p-8 text-center space-y-6">
            <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {isQuotaError ? 'Límite de Consultas o Red Temporal' : (this.props.fallbackTitle || 'Ocurrió un error inesperado')}
              </h2>
              <p className="text-sm text-slate-600 mt-2">
                {isQuotaError
                  ? 'Se ha detectado una pausa temporal por límite de peticiones en la base de datos o conexión de red. Puedes reintentar la carga ahora.'
                  : 'El sistema interceptó una excepción de ejecución y evitó la pantalla en blanco.'}
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-left overflow-auto max-h-32 text-xs font-mono text-rose-700">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={this.handleResetState}
                className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg text-sm transition-colors"
              >
                Volver a intentar
              </button>
              <button
                onClick={this.handleRetry}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-sm transition-colors shadow"
              >
                Recargar Sistema
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
