function calculateDiscount({ promo, budget }) {
  let discount = 0;

  if (promo.type === 'fixed') {
    discount = Number(promo.value || 0);
  }

  if (promo.type === 'percent') {
    discount = budget * (Number(promo.value || 0) / 100);
  }

  if (promo.type === 'conditional') {
    const type = promo.discount_type;
    const value = promo.discount_value || 0;

    if (type === 'fixed') {
      discount = Number(value);
    } else {
      discount = budget * (Number(value) / 100);
    }
  }

  discount = Math.max(0, discount);
  const newBudget = Math.max(0, budget - discount);

  return {
    discount,
    newBudget
  };
}

function isPromoApplicable({ promo, budget, contactValue }) {
  if (promo.is_active === false) return false;

  if (promo.min_budget && budget < promo.min_budget) {
    return false;
  }

  if (promo.condition_enabled) {
    return contactValue === promo.condition_value;
  }

  return true;
}

window.PromoUtils = {
  calculateDiscount,
  isPromoApplicable
};

if (typeof define === 'function') {
  define([], function () {
    return {
      calculateDiscount,
      isPromoApplicable
    };
  });
}
