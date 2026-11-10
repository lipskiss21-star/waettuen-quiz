(() => {
'use strict';
const CFG = window.WAE_CONFIG || {};
const QSEC = 15, MAXDAY = 5 * 250;
const $app = document.getElementById('app');
const kstNow = () => new Date(Date.now() + 9 * 3600e3);
const kstToday = () => kstNow().toISOString().slice(0, 10);
const md = d => { const [, m, dd] = d.split('-'); return (+m) + '월 ' + (+dd) + '일'; };
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const weekStart = d => { const t = new Date(d + 'T00:00:00Z'); const wd = (t.getUTCDay() + 6) % 7; return addDays(d, -wd); };
// 누적 순위 기간: 주(월요일 시작), 월, 연
const periodsOf = d => ({ week: 'w-' + weekStart(d), month: 'm-' + d.slice(0, 7), year: 'y-' + d.slice(0, 4) });
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v); } for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k))); return e; };
const store = { get(k, d) { try { const v = localStorage.getItem('wae.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('wae.' + k, JSON.stringify(v)); } catch (e) {} } };
async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 16); }

const S = { dates: [], quizzes: {}, quiz: null, i: 0, pts: 0, marks: [], raf: null, t0: 0, fb: null, uid: null, practice: false };
S.nick = store.get('nick', '');
S.plays = store.get('plays', {});
S.localId = store.get('lid', null) || (() => { const id = 'l' + Math.random().toString(36).slice(2, 10); store.set('lid', id); return id; })();

function screen(...kids) { $app.replaceChildren(el('a', { class: 'badge', href: './' }, '왜뜬겨?'), ...kids.filter(k => k != null && k !== false)); window.scrollTo(0, 0); }
function msg(t) { screen(el('p', { class: 'sub' }, t)); }
const snd = (fn, ...a) => { try { const W = window.WaeSound; if (W && W[fn]) W[fn](...a); } catch (e) {} };
const tagOf = id => '#' + String(id || '').slice(-4).toUpperCase();

function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); }); }
async function initFirebase() {
  if (!CFG.firebase) return;
  try {
    const v = '10.12.2', base = 'https://www.gstatic.com/firebasejs/' + v + '/';
    await loadScript(base + 'firebase-app-compat.js');
    await Promise.all([loadScript(base + 'firebase-auth-compat.js'), loadScript(base + 'firebase-firestore-compat.js')]);
    firebase.initializeApp(CFG.firebase);
    const cred = await firebase.auth().signInAnonymously();
    S.uid = cred.user.uid; S.fb = firebase.firestore();
  } catch (e) { console.warn('firebase off', e); S.fb = null; }
}
const myId = () => S.uid || S.localId;

