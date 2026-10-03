import React, { useEffect, useMemo, useState } from 'react';
import { SectionHeader } from '../components/UI';
import Ingredients from './Ingredients';
import Varieties from './Varieties';
import Suppliers from './Suppliers';
import { auditAPI, computeCostPerCookie } from '../lib/api';

export default function Catalogue(props) {
  const [tab, setTab] = useState('products');
  const [auditEvents,setAuditEvents]=useState([]);
  useEffect(()=>{auditAPI.getRecent(12).then(setAuditEvents).catch(()=>{});},[]);
  const stats = useMemo(() => {
    const rawMaterials = props.ingredients.filter(item => (item.item_type || 'raw_material') === 'raw_material').length;
    const consumables = props.ingredients.filter(item => item.item_type === 'consumable').length;
    const incompleteMaterials = props.ingredients.filter(item => !item.purchase_format_name || !Number(item.purchase_format_qty) || !Number(item.purchase_format_price)).length;
    const incompleteProducts = props.varieties.filter(item => !item.recipes?.length || !item.sale_prices?.length).length;
    return { rawMaterials, consumables, incompleteMaterials, incompleteProducts };
  }, [props.ingredients, props.varieties]);
  const incompleteProducts = props.varieties.filter(item => !item.recipes?.length || !item.sale_prices?.length);
  const incompleteMaterials = props.ingredients.filter(item => !item.purchase_format_name || !Number(item.purchase_format_qty) || !Number(item.purchase_format_price));
  const normalize=value=>String(value||'').trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const productNames=props.varieties.map(item=>normalize(item.name));
  const materialNames=props.ingredients.map(item=>normalize(item.name));
  const issues=[
    ...props.varieties.flatMap(product=>{
      const cost=computeCostPerCookie(product); const prices=product.sale_prices||[];
      return [
        !product.recipes?.length&&{type:'product',id:product.id,name:product.name,label:'Recette manquante',severity:'error'},
        !prices.find(p=>p.canal==='B2B')&&{type:'product',id:product.id,name:product.name,label:'Prix B2B manquant',severity:'warning'},
        !prices.find(p=>p.canal==='B2C')&&{type:'product',id:product.id,name:product.name,label:'Prix B2C manquant',severity:'warning'},
        prices.some(p=>Number(p.price)<cost)&&{type:'product',id:product.id,name:product.name,label:'Prix inférieur au coût',severity:'error'},
        product.recipes?.some(r=>Number(r.qty_per_cookie)<=0)&&{type:'product',id:product.id,name:product.name,label:'Quantité recette invalide',severity:'error'},
        product.recipes?.some(r=>r.ingredients?.item_type==='consumable')&&{type:'product',id:product.id,name:product.name,label:'Consommable dans la recette',severity:'error'},
        productNames.filter(name=>name===normalize(product.name)).length>1&&{type:'product',id:product.id,name:product.name,label:'Doublon probable',severity:'warning'}
      ].filter(Boolean);
    }),
    ...props.ingredients.flatMap(item=>[
      (!item.unit||!item.purchase_format_name||!Number(item.purchase_format_qty)||!Number(item.purchase_format_price))&&{type:'material',id:item.id,name:item.name,label:'Format ou prix incomplet',severity:'warning'},
      materialNames.filter(name=>name===normalize(item.name)).length>1&&{type:'material',id:item.id,name:item.name,label:'Doublon probable',severity:'warning'}
    ].filter(Boolean))
  ];

  return <div className="page-inner catalogue-page">
    <SectionHeader title="Catalogue" subtitle="Gérer les données de référence utilisées par les stocks, les recettes, la production et les ventes" />
    <div className="catalogue-kpis">
      <button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}><strong>{props.varieties.length}</strong><span>Produits actifs</span><small>{stats.incompleteProducts} fiche(s) à compléter</small></button>
      <button className={tab === 'materials' ? 'active' : ''} onClick={() => setTab('materials')}><strong>{stats.rawMaterials}</strong><span>Matières premières</span><small>{stats.incompleteMaterials} format(s) à compléter</small></button>
      <button className={tab === 'materials' ? 'active' : ''} onClick={() => setTab('materials')}><strong>{stats.consumables}</strong><span>Consommables</span><small>Hygiène, production, emballages</small></button>
    </div>
    <div className="finance-tabs catalogue-tabs" role="tablist">
      <button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>Produits & recettes</button>
      <button className={tab === 'materials' ? 'active' : ''} onClick={() => setTab('materials')}>Matières & consommables</button>
      <button className={tab === 'suppliers' ? 'active' : ''} onClick={() => setTab('suppliers')}>Fournisseurs</button>
    </div>
    <div className="catalogue-help">{tab === 'products' ? 'Définissez ici les familles, recettes, rendements et prix de vente.' : tab === 'materials' ? "Définissez ici les unités, formats d’achat, prix, seuils et catégories. Les quantités restent suivies dans Stocks." : 'Gérez uniquement les fournisseurs réguliers et leurs matières habituelles.'}</div>
    {issues.length>0&&<div className="catalogue-issues card"><div className="card-header"><div><div className="card-title">À corriger</div><div className="form-hint">{issues.length} incohérence(s) détectée(s)</div></div></div><div>{issues.slice(0,12).map((issue,index)=><button key={`${issue.type}-${issue.id}-${index}`} onClick={()=>setTab(issue.type==='product'?'products':'materials')}><span className={issue.severity}>{issue.severity==='error'?'!':'•'}</span><div><strong>{issue.name}</strong><small>{issue.label}</small></div><b>Corriger →</b></button>)}</div></div>}
    {auditEvents.length>0&&<details className="catalogue-audit card"><summary>Dernières modifications tracées ({auditEvents.length})</summary><div>{auditEvents.map(event=><article key={event.id}><strong>{event.entity_type==='order'?'Commande':event.entity_type==='recipe'?'Recette':'Matière'}</strong><span>{event.action==='insert'?'Création':'Modification'}</span><time>{new Date(event.changed_at).toLocaleString('fr-FR')}</time></article>)}</div></details>}
    {((tab === 'products' && incompleteProducts.length > 0) || (tab === 'materials' && incompleteMaterials.length > 0)) && <div className="catalogue-quality card">
      <div><strong>Fiches à compléter</strong><small>{tab === 'products' ? 'Recette ou prix de vente manquant' : "Format, contenance ou prix d’achat manquant"}</small></div>
      <div>{(tab === 'products' ? incompleteProducts : incompleteMaterials).slice(0,8).map(item => <span key={item.id}>{item.name}</span>)}</div>
    </div>}
    <div className="catalogue-embedded">
      {tab === 'products' ? <Varieties {...props} /> : tab === 'materials' ? <Ingredients {...props} /> : <Suppliers {...props} />}
    </div>
  </div>;
}
