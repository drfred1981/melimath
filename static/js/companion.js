(function() {
    'use strict';

    var STORAGE_PREFIX = 'melimath_companion_';
    var HEALTH_MAX = 100;
    var GRACE_DAYS = 2;
    var POINTS_CORRECT = 4;
    var POINTS_WRONG = -1;
    var POINTS_PER_ABSENT_DAY = -20;

    // Événements aléatoires
    var STREAK_EVENT_THRESHOLD = 15;  // réponses correctes sans perte avant déclenchement possible
    var EVENT_CHANCE = 0.20;          // 20% par bonne réponse au-dessus du seuil
    var CURE_ANSWERS = 5;             // réponses correctes pour guérir
    var POINTS_CORRECT_CURE = 8;      // points doublés pendant la guérison

    var CHAR_NAMES = {
        default: 'Étoile',
        princesses: 'Flora',
        sirenes: 'Marina',
        espace: 'Cosmo',
        dinosaures: 'Rex',
        animaux: 'Mimi'
    };

    var REWARDS = ['⭐','🍎','🍪','🌈','💖','🎁','🍬','🎊','🍯','🌸'];

    var MESSAGES = {
        happy: [
            "Je suis heureux d'apprendre avec toi !",
            "On forme une super équipe !",
            "Tu es formidable, continue !"
        ],
        correct: [
            "Bravo ! Tu es trop fort(e) !",
            "Excellent ! Je suis fier de toi !",
            "Super réponse ! Continue comme ça !"
        ],
        wrong: [
            "Ne t'inquiète pas, la prochaine sera la bonne !",
            "Chaque erreur nous apprend quelque chose !",
            "Courage, je suis là avec toi !"
        ],
        sad: [
            "Tu me manques un peu... viens jouer !",
            "J'ai besoin de tes bonnes réponses !"
        ],
        sick: [
            "Je commence à me sentir mal... aide-moi !",
            "Ça fait longtemps... je perds de l'énergie.",
            "Reviens vite, j'ai besoin de toi !"
        ],
        critical: [
            "🚨 Je suis très malade, sauve-moi !",
            "Au secours ! J'ai besoin d'exercices !",
            "💔 Viens vite jouer, s'il te plaît !"
        ]
    };

    var EVENT_MESSAGES = {
        virus: [
            "🦠 {name} a attrapé un virus ! Réponds vite pour le soigner !",
            "🤒 Un virus attaque {name} ! Trouve l'antidote en répondant !"
        ],
        vol: [
            "💸 Un voleur a dérobé l'énergie de {name} ! Réponds vite pour récupérer !",
            "🦹 Quelqu'un a volé la force de {name} ! Défends-le vite !"
        ],
        cure: [
            "💊 Encore {n} bonne(s) réponse(s) pour soigner {name} !",
            "🛡️ Plus que {n} réponse(s) pour sauver {name} !"
        ],
        cured_virus: [
            "💊 {name} est guéri ! Tu as vaincu le virus, bravo !",
            "✨ Fantastique ! {name} se sent beaucoup mieux grâce à toi !"
        ],
        cured_vol: [
            "⚡ {name} a récupéré son énergie ! Tu es un vrai héros !",
            "🦸 Le voleur est parti ! {name} est sauvé grâce à toi !"
        ]
    };

    var currentTheme = 'default';
    var data = null;

    // État des événements (non persisté, réinitialisé à chaque session)
    var correctStreakNoPenalty = 0;
    var inCureMode = false;
    var cureAnswersLeft = 0;
    var lastEventType = null;

    function todayStr() {
        var d = new Date();
        return d.getFullYear() + '-'
            + String(d.getMonth() + 1).padStart(2, '0') + '-'
            + String(d.getDate()).padStart(2, '0');
    }

    function daysBetween(a, b) {
        return Math.floor((new Date(b) - new Date(a)) / 86400000);
    }

    function defaultData() {
        return { health: HEALTH_MAX, lastPlayedDate: todayStr(), totalCorrect: 0, totalWrong: 0 };
    }

    function loadData(theme) {
        try {
            var raw = localStorage.getItem(STORAGE_PREFIX + theme);
            if (raw) return JSON.parse(raw);
        } catch(e) {}
        return defaultData();
    }

    function saveData() {
        try { localStorage.setItem(STORAGE_PREFIX + currentTheme, JSON.stringify(data)); } catch(e) {}
    }

    function applyInactivityPenalty() {
        var today = todayStr();
        var days = daysBetween(data.lastPlayedDate, today);
        if (days > GRACE_DAYS) {
            data.health = Math.max(0, data.health + (days - GRACE_DAYS) * POINTS_PER_ABSENT_DAY);
            saveData();
        }
    }

    function getState() {
        var h = data.health;
        if (h >= 70) return 'happy';
        if (h >= 40) return 'sad';
        if (h >= 20) return 'sick';
        return 'critical';
    }

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function charName() {
        return CHAR_NAMES[currentTheme] || 'Ami';
    }

    function loadGracePeriod(callback) {
        var today = todayStr();
        try {
            var raw = localStorage.getItem('melimath_school_period');
            if (raw) {
                var obj = JSON.parse(raw);
                if (obj && obj.date === today) { callback(obj.grace_days); return; }
            }
        } catch(e) {}
        fetch('/api/school-period')
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(sp) {
                var gd = (sp && typeof sp.grace_days === 'number') ? sp.grace_days : 2;
                try { localStorage.setItem('melimath_school_period', JSON.stringify({date: today, grace_days: gd})); } catch(e) {}
                callback(gd);
            })
            .catch(function() { callback(2); });
    }

    function getMsgEl() { return document.getElementById('companionMsg'); }
    function getBarEl() { return document.getElementById('companionBar'); }
    function getWidget() { return document.getElementById('companionWidget'); }

    function buildWidget() {
        var container = document.getElementById('companion-container');
        if (!container) return;
        var name = charName();
        var state = getState();
        container.innerHTML =
            '<div class="companion-widget state-' + state + '" id="companionWidget">' +
                '<div class="companion-char">' +
                    '<div class="companion-svg-area" id="companionSvgArea">' +
                        '<div class="companion-loading">🌟</div>' +
                    '</div>' +
                '</div>' +
                '<div class="companion-info">' +
                    '<div class="companion-name">' + escHtml(name) + '</div>' +
                    '<div class="companion-health-wrap">' +
                        '<div class="companion-health-bar h-' + state + '" id="companionBar" style="width:' + data.health + '%"></div>' +
                    '</div>' +
                    '<div class="companion-message" id="companionMsg">' + escHtml(pick(MESSAGES[state])) + '</div>' +
                '</div>' +
            '</div>';
        loadSVG();
        if (inCureMode) updateCureBadge();
        if (state === 'sick' || state === 'critical') {
            setTimeout(showHealthAlert, 900);
        }
    }

    function escHtml(s) {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function loadSVG() {
        var area = document.getElementById('companionSvgArea');
        if (!area) return;
        fetch('/static/characters/' + currentTheme + '.svg')
            .then(function(r) { return r.ok ? r.text() : null; })
            .then(function(svg) {
                if (!svg) { area.innerHTML = '<div class="companion-loading">🌟</div>'; return; }
                area.innerHTML = svg;
            })
            .catch(function() { area.innerHTML = '<div class="companion-loading">🌟</div>'; });
    }

    function updateWidget() {
        var w = getWidget();
        if (!w) return;
        var state = getState();
        w.className = 'companion-widget state-' + state;
        var bar = getBarEl();
        if (bar) { bar.style.width = data.health + '%'; bar.className = 'companion-health-bar h-' + state; }
    }

    function showReward() {
        var w = getWidget();
        if (!w) return;
        var el = document.createElement('div');
        el.className = 'companion-reward';
        el.textContent = pick(REWARDS);
        w.appendChild(el);
        setTimeout(function() { if (el.parentNode) el.remove(); }, 1650);
    }

    function showHealthAlert() {
        var state = getState();
        if (state !== 'sick' && state !== 'critical') return;
        var existing = document.getElementById('companionAlert');
        if (existing) existing.remove();
        var el = document.createElement('div');
        el.id = 'companionAlert';
        el.className = 'companion-alert alert-' + state;
        el.innerHTML = '<span>' + escHtml(pick(MESSAGES[state])) + '</span><button onclick="var a=document.getElementById(\'companionAlert\');if(a)a.remove();" title="Fermer">✕</button>';
        document.body.appendChild(el);
        setTimeout(function() { if (el.parentNode) el.remove(); }, 6000);
    }

    function showEventAlert(type) {
        var existing = document.getElementById('companionAlert');
        if (existing) existing.remove();
        var msgs = EVENT_MESSAGES[type] || EVENT_MESSAGES.virus;
        var msg = pick(msgs).replace('{name}', charName());
        var el = document.createElement('div');
        el.id = 'companionAlert';
        el.className = 'companion-alert alert-event';
        el.innerHTML = '<span>' + escHtml(msg) + '</span><button onclick="var a=document.getElementById(\'companionAlert\');if(a)a.remove();" title="Fermer">✕</button>';
        document.body.appendChild(el);
        setTimeout(function() { if (el.parentNode) el.remove(); }, 8000);
    }

    function showEventCuredAlert() {
        var existing = document.getElementById('companionAlert');
        if (existing) existing.remove();
        var key = 'cured_' + (lastEventType || 'virus');
        var msgs = EVENT_MESSAGES[key] || EVENT_MESSAGES.cured_virus;
        var msg = pick(msgs).replace('{name}', charName());
        var el = document.createElement('div');
        el.id = 'companionAlert';
        el.className = 'companion-alert alert-cured';
        el.innerHTML = '<span>' + escHtml(msg) + '</span><button onclick="var a=document.getElementById(\'companionAlert\');if(a)a.remove();" title="Fermer">✕</button>';
        document.body.appendChild(el);
        setTimeout(function() { if (el.parentNode) el.remove(); }, 5000);
    }

    function updateCureBadge() {
        var w = getWidget();
        if (!w) return;
        var badge = document.getElementById('companionCureBadge');
        var icon = lastEventType === 'vol' ? '💸' : '🦠';
        var label = icon + ' ' + cureAnswersLeft + ' réponse' + (cureAnswersLeft > 1 ? 's' : '') + ' pour guérir';
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'companionCureBadge';
            badge.className = 'companion-cure-badge';
            w.appendChild(badge);
        }
        badge.textContent = label;
    }

    function removeCureBadge() {
        var badge = document.getElementById('companionCureBadge');
        if (badge) badge.remove();
    }

    function triggerRandomEvent() {
        lastEventType = Math.random() < 0.5 ? 'virus' : 'vol';
        data.health = Math.max(1, Math.floor(data.health * 0.5));
        correctStreakNoPenalty = 0;
        inCureMode = true;
        cureAnswersLeft = CURE_ANSWERS;
        saveData();
        updateWidget();
        updateCureBadge();
        showEventAlert(lastEventType);
        var cureMsg = pick(EVENT_MESSAGES.cure)
            .replace('{n}', cureAnswersLeft)
            .replace('{name}', charName());
        setMessage(cureMsg);
    }

    function setMessage(msg, thenResetDelay) {
        var el = getMsgEl();
        if (!el) return;
        el.textContent = msg;
        if (thenResetDelay) {
            setTimeout(function() {
                var m = getMsgEl();
                if (m) m.textContent = pick(MESSAGES[getState()]);
            }, thenResetDelay);
        }
    }

    window.Companion = {
        init: function(theme) {
            currentTheme = theme || 'default';
            data = loadData(currentTheme);
            loadGracePeriod(function(gd) {
                GRACE_DAYS = gd;
                applyInactivityPenalty();
                buildWidget();
            });
        },
        setTheme: function(theme) {
            currentTheme = theme || 'default';
            data = loadData(currentTheme);
            correctStreakNoPenalty = 0;
            inCureMode = false;
            cureAnswersLeft = 0;
            lastEventType = null;
            loadGracePeriod(function(gd) {
                GRACE_DAYS = gd;
                applyInactivityPenalty();
                buildWidget();
            });
        },
        onAnswer: function(correct) {
            if (!data) return;
            if (correct) {
                var pts = inCureMode ? POINTS_CORRECT_CURE : POINTS_CORRECT;
                data.health = Math.min(HEALTH_MAX, data.health + pts);
                data.totalCorrect = (data.totalCorrect || 0) + 1;
                correctStreakNoPenalty++;

                if (inCureMode) {
                    cureAnswersLeft--;
                    saveData();
                    updateWidget();
                    if (cureAnswersLeft <= 0) {
                        inCureMode = false;
                        removeCureBadge();
                        showEventCuredAlert();
                        setMessage(pick(MESSAGES.correct), 2200);
                    } else {
                        updateCureBadge();
                        var cureMsg = pick(EVENT_MESSAGES.cure)
                            .replace('{n}', cureAnswersLeft)
                            .replace('{name}', charName());
                        setMessage(cureMsg, 2200);
                        showReward();
                    }
                } else {
                    saveData();
                    updateWidget();
                    showReward();
                    setMessage(pick(MESSAGES.correct), 2200);
                    // Vérifier si un événement aléatoire se déclenche (après l'animation de récompense)
                    if (correctStreakNoPenalty >= STREAK_EVENT_THRESHOLD && Math.random() < EVENT_CHANCE) {
                        setTimeout(triggerRandomEvent, 900);
                    }
                }
            } else {
                data.health = Math.max(0, data.health + POINTS_WRONG);
                data.totalWrong = (data.totalWrong || 0) + 1;
                correctStreakNoPenalty = 0;
                saveData();
                updateWidget();
                setMessage(pick(MESSAGES.wrong), 2200);
            }
            data.lastPlayedDate = todayStr();
            saveData();
            var state = getState();
            if (state === 'sick' || state === 'critical') showHealthAlert();
        }
    };

})();
