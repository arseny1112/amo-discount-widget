define(['jquery'], function($) {

  const widget = {
    init: function() {
      const self = this;

      function formatMoney(v) {
        if (isNaN(v) || v === null) return '0 ₽';
        return Math.round(v).toLocaleString('ru-RU') + ' ₽';
      }

      function showLoader(show) {
        $('#loader').toggleClass('active', show);
      }

      function setStatus(msg, isError) {
        $('#status').text(msg || '').toggleClass('error', !!isError);
      }

      async function apiGetLead(leadId) {
        const res = await AMOCRM.ajax.get(`/api/v4/leads/${leadId}?with=contacts`);
        return res;
      }

      async function apiGetContact(contactId) {
        const res = await AMOCRM.ajax.get(`/api/v4/contacts/${contactId}`);
        return res;
      }

      async function apiPatchLeadPrice(leadId, newPrice) {
        return AMOCRM.ajax.patch(`/api/v4/leads/${leadId}`, { price: Math.round(newPrice) });
      }

      async function apiCreateLeadNote(leadId, text) {
        const payload = [{
          entity_id: leadId,
          note_type: 'common',
          params: { text }
        }];
        return AMOCRM.ajax.post('/api/v4/leads/notes', payload);
      }

      async function apiGetParams() {
        return AMOCRM.data.current_widget.params || {};
      }

      async function main() {
        showLoader(true);
        setStatus('');

        const leadId = AMOCRM.data.current_card.id;
        if (!leadId) { setStatus('Не удалось определить ID сделки', true); showLoader(false); return; }

        let lead;
        try { lead = await apiGetLead(leadId); } 
        catch(err) { setStatus('Ошибка получения сделки: ' + err.message, true); showLoader(false); return; }

        const oldBudget = Number(lead.price || lead.sale || 0);

        let mainContact = null;
        if (lead._embedded?.contacts?.length) {
          const contactId = lead._embedded.contacts[0].id;
          mainContact = await apiGetContact(contactId);
        }

        function getContactFieldValue(contactObj, fieldName) {
          if (!contactObj?.custom_fields_values) return null;
          for (const f of contactObj.custom_fields_values) {
            if ((f.field_name === fieldName || f.name === fieldName || f.code === fieldName) && f.values?.[0]) {
              return f.values[0].value;
            }
          }
          return null;
        }

        const contactSource = getContactFieldValue(mainContact, 'Источник');

        const params = await apiGetParams();
        const promotions = params.promotions || [];

        showLoader(false);

        $('#deal-info').html(`Сделка #${leadId} <br>Текущий бюджет: <b>${formatMoney(oldBudget)}</b>`);
        if (mainContact) {
          const contactName = mainContact.name || (mainContact.first_name + ' ' + (mainContact.last_name||''));
          $('#contact-info').html(`Контакт: <b>${contactName}</b><br>Тип клиента: <b>${contactSource||'—'}</b>`);
        } else {
          $('#contact-info').html('<span class="error">У сделки не найден основной контакт. Некоторые акции могут быть недоступны.</span>');
        }

        function isPromoApplicable(promo) {
          if (promo.is_active === false) return false;
          if (promo.min_budget && oldBudget < promo.min_budget) return false;
          if (promo.condition_enabled) {
            const val = getContactFieldValue(mainContact, promo.condition_field || 'Источник');
            return val === promo.condition_value;
          }
          return true;
        }

        const available = promotions.filter(isPromoApplicable);
        const promoContainer = $('#promotions').empty();
        if (!available.length) {
          promoContainer.text('Доступных акций не настроено. Обратитесь к администратору.');
        } else {
          available.forEach(p => {
            const div = $(`<div class="promo"><b>${p.name}</b> <small>(${p.type})</small><div>${p.description||''}</div></div>`);
            div.on('click', () => selectPromo(p, div));
            promoContainer.append(div);
          });
        }

        let selected = null, calculatedDiscount = 0, newBudgetVal = oldBudget;

        function selectPromo(promo, elDiv) {
          $('.promo').removeClass('selected');
          elDiv.addClass('selected');
          selected = promo;
          calculateAndShow();
        }

        function calculateAndShow() {
          if (!selected) return;
          if (selected.type === 'fixed') calculatedDiscount = Number(selected.value||0);
          else if (selected.type === 'percent') calculatedDiscount = oldBudget * (Number(selected.value||0)/100);
          else if (selected.type === 'conditional') {
            const dt = selected.discount_type || 'fixed';
            const dv = selected.discount_value || selected.value || 0;
            calculatedDiscount = dt==='fixed'?Number(dv):oldBudget*(Number(dv)/100);
          }
          calculatedDiscount = Math.max(0, calculatedDiscount);
          newBudgetVal = Math.max(0, oldBudget - calculatedDiscount);
          $('#calculation').html(`
            <div>Название акции: <b>${selected.name}</b></div>
            <div>Старый бюджет: ${formatMoney(oldBudget)}</div>
            <div>Сумма скидки: ${formatMoney(calculatedDiscount)}</div>
            <div>Новый бюджет: <b>${formatMoney(newBudgetVal)}</b></div>
          `).show();
          $('#actions').show();
        }

        $('#cancel').on('click', () => location.reload());
        let saving = false;
        $('#apply').on('click', async () => {
          if (!selected || saving) return;
          saving = true; $('#apply').prop('disabled', true).text('Сохранение…'); setStatus('');

          try { await apiPatchLeadPrice(leadId, newBudgetVal); }
          catch(err) { setStatus('Не удалось обновить бюджет', true); saving=false; $('#apply').prop('disabled', false).text('Применить акцию'); return; }

          const noteText = `Акция применена: «${selected.name}». 
Сумма скидки: ${formatMoney(calculatedDiscount)}.
Бюджет до акции: ${formatMoney(oldBudget)}.
Бюджет после акции: ${formatMoney(newBudgetVal)}.
Тип клиента: ${contactSource||'—'}.`;

          try { await apiCreateLeadNote(leadId, noteText); }
          catch(err) { setStatus('Бюджет обновлён, но не удалось создать примечание', true); saving=false; $('#apply').prop('disabled', false).text('Применить акцию'); return; }

          setStatus('Акция успешно применена');
          $('#apply').text('Готово').prop('disabled', true);
          saving=false;
        });

      }

      main().catch(err => setStatus('Ошибка виджета: '+err.message, true));
    },

    settings: function() {
    }
  };

  return widget;
});
