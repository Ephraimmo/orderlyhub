import { Component, type ErrorInfo, type ReactNode } from "react";
import { AppLogo, CONSOLE_NAME } from "@/components/HearthLogo";

type State = { error: Error | null };

/** Top-level client error screen, so a render crash still shows the app's name and mark instead of a blank page. */
class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
    document.title = `Something went wrong — ${CONSOLE_NAME}`;
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="flex max-w-md flex-col items-center text-center">
          <AppLogo className="mb-8" />
          <h1 className="mb-2 text-2xl font-bold">Something went wrong</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            This screen hit an unexpected error. Reload to try again — if it keeps happening, contact your platform administrator.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
