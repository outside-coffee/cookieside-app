import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { computeCostPerCookie, getVarietyStockBreakdown, purchasePlansAPI } from '../lib/api';
import { batchYield, unitLabel } from '../lib/products';
import { SectionHeader, SopGuide, LoadingScreen, VarietyDot } from '../components/UI';

export default function Achats({ varieties, ingredients, production, sales, onNavigate, loading }) {
  const [plan, setPlan] = useState({});
  const [toAdd, setToAdd] = useState('');
  const [planName, setPlanName] = useState('');
  const [savedPlans, setSavedPlans] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadSavedPlans = async () => {
    try { setSavedPlans(await purchasePlansAPI.getAll()); }
    catch (error) { toast.error(`Plans d'achats : ${error.message}`); }
  };

  useEffect(() => { loadSavedPlans(); }, []);

  const selected = useMemo(() => varieties
    .filter(v => Number(plan[v.id] || 0) > 0)
    .map(v => ({ ...v, plannedQty: Number(plan[v.id]) })), [varieties, plan]);

  const suggestions = useMemo(() => varieties.map(variety => {
    const ordered = sales.filter(s => s.variety_id === variety.id && s.status === 'Vendu')
      .reduce((sum, line) => sum + Number(line.qty || 0), 0);
    const stock = getVarietyStockBreakdown(variety.id, production, sales);
    return { variety, qty: Math.max(0, ordered + Number(variety.min_stock || 0) - stock.physical) };
  }).filter(item => item.qty > 0), [varieties, production, sales]);

  const requirements = useMemo(() => {
    const required = {};
    selected.forEach(variety => variety.recipes?.forEach(recipe => {
      required[recipe.ingredient_id] = (required[recipe.ingredient_id] || 0)
        + Number(recipe.qty_per_cookie || 0) * variety.plannedQty;
    }));
    return ingredients.map(ingredient => {
      const stock = Number(ingredient.stock_qty || 0);
      const needed = Number(required[ingredient.id] || 0);
      const missing = Math.max(0, needed - stock);
      const formatQty = Number(ingredient.purchase_format_qty || 0);
      const formats = missing > 0 && formatQty > 0 ? Math.ceil(missing / formatQty) : 0;
      const buyQty = formats > 0 ? formats * formatQty : missing;
      const cost = formats > 0 && Number(ingredient.purchase_format_price || 0) > 0
        ? formats * Number(ingredient.purchase_format_price)
        : buyQty * Number(ingredient.price_per_unit || 0);
      return { ...ingredient, stock, needed, missing, buyQty, formatQty, formats, cost };
    }).filter(item => item.needed > 0).sort((a, b) => b.missing - a.missing);
  }, [selected, ingredients]);

  const shoppingList = requirements.filter(item => item.missing > 0);
  const productionCost = selected.reduce((sum, variety) => sum + computeCostPerCookie(variety) * variety.plannedQty, 0);
  const purchaseBudget = shoppingList.reduce((sum, item) => sum + item.cost, 0);
  const plannedUnits = selected.reduce((sum, item) => sum + item.plannedQty, 0);

  const addVariety = () => {
    const variety = varieties.find(item => item.id === toAdd);
    if (!variety) return;
    setPlan(current => ({ ...current, [variety.id]: current[variety.id] || batchYield(variety) }));
    setToAdd('');
  };

  const loadSuggestions = () => setPlan(suggestions.reduce((next, item) => ({ ...next, [item.variety.id]: item.qty }), {}));
  const updateQty = (id, value) => setPlan(current => ({ ...current, [id]: Math.max(0, Number(value) || 0) }));
  const removeVariety = id => setPlan(current => { const next = { ...current }; delete next[id]; return next; });

  const savePlan = async () => {
    if (!selected.length) return toast.error('Ajoutez au moins une variété');
    setSaving(true);
    try {
      await purchasePlansAPI.create({
        name: planName.trim() || `Plan du ${new Date().toLocaleDateString('fr-FR')}`,
        status: 'draft',
        varieties: selected.map(v => ({ id:v.id, name:v.name, qty:v.plannedQty, unit:unitLabel(v), color:v.color })),
        items: requirements.map(item => ({ id:item.id, name:item.name, unit:item.unit, stock:item.stock, needed:item.needed, missing:item.missing, buyQty:item.buyQty, formats:item.formats, formatName:item.purchase_format_name, cost:item.cost })),
        planned_units: plannedUnits,
        production_cost: productionCost,
        purchase_budget: purchaseBudget
      });
      toast.success("Plan d'achats enregistré");
      setPlanName('');
      await loadSavedPlans();
    } catch (error) { toast.error(error.message); }
    finally { setSaving(false); }
  };

  const changeStatus = async (savedPlan, status) => {
    try {
      await purchasePlansAPI.updateStatus(savedPlan.id, status);
      toast.success(status === 'ordered' ? 'Plan marqué commandé' : 'Plan marqué reçu');
      await loadSavedPlans();
    } catch (error) { toast.error(error.message); }
  };

  const reopenPlan = savedPlan => {
    setPlan((savedPlan.varieties || []).reduce((next, item) => ({ ...next, [item.id]: item.qty }), {}));
    setPlanName(savedPlan.name);
    window.scrollTo({ top:0, behavior:'smooth' });
  };

  const statusMeta = {
    draft: { label:'Brouillon', className:'badge-pending' },
    ordered: { label:'Commandé', className:'badge-low' },
    received: { label:'Reçu', className:'badge-ok' }
  };

  if (loading) return <LoadingScreen />;

  return <div className="page-inner">
    <SectionHeader title="Achats & simulation" subtitle="Mixer plusieurs variétés et obtenir une seule liste d'achats consolidée"
      actions={shoppingList.length ? [<button key="print" className="btn" onClick={() => window.print()}>Imprimer la liste</button>] : null} />
    <SopGuide steps={[{title:'Composer',detail:'Ajouter les variétés'},{title:'Ajuster',detail:'Saisir les quantités'},{title:'Acheter',detail:'Suivre la liste consolidée'}]}
      actions={[<button key="receive" className="btn btn-sm" onClick={() => onNavigate('mouvements')}>Réceptionner les achats →</button>]} />

    <section className="purchase-planner card">
      <div className="card-header"><div><div className="card-title">Plan de production</div><div className="form-hint">Ajoutez autant de variétés que nécessaire</div></div>
        {suggestions.length > 0 && <button className="btn btn-sm" onClick={loadSuggestions}>Charger les besoins des commandes</button>}
      </div>
      <div className="card-body">
        <div className="purchase-add-row">
          <select className="form-select" value={toAdd} onChange={e => setToAdd(e.target.value)}>
            <option value="">Choisir une variété...</option>
            {varieties.filter(v => !plan[v.id]).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={addVariety} disabled={!toAdd}>＋ Ajouter</button>
        </div>
        {selected.length === 0 ? <div className="empty-inline purchase-empty">Ajoutez une première variété ou chargez les besoins des commandes.</div>
          : <div className="purchase-varieties">{selected.map(variety => <article key={variety.id}>
            <div className="purchase-variety-name"><VarietyDot color={variety.color} /><div><strong>{variety.name}</strong><small>Lot standard : {batchYield(variety)} {unitLabel(variety)}</small></div></div>
            <div className="purchase-quantity"><button onClick={() => updateQty(variety.id, variety.plannedQty - batchYield(variety))}>−</button>
              <input type="number" min="0" value={variety.plannedQty} onChange={e => updateQty(variety.id, e.target.value)} />
              <button onClick={() => updateQty(variety.id, variety.plannedQty + batchYield(variety))}>＋</button><span>{unitLabel(variety)}</span></div>
            <div className="purchase-line-cost"><small>Coût estimé</small><strong>{(computeCostPerCookie(variety) * variety.plannedQty).toFixed(2)} DT</strong></div>
            <button className="btn btn-icon btn-ghost" aria-label={`Retirer ${variety.name}`} onClick={() => removeVariety(variety.id)}>×</button>
          </article>)}</div>}
      </div>
    </section>

    {selected.length > 0 && <>
      <div className="purchase-kpis">
        <div><strong>{selected.length}</strong><small>Variétés</small></div>
        <div><strong>{plannedUnits}</strong><small>Unités prévues</small></div>
        <div><strong>{productionCost.toFixed(2)} DT</strong><small>Coût production</small></div>
        <div className={shoppingList.length ? 'alert' : ''}><strong>{purchaseBudget.toFixed(2)} DT</strong><small>Budget achats</small></div>
      </div>

      <div className="purchase-save-bar card">
        <input className="form-input" value={planName} onChange={e => setPlanName(e.target.value)} placeholder={`Plan du ${new Date().toLocaleDateString('fr-FR')}`} />
        <button className="btn btn-primary" onClick={savePlan} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer le plan'}</button>
      </div>

      <div className="card purchase-results purchase-print">
        <div className="card-header"><div><div className="card-title">Liste d'achats consolidée</div><div className="form-hint">Stock disponible déjà déduit des besoins cumulés</div></div><div className="purchase-print-summary"><strong>{purchaseBudget.toFixed(2)} DT</strong><span className={`badge ${shoppingList.length ? 'badge-low' : 'badge-ok'}`}>{shoppingList.length} à acheter</span></div></div>
        {requirements.length === 0 ? <div className="empty-inline purchase-empty">Aucune recette configurée pour cette sélection.</div>
          : <div className="purchase-material-list">{requirements.map(item => <article key={item.id} className={item.missing > 0 ? 'missing' : 'available'}>
            <div><strong>{item.name}</strong><small>Stock : {item.stock} {item.unit} · Besoin : {item.needed.toFixed(1)} {item.unit}</small></div>
            {item.missing > 0 ? <div className="purchase-to-buy"><strong>{item.formats > 0 ? `${item.formats} × ${item.purchase_format_name || 'format'}` : `${item.buyQty.toFixed(1)} ${item.unit}`}</strong><small>{item.formats > 0 ? `${item.buyQty.toFixed(1)} ${item.unit}` : 'quantité manquante'} · {item.cost.toFixed(2)} DT</small></div>
              : <span className="badge badge-ok">Stock suffisant</span>}
          </article>)}</div>}
      </div>
    </>}

    {savedPlans.length > 0 && <section className="saved-purchases">
      <div className="saved-purchases-head"><div><h3>Plans enregistrés</h3><small>Retrouvez les achats après actualisation</small></div></div>
      <div className="saved-purchase-list">{savedPlans.map(saved => {
        const meta = statusMeta[saved.status] || statusMeta.draft;
        return <article className="card" key={saved.id}>
          <div><strong>{saved.name}</strong><small>{new Date(saved.created_at).toLocaleDateString('fr-FR')} · {saved.planned_units} unités · {(saved.varieties || []).length} variété(s)</small></div>
          <div className="saved-purchase-budget"><strong>{Number(saved.purchase_budget || 0).toFixed(2)} DT</strong><span className={`badge ${meta.className}`}>{meta.label}</span></div>
          <div className="saved-purchase-actions">
            <button className="btn btn-sm" onClick={() => reopenPlan(saved)}>Ouvrir</button>
            {saved.status === 'draft' && <button className="btn btn-sm btn-primary" onClick={() => changeStatus(saved, 'ordered')}>Marquer commandé</button>}
            {saved.status === 'ordered' && <button className="btn btn-sm btn-primary" onClick={() => changeStatus(saved, 'received')}>Marquer reçu</button>}
          </div>
        </article>;
      })}</div>
    </section>}
  </div>;
}
