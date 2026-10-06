import { supabase } from './supabase';

// ---- INGREDIENTS ----
export const ingredientsAPI = {
  async getAll() {
    const { data, error } = await supabase
      .from('ingredients').select('*').order('name');
    if (error) throw error;
    return data;
  },
  async upsert(ingredient) {
    const { data, error } = await supabase
      .from('ingredients')
      .upsert(ingredient, { onConflict: 'id' })
      .select().single();
    if (error) throw error;
    return data;
  },
  async delete(id) {
    const { error } = await supabase.from('ingredients').delete().eq('id', id);
    if (error) throw error;
  },
  async addEntry(id, qty, notes = '') {
    const { data: ing, error: e1 } = await supabase
      .from('ingredients').select('stock_qty, name').eq('id', id).single();
    if (e1) throw e1;
    const newQty = parseFloat((ing.stock_qty + qty).toFixed(2));
    await supabase.from('ingredients').update({ stock_qty: newQty }).eq('id', id);
    await supabase.from('stock_movements').insert({
      ingredient_id: id, ingredient_name: ing.name,
      movement_type: 'entry', qty, notes
    });
    return newQty;
  },
  // Correction manuelle (perte, casse, inventaire)
  async adjustStock(id, delta, reason, type = 'adjustment', movementDate = '') {
    const { data: ing, error: e1 } = await supabase
      .from('ingredients').select('stock_qty, name').eq('id', id).single();
    if (e1) throw e1;
    const newQty = Math.max(0, parseFloat((ing.stock_qty + delta).toFixed(2)));
    await supabase.from('ingredients').update({ stock_qty: newQty }).eq('id', id);
    const movement = {
      ingredient_id: id, ingredient_name: ing.name,
      movement_type: type, qty: delta, notes: reason
    };
    if (movementDate) movement.created_at = `${movementDate}T12:00:00`;
    const { error: movementError } = await supabase.from('stock_movements').insert(movement);
    if (movementError) throw movementError;
    return newQty;
  },
  async receivePurchase(receipt) {
    const { data, error } = await supabase.rpc('receive_stock_purchase', {
      p_ingredient_id:receipt.ingredientId,
      p_format_name:receipt.formatName,
      p_format_qty:Number(receipt.formatQty),
      p_format_price:Number(receipt.formatPrice),
      p_format_count:Number(receipt.formatCount),
      p_supplier:receipt.supplier?.trim() || null,
      p_received_at:receipt.receivedAt,
      p_payment_status:receipt.paymentStatus,
      p_notes:receipt.notes?.trim() || null,
      p_purchase_plan_item_id:receipt.purchasePlanItemId || null,
      p_supplier_id:receipt.supplierId || null
    });
    if (error) throw error;
    return data;
  },
  async getPurchaseHistory(ingredientId) {
    const { data, error } = await supabase
      .from('ingredient_purchase_history')
      .select('*')
      .eq('ingredient_id', ingredientId)
      .order('changed_at', { ascending:false });
    if (error) throw error;
    return data;
  }
};

