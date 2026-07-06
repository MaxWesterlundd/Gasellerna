(function () {
  var historyEl = document.getElementById('history-content');
  var numberFmt = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });

  function setField(name, value) {
    var el = document.querySelector('[data-field="' + name + '"]');
    if (el) el.textContent = value;
  }

  function emptyState(message) {
    return '<div class="empty-state">' +
      '<p>' + message + '</p>' +
      '</div>';
  }

  function renderKpis(summary) {
    setField('ytd', summary.ytd && summary.ytd.totalKm ? numberFmt.format(summary.ytd.totalKm) + ' km' : '0 km');
    setField('ytd-year', summary.ytd && summary.ytd.year ? 'Sedan 1 januari ' + summary.ytd.year : ' ');

    if (summary.yearLeader && summary.yearLeader.name) {
      setField('leader-name', summary.yearLeader.name);
      setField('leader-km', numberFmt.format(summary.yearLeader.totalKm) + ' km i år');
    } else {
      setField('leader-name', 'Ingen ännu');
      setField('leader-km', 'Väntar på första löprundan');
    }

    if (summary.mostWeeklyWins && summary.mostWeeklyWins.name) {
      setField('wins-name', summary.mostWeeklyWins.name);
      setField('wins-count', summary.mostWeeklyWins.wins + (summary.mostWeeklyWins.wins === 1 ? ' veckoseger' : ' veckosegrar'));
    } else {
      setField('wins-name', 'Ingen ännu');
      setField('wins-count', 'Väntar på första veckan');
    }
  }

  function renderHistory(weeks) {
    if (!weeks || !weeks.length) {
      historyEl.innerHTML = emptyState('Ingen veckohistorik ännu. Så fort klubbens första löprundor är hämtade och sammanställda dyker tabell och diagram upp här.');
      return;
    }

    historyEl.innerHTML =
      '<div class="chart-card"><canvas id="week-chart" height="110"></canvas></div>' +
      '<div class="table-card">' +
        '<div class="table-scroll">' +
          '<table class="week-table">' +
            '<thead><tr><th>Vecka</th><th>Distans</th><th>Veckans vinnare</th></tr></thead>' +
            '<tbody>' + weeks.slice().reverse().map(rowHtml).join('') + '</tbody>' +
          '</table>' +
        '</div>' +
        '<div class="table-footer"><button class="link-more" type="button" data-expand>Visa hela året</button></div>' +
      '</div>';

    var expandBtn = historyEl.querySelector('[data-expand]');
    var scrollEl = historyEl.querySelector('.table-scroll');
    if (expandBtn && scrollEl) {
      expandBtn.addEventListener('click', function () {
        var expanded = scrollEl.classList.toggle('is-expanded');
        expandBtn.textContent = expanded ? 'Visa senaste veckorna' : 'Visa hela året';
      });
    }

    drawChart(weeks);
  }

  function rowHtml(week) {
    var winnerCell = week.winner
      ? '<span class="winner-name">' + week.winner + '</span>' + (week.isPartial ? '<span class="winner-badge">pågår</span>' : '')
      : '<span class="text-soft">-</span>';
    return '<tr>' +
      '<td>' + week.weekLabel + '</td>' +
      '<td>' + numberFmt.format(week.totalKm) + ' km</td>' +
      '<td>' + winnerCell + '</td>' +
      '</tr>';
  }

  function drawChart(weeks) {
    if (typeof Chart === 'undefined') return;
    var styles = getComputedStyle(document.documentElement);
    var accentDeep = styles.getPropertyValue('--accent-deep').trim() || '#D97E2B';
    var accent = styles.getPropertyValue('--accent').trim() || '#E8933A';

    var ctx = document.getElementById('week-chart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: weeks.map(function (w) { return w.weekLabel; }),
        datasets: [{
          label: 'Km per vecka',
          data: weeks.map(function (w) { return w.totalKm; }),
          borderColor: accentDeep,
          backgroundColor: hexToRgba(accent, 0.16),
          pointBackgroundColor: accentDeep,
          pointBorderColor: accentDeep,
          pointRadius: 3.5,
          borderWidth: 2.5,
          tension: 0.35,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: function (tooltipCtx) {
                var week = weeks[tooltipCtx.dataIndex];
                return week && week.winner ? 'Vinnare: ' + week.winner : '';
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: function (value) { return value + ' km'; } }
          }
        }
      }
    });
  }

  function hexToRgba(hex, alpha) {
    var parsed = hex.replace('#', '');
    var r = parseInt(parsed.substring(0, 2), 16);
    var g = parseInt(parsed.substring(2, 4), 16);
    var b = parseInt(parsed.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  fetch('data/summary.json')
    .then(function (res) {
      if (!res.ok) throw new Error('summary fetch failed');
      return res.json();
    })
    .then(function (summary) {
      renderKpis(summary);
      renderHistory(summary.weeks);
    })
    .catch(function () {
      historyEl.innerHTML = emptyState('Kunde inte läsa in statistiken just nu. Prova att ladda om sidan om en stund.');
      setField('leader-name', '-');
      setField('wins-name', '-');
    });
})();
