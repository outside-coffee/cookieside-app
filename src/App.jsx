import React, { useState, useEffect, useCallback } from 'react';
import { Toaster } from 'react-hot-toast';
import { supabase } from './lib/supabase';
import { ingredientsAPI, varietiesAPI, productionAPI, salesAPI } from './lib/api';
import Login       from './pages/Login';
import Dashboard   from './pages/Dashboard';
import Production  from './pages/Production';
import Sales       from './pages/Sales';
import Ingredients from './pages/Ingredients';
import Varieties   from './pages/Varieties';
import Calculateur from './pages/Calculateur';
import './index.css';

const PAGES = [
  { id: 'dashboard',   label: 'Dashboard',    shortLabel: 'Home',    icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
  )},
  { id: 'production',  label: 'Production',   shortLabel: 'Prod.',   icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
  )},
  { id: 'sales',       label: 'Ventes',       shortLabel: 'Ventes',  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
  )},
  { id: 'ingredients', label: 'Matières 1ères', shortLabel: 'Stock', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
  )},
  { id: 'varieties',   label: 'Recettes',     shortLabel: 'Recettes', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
  )},
  { id: 'calculateur', label: 'Calculateur',  shortLabel: 'Calc.',   icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/><line x1="14" y1="18" x2="16" y2="18"/></svg>
  )},
];

export default function App() {
  const [session,    setSession]    = useState(undefined);
  const [page,       setPage]       = useState('dashboard');
  const [data,       setData]       = useState({ varieties:[], ingredients:[], production:[], sales:[] });
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen,   setMenuOpen]   = useState(false);

  // ── Auth ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  // ── Data ──────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [varieties, ingredients, production, sales] = await Promise.all([
        varietiesAPI.getAll(), ingredientsAPI.getAll(),
        productionAPI.getAll(), salesAPI.getAll(),
      ]);
      setData({ varieties, ingredients, production, sales });
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { if (session) fetchAll(); }, [session, fetchAll]);

  const refresh     = () => fetchAll(true);
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setData({ varieties:[], ingredients:[], production:[], sales:[] });
    setPage('dashboard');
  };

  const navigate = (id) => { setPage(id); setMenuOpen(false); };

  // ── Spinner initial ───────────────────────────────────────────────────
  if (session === undefined) return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      background:'linear-gradient(145deg,#0D1B3E,#1B2D5E)', gap:16 }}>
      <div style={{ fontSize:40 }}>🍪</div>
      <div style={{ width:24, height:24, border:'2px solid rgba(255,255,255,0.2)',
        borderTopColor:'#E8B84B', borderRadius:'50%', animation:'spin 0.6s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!session) return <Login />;

  const pendingCount = data.sales.filter(s => s.status === 'Vendu').length;
  const userEmail    = session.user?.email || '';
  const userInitials = userEmail.slice(0, 2).toUpperCase();

  return (
    <div className="app">
      <Toaster
        position="top-center"
        toastOptions={{
          style: { background:'#152249', color:'#fff', fontSize:'13px', borderRadius:'10px', maxWidth:'90vw' },
          success: { iconTheme: { primary:'#E8B84B', secondary:'#fff' } },
          error:   { iconTheme: { primary:'#E74C3C', secondary:'#fff' } },
        }}
      />

      {/* ── Topbar ── */}
      <div className="topbar">
        <div className="topbar-brand">
          <span className="topbar-icon">🍪</span>
          <div>
            <div className="topbar-name">Cookieside</div>
            <div className="topbar-tagline">New York Style Cookies</div>
          </div>
        </div>

        <div className="topbar-right">
          {refreshing && (
            <div className="spinner" style={{ width:16, height:16, borderWidth:2, flexShrink:0 }} />
          )}

          {/* Refresh — caché sur mobile (pull-to-refresh natif suffit) */}
          <button onClick={refresh} className="topbar-btn topbar-btn-desktop" title="Actualiser">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
            </svg>
          </button>

          {/* Avatar */}
          <div style={{ position:'relative' }}>
            <button className="topbar-avatar" title={userEmail}
              onClick={() => setMenuOpen(v => !v)}>
              {userInitials}
            </button>
            {menuOpen && (
              <>
                {/* Backdrop cliquable */}
                <div style={{ position:'fixed', inset:0, zIndex:150 }} onClick={() => setMenuOpen(false)} />
                <div className="user-dropdown">
                  <div className="user-dropdown-header">
                    <div style={{ fontSize:11, color:'#9CA3AF', marginBottom:2 }}>Connecté en tant que</div>
                    <div style={{ fontSize:13, fontWeight:500, color:'#0D1B3E', wordBreak:'break-all' }}>{userEmail}</div>
                  </div>
                  <button className="user-dropdown-logout" onClick={() => { setMenuOpen(false); handleLogout(); }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:15, height:15 }}>
                      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Se déconnecter
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Nav desktop (top) ── */}
      <nav className="nav nav-desktop">
        {PAGES.map(p => (
          <button key={p.id} className={`nav-btn ${page === p.id ? 'active' : ''}`}
            onClick={() => navigate(p.id)}>
            {p.icon}{p.label}
            {p.id === 'sales' && pendingCount > 0 && (
              <span className="nav-badge">{pendingCount}</span>
            )}
          </button>
        ))}
      </nav>

      {/* ── Contenu ── */}
      <div className="main-content">
        {page === 'dashboard'   && <Dashboard   {...data} loading={loading} />}
        {page === 'production'  && <Production  {...data} onRefresh={refresh} loading={loading} />}
        {page === 'sales'       && <Sales       {...data} onRefresh={refresh} loading={loading} />}
        {page === 'ingredients' && <Ingredients {...data} onRefresh={refresh} loading={loading} />}
        {page === 'varieties'   && <Varieties   {...data} onRefresh={refresh} loading={loading} />}
        {page === 'calculateur' && <Calculateur {...data} loading={loading} />}
      </div>

      {/* ── Nav mobile (bottom) ── */}
      <nav className="nav-mobile">
        {PAGES.map(p => (
          <button key={p.id} className={`nav-mobile-btn ${page === p.id ? 'active' : ''}`}
            onClick={() => navigate(p.id)}>
            <span className="nav-mobile-icon">
              {p.icon}
              {p.id === 'sales' && pendingCount > 0 && (
                <span className="nav-mobile-badge">{pendingCount}</span>
              )}
            </span>
            <span className="nav-mobile-label">{p.shortLabel}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
