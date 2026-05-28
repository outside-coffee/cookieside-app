import React, { useMemo, useState } from 'react';
import { computeCostPerCookie, maxBatchFromStock } from '../lib/api';
import { SectionHeader, LoadingScreen, VarietyDot } from '../components/UI';

export default function Achats({ varieties, ingredients, production, loading }) {
  const [targetWeeks,    setTargetWeeks]    = useState(2);
  const [batchPerVariety,setBatchPerVariety]= useState(4);

  // ── Besoins calculés ───────────────────────────────────────────────────
  const needs = useMemo(() => {
    const cookiesPerVariety = batchPerVariety * 28;
    const ingNeeds = {};

    varieties.forEach(v => {
      v.recipes?.forEach(r => {
        const ing = r.ingredients;
        if (!ing) return;
        const needed = r.qty_per_cookie * cookiesPerVariety * targetWeeks;
        if (!ingNeeds[ing.id]) {
          ingNeeds[ing.id] = {
            id: ing.id, name: ing.name, unit: ing.unit,
            stock: parseFloat(ing.stock_qty) || 0,
            needed: 0,
            price_per_unit: parseFloat(ing.price_per_unit) || 0,
          };
        }
        ingNeeds[ing.id].needed += needed;
      });
    });

    return Object.values(ingNeeds).map(item => {
      const ing_full      = ingredients.find(x => x.id === item.id);
      const toOrder       = Math.max(0, parseFloat((item.needed - item.stock).toFixed(2)));

      // Format d'achat
      const formatName    = ing_full?.purchase_format_name  || '';
      const formatQty     = parseFloat(ing_full?.purchase_format_qty)   || 0;
      const formatPrice   = parseFloat(ing_full?.purchase_format_price) || 0;

      // Nombre de formats nécessaires (arrondi au supérieur)
      const nbFormats     = (toOrder > 0 && formatQty > 0) ? Math.ceil(toOrder / formatQty) : 0;
      // Qté réellement reçue si on commande nbFormats
      const qtyIfOrdered  = nbFormats * formatQty;

      // Coût : priorité format sinon prix/unité
      const cost = nbFormats > 0 && formatPrice > 0
        ? nbFormats * formatPrice
        : toOrder * item.price_per_unit;

      const coverage = item.stock > 0 && item.needed > 0
        ? Math.min(100, Math.round(item.stock / item.needed * 100))
        : (item.needed === 0 ? 100 : 0);

      const hasFormat = !!formatName && formatQty > 0;

      return {
        ...item, toOrder, cost, coverage,
        ok: toOrder <= 0,
        formatName, formatQty, formatPrice, nbFormats, qtyIfOrdered, hasFormat,
      };
    }).sort((a, b) => a.coverage - b.coverage);
  }, [varieties, ingredients, targetWeeks, batchPerVariety]);

  const toOrderList  = needs.filter(i => !i.ok);
  const totalCost    = toOrderList.reduce((s, i) => s + i.cost, 0);
  const noFormatList = toOrderList.filter(i => !i.hasFormat);

  // ── Capacité actuelle ─────────────────────────────────────────────────
  const capacity = useMemo(() =>
    varieties.map(v => ({
      variety:    v,
      maxCookies: maxBatchFromStock(v, ingredients),
      cost:       computeCostPerCookie(v),
    })), [varieties, ingredients]);

  if (loading) return <LoadingScreen />;

  return (
    <div className="page-inner">
      <SectionHeader
        title="Commandes fournisseurs"
        subtitle="Calcul automatique par formats d'achat"
      />

      {/* ── Capacité actuelle ── */}
      <div className="card" style={{ marginBottom:'1rem' }}>
        <div className="card-header">
          <div className="card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
              <line x1="9" y1="9" x2="9.01" y2="9"/>
              <line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
            Capacité avec le stock actuel
          </div>
        </div>
        <div className="card-body" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10 }}>
          {capacity.map(({ variety, maxCookies }) => {
            const maxBatches = Math.floor(maxCookies / 28);
            const color = maxCookies <= 0 ? 'var(--red)' : maxCookies < 28 ? 'var(--amber)' : 'var(--green)';
            return (
              <div key={variety.id} style={{
                background:'var(--bg-2)', borderRadius:'var(--radius)',
                padding:'12px 14px', borderLeft:`3px solid ${variety.color}`
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                  <VarietyDot color={variety.color} />
                  <span style={{ fontSize:13, fontWeight:600 }}>{variety.name}</span>
                </div>
                <div style={{ fontSize:24, fontWeight:700, color, lineHeight:1 }}>{maxCookies}</div>
                <div style={{ fontSize:11, color:'var(--text-3)', marginTop:3 }}>
                  cookies · {maxBatches} fournée{maxBatches !== 1 ? 's' : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Paramètres ── */}
      <div className="card" style={{ marginBottom:'1rem' }}>
        <div className="card-header">
          <div className="card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/>
              <line x1="4" y1="18" x2="20" y2="18"/>
            </svg>
            Paramètres
          </div>
        </div>
        <div className="card-body">
          <div className="form-row form-row-2">
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Horizon (semaines)</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <input className="form-input" type="number" min="1" max="12"
                  value={targetWeeks}
                  onChange={e => setTargetWeeks(Math.max(1, parseInt(e.target.value)||1))}
                  style={{ maxWidth:72 }} />
                {[1,2,4,8].map(w => (
                  <button key={w} className={`btn btn-sm ${targetWeeks===w?'btn-primary':''}`}
                    onClick={() => setTargetWeeks(w)}>{w}S</button>
                ))}
              </div>
              <div className="form-hint">Semaines de production à couvrir</div>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Fournées / semaine / variété</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <input className="form-input" type="number" min="1" max="20"
                  value={batchPerVariety}
                  onChange={e => setBatchPerVariety(Math.max(1, parseInt(e.target.value)||1))}
                  style={{ maxWidth:72 }} />
                {[2,4,7,10].map(b => (
                  <button key={b} className={`btn btn-sm ${batchPerVariety===b?'btn-primary':''}`}
                    onClick={() => setBatchPerVariety(b)}>{b}</button>
                ))}
              </div>
              <div className="form-hint">
                → {batchPerVariety * 28 * varieties.length * targetWeeks} cookies sur {targetWeeks}S
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Alerte ingrédients sans format ── */}
      {noFormatList.length > 0 && (
        <div style={{
          background:'var(--amber-l)', border:'1px solid rgba(196,125,16,0.25)',
          borderRadius:'var(--radius)', padding:'10px 14px',
          fontSize:13, color:'var(--amber)', marginBottom:'1rem',
          display:'flex', gap:8, alignItems:'flex-start'
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ width:16, height:16, flexShrink:0, marginTop:1 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <strong>{noFormatList.length} ingrédient(s) sans format d'achat configuré</strong> — le coût est estimé au prix/unité :
            {' '}{noFormatList.map(i => i.name).join(', ')}.
            <span style={{ marginLeft:6, opacity:0.8 }}>
              Configurez les formats dans Matières premières pour une commande plus précise.
            </span>
          </div>
        </div>
      )}

      {/* ── Récap bannière ── */}
      {toOrderList.length > 0 && (
        <div style={{
          background:'var(--navy-900)', borderRadius:'var(--radius-lg)',
          padding:'1rem 1.25rem', marginBottom:'1rem',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          flexWrap:'wrap', gap:12
        }}>
          <div>
            <div style={{ color:'#fff', fontWeight:600, fontSize:14 }}>
              {toOrderList.length} ingrédient(s) à commander
            </div>
            <div style={{ color:'rgba(255,255,255,0.45)', fontSize:12, marginTop:2 }}>
              {toOrderList.filter(i => i.hasFormat).length} avec format configuré ·{' '}
              {toOrderList.filter(i => !i.hasFormat).length} sans format
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:11, color:'var(--gold-mid)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                Coût total estimé
              </div>
              <div style={{ fontSize:22, fontWeight:700, color:'var(--gold-mid)' }}>
                {totalCost.toFixed(2)} DT
              </div>
            </div>
            <button className="btn btn-gold"
              onClick={() => printOrder(toOrderList, targetWeeks, batchPerVariety, varieties.length)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              Imprimer / PDF
            </button>
          </div>
        </div>
      )}

      {/* ── Liste de courses principale — par formats ── */}
      {toOrderList.filter(i => i.hasFormat).length > 0 && (
        <div className="card" style={{ marginBottom:'1rem' }}>
          <div className="card-header">
            <div className="card-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 01-8 0"/>
              </svg>
              Liste de commande — par formats
            </div>
            <span style={{ fontSize:12, color:'var(--text-3)' }}>
              {toOrderList.filter(i => i.hasFormat).length} article(s)
            </span>
          </div>

          {/* Cards format — vue épicerie */}
          <div style={{ padding:'1rem', display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:10 }}>
            {toOrderList.filter(i => i.hasFormat).map(i => (
              <div key={i.id} style={{
                background:'var(--bg-2)', border:'1px solid var(--border)',
                borderRadius:'var(--radius-lg)', padding:'14px 16px',
                borderTop:`3px solid var(--navy-600)`
              }}>
                {/* Nom ingrédient */}
                <div style={{ fontWeight:700, fontSize:14, color:'var(--navy-800)', marginBottom:8 }}>
                  {i.name}
                </div>

                {/* Format badge */}
                <div style={{
                  display:'inline-flex', alignItems:'center', gap:6,
                  background:'var(--navy-50)', borderRadius:20,
                  padding:'3px 10px', fontSize:12, color:'var(--navy-700)',
                  fontWeight:600, marginBottom:10
                }}>
                  📦 {i.formatName}
                  <span style={{ color:'var(--text-3)', fontWeight:400 }}>
                    ({i.formatQty} {i.unit}/format)
                  </span>
                </div>

                {/* Quantité à commander */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
                  <div>
                    <div style={{ fontSize:11, color:'var(--text-3)', marginBottom:2 }}>À commander</div>
                    <div style={{ fontSize:28, fontWeight:700, color:'var(--navy-700)', lineHeight:1 }}>
                      {i.nbFormats}
                    </div>
                    <div style={{ fontSize:12, color:'var(--text-3)', marginTop:2 }}>
                      format{i.nbFormats > 1 ? 's' : ''}
                      {' '}= {i.qtyIfOrdered} {i.unit}
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:11, color:'var(--text-3)', marginBottom:2 }}>Coût</div>
                    <div style={{ fontSize:18, fontWeight:700, color:'var(--gold-d)' }}>
                      {i.cost.toFixed(2)} DT
                    </div>
                    {i.nbFormats > 1 && (
                      <div style={{ fontSize:11, color:'var(--text-3)' }}>
                        {i.formatPrice.toFixed(3)} DT/format
                      </div>
                    )}
                  </div>
                </div>

                {/* Stock info */}
                <div style={{ marginTop:10, paddingTop:8, borderTop:'1px solid var(--border)', fontSize:11, color:'var(--text-3)', display:'flex', justifyContent:'space-between' }}>
                  <span>Stock : <strong style={{ color:'var(--text-2)' }}>{i.stock} {i.unit}</strong></span>
                  <span>Besoin : <strong style={{ color:'var(--text-2)' }}>{i.needed.toFixed(0)} {i.unit}</strong></span>
                </div>

                {/* Barre couverture */}
                <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:6 }}>
                  <div style={{ flex:1, height:4, background:'var(--cream-d)', borderRadius:2, overflow:'hidden' }}>
                    <div style={{
                      width:`${i.coverage}%`, height:'100%', borderRadius:2,
                      background: i.coverage >= 100 ? 'var(--green)' : i.coverage >= 50 ? 'var(--amber)' : 'var(--red)'
                    }} />
                  </div>
                  <span style={{ fontSize:10, color:'var(--text-3)', minWidth:24 }}>{i.coverage}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Ingrédients sans format (tableau classique) ── */}
      {noFormatList.length > 0 && (
        <div className="card" style={{ marginBottom:'1rem' }}>
          <div className="card-header">
            <div className="card-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
              </svg>
              Sans format configuré
            </div>
            <span style={{ fontSize:12, color:'var(--amber)' }}>
              Configurez les formats pour une commande optimale
            </span>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Ingrédient</th>
                  <th style={{ textAlign:'right' }}>Stock actuel</th>
                  <th style={{ textAlign:'right' }}>Besoin ({targetWeeks}S)</th>
                  <th style={{ textAlign:'right' }}>Manque</th>
                  <th style={{ textAlign:'right' }}>Coût estimé</th>
                </tr>
              </thead>
              <tbody>
                {noFormatList.map(i => (
                  <tr key={i.id}>
                    <td style={{ fontWeight:500 }}>{i.name}</td>
                    <td style={{ textAlign:'right', color:'var(--text-3)' }}>{i.stock} {i.unit}</td>
                    <td style={{ textAlign:'right', color:'var(--text-3)' }}>{i.needed.toFixed(0)} {i.unit}</td>
                    <td style={{ textAlign:'right', fontWeight:700, color:'var(--red)' }}>
                      {i.toOrder} {i.unit}
                    </td>
                    <td style={{ textAlign:'right', color:'var(--gold-d)' }}>
                      {i.cost > 0 ? i.cost.toFixed(2)+' DT' : <span style={{ color:'var(--text-3)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tout OK ── */}
      {toOrderList.length === 0 && (
        <div style={{
          background:'var(--green-l)', border:'1px solid rgba(30,107,60,0.2)',
          borderRadius:'var(--radius-lg)', padding:'2rem',
          textAlign:'center', color:'var(--green)'
        }}>
          <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
          <div style={{ fontWeight:600, fontSize:15 }}>Stock suffisant !</div>
          <div style={{ fontSize:13, marginTop:4, opacity:0.8 }}>
            Vous avez assez de matières premières pour {targetWeeks} semaine{targetWeeks>1?'s':''} de production.
          </div>
        </div>
      )}

      {/* ── Tableau récap complet (tous ingrédients) ── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
              <line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            Récap complet — tous les ingrédients
          </div>
          <span style={{ fontSize:12, color:'var(--text-3)' }}>
            {needs.filter(i => i.ok).length} ok · {toOrderList.length} à commander
          </span>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Ingrédient</th>
                <th>Format d'achat</th>
                <th style={{ textAlign:'right' }}>Stock</th>
                <th style={{ textAlign:'right' }}>Besoin</th>
                <th style={{ textAlign:'right' }}>À commander</th>
                <th style={{ textAlign:'right' }}>Coût</th>
                <th>Couverture</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {needs.map(i => (
                <tr key={i.id} style={{ background: i.ok ? 'inherit' : 'rgba(146,43,33,0.02)' }}>
                  <td style={{ fontWeight:500 }}>{i.name}</td>
                  <td>
                    {i.hasFormat
                      ? <span style={{ fontSize:12 }}>
                          <span style={{ fontWeight:500, color:'var(--navy-700)' }}>{i.formatName}</span>
                          <span style={{ color:'var(--text-3)', marginLeft:4 }}>
                            ({i.formatQty} {i.unit}
                            {i.formatPrice > 0 ? ` · ${i.formatPrice.toFixed(3)} DT` : ''})
                          </span>
                        </span>
                      : <span style={{ fontSize:12, color:'var(--text-3)' }}>Non configuré</span>}
                  </td>
                  <td style={{ textAlign:'right', fontSize:13 }}>{i.stock} {i.unit}</td>
                  <td style={{ textAlign:'right', fontSize:13 }}>{i.needed.toFixed(0)} {i.unit}</td>
                  <td style={{ textAlign:'right' }}>
                    {i.ok
                      ? <span style={{ color:'var(--text-3)', fontSize:12 }}>—</span>
                      : <div>
                          {i.hasFormat
                            ? <div style={{ fontWeight:700, color:'var(--navy-700)' }}>
                                {i.nbFormats} format{i.nbFormats > 1 ? 's' : ''}
                              </div>
                            : <div style={{ fontWeight:700, color:'var(--red)' }}>
                                {i.toOrder} {i.unit}
                              </div>
                          }
                          {i.hasFormat && (
                            <div style={{ fontSize:11, color:'var(--text-3)' }}>
                              = {i.qtyIfOrdered} {i.unit}
                            </div>
                          )}
                        </div>
                    }
                  </td>
                  <td style={{ textAlign:'right', color: i.ok ? 'var(--text-3)' : 'var(--gold-d)', fontWeight: i.ok ? 400 : 600 }}>
                    {i.ok ? '—' : `${i.cost.toFixed(2)} DT`}
                  </td>
                  <td style={{ minWidth:110 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ flex:1, height:5, background:'var(--cream-d)', borderRadius:2, overflow:'hidden' }}>
                        <div style={{
                          width:`${i.coverage}%`, height:'100%', borderRadius:2,
                          background: i.coverage >= 100 ? 'var(--green)' : i.coverage >= 50 ? 'var(--amber)' : 'var(--red)'
                        }} />
                      </div>
                      <span style={{ fontSize:11, color:'var(--text-3)', minWidth:26 }}>{i.coverage}%</span>
                    </div>
                  </td>
                  <td>
                    {i.ok
                      ? <span className="badge badge-ok">OK</span>
                      : <span className="badge badge-out">Commander</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function printOrder(items, weeks, batches, nVarieties) {
  const date  = new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
  const total = items.reduce((s, i) => s + i.cost, 0);

  const withFormat    = items.filter(i => i.hasFormat);
  const withoutFormat = items.filter(i => !i.hasFormat);

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<title>Commande Cookieside — ${date}</title>
<style>
  * { box-sizing: border-box; margin:0; padding:0; }
  body { font-family: -apple-system, 'DM Sans', sans-serif; padding: 2.5rem; color: #0D1B3E; font-size:13px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1.5rem; padding-bottom:1rem; border-bottom:2px solid #152249; }
  .brand { font-size:22px; font-weight:700; }
  .brand small { display:block; font-size:11px; color:#C8951A; letter-spacing:0.1em; text-transform:uppercase; font-weight:500; margin-top:2px; }
  .meta { font-size:11px; color:#9CA3AF; text-align:right; line-height:1.8; }
  h2 { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:#9CA3AF; margin:1.5rem 0 0.75rem; }
  .cards { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:1.5rem; }
  .card { border:1px solid #E5E7EB; border-radius:10px; padding:12px 14px; border-top:3px solid #152249; }
  .card-name { font-weight:700; font-size:13px; margin-bottom:6px; }
  .card-format { font-size:11px; color:#1B2D5E; background:#EBF2FF; border-radius:20px; padding:2px 8px; display:inline-block; margin-bottom:8px; }
  .card-qty { font-size:24px; font-weight:700; color:#152249; line-height:1; }
  .card-qty-sub { font-size:11px; color:#9CA3AF; margin-top:2px; }
  .card-cost { font-size:15px; font-weight:700; color:#C8951A; margin-top:6px; }
  table { width:100%; border-collapse:collapse; margin-bottom:1rem; }
  th { background:#152249; color:#fff; padding:7px 12px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.04em; }
  td { padding:8px 12px; border-bottom:1px solid #F3F4F6; }
  tr:nth-child(even) td { background:#FAFAF8; }
  .total-bar { margin-top:1.5rem; padding:14px 16px; background:#152249; color:#fff; border-radius:10px; display:flex; justify-content:space-between; align-items:center; }
  .total-bar .label { font-size:12px; opacity:0.6; }
  .total-bar .amount { font-size:22px; font-weight:700; color:#E8B84B; }
  @media print { @page { margin:1.5cm; } }
</style></head>
<body>
  <div class="header">
    <div class="brand">🍪 Cookieside<small>New York Style Cookies</small></div>
    <div class="meta">
      Liste de commande<br>
      Générée le ${date}<br>
      ${weeks} semaine${weeks>1?'s':''} · ${batches} fournées/sem. · ${nVarieties} variété${nVarieties>1?'s':''}
    </div>
  </div>

  ${withFormat.length > 0 ? `
  <h2>📦 Par formats d'achat</h2>
  <div class="cards">
    ${withFormat.map(i => `
    <div class="card">
      <div class="card-name">${i.name}</div>
      <div class="card-format">${i.formatName} (${i.formatQty} ${i.unit})</div>
      <div class="card-qty">${i.nbFormats}<span style="font-size:13px;font-weight:400;color:#9CA3AF;margin-left:4px">format${i.nbFormats>1?'s':''}</span></div>
      <div class="card-qty-sub">= ${i.qtyIfOrdered} ${i.unit}</div>
      <div class="card-cost">${i.cost.toFixed(2)} DT</div>
    </div>`).join('')}
  </div>` : ''}

  ${withoutFormat.length > 0 ? `
  <h2>⚠ Sans format configuré</h2>
  <table>
    <thead><tr><th>Ingrédient</th><th>Quantité manquante</th><th>Coût estimé</th></tr></thead>
    <tbody>
      ${withoutFormat.map(i => `
      <tr>
        <td>${i.name}</td>
        <td>${i.toOrder} ${i.unit}</td>
        <td>${i.cost > 0 ? i.cost.toFixed(2)+' DT' : '—'}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}

  <div class="total-bar">
    <div class="label">Total estimé de la commande</div>
    <div class="amount">${total.toFixed(2)} DT</div>
  </div>
</body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 300);
}
