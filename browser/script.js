
(async function () {
  function formatMoney(v) {
    if (isNaN(v) || v === null) return '0 ₽';
    return Math.round(v).toLocaleString('ru-RU') + ' ₽';
  }

  function el(id) { return document.getElementById(id); }
  function setStatus(msg, isError) {
    const s = el('status');
    s.className = isError ? 'error' : '';
    s.innerText = msg || '';
  }
  function showLoader(show) { const L = el('loader'); if (!L) return; L.className = show ? '' : 'hidden'; }

  const isAmo = typeof AMOCRM !== 'undefined';
  const api = {
    async getLead(leadId) {
      if (!isAmo) {
        return window.MockData.lead;
      }
      const res = await AMOCRM.ajax.get(`/api/v4/leads/${leadId}?with=contacts`);
      return res;
    },

    async getContact(contactId) {
      if (!isAmo) return window.MockData.contact;
      const res = await AMOCRM.ajax.get(`/api/v4/contacts/${contactId}`);
      return res;
    },

    async patchLeadPrice(leadId, newPrice) {
      if (!isAmo) {
        window.MockData.lead.price = newPrice;
        return { success: true };
      }
      return AMOCRM.ajax.patch(`/api/v4/leads/${leadId}`, { price: Math.round(newPrice) });
    },

    async createLeadNote(leadId, text) {
      if (!isAmo) {
        console.log('note created (local):', text);
        return { success: true };
      }
      const payload = [{
        entity_id: leadId,
        note_type: 'common',
        params: { text }
      }];
      return AMOCRM.ajax.post('/api/v4/leads/notes', payload);
    },

    async getParams() {
      if (!isAmo) {
        const fromStorage = localStorage.getItem('promotions');
        return { promotions: fromStorage ? JSON.parse(fromStorage) : window.MockData.promotions };
      }
      try {
        return AMOCRM.data.current_widget.params || {};
      } catch (e) {
        return {};
      }
    },

    async saveParams(params) {
      if (!isAmo) {
        localStorage.setItem('promotions', JSON.stringify(params.promotions || []));
        return { success: true };
      }
      throw new Error('saveParams should be called from settings context (amoCRM)');
    }
  };

  async function main() {
    showLoader(true);
    setStatus('');
    let leadId = null;
    if (!isAmo) {
      leadId = window.MockData.lead.id;
    } else {
      leadId = AMOCRM?.data?.current_card?.id;
    }
    if (!leadId) {
      showLoader(false);
      setStatus('Не удалось определить ID сделки (lead_id).', true);
      return;
    }

    let lead;
    try {
      lead = await api.getLead(leadId);
    } catch (err) {
      showLoader(false);
      setStatus('Ошибка получения данных сделки: ' + (err.message || err), true);
      return;
    }

    const oldBudget = (lead && (lead.price || lead.sale || lead['price'])) ? Number(lead.price || lead.sale || lead['price']) : 0;

    let mainContactId = null;
    if (lead._embedded && Array.isArray(lead._embedded.contacts) && lead._embedded.contacts.length) {
      mainContactId = lead._embedded.contacts[0].id;
    }

    let contact = null;
    if (mainContactId) {
      try {
        contact = await api.getContact(mainContactId);
      } catch (err) {
      }
    }

    function getContactFieldValue(contactObj, fieldName) {
      if (!contactObj || !contactObj.custom_fields_values) return null;
      const arr = contactObj.custom_fields_values;
      for (const f of arr) {
        if ((f.field_name && f.field_name === fieldName) || (f.name && f.name === fieldName) || (f.code && f.code === fieldName)) {
          if (Array.isArray(f.values) && f.values[0]) return f.values[0].value;
        }
      }
      for (const f of arr) {
        if (Array.isArray(f.values) && f.values[0] && typeof f.values[0].value === 'string') {
          return f.values[0].value;
        }
      }
      return null;
    }

    const contactSource = getContactFieldValue(contact, 'Источник');

    const params = await api.getParams();
    const promotions = params.promotions || [];

    showLoader(false);
    el('deal-info').innerHTML = `Сделка #${leadId} <br>Текущий бюджет: <b>${formatMoney(oldBudget)}</b>`;
    if (contact) {
      el('contact-info').innerHTML = `Контакт: <b>${contact.name || (contact.first_name + ' ' + (contact.last_name||''))}</b><br>Тип клиента: <b>${contactSource || '—'}</b>`;
    } else {
      el('contact-info').innerHTML = `<span class="error">У сделки не найден основной контакт. Некоторые акции могут быть недоступны.</span>`;
    }

    function isPromoApplicable(promo) {
      if (promo.is_active === false) return false;
      if (promo.min_budget && Number.isFinite(promo.min_budget) && oldBudget < promo.min_budget) return false;

      if (promo.condition_enabled) {
        if (!contact) return false;
        const field = promo.condition_field || 'Источник';
        const val = promo.condition_value;
        const actual = getContactFieldValue(contact, field);
        return actual === val;
      }
      return true;
    }

    const available = promotions.filter(isPromoApplicable);

    const promoContainer = el('promotions');
    promoContainer.innerHTML = '';
    if (!available.length) {
      promoContainer.innerText = 'Доступных акций не настроено. Обратитесь к администратору.';
    } else {
      for (const p of available) {
        const div = document.createElement('div');
        div.className = 'promo';
        div.innerHTML = `<b>${p.name}</b> <small>(${p.type}${p.type==='conditional' ? '/conditional' : ''})</small><div>${p.description || ''}</div>`;
        div.onclick = () => selectPromo(p, div);
        promoContainer.appendChild(div);
      }
    }

    let selected = null;
    let calculatedDiscount = 0;
    let newBudgetVal = oldBudget;

    function selectPromo(promo, elDiv) {
      document.querySelectorAll('.promo').forEach(x => x.classList.remove('selected'));
      elDiv.classList.add('selected');
      selected = promo;
      calculateAndShow();
    }

    function calculateAndShow() {
      if (!selected) return;
      if (selected.type === 'fixed') {
        calculatedDiscount = Number(selected.value || 0);
      } else if (selected.type === 'percent') {
        calculatedDiscount = oldBudget * (Number(selected.value || 0) / 100);
      } else if (selected.type === 'conditional') {
        const dt = selected.discount_type || selected.type || 'fixed';
        const dv = selected.discount_value || selected.value || 0;
        if (dt === 'fixed') calculatedDiscount = Number(dv || 0);
        else calculatedDiscount = oldBudget * (Number(dv || 0) / 100);
      } else {
        calculatedDiscount = 0;
      }

      calculatedDiscount = Math.max(0, calculatedDiscount);
      newBudgetVal = Math.max(0, oldBudget - calculatedDiscount);

      el('calculation').style.display = 'block';
      el('actions').style.display = 'block';
      el('calculation').innerHTML = `
        <div>Название акции: <b>${selected.name}</b></div>
        <div>Старый бюджет: ${formatMoney(oldBudget)}</div>
        <div>Сумма скидки: ${formatMoney(calculatedDiscount)}</div>
        <div>Новый бюджет: <b>${formatMoney(newBudgetVal)}</b></div>
      `;
      setStatus('');
    }

    el('cancel').onclick = () => location.reload();

    let saving = false;
    el('apply').onclick = async () => {
      if (!selected || saving) return;
      saving = true;
      el('apply').disabled = true;
      el('apply').innerText = 'Сохранение…';
      setStatus('');
      try {
        await api.patchLeadPrice(leadId, newBudgetVal);
      } catch (err) {
        setStatus('Не удалось обновить бюджет сделки. Попробуйте ещё раз или обратитесь к администратору.', true);
        saving = false;
        el('apply').disabled = false;
        el('apply').innerText = 'Применить акцию';
        return;
      }

      const contactTypeText = contact ? (contactSource || '—') : '—';
      const noteText = `Акция применена: «${selected.name}». 
Сумма скидки: ${formatMoney(calculatedDiscount)}.
Бюджет до акции: ${formatMoney(oldBudget)}.
Бюджет после акции: ${formatMoney(newBudgetVal)}.
Тип клиента: ${contactTypeText}.`;

      try {
        await api.createLeadNote(leadId, noteText);
      } catch (err) {
        setStatus('Бюджет обновлён, но не удалось создать примечание. Обратитесь к администратору.', true);
        saving = false;
        el('apply').disabled = false;
        el('apply').innerText = 'Применить акцию';
        return;
      }

      setStatus('Акция успешно применена');
      el('apply').innerText = 'Готово';
      el('apply').disabled = true;
      saving = false;
    };

  }

  try {
    await main();
  } catch (err) {
    console.error('Widget error', err);
    setStatus('Виджет завершился с ошибкой: ' + (err.message || err), true);
  }

})();
