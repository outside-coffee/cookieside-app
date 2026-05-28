import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { computeCostPerCookie, getVarietyStock, maxBatchFromStock } from '../lib/api';
import { Alert, ProgressBar, VarietyDot, LoadingScreen } from '../components/UI';

export default function Dashboard({ varieties, ingredients, production, sales, loading }) {
  const stats = useMemo(() => {
    if (!varieties.length) return null;
    const totalProduced   = production.reduce((s, p) => s + p.qty, 0);
    const totalSold       = sales.reduce((s, v) => s + v.qty, 0);
    const totalStock      = totalProduced - totalSold;
    const totalCA         = sales.reduce((s, v) => s + parseFloat(v.total_amount || 0), 0);
    const totalMarge      = sales.reduce((s, v) => s + parseFloat(v.margin || 0), 0);
    const totalEncaisse   = sales.filter(v => v.status === 'Payé').reduce((s, v) => s + parseFloat(v.total_amount || 0), 0);
    const totalAEncaisser = sales.filter(v => v.status !== 'Payé').reduce((s, v) => s + parseFloat(v.total_amount || 0), 0);
    const pendingVendu    = sales.filter(v => v.status === 'Vendu').length;
    const pendingLivre    = sales.filter(v => v.status === 'Livré').length;
    return { totalProduced, totalSold, totalStock, totalCA, totalMarge, totalEncaisse, totalAEncaisser, pendingVendu, pendingLivre };
  }, [varieties, production, sales]);

  const cookieStocks = useMemo(() =>
    varieties.map(v => ({
      variety: v,
      stock: getVarietyStock(v.id, production, sales),
      cost: computeCostPerCookie(v),
    })), [varieties, production, sales]);

  // Prévision : combien de cookies faisables par variété avec le stock actuel
  const forecasts = useMemo(() =>
    varieties.map(v => ({
      variety: v,
      maxCookies: maxBatchFromStock(v, ingredients),
      maxBatches: Math.floor(maxBatchFromStock(v, ingredients) / 28),
    })), [varieties, ingredients]);

  const chartData = useMemo(() => {
    const byVariety = {};
    sales.forEach(s => {
      if (!byVariety[s.variety_name]) byVariety[s.variety_name] = { name: s.variety_name.split(' ')[0], ca: 0, marge: 0 };
      byVariety[s.variety_name].ca    += parseFloat(s.total_amount || 0);
      byVariety[s.variety_name].marge += parseFloat(s.margin || 0);
    });
    return Object.values(byVariety);
  }, [sales]);

  const mpAlerts    = ingredients.filter(i => i.stock_qty <= i.alert_threshold);
  const cookieAlerts= cookieStocks.filter(c => c.stock <= 10);

  if (loading) return <LoadingScreen text="Chargement du tableau de bord..." />;

  return (
    <div className="page-inner">
      {/* Alertes */}
      {cookieAlerts.map(c => (
        <Alert key={c.variety.id} variant={c.stock <= 0 ? 'danger' : 'warning'}>
          <strong>{c.variety.name}</strong> — {c.stock <= 0 ? 'Stock épuisé !' : `Stock bas : ${c.stock} cookies restants`}
        </Alert>
      ))}
      {stats?.pendingLivre > 0 && (
        <Alert variant="info">
          <strong>{stats.pendingLivre} vente(s)</strong> livrée(s) en attente d'encaissement — <strong>{
            sales.filter(v => v.status === 'Livré').reduce((s, v) => s + parseFloat(v.total_amount || 0), 0).toFixed(2)
          } DT</strong> à encaisser
        </Alert>
      )}
      {mpAlerts.length > 0 && (
        <Alert variant="warning">
          <strong>{mpAlerts.length} matière(s)</strong> en alerte : {mpAlerts.map(i => i.name).join(', ')}
        </Alert>
      )}

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card accent">
          <div className="kpi-label">En stock</div>
          <div className="kpi-value">{stats?.totalStock ?? '—'}</div>
          <div className="kpi-sub">cookies disponibles</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total produit</div>
          <div className="kpi-value">{stats?.totalProduced ?? '—'}</div>
          <div className="kpi-sub">{production.length} lot(s)</div>
        </div>
        <div className="kpi-card success">
          <div className="kpi-label">💰 Encaissé</div>
          <div className="kpi-value">{stats?.totalEncaisse.toFixed(2) ?? '—'}</div>
          <div className="kpi-sub">DT reçus</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">CA total</div>
          <div className="kpi-value">{stats?.totalCA.toFixed(2) ?? '—'}</div>
          <div className="kpi-sub">{stats?.totalAEncaisser.toFixed(2)} DT à encaisser</div>
        </div>
        <div className="kpi-card" style={{ borderTopColor: (stats?.totalMarge??0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
          <div className="kpi-label">Marge totale</div>
          <div className="kpi-value" style={{ color: (stats?.totalMarge??0)>=0?'var(--green)':'var(--red)' }}>
            {stats?.totalMarge.toFixed(2) ?? '—'}
          </div>
          <div className="kpi-sub">
            {stats?.totalCA > 0 ? Math.round(stats.totalMarge/stats.totalCA*100) : 0}% du CA
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom:'1rem' }}>
        {/* Stock cookies */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                <line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
              </svg>
              Stock cookies
            </div>
          </div>
          <div className="card-body">
            {cookieStocks.map(({ variety, stock }) => {
              const maxRef = Math.max(...cookieStocks.map(c => c.stock), 1);
              const fillColor = stock<=0?'#E24B4A':stock<=10?'#D97706':'#27AE60';
              return (
                <div className="stock-bar-row" key={variety.id}>
                  <div className="stock-bar-top">
                    <div className="stock-bar-label"><VarietyDot color={variety.color} /><span>{variety.name}</span></div>
                    <span className="stock-bar-count" style={{ color:fillColor }}>{stock}</span>
                  </div>
                  <ProgressBar value={stock} max={maxRef} color={fillColor} />
                </div>
              );
            })}
          </div>
        </div>

        {/* CA chart */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
              CA par variété (DT)
            </div>
          </div>
          <div className="card-body" style={{ height:220 }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top:0, right:0, left:-20, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize:11, fill:'var(--text-3)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize:11, fill:'var(--text-3)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background:'#fff', border:'1px solid var(--border)', borderRadius:8, fontSize:12 }}
                    formatter={(v, n) => [v.toFixed(2)+' DT', n==='ca'?'CA':'Marge']} />
                  <Bar dataKey="ca" fill="#1E3A7A" radius={[4,4,0,0]} name="ca" />
                  <Bar dataKey="marge" fill="#27AE60" radius={[4,4,0,0]} name="marge" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--text-3)', fontSize:13 }}>
                Aucune vente enregistrée
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Prévision de production */}
      <div className="card" style={{ marginBottom:'1rem' }}>
        <div className="card-header">
          <div className="card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            Prévision — capacité de production avec le stock actuel
          </div>
        </div>
        <div className="card-body" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12 }}>
          {forecasts.map(({ variety, maxCookies, maxBatches }) => {
            const color = maxCookies <= 0 ? 'var(--red)' : maxCookies < 28 ? 'var(--amber)' : 'var(--green)';
            const bg    = maxCookies <= 0 ? 'var(--red-l)' : maxCookies < 28 ? 'var(--amber-l)' : 'var(--green-l)';
            return (
              <div key={variety.id} style={{
                background: bg, borderRadius:'var(--radius)',
                padding:'14px 16px', borderLeft:`4px solid ${color}`
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:8 }}>
                  <VarietyDot color={variety.color} />
                  <span style={{ fontWeight:600, fontSize:13 }}>{variety.name}</span>
                </div>
                <div style={{ fontSize:28, fontWeight:700, color, lineHeight:1 }}>{maxCookies}</div>
                <div style={{ fontSize:12, color:'var(--text-2)', marginTop:4 }}>
                  cookies · <strong>{maxBatches}</strong> fournée{maxBatches!==1?'s':''}
                  {maxCookies <= 0 && <span style={{ display:'block', color:'var(--red)', fontWeight:600, marginTop:2 }}>⚠ Stock insuffisant</span>}
                  {maxCookies > 0 && maxCookies < 28 && <span style={{ display:'block', color:'var(--amber)', fontWeight:600, marginTop:2 }}>⚠ Moins d'une fournée</span>}
                </div>
              </div>
            );
          })}
          {forecasts.length === 0 && (
            <div style={{ color:'var(--text-3)', fontSize:13 }}>Aucune variété configurée</div>
          )}
        </div>
      </div>

      {/* MP alerts */}
      {mpAlerts.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
              </svg>
              Matières premières — alertes
            </div>
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>Ingrédient</th><th>Stock</th><th>Seuil</th><th>Statut</th></tr></thead>
              <tbody>
                {mpAlerts.map(i => (
                  <tr key={i.id}>
                    <td style={{ fontWeight:500 }}>{i.name}</td>
                    <td>{i.stock_qty} {i.unit}</td>
                    <td style={{ color:'var(--text-3)' }}>{i.alert_threshold} {i.unit}</td>
                    <td>
                      {i.stock_qty <= 0
                        ? <span className="badge badge-out">Épuisé</span>
                        : <span className="badge badge-low">Stock bas</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
