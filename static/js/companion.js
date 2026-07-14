(function() {
    'use strict';

    var STORAGE_PREFIX = 'melimath_companion_';
    var HEALTH_MAX = 100;
    var GRACE_DAYS = 2;
    var POINTS_CORRECT = 4;
    var POINTS_WRONG = -1;
    var POINTS_PER_ABSENT_DAY = -20;

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

    var currentTheme = 'default';
    var data = null;

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

    function getMsgEl() { return document.getElementById('companionMsg'); }
    function getBarEl() { return document.getElementById('companionBar'); }
    function getWidget() { return document.getElementById('companionWidget'); }

    function buildWidget() {
        var container = document.getElementById('companion-container');
        if (!container) return;
        var name = CHAR_NAMES[currentTheme] || 'Ami';
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
            applyInactivityPenalty();
            buildWidget();
        },
        setTheme: function(theme) {
            currentTheme = theme || 'default';
            data = loadData(currentTheme);
            applyInactivityPenalty();
            buildWidget();
        },
        onAnswer: function(correct) {
            if (!data) return;
            if (correct) {
                data.health = Math.min(HEALTH_MAX, data.health + POINTS_CORRECT);
                data.totalCorrect = (data.totalCorrect || 0) + 1;
            } else {
                data.health = Math.max(0, data.health + POINTS_WRONG);
                data.totalWrong = (data.totalWrong || 0) + 1;
            }
            data.lastPlayedDate = todayStr();
            saveData();
            updateWidget();
            if (correct) {
                showReward();
                setMessage(pick(MESSAGES.correct), 2200);
            } else {
                setMessage(pick(MESSAGES.wrong), 2200);
            }
            var state = getState();
            if (state === 'sick' || state === 'critical') showHealthAlert();
        }
    };

})();
