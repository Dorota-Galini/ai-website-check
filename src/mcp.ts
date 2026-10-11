// Startet den MCP-Server über stdin/stdout, so wie Claude Desktop und Claude
// Code ihn aufrufen. Achtung: stdout gehört dem Protokoll, nichts darf dorthin
// schreiben (Meldungen nur über console.error).
import dns from 'node:dns';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serverBauen } from './mcp-server.ts';

// Erst IPv4, wie auf der Kommandozeile (cli.ts).
dns.setDefaultResultOrder('ipv4first');

await serverBauen().connect(new StdioServerTransport());
console.error('ai-website-check MCP server running (stdio)');
