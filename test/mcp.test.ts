// Der MCP-Server ohne Netz: Werkzeug angemeldet, Eingaben geprüft, private
// Adressen abgelehnt.  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { serverBauen } from '../src/mcp-server.ts';

async function verbinden() {
  const [clientSeite, serverSeite] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([client.connect(clientSeite), serverBauen().connect(serverSeite)]);
  return client;
}

test('check_website ist angemeldet und nur lesend', async () => {
  const client = await verbinden();
  const { tools } = await client.listTools();
  const t = tools.find((x) => x.name === 'check_website');
  assert.ok(t, 'Werkzeug fehlt');
  assert.equal(t.annotations?.readOnlyHint, true);
  assert.deepEqual(Object.keys((t.inputSchema as { properties: object }).properties).sort(), ['language', 'url', 'use_ai']);
  await client.close();
});

test('private Adressen werden abgelehnt', async () => {
  const client = await verbinden();
  const antwort = await client.callTool({ name: 'check_website', arguments: { url: 'http://127.0.0.1', use_ai: false } });
  assert.equal(antwort.isError, true);
  assert.match((antwort.content as { text: string }[])[0].text, /public website/);
  await client.close();
});

test('falsche Sprache wird abgewiesen', async () => {
  const client = await verbinden();
  const antwort = await client.callTool({ name: 'check_website', arguments: { url: 'example.com', language: 'fr' } });
  assert.equal(antwort.isError, true);
  await client.close();
});
