/* ---------- punishment for the losers ---------- */
// After a match the winning side picks a punishment for the losers (PUNISH, in 06-animation) on the result card,
// and the losers wait for it. The page that runs the match decides (the host, or this page against the computer):
// a guest's pick is sent there ({t:'punish'}), and the choice goes out to every screen as an event. Each screen
// then plays it: the losers kneel down in the middle of their court and act it out for PUN_T seconds with a speech
// bubble, while the result card steps aside. If only computer players won, they pick by themselves.
const PUN_T = 8;
function punishOffer(ev) {
  const win = ev.games[0] > ev.games[1] ? 0 : 1;
  punPick = { win, lose: 1 - win };
  renderPunish();
  if (S.mode !== 'guest' && !members(win).some(isHuman)) {
    setTimeout(() => { if (punPick && !pun && S.state === 'over') choosePunish(Object.keys(PUNISH)[Math.floor(Math.random() * 3)], -1); }, 1800);
  }
}
// The result card's punishment part: the choices for the winners, a waiting line for the losers
function renderPunish() {
  const box = $('punish');
  box.hidden = !punPick; box.replaceChildren();
  if (!punPick) return;
  const line = (cls, text) => { const p = document.createElement('p'); p.className = cls; p.textContent = text; box.append(p); return p; };
  const lose = teamName(punPick.lose);
  if (pun) { line('pdone', `${lose} ${pun.done ? 'đã chịu phạt' : 'đang chịu phạt'}: ${PUNISH[pun.kind].name}`); return; }
  if (team(me) === punPick.win) {
    line('label', `Chọn hình phạt cho ${lose.toLowerCase()}`);
    const opts = document.createElement('div'); opts.className = 'popts';
    for (const [k, P] of Object.entries(PUNISH)) {
      const b = document.createElement('button'); b.className = 'popt'; b.textContent = P.name;
      b.addEventListener('click', () => pickPunish(k));
      opts.append(b);
    }
    box.append(opts);
  } else {
    const who = members(punPick.win).filter(isHuman).map(nameOf);
    line('pwait', `${who.length ? who.join(' và ') : 'Máy'} đang chọn hình phạt cho ${lose.toLowerCase()}…`);
  }
}
// A winner's pick on this screen
function pickPunish(kind) {
  if (!punPick || pun || team(me) !== punPick.win) return;
  for (const b of $('punish').querySelectorAll('button')) b.disabled = true;
  if (S.mode === 'guest') send({ t: 'punish', k: kind }); else choosePunish(kind, me);
}
// Host: a guest's pick, if it is on the winning side and nobody has picked yet
function takePunish(i, kind) {
  if (S.state === 'over' && punPick && !pun && team(i) === punPick.win && Object.hasOwn(PUNISH, kind)) choosePunish(kind, i);
}
// The page running the match: losers to the middle of their court, then everyone acts it out (startPunish)
function choosePunish(kind, by) {
  const lose = punPick.lose, L = members(lose);
  L.forEach((i, j) => placeAthlete(ath(i), L.length > 1 ? (j ? 0.9 : -0.9) : 0, ath(i).side * 2.4));
  emit({ k: 'punish', kind, lose, by });
}
function startPunish(ev) {
  if (!Object.hasOwn(PUNISH, ev.kind)) return;
  if (!punPick) punPick = { win: 1 - ev.lose, lose: ev.lose };
  pun = { kind: ev.kind, lose: ev.lose, t: 0, done: false, said: -1 };
  // (the speech bubble, the name tag's sprite, comes down to the kneeling head)
  for (const i of members(ev.lose)) { const a = ath(i); a.pun = ev.kind; a.punT = 0; a.swingT = -1; a.armed = null; a.tag.sp.position.y = ev.kind === 'cha' ? 1.65 : 1.3; }
  $('result').hidden = true;
  const by = ev.by >= 0 ? nameOf(ev.by) : 'Máy';
  toast(PUNISH[ev.kind].name, `${by} phạt ${teamName(ev.lose).toLowerCase()}`, 2.6);
  renderPunish();
}
// Each frame: speech bubbles while it lasts, then everyone stands up and the result card comes back
function punTick(dt) {
  if (!pun || pun.done) return;
  pun.t += dt;
  // (the bubbles start once the announcement is gone, so on a phone they don't cover each other)
  const P = PUNISH[pun.kind], n = pun.t < 2.4 ? -1 : Math.floor((pun.t - 2.4) / 2);
  if (pun.t >= PUN_T) {
    pun.done = true;
    for (const a of ATH) { a.pun = null; a.tag.sp.position.y = 2.15; }
    updateTags(); renderPunish();
    if (S.state === 'over') $('result').hidden = false;
    return;
  }
  if (n >= 0 && n !== pun.said) { pun.said = n; for (const i of members(pun.lose)) setTag(ath(i), P.say[n % P.say.length]); }
}
// A new match, back to the menu, or leaving the court
function clearPunish() {
  if (!pun && !punPick && !ATH.some(a => a.pun)) return;
  pun = punPick = null;
  for (const a of ATH) { a.pun = null; a.tag.sp.position.y = 2.15; }
  updateTags(); renderPunish();
}
