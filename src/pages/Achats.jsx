import React, { useMemo } from 'react';
import { getVarietyStockBreakdown } from '../lib/api';
import { SectionHeader, SopGuide, LoadingScreen } from '../components/UI';

export default function Achats({ varieties, ingredients, production, sales, onNavigate, loading }) {
  const shoppingList = useMemo(() => {
    const required = {};

    varieties.forEach(variety => {
      const ordered = sales.filter(s => s.variety_id === variety.id && s.status === 'Vendu')
        .reduce((sum, line) => sum + Number(line.qty || 0), 0);
      const stock = getVarietyStockBreakdown(variety.id, production, sales);
      const toProduce = Math.max(0, ordered + Number(variety.min_stock || 0) - stock.physical);
      variety.recipes?.forEach(recipe => {
        required[recipe.ingredient_id] = (required[recipe.ingredient_id] || 0) + Number(recipe.qty_per_cookie || 0) * toProduce;
      });
    });

    return ingredients.map(ingredient => {
      const stock = Number(ingredient.stock_qty || 0);
      const productionNeed = Number(required[ingredient.id] || 0);
      const minimumNeed = Math.max(0, Number(ingredient.alert_threshold || 0) - stock);
      const missingForProduction = Math.max(0, productionNeed - stock);
      const quantity = Math.max(minimumNeed, missingForProduction);
      const formatQty = Number(ingredient.purchase_format_qty || 0);
      const formats = formatQty > 0 ? Math.ceil(quantity / formatQty) : 0;
      const cost = formats > 0 && Number(ingredient.purchase_format_price || 0) > 0
        ? formats * Number(ingredient.purchase_format_price)
        : quantity * Number(ingredient.price_per_unit || 0);
      return { ...ingredient, stock, productionNeed, quantity, formatQty, formats, cost };
    }).filter(item => item.quantity > 0).sort((a,b) => b.quantity - a.quantity);
  }, [varieties, ingredients, production, sales]);

  const total = shoppingList.reduce((sum, item) => sum + item.cost, 0);
  if (loading) return <LoadingScreen />;

  return <div className="page-inner">
    <SectionHeader title="Liste d'achats" subtitle="Générée automatiquement depuis les commandes à produire et les stocks bas"
      actions={shoppingList.length ? [<button key="print" className="btn" onClick={()=>window.print()}>Imprimer</button>] : null} />
    <SopGuide steps={[{title:'Vérifier',detail:'La liste est déjà calculée'},{title:'Acheter',detail:'Quantités ou formats indiqués'},{title:'Réceptionner',detail:'Ajouter l’entrée au stock'}]} actions={[<button key="stocks" className="btn btn-sm" onClick={()=>onNavigate('ingredients')}>Réceptionner dans Stocks →</button>]} />

    {shoppingList.length === 0 ? <div className="card"><div className="empty-inline" style={{padding:'2rem'}}>Tout est disponible. Aucun achat nécessaire.</div></div> : <>
      <div className="kpi-grid">
        <div className="kpi-card accent"><div className="kpi-label">À acheter</div><div className="kpi-value">{shoppingList.length}</div><div className="kpi-sub">matière(s)</div></div>
        <div className="kpi-card"><div className="kpi-label">Budget estimé</div><div className="kpi-value">{total.toFixed(2)}</div><div className="kpi-sub">DT</div></div>
      </div>
      <div className="card"><div className="table-container"><table>
        <thead><tr><th>Matière</th><th style={{textAlign:'right'}}>Stock</th><th style={{textAlign:'right'}}>Besoin production</th><th style={{textAlign:'right'}}>À acheter</th><th style={{textAlign:'right'}}>Budget</th></tr></thead>
        <tbody>{shoppingList.map(item => <tr key={item.id}>
          <td><strong>{item.name}</strong>{item.formats > 0 && <div className="form-hint">{item.formats} × {item.purchase_format_name || 'format'} ({item.formatQty} {item.unit})</div>}</td>
          <td style={{textAlign:'right'}}>{item.stock} {item.unit}</td>
          <td style={{textAlign:'right'}}>{item.productionNeed.toFixed(1)} {item.unit}</td>
          <td style={{textAlign:'right',fontWeight:700,color:'var(--coral)'}}>{item.quantity.toFixed(1)} {item.unit}</td>
          <td style={{textAlign:'right'}}>{item.cost.toFixed(2)} DT</td>
        </tr>)}</tbody>
      </table></div></div>
    </>}
  </div>;
}
