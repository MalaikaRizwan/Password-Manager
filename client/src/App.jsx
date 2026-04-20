import { useEffect, useState } from "react";
import AuthPage from "../pages/AuthPage";
import VaultPage from "../pages/VaultPage";
import { api } from "../services/api";
import Loader from "../components/UI/Loader";

export default function App() {
  const [session, setSession] = useState(null);
  const [authSalt, setAuthSalt] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.onUnauthorized(() => {
      setSession(null);
      setAuthSalt("");
    });
  }, []);

  useEffect(() => {
    api
      .getCsrfToken()
      .then(() => setLoading(false))
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!session) return;
    const inactivityMs = 15 * 60 * 1000;
    let timer = null;

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          await api.logout();
        } catch {
          // Best effort logout on inactivity.
        }
        setSession(null);
        setAuthSalt("");
      }, inactivityMs);
    };

    const events = ["mousemove", "keydown", "mousedown", "touchstart"];
    for (const eventName of events) {
      window.addEventListener(eventName, resetTimer);
    }
    resetTimer();

    return () => {
      if (timer) clearTimeout(timer);
      for (const eventName of events) {
        window.removeEventListener(eventName, resetTimer);
      }
    };
  }, [session]);

  if (loading) {
    return (
      <div className="bg-orbs flex min-h-screen items-center justify-center">
        <Loader label="Loading security context..." />
      </div>
    );
  }

  if (!session) {
    return <AuthPage onLoggedIn={setSession} onSaltReady={setAuthSalt} />;
  }

  return (
    <VaultPage
      session={session}
      authSalt={authSalt}
      onLogout={async () => {
        await api.logout();
        setSession(null);
        setAuthSalt("");
      }}
    />
  );
}
