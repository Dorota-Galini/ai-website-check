// MCP-Server: der Check als Werkzeug für KI-Assistenten (Claude Desktop,
// Claude Code und andere Programme, die MCP sprechen). Angelegt am 11.10.2026.
//
// Ein Werkzeug, check_website. Es liefert den Bericht als Text (für das Modell
// zum Lesen) und als Daten (structuredContent). Liest nur, schickt nichts ab,
// hält sich an die robots.txt: dieselben Regeln wie überall (pruefen.ts).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { alsText, pruefen } from './pruefen.ts';

export function serverBauen(): McpServer {
  const server = new McpServer({ name: 'ai-website-check', version: '0.2.0' });

  server.registerTool(
    'check_website',
    {
      title: 'AI Website Check',
      description:
        'Walks through a small-business website the way a customer would (Google listing, phone view, services, price, hours, calling, address, trust, inquiry) and reports where a customer gets stuck. ' +
        'Rule findings come from the HTML. AI findings only count with a verbatim quote from the site that the server has checked. ' +
        'Reads only, never submits forms, follows robots.txt. Takes about 5 to 60 seconds.',
      inputSchema: {
        url: z.string().min(3).max(300).describe('Website address, for example example.com or https://example.com'),
        language: z.enum(['en', 'de', 'pl']).optional().describe('Language of the report. Default: en'),
        use_ai: z.boolean().optional().describe('Let Claude read the site as a customer. Needs ANTHROPIC_API_KEY where this server runs and costs a few cents. Default: true'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ url, language, use_ai }) => {
      const ergebnis = await pruefen(url, { sprache: language ?? 'en', mitKi: use_ai ?? true });
      if ('fehler' in ergebnis) {
        return { content: [{ type: 'text', text: ergebnis.meldung }], isError: true };
      }
      return {
        content: [{ type: 'text', text: alsText(ergebnis) }],
        structuredContent: { report: ergebnis.bericht, ai: ergebnis.kiStatus, durationMs: ergebnis.dauerMs },
      };
    },
  );

  return server;
}
