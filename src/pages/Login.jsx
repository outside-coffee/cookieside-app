import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [mode, setMode]         = useState('magic');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState('');
  const [showPwd, setShowPwd]   = useState(false);

  const handleMagicLink = async (e) => {
    e.preventDefault();
    if (!email) return setError('Entrez votre adresse e-mail');
    setLoading(true); setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: process.env.REACT_APP_URL || window.location.origin },
    });
    setLoading(false);
    if (error) return setError(error.message);
    setSent(true);
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    if (!email || !password) return setError('Remplissez tous les champs');
    setLoading(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(
      error.message === 'Invalid login credentials'
        ? 'Email ou mot de passe incorrect'
        : error.message
    );
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; }

        .login-root {
          min-height: 100vh;
          min-height: 100dvh;
          background: linear-gradient(160deg, #0D1B3E 0%, #1E3A7A 55%, #0D1B3E 100%);
          display: flex;
          flex-direction: column;
          font-family: 'DM Sans', system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        /* ── HERO top (bleu) ── */
        .login-hero {
          flex: 0 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3rem 1.5rem 2.5rem;
          text-align: center;
        }
        .login-cookie { font-size: 56px; margin-bottom: 10px; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.3)); }
        .login-brand  {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 36px; font-weight: 700;
          color: #fff; line-height: 1;
        }
        .login-tagline {
          font-size: 10px; font-weight: 600;
          color: #E8B84B;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          margin-top: 8px;
        }

        /* ── CARD blanche (bas) ── */
        .login-card {
          flex: 1;
          background: #fff;
          border-radius: 28px 28px 0 0;
          padding: 2rem 1.5rem 2.5rem;
          animation: fadeUp 0.3s ease;
          /* safe area iPhone */
          padding-bottom: calc(2.5rem + env(safe-area-inset-bottom));
        }
        @media (min-width: 480px) {
          .login-root {
            justify-content: center;
            align-items: center;
          }
          .login-hero  { padding: 2rem 1.5rem 1rem; width: 100%; max-width: 400px; }
          .login-card  {
            flex: 0 0 auto;
            border-radius: 24px;
            padding: 2rem;
            width: 100%;
            max-width: 400px;
            margin: 0 1.5rem 2rem;
            box-shadow: 0 32px 64px rgba(0,0,0,0.4);
          }
        }

        /* ── Titre ── */
        .login-title { font-size: 20px; font-weight: 700; color: #0D1B3E; margin-bottom: 4px; }
        .login-sub   { font-size: 13px; color: #9CA3AF; margin-bottom: 1.5rem; }

        /* ── Toggle ── */
        .login-toggle {
          display: flex;
          background: #F1F5F9;
          border-radius: 12px;
          padding: 3px;
          margin-bottom: 1.25rem;
          gap: 3px;
        }
        .login-toggle-btn {
          flex: 1; border: none; border-radius: 9px;
          padding: 10px 0; font-size: 13px; font-weight: 500;
          cursor: pointer; font-family: inherit;
          transition: all 0.18s;
          background: transparent; color: #9CA3AF;
        }
        .login-toggle-btn.active {
          background: #fff; color: #0D1B3E;
          box-shadow: 0 1px 4px rgba(0,0,0,0.12);
        }

        /* ── Champs ── */
        .login-field { margin-bottom: 14px; }
        .login-label {
          font-size: 12px; font-weight: 600; color: #374151;
          display: block; margin-bottom: 6px; letter-spacing: 0.01em;
        }
        .login-input-wrap { position: relative; }
        .login-input {
          width: 100%; height: 50px; padding: 0 14px;
          border: 1.5px solid #E5E7EB; border-radius: 12px;
          font-size: 16px; /* 16px évite le zoom iOS */
          font-family: inherit; color: #0D1B3E;
          background: #FAFAFA; outline: none;
          transition: border-color 0.15s, background 0.15s;
          -webkit-appearance: none;
        }
        .login-input:focus { border-color: #1B2D5E; background: #fff; }
        .login-input-pwd  { padding-right: 48px; }
        .login-pwd-toggle {
          position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: #9CA3AF; padding: 4px; line-height: 0;
        }

        /* ── Erreur ── */
        .login-error {
          display: flex; align-items: center; gap: 7px;
          background: #FEF2F2; border: 1px solid #FECACA;
          border-radius: 10px; padding: 10px 12px;
          font-size: 13px; color: #DC2626; margin-bottom: 14px;
        }

        /* ── Bouton submit ── */
        .login-btn {
          width: 100%; height: 52px;
          background: #1B2D5E; border: none; border-radius: 14px;
          color: #fff; font-size: 15px; font-weight: 600;
          cursor: pointer; font-family: inherit;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: background 0.15s, transform 0.1s;
          -webkit-tap-highlight-color: transparent;
          margin-top: 4px;
        }
        .login-btn:active { transform: scale(0.98); }
        .login-btn:disabled { background: #9CA3AF; cursor: not-allowed; }

        /* ── Hint ── */
        .login-hint { font-size: 12px; color: #9CA3AF; text-align: center; margin-top: 14px; line-height: 1.6; }

        /* ── Sent state ── */
        .login-sent { text-align: center; padding: 0.5rem 0 1rem; }
        .login-sent-icon { font-size: 48px; margin-bottom: 14px; }
        .login-sent-title { font-size: 18px; font-weight: 700; color: #0D1B3E; margin-bottom: 8px; }
        .login-sent-text  { font-size: 14px; color: #6B7280; line-height: 1.6; }
        .login-sent-back  {
          margin-top: 20px; background: none; border: none;
          color: #C8951A; font-size: 14px; font-weight: 600;
          cursor: pointer; font-family: inherit;
          display: inline-flex; align-items: center; gap: 4px;
        }

        /* ── Footer ── */
        .login-footer {
          text-align: center;
          font-size: 11px;
          color: rgba(255,255,255,0.2);
          padding: 1rem;
          flex-shrink: 0;
        }
        @media (min-width: 480px) {
          .login-footer { margin-top: 0; }
        }
      `}</style>

      <div className="login-root">

        {/* Hero */}
        <div className="login-hero">
          <div className="login-cookie">🍪</div>
          <div className="login-brand">Cookieside</div>
          <div className="login-tagline">New York Style Cookies</div>
        </div>

        {/* Card */}
        <div className="login-card">
          {sent ? (
            <div className="login-sent">
              <div className="login-sent-icon">📬</div>
              <div className="login-sent-title">Vérifiez votre boîte mail</div>
              <p className="login-sent-text">
                Un lien de connexion a été envoyé à<br />
                <strong style={{ color: '#0D1B3E' }}>{email}</strong>
              </p>
              <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 10 }}>
                Le lien expire dans 1 heure. Vérifiez vos spams.
              </p>
              <button className="login-sent-back"
                onClick={() => { setSent(false); setEmail(''); }}>
                ← Utiliser un autre email
              </button>
            </div>
          ) : (
            <>
              <div className="login-title">Connexion</div>
              <div className="login-sub">Accès réservé à l'équipe Cookieside</div>

              {/* Toggle */}
              <div className="login-toggle">
                {[{ id:'magic', label:'✉️ Lien magique' }, { id:'password', label:'🔑 Mot de passe' }].map(m => (
                  <button key={m.id}
                    className={`login-toggle-btn ${mode === m.id ? 'active' : ''}`}
                    onClick={() => { setMode(m.id); setError(''); }}>
                    {m.label}
                  </button>
                ))}
              </div>

              <form onSubmit={mode === 'magic' ? handleMagicLink : handlePassword}>
                {/* Email */}
                <div className="login-field">
                  <label className="login-label">Adresse e-mail</label>
                  <input
                    className="login-input"
                    type="email"
                    placeholder="vous@exemple.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                    autoComplete="email"
                    inputMode="email"
                  />
                </div>

                {/* Mot de passe */}
                {mode === 'password' && (
                  <div className="login-field">
                    <label className="login-label">Mot de passe</label>
                    <div className="login-input-wrap">
                      <input
                        className="login-input login-input-pwd"
                        type={showPwd ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={e => { setPassword(e.target.value); setError(''); }}
                        autoComplete="current-password"
                      />
                      <button type="button" className="login-pwd-toggle"
                        onClick={() => setShowPwd(v => !v)}>
                        {showPwd ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                            <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Erreur */}
                {error && (
                  <div className="login-error">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:15, height:15, flexShrink:0 }}>
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {error === 'email rate limit exceeded'
                      ? 'Trop de tentatives. Réessayez dans 1 heure ou utilisez un mot de passe.'
                      : error}
                  </div>
                )}

                {/* Submit */}
                <button type="submit" className="login-btn" disabled={loading}>
                  {loading ? (
                    <>
                      <span style={{ width:18, height:18, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.6s linear infinite', display:'inline-block' }} />
                      Connexion...
                    </>
                  ) : mode === 'magic' ? (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:17,height:17}}>
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                      Envoyer le lien
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:17,height:17}}>
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0110 0v4"/>
                      </svg>
                      Se connecter
                    </>
                  )}
                </button>
              </form>

              {mode === 'magic' && (
                <p className="login-hint">
                  Vous recevrez un lien par email.<br />Aucun mot de passe requis.
                </p>
              )}
            </>
          )}
        </div>

        <div className="login-footer">Cookieside © {new Date().getFullYear()} — Accès sécurisé</div>
      </div>
    </>
  );
}