// ---- VARIETIES ----
export const varietiesAPI = {
  async getAll() {
    const { data, error } = await supabase
      .from('varieties')
      .select(`*, product_families(*), recipes(*, ingredients(*)), sale_prices(*)`)
      .eq('active', true).order('name');
    if (error) throw error;
    return data;
  },
  async upsert(variety) {
    const { data, error } = await supabase
      .from('varieties')
      .upsert({ id: variety.id, name: variety.name, color: variety.color, active: variety.active,
        family: variety.family, family_id: variety.family_id || null,
        product_status: variety.product_status || 'active', min_stock: variety.min_stock || 0,
        shelf_life_days: variety.shelf_life_days || null,
        unit_label: variety.unit_label, batch_yield: variety.batch_yield }, { onConflict: 'id' })
      .select().single();
    if (error) throw error;
    return data;
  },
  async delete(id) {
    const { error } = await supabase.from('varieties').update({ active: false }).eq('id', id);
    if (error) throw error;
  },
  async activate(id) {
    const { error } = await supabase.from('varieties').update({ active: true }).eq('id', id);
    if (error) throw error;
  },
  async getAllInactive() {
    const { data, error } = await supabase
      .from('varieties')
      .select(`*, product_families(*), recipes(*, ingredients(*)), sale_prices(*)`)
      .eq('active', false).order('name');
    if (error) throw error;
    return data;
  },
  // qty_per_cookie is retained in the database for compatibility. It now means
  // ingredient quantity per unit sold (cookie, brownie, portion, etc.).
  async upsertRecipe(varietyId, ingredientId, qtyPerUnit) {
    const { error } = await supabase.from('recipes')
      .upsert({ variety_id: varietyId, ingredient_id: ingredientId, qty_per_cookie: qtyPerUnit },
               { onConflict: 'variety_id,ingredient_id' });
    if (error) throw error;
  },
  async deleteRecipeIngredient(varietyId, ingredientId) {
    const { error } = await supabase.from('recipes').delete()
      .eq('variety_id', varietyId).eq('ingredient_id', ingredientId);
    if (error) throw error;
  },
  async upsertPrice(varietyId, canal, price) {
    const { error } = await supabase.from('sale_prices')
      .upsert({ variety_id: varietyId, canal, price, updated_at: new Date().toISOString() },
               { onConflict: 'variety_id,canal' });
    if (error) throw error;
  }
};

