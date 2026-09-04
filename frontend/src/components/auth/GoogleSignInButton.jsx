import { useEffect, useRef, useState } from "react";

// Google Identity Services client id. This is client-side configuration only —
// the client secret must never appear here (it is backend-only).
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

const NOT_CONFIGURED_MESSAGE =
  "Google sign-in is not configured. Add VITE_GOOGLE_CLIENT_ID to the frontend environment variables, and " +
  "GOOGLE_CLIENT_ID to the backend environment variables.";

const GSI_SRC = "https://accounts.google.com/gsi/client";

let gsiScriptPromise = null;

// Loads the Google Identity Services script once and reuses the loader promise
// so the button can be mounted/unmounted without loading it repeatedly.
function loadGsiScript() {
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google.accounts.id);
  }
  if (!gsiScriptPromise) {
    gsiScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GSI_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.google.accounts.id);
      script.onerror = () => {
        gsiScriptPromise = null;
        reject(new Error("Could not load the Google sign-in script. Please try again."));
      };
      document.head.appendChild(script);
    });
  }
  return gsiScriptPromise;
}

// Renders the official Google-branded sign-in button. When VITE_GOOGLE_CLIENT_ID
// is not set, falls back to a styled button that explains the missing config
// instead of pretending to work.
export default function GoogleSignInButton({ onCredential, onError, disabled }) {
  const containerRef = useRef(null);
  const callbackRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  const [state, setState] = useState(CLIENT_ID ? "loading" : "unconfigured");

  useEffect(() => {
    callbackRef.current = onCredential;
    onErrorRef.current = onError;
  }, [onCredential, onError]);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;

    loadGsiScript().then(
      (gis) => {
        if (cancelled) return;
        try {
          gis.initialize({
            client_id: CLIENT_ID,
            callback: (response) => callbackRef.current?.(response),
            ux_mode: "popup",
            auto_select: false,
          });
          gis.renderButton(containerRef.current, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "continue_with",
            shape: "rectangular",
            width: Math.min(containerRef.current?.clientWidth || 280, 400),
          });
          setState("ready");
        } catch (err) {
          setState("error");
          onErrorRef.current?.(
            err?.message || "Google sign-in could not be initialized. Check the configured client id."
          );
        }
      },
      (err) => {
        if (cancelled) return;
        setState("error");
        onErrorRef.current?.(err?.message || "Google sign-in failed to load");
      }
    );

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "unconfigured") {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onErrorRef.current?.(NOT_CONFIGURED_MESSAGE)}
        className="w-full flex items-center justify-center gap-2 border rounded-lg py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
      >
        <GoogleLogo />
        Continue with Google
      </button>
    );
  }

  // The ref container must be mounted from the first render, not gated on
  // `state === "ready"`: renderButton is invoked as soon as the GSI script
  // resolves, which can happen before React re-renders with state "ready".
  // A conditionally-mounted target would be null at that moment and GSI would
  // silently fail ("no parent or options set") with no button ever appearing.
  return (
    <div className="w-full flex items-center justify-center" style={{ minHeight: 44 }}>
      <div
        ref={containerRef}
        style={{ display: state === "ready" ? "inline-block" : "none" }}
      />
      {state !== "ready" && (
        <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
      )}
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.3 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.3 2.7l6-6C33.9 6.5 29.2 4.5 24 4.5 12.7 4.5 3.5 13.7 3.5 25S12.7 45.5 24 45.5 44.5 36.3 44.5 25c0-1.6-.2-3.1-.9-4.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c2.8 0 5.3 1 7.3 2.7l6-6C33.9 6.5 29.2 4.5 24 4.5c-7.6 0-14.1 4.3-17.4 10.6z"/>
      <path fill="#4CAF50" d="M24 45.5c5.1 0 9.8-1.9 13.3-5.1l-6.2-5.2C29.3 36.6 26.8 37.5 24 37.5c-5.3 0-9.7-3.5-11.3-8.3l-6.6 5C9.8 41.1 16.4 45.5 24 45.5z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1 2.7-2.8 4.9-5.2 6.3l6.2 5.2C39.9 36.5 44.5 31.2 44.5 25c0-1.6-.2-3.1-.9-4.5z"/>
    </svg>
  );
}