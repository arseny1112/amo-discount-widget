window.MockData = {
  lead: {
    id: 123456,
    price: 15000,
    _embedded: { contacts: [{ id: 987654 }] }
  },

  contact: {
    id: 987654,
    name: "Иван Петров",
    custom_fields_values: [
      { field_id: 111, field_name: "Источник", values: [{ value: "Пешеход" }] }
    ]
  },

  promotions: [
    { id: 1, name: "Скидка 500 ₽ на первый заказ", type: "fixed", value: 500, description: "Фиксированная скидка", condition_enabled: false, is_active: true },
    { id: 2, name: "Скидка 10% на заказ", type: "percent", value: 10, description: "Процентная скидка", condition_enabled: false, is_active: true },
    { id: 3, name: "Сезонная скидка 15%", type: "percent", value: 15, description: "Сезонная акция", condition_enabled: false, is_active: true },
    { id: 4, name: "Промокод FIX1000 — скидка 1000 ₽", type: "fixed", value: 1000, description: "Промокод", condition_enabled: false, is_active: true },
    {
      id: 5,
      name: "Пешеходам скидка 7%",
      type: "conditional",
      discount_type: "percent",
      discount_value: 7,
      description: "Только для Пешеходов",
      condition_enabled: true,
      condition_field: "Источник",
      condition_value: "Пешеход",
      is_active: true
    }
  ]
};
