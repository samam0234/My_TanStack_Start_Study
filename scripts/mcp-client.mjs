import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const client = new Client({ name: 'tanstack-document-lab-cli', version: '1.0.0' })
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('./mcp-server.mjs', import.meta.url))],
  env: {},
}))
try {
  const { tools } = await client.listTools()
  if (!tools.some(({ name }) => name === 'find_excerpts')) throw new Error('find_excerpts 도구를 찾지 못했습니다.')
  const result = await client.callTool({
    name: 'find_excerpts',
    arguments: { text: 'SQLite는 파일 데이터베이스입니다. PostgreSQL은 서버를 사용합니다.', question: 'PostgreSQL' },
  })
  if (result.isError) throw new Error('MCP 도구 호출 실패')
  console.log(JSON.stringify(result.content, null, 2))
} finally { await client.close() }
