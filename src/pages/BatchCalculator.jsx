import React, { useState, useMemo } from 'react';
import { computeCostPerCookie } from '../lib/api';
import { SectionHeader, LoadingScreen, VarietyDot } from '../components/UI';

export default function BatchCalculator({ varieties, ingredients, loading }) {
  const [selectedId, setSelectedId] = useState('');
  const [qty, setQty]               = useState(28);
  const [priceMode, setPriceMode]   = useState('B2C'); // B2B | B2C | custom
  const [customPrice, setCustomPrice] = useState('');

  const variety = useMemo(() => varieties.find(v => v.id === selectedId), [varieties, selectedId]);
  const costPerCookie = useMemo(() => variety ? computeCostPerCookie(variety) : 0, [variety]);

  const sellingPrice = useMemo(() => {
    if (!variety) return 0;
    if (priceMode === 'custom') return parseFloat(customPrice) || 0;
    const sp = variety.sale_prices?.find(p => p.canal === priceMode);
    return sp ? parseFloat(sp.price) : 0;
  }, [variety, priceMode, customPrice]);

  const batchQty = parseInt(qty) || 0;

  const batchCost   = costPerCookie * batchQty;
  const batchCA     = sellingPrice * batchQty;
  const batchMarge  = batchCA - batchCost;
  const margePercent = batchCA > 0 ? (batchMarge / batchCA * 100) : 0;

  // Détail ingrédients pour ce batch
  const ingredientLines = useMemo(() => {
    if (!variety || !batchQty) return [];
    return variety.recipes.map(r => {
      const ing = r.ingredients;
      const totalQty = r.qty_per_cookie * batchQty;
      const cost = totalQty * (ing?.price_per_unit || 0);
      const pct  = batchCost > 0 ? cost / batchCost * 100 : 0;
      return {
        name: ing?.name || '?',
        unit: ing?.unit || 'g',
        qtyPerCookie: r.qty_per_cookie,
        totalQty,
        cost,
        pct,
        stockQty: ing?.stock_qty || 0,
        sufficient: (ing?.stock_qty || 0) >= totalQty,
      };
    }).sort((a, b) => b.cost - a.cost);
  }, [variety, batchQty, batchCost]);

  // Combien de batches peut-on faire avec le stock actuel ?
  const maxBatchFromStock = useMemo(() => {
    if (!variety || !variety.recipes.length) return null;
    const mins = variety.recipes.map(r => {
      const ing = r.ingredients;
      if (!r.qty_per_cookie) return Infinity;
      return Math.floor((ing?.stock_qty || 0) / r.qty_per_cookie);
    });
    return Math.min(...mins);
  }, [variety]);

  if (loading) return <LoadingScreen />;

  return (
    <div className="page-inner">
      <SectionHeader
        title="Calculateur de batch"
        subtitle="Simulez un lot de production avant de l'enregistrer"
      />

      {/* Sélecteur */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-body">
          <div className="form-row form-row-3" style={{ alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Variété</label>
              <select className="form-select" value={selectedId}
                onChange={e => { setSelectedId(e.target.value); setCustomPrice(''); }}>
                <option value="">Choisir une variété...</option>
                {varieties.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Nombre de cookies</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="form-input" type="number" min="1" value={qty}
                  onChange={e => setQty(e.target.value)} />
                {[14, 28, 56, 84].map(n => (
                  <button key={n} className={`btn btn-sm ${parseInt(qty) === n ? 'btn-primary' : ''}`}
                    onClick={() => setQty(n)}>{n}</button>
                ))}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Prix de vente</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['B2B','B2C','custom'].map(m => (
                  <button key={m} className={`btn btn-sm ${priceMode === m ? 'btn-primary' : ''}`}
                    onClick={() => setPriceMode(m)}>
                    {m === 'custom' ? 'Manuel' : m}
                  </button>
                ))}
              </div>
              {priceMode === 'custom' && (
                <input className="form-input" type="number" step="0.1" placeholder="Prix/cookie (DT)"
                  value={customPrice} onChange={e => setCustomPrice(e.target.value)}
                  style={{ marginTop: 6 }} />
              )}
            </div>
          </div>
        </div>
      </div>

      {variety && batchQty > 0 ? (
        <>
          {/* KPIs du batch */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: '1rem' }}>
            <div className="kpi-card">
              <div className="kpi-label">Cookies</div>
              <div className="kpi-value">{batchQty}</div>
              <div className="kpi-sub">
                {maxBatchFromStock !== null && (
                  <span style={{ color: maxBatchFromStock >= batchQty ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
                    Stock permet : {maxBatchFromStock} cookies
                  </span>
                )}
              </div>
            </div>
            <div className="kpi-card accent">
              <div className="kpi-label">Coût total batch</div>
              <div className="kpi-value">{batchCost.toFixed(3)}</div>
              <div className="kpi-sub">{costPerCookie.toFixed(4)} DT / cookie</div>
            </div>
            {sellingPrice > 0 && <>
              <div className="kpi-card">
                <div className="kpi-label">CA ({priceMode === 'custom' ? 'Manuel' : priceMode})</div>
                <div className="kpi-value">{batchCA.toFixed(2)}</div>
                <div className="kpi-sub">{sellingPrice.toFixed(3)} DT / cookie</div>
              </div>
              <div className={`kpi-card ${batchMarge >= 0 ? 'success' : 'danger'}`}>
                <div className="kpi-label">Marge brute</div>
                <div className="kpi-value">{batchMarge >= 0 ? '+' : ''}{batchMarge.toFixed(2)}</div>
                <div className="kpi-sub">{margePercent.toFixed(1)}% du CA</div>
              </div>
            </>}
          </div>

          {/* Alerte stock insuffisant */}
          {ingredientLines.some(l => !l.sufficient) && (
            <div style={{
              background: 'var(--red-l)', border: '1px solid rgba(139,34,25,0.2)',
              borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: '1rem',
              fontSize: '13px', color: 'var(--red)', display: 'flex', gap: 10, alignItems: 'flex-start'
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <div>
                <strong>Stock insuffisant pour :</strong>{' '}
                {ingredientLines.filter(l => !l.sufficient).map(l =>
                  `${l.name} (besoin ${l.totalQty.toFixed(1)}${l.unit}, dispo ${l.stockQty}${l.unit})`
                ).join(' • ')}
              </div>
            </div>
          )}

          {/* Tableau détail ingrédients */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <VarietyDot color={variety.color} />
                {variety.name} — détail des ingrédients pour {batchQty} cookies
              </div>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Ingrédient</th>
                    <th style={{ textAlign: 'right' }}>Qté/cookie</th>
                    <th style={{ textAlign: 'right' }}>Total batch</th>
                    <th style={{ textAlign: 'right' }}>Stock dispo</th>
                    <th style={{ textAlign: 'right' }}>Coût (DT)</th>
                    <th style={{ textAlign: 'right' }}>% du coût</th>
                    <th>Stock OK ?</th>
                  </tr>
                </thead>
                <tbody>
                  {ingredientLines.map(l => (
                    <tr key={l.name}>
                      <td style={{ fontWeight: 500 }}>{l.name}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-3)' }}>
                        {l.qtyPerCookie}{l.unit}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {l.totalQty.toFixed(2)}{l.unit}
                      </td>
                      <td style={{ textAlign: 'right', color: l.sufficient ? 'var(--green)' : 'var(--red)' }}>
                        {l.stockQty}{l.unit}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--gold-d)', fontWeight: 500 }}>
                        {l.cost.toFixed(4)} DT
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                          <div style={{ width: 60, height: 6, background: 'var(--cream-d)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, l.pct)}%`, height: '100%', background: 'var(--navy-600)', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: '12px', minWidth: 34, textAlign: 'right' }}>{l.pct.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td>
                        {l.sufficient
                          ? <span className="badge badge-ok">OK</span>
                          : <span className="badge badge-out">Manque {(l.totalQty - l.stockQty).toFixed(1)}{l.unit}</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--navy-900)' }}>
                    <td colSpan={4} style={{ fontWeight: 700, color: '#fff', fontSize: '13px' }}>
                      Total — {batchQty} cookies
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--gold-mid)' }}>
                      {batchCost.toFixed(3)} DT
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>100%</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Résumé financier */}
          {sellingPrice > 0 && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <div className="card-header">
                <div className="card-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                  Analyse financière
                </div>
              </div>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  {[
                    { label: 'Coût de revient/cookie', value: costPerCookie.toFixed(4) + ' DT', color: 'var(--text)' },
                    { label: `Prix vente/cookie (${priceMode === 'custom' ? 'Manuel' : priceMode})`, value: sellingPrice.toFixed(3) + ' DT', color: 'var(--navy-700)' },
                    { label: 'Marge/cookie', value: (sellingPrice - costPerCookie >= 0 ? '+' : '') + (sellingPrice - costPerCookie).toFixed(3) + ' DT', color: sellingPrice >= costPerCookie ? 'var(--green)' : 'var(--red)' },
                    { label: 'Taux de marge', value: margePercent.toFixed(1) + '%', color: margePercent >= 50 ? 'var(--green)' : margePercent >= 30 ? 'var(--amber)' : 'var(--red)' },
                    { label: `CA batch (${batchQty} cookies)`, value: batchCA.toFixed(2) + ' DT', color: 'var(--navy-700)' },
                    { label: 'Bénéfice batch', value: (batchMarge >= 0 ? '+' : '') + batchMarge.toFixed(2) + ' DT', color: batchMarge >= 0 ? 'var(--green)' : 'var(--red)' },
                  ].map(item => (
                    <div key={item.label} style={{ background: 'var(--sand)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-display)', color: item.color }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="card">
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-3)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48"
              style={{ opacity: 0.25, display: 'block', margin: '0 auto 16px' }}>
              <path d="M9 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-3"/><path d="M9 15h3l8.5-8.5a1.5 1.5 0 00-3-3L9 12v3"/><line x1="16" y1="5" x2="19" y2="8"/>
            </svg>
            <p style={{ fontSize: '14px' }}>Sélectionnez une variété pour simuler un batch</p>
          </div>
        </div>
      )}
    </div>
  );
}
