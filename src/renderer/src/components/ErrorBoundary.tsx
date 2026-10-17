import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Shows what went wrong, with a way out, instead of leaving the window blank. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Waypoint hit an error:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <p className="crash__title">Something went wrong in this window.</p>
        <p className="crash__detail">{error.message}</p>
        <button type="button" className="crash__reload" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