// ---- PRODUCT FAMILIES ----
export const familiesAPI = {
  async getAll() {
    const { data, error } = await supabase.from('product_families').select('*')
      .eq('active', true).order('sort_order').order('name');
    if (error) throw error;
    return data;
  },
  async updateSop(id, sheet) {
    const { data, error } = await supabase.from('varieties').update({
      sop_hygiene_checks:sheet.hygieneChecks,
      sop_steps:sheet.steps,
      sop_bake_temperature:sheet.bakeTemperature || null,
      sop_bake_minutes:sheet.bakeMinutes || null,
      sop_notes:sheet.notes?.trim() || null,
      sop_updated_at:new Date().toISOString()
    }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async create(family) {
    const { data, error } = await supabase.from('product_families').insert(family).select().single();
    if (error) throw error;
    return data;
  },
};

// ---- PRODUCTION ----
export const productionAPI = {
  async getAll() {
    const { data, error } = await supabase
      .from('production').select('*')
      .order('produced_at', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  async create(entry) {
    const { data, error } = await supabase.rpc('create_production_batch', {
      p_variety_id: entry.variety_id, p_qty: entry.qty,
      p_produced_at: entry.produced_at, p_notes: entry.notes || null,
    });
    if (error) throw error;
    return data;
  },
  async delete(id) {
    const { error } = await supabase.rpc('delete_production_batch', { p_id: id });
    if (error) throw error;
  }
};

// ---- SALES ----
export const salesAPI = {
  async getAll() {
    const { data, error } = await supabase
      .from('sales').select('*')
      .order('sold_at', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  async create(sale) {
    const { data, error } = await supabase
      .from('sales').insert(sale).select().single();
    if (error) throw error;
    return data;
  },
  async updateStatus(id, status) {
    const updates = { status };
    if (status === 'Livré')  updates.delivered_at = new Date().toISOString();
    if (status === 'Payé')   updates.paid_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('sales').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async bulkUpdateStatus(fromStatus, toStatus) {
    const updates = { status: toStatus };
    if (toStatus === 'Livré') updates.delivered_at = new Date().toISOString();
    if (toStatus === 'Payé')  updates.paid_at = new Date().toISOString();
    const { error } = await supabase
      .from('sales').update(updates).eq('status', fromStatus);
    if (error) throw error;
  },
  async delete(id) {
    const { error } = await supabase.from('sales').delete().eq('id', id);
    if (error) throw error;
  }
};

export const ordersAPI = {
  async getAll() {
    const { data, error } = await supabase.from('orders').select('*, sales(*)')
      .order('delivery_date', { ascending:false }).order('created_at', { ascending:false });
    if (error) throw error;
    return data;
  },
  async create(order) {
    const { data, error } = await supabase.rpc('create_multi_product_order', {
      p_client:order.client || null, p_canal:order.canal || null,
      p_delivery_date:order.delivery_date, p_notes:order.notes || null, p_items:order.items,
    });
    if (error) throw error;
    return data;
  },
  async updateStatus(order, status) {
    const updates = { status };
    if (status === 'Livré') updates.delivered_at = new Date().toISOString();
    if (status === 'Payé') updates.paid_at = new Date().toISOString();
    const { error:e1 } = await supabase.from('orders').update(updates).eq('id', order.id);
    if (e1) throw e1;
    const { error:e2 } = await supabase.from('sales').update(updates).eq('order_id', order.id);
    if (e2) throw e2;
  },
};

// ---- STOCK MOVEMENTS ----
export const movementsAPI = {
  async getAll({ limit = 200, ingredientId = null } = {}) {
    let q = supabase.from('stock_movements').select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (ingredientId) q = q.eq('ingredient_id', ingredientId);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async update(movementId, changes) {
    const { data, error } = await supabase.rpc('update_stock_movement', {
      p_movement_id: movementId,
      p_qty: Number(changes.qty),
      p_movement_date: changes.date,
      p_notes: changes.notes?.trim() || null,
      p_purchase_total: changes.purchaseTotal === '' ? null : Number(changes.purchaseTotal),
      p_reason: changes.reason?.trim()
    });
    if (error) throw error;
    return data;
  },
  async delete(movementId, reason) {
    const { data, error } = await supabase.rpc('delete_stock_movement', {
      p_movement_id: movementId,
      p_reason: reason.trim()
    });
    if (error) throw error;
    return data;
  }
};

// ---- PURCHASE PLANS ----
export const purchasePlansAPI = {
  async getAll() {
    const { data, error } = await supabase.from('purchase_plans').select('*, purchase_plan_items(*)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  async create(plan) {
    const { lineItems = [], ...header } = plan;
    const { data, error } = await supabase.from('purchase_plans').insert(header).select().single();
    if (error) throw error;
    if (lineItems.length) {
      const { error:lineError } = await supabase.from('purchase_plan_items').insert(lineItems.map(item => ({
        purchase_plan_id:data.id, ingredient_id:item.id, ingredient_name:item.name, unit:item.unit,
        planned_qty:item.buyQty, estimated_cost:item.cost, format_name:item.formatName || null
      })));
      if (lineError) throw lineError;
    }
    return data;
  },
  async updateStatus(id, status) {
    const now = new Date().toISOString();
    const updates = { status, updated_at: now };
    if (status === 'ordered') updates.ordered_at = now;
    if (status === 'received') updates.received_at = now;
    const { data, error } = await supabase.from('purchase_plans').update(updates)
      .eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
};

// ---- INVENTORIES ----
export const inventoriesAPI = {
  async getAll() {
    const { data,error } = await supabase.from('inventory_sessions').select('*, inventory_counts(*)').order('inventory_date',{ascending:false});
    if (error) throw error; return data;
  },
  async create(ingredients,date) {
    const { data:session,error } = await supabase.from('inventory_sessions').insert({inventory_date:date}).select().single();
    if (error) throw error;
    const { error:countError } = await supabase.from('inventory_counts').insert(ingredients.map(item => ({inventory_session_id:session.id,ingredient_id:item.id,expected_qty:item.stock_qty,unit_cost:item.price_per_unit||0})));
    if (countError) throw countError; return session;
  },
  async saveCounts(sessionId,counts) {
    const rows=Object.entries(counts).filter(([,value])=>value!==''&&Number.isFinite(Number(value)));
    for(const [ingredientId,value] of rows){const{error}=await supabase.from('inventory_counts').update({counted_qty:Number(value)}).eq('inventory_session_id',sessionId).eq('ingredient_id',ingredientId);if(error)throw error;}
  },
  async validate(sessionId) { const {data,error}=await supabase.rpc('validate_inventory_session',{p_session_id:sessionId}); if(error) throw error; return data; }
};

// ---- SUPPLIERS ----
export const suppliersAPI = {
  async getAll() { const {data,error}=await supabase.from('suppliers').select('*, supplier_ingredients(ingredient_id, ingredients(name))').eq('active',true).order('name'); if(error) throw error; return data; },
  async save(supplier,ingredientIds=[]) {
    const {data,error}=await supabase.from('suppliers').upsert(supplier,{onConflict:'id'}).select().single(); if(error) throw error;
    await supabase.from('supplier_ingredients').delete().eq('supplier_id',data.id);
    if(ingredientIds.length){const {error:linkError}=await supabase.from('supplier_ingredients').insert(ingredientIds.map(ingredient_id=>({supplier_id:data.id,ingredient_id})));if(linkError)throw linkError;}
    return data;
  },
  async archive(id){const {error}=await supabase.from('suppliers').update({active:false,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;}
};

// ---- ATTACHMENTS ----
export const attachmentsAPI = {
  async upload(entityType,entityId,file) {
    const {data:{user}}=await supabase.auth.getUser(); if(!user) throw new Error('Authentification requise');
    if(file.size>10*1024*1024) throw new Error('Fichier limité à 10 Mo');
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'); const path=`${user.id}/${entityType}/${entityId}/${Date.now()}-${safe}`;
    const {error:uploadError}=await supabase.storage.from('inside-documents').upload(path,file,{contentType:file.type}); if(uploadError)throw uploadError;
    const {data,error}=await supabase.from('attachments').insert({entity_type:entityType,entity_id:entityId,file_name:file.name,mime_type:file.type,storage_path:path}).select().single();if(error)throw error;return data;
  },
  async getFor(entityType,entityId){const{data,error}=await supabase.from('attachments').select('*').eq('entity_type',entityType).eq('entity_id',entityId).order('created_at',{ascending:false});if(error)throw error;return data;},
  async signedUrl(path){const{data,error}=await supabase.storage.from('inside-documents').createSignedUrl(path,300);if(error)throw error;return data.signedUrl;}
};

export const auditAPI = {
  async getRecent(limit=30){const{data,error}=await supabase.from('audit_events').select('*').order('changed_at',{ascending:false}).limit(limit);if(error)throw error;return data;}
};

// ---- TEAM & ROLES ----
export const teamAPI = {
  async getCurrent() {
    const {data:{user}}=await supabase.auth.getUser();
    if(!user) throw new Error('Authentification requise');
    const {data,error}=await supabase.from('team_members').select('*').eq('user_id',user.id).single();
    if(error) throw error; return data;
  },
  async getAll() {
    const {data,error}=await supabase.from('team_members').select('*').order('created_at');
    if(error) throw error; return data;
  },
  async updateRole(userId,role) {
    const {data,error}=await supabase.from('team_members').update({role,updated_at:new Date().toISOString()}).eq('user_id',userId).select().single();
    if(error) throw error; return data;
  }
};

// ---- B2B MONTHLY SUBSCRIPTIONS ----
export const subscriptionsAPI = {
  async getAll() {
    const {data,error}=await supabase.from('b2b_subscriptions')
      .select('*, b2b_subscription_items(*), b2b_subscription_orders(*, orders(*, sales(*)))')
      .neq('status','archived').order('client');
    if(error) throw error; return data;
  },
  async save(subscription,items) {
    const {id,...values}=subscription;
    const query=id?supabase.from('b2b_subscriptions').update({...values,updated_at:new Date().toISOString()}).eq('id',id):supabase.from('b2b_subscriptions').insert(values);
    const {data,error}=await query.select().single(); if(error) throw error;
    if(id){const{error:deleteError}=await supabase.from('b2b_subscription_items').delete().eq('subscription_id',data.id);if(deleteError)throw deleteError;}
    const {error:itemError}=await supabase.from('b2b_subscription_items').insert(items.map(item=>({...item,subscription_id:data.id})));if(itemError)throw itemError;
    return data;
  },
  async setStatus(id,status){const{error}=await supabase.from('b2b_subscriptions').update({status,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;},
  async generateOrder(id,deliveryDate){const{data,error}=await supabase.rpc('generate_b2b_subscription_order',{p_subscription_id:id,p_delivery_date:deliveryDate});if(error)throw error;return data;}
};

// ---- FINANCE ----
export const financeAPI = {
  async getAll() {
    const { data, error } = await supabase.from('finance_entries').select('*')
      .is('deleted_at', null)
      .order('entry_date', { ascending:false }).order('created_at', { ascending:false });
    if (error) throw error;
    return data;
  },
  async create(entry) {
    const { data, error } = await supabase.from('finance_entries').insert(entry).select().single();
    if (error) throw error;
    return data;
  },
  async update(id, entry) {
    const { data, error } = await supabase.from('finance_entries')
      .update({ ...entry, updated_at:new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async archive(id) {
    const { error } = await supabase.from('finance_entries')
      .update({ deleted_at:new Date().toISOString(), updated_at:new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },
  async getSalePriceHistory(varietyId) {
    const { data, error } = await supabase.from('sale_price_history').select('*')
      .eq('variety_id', varietyId).order('changed_at', { ascending:false });
    if (error) throw error;
    return data;
  }
};

// ---- HELPERS ----
export function computeCostPerCookie(variety) {
  if (!variety.recipes) return 0;
  return variety.recipes.reduce((sum, r) => {
    const ing = r.ingredients;
    return sum + (r.qty_per_cookie * (ing?.price_per_unit || 0));
  }, 0);
}

export function getVarietyStock(varietyId, production, sales) {
  return getVarietyStockBreakdown(varietyId, production, sales).available;
}

export function getVarietyStockBreakdown(varietyId, production, sales) {
  const produced = production.filter(p => p.variety_id === varietyId).reduce((sum, row) => sum + Number(row.qty || 0), 0);
  const reservedStatuses = ['Vendu', 'Prête'];
  const reserved = sales.filter(s => s.variety_id === varietyId && reservedStatuses.includes(s.status)).reduce((sum, row) => sum + Number(row.qty || 0), 0);
  const deliveredStatuses = ['Livré', 'Payé'];
  const delivered = sales.filter(s => s.variety_id === varietyId && deliveredStatuses.includes(s.status)).reduce((sum, row) => sum + Number(row.qty || 0), 0);
  const physical = produced - delivered;
  return { physical, reserved, available: physical - reserved };
}

// Maximum sale units possible with the current ingredient stock.
export function maxBatchFromStock(variety, ingredients) {
  if (!variety.recipes?.length) return 0;
  const mins = variety.recipes.map(r => {
    const ing = ingredients.find(i => i.id === r.ingredient_id);
    const avail = ing?.stock_qty || 0;
    return r.qty_per_cookie > 0 ? Math.floor(avail / r.qty_per_cookie) : Infinity;
  });
  return Math.min(...mins);
}

// Ingredients needed for a target number of sale units.
export function missingIngredients(variety, ingredients, targetQty) {
  return variety.recipes
    .map(r => {
      const ing = ingredients.find(i => i.id === r.ingredient_id);
      const needed = r.qty_per_cookie * targetQty;
      const avail  = ing?.stock_qty || 0;
      if (needed > avail) return {
        name: ing?.name || '?', unit: ing?.unit || 'g',
        needed, avail, missing: parseFloat((needed - avail).toFixed(2))
      };
      return null;
    })
    .filter(Boolean);
}

