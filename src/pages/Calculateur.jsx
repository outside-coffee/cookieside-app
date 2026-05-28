import React, { useState, useMemo } from 'react';
import { computeCostPerCookie } from '../lib/api';
import { SectionHeader, LoadingScreen, VarietyDot } from '../components/UI';

export default function Calculateur({ varieties, ingredients, loading }) {
  const [selectedVarietyId, setSelectedVarietyId] = useState('');
  const [batchSize, setBatchSize] = useState(28);

  const variety = useMemo(() =>
    varieties.find(v => v.id === selectedVarietyId), [varieties, selectedVarietyId]);

  const costPerCookie = useMemo(() =>
    variety ? computeCostPerCookie(variety) : 0, [variety]);

  const qty = parseInt(batchSize) || 0;

  // Calcul détaillé par ingrédient
  const recipeDetails = useMemo(() => {
    if (!variety) return [];
    return variety.recipes.map(r => {
      const ing = r.ingredients;
      const qtyNeeded = r.qty_per_cookie * qty;
      const cost = qtyNeeded * (ing?.price_per_unit || 0);
      const available = ing?.stock_qty || 0;
      const enoughStock = available >= qtyNeeded;
      // Combien de batches max possible avec ce stock
      const maxBatches = r.qty_per_cookie > 0
        ? Math.floor(available / r.qty_per_cookie)
        : Infinity;
      return {
        name: ing?.name || '?',
        unit: ing?.unit || 'g',
        qtyPerCookie: r.qty_per_cookie,
        qtyNeeded,
        cost,
        available,
        enoughStock,
        maxBatches,
        pricePerUnit: ing?.price_per_unit || 0,
      };
    }).sort((a, b) => b.cost - a.cost);
  }, [variety, qty]);

  const totalCost     = costPerCookie * qty;
  const totalIngCost  = recipeDetails.reduce((s, r) => s + r.cost, 0);

  // Prix de vente et marges
  const priceB2B = variety?.sale_prices?.find(p => p.canal === 'B2B')?.price || 0;
  const priceB2C = variety?.sale_prices?.find(p => p.canal === 'B2C')?.price || 0;
  const margeB2B = qty > 0 ? (priceB2B - costPerCookie) * qty : 0;
  const margeB2C = qty > 0 ? (priceB2C - costPerCookie) * qty : 0;
  const margeB2BPct = priceB2B > 0 ? Math.round((priceB2B - costPerCookie) / priceB2B * 100) : 0;
  const margeB2CPct = priceB2C > 0 ? Math.round((priceB2C - costPerCookie) / priceB2C * 100) : 0;

  // Stock limite : combien de cookies max avec le stock actuel
  const maxCookiesFromStock = useMemo(() => {
    if (!variety || !variety.recipes.length) return null;
    return Math.min(...variety.recipes.map(r =>
      r.qty_per_cookie > 0
        ? Math.floor((r.ingredients?.stock_qty || 0) / r.qty_per_cookie)
        : Infinity
    ));
  }, [variety]);

  // Ingrédients limitants
  const limitingIngredients = useMemo(() => {
    if (!variety || maxCookiesFromStock === null) return [];
    return recipeDetails.filter(r =>
      r.qty_per_cookie > 0 && Math.floor(r.available / r.qty_per_cookie) === maxCookiesFromStock
    );
  }, [recipeDetails, maxCookiesFromStock, variety]);

  if (loading) return <LoadingScreen />;

  return (
    <div className="page-inner">
      <SectionHeader
        title="Calculateur de batch"
        subtitle="Simulez les coûts et besoins en matières pour n'importe quelle quantité"
      />

      {/* Sélecteur */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-body">
          <div className="form-row form-row-2">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Variété</label>
              <select className="form-select" value={selectedVarietyId}
                onChange={e => setSelectedVarietyId(e.target.value)}>
                <option value="">Choisir une variété...</option>
                {varieties.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Nombre de cookies</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" type="number" min="1" step="1"
                  value={batchSize}
                  onChange={e => setBatchSize(e.target.value)}
                  style={{ flex: 1 }} />
                {/* Raccourcis rapides */}
                {[28, 56, 84, 112].map(n => (
                  <button key={n} className={`btn btn-sm ${qty === n ? 'btn-primary' : ''}`}
                    onClick={() => setBatchSize(n)}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="form-hint">Fournée standard : 28 cookies</div>
            </div>
          </div>
        </div>
      </div>

      {!variety && (
        <div style={{
          textAlign: 'center', padding: '4rem 1rem',
          color: 'var(--text-3)', fontSize: '14px'
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
            style={{ width: 48, height: 48, opacity: 0.25, display: 'block', margin: '0 auto 12px' }}>
            <path d="M9 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-3"/>
            <path d="M9 15h3l8.5-8.5a1.5 1.5 0 00-3-3L9 12v3"/>
          </svg>
          Sélectionnez une variété pour commencer
        </div>
      )}

      {variety && qty > 0 && (
        <>
          {/* KPIs du batch */}
          <div className="kpi-grid" style={{ marginBottom: '1rem' }}>
            <div className="kpi-card accent">
              <div className="kpi-label">Coût total du batch</div>
              <div className="kpi-value">{totalCost.toFixed(3)}</div>
              <div className="kpi-sub">DT pour {qty} cookies</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Coût par cookie</div>
              <div className="kpi-value" style={{ fontSize: 22 }}>{costPerCookie.toFixed(4)}</div>
              <div className="kpi-sub">DT / cookie</div>
            </div>
            {priceB2B > 0 && (
              <div className="kpi-card success">
                <div className="kpi-label">Marge B2B ({priceB2B} DT/u)</div>
                <div className="kpi-value" style={{ fontSize: 22, color: margeB2B >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {margeB2B >= 0 ? '+' : ''}{margeB2B.toFixed(2)}
                </div>
                <div className="kpi-sub">DT — {margeB2BPct}% de marge</div>
              </div>
            )}
            {priceB2C > 0 && (
              <div className="kpi-card success">
                <div className="kpi-label">Marge B2C ({priceB2C} DT/u)</div>
                <div className="kpi-value" style={{ fontSize: 22, color: margeB2C >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {margeB2C >= 0 ? '+' : ''}{margeB2C.toFixed(2)}
                </div>
                <div className="kpi-sub">DT — {margeB2CPct}% de marge</div>
              </div>
            )}
            {maxCookiesFromStock !== null && (
              <div className={`kpi-card ${maxCookiesFromStock < qty ? 'danger' : ''}`}>
                <div className="kpi-label">Stock max possible</div>
                <div className="kpi-value"
                  style={{ color: maxCookiesFromStock < qty ? 'var(--red)' : maxCookiesFromStock < qty * 1.5 ? 'var(--amber)' : 'var(--green)' }}>
                  {maxCookiesFromStock}
                </div>
                <div className="kpi-sub">cookies avec le stock actuel</div>
              </div>
            )}
          </div>

          {/* Alerte stock insuffisant */}
          {maxCookiesFromStock < qty && (
            <div style={{
              background: 'var(--red-l)', border: '1px solid rgba(139,34,25,0.2)',
              borderRadius: 'var(--radius)', padding: '10px 14px', fontSize: '13px',
              color: 'var(--red)', marginBottom: '1rem', display: 'flex', gap: 8, alignItems: 'flex-start'
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div>
                <strong>Stock insuffisant pour {qty} cookies.</strong>
                {' '}Vous pouvez en faire <strong>{maxCookiesFromStock}</strong> maximum.
                {limitingIngredients.length > 0 && (
                  <> Ingrédient(s) limitant(s) : <strong>{limitingIngredients.map(i => i.name).join(', ')}</strong>.</>
                )}
              </div>
            </div>
          )}

          {/* Tableau détaillé des ingrédients */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                </svg>
                Besoins en matières premières
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <VarietyDot color={variety.color} />
                <span style={{ fontWeight: 500, fontSize: 13 }}>{variety.name}</span>
                <span style={{ color: 'var(--text-3)', fontSize: 12 }}>× {qty} cookies</span>
              </div>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Ingrédient</th>
                    <th style={{ textAlign: 'right' }}>Qté/cookie</th>
                    <th style={{ textAlign: 'right' }}>
                      Qté totale
                      <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 4 }}>({qty} cookies)</span>
                    </th>
                    <th style={{ textAlign: 'right' }}>Stock dispo</th>
                    <th style={{ textAlign: 'right' }}>Coût partiel</th>
                    <th style={{ textAlign: 'right' }}>% du coût</th>
                    <th style={{ textAlign: 'center' }}>Statut stock</th>
                  </tr>
                </thead>
                <tbody>
                  {recipeDetails.map((r, i) => {
                    const pct = totalIngCost > 0 ? (r.cost / totalIngCost * 100) : 0;
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{r.name}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-3)', fontSize: 12 }}>
                          {r.qtyPerCookie}{r.unit}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {r.qtyNeeded % 1 === 0 ? r.qtyNeeded : r.qtyNeeded.toFixed(2)} {r.unit}
                        </td>
                        <td style={{
                          textAlign: 'right',
                          color: r.enoughStock ? 'var(--text-3)' : 'var(--red)',
                          fontWeight: r.enoughStock ? 400 : 600
                        }}>
                          {r.available} {r.unit}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--gold-d)', fontWeight: 500 }}>
                          {r.cost.toFixed(4)} DT
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <div style={{
                              width: 40, height: 5, background: 'var(--cream-d)',
                              borderRadius: 3, overflow: 'hidden'
                            }}>
                              <div style={{
                                width: `${pct}%`, height: '100%',
                                background: 'var(--navy-500)', borderRadius: 3
                              }} />
                            </div>
                            <span style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 30, textAlign: 'right' }}>
                              {pct.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {r.enoughStock
                            ? <span className="badge badge-ok">OK</span>
                            : <span className="badge badge-out">
                                Manque {(r.qtyNeeded - r.available).toFixed(1)}{r.unit}
                              </span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--navy-900)' }}>
                    <td colSpan={4} style={{ fontWeight: 600, color: '#fff', padding: '10px 14px' }}>
                      Total batch — {qty} cookies
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--gold-mid)', padding: '10px 14px', fontSize: 15 }}>
                      {totalCost.toFixed(3)} DT
                    </td>
                    <td colSpan={2} style={{ textAlign: 'right', color: 'rgba(255,255,255,0.5)', fontSize: 12, padding: '10px 14px' }}>
                      {costPerCookie.toFixed(4)} DT / cookie
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Simulation multi-prix */}
          {(priceB2B > 0 || priceB2C > 0) && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <div className="card-header">
                <div className="card-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                  </svg>
                  Simulation de rentabilité
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Batch de {qty} cookies</span>
              </div>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: priceB2B && priceB2C ? '1fr 1fr' : '1fr', gap: '1rem' }}>
                  {priceB2B > 0 && (
                    <SimCard
                      label="Canal B2B"
                      price={priceB2B}
                      qty={qty}
                      cost={totalCost}
                      costPerUnit={costPerCookie}
                      color="var(--navy-700)"
                      bgColor="var(--navy-50)"
                    />
                  )}
                  {priceB2C > 0 && (
                    <SimCard
                      label="Canal B2C"
                      price={priceB2C}
                      qty={qty}
                      cost={totalCost}
                      costPerUnit={costPerCookie}
                      color="var(--gold-d)"
                      bgColor="var(--gold-l)"
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SimCard({ label, price, qty, cost, costPerUnit, color, bgColor }) {
  const ca    = price * qty;
  const marge = ca - cost;
  const pct   = ca > 0 ? (marge / ca * 100) : 0;
  return (
    <div style={{
      background: bgColor, border: `1px solid ${color}30`,
      borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem'
    }}>
      <div style={{ fontWeight: 600, color, fontSize: 13, marginBottom: 12 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Stat label="Prix de vente" value={`${price} DT/u`} />
        <Stat label="CA total" value={`${ca.toFixed(2)} DT`} highlight={color} />
        <Stat label="Coût total" value={`${cost.toFixed(3)} DT`} />
        <Stat label="Marge nette" value={`${marge >= 0 ? '+' : ''}${marge.toFixed(2)} DT`}
          highlight={marge >= 0 ? 'var(--green)' : 'var(--red)'} />
      </div>
      <div style={{
        marginTop: 12, paddingTop: 10,
        borderTop: `1px solid ${color}20`,
        display: 'flex', alignItems: 'center', gap: 8
      }}>
        <div style={{ flex: 1, height: 8, background: 'rgba(0,0,0,0.08)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(0, pct)}%`, height: '100%', background: color, borderRadius: 4 }} />
        </div>
        <span style={{ fontWeight: 700, color, fontSize: 15 }}>{pct.toFixed(0)}%</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>de marge</span>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: highlight || 'var(--text)' }}>
        {value}
      </div>
    </div>
  );
}
