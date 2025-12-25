define([], function () {
  return function () {
    const isAmo = typeof AMOCRM !== 'undefined';
    const textarea = document.getElementById('json');
    const statusEl = document.getElementById('status');

    const preset = [
      { id: 1, name: "Скидка 500 ₽ на первый заказ", type: "fixed", value: 500, description: "Фиксированная скидка", condition_enabled: false, is_active: true },
      { id: 2, name: "Скидка 10% на заказ", type: "percent", value: 10, description: "", condition_enabled: false, is_active: true },
      { id: 3, name: "Сезонная скидка 15%", type: "percent", value: 15, description: "", condition_enabled: false, is_active: true },
      { id: 4, name: "Промокод FIX1000", type: "fixed", value: 1000, description: "", condition_enabled: false, is_active: true },
      { id: 5, name: "Пешеходам скидка 7%", type: "conditional", discount_type: "percent", discount_value: 7, description: "", condition_enabled: true, condition_field: "Источник", condition_value: "Пешеход", is_active: true }
    ];

    function savePromotions(widget, parsed) {
      widget.params = widget.params || {};
      widget.params.promotions = parsed;
      widget.save();
      statusEl.innerText = 'Сохранено в настройках виджета';
    }

    window.amodWidgetSettings = function () {
      const widget = this;
      const current = (widget.params && widget.params.promotions) ? widget.params.promotions : preset;
      textarea.value = JSON.stringify(current, null, 2);

      document.getElementById('save').onclick = () => {
        try {
          const parsed = JSON.parse(textarea.value);
          for (const p of parsed) {
            if (!p.name || !p.type) throw new Error('Каждая акция должна иметь name и type');
            if ((p.type === 'fixed' || p.type === 'percent') && (p.value === undefined || p.value === null)) throw new Error('Для fixed/percent нужен value');
            if (p.type === 'conditional' && (!p.condition_field || !p.condition_value)) throw new Error('Для conditional нужны condition_field и condition_value');
          }
          if (!isAmo) {
            localStorage.setItem('promotions', JSON.stringify(parsed));
            statusEl.innerText = 'Сохранено локально';
          } else {
            savePromotions(widget, parsed);
          }
        } catch (e) {
          statusEl.innerText = 'Ошибка: ' + e.message;
        }
      };
    };
  };
});
