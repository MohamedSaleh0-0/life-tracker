// Last line of defense for any React tree mounted inside an Obsidian
// Modal or view. Without this, an uncaught render error unmounts the
// whole root with no visible feedback (React's default with no error
// boundary) — that's exactly what produced the "blank modal, nothing
// more nothing less" bug: the real error only ever existed in the
// devtools console. This surfaces it in the UI itself instead.

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('Life Tracker UI crashed:', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="ltk-error-boundary">
          <p>Something went wrong rendering this view.</p>
          <pre>{this.state.error.stack ?? this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
