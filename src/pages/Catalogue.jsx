import React, { useMemo, useState } from 'react';
import { SectionHeader } from '../components/UI';
import Ingredients from './Ingredients';
import Varieties from './Varieties';

export default function Catalogue(props) {
  const [tab, setTab] = useState('products');
  const stats = useMemo(() => {
    const rawMaterials = props.ingredients.filter(item => (item.item_type || 'raw_material') === 'raw_material').length;
    const consumables = props.ingredients.filter(item => item.item_type === 'consumable').length;
    const incompleteMaterials = props.ingredients.filter(item => !item.purchase_format_name || !Number(item.purchase_format_qty) || !Number(item.purchase_format_price)).length;
    const incompleteProducts = props.varieties.filter(item => !item.recipes?.length || !item.sale_prices?.length).length;
    return { rawMaterials, consumables, incompleteMaterials, incompleteProducts };
  }, [props.ingredients, props.varieties]);

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
    </div>
    <div className="catalogue-help">{tab === 'products' ? 'Définissez ici les familles, recettes, rendements et prix de vente.' : "Définissez ici les unités, formats d’achat, prix, seuils et catégories. Les quantités restent suivies dans Stocks."}</div>
    <div className="catalogue-embedded">
      {tab === 'products'
        ? <Varieties {...props} />
        : <Ingredients {...props} />}
    </div>
  </div>;
}
