import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Ignore removeChild errors — usually caused by browser extensions
    // (screen recorders, ad blockers, translation tools) manipulating the DOM
    if (error.name === 'NotFoundError' && error.message.includes('removeChild')) {
      console.warn('[ErrorBoundary] Ignored DOM manipulation error (likely browser extension):', error.message);
      this.setState({ hasError: false, error: null });
      return;
    }
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-lg font-medium text-zinc-800">Something went wrong</p>
            <p className="max-w-md text-sm text-zinc-500">
              Try refreshing the page. If this keeps happening, check if any browser
              extensions (ad blockers, screen recorders) might be interfering.
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Refresh
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
