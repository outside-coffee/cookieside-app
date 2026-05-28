import { supabase } from './supabase';

// ---- INGREDIENTS ----
export const ingredientsAPI = {
  async getAll() {
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .order('name');
    if (error) throw error;
    return data;
  },
  async upsert(ingredient) {
    const { data, error } = await supabase
      .from('ingredients')
      .upsert(ingredient, { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async updateStock(id, newQty) {
    const { data, error } = await supabase
      .from('ingredients')
      .update({ stock_qty: newQty, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async delete(id) {
    const { error } = await supabase.from('ingredients').delete().eq('id', id);
    if (error) throw error;
  },
  async addEntry(id, qty, notes = '') {
    const { data: ing, error: e1 } = await supabase
      .from('ingredients')
      .select('stock_qty, name')
      .eq('id', id)
      .single();
    if (e1) throw e1;
    const newQty = parseFloat((ing.stock_qty + qty).toFixed(2));
    await supabase.from('ingredients').update({ stock_qty: newQty }).eq('id', id);
    await supabase.from('stock_movements').insert({
      ingredient_id: id,
      ingredient_name: ing.name,
      movement_type: 'entry',
      qty,
      notes
    });
    return newQty;
  }
};

// ---- VARIETIES ----
export const varietiesAPI = {
  async getAll() {
    const { data, error } = await supabase
      .from('varieties')
      .select(`*, recipes(*, ingredients(*)), sale_prices(*)`)
      .eq('active', true)
      .order('name');
    if (error) throw error;
    return data;
  },
  async upsert(variety) {
    const { data, error } = await supabase
      .from('varieties')
      .upsert({ id: variety.id, name: variety.name, color: variety.color, active: variety.active }, { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async delete(id) {
    const { error } = await supabase.from('varieties').update({ active: false }).eq('id', id);
    if (error) throw error;
  },
  async upsertRecipe(varietyId, ingredientId, qtyPerCookie) {
    const { error } = await supabase
      .from('recipes')
      .upsert({ variety_id: varietyId, ingredient_id: ingredientId, qty_per_cookie: qtyPerCookie },
               { onConflict: 'variety_id,ingredient_id' });
    if (error) throw error;
  },
  async deleteRecipeIngredient(varietyId, ingredientId) {
    const { error } = await supabase
      .from('recipes')
      .delete()
      .eq('variety_id', varietyId)
      .eq('ingredient_id', ingredientId);
    if (error) throw error;
  },
  async upsertPrice(varietyId, canal, price) {
    const { error } = await supabase
      .from('sale_prices')
      .upsert({ variety_id: varietyId, canal, price, updated_at: new Date().toISOString() },
               { onConflict: 'variety_id,canal' });
    if (error) throw error;
  }
};

// ---- PRODUCTION ----
export const productionAPI = {
  async getAll() {
    const { data, error } = await supabase
      .from('production')
      .select('*')
      .order('produced_at', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  async create(entry, recipe, ingredients) {
    const { data: prod, error: e1 } = await supabase
      .from('production')
      .insert(entry)
      .select()
      .single();
    if (e1) throw e1;

    // Déduire les matières premières
    for (const r of recipe) {
      const ing = ingredients.find(i => i.id === r.ingredient_id);
      if (!ing) continue;
      const needed = r.qty_per_cookie * entry.qty;
      const newQty = Math.max(0, parseFloat((ing.stock_qty - needed).toFixed(2)));
      await supabase.from('ingredients').update({ stock_qty: newQty }).eq('id', ing.id);
      await supabase.from('stock_movements').insert({
        ingredient_id: ing.id,
        ingredient_name: ing.name,
        movement_type: 'production_use',
        qty: -needed,
        reference_id: prod.id,
        notes: `Production: ${entry.variety_name} x${entry.qty}`
      });
    }
    return prod;
  },
  async delete(id) {
    const { error } = await supabase.from('production').delete().eq('id', id);
    if (error) throw error;
  }
};

// ---- SALES ----
export const salesAPI = {
  async getAll() {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .order('sold_at', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  async create(sale) {
    const { data, error } = await supabase
      .from('sales')
      .insert(sale)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async markDelivered(id) {
    const { data, error } = await supabase
      .from('sales')
      .update({ status: 'Livré', delivered_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async markAllDelivered() {
    const { error } = await supabase
      .from('sales')
      .update({ status: 'Livré', delivered_at: new Date().toISOString() })
      .eq('status', 'Vendu');
    if (error) throw error;
  },
  async delete(id) {
    const { error } = await supabase.from('sales').delete().eq('id', id);
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
  const produced = production.filter(p => p.variety_id === varietyId).reduce((s, p) => s + p.qty, 0);
  const sold = sales.filter(s => s.variety_id === varietyId).reduce((s, v) => s + v.qty, 0);
  return produced - sold;
}
