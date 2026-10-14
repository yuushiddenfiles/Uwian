import { Component } from "react";

/* Last-resort crash catcher: converts a white-screen crash into a diagnosed,
   recoverable state with the component stack visible. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error("Uwian crash:", error, info?.componentStack);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto my-10 max-w-xl rounded-base border-2 border-border bg-background p-6 shadow-shadow">
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {String(error?.message || error)}
        </p>
        {info?.componentStack ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold">
              Where it crashed (screenshot this)
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-base border-2 border-border bg-secondary-background p-3 font-mono text-xs whitespace-pre-wrap break-all">
              {info.componentStack}
            </pre>
          </details>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-base border-2 border-border bg-main px-4 py-2 text-sm font-bold shadow-shadow"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
          <a
            href="/groups"
            className="rounded-base border-2 border-border bg-secondary-background px-4 py-2 text-sm font-semibold no-underline"
          >
            Back to sessions
          </a>
        </div>
      </div>
    );
  }
}
