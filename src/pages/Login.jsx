import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [mode, setMode]       = useState('magic'); // 'magic' | 'password'
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  const handleMagicLink = async (e) => {
    e.preventDefault();
    if (!email) return setError('Entrez votre adresse e-mail');
    setLoading(true);
    setError('');
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
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(
      error.message === 'Invalid login credentials'
        ? 'Email ou mot de passe incorrect'
        : error.message
    );
    // Si succès, App.jsx détecte onAuthStateChange et affiche l'app
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #0D1B3E 0%, #1B2D5E 50%, #0D1B3E 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>

      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>🍪</div>
        <div style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 32,
          fontWeight: 700,
          color: '#fff',
          letterSpacing: '0.01em',
          lineHeight: 1,
        }}>
          Cookieside
        </div>
        <div style={{
          fontSize: 11,
          color: '#E8B84B',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          fontWeight: 500,
          marginTop: 6,
        }}>
          New York Style Cookies
        </div>
      </div>

      {/* Card */}
      <div style={{
        background: '#fff',
        borderRadius: 20,
        padding: '2rem',
        width: '100%',
        maxWidth: 400,
        boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
      }}>

        {sent ? (
          /* État "lien envoyé" */
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📬</div>
            <div style={{ fontWeight: 600, fontSize: 16, color: '#0D1B3E', marginBottom: 8 }}>
              Vérifiez votre boîte mail
            </div>
            <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>
              Un lien de connexion a été envoyé à<br />
              <strong style={{ color: '#0D1B3E' }}>{email}</strong>
            </p>
            <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 12 }}>
              Le lien expire dans 1 heure. Vérifiez vos spams.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              style={{
                marginTop: 20, background: 'none', border: 'none',
                color: '#C8951A', fontSize: 13, cursor: 'pointer', fontWeight: 500,
              }}>
              ← Utiliser un autre email
            </button>
          </div>
        ) : (
          <>
            {/* Titre */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontWeight: 600, fontSize: 17, color: '#0D1B3E' }}>
                Connexion
              </div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 3 }}>
                Accès réservé à l'équipe Cookieside
              </div>
            </div>

            {/* Toggle mode */}
            <div style={{
              display: 'flex',
              background: '#F3F4F6',
              borderRadius: 10,
              padding: 3,
              marginBottom: '1.25rem',
            }}>
              {[
                { id: 'magic',    label: '✉️ Lien magique' },
                { id: 'password', label: '🔑 Mot de passe' },
              ].map(m => (
                <button key={m.id}
                  onClick={() => { setMode(m.id); setError(''); }}
                  style={{
                    flex: 1, border: 'none', borderRadius: 8, padding: '7px 0',
                    fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    fontFamily: 'inherit',
                    background: mode === m.id ? '#fff' : 'transparent',
                    color: mode === m.id ? '#0D1B3E' : '#9CA3AF',
                    boxShadow: mode === m.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s',
                  }}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Formulaire */}
            <form onSubmit={mode === 'magic' ? handleMagicLink : handlePassword}>
              <div style={{ marginBottom: 12 }}>
                <label style={{
                  fontSize: 12, fontWeight: 500, color: '#4B5563',
                  display: 'block', marginBottom: 5,
                }}>
                  Adresse e-mail
                </label>
                <input
                  type="email"
                  placeholder="vous@exemple.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  autoComplete="email"
                  style={{
                    width: '100%', height: 42, padding: '0 14px',
                    border: '1.5px solid #E5E7EB', borderRadius: 10,
                    fontSize: 14, fontFamily: 'inherit', color: '#0D1B3E',
                    background: '#fff', outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => e.target.style.borderColor = '#1B2D5E'}
                  onBlur={e => e.target.style.borderColor = '#E5E7EB'}
                />
              </div>

              {mode === 'password' && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{
                    fontSize: 12, fontWeight: 500, color: '#4B5563',
                    display: 'block', marginBottom: 5,
                  }}>
                    Mot de passe
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                    autoComplete="current-password"
                    style={{
                      width: '100%', height: 42, padding: '0 14px',
                      border: '1.5px solid #E5E7EB', borderRadius: 10,
                      fontSize: 14, fontFamily: 'inherit', color: '#0D1B3E',
                      background: '#fff', outline: 'none', boxSizing: 'border-box',
                      transition: 'border-color 0.15s',
                    }}
                    onFocus={e => e.target.style.borderColor = '#1B2D5E'}
                    onBlur={e => e.target.style.borderColor = '#E5E7EB'}
                  />
                </div>
              )}

              {/* Erreur */}
              {error && (
                <div style={{
                  background: '#FEF2F2', border: '1px solid #FECACA',
                  borderRadius: 8, padding: '8px 12px',
                  fontSize: 12, color: '#DC2626', marginBottom: 12,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ width: 14, height: 14, flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {error}
                </div>
              )}

              {/* Bouton */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', height: 44,
                  background: loading ? '#9CA3AF' : '#1B2D5E',
                  border: 'none', borderRadius: 10,
                  color: '#fff', fontSize: 14, fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'background 0.15s',
                }}>
                {loading ? (
                  <>
                    <span style={{
                      width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: '#fff', borderRadius: '50%',
                      animation: 'spin 0.6s linear infinite', display: 'inline-block',
                    }} />
                    Connexion...
                  </>
                ) : mode === 'magic' ? (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      style={{ width: 16, height: 16 }}>
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    Envoyer le lien
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      style={{ width: 16, height: 16 }}>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0110 0v4"/>
                    </svg>
                    Se connecter
                  </>
                )}
              </button>
            </form>

            {/* Info lien magique */}
            {mode === 'magic' && (
              <p style={{
                fontSize: 11, color: '#9CA3AF', textAlign: 'center',
                marginTop: 14, lineHeight: 1.5,
              }}>
                Vous recevrez un lien par email.<br />Aucun mot de passe requis.
              </p>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 24, fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
        Cookieside © {new Date().getFullYear()} — Accès sécurisé
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500;600&display=swap');
      `}</style>
    </div>
  );
}
