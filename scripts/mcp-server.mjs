import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { excerpts } from '../src/board/excerpts.mjs'

const server = new McpServer({ name: 'tanstack-document-lab', version: '1.0.0' })
server.registerTool('find_excerpts', {
  description: '입력된 문서 조각에서 질문과 일치하는 발췌를 읽습니다.',
  inputSchema: { text: z.string().max(32_768), question: z.string().max(500) },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
}, async ({ text, question }) => ({
  content: [{ type: 'text', text: JSON.stringify(excerpts(text, question)) }],
}))
await server.connect(new StdioServerTransport())
