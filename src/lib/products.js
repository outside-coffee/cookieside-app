export const FAMILIES = ['Cookies', 'Brownies', 'Cinnamon rolls', 'Croissants', 'Cheesecakes', 'Autres'];

export const unitLabel = variety => variety?.unit_label || 'pièce';

export const batchYield = variety => Math.max(1, Number(variety?.batch_yield) || 28);
