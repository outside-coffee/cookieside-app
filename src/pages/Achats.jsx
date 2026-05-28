import React, { useMemo, useState } from 'react';
import { computeCostPerCookie, maxBatchFromStock } from '../lib/api';
import { SectionHeader, LoadingScreen, VarietyDot } from '../components/UI';

export default function Achats({ varieties, ingredients, production, loading }) {
  const [targetWeeks, setTargetWeeks] = useState(2);
  const [batchPerVariety, setBatchPerVariety] = useState(4); // batches/semaine par variété

  // Consommation moyenne par ingrédient (basée sur l'historique production)
  const avgConsumption = useMemo(() => {
    // On groupe la production par semaine pour avoir un rythme
    if (!production.length) return {};
    const oldest = new Date(production[production.length - 1].produced_at);
    const newest = new Date(production[0].produced_at);
    const diffDays = Math.max(1, (newest - oldest) / (1000 * 60 * 60 * 24));
    const weeks = Math.max(1, diffDays / 7);

    const totalByVariety = {};
    production.forEach(p => {
      totalByVariety[p.variety_id] = (totalByVariety[p.variety_id] || 0) + p.qty;
    });

    // Consommation hebdo par ingrédient
    const weeklyIng = {};
    varieties.forEach(v => {
      const totalCookies = totalByVariety[v.id] || 0;
      v.recipes?.forEach(r => {
        const name = r.ingredients?.name;
        if (!name) return;
        weeklyIng[name] = (weeklyIng[name] || 0) + (r.qty_per_cookie * totalCookies / weeks);
      });
    });
    return weeklyIng;
  }, [production, varieties]);

  // Besoins pour la cible : targetWeeks semaines × batchPerVariety batches × 28 cookies
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
            stock: ing.stock_qty, alert: ing.alert_threshold,
            needed: 0, price: ing.price_per_unit || 0
          };
        }
        ingNeeds[ing.id].needed += needed;
      });
    });

    return Object.values(ingNeeds).map(i => {
      const ing_obj  = ingredients.find(x => x.id === i.id);
      const toOrder  = Math.max(0, parseFloat((i.needed - i.stock).toFixed(2)));
      // Si format configuré, arrondir au format supérieur
      const formatQty   = parseFloat(ing_obj?.purchase_format_qty) || 0;
      const formatPrice = parseFloat(ing_obj?.purchase_format_price) || 0;
      const formatName  = ing_obj?.purchase_format_name || '';
      const nbFormats   = formatQty > 0 ? Math.ceil(toOrder / formatQty) : 0;
      const cost = nbFormats > 0 && formatPrice > 0
        ? nbFormats * formatPrice
        : toOrder * i.price;
      const coverage = i.stock > 0 && i.needed > 0
        ? Math.min(100, Math.round(i.stock / i.needed * 100)) : (i.needed === 0 ? 100 : 0);
      return { ...i, toOrder, cost, coverage, ok: toOrder <= 0, formatQty, formatPrice, formatName, nbFormats };
    }).sort((a, b) => a.coverage - b.coverage);
  }, [varieties, ingredients, targetWeeks, batchPerVariety]);

  const totalCost   = needs.reduce((s, i) => s + i.cost, 0);
  const toOrderList = needs.filter(i => !i.ok);

  // Capacité actuelle de production
  const capacity = useMemo(() =>
    varieties.map(v => ({
      variety: v,
      maxCookies: maxBatchFromStock(v, ingredients),
      cost: computeCostPerCookie(v),
    })), [varieties, ingredients]);

  if (loading) return <LoadingScreen />;

  return (
    <div className="page-inner">
      <SectionHeader
        title="Commandes fournisseurs"
        subtitle="Calcul des besoins en matières premières"
      />

      {/* Capacité actuelle */}
      <div className="card" style={{ marginBottom:'1rem' }}>
        <div className="card-header">
          <div className="card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/>
              <line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
            Capacité de production — stock actuel
          </div>
        </div>
        <div className="card-body" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10 }}>
          {capacity.map(({ variety, maxCookies, cost }) => {
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
                <div style={{ fontSize:22, fontWeight:700, color, lineHeight:1 }}>{maxCookies}</div>
                <div style={{ fontSize:11, color:'var(--text-3)', marginTop:3 }}>
                  cookies max · {maxBatches} batch{maxBatches !== 1 ? 'es' : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Paramètres commande */}
      <div className="card" style={{ marginBottom:'1rem' }}>
        <div className="card-header">
          <div className="card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/>
            </svg>
            Paramètres de la commande
          </div>
        </div>
        <div className="card-body">
          <div className="form-row form-row-2">
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Horizon de production (semaines)</label>
              <div style={{ display:'flex', gap:6 }}>
                <input className="form-input" type="number" min="1" max="12" value={targetWeeks}
                  onChange={e => setTargetWeeks(Math.max(1, parseInt(e.target.value)||1))}
                  style={{ maxWidth:80 }} />
                {[1,2,4,8].map(w => (
                  <button key={w} className={`btn btn-sm ${targetWeeks===w ? 'btn-primary' : ''}`}
                    onClick={() => setTargetWeeks(w)}>
                    {w}S
                  </button>
                ))}
              </div>
              <div className="form-hint">Combien de semaines de stock vous voulez</div>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Batches / semaine / variété</label>
              <div style={{ display:'flex', gap:6 }}>
                <input className="form-input" type="number" min="1" max="20" value={batchPerVariety}
                  onChange={e => setBatchPerVariety(Math.max(1, parseInt(e.target.value)||1))}
                  style={{ maxWidth:80 }} />
                {[2,4,7,10].map(b => (
                  <button key={b} className={`btn btn-sm ${batchPerVariety===b ? 'btn-primary' : ''}`}
                    onClick={() => setBatchPerVariety(b)}>
                    {b}
                  </button>
                ))}
              </div>
              <div className="form-hint">
                = {batchPerVariety * 28 * varieties.length * targetWeeks} cookies total sur {targetWeeks} semaine{targetWeeks > 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Récap commande */}
      {toOrderList.length > 0 && (
        <div style={{
          background:'var(--navy-900)', borderRadius:'var(--radius-lg)',
          padding:'1rem 1.25rem', marginBottom:'1rem',
          display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10
        }}>
          <div style={{ color:'#fff' }}>
            <span style={{ fontSize:14, fontWeight:600 }}>{toOrderList.length} ingrédient(s) à commander</span>
            <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginLeft:10 }}>
              pour {targetWeeks} semaine{targetWeeks>1?'s':''} de production
            </span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:11, color:'var(--gold-mid)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Coût estimé</div>
              <div style={{ fontSize:20, fontWeight:700, color:' var(--gold-mid)' }}>{totalCost.toFixed(2)} DT</div>
            </div>
            <button className="btn btn-gold" onClick={() => printOrder(toOrderList, targetWeeks, batchPerVariety, varieties.length)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              Imprimer / PDF
            </button>
          </div>
        </div>
      )}

      {/* Tableau des besoins */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 01-8 0"/>
            </svg>
            Liste de courses
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
                <th style={{ textAlign:'right' }}>Stock actuel</th>
                <th style={{ textAlign:'right' }}>Besoin ({targetWeeks}S)</th>
                <th style={{ textAlign:'right' }}>À commander</th>
                <th style={{ textAlign:'right' }}>Coût estimé</th>
                <th>Couverture</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {needs.map(i => (
                <tr key={i.id} style={{ background: i.ok ? 'inherit' : 'rgba(146,43,33,0.03)' }}>
                  <td style={{ fontWeight:500 }}>{i.name}</td>
                  <td style={{ textAlign:'right', color:'var(--text-2)' }}>{i.stock} {i.unit}</td>
                  <td style={{ textAlign:'right', color:'var(--text-2)' }}>{i.needed.toFixed(0)} {i.unit}</td>
                  <td style={{ textAlign:'right', fontWeight: i.ok ? 400 : 700,
                    color: i.ok ? 'var(--text-3)' : 'var(--red)' }}>
                    {i.ok ? '—' : `${i.toOrder} ${i.unit}`}
                  </td>
                  <td style={{ textAlign:'right', color: i.ok ? 'var(--text-3)' : 'var(--gold-d)', fontWeight: i.ok ? 400 : 500 }}>
                    {i.ok ? '—' : `${i.cost.toFixed(2)} DT`}
                  </td>
                  <td style={{ minWidth:120 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ flex:1, height:6, background:'var(--cream-d)', borderRadius:3, overflow:'hidden' }}>
                        <div style={{
                          width:`${i.coverage}%`, height:'100%', borderRadius:3,
                          background: i.coverage >= 100 ? 'var(--green)' : i.coverage >= 50 ? 'var(--amber)' : 'var(--red)'
                        }} />
                      </div>
                      <span style={{ fontSize:11, color:'var(--text-3)', minWidth:28 }}>{i.coverage}%</span>
                    </div>
                  </td>
                  <td>
                    {i.ok
                      ? <span className="badge badge-ok">✓ OK</span>
                      : <span className="badge badge-out">Commander</span>
                    }
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
  const date = new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
  const total = items.reduce((s, i) => s + i.cost, 0);
  const html = `
    <html><head><title>Commande Cookieside</title>
    <style>
      body { font-family: 'DM Sans', sans-serif; padding: 2rem; color: #0D1B3E; }
      h1 { font-size: 22px; margin-bottom: 4px; }
      .sub { color: #9CA3AF; font-size: 13px; margin-bottom: 1.5rem; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { background: #152249; color: #fff; padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
      td { padding: 8px 12px; border-bottom: 1px solid #F3F4F6; }
      tr:nth-child(even) td { background: #FAFAF8; }
      .total { margin-top: 1rem; text-align: right; font-size: 15px; font-weight: 700; color: #C8951A; }
      @media print { button { display: none; } }
    </style></head>
    <body>
      <h1>🍪 Cookieside — Liste de commande</h1>
      <div class="sub">Générée le ${date} · ${weeks} semaine(s) · ${batches} batches/semaine · ${nVarieties} variétés</div>
      <table>
        <thead><tr><th>Ingrédient</th><th>Qté à commander</th><th>Coût estimé</th></tr></thead>
        <tbody>
          ${items.map(i => `<tr><td>${i.name}</td><td>${i.toOrder} ${i.unit}${i.formatName && i.formatQty ? '<br><small style="color:#666">→ ' + Math.ceil(i.toOrder/i.formatQty) + ' × ' + i.formatName + '</small>' : ''}</td><td>${i.cost.toFixed(2)} DT</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="total">Total estimé : ${total.toFixed(2)} DT</div>
    </body></html>
  `;
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.print();
}
