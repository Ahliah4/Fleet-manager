import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

const DISMISS_KEY = "fleet-manager-install-dismissed";

function isStandalone() {
    return (
        window.matchMedia?.("(display-mode: standalone)").matches ||
        window.navigator.standalone === true
    );
}

function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [visible, setVisible] = useState(false);
    const [isIOS, setIsIOS] = useState(false);

    useEffect(() => {
        if (localStorage.getItem(DISMISS_KEY) || isStandalone()) return;

        const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
        setIsIOS(ios);

        const handleBeforeInstall = (event) => {
            event.preventDefault();
            setDeferredPrompt(event);
            setVisible(true);
        };

        window.addEventListener("beforeinstallprompt", handleBeforeInstall);

        // iOS never fires beforeinstallprompt, so show the manual steps once.
        if (ios) setVisible(true);

        return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    }, []);

    const dismiss = () => {
        localStorage.setItem(DISMISS_KEY, "1");
        setVisible(false);
    };

    const install = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        setDeferredPrompt(null);
        dismiss();
    };

    if (!visible) return null;

    return (
        <div className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-950/10 lg:bottom-6">
            <div className="flex items-start gap-3">
                <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
                    <Download size={20} />
                </div>

                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">Install IP Motors Fleet</p>
                    {isIOS ? (
                        <p className="mt-1 text-sm text-slate-500">
                            Tap <Share size={14} className="mx-1 inline" /> Share, then
                            “Add to Home Screen” to use the app full screen on iOS.
                        </p>
                    ) : (
                        <p className="mt-1 text-sm text-slate-500">
                            Add the app to your home screen for faster access and offline support.
                        </p>
                    )}

                    {!isIOS && (
                        <button
                            type="button"
                            onClick={install}
                            className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                        >
                            Install app
                        </button>
                    )}
                </div>

                <button
                    type="button"
                    aria-label="Dismiss install prompt"
                    onClick={dismiss}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}

export default InstallPrompt;
