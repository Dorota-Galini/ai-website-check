// Die robots.txt-Regeln (seit 10.10.2026 hält sich der Check selbst daran).
// Ohne Netz, ohne KI:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuerTests } from '../src/sammeln.ts';

const { robotsGruppen, robotsErlaubt, robotsAuswerten, robotsSperrt, EIGENE_NAMEN } = fuerTests;
const darf = (robots: string, pfad: string) => robotsErlaubt(robotsGruppen(robots), EIGENE_NAMEN, pfad);
const signale = (robots: string) => {
  const s = { robots: { gefunden: false, sucheGesperrt: [] as string[], trainingGesperrt: [] as string[] } } as Parameters<typeof robotsAuswerten>[1];
  robotsAuswerten(robots, s);
  return s;
};

test('keine robots.txt: alles erlaubt', () => assert.equal(darf('', '/'), true));
test('„Disallow:“ ohne Pfad: alles erlaubt', () => assert.equal(darf('User-agent: *\nDisallow:', '/kontakt'), true));
test('alle Programme gesperrt', () => assert.equal(darf('User-agent: *\nDisallow: /', '/'), false));
test('nur ein Ordner gesperrt', () => {
  const r = 'User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php';
  assert.equal(darf(r, '/'), true);
  assert.equal(darf(r, '/wp-admin/edit.php'), false);
  assert.equal(darf(r, '/wp-admin/admin-ajax.php'), true);
});
test('nur wir gesperrt, alle anderen nicht', () => assert.equal(darf('User-agent: KI-Check\nDisallow: /\n\nUser-agent: *\nAllow: /', '/'), false));
test('alle gesperrt, wir ausdrücklich erlaubt', () => assert.equal(darf('User-agent: *\nDisallow: /\n\nUser-agent: ki-check\nAllow: /', '/'), true));
test('Platzhalter * und Ende $', () => {
  const r = 'User-agent: *\nDisallow: /*?\nDisallow: /*.pdf$';
  assert.equal(darf(r, '/kontakt'), true);
  assert.equal(darf(r, '/seite?x=1'), false);
  assert.equal(darf(r, '/preise.pdf'), false);
  assert.equal(darf(r, '/preise.pdf.html'), true);
});
test('Kommentare und Groß-/Kleinschreibung', () => assert.equal(darf('# Hallo\nUSER-AGENT: *  # alle\nDISALLOW: /  # zu', '/impressum'), false));
test('KI-Assistent gesperrt: Bericht ohne KI, Lesen erlaubt', () => {
  const r = 'User-agent: Claude-User\nDisallow: /\n\nUser-agent: *\nAllow: /';
  assert.equal(darf(r, '/'), true);
  assert.equal(signale(r).kiGesperrt, true);
});
test('mehrere Assistenten in einer Gruppe', () => assert.equal(signale('User-agent: ChatGPT-User\nUser-agent: PerplexityBot\nDisallow: /').kiGesperrt, true));
test('nur Training gesperrt: mit KI', () => {
  const s = signale('User-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /');
  assert.equal(s.kiGesperrt, false);
  assert.deepEqual(s.robots.trainingGesperrt, ['GPTBot', 'ClaudeBot']);
});
test('Bericht über KI-Leser', () => {
  assert.equal(robotsSperrt('User-agent: *\nDisallow: /', 'OAI-SearchBot'), true);
  assert.equal(robotsSperrt('User-agent: *\nDisallow: /intern/', 'OAI-SearchBot'), false);
  assert.ok(robotsSperrt('User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /wp-admin/', 'GPTBot'));
  assert.ok(!robotsSperrt('User-agent: *\nDisallow: /\n\nUser-agent: Claude-SearchBot\nAllow: /', 'Claude-SearchBot'));
});
