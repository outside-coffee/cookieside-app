import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ordersAPI, computeCostPerCookie, getVarietyStockBreakdown } from '../lib/api';
import { unitLabel } from '../lib/products';
import { Modal, SectionHeader, SopGuide, LoadingScreen, EmptyState, VarietyDot } from '../components/UI';

const STATUS_META = {
  Vendu: { label:'À préparer', badge:'badge-sold', next:'Prête' },
  Prête: { label:'Prête', badge:'badge-b2c', next:'Livré' },
  Livré: { label:'Livrée', badge:'badge-delivered', next:'Payé' },
  Payé: { label:'Payée', badge:'badge-paid', next:null },
  Annulée: { label:'Annulée', badge:'badge-out', next:null },
};

const emptyLine = (formatId='') => ({ variety_id:'', format_id:formatId, qty:1, price:'' });

export default function Sales({ varieties, ingredients, production, sales, orders, formats = [], packagingFormats = [], customers = [], promoCodes = [], onRefresh, onNavigate, loading }) {
  const defaultFormatId = formats.find(f => f.is_default)?.id || formats[0]?.id || '';
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('all');
  const [invoiceOrder, setInvoiceOrder] = useState(null);
  const [monthlyInvoiceOpen, setMonthlyInvoiceOpen] = useState(false);
  const [monthlyInvoiceClient, setMonthlyInvoiceClient] = useState('');
  const [monthlyInvoiceMonth, setMonthlyInvoiceMonth] = useState(new Date().toISOString().slice(0,7));
  const [editingOrder, setEditingOrder] = useState(null);
  const [form, setForm] = useState({ customer_id:'', client:'', canal:'B2C', delivery_date:new Date().toISOString().split('T')[0], delivery_time:'', fulfillment_type:'delivery', notes:'', packaging_format_id:'', packaging_items:[], promo_code_id:'', promo_type:'', promo_value:'', promo_label:'', delivery_fee:'3.5', free_delivery:false, items:[emptyLine(defaultFormatId)] });

  const activeOrders = useMemo(() => orders.filter(order => order.status !== 'Annulée'), [orders]);
  const visibleOrders = useMemo(() => filter === 'all' ? activeOrders : activeOrders.filter(order => order.status === filter), [activeOrders, filter]);
  const totals = useMemo(() => ({
    ca:orders.filter(o=>o.status!=='Annulée').reduce((sum,o)=>sum+Number(o.total_amount||0),0),
    pending:orders.filter(o=>o.status==='Vendu').length,
    receivable:orders.filter(o=>o.status==='Livré').reduce((sum,o)=>sum+Number(o.total_amount||0),0),
  }), [orders]);

  const openModal = () => {
    setEditingOrder(null);
    setForm({ customer_id:'', client:'', canal:'B2C', delivery_date:new Date().toISOString().split('T')[0], delivery_time:'', fulfillment_type:'delivery', notes:'', packaging_format_id:'', packaging_items:[], promo_code_id:'', promo_type:'', promo_value:'', promo_label:'', delivery_fee:'3.5', free_delivery:false, items:[emptyLine(defaultFormatId)] });
    setShowModal(true);
  };

  const openEditModal = order => {
    setEditingOrder(order);
    setForm({
      customer_id:order.customer_id || '', client:order.client || '', canal:order.canal || 'B2C', delivery_date:order.delivery_date,
      delivery_time:order.delivery_time ? String(order.delivery_time).slice(0,5) : '',
      fulfillment_type:order.fulfillment_type || 'delivery',
      notes:order.notes || '',
      packaging_format_id:'',
      packaging_items:(order.order_packaging || []).map(item=>({ packaging_format_id:item.packaging_format_id, quantity:Number(item.quantity||0) })),
      promo_code_id:order.promo_code_id || '',
      promo_type:order.promo_type || '',
      promo_value:order.promo_value || '',
      promo_label:order.promo_label || '',
      delivery_fee:order.delivery_fee_base ?? order.delivery_fee ?? '3.5',
      free_delivery:Boolean(order.free_delivery),
      items:(order.sales || []).map(line => ({ variety_id:line.variety_id, format_id:line.format_id || defaultFormatId, qty:line.qty, price:line.price_per_unit })),
    });
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingOrder(null); };

  const chooseCustomer = customerId => {
    const customer=customers.find(item=>item.id===customerId);
    if (!customer) {
      setForm(current=>({...current,customer_id:'',client:'',canal:'B2C'}));
      return;
    }
    setForm(current=>({...current,customer_id:customer.id,client:customer.name,canal:customer.customer_type || current.canal}));
  };

  const promoIsEligible = promo => {
    const current=new Date().toISOString().slice(0,10);
    if (!promo?.active) return false;
    if (promo.starts_at && promo.starts_at>current) return false;
    if (promo.ends_at && promo.ends_at<current) return false;
    if (promo.channel && promo.channel!=='ALL' && promo.channel!==form.canal) return false;
    if (promo.max_uses!=null && Number(promo.used_count||0)>=Number(promo.max_uses) && editingOrder?.promo_code_id!==promo.id) return false;
    return true;
  };

  const availablePromoCodes = useMemo(
    () => promoCodes.filter(promo=>promo.id===editingOrder?.promo_code_id || promoIsEligible(promo)),
    [promoCodes, form.canal, editingOrder]
  );

  const choosePromoCode = promoCodeId => {
    const promo=promoCodes.find(item=>item.id===promoCodeId);
    if(!promo){
      setForm(current=>({...current,promo_code_id:''}));
      return;
    }
    setForm(current=>({
      ...current,
      promo_code_id:promo.id,
      promo_type:promo.promo_type,
      promo_value:promo.promo_type==='bogo'?'':String(promo.promo_value||0),
      promo_label:promo.code,
      free_delivery:Boolean(promo.free_delivery),
    }));
  };

  const updateLine = (index, patch) => setForm(current => ({ ...current, items:current.items.map((line,i)=>i===index?{...line,...patch}:line) }));
  const chooseProduct = (index, varietyId) => {
    const variety = varieties.find(v=>v.id===varietyId);
    const currentFormat = form.items[index]?.format_id || defaultFormatId;
    const suggested = variety?.sale_prices?.find(p=>p.canal===form.canal && p.format_id===currentFormat)?.price;
    updateLine(index, { variety_id:varietyId, format_id:currentFormat, price:suggested ?? '' });
  };

  const totalBoxCapacity = packagingItems => (packagingItems || []).reduce((sum,item)=>{
    const box=packagingFormats.find(format=>format.id===item.packaging_format_id);
    return sum+(Number(item.quantity||0)*Number(box?.capacity||0));
  },0);

  const flattenProductSlots = items => {
    const slots=[];
    (items || []).forEach(line=>{
      const qty=Math.max(1,Number(line.qty||1));
      for(let i=0;i<qty;i+=1) slots.push({...line,qty:1});
    });
    return slots;
  };

  const setBoxQuantity = (formatId, quantity) => {
    const nextQty=Math.max(0,Number(quantity||0));
    setForm(current=>{
      const currentItems=current.packaging_items || [];
      const nextPackaging=[
        ...currentItems.filter(item=>item.packaging_format_id!==formatId),
        ...(nextQty>0?[{packaging_format_id:formatId,quantity:nextQty}]:[])
      ];
      const targetSlots=totalBoxCapacity(nextPackaging);
      let slots=flattenProductSlots(current.items);
      if(targetSlots>0) {
        if(slots.length<targetSlots) slots=[...slots,...Array.from({length:targetSlots-slots.length},()=>emptyLine(defaultFormatId))];
        if(slots.length>targetSlots) slots=slots.slice(0,targetSlots);
      } else if(slots.length===0) {
        slots=[emptyLine(defaultFormatId)];
      }
      return {...current,packaging_items:nextPackaging,items:slots};
    });
  };

  const orderPreview = useMemo(() => {
    const base=form.items.reduce((acc,line) => {
      const variety=varieties.find(v=>v.id===line.variety_id);
      const format=formats.find(f=>f.id===line.format_id);
      const qty=Number(line.qty||0); const price=Number(line.price||0);
      const cost=variety?computeCostPerCookie(variety, format):0;
      acc.listSubtotal += qty*price;
      acc.cost += qty*cost;
      acc.units += qty;
      if(qty>0 && price>=0) {
        for(let i=0;i<qty;i+=1) acc.unitPrices.push(price);
      }
      return acc;
    }, {listSubtotal:0,cost:0,discount:0,unitPrices:[],units:0});

    const selectedBoxes=(form.packaging_items || [])
      .map(item=>({ ...item, box:packagingFormats.find(format=>format.id===item.packaging_format_id) }))
      .filter(item=>item.box && Number(item.quantity||0)>0);
    const packedUnits=selectedBoxes.reduce((sum,item)=>sum+(Number(item.quantity)*Number(item.box.capacity||0)),0);
    const boxSubtotal=selectedBoxes.reduce((sum,item)=>sum+(Number(item.quantity)*Number(item.box.sale_price||0)),0);
    const averageUnitPrice=base.units>0 ? base.listSubtotal/base.units : 0;
    const remainderUnits=Math.max(0,base.units-packedUnits);
    const bundleSubtotal=selectedBoxes.length
      ? boxSubtotal+(remainderUnits*averageUnitPrice)
      : base.listSubtotal;
    const scale=base.listSubtotal>0 ? bundleSubtotal/base.listSubtotal : 1;

    if(form.promo_type==='percent') {
      if(Number(form.promo_value||0)===30) {
        let roundedTotal;
        if(selectedBoxes.length) {
          const roundedBoxes=selectedBoxes.reduce((sum,item)=>{
            const roundedBoxPrice=Math.round((Number(item.box.sale_price||0)*0.7)*2)/2;
            return sum+(Number(item.quantity)*roundedBoxPrice);
          },0);
          const roundedRemainderUnit=Math.round((averageUnitPrice*0.7)*2)/2;
          roundedTotal=roundedBoxes+(remainderUnits*roundedRemainderUnit);
        } else {
          roundedTotal=form.items.reduce((sum,line)=>{
            const qty=Number(line.qty||0);
            const price=Number(line.price||0)*scale;
            const roundedUnit=Math.round((price*0.7)*2)/2;
            return sum+(qty*roundedUnit);
          },0);
        }
        base.discount=Math.min(bundleSubtotal,Math.max(0,bundleSubtotal-roundedTotal));
      } else {
        base.discount=Math.min(bundleSubtotal,bundleSubtotal*Number(form.promo_value||0)/100);
      }
    }
    if(form.promo_type==='fixed') base.discount=Math.min(bundleSubtotal,Number(form.promo_value||0));
    if(form.promo_type==='bogo') {
      const freeCount=Math.floor(base.unitPrices.length/2);
      base.discount=base.unitPrices.map(price=>price*scale).sort((a,b)=>a-b).slice(0,freeCount).reduce((sum,price)=>sum+price,0);
    }

    const productsTotal=Math.max(0,bundleSubtotal-base.discount);
    const deliveryBase=form.fulfillment_type==='pickup' ? 0 : Math.max(0,Number(form.delivery_fee||0));
    const deliveryCharged=form.fulfillment_type==='pickup' ? 0 : (form.free_delivery?0:deliveryBase);
    const boxCount=selectedBoxes.reduce((sum,item)=>sum+Number(item.quantity||0),0);

    return {
      subtotal:bundleSubtotal,
      listSubtotal:base.listSubtotal,
      bundleSaving:Math.max(0,base.listSubtotal-bundleSubtotal),
      discount:base.discount,
      productsTotal,
      deliveryBase,
      deliveryCharged,
      total:productsTotal+deliveryCharged,
      margin:productsTotal-base.cost+deliveryCharged-deliveryBase,
      units:base.units,
      selectedBoxes,
      packedUnits,
      boxCount,
      remainderUnits,
    };
  }, [form.items,form.promo_type,form.promo_value,form.delivery_fee,form.free_delivery,form.fulfillment_type,form.packaging_items,varieties,formats,packagingFormats]);

  const diagnoseItems = (items, excludedOrderId = null) => {
    const grouped = items.reduce((result, line) => {
      if (line.variety_id && Number(line.qty) > 0) {
        const formatId = line.format_id || defaultFormatId;
        const key = `${line.variety_id}::${formatId}`;
        if (!result[key]) result[key] = { variety_id:line.variety_id, format_id:formatId, qty:0 };
        result[key].qty += Number(line.qty);
      }
      return result;
    }, {});
    const products = [];
    const materialNeeds = {};
    let blocked = false;

    Object.values(grouped).forEach(({ variety_id: varietyId, format_id: formatId, qty: requested }) => {
      const variety = varieties.find(item => item.id === varietyId);
      const format = formats.find(item => item.id === formatId);
      if (!variety || !format) { blocked = true; return; }
      const produced = production.filter(row => row.variety_id === varietyId && row.format_id === formatId).reduce((sum, row) => sum + Number(row.qty || 0), 0);
      const delivered = sales.filter(row => row.variety_id === varietyId && row.format_id === formatId && ['Livré','Payé'].includes(row.status)).reduce((sum, row) => sum + Number(row.qty || 0), 0);
      const reservedByOthers = sales.filter(row => row.variety_id === varietyId && row.format_id === formatId && ['Vendu','Prête'].includes(row.status) && (!excludedOrderId || row.order_id !== excludedOrderId)).reduce((sum, row) => sum + Number(row.qty || 0), 0);
      const available = Math.max(0, produced - delivered - reservedByOthers);
      const toProduce = Math.max(0, requested - available);
      const invalidRecipe = toProduce > 0 && (!variety.recipes?.length || variety.recipes.some(recipe => !recipe.ingredient_id || Number(recipe.qty_per_cookie || 0) <= 0));
      if (invalidRecipe) blocked = true;
      if (toProduce > 0 && !invalidRecipe) variety.recipes.forEach(recipe => {
        materialNeeds[recipe.ingredient_id] = (materialNeeds[recipe.ingredient_id] || 0) + Number(recipe.qty_per_cookie) * Number(format.cost_factor || 1) * toProduce;
      });
      products.push({ variety, format, requested, available, toProduce, invalidRecipe });
    });

    const missingMaterials = Object.entries(materialNeeds).map(([ingredientId, needed]) => {
      const ingredient = ingredients.find(item => item.id === ingredientId);
      const available = Number(ingredient?.stock_qty || 0);
      return needed > available ? { ingredient, needed, available, missing:needed - available } : null;
    }).filter(Boolean);
    const productionRequired = products.some(item => item.toProduce > 0);
    const level = blocked ? 'blocked' : missingMaterials.length ? 'purchase' : productionRequired ? 'production' : 'available';
    return { level, products, missingMaterials, productionRequired };
  };

  const formAvailability = useMemo(() => diagnoseItems(form.items, editingOrder?.id), [form.items, varieties, ingredients, production, sales, editingOrder]);
  const availabilityMeta = {
    available:{ label:'Disponible', className:'badge-ok', detail:'La commande peut être préparée avec le stock fini disponible.' },
    production:{ label:'Production requise', className:'badge-pending', detail:'La commande est enregistrable et alimente automatiquement le plan de production.' },
    purchase:{ label:'Achat requis', className:'badge-low', detail:'La commande est enregistrable et ses matières manquantes apparaîtront dans Achats.' },
    blocked:{ label:'À corriger', className:'badge-out', detail:'Une recette est absente ou invalide : la commande peut être saisie, mais sa production restera bloquée.' },
  };


  const b2bClients = useMemo(() => [...new Set(
    orders.filter(order => order.canal === 'B2B' && order.client && order.status !== 'Annulée').map(order => order.client.trim())
  )].sort((a,b)=>a.localeCompare(b,'fr')), [orders]);

  const monthlyInvoiceOrders = useMemo(() => {
    if (!monthlyInvoiceClient || !monthlyInvoiceMonth) return [];
    return orders.filter(order =>
      order.canal === 'B2B' &&
      order.status !== 'Annulée' &&
      (order.client || '').trim() === monthlyInvoiceClient &&
      String(order.delivery_date || '').slice(0,7) === monthlyInvoiceMonth
    );
  }, [orders, monthlyInvoiceClient, monthlyInvoiceMonth]);

  const monthlyInvoiceLines = useMemo(() => {
    const grouped = {};
    monthlyInvoiceOrders.forEach(order => (order.sales || []).forEach(line => {
      const format = formats.find(f => f.id === line.format_id);
      const key = `${line.variety_name}::${format?.code || 'L'}::${Number(line.price_per_unit || 0).toFixed(3)}`;
      if (!grouped[key]) grouped[key] = {
        variety_name: line.variety_name,
        format_code: format?.code || 'L',
        weight_g: format?.weight_g || 100,
        qty: 0,
        price_per_unit: Number(line.price_per_unit || 0),
        total_amount: 0,
      };
      grouped[key].qty += Number(line.qty || 0);
      grouped[key].total_amount += Number(line.total_amount || 0);
    }));
    return Object.values(grouped);
  }, [monthlyInvoiceOrders, formats]);

  const monthlyInvoiceTotals = useMemo(() => ({
    total: monthlyInvoiceOrders.reduce((sum,order)=>sum+Number(order.total_amount||0),0),
    paid: monthlyInvoiceOrders.filter(order=>order.status==='Payé').reduce((sum,order)=>sum+Number(order.total_amount||0),0),
    due: monthlyInvoiceOrders.filter(order=>order.status!=='Payé').reduce((sum,order)=>sum+Number(order.total_amount||0),0),
  }), [monthlyInvoiceOrders]);

  const handleSave = async () => {
    const items=form.items.filter(line=>line.variety_id && Number(line.qty)>0 && line.price!=='');
    if (!form.delivery_date || items.length===0) return toast.error('Ajoutez au moins un produit valide');
    const boxCapacity=totalBoxCapacity(form.packaging_items || []);
    if (boxCapacity>0 && form.items.length!==boxCapacity) return toast.error('Le nombre de produits doit correspondre à la capacité des box');
    if (boxCapacity>0 && form.items.some(line=>!line.variety_id || line.price==='')) return toast.error('Sélectionnez un produit pour chaque emplacement de box');
    if (form.promo_code_id) {
      const selectedPromo=promoCodes.find(item=>item.id===form.promo_code_id);
      if (!selectedPromo || (selectedPromo.id!==editingOrder?.promo_code_id && !promoIsEligible(selectedPromo))) return toast.error('Ce code promo n’est plus utilisable');
    }
    setSaving(true);
    try {
      const payload={ ...form, items:items.map(line=>({ variety_id:line.variety_id, format_id:line.format_id || defaultFormatId, qty:Number(line.qty), price:Number(line.price) })) };
      if (editingOrder) await ordersAPI.update(editingOrder.id, payload);
      else await ordersAPI.create(payload);
      const diagnostic=diagnoseItems(items, editingOrder?.id);
      toast.success(editingOrder ? 'Commande mise à jour' : diagnostic.level==='available' ? 'Commande enregistrée et disponible' : 'Commande enregistrée · besoins ajoutés au flux opérationnel');
      closeModal(); onRefresh();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const advance = async order => {
    const next=STATUS_META[order.status]?.next; if(!next)return;
    if (next === 'Prête') {
      const diagnostic=diagnoseItems(order.sales || [], order.id);
      const missing=diagnostic.products.filter(item=>item.toProduce>0);
      if (missing.length) return toast.error(`Impossible de marquer prête : il manque ${missing.map(item=>`${item.toProduce} ${item.variety.name}`).join(', ')}`);
    }
    try { await ordersAPI.updateStatus(order,next); toast.success(`Commande marquée ${STATUS_META[next]?.label || next}`); onRefresh(); }
    catch(e){ toast.error(e.message); }
  };

  const cancelOrder = async order => {
    if (!window.confirm(`Annuler la commande INS-${String(order.order_number).padStart(4,'0')} ? Le stock réservé sera de nouveau disponible.`)) return;
    try { await ordersAPI.updateStatus(order,'Annulée'); toast.success('Commande annulée'); onRefresh(); }
    catch(e){ toast.error(e.message); }
  };

  if (loading) return <LoadingScreen />;
  return <div className="page-inner">
    <SectionHeader title="Commandes" subtitle={`${activeOrders.length} commande(s) active(s) · stock réservé automatiquement`}
      actions={[
        <button key="monthly" className="btn" onClick={()=>{ if(!monthlyInvoiceClient && b2bClients[0]) setMonthlyInvoiceClient(b2bClients[0]); setMonthlyInvoiceOpen(true); }}>Facture mensuelle B2B</button>,
        <button key="new" className="btn btn-primary" onClick={openModal}>+ Nouvelle commande</button>
      ]} />
    <SopGuide steps={[{title:'Saisir',detail:'Client, date et produits'},{title:'Préparer',detail:'Le stock est réservé'},{title:'Clôturer',detail:'Livrer puis encaisser'}]} actions={[<button key="production" className="btn btn-sm" onClick={()=>onNavigate('production')}>Voir la production →</button>]} />

    <div className="kpi-grid">
      <div className="kpi-card accent"><div className="kpi-label">CA commandes</div><div className="kpi-value">{totals.ca.toFixed(2)}</div><div className="kpi-sub">DT</div></div>
      <div className="kpi-card"><div className="kpi-label">À préparer</div><div className="kpi-value">{totals.pending}</div><div className="kpi-sub">commandes réservées</div></div>
      <div className="kpi-card success"><div className="kpi-label">À encaisser</div><div className="kpi-value">{totals.receivable.toFixed(2)}</div><div className="kpi-sub">DT livrés</div></div>
    </div>

    <div className="stock-legend"><span><i className="physical"/>Physique : produit en laboratoire</span><span><i className="reserved"/>Réservé : commandes à préparer</span><span><i className="available"/>Disponible : encore vendable</span></div>
    <div style={{display:'flex',gap:7,marginBottom:'1rem',flexWrap:'wrap'}}>
      {[['all','Toutes'],['Vendu','À préparer'],['Prête','Prêtes'],['Livré','Livrées'],['Payé','Payées']].map(([key,label])=><button key={key} className={`btn btn-sm ${filter===key?'btn-primary':''}`} onClick={()=>setFilter(key)}>{label}</button>)}
    </div>

    <div className="card"><div className="table-container">
      {visibleOrders.length===0 ? <EmptyState text="Aucune commande" /> : <table><thead><tr><th>N° / Livraison</th><th>Client</th><th>Produits</th><th style={{textAlign:'right'}}>Total</th><th>Statut</th><th></th></tr></thead>
      <tbody>{visibleOrders.map(order=>{const meta=STATUS_META[order.status]||STATUS_META.Vendu; return <tr key={order.id}>
        <td><strong>INS-{String(order.order_number).padStart(4,'0')}</strong><div className="form-hint">{order.delivery_date}{order.delivery_time?' · '+String(order.delivery_time).slice(0,5):''}</div><div style={{marginTop:4}}><span className="badge badge-b2b">{order.fulfillment_type==='pickup'?'Retrait':'Livraison'}</span></div></td>
        <td>{order.client||'—'}
          {order.customer_id&&(()=>{const customer=customers.find(c=>c.id===order.customer_id);return customer?.phone?<div className="form-hint">☎ {customer.phone}</div>:null;})()}
          {order.canal&&<div><span className={`badge badge-${order.canal.toLowerCase()}`}>{order.canal}</span></div>}
        </td>
        <td><div className="order-lines">{order.sales?.map(line=>{const v=varieties.find(x=>x.id===line.variety_id);return <span key={line.id}><VarietyDot color={v?.color||'#999'}/>{line.qty} × {line.variety_name} · {(formats.find(f=>f.id===line.format_id)?.code || 'L')}</span>})}</div>
          {order.packaging_format_id&&(()=>{const box=packagingFormats.find(item=>item.id===order.packaging_format_id);const units=(order.sales||[]).reduce((sum,line)=>sum+Number(line.qty||0),0);return box?<div style={{marginTop:6}}><span className="badge badge-b2b">{Math.ceil(units/Number(box.capacity||1))} × {box.name}</span></div>:null;})()}
          {(order.promo_type || Number(order.delivery_fee_base||0)>0) && <div style={{display:'flex',gap:5,marginTop:6,flexWrap:'wrap'}}>
            {order.promo_type && <span className="badge badge-b2c">{order.promo_type==='bogo'?'1 acheté = 1 offert':order.promo_type==='percent'?'-'+Number(order.promo_value||0)+'%':'-'+Number(order.discount_amount||0).toFixed(3)+' DT'}</span>}
            {Number(order.delivery_fee_base||0)>0 && <span className="badge badge-b2b">{order.free_delivery?'Livraison offerte':'Livraison '+Number(order.delivery_fee||0).toFixed(3)+' DT'}</span>}
            {Number(order.delivery_cost||0)>0 && <span className="badge badge-pending">Coût Inside {Number(order.delivery_cost||0).toFixed(3)} DT</span>}
          </div>}
          {order.status==='Vendu'&&(()=>{const availability=diagnoseItems(order.sales||[],order.id);const state=availabilityMeta[availability.level];return <span className={`badge ${state.className}`} style={{marginTop:6}}>{state.label}</span>;})()}</td>
        <td style={{textAlign:'right',fontWeight:700}}>{Number(order.total_amount||0).toFixed(3)} DT</td>
        <td><span className={`badge ${meta.badge}`}>{meta.label}</span></td>
        <td><div style={{display:'flex',gap:6,justifyContent:'flex-end',flexWrap:'wrap'}}>
          <button className="btn btn-sm" onClick={()=>setInvoiceOrder(order)}>Facture</button>
          <button className="btn btn-sm" onClick={()=>openEditModal(order)}>Modifier</button>
          {meta.next&&<button className="btn btn-sm" onClick={()=>advance(order)}>{meta.next==='Prête'?'Marquer prête':meta.next==='Livré'?(order.fulfillment_type==='pickup'?'Marquer retirée':'Livrer'):'Encaisser'}</button>}
          {['Vendu','Prête'].includes(order.status)&&<button className="btn btn-sm btn-danger" onClick={()=>cancelOrder(order)}>Annuler</button>}
        </div></td>
      </tr>})}</tbody></table>}
    </div></div>


    <Modal open={monthlyInvoiceOpen} onClose={()=>setMonthlyInvoiceOpen(false)} size="lg" title="Facture mensuelle B2B"
      footer={<>
        <button className="btn" onClick={()=>setMonthlyInvoiceOpen(false)}>Fermer</button>
        <button className="btn btn-primary" disabled={monthlyInvoiceOrders.length===0} onClick={()=>window.print()}>Imprimer / PDF</button>
      </>}>
      <div className="form-row form-row-2 no-print" style={{marginBottom:16}}>
        <div className="form-group">
          <label className="form-label">Client B2B</label>
          <select className="form-select" value={monthlyInvoiceClient} onChange={e=>setMonthlyInvoiceClient(e.target.value)}>
            <option value="">Choisir un client...</option>
            {b2bClients.map(client=><option key={client} value={client}>{client}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Mois</label>
          <input className="form-input" type="month" value={monthlyInvoiceMonth} onChange={e=>setMonthlyInvoiceMonth(e.target.value)} />
        </div>
      </div>

      {monthlyInvoiceClient && monthlyInvoiceOrders.length > 0 ? <div className="invoice-print">
        <div className="invoice-head"><img src="/inside-wordmark-blue.svg" alt="Inside"/><div><h1>FACTURE MENSUELLE</h1><strong>{monthlyInvoiceMonth}</strong></div></div>
        <div className="invoice-meta">
          <div><small>Émis par</small><strong>Inside</strong><span>Cookieside</span></div>
          <div><small>Facturé à</small><strong>{monthlyInvoiceClient}</strong><span>Canal B2B</span></div>
          <div><small>Période</small><strong>{new Date(monthlyInvoiceMonth+'-01T12:00:00').toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</strong><span>{monthlyInvoiceOrders.length} commande(s)</span></div>
        </div>
        <table className="invoice-table"><thead><tr><th>Produit</th><th>Quantité</th><th>Prix unitaire</th><th>Total</th></tr></thead>
          <tbody>{monthlyInvoiceLines.map((line,index)=><tr key={index}><td>{line.variety_name} · {line.format_code} {line.weight_g}g</td><td>{line.qty}</td><td>{line.price_per_unit.toFixed(3)} DT</td><td>{line.total_amount.toFixed(3)} DT</td></tr>)}</tbody>
        </table>
        <div className="invoice-total"><span>Total du mois</span><strong>{monthlyInvoiceTotals.total.toFixed(3)} DT</strong></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:10}}>
          <div className="card" style={{padding:12}}><small>Déjà encaissé</small><strong style={{display:'block',marginTop:4}}>{monthlyInvoiceTotals.paid.toFixed(3)} DT</strong></div>
          <div className="card" style={{padding:12}}><small>Reste à encaisser</small><strong style={{display:'block',marginTop:4}}>{monthlyInvoiceTotals.due.toFixed(3)} DT</strong></div>
        </div>
        <div className="invoice-notes">
          <small>Commandes incluses</small>
          <p>{monthlyInvoiceOrders.map(order=>`INS-${String(order.order_number).padStart(4,'0')} (${order.delivery_date})`).join(' · ')}</p>
        </div>
        <div className="invoice-footer">Merci pour votre confiance.</div>
      </div> : <div className="empty-inline">Aucune commande B2B non annulée pour ce client sur ce mois.</div>}
    </Modal>

    <Modal open={!!invoiceOrder} onClose={()=>setInvoiceOrder(null)} size="lg" title={`Facture INS-${String(invoiceOrder?.order_number || '').padStart(4,'0')}`}
      footer={<><button className="btn" onClick={()=>setInvoiceOrder(null)}>Fermer</button><button className="btn btn-primary" onClick={()=>window.print()}>Imprimer / PDF</button></>}>
      {invoiceOrder && <div className="invoice-print">
        <div className="invoice-head"><img src="/inside-wordmark-blue.svg" alt="Inside"/><div><h1>FACTURE</h1><strong>INS-{String(invoiceOrder.order_number).padStart(4,'0')}</strong></div></div>
        <div className="invoice-meta">
          <div><small>Émis par</small><strong>Inside</strong><span>Cookieside</span></div>
          <div><small>Facturé à</small><strong>{invoiceOrder.client || 'Client comptoir'}</strong><span>Canal {invoiceOrder.canal || '—'}</span></div>
          {invoiceOrder.order_packaging?.length>0&&<div><small>Conditionnement</small><strong>{invoiceOrder.order_packaging.map(item=>{const box=packagingFormats.find(format=>format.id===item.packaging_format_id);return box?`${item.quantity} × ${box.name}`:null;}).filter(Boolean).join(' + ')}</strong><span>{(invoiceOrder.sales||[]).reduce((sum,line)=>sum+Number(line.qty||0),0)} cookie(s)</span></div>}
          <div><small>Date</small><strong>{new Date(invoiceOrder.created_at || invoiceOrder.delivery_date).toLocaleDateString('fr-FR')}</strong><span>{invoiceOrder.fulfillment_type==='pickup'?'Retrait':'Livraison'} : {new Date(`${invoiceOrder.delivery_date}T12:00:00`).toLocaleDateString('fr-FR')}{invoiceOrder.delivery_time?' · '+String(invoiceOrder.delivery_time).slice(0,5):''}</span></div>
        </div>
        <table className="invoice-table"><thead><tr><th>Produit</th><th>Quantité</th><th>Prix unitaire</th><th>Total</th></tr></thead>
          <tbody>{invoiceOrder.sales?.map(line=><tr key={line.id}><td>{line.variety_name} · {(formats.find(f=>f.id===line.format_id)?.code || 'L')} {(formats.find(f=>f.id===line.format_id)?.weight_g || 100)}g</td><td>{line.qty}</td><td>{Number(line.price_per_unit||0).toFixed(3)} DT</td><td>{Number(line.total_amount||0).toFixed(3)} DT</td></tr>)}</tbody>
        </table>
        <div style={{marginLeft:'auto',maxWidth:320,marginTop:16}}>
          {Number(invoiceOrder.subtotal_amount||0)>0 && <div style={{display:'flex',justifyContent:'space-between',padding:'5px 8px'}}><span>Sous-total</span><strong>{Number(invoiceOrder.subtotal_amount||0).toFixed(3)} DT</strong></div>}
          {Number(invoiceOrder.discount_amount||0)>0 && <div style={{display:'flex',justifyContent:'space-between',padding:'5px 8px'}}><span>Remise{invoiceOrder.promo_label?' · '+invoiceOrder.promo_label:''}</span><strong>-{Number(invoiceOrder.discount_amount||0).toFixed(3)} DT</strong></div>}
          {invoiceOrder.fulfillment_type==='pickup'
  ? <div style={{display:'flex',justifyContent:'space-between',padding:'5px 8px'}}><span>Retrait</span><strong>0.000 DT</strong></div>
  : Number(invoiceOrder.delivery_fee_base||0)>0 && <div style={{display:'flex',justifyContent:'space-between',padding:'5px 8px'}}><span>Livraison</span><strong>{invoiceOrder.free_delivery?'Offerte':Number(invoiceOrder.delivery_fee||0).toFixed(3)+' DT'}</strong></div>}
        </div>
        <div className="invoice-total"><span>Total</span><strong>{Number(invoiceOrder.total_amount||0).toFixed(3)} DT</strong></div>
        {invoiceOrder.notes && <div className="invoice-notes"><small>Notes</small><p>{invoiceOrder.notes}</p></div>}
        <div className="invoice-footer">Merci pour votre confiance.</div>
      </div>}
    </Modal>

    <Modal open={showModal} onClose={closeModal} size="lg" title={editingOrder ? `Modifier INS-${String(editingOrder.order_number).padStart(4,'0')}` : 'Nouvelle commande multi-produits'} footer={<><button className="btn" onClick={closeModal}>Fermer</button><button className="btn btn-primary" disabled={saving} onClick={handleSave}>{saving?'Enregistrement...':editingOrder?'Enregistrer les modifications':'Enregistrer la commande'}</button></>}>
      <div className="form-row form-row-2">
        <div className="form-group"><label className="form-label">Client enregistré</label><select className="form-select" value={form.customer_id} onChange={e=>chooseCustomer(e.target.value)}><option value="">Client ponctuel / saisie libre</option>{customers.filter(c=>c.active!==false).map(customer=><option key={customer.id} value={customer.id}>{customer.name} · {customer.customer_type}</option>)}</select></div>
        <div className="form-group"><label className="form-label">Nom client</label><input className="form-input" value={form.client} onChange={e=>setForm(f=>({...f,customer_id:'',client:e.target.value}))}/></div>
      </div>
      <div className="form-row form-row-3">
        <div className="form-group"><label className="form-label">Canal</label><select className="form-select" value={form.canal} onChange={e=>setForm(f=>f.promo_code_id?{...f,canal:e.target.value,promo_code_id:'',promo_type:'',promo_value:'',promo_label:'',free_delivery:false}:{...f,canal:e.target.value})}><option>B2C</option><option>B2B</option></select></div>
        <div className="form-group"><label className="form-label">Date de livraison *</label><input className="form-input" type="date" value={form.delivery_date} onChange={e=>setForm(f=>({...f,delivery_date:e.target.value}))}/></div>
        <div className="form-group"><label className="form-label">{form.fulfillment_type==='pickup'?'Heure de retrait':'Heure de livraison'}</label><input className="form-input" type="time" value={form.delivery_time} onChange={e=>setForm(f=>({...f,delivery_time:e.target.value}))}/></div>
      </div>
      <div className="form-group">
        <label className="form-label">Mode de remise</label>
        <select className="form-select" value={form.fulfillment_type} onChange={e=>setForm(f=>({...f,fulfillment_type:e.target.value,free_delivery:e.target.value==='pickup'?false:f.free_delivery}))}>
          <option value="delivery">Livraison</option>
          <option value="pickup">Retrait</option>
        </select>
        {form.fulfillment_type==='pickup'&&<div className="form-hint">Retrait sur place · aucun frais ni coût de livraison.</div>}
      </div>
      <div className="form-group">
        <label className="form-label">Box de la commande</label>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10}}>
          {packagingFormats.map(box=>{
            const qty=Number((form.packaging_items||[]).find(item=>item.packaging_format_id===box.id)?.quantity||0);
            return <div key={box.id} className="card" style={{padding:12}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}>
                <div><strong>{box.name}</strong><div className="form-hint">{box.capacity} cookies · {Number(box.sale_price||0).toFixed(0)} DT</div></div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <button type="button" className="btn btn-sm" disabled={qty===0} onClick={()=>setBoxQuantity(box.id,qty-1)}>−</button>
                  <strong style={{minWidth:18,textAlign:'center'}}>{qty}</strong>
                  <button type="button" className="btn btn-sm" onClick={()=>setBoxQuantity(box.id,qty+1)}>+</button>
                </div>
              </div>
            </div>;
          })}
        </div>
        {orderPreview.boxCount>0&&<div className="form-hint" style={{marginTop:8}}>
          {orderPreview.selectedBoxes.map(item=>`${item.quantity} × ${item.box.name}`).join(' + ')} · {orderPreview.packedUnits} emplacement(s) produit
        </div>}
      </div>
      <div className="order-editor"><div className="order-editor-head"><strong>{orderPreview.boxCount>0?`Produits à sélectionner · ${orderPreview.packedUnits} emplacement(s)`:'Produits'}</strong>{orderPreview.boxCount===0&&<button className="btn btn-sm" onClick={()=>setForm(f=>({...f,items:[...f.items,emptyLine(defaultFormatId)]}))}>+ Ajouter un produit</button>}</div>
      {form.items.map((line,index)=>{const v=varieties.find(x=>x.id===line.variety_id);const format=formats.find(f=>f.id===line.format_id);const stock=v&&line.format_id?getVarietyStockBreakdown(v.id,production,sales,line.format_id):null;return <div className="order-editor-line" key={index}>{orderPreview.boxCount>0&&<strong style={{minWidth:28}}>#{index+1}</strong>}<select className="form-select" value={line.variety_id} onChange={e=>chooseProduct(index,e.target.value)}><option value="">Choisir le cookie...</option>{varieties.filter(x=>x.product_status!=='draft').map(x=><option key={x.id} value={x.id}>{x.product_families?.name||x.family} · {x.name}</option>)}</select><select className="form-select" value={line.format_id||defaultFormatId} onChange={e=>{const formatId=e.target.value;const suggested=v?.sale_prices?.find(p=>p.canal===form.canal&&p.format_id===formatId)?.price;updateLine(index,{format_id:formatId,price:suggested??''});}}>{formats.map(f=><option key={f.id} value={f.id}>{f.code} · {f.weight_g}g{f.status==='test'?' · test':''}</option>)}</select>{orderPreview.boxCount===0&&<input className="form-input" type="number" min="1" value={line.qty} onChange={e=>updateLine(index,{qty:e.target.value})}/>}<input className="form-input" type="number" min="0" step="0.001" value={line.price} placeholder="Prix/u" onChange={e=>updateLine(index,{price:e.target.value})}/>{orderPreview.boxCount===0&&<button className="btn btn-icon btn-ghost" onClick={()=>setForm(f=>({...f,items:f.items.filter((_,i)=>i!==index)}))}>×</button>}{stock&&<small>{format?.code} {format?.weight_g}g · Physique {stock.physical} · Réservé {stock.reserved} · Disponible {stock.available} {unitLabel(v)}</small>}</div>})}</div>
      {form.items.some(line=>line.variety_id)&&<div className={`order-availability ${formAvailability.level}`}>
        <div><span className={`badge ${availabilityMeta[formAvailability.level].className}`}>{availabilityMeta[formAvailability.level].label}</span><strong>{availabilityMeta[formAvailability.level].detail}</strong></div>
        {formAvailability.products.filter(item=>item.toProduce>0).map(item=><small key={`${item.variety.id}:${item.format?.id || 'default'}`}>{item.variety.name} · {item.format?.code} {item.format?.weight_g}g : {item.toProduce} {unitLabel(item.variety)} à produire{item.invalidRecipe?' · recette à corriger':''}</small>)}
        {formAvailability.missingMaterials.map(item=><small key={item.ingredient?.id||item.ingredient?.name}>À acheter : {item.ingredient?.name||'matière inconnue'} · {item.missing.toFixed(1)} {item.ingredient?.unit||''}</small>)}
        {formAvailability.level!=='available'&&<div className="order-availability-actions"><button type="button" className="btn btn-sm" onClick={()=>{setShowModal(false);onNavigate('production');}}>Voir Production</button>{formAvailability.level==='purchase'&&<button type="button" className="btn btn-sm" onClick={()=>{setShowModal(false);onNavigate('achats');}}>Voir Achats</button>}</div>}
      </div>}
      <div className="card" style={{padding:14,marginTop:12,marginBottom:12}}>
        <div className="card-title" style={{marginBottom:10}}>Promotion & livraison</div>
        <div className="form-group" style={{marginBottom:10}}>
          <label className="form-label">Code promo géré</label>
          <select className="form-select" value={form.promo_code_id} onChange={e=>choosePromoCode(e.target.value)}>
            <option value="">Aucun code géré / promo manuelle</option>
            {availablePromoCodes.map(promo=><option key={promo.id} value={promo.id}>{promo.code} · {promo.name} · {promo.promo_type==='percent'?'-'+Number(promo.promo_value||0)+'%':promo.promo_type==='fixed'?'-'+Number(promo.promo_value||0).toFixed(2)+' DT':'1 acheté = 1 offert'}{promo.free_delivery?' + livraison offerte':''}</option>)}
          </select>
          {form.promo_code_id&&<div className="form-hint">Le code est lié à cette commande et son compteur d’utilisation est mis à jour automatiquement.</div>}
        </div>
        <div className="form-row form-row-3">
          <div className="form-group">
            <label className="form-label">Promotion</label>
            <select className="form-select" value={form.promo_type} onChange={e=>setForm(f=>({...f,promo_code_id:'',promo_type:e.target.value,promo_value:e.target.value==='bogo'?'':f.promo_value}))}>
              <option value="">Aucune</option>
              <option value="percent">Remise %</option>
              <option value="fixed">Remise fixe</option>
              <option value="bogo">1 acheté = 1 offert</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{form.promo_type==='percent'?'Valeur (%)':form.promo_type==='fixed'?'Montant remise (DT)':'Valeur promo'}</label>
            <input className="form-input" type="number" min="0" step="0.001" disabled={!['percent','fixed'].includes(form.promo_type)}
              value={form.promo_value} onChange={e=>setForm(f=>({...f,promo_code_id:'',promo_value:e.target.value}))} placeholder={form.promo_type==='percent'?'ex: 50':form.promo_type==='fixed'?'ex: 5':''}/>
          </div>
          <div className="form-group">
            <label className="form-label">Frais de livraison (DT)</label>
            <input className="form-input" type="number" min="0" step="0.001" disabled={form.fulfillment_type==='pickup'} value={form.fulfillment_type==='pickup'?'0':form.delivery_fee}
              onChange={e=>setForm(f=>({...f,delivery_fee:e.target.value}))} placeholder="0"/>
          </div>
        </div>
        <div className="form-row form-row-2" style={{marginTop:10}}>
          <div className="form-group">
            <label className="form-label">Nom / code promo</label>
            <input className="form-input" value={form.promo_label} onChange={e=>setForm(f=>({...f,promo_code_id:'',promo_label:e.target.value}))} placeholder="ex: LAUNCH50"/>
          </div>
          <label style={{display:'flex',alignItems:'center',gap:9,paddingTop:24,cursor:'pointer'}}>
            <input type="checkbox" disabled={form.fulfillment_type==='pickup'} checked={form.fulfillment_type==='pickup'?false:form.free_delivery} onChange={e=>setForm(f=>({...f,promo_code_id:'',free_delivery:e.target.checked}))}/>
            <span><strong>Livraison offerte</strong>{orderPreview.deliveryBase>0 && <small style={{display:'block',color:'var(--text-3)'}}>Avantage client : {orderPreview.deliveryBase.toFixed(3)} DT</small>}</span>
          </label>
        </div>
      </div>
      <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" rows="2" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
      <div className="order-total" style={{flexWrap:'wrap'}}>
        <span>Sous-total <strong>{orderPreview.subtotal.toFixed(3)} DT</strong></span>
        {orderPreview.bundleSaving>0&&<span>Avantage box <strong>-{orderPreview.bundleSaving.toFixed(3)} DT</strong></span>}
        {orderPreview.discount>0&&<span>Remise <strong>-{orderPreview.discount.toFixed(3)} DT</strong>{form.promo_type==='percent'&&Number(form.promo_value||0)===30&&<small style={{display:'block'}}>Prix après -30% arrondis au 0,5 DT</small>}</span>}
        {orderPreview.deliveryBase>0&&<span>Livraison <strong>{form.free_delivery?'Offerte':orderPreview.deliveryCharged.toFixed(3)+' DT'}</strong></span>}
        <span>Total <strong>{orderPreview.total.toFixed(3)} DT</strong></span>
        <span>Marge estimée après livraison <strong>{orderPreview.margin.toFixed(3)} DT</strong></span>
      </div>
    </Modal>
  </div>;
}

