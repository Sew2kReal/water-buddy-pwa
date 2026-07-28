(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════
     Water Buddy v2 — Modern PWA
     Design System: modern-web-design-1.0.0 (Creative Portfolio + SaaS)
     ═══════════════════════════════════════════════════════════════ */

  const GOAL_ML = 2000;
  const DRINK_ML = 250;
  const GLASS_DAY = GOAL_ML / DRINK_ML;

  const CELEBRATE_MSGS = [
    '🎉 Chúc mừng! Bạn đã uống đủ 2L!',
    '🌟 Hoàn thành mục tiêu hôm nay!',
    '💪 Uống đủ nước rồi, tuyệt vời!',
    '✨ 2L hoàn tất, bạn thật tuyệt!',
    '🏆 Mục tiêu 2L hoàn thành!',
  ];

  const MONTHS_VI = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                     'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];

  /* ─── Storage ──────────────────────────────────────── */
  function load(k, def) {
    try {
      const v = localStorage.getItem('wb_' + k);
      if (v !== null) return JSON.parse(v);
    } catch (e) { /* ignore */ }
    if (def !== undefined) {
      localStorage.setItem('wb_' + k, JSON.stringify(def));
      return def;
    }
    return null;
  }
  function save(k, v) { localStorage.setItem('wb_' + k, JSON.stringify(v)); return v; }

  /* ─── DOM Helpers ──────────────────────────────────── */
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const today = () => new Date().toLocaleDateString('en-CA');
  const yesterday = () => new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
  const fmt = (d) => d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pad = (n) => n < 10 ? '0' + n : '' + n;
  const dateStr = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);

  function prevDay(ds) {
    const dt = new Date(ds + 'T00:00:00');
    dt.setDate(dt.getDate() - 1);
    return dt.toLocaleDateString('en-CA');
  }

  /* ─── State ────────────────────────────────────────── */
  const S = {
    today: '', drinks: [], streak: 0,
    sound: true, alarmActive: false, stopAlarm: null,
    calYear: 0, calMonth: 0, selectedDate: '',
  };

  function initState() {
    const t = today();
    S.today = t;
    S.drinks = load('d_' + t, []);
    S.sound = load('sound', true);
    const now = new Date();
    S.calYear = now.getFullYear();
    S.calMonth = now.getMonth() + 1;
    S.selectedDate = t;
  }

  /* ─── Data ─────────────────────────────────────────── */
  function getDayData(dateStr) {
    return load('d_' + dateStr, []);
  }

  function getDayProgress(dateStr) {
    const drinks = getDayData(dateStr);
    const ml = drinks.length * DRINK_ML;
    return { glasses: drinks.length, ml, pct: clamp(ml / GOAL_ML, 0, 1), drinks };
  }

  function getAllDatesWithData() {
    const map = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('wb_d_')) {
          const date = key.substring(4);
          const data = getDayData(date);
          if (data && data.length > 0) {
            const ml = data.length * DRINK_ML;
            map[date] = { glasses: data.length, ml, pct: clamp(ml / GOAL_ML, 0, 1) };
          }
        }
      }
    } catch (e) { /* ignore */ }
    return map;
  }

  /* ─── Streak (2+ consecutive full days) ───────────── */
  function calculateStreak() {
    let streak = 0;
    let date = today();
    while (true) {
      const p = getDayProgress(date);
      if (p.ml >= GOAL_ML) {
        streak++;
        date = prevDay(date);
      } else {
        break;
      }
    }
    return streak >= 2 ? streak : 0;
  }

  function recalcStreak() {
    S.streak = calculateStreak();
    save('streak', S.streak);
    return S.streak;
  }

  function prog() {
    return {
      glasses: S.drinks.length,
      ml: S.drinks.length * DRINK_ML,
      pct: clamp(S.drinks.length * DRINK_ML / GOAL_ML, 0, 1),
    };
  }

  /* ─── Drink ────────────────────────────────────────── */
  function addDrink() {
    const t = today();
    const entry = { time: fmt(new Date()), ts: Date.now() };
    S.drinks.push(entry);
    save('d_' + t, S.drinks);
    recalcStreak();

    if (S.sound) playDrinkSound();
    spawnDroplet();
    spawnBubbles();
    setWater(prog().pct);
    wobbleGlass();

    const p = prog();
    if (p.glasses > 0 && p.pct >= 1) {
      celebrate();
    } else {
      toast('💧', '+250ml! 💙');
    }
    render();
  }

  function deleteDrink(ts) {
    S.drinks = S.drinks.filter(d => d.ts !== ts);
    save('d_' + S.today, S.drinks);
    recalcStreak();
    render();
    setWater(prog().pct);
    toast('↩️', 'Đã xoá 1 cốc');
  }

  function clearDay() {
    if (S.drinks.length === 0) return;
    if (!confirm('Xoá tất cả cốc nước hôm nay?')) return;
    S.drinks = [];
    save('d_' + S.today, S.drinks);
    recalcStreak();
    setWater(0);
    render();
    toast('🗑️', 'Đã xoá hôm nay');
  }

  /* ─── Sounds ───────────────────────────────────────── */
  function playDrinkSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine';
        const t = ctx.currentTime + i * 0.08;
        o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        o.start(t); o.stop(t + 0.4);
      });
      const w = ctx.createOscillator();
      const wg = ctx.createGain();
      w.connect(wg); wg.connect(ctx.destination);
      w.type = 'triangle';
      w.frequency.setValueAtTime(300, ctx.currentTime);
      w.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.2);
      wg.gain.setValueAtTime(0.06, ctx.currentTime);
      wg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      w.start(ctx.currentTime); w.stop(ctx.currentTime + 0.25);
    } catch (e) { /* silent fail */ }
  }

  function playAlarm() {
    if (S.alarmActive) return;
    let ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch { return; }

    let stopped = false, count = 0, timer;
    function beep() {
      if (stopped || count >= 40) return;
      try {
        const now = ctx.currentTime;
        [820, 1040].forEach((f, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.type = 'sine';
          const t = now + i * 0.1;
          o.frequency.setValueAtTime(f, t);
          g.gain.setValueAtTime(0.15, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
          o.start(t); o.stop(t + 0.3);
        });
      } catch (e) { /* ignore */ }
      count++;
      timer = setTimeout(beep, 500);
    }
    beep();

    S.alarmActive = true;
    S.stopAlarm = () => {
      stopped = true;
      S.alarmActive = false;
      clearTimeout(timer);
      try { if (ctx.state !== 'closed') ctx.close(); } catch (e) { /* ignore */ }
    };
  }

  /* ─── Toast ────────────────────────────────────────── */
  function toast(icon, msg, dur) {
    const el = $('#toast');
    if (!el) return;
    $('#toastIcon').textContent = icon || '💧';
    $('#toastMsg').textContent = msg || '';
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), dur || 2200);
  }

  /* ─── Glass ────────────────────────────────────────── */
  function setWater(pct) {
    const w = $('#glassWater');
    if (w) w.style.height = clamp(pct * 100, 0, 100) + '%';

    const r = $('#ringCircle');
    if (r) {
      const circ = 339.292;
      r.style.strokeDashoffset = circ * (1 - clamp(pct, 0, 1));
    }

    const g = document.querySelector('.glass');
    if (g) g.classList.toggle('glow', pct >= 1);

    const hpb = $('#heroProgressBar');
    const hpt = $('#heroProgressTrack');
    if (hpb) hpb.style.width = clamp(pct * 100, 0, 100) + '%';
    if (hpt) hpt.setAttribute('aria-valuenow', Math.round(pct * GOAL_ML));
  }

  function spawnDroplet() {
    const body = $('#glassBody');
    if (!body) return;
    const water = $('#glassWater');
    if (!water) return;
    const bodyH = body.offsetHeight;
    const waterH = water.offsetHeight;
    const targetPct = waterH > 0 ? ((bodyH - waterH) / bodyH * 100) : 100;

    const d = document.createElement('div');
    d.className = 'droplet';
    d.style.setProperty('--drop-target', targetPct + '%');
    body.appendChild(d);
    setTimeout(() => { try { d.remove(); } catch {} }, 600);
    setTimeout(() => spawnRipples(), 400);
  }

  function spawnRipples() {
    const water = $('#glassWater');
    if (!water) return;
    for (let i = 0; i < 3; i++) {
      const r = document.createElement('div');
      r.className = 'ripple';
      r.style.animationDelay = (i * 0.12) + 's';
      water.appendChild(r);
      setTimeout(() => { try { r.remove(); } catch {} }, 1000);
    }
  }

  function wobbleGlass() {
    const g = document.querySelector('.glass');
    if (!g) return;
    g.classList.remove('wobble');
    void g.offsetWidth;
    g.classList.add('wobble');
    setTimeout(() => g.classList.remove('wobble'), 600);
  }

  function spawnBubbles() {
    const body = $('#glassBody');
    if (!body) return;
    for (let i = 0; i < 6; i++) {
      const b = document.createElement('div');
      b.className = 'bubble';
      const s = 3 + Math.random() * 5;
      b.style.cssText =
        'width:' + s + 'px;height:' + s + 'px;' +
        'left:' + (12 + Math.random() * 66) + '%;' +
        'bottom:' + (5 + Math.random() * 30) + '%;' +
        'animation-duration:' + (1.2 + Math.random() * 1.8) + 's;' +
        'animation-delay:' + (Math.random() * 0.4) + 's;';
      body.appendChild(b);
      setTimeout(() => { try { b.remove(); } catch {} }, 3000);
    }
  }

  function celebrate() {
    const colors = ['#ff6b6b','#ffd43b','#51cf66','#4facfe','#ff6bcb','#a66cff'];
    const body = document.body;
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      p.style.cssText =
        'left:' + (Math.random() * 100) + 'vw;' +
        'background:' + colors[Math.floor(Math.random() * colors.length)] + ';' +
        'width:' + (6 + Math.random() * 6) + 'px;' +
        'height:' + (6 + Math.random() * 6) + 'px;' +
        'border-radius:' + (Math.random() > 0.5 ? '50%' : '2px') + ';' +
        'animation-delay:' + (Math.random() * 0.8) + 's;';
      body.appendChild(p);
      setTimeout(() => { try { p.remove(); } catch {} }, 3500);
    }
    const msg = CELEBRATE_MSGS[Math.floor(Math.random() * CELEBRATE_MSGS.length)];
    toast('🎉', msg, 4000);
  }

  /* ─── Calendar ─────────────────────────────────────── */
  function renderCalendar() {
    const grid = $('#calGrid');
    const title = $('#calTitle');
    if (!grid || !title) return;

    const y = S.calYear, m = S.calMonth;
    title.textContent = MONTHS_VI[m - 1] + ', ' + y;

    const allData = getAllDatesWithData();
    const firstDay = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const daysInPrev = new Date(y, m - 1, 0).getDate();
    const t = today();

    let html = '';

    // Previous month trailing days
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      html += '<div class="cal-day other-month"><span class="cal-day-num">' + d + '</span></div>';
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = dateStr(y, m, d);
      const isToday = ds === t;
      const isSelected = ds === S.selectedDate;
      const dayData = allData[ds];
      let barClass = '';
      let hasData = false;

      if (dayData) {
        hasData = true;
        if (dayData.pct >= 1)        barClass = 'full';
        else if (dayData.pct >= 0.5) barClass = 'high';
        else if (dayData.pct > 0)    barClass = 'mid';
        else                         barClass = 'low';
      }

      let cls = 'cal-day';
      if (isToday) cls += ' today';
      if (isSelected) cls += ' selected';
      if (hasData) cls += ' has-data';

      html += '<div class="' + cls + '" data-date="' + ds + '" role="gridcell" tabindex="0">';
      html += '<span class="cal-day-num">' + d + '</span>';
      html += '<div class="cal-day-bar ' + barClass + '"></div>';
      html += '</div>';
    }

    // Next month leading days
    const totalCells = firstDay + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      html += '<div class="cal-day other-month"><span class="cal-day-num">' + d + '</span></div>';
    }

    grid.innerHTML = html;

    // Click + keyboard handlers
    grid.querySelectorAll('.cal-day:not(.other-month)').forEach(el => {
      el.addEventListener('click', function () {
        selectDay(this.dataset.date);
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectDay(this.dataset.date);
        }
      });
    });
  }

  function selectDay(ds) {
    if (!ds) return;
    S.selectedDate = ds;
    renderCalendar();
    renderDayDetail(ds);
    const dd = $('#dayDetail');
    if (dd) {
      dd.setAttribute('aria-label', 'Chi tiết ngày ' + ds);
      dd.style.display = '';
      setTimeout(() => dd.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    }
  }

  function renderDayDetail(dateStr) {
    const body = $('#dayDetailBody');
    const title = $('#dayDetailTitle');
    if (!body || !title) return;

    const p = getDayProgress(dateStr);
    const t = today();

    if (dateStr === t) {
      title.textContent = '📋 Hôm nay';
    } else {
      const dt = new Date(dateStr + 'T00:00:00');
      title.textContent = '📅 ' + dt.toLocaleDateString('vi-VN', {
        weekday: 'long', day: 'numeric', month: 'numeric',
      });
    }

    if (p.drinks.length === 0) {
      body.innerHTML = '<p class="day-detail-empty">Ngày này chưa có dữ liệu</p>';
      return;
    }

    let h = '<div class="day-detail-total">';
    h += '<span class="dd-value">' + p.ml + 'ml</span>';
    h += '<span class="dd-label">' + p.glasses + ' cốc nước</span>';
    if (p.pct >= 1) {
      h += '<div class="dd-full-badge">✓ Đủ nước</div>';
    }
    h += '</div><div class="dd-log">';

    p.drinks.slice().reverse().forEach(d => {
      h += '<div class="dd-log-item">';
      h += '<div class="dd-log-item-left"><span class="dd-log-dot"></span><span class="dd-log-time">' + d.time + '</span></div>';
      h += '<span class="dd-log-amount">' + DRINK_ML + 'ml 💧</span>';
      h += '</div>';
    });

    h += '</div>';
    body.innerHTML = h;
  }

  /* ─── Stats ────────────────────────────────────────── */
  function renderStats() {
    const allData = getAllDatesWithData();
    const dates = Object.keys(allData).sort();
    const totalDays = dates.length;
    const fullDays = dates.filter(d => allData[d].pct >= 1).length;
    const totalMl = dates.reduce((sum, d) => sum + allData[d].ml, 0);
    const avgMl = totalDays > 0 ? Math.round(totalMl / totalDays) : 0;

    let bestStreak = 0;
    if (dates.length > 0) {
      let cur = 0;
      for (let i = dates.length - 1; i >= 0; i--) {
        if (allData[dates[i]].pct >= 1) {
          cur++;
        } else {
          if (cur > bestStreak) bestStreak = cur;
          cur = 0;
        }
      }
      if (cur > bestStreak) bestStreak = cur;
    }

    $('#statsTotalDays').textContent = totalDays;
    $('#statsFullDays').textContent = fullDays;
    $('#statsAvgMl').textContent = avgMl;
    $('#statsBestStreak').textContent = bestStreak;

    // 7-day chart
    const chart = $('#chartBars');
    if (!chart) return;

    const dayLabels = ['T2','T3','T4','T5','T6','T7','CN'];
    const todayIdx = new Date().getDay();
    const orderedLabels = [];
    for (let i = 6; i >= 0; i--) {
      orderedLabels.push(dayLabels[(todayIdx - i + 7) % 7]);
    }

    let chartHtml = '';
    for (let i = 6; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const ds = dt.toLocaleDateString('en-CA');
      const dayProg = allData[ds] || { ml: 0, pct: 0 };
      const pct = dayProg.pct;
      const label = orderedLabels[6 - i];
      const height = Math.max(pct * 100, 2);

      chartHtml += '<div class="chart-bar-wrap">';
      chartHtml += '<div class="chart-bar' + (pct >= 1 ? ' full' : '') + '" style="height:' + height + '%"></div>';
      chartHtml += '<span class="chart-bar-label">' + label + '</span>';
      chartHtml += '</div>';
    }
    chart.innerHTML = chartHtml;
  }

  /* ─── Scroll Animations (Intersection Observer) ────── */
  function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -40px 0px' });

    $$('.section-animate').forEach(el => observer.observe(el));
  }

  /* ─── Render ───────────────────────────────────────── */
  function render() {
    const p = prog();
    const remaining = Math.max(0, GOAL_ML - p.ml);

    const hero = $('#heroAmount');
    if (hero) hero.innerHTML = p.ml + '<span class="hero-unit">ml</span>';

    const rem = $('#heroRemaining');
    if (rem) rem.textContent = remaining.toLocaleString('vi-VN');

    const gc = $('#glassCount');
    if (gc) gc.textContent = p.glasses;

    const gcs = $('#glassCountStat');
    if (gcs) gcs.textContent = p.glasses;

    const pp = $('#progressPercent');
    if (pp) pp.textContent = Math.round(p.pct * 100) + '%';

    const sv = $('#streakValue');
    if (sv) sv.textContent = S.streak;

    const log = $('#logBody');
    if (!log) return;

    if (S.drinks.length === 0) {
      log.innerHTML = '<p class="log-empty">Chưa uống cốc nào</p>';
    } else {
      log.innerHTML = S.drinks.slice().reverse().map(d =>
        '<div class="log-item" data-ts="' + d.ts + '">' +
          '<div class="log-item-left">' +
            '<span class="log-item-dot"></span>' +
            '<span class="log-item-time">' + d.time + '</span>' +
          '</div>' +
          '<div class="log-item-right">' +
            '<span class="log-item-info">250ml 💧</span>' +
            '<button class="log-item-del" data-ts="' + d.ts + '" aria-label="Xoá cốc nước này">✕</button>' +
          '</div>' +
        '</div>'
      ).join('');

      log.querySelectorAll('.log-item-del').forEach(btn => {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          const ts = Number(this.dataset.ts);
          const item = this.closest('.log-item');
          if (item) item.classList.add('removing');
          setTimeout(() => deleteDrink(ts), 300);
        });
      });
    }

    renderCalendar();
  }

  /* ─── Init ─────────────────────────────────────────── */
  function init() {
    initState();
    recalcStreak();

    // Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    // Scroll Animations
    initScrollAnimations();

    // Drink
    $('#drinkBtn').addEventListener('click', function () {
      addDrink();
      const w = $('#glassWater');
      if (w) { w.classList.add('splash'); setTimeout(() => w.classList.remove('splash'), 600); }
    });

    // Calendar nav
    $('#calPrev').addEventListener('click', () => {
      S.calMonth--;
      if (S.calMonth < 1) { S.calMonth = 12; S.calYear--; }
      renderCalendar();
    });

    $('#calNext').addEventListener('click', () => {
      S.calMonth++;
      if (S.calMonth > 12) { S.calMonth = 1; S.calYear++; }
      renderCalendar();
    });

    $('#calTodayBtn').addEventListener('click', function () {
      const now = new Date();
      S.calYear = now.getFullYear();
      S.calMonth = now.getMonth() + 1;
      S.selectedDate = today();
      renderCalendar();
      renderDayDetail(S.selectedDate);
      const dd = $('#dayDetail');
      if (dd) {
        dd.style.display = '';
        dd.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    // Day detail close
    $('#dayDetailClose').addEventListener('click', function () {
      const dd = $('#dayDetail');
      if (dd) dd.style.display = 'none';
    });

    // Clear day
    $('#clearDayBtn').addEventListener('click', clearDay);

    // Settings modal
    $('#settingsToggle').addEventListener('click', () => $('#settingsModal').classList.add('open'));
    $('#settingsModalClose').addEventListener('click', () => $('#settingsModal').classList.remove('open'));
    $('#settingsModal').addEventListener('click', function (e) {
      if (e.target === this) this.classList.remove('open');
    });

    // Sound toggle
    const so = $('#soundToggle');
    if (so) {
      so.checked = S.sound;
      so.addEventListener('change', function () { S.sound = this.checked; save('sound', S.sound); });
    }

    // Test sound
    $('#testBtn').addEventListener('click', function () {
      playAlarm();
      toast('🔊', 'Âm báo thức đang phát...');
    });

    // Stats modal
    $('#statsToggle').addEventListener('click', function () {
      renderStats();
      $('#statsModal').classList.add('open');
    });
    $('#statsModalClose').addEventListener('click', () => $('#statsModal').classList.remove('open'));
    $('#statsModal').addEventListener('click', function (e) {
      if (e.target === this) this.classList.remove('open');
    });

    // Initial render
    setWater(prog().pct);
    render();
    renderDayDetail(S.selectedDate);

    // Show visible items after init (for those above fold)
    requestAnimationFrame(() => {
      $$('.section-animate').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight) el.classList.add('visible');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
