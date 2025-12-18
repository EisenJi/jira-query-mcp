import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

const server = new Server(
  {
    name: 'jira-query-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 配置代理
function createProxyAgent(proxyUrl) {
  if (!proxyUrl) return null;
  
  const url = new URL(proxyUrl);
  const protocol = url.protocol.toLowerCase();
  
  if (protocol.startsWith('socks')) {
    return new SocksProxyAgent(proxyUrl);
  } else if (protocol.startsWith('http')) {
    return new HttpsProxyAgent(proxyUrl);
  } else {
    throw new Error(`Unsupported proxy protocol: ${protocol}`);
  }
}

const proxyAgent = createProxyAgent(process.env.PROXY_AGENT);

// Jira 配置
const JIRA_CONFIG = {
  host: process.env.JIRA_HOST,
  token: process.env.JIRA_API_TOKEN,
  apiVersion: process.env.JIRA_API_VERSION || '2'
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_jira_issue',
        description: 'Get a specific Jira issue by key',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: {
              type: 'string',
              description: 'The Jira issue key (e.g., PROJ-123)',
            },
          },
          required: ['issueKey'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'get_jira_issue') {
      const { issueKey } = args;
      const url = `${JIRA_CONFIG.host}/rest/api/${JIRA_CONFIG.apiVersion}/issue/${issueKey}`;

      const fetchOptions = {
        headers: {
          'Authorization': `Bearer ${JIRA_CONFIG.token}`,
          'Content-Type': 'application/json',
        },
      };

      if (proxyAgent) {
        fetchOptions.agent = proxyAgent;
      }

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const issue = await response.json();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              key: issue.key,
              summary: issue.fields.summary,
              description: issue.fields.description,
              status: issue.fields.status.name,
              assignee: issue.fields.assignee?.displayName || 'Unassigned',
              priority: issue.fields.priority.name,
              issueType: issue.fields.issuetype.name,
              created: issue.fields.created,
              updated: issue.fields.updated,
              labels: issue.fields.labels,
              comments: issue.fields.comment?.comments?.map(c => ({
                author: c.author.displayName,
                body: c.body,
                created: c.created
              })) || []
            }, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
