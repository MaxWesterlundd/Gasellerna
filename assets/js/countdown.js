(function () {
  var container = document.getElementById('countdown-list');
  if (!container) return;

  function formatDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function unit(value, label) {
    return '<div class="countdown-unit"><span class="countdown-num">' + value + '</span>' +
      '<span class="countdown-label">' + label + '</span></div>';
  }

  function tick(el, target) {
    function update() {
      var diff = target.getTime() - Date.now();
      if (diff <= 0) {
        el.innerHTML = '<p class="countdown-elapsed">Loppet är igång.</p>';
        return;
      }
      var totalMinutes = Math.floor(diff / 60000);
      var days = Math.floor(totalMinutes / (60 * 24));
      var hours = Math.floor((totalMinutes % (60 * 24)) / 60);
      var minutes = totalMinutes % 60;
      el.innerHTML = unit(days, 'Dagar') + unit(hours, 'Timmar') + unit(minutes, 'Minuter');
    }
    update();
    return setInterval(update, 30000);
  }

  function render(events) {
    container.innerHTML = '';
    events.forEach(function (ev) {
      var card = document.createElement('div');
      card.className = 'countdown-card';
      card.innerHTML =
        '<p class="countdown-event">' + ev.name + '</p>' +
        '<p class="countdown-meta">' + ev.location + ' · ' + formatDate(ev.date) + '</p>' +
        '<div class="countdown-clock"></div>';
      container.appendChild(card);
      tick(card.querySelector('.countdown-clock'), new Date(ev.date));
    });
  }

  fetch('data/config.json')
    .then(function (res) {
      if (!res.ok) throw new Error('config fetch failed');
      return res.json();
    })
    .then(function (config) {
      if (config && Array.isArray(config.countdowns) && config.countdowns.length) {
        render(config.countdowns);
      } else {
        container.innerHTML = '<div class="empty-state"><p>Inga inplanerade lopp just nu.</p></div>';
      }
    })
    .catch(function () {
      container.innerHTML = '<div class="empty-state"><p>Kunde inte läsa in nedräkningarna just nu.</p></div>';
    });
})();
