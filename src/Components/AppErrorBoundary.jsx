import { Component } from "react";

import Button from "./Button";

/**
 * Catches render failures and stale lazy chunks after a new deployment.
 * Reloading is the safe recovery for both cases.
 */
class AppErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error("Unhandled application error:", error, info);
    }

    render() {
        if (this.state.error) {
            return (
                <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
                    <section className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                        <h1 className="text-xl font-bold text-slate-950">Something went wrong</h1>
                        <p className="text-sm text-slate-500">
                            The app could not finish loading. This can happen after an update;
                            reloading usually fixes it. Your data has not been changed.
                        </p>
                        <p className="break-words rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                            {this.state.error?.message || "Unknown error"}
                        </p>
                        <Button onClick={() => window.location.reload()} className="w-full">
                            Reload app
                        </Button>
                    </section>
                </main>
            );
        }

        return this.props.children;
    }
}

export default AppErrorBoundary;
