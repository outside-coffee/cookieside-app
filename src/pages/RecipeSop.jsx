import React, { useMemo, useState } from 'react';
import { LoadingScreen, SectionHeader } from '../components/UI';
import { batchYield, unitLabel } from '../lib/products';

const hygieneChecks = [
  'Mains lavées, tenue propre, cheveux attachés et bijoux retirés',
  'Plan de travail, balance et ustensiles nettoyés et désinfectés',
  'Matières contrôlées : date, emballage, odeur et température',
  'Allergènes identifiés et risque de contamination croisée maîtrisé',
  'Bacs propres, étiquettes et matériel de traçabilité disponibles'
];

const productionSteps = [
  { title:'Préparer le poste', detail:'Sortir uniquement le matériel nécessaire. Préparer les bacs propres et l’étiquette du lot.' },
  { title:'Peser les matières', detail:'Peser chaque ingrédient séparément selon le tableau. Faire une double vérification avant mélange.' },
  { title:'Réaliser le mélange', detail:'Respecter l’ordre de mélange validé pour le produit. Racler les bords et vérifier l’homogénéité avant de poursuivre.' },
  { title:'Former ou portionner', detail:'Diviser régulièrement selon l’unité du produit. Contrôler le poids de plusieurs pièces pendant le façonnage.' },
  { title:'Cuire ou finaliser', detail:'Appliquer le temps et la température validés dans votre fiche technique. Ne pas improviser un nouveau réglage en production.' },
  { title:'Refroidir et contrôler', detail:'Refroidir sur une zone propre. Vérifier aspect, texture, poids et quantité réellement obtenue.' },
  { title:'Identifier et ranger', detail:'Étiqueter le lot avec produit, date, quantité et opérateur. Ranger selon les conditions de conservation prévues.' },
  { title:'Nettoyer et enregistrer', detail:'Nettoyer le poste, isoler les pertes, puis enregistrer le lot terminé dans Production.' }
];

export default function RecipeSop({ varieties, loading, onNavigate }) {
  const available = varieties.filter(v => v.product_status !== 'draft');
  const [varietyId, setVarietyId] = useState(available[0]?.id || '');
  const selected = available.find(v => v.id === varietyId) || available[0];
  const [qty, setQty] = useState(selected ? batchYield(selected) : 1);
  const [checked, setChecked] = useState({});

  const chooseVariety = id => {
    const product = available.find(v => v.id === id);
    setVarietyId(id);
    setQty(product ? batchYield(product) : 1);
    setChecked({});
  };
  const ingredients = useMemo(() => (selected?.recipes || []).map(recipe => ({
    name:recipe.ingredients?.name || recipe.ingredient_name || 'Ingrédient',
    unit:recipe.ingredients?.unit || 'g',
    quantity:Number(recipe.qty_per_cookie || 0) * Number(qty || 0)
  })), [selected, qty]);

  if (loading) return <LoadingScreen />;
  return <div className="page-inner recipe-sop">
    <SectionHeader title="SOP recettes" subtitle="Fiche de fabrication, hygiène et contrôles étape par étape"
      actions={[<button key="print" className="btn" onClick={() => window.print()}>Imprimer la SOP</button>]} />

    <div className="card sop-selector no-print">
      <div className="form-group"><label className="form-label">Produit</label><select className="form-select" value={selected?.id || ''} onChange={e => chooseVariety(e.target.value)}><option value="">Choisir...</option>{available.map(v => <option key={v.id} value={v.id}>{v.product_families?.name || v.family} · {v.name}</option>)}</select></div>
      <div className="form-group"><label className="form-label">Quantité à produire</label><input className="form-input" type="number" min="1" step="1" value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))}/><div className="form-hint">Lot standard : {selected ? batchYield(selected) : 0} {selected ? unitLabel(selected) : 'unités'}</div></div>
    </div>

    {!selected ? <div className="card"><div className="empty-inline" style={{padding:'2rem'}}>Créez d’abord un produit et sa recette.</div></div> : <>
      <div className="sop-sheet-head"><div><small>Fiche de fabrication</small><h2>{selected.name}</h2><span>{qty} {unitLabel(selected)} · {selected.product_families?.name || selected.family || 'Produit'}</span></div><div className="sop-trace"><span>Date : ____ / ____ / ______</span><span>Opérateur : __________________</span><span>Lot : _______________________</span></div></div>

      <section className="card sop-section">
        <div className="card-header"><div><div className="card-title">1. Hygiène avant démarrage</div><div className="form-hint">Toutes les cases doivent être validées avant de peser.</div></div></div>
        <div className="sop-checklist">{hygieneChecks.map((label,index) => <label key={label}><input type="checkbox" checked={!!checked[`h${index}`]} onChange={e => setChecked(v => ({...v,[`h${index}`]:e.target.checked}))}/><span>{label}</span></label>)}</div>
      </section>

      <section className="card sop-section">
        <div className="card-header"><div><div className="card-title">2. Pesée du lot</div><div className="form-hint">Quantités calculées pour {qty} {unitLabel(selected)}.</div></div></div>
        <div className="table-container"><table><thead><tr><th>Matière</th><th style={{textAlign:'right'}}>Quantité</th><th>Lot / DDM</th><th>Contrôle</th></tr></thead><tbody>{ingredients.map((ingredient,index) => <tr key={`${ingredient.name}-${index}`}><td><strong>{ingredient.name}</strong></td><td style={{textAlign:'right'}}><strong>{Number(ingredient.quantity.toFixed(2))} {ingredient.unit}</strong></td><td>________________</td><td><input type="checkbox" checked={!!checked[`i${index}`]} onChange={e => setChecked(v => ({...v,[`i${index}`]:e.target.checked}))}/></td></tr>)}</tbody></table></div>
        {!ingredients.length && <div className="empty-inline" style={{padding:'1rem'}}>La recette de ce produit ne contient aucun ingrédient.</div>}
      </section>

      <section className="card sop-section">
        <div className="card-header"><div><div className="card-title">3. Fabrication étape par étape</div><div className="form-hint">Cocher chaque étape au moment où elle est terminée.</div></div></div>
        <div className="sop-steps">{productionSteps.map((step,index) => <article key={step.title}><label><input type="checkbox" checked={!!checked[`s${index}`]} onChange={e => setChecked(v => ({...v,[`s${index}`]:e.target.checked}))}/><b>{index + 1}</b></label><div><strong>{step.title}</strong><p>{step.detail}</p></div></article>)}</div>
      </section>

      <section className="card sop-section sop-final">
        <div className="card-title">4. Contrôle final et traçabilité</div>
        <div className="sop-final-grid"><label>Quantité obtenue<input className="form-input" placeholder={`${qty} ${unitLabel(selected)}`}/></label><label>Pertes / non-conformes<input className="form-input" placeholder="0"/></label><label>Heure de fin<input className="form-input" type="time"/></label><label>Signature<input className="form-input" placeholder="Nom / initiales"/></label></div>
        <div className="sop-final-actions no-print"><button className="btn btn-primary" onClick={() => onNavigate('production')}>Enregistrer le lot dans Production →</button><button className="btn" onClick={() => setChecked({})}>Réinitialiser les cases</button></div>
      </section>
    </>}
  </div>;
}
