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
  }
};

// ---- PURCHASE PLANS ----
export const purchasePlansAPI = {
  async getAll() {
    const { data, error } = await supabase.from('purchase_plans').select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  async create(plan) {
    const { data, error } = await supabase.from('purchase_plans').insert(plan).select().single();
    if (error) throw error;
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

