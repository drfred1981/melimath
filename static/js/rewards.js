// MeliMath - Systeme de recompense et encouragement
// Auto-contenu: expose window.Rewards et persiste dans localStorage.
(function () {
  "use strict";

  const STORAGE_KEY = "melimath.rewards.v1";
  const LEVEL_STEP = 50; // XP pour passer au niveau 1 (progression quadratique apres)
  const XP_CORRECT = 10;
  const XP_STREAK_BONUS = 2; // par unite de streak au-dela de 2

  const ENCOURAGEMENTS_OK = [
    "Bravo ! 🎉", "Super ! 🌟", "Genial ! 💫", "Tu deches ! 🔥",
    "Excellent ! ✨", "Continue comme ca ! 🚀", "Top ! 👏", "Magnifique ! 🌈",
    "Tu es en forme ! 💪", "Parfait ! ✅",
  ];
  const ENCOURAGEMENTS_KO = [
    "Presque ! 💡", "Essaie encore ! 🤔", "Tu vas y arriver ! 💪",
    "Ne lache pas ! ⭐", "Reflechis bien... 🧠", "On recommence ! 🔁",
    "Pas grave ! 😊", "La prochaine est la bonne ! ⚡",
  ];
  const STREAK_MESSAGES = {
    3: "3 a la suite ! 🔥",
    5: "En feu ! 🔥🔥",
    10: "Inarretable ! 🚀",
    15: "Champion ! 🏆",
    20: "Legende ! 👑",
  };
  const PERFECT_MESSAGES = [
    "Score parfait ! Incroyable ! 🏆",
    "100% ! Tu es un genie ! ✨",
    "Sans faute ! Bravo ! 🌟",
  ];

  const BADGES = [
    { id: "first_step",   label: "Premiers pas",    icon: "👣", desc: "Reussir sa premiere reponse" },
    { id: "streak_5",     label: "En feu",          icon: "🔥", desc: "5 bonnes reponses d'affilee" },
    { id: "streak_10",    label: "Inarretable",     icon: "🚀", desc: "10 bonnes reponses d'affilee" },
    { id: "streak_20",    label: "Legende",         icon: "👑", desc: "20 bonnes reponses d'affilee" },
    { id: "total_50",     label: "Bucheron",        icon: "🪵", desc: "50 bonnes reponses au total" },
    { id: "total_200",    label: "Marathonien",     icon: "🏃", desc: "200 bonnes reponses au total" },
    { id: "total_500",    label: "Virtuose",        icon: "🎖️", desc: "500 bonnes reponses au total" },
    { id: "explorer_3",   label: "Explorateur",     icon: "🧭", desc: "Essayer 3 modes differents" },
    { id: "explorer_all", label: "Encyclopediste",  icon: "📚", desc: "Essayer tous les modes" },
    { id: "perfect_10",   label: "Perfectionniste", icon: "💯", desc: "10/10 sur une session" },
    { id: "daily_3",      label: "Regulier",        icon: "📅", desc: "Jouer 3 jours de suite" },
    { id: "daily_7",      label: "Assidu",          icon: "🗓️", desc: "Jouer 7 jours de suite" },
    { id: "level_5",      label: "Niveau 5",        icon: "⭐", desc: "Atteindre le niveau 5" },
    { id: "level_10",     label: "Niveau 10",       icon: "🌠", desc: "Atteindre le niveau 10" },
  ];

  const DEFAULT_STATE = {
    xp: 0,
    level: 1,
    streak: 0,
    bestStreak: 0,
    totalCorrect: 0,
    totalAnswered: 0,
    badges: [],
    byMode: {},
    dailyStreak: 0,
    lastPlayDate: null,
    sessionCorrect: 0,
    sessionTotal: 0,
    sessionMode: null,
  };

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      return Object.assign(structuredClone(DEFAULT_STATE), parsed);
    } catch (e) {
      return structuredClone(DEFAULT_STATE);
    }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function xpForLevel(level) {
    // Progression quadratique: niveau 1 -> 50, niveau 2 -> 150, niveau 3 -> 300...
    return Math.round(LEVEL_STEP * level * (level + 1) / 2);
  }

  function levelFromXp(xp) {
    let lvl = 1;
    while (xp >= xpForLevel(lvl)) lvl++;
    return lvl;
  }

  function levelProgress() {
    const lvl = state.level;
    const min = lvl === 1 ? 0 : xpForLevel(lvl - 1);
    const max = xpForLevel(lvl);
    const pct = Math.max(0, Math.min(100, Math.round(((state.xp - min) / (max - min)) * 100)));
    return { min, max, pct };
  }

  function today() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function updateDailyStreak() {
    const t = today();
    if (state.lastPlayDate === t) return;
    if (state.lastPlayDate) {
      const prev = new Date(state.lastPlayDate);
      const now = new Date(t);
      const diffDays = Math.round((now - prev) / (1000 * 60 * 60 * 24));
      state.dailyStreak = diffDays === 1 ? state.dailyStreak + 1 : 1;
    } else {
      state.dailyStreak = 1;
    }
    state.lastPlayDate = t;
  }

  function awardBadge(id) {
    if (state.badges.includes(id)) return null;
    state.badges.push(id);
    const badge = BADGES.find(b => b.id === id);
    if (badge) showBadgeToast(badge);
    return badge;
  }

  function checkBadges() {
    if (state.totalCorrect >= 1) awardBadge("first_step");
    if (state.bestStreak >= 5) awardBadge("streak_5");
    if (state.bestStreak >= 10) awardBadge("streak_10");
    if (state.bestStreak >= 20) awardBadge("streak_20");
    if (state.totalCorrect >= 50) awardBadge("total_50");
    if (state.totalCorrect >= 200) awardBadge("total_200");
    if (state.totalCorrect >= 500) awardBadge("total_500");
    const modesUsed = Object.keys(state.byMode).length;
    if (modesUsed >= 3) awardBadge("explorer_3");
    if (modesUsed >= 13) awardBadge("explorer_all");
    if (state.dailyStreak >= 3) awardBadge("daily_3");
    if (state.dailyStreak >= 7) awardBadge("daily_7");
    if (state.level >= 5) awardBadge("level_5");
    if (state.level >= 10) awardBadge("level_10");
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ===== HUD =====
  function ensureHud() {
    if (document.getElementById("rw-hud")) return;
    const hud = document.createElement("div");
    hud.id = "rw-hud";
    hud.innerHTML =
      '<div class="rw-level" title="Niveau">Niv. <span id="rw-level">1</span></div>' +
      '<div class="rw-xp-wrap" title="XP">' +
      '  <div class="rw-xp-bar"><div id="rw-xp-fill" class="rw-xp-fill"></div></div>' +
      '  <div class="rw-xp-text"><span id="rw-xp">0</span> / <span id="rw-xp-max">50</span> XP</div>' +
      '</div>' +
      '<div class="rw-streak" title="Serie actuelle">🔥 <span id="rw-streak">0</span></div>' +
      '<button class="rw-badges-btn" id="rw-badges-btn" title="Mes badges">🏅 <span id="rw-badges-count">0</span></button>';
    document.body.appendChild(hud);
    document.getElementById("rw-badges-btn").addEventListener("click", openBadgesModal);
    renderHud();
  }

  function renderHud() {
    const lvlEl = document.getElementById("rw-level");
    if (!lvlEl) return;
    lvlEl.textContent = state.level;
    const p = levelProgress();
    document.getElementById("rw-xp").textContent = state.xp;
    document.getElementById("rw-xp-max").textContent = p.max;
    document.getElementById("rw-xp-fill").style.width = p.pct + "%";
    document.getElementById("rw-streak").textContent = state.streak;
    document.getElementById("rw-badges-count").textContent = state.badges.length;
  }

  function flashToast(text, kind) {
    const el = document.createElement("div");
    el.className = "rw-toast rw-toast-" + (kind || "info");
    el.textContent = text;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("rw-toast-show"));
    setTimeout(() => {
      el.classList.remove("rw-toast-show");
      setTimeout(() => el.remove(), 300);
    }, 2200);
  }

  function showBadgeToast(badge) {
    const el = document.createElement("div");
    el.className = "rw-badge-popup";
    el.innerHTML =
      '<div class="rw-badge-popup-icon">' + badge.icon + '</div>' +
      '<div class="rw-badge-popup-title">Badge debloque !</div>' +
      '<div class="rw-badge-popup-label">' + badge.label + '</div>' +
      '<div class="rw-badge-popup-desc">' + badge.desc + '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("rw-badge-popup-show"));
    setTimeout(() => {
      el.classList.remove("rw-badge-popup-show");
      setTimeout(() => el.remove(), 400);
    }, 3400);
  }

  function burstConfetti(n) {
    const colors = ["#ffc107", "#28a745", "#0d6efd", "#e83e8c", "#fd7e14", "#6f42c1"];
    n = n || 24;
    for (let i = 0; i < n; i++) {
      const c = document.createElement("div");
      c.className = "rw-confetti";
      c.style.left = (45 + Math.random() * 10) + "%";
      c.style.background = colors[Math.floor(Math.random() * colors.length)];
      c.style.animationDelay = (Math.random() * 0.2) + "s";
      c.style.animationDuration = (0.9 + Math.random() * 0.8) + "s";
      c.style.transform = "translateX(" + (Math.random() * 200 - 100) + "px)";
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 2000);
    }
  }

  // ===== Modal badges =====
  function openBadgesModal() {
    if (document.getElementById("rw-badges-modal")) return;
    const bg = document.createElement("div");
    bg.id = "rw-badges-modal";
    bg.className = "rw-modal-bg";
    const unlocked = state.badges;
    const items = BADGES.map(b => {
      const got = unlocked.includes(b.id);
      return '<div class="rw-badge ' + (got ? "rw-badge-got" : "rw-badge-locked") + '">' +
        '<div class="rw-badge-icon">' + (got ? b.icon : "🔒") + '</div>' +
        '<div class="rw-badge-label">' + b.label + '</div>' +
        '<div class="rw-badge-desc">' + b.desc + '</div>' +
      '</div>';
    }).join("");
    const modes = Object.keys(state.byMode);
    const modeRows = modes.length === 0
      ? '<p class="text-muted">Pas encore de statistiques par mode.</p>'
      : modes.map(m => {
        const s = state.byMode[m];
        return '<div class="rw-mode-row"><span class="rw-mode-name">' + m + '</span>' +
          '<span class="rw-mode-stats">' + s.correct + ' / ' + s.total + '</span></div>';
      }).join("");
    bg.innerHTML =
      '<div class="rw-modal">' +
      '  <div class="rw-modal-header">' +
      '    <h3>🏅 Ma progression</h3>' +
      '    <button class="rw-modal-close" id="rw-modal-close">✕</button>' +
      '  </div>' +
      '  <div class="rw-modal-body">' +
      '    <div class="rw-stats-grid">' +
      '      <div class="rw-stat"><div class="rw-stat-value">Niv. ' + state.level + '</div><div class="rw-stat-label">Niveau</div></div>' +
      '      <div class="rw-stat"><div class="rw-stat-value">' + state.xp + '</div><div class="rw-stat-label">XP</div></div>' +
      '      <div class="rw-stat"><div class="rw-stat-value">' + state.bestStreak + '</div><div class="rw-stat-label">Meilleure serie</div></div>' +
      '      <div class="rw-stat"><div class="rw-stat-value">' + state.totalCorrect + '</div><div class="rw-stat-label">Bonnes reponses</div></div>' +
      '      <div class="rw-stat"><div class="rw-stat-value">' + state.dailyStreak + ' j</div><div class="rw-stat-label">Serie jours</div></div>' +
      '    </div>' +
      '    <h4 class="mt-3">Badges (' + unlocked.length + ' / ' + BADGES.length + ')</h4>' +
      '    <div class="rw-badges-grid">' + items + '</div>' +
      '    <h4 class="mt-3">Progression par mode</h4>' +
      '    <div class="rw-modes">' + modeRows + '</div>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(bg);
    document.getElementById("rw-modal-close").addEventListener("click", closeBadgesModal);
    bg.addEventListener("click", e => { if (e.target === bg) closeBadgesModal(); });
  }

  function closeBadgesModal() {
    const bg = document.getElementById("rw-badges-modal");
    if (bg) bg.remove();
  }

  // ===== API publique =====
  function onAnswer(mode, correct) {
    updateDailyStreak();
    state.totalAnswered++;
    state.sessionTotal++;
    if (state.sessionMode !== mode) {
      state.sessionMode = mode;
      state.sessionCorrect = correct ? 1 : 0;
      state.sessionTotal = 1;
    }
    if (!state.byMode[mode]) state.byMode[mode] = { correct: 0, total: 0 };
    state.byMode[mode].total++;

    if (correct) {
      state.streak++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      state.totalCorrect++;
      state.sessionCorrect++;
      state.byMode[mode].correct++;
      const bonus = state.streak >= 3 ? (state.streak - 2) * XP_STREAK_BONUS : 0;
      const gained = XP_CORRECT + bonus;
      state.xp += gained;
      const newLevel = levelFromXp(state.xp);
      const leveledUp = newLevel > state.level;
      state.level = newLevel;

      const msg = STREAK_MESSAGES[state.streak] || pick(ENCOURAGEMENTS_OK);
      flashToast(msg + " +" + gained + " XP", "ok");
      if (state.streak >= 5) burstConfetti(Math.min(state.streak, 30));
      if (leveledUp) {
        flashToast("Niveau " + state.level + " debloque ! 🎉", "level");
        burstConfetti(60);
      }
      if (state.sessionTotal === 10 && state.sessionCorrect === 10) {
        awardBadge("perfect_10");
        flashToast(pick(PERFECT_MESSAGES), "level");
      }
    } else {
      state.streak = 0;
      flashToast(pick(ENCOURAGEMENTS_KO), "ko");
    }

    checkBadges();
    save();
    renderHud();
  }

  function resetSession(mode) {
    state.sessionMode = mode || null;
    state.sessionCorrect = 0;
    state.sessionTotal = 0;
    save();
  }

  function getState() { return structuredClone(state); }

  function init() {
    ensureHud();
    updateDailyStreak();
    state.level = levelFromXp(state.xp);
    checkBadges();
    save();
    renderHud();
  }

  // Expose
  window.Rewards = {
    init: init,
    onAnswer: onAnswer,
    resetSession: resetSession,
    openBadges: openBadgesModal,
    getState: getState,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
