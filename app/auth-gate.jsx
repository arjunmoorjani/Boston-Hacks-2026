"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { hasStoredProfile } from "../lib/profile-store.mjs";
import { TopoArt } from "./topo-art";

const guestKey = "routable-guest-mode";

function guestPreference(value) {
  try {
    if (value === true) localStorage.setItem(guestKey, "1");
    if (value === false) localStorage.setItem(guestKey, "0");
    return localStorage.getItem(guestKey);
  } catch {
    return null;
  }
}

export function AuthGate({ children }) {
  const [client, setClient] = useState(null);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [guestConfirmed, setGuestConfirmed] = useState(false);
  const [guestName, setGuestName] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let subscription;
    const choice = guestPreference();
    setGuestConfirmed(choice === "1" || (choice === null && hasStoredProfile()));

    const callbackError = new URLSearchParams(window.location.hash.slice(1)).get("error_description");
    if (callbackError) setError(callbackError);

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      setReady(true);
      return;
    }

    import("../lib/supabase.mjs").then(({ supabase }) => {
      if (!active) return;
      setClient(supabase);
      subscription = supabase.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        const account = session?.user && !session.user.is_anonymous ? session.user : null;
        if (account) {
          guestPreference(false);
          setGuestConfirmed(false);
          setGuestName(null);
          setError("");
        } else if (event === "INITIAL_SESSION" && choice === null && session?.user.is_anonymous) {
          setGuestConfirmed(true);
        }
        setUser(account);
        setReady(true);
      }).data.subscription;
    }).catch(() => {
      if (!active) return;
      setError("Account services could not start. You can still continue as a guest.");
      setReady(true);
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  async function signOut() {
    const { error: signOutError } = await client.auth.signOut({ scope: "local" });
    if (signOutError) throw signOutError;
  }

  function enterGuest(name = "") {
    setGuestName(name.trim());
    guestPreference(true);
    setGuestConfirmed(true);
  }

  function exitGuest() {
    // Keep the anonymous Supabase session so re-entry can reuse its saved outings.
    guestPreference(false);
    setGuestConfirmed(false);
    setGuestName(null);
  }

  if (!ready) return <main className="welcome" aria-busy="true"><TopoArt full/><p role="status">Checking your session…</p></main>;

  if (user || guestConfirmed) {
    return children({ user, client, guestName: user ? null : guestName,
      onSignOut: user ? signOut : null, onExitGuest: user ? null : exitGuest });
  }

  return <Welcome client={client} startupError={error} onGuest={enterGuest}/>;
}

function Welcome({ client, startupError, onGuest }) {
  const [mode, setMode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const creating = mode === "create";
  const enteringAsGuest = mode === "guest";

  function choose(nextMode) {
    setError("");
    setConfirmation("");
    setMode(nextMode);
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!client) {
      setError("Account services are unavailable. Check the Supabase configuration or continue as a guest.");
      return;
    }

    const fields = new FormData(event.currentTarget);
    const email = fields.get("email").trim();
    const password = fields.get("password");
    const displayName = creating ? fields.get("name").trim() : "";
    if (creating && !displayName) {
      setError("Enter a display name.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (creating) {
        const { data, error: authError } = await client.auth.signUp({
          email, password,
          options: { data: { display_name: displayName }, emailRedirectTo: new URL("/", window.location.origin).href },
        });
        if (authError) throw authError;
        if (!data.session) {
          setMode(null);
          setConfirmation("Check your email for a confirmation link. Open the link to finish creating your account.");
        }
      } else {
        const { error: authError } = await client.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      }
    } catch (authError) {
      setError(authError?.message || "Account services are unavailable. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="welcome">
    <TopoArt full/>
    <section className="welcome-card" aria-labelledby="welcome-title">
      <div className="brand"><span><Icon name="route" size={20}/></span>routable<span className="brand-period">.</span></div>
      <h1 id="welcome-title">{enteringAsGuest ? "Continue as guest"
        : creating ? "Create account" : mode === "signin" ? "Sign in" : "Welcome to Routable"}</h1>
      <>
        {(error || startupError) && <p className="editor-error" role="alert">{error || startupError}</p>}
        {confirmation && <p className="welcome-confirmation" role="status">{confirmation}</p>}
        {enteringAsGuest ? <form onSubmit={event => {
          event.preventDefault();
          onGuest(new FormData(event.currentTarget).get("name") ?? "");
        }}>
          <fieldset>
            <label>Display name (optional)<input name="name" autoComplete="nickname" maxLength={30}/></label>
            <button type="submit" className="plan-primary">Continue</button>
            <button type="button" className="plan-secondary" onClick={() => onGuest()}>Skip</button>
            <button type="button" className="welcome-link" onClick={() => choose(null)}>Back to welcome</button>
          </fieldset>
        </form> : mode ? <form key={mode} onSubmit={submit}>
          <fieldset disabled={busy}>
            {creating && <label>Display name<input name="name" autoComplete="nickname" required maxLength={30}/></label>}
            <label>Email<input name="email" type="email" autoComplete="email" required/></label>
            <label>Password<input name="password" type="password" autoComplete={creating ? "new-password" : "current-password"}
              minLength={creating ? 6 : undefined} required/></label>
            <button type="submit" className="plan-primary">{busy ? "Please wait…" : creating ? "Create account" : "Sign in"}</button>
            <button type="button" className="welcome-link" onClick={() => choose(null)}>Back to welcome</button>
          </fieldset>
        </form> : <div className="welcome-actions">
          <button type="button" className="plan-primary" onClick={() => choose("create")}>Create account</button>
          <button type="button" className="plan-secondary" onClick={() => choose("signin")}>Sign in</button>
          <button type="button" className="welcome-link" onClick={() => choose("guest")}>Continue as guest</button>
        </div>}
      </>
    </section>
  </main>;
}