async function getQuiz(d) {
  if (S.quizzes[d]) return S.quizzes[d];
  const r = await fetch('quizzes/' + d + '.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('quiz ' + d);
  return (S.quizzes[d] = await r.json());
}

async function boot() {
  const fbP = initFirebase();
  try {
    const r = await fetch('quizzes/index.json', { cache: 'no-cache' });
    S.dates = (await r.json()).dates.filter(d => d <= kstToday());
  } catch (e) { msg('퀴즈를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요.'); return; }
  if (!S.dates.length) { msg('아직 등록된 퀴즈가 없어요. 매일 아침 새 문제가 올라와요.'); return; }
  await Promise.race([fbP, new Promise(r => setTimeout(r, 6000))]);
  fbP.then(migrateTotals);
  if (!S.nick) nickScreen(home); else home();
}

function eventBox() {
  const ev = CFG.event || {};
  if (!ev.on) return null;
  return el('div', { class: 'event' }, el('b', {}, ev.title), el('span', {}, '이번 주 점수 합계 1등에게 ' + ev.prize + '을(를) 드려요. '), el('a', { href: 'rules.html' }, '참여 방법과 규칙 보기'));
}

function nickScreen(next) {
  const inp = el('input', { id: 'nick', maxlength: '10', autocomplete: 'nickname', value: S.nick || '', placeholder: '예: 설입고수' });
  const err = el('p', { class: 'err' });
  const save = () => {
    const v = inp.value.trim().replace(/\s+/g, ' ');
    if (v.length < 2) { err.textContent = '닉네임은 2~10글자로 정해 주세요.'; return; }
    if (/https?:|www\.|[<>]/i.test(v)) { err.textContent = '링크나 특수 기호는 넣을 수 없어요.'; return; }
    S.nick = v; store.set('nick', v); next();
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
  screen(
    el('h1', {}, '이거 왜 ', el('em', {}, '떴게?')),
    el('p', { class: 'sub' }, '매일 급상승 검색어 5문제. 순위표에 쓸 닉네임을 정해 주세요.'),
    el('div', { class: 'panel' }, el('div', { class: 'field' }, el('label', { for: 'nick' }, '닉네임 (2~10글자)'), inp), err, el('button', { class: 'btn', onclick: save }, '시작하기')),
    el('p', { class: 'note' }, '로그인은 필요 없어요. 기록은 이 기기에 저장돼요.')
  );
  inp.focus();
}

async function home() {
  let today;
  try { today = await getQuiz(S.dates[0]); } catch (e) { msg('오늘 퀴즈 파일을 불러오지 못했어요.'); return; }
  const played = S.plays[today.date];
  const kws = el('ul', { class: 'list' }, today.questions.map(q => el('li', { class: 'kw-row' }, el('span', {}, q.keyword), el('span', {}, q.volume || ''))));
  const past = S.dates.slice(1, 8);
  screen(
    el('p', { class: 'sub' }, md(today.date) + ' 구글 급상승 검색어'),
    el('h1', {}, '이거 왜 ', el('em', {}, '떴게?')),
    eventBox(),
    el('div', { class: 'me-line' }, el('span', {}, '내 닉네임 ', el('b', {}, S.nick), ' ', el('span', { class: 'tag' }, tagOf(myId()))), el('button', { class: 'linkbtn', onclick: () => nickScreen(home) }, '바꾸기')),
    el('div', { class: 'panel' }, el('h2', {}, '오늘의 5문제'), kws, el('p', { class: 'note', style: 'text-align:left' }, '한 문제에 ' + QSEC + '초. 빨리 맞힐수록 점수가 커요. 순위에는 첫 번째 풀이만 올라가요.')),
    played
      ? el('div', { class: 'row' }, el('button', { class: 'btn', onclick: () => result(today, played) }, '내 기록·순위'), el('button', { class: 'btn ghost', onclick: () => start(today, true) }, '연습으로 다시'))
      : el('button', { class: 'btn', onclick: () => start(today, false) }, '오늘 퀴즈 시작'),
    el('button', { class: 'btn ghost', onclick: () => board(today.date, 'week') }, '이번 주 순위 보기'),
    past.length ? el('div', { class: 'panel' }, el('h2', {}, '지난 퀴즈'), el('div', { class: 'chips' }, past.map(d => { const p = S.plays[d]; return el('button', { class: 'chip' + (p ? ' done' : ''), onclick: async () => { const qz = await getQuiz(d); p ? result(qz, p) : start(qz, true); } }, md(d) + (p ? ' · ' + p.score + '점' : '')); })), el('p', { class: 'note', style: 'text-align:left' }, '지난 퀴즈는 연습용이라 순위에 올라가지 않아요.')) : null,
    el('p', { class: 'note' }, el('a', { href: (CFG.event && CFG.event.youtube) || '#' , target: '_blank', rel: 'noopener' }, '유튜브 쇼츠 「왜뜬겨?」'), '에서 매일 검색어 이유를 알려드려요.'),
    el('p', { class: 'note' }, el('a', { href: 'rules.html' }, '이용 안내·개인정보'))
  );
}

function start(quiz, practice) { Object.assign(S, { quiz, practice, i: 0, pts: 0, marks: [] }); ask(); }

function ask() {
  const quiz = S.quiz, q = quiz.questions[S.i];
  const dots = el('div', { class: 'dots' }, quiz.questions.map((_, k) => el('span', { class: 'dot' + (k < S.i ? (S.marks[k] ? ' o' : ' x') : k === S.i ? ' now' : '') })));
  const bar = el('i');
  const choices = el('div', { class: 'choices' }, q.choices.map((c, k) => el('button', { class: 'choice', onclick: () => pick(k) }, el('b', {}, 'ABCD'[k]), el('span', {}, c))));
  screen(
    el('div', { class: 'top' }, dots, el('span', { class: 'score' }, (S.practice ? '연습 · ' : '') + S.pts + '점')),
    el('div', { class: 'timer' }, bar),
    el('div', { class: 'kwcard' }, el('span', { class: 'label' }, '급상승 검색어 ' + (S.i + 1) + '/' + quiz.questions.length), el('span', { class: 'kw' }, q.keyword), q.volume ? el('span', { class: 'vol' }, '검색 ' + q.volume) : null),
    el('p', { class: 'q' }, q.q || '이거 왜 떴게?'),
    choices,
    el('div', { id: 'after' })
  );
  S.t0 = performance.now();
  snd('start');
  const tick = () => { const left = Math.max(0, QSEC - (performance.now() - S.t0) / 1000); snd('setUrgent', left <= 5); bar.style.transform = 'scaleX(' + (left / QSEC) + ')'; if (left <= 0) { pick(-1); return; } S.raf = requestAnimationFrame(tick); };
  S.raf = requestAnimationFrame(tick);
}

async function pick(k) {
  if (S.raf === null) return;
  cancelAnimationFrame(S.raf); S.raf = null;
  const quiz = S.quiz, q = quiz.questions[S.i];
  const left = Math.max(0, QSEC - (performance.now() - S.t0) / 1000);
  let right = -1;
  for (let j = 0; j < q.choices.length; j++) if (await sha(quiz.date + '|' + S.i + '|' + j + '|waettuen') === q.ah) right = j;
  const ok = k === right;
  if (ok) S.pts += 100 + Math.round(left * 10);
  S.marks.push(ok);
  snd(ok ? 'correct' : 'wrong');
  document.querySelectorAll('.choice').forEach((b, j) => { b.disabled = true; if (j === right) b.classList.add('right'); else if (j === k) b.classList.add('wrong'); });
  document.querySelector('.score').textContent = (S.practice ? '연습 · ' : '') + S.pts + '점';
  const last = S.i === quiz.questions.length - 1;
  const after = document.getElementById('after');
  after.replaceChildren(
    el('div', { class: 'explain' },
      el('span', { class: 'verdict ' + (ok ? 'o' : 'x') }, ok ? '정답!' : (k < 0 ? '시간 초과' : '아쉬워요')),
      el('p', {}, q.explain),
      q.source ? el('p', { class: 'src' }, '출처: ', el('a', { href: q.source.url, target: '_blank', rel: 'noopener' }, q.source.title)) : null),
    el('button', { class: 'btn', onclick: () => { if (last) finish(); else { S.i++; ask(); } } }, last ? '결과 보기' : '다음 문제')
  );
  after.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
}

// 주간·월간·연간 합계에 하루 점수를 한 번만 더해요(d 맵에 날짜별 점수를 남겨 중복을 막아요).
function addTotals(b, date, score, only) {
  const FV = firebase.firestore.FieldValue, ps = periodsOf(date);
  for (const pid of (only || Object.values(ps))) {
    b.set(S.fb.collection('totals').doc(pid).collection('scores').doc(S.uid), { nick: S.nick, score: FV.increment(score), last: date, at: FV.serverTimestamp(), d: { [date]: score } }, { merge: true });
  }
}
// 합계 기능이 생기기 전에 푼 기록을 이번 주·달·해 합계에 옮겨 넣어요(한 번만).
async function migrateTotals() {
  if (!S.fb || !S.uid) return;
  try {
    const cur = periodsOf(kstToday());
    const dates = Object.keys(S.plays).filter(d => d <= kstToday() && d.slice(0, 4) === kstToday().slice(0, 4)).sort();
    if (!dates.length) return;
    const have = {};
    for (const pid of Object.values(cur)) { const x = await S.fb.collection('totals').doc(pid).collection('scores').doc(S.uid).get(); have[pid] = (x.exists && x.data().d) || {}; }
    for (const d of dates) {
      const ps = periodsOf(d), need = Object.values(ps).filter(pid => have[pid] && !(d in have[pid]));
      if (!need.length) continue;
      const day = await S.fb.collection('days').doc(d).collection('scores').doc(S.uid).get();
      if (!day.exists) continue;
      const b = S.fb.batch(); addTotals(b, d, day.data().score, need); await b.commit();
      for (const pid of need) have[pid][d] = day.data().score;
    }
  } catch (e) { console.warn('migrate', e); }
}

async function finish() {
  const quiz = S.quiz;
  const play = { score: Math.min(S.pts, MAXDAY), correct: S.marks.filter(Boolean).length, marks: S.marks.map(m => m ? 'O' : 'X').join(''), at: new Date().toISOString() };
  let note = null;
  if (!S.practice && !S.plays[quiz.date] && quiz.date === kstToday()) {
    S.plays[quiz.date] = play; store.set('plays', S.plays);
    if (S.fb && S.uid) {
      try {
        const FV = firebase.firestore.FieldValue, b = S.fb.batch();
        const dayRef = S.fb.collection('days').doc(quiz.date).collection('scores').doc(S.uid);
        const dayDoc = { nick: S.nick, score: play.score, correct: play.correct, marks: play.marks, at: FV.serverTimestamp() };
        b.set(dayRef, dayDoc);
        addTotals(b, quiz.date, play.score);
        // 합계 쓰기가 실패해도 하루 점수는 꼭 남기고, 합계는 다음에 열 때 다시 더해요
        try { await b.commit(); } catch (e1) { console.warn('totals', e1); await dayRef.set(dayDoc); }
      }
      catch (e) { note = '순위표에 저장하지 못했어요. 이미 오늘 기록이 있거나 인터넷이 끊겼을 수 있어요.'; }
    } else note = '지금은 순위표가 꺼져 있어서 기록이 이 기기에만 저장돼요.';
  } else if (S.practice) note = '연습 풀이라 순위에는 올라가지 않아요.';
  S.quiz = null;
  result(quiz, play, note);
}

function shareText(quiz, play) { return '왜뜬겨? 퀴즈 ' + md(quiz.date) + '\n' + play.marks.split('').map(m => m === 'O' ? '⭕' : '❌').join('') + ' ' + play.score + '점\n' + location.origin + location.pathname; }

function result(quiz, play, note) {
  const copyBtn = el('button', { class: 'btn ghost' }, '결과 복사');
  copyBtn.addEventListener('click', () => { const t = shareText(quiz, play); const fail = () => { copyBtn.textContent = '복사가 안 되면 화면을 캡처해 주세요'; }; try { navigator.clipboard.writeText(t).then(() => { copyBtn.textContent = '복사됨'; setTimeout(() => copyBtn.textContent = '결과 복사', 1500); }, fail); } catch (e) { fail(); } });
  screen(
    el('p', { class: 'sub' }, md(quiz.date) + ' 퀴즈 결과'),
    el('div', { class: 'big' }, play.score + '점'),
    el('div', { class: 'marks' }, play.marks.split('').map(m => m === 'O' ? '⭕' : '❌').join('')),
    el('p', { class: 'note' }, '5문제 중 ' + play.correct + '문제 정답'),
    note ? el('p', { class: 'note' }, note) : null,
    el('div', { class: 'row' }, copyBtn, el('button', { class: 'btn ghost', onclick: home }, '처음으로')),
    el('button', { class: 'btn', onclick: () => board(quiz.date, 'day') }, '순위 보기')
  );
}

async function topOfDay(d, n) {
  const snap = await S.fb.collection('days').doc(d).collection('scores').orderBy('score', 'desc').limit(n).get();
  return snap.docs.map(x => ({ id: x.id, ...x.data() }));
}

async function board(date, mode) {
  const box = el('div', { class: 'list' }, el('p', { class: 'note' }, '불러오는 중…'));
  const tab = (m, label) => el('button', { role: 'tab', 'aria-selected': String(mode === m), onclick: () => board(date, m) }, label);
  const tabs = el('div', { class: 'tabs', role: 'tablist' }, tab('day', md(date)), tab('week', '이번 주'), tab('month', '이번 달'), tab('year', '올해'));
  const hint = { day: md(date) + ' 점수', week: '이번 주(월~일) 점수 합계', month: (+kstToday().slice(5, 7)) + '월 점수 합계', year: kstToday().slice(0, 4) + '년 점수 합계' }[mode];
  screen(el('h1', {}, '순위표'), tabs, el('p', { class: 'sub' }, hint), el('div', { class: 'panel' }, box), eventBox(), el('button', { class: 'btn ghost', onclick: home }, '처음으로'));
  if (!S.fb) { box.replaceChildren(el('p', { class: 'note' }, '순위표는 곧 열려요. 지금은 내 기록만 이 기기에 저장돼요.')); return; }
  try {
    let rows;
    if (mode === 'day') rows = (await topOfDay(date, 50)).map(r => ({ id: r.id, nick: r.nick, score: r.score }));
    else {
      const pid = periodsOf(kstToday())[mode];
      const snap = await S.fb.collection('totals').doc(pid).collection('scores').orderBy('score', 'desc').limit(50).get();
      rows = snap.docs.map(x => { const v = x.data(); return { id: x.id, nick: v.nick, score: v.score, days: Object.keys(v.d || {}).length, at: v.at ? v.at.toMillis() : 0 }; });
      rows.sort((a, b) => b.score - a.score || a.at - b.at);
    }
    if (!rows.length) { box.replaceChildren(el('p', { class: 'note' }, '아직 기록이 없어요. 첫 번째가 되어 보세요.')); return; }
    box.replaceChildren(...rows.map((r, k) => { const nm = el('span', { class: 'nm' }); nm.append(document.createTextNode(r.nick || '참가자'), ' ', el('span', { class: 'tag' }, tagOf(r.id)), r.id === S.uid ? ' (나)' : ''); return el('div', { class: 'rank-row' + (r.id === S.uid ? ' me' : '') }, el('span', { class: 'n' }, k + 1), nm, el('span', { class: 'pts' }, r.score + '점' + (r.days ? ' · ' + r.days + '일' : ''))); }));
  } catch (e) { console.warn(e); box.replaceChildren(el('p', { class: 'note' }, '순위를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')); }
}

boot();
})();
