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

function simplifyJiraIssue(issue) {
  return {
    key: issue.key,
    summary: issue.fields.summary,
    description: issue.fields.description,
    status: issue.fields.status?.name,
    assignee: issue.fields.assignee?.displayName || 'Unassigned',
    priority: issue.fields.priority?.name,
    issueType: issue.fields.issuetype?.name,
    created: issue.fields.created,
    updated: issue.fields.updated,
    labels: issue.fields.labels,
    attachments: issue.fields.attachment?.map(a => ({
      filename: a.filename,
      author: a.author.displayName,
      created: a.created,
      size: a.size,
      mimeType: a.mimeType,
      content: a.content
    })) || [],
    comments: issue.fields.comment?.comments?.map(c => ({
      author: c.author.displayName,
      body: c.body,
      created: c.created
    })) || []
  };
}

function formatLocalDateYYYYMMDD(date = new Date()) {
  // Use local time (not UTC) and stable YYYY-MM-DD formatting.
  // sv-SE locale formats as "YYYY-MM-DD".
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function buildTemplateSummary({ appName, title }) {
  const trimmedApp = String(appName || '').trim();
  const trimmedTitle = String(title || '').trim();
  if (!trimmedApp) throw new Error('appName is required');
  if (!trimmedTitle) throw new Error('title is required');
  return `【${trimmedApp}】${trimmedTitle}`;
}

function buildTemplateDescription({ submittedDate, taskDescription }) {
  const dateStr = (submittedDate && String(submittedDate).trim()) || formatLocalDateYYYYMMDD();
  const desc = (taskDescription && String(taskDescription).trim()) || '';
  return [
    `提出日期： ${dateStr}`,
    '',
    '任务描述：',
    desc,
    '',
    '解决方案：',
    '',
  ].join('\n');
}

async function jiraRequest(url, options = {}) {
  const fetchOptions = {
    ...options,
    headers: {
      'Authorization': `Bearer ${JIRA_CONFIG.token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  };

  if (proxyAgent) {
    fetchOptions.agent = proxyAgent;
  }

  const response = await fetch(url, fetchOptions);
  if (!response.ok) {
    let errorDetail = '';
    try {
      const text = await response.text();
      if (text) errorDetail = ` - ${text}`;
    } catch {
      // ignore
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}${errorDetail}`);
  }
  return response;
}

async function fetchIssueByKey(issueKey) {
  const url = `${JIRA_CONFIG.host}/rest/api/${JIRA_CONFIG.apiVersion}/issue/${issueKey}`;
  const response = await jiraRequest(url);
  return await response.json();
}

async function createIssueAndFetch({ projectKey, summary, description, issueType }) {
  const createUrl = `${JIRA_CONFIG.host}/rest/api/${JIRA_CONFIG.apiVersion}/issue`;

  const fields = {
    project: { key: projectKey },
    summary,
    issuetype: { name: issueType || 'Task' },
  };
  if (typeof description === 'string' && description.length > 0) {
    fields.description = description;
  }

  const createResponse = await jiraRequest(createUrl, {
    method: 'POST',
    body: JSON.stringify({ fields }),
  });

  const created = await createResponse.json();
  const createdKey = created?.key;
  if (!createdKey) {
    throw new Error('Create issue succeeded but no issue key was returned by Jira.');
  }

  const issue = await fetchIssueByKey(createdKey);
  return {
    created: {
      key: createdKey,
      id: created?.id,
      self: created?.self,
    },
    issue,
  };
}

async function addCommentToIssue(issueKey, commentText) {
  const commentUrl = `${JIRA_CONFIG.host}/rest/api/${JIRA_CONFIG.apiVersion}/issue/${issueKey}/comment`;
  const response = await jiraRequest(commentUrl, {
    method: 'POST',
    body: JSON.stringify({
      body: commentText,
    }),
  });
  
  const comment = await response.json();
  return {
    id: comment.id,
    body: comment.body,
    author: comment.author?.displayName || 'Unknown',
    created: comment.created,
    self: comment.self,
  };
}

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
      {
        name: 'create_jira_issue',
        description: 'Create a basic Jira issue (ticket) and then fetch it by key',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: {
              type: 'string',
              description: "The Jira project key (e.g., 'PROJ')",
            },
            summary: {
              type: 'string',
              description: 'Summary/title of the issue',
            },
            description: {
              type: 'string',
              description: '(Optional) Description of the issue',
            },
            issueType: {
              type: 'string',
              description: "(Optional) Issue type name (e.g., 'Task', 'Bug'). Default: 'Task'",
            },
          },
          required: ['projectKey', 'summary'],
        },
      },
      {
        name: 'create_jira_ticket_template',
        description:
          'Create a Jira ticket using a fixed template: summary as 【appName】title and description with 提出日期/任务描述/解决方案(留空), then fetch it',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: {
              type: 'string',
              description: "The Jira project key (e.g., 'PROJ')",
            },
            appName: {
              type: 'string',
              description: "The sub-application name to be wrapped in Chinese brackets, e.g. '微信运营平台运维'",
            },
            title: {
              type: 'string',
              description: 'The ticket title (will be appended after 【appName】)',
            },
            taskDescription: {
              type: 'string',
              description: 'Task description body to be placed under “任务描述：”',
            },
            submittedDate: {
              type: 'string',
              description: "(Optional) 提出日期 in YYYY-MM-DD. Default: today's local date",
            },
            issueType: {
              type: 'string',
              description: "(Optional) Issue type name (e.g., 'Task', 'Bug'). Default: 'Task'",
            },
          },
          required: ['projectKey', 'appName', 'title', 'taskDescription'],
        },
      },
      {
        name: 'add_jira_comment',
        description: 'Add a comment to a Jira issue',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: {
              type: 'string',
              description: 'The Jira issue key (e.g., PROJ-123)',
            },
            comment: {
              type: 'string',
              description: 'The comment to add to the issue',
            },
          },
          required: ['issueKey', 'comment'],
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
      const issue = await fetchIssueByKey(issueKey);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ...simplifyJiraIssue(issue),
            }, null, 2),
          },
        ],
      };
    }

    if (name === 'create_jira_issue') {
      const { projectKey, summary, description, issueType } = args;
      const { created, issue } = await createIssueAndFetch({
        projectKey,
        summary,
        description,
        issueType,
      });
      const simplified = simplifyJiraIssue(issue);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                message: 'Issue created successfully',
                created,
                issue: simplified,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === 'add_jira_comment') {
      const { issueKey, comment } = args;
      const commentResult = await addCommentToIssue(issueKey, comment);
      
      // 重新获取 issue 以包含最新的 comments
      const issue = await fetchIssueByKey(issueKey);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                message: 'Comment added successfully',
                comment: commentResult,
                issue: simplifyJiraIssue(issue),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === 'create_jira_ticket_template') {
      const { projectKey, appName, title, taskDescription, submittedDate, issueType } =
        args;
      const summary = buildTemplateSummary({ appName, title });
      const description = buildTemplateDescription({ submittedDate, taskDescription });

      const { created, issue } = await createIssueAndFetch({
        projectKey,
        summary,
        description,
        issueType,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                message: 'Issue created successfully (template)',
                template: {
                  summary,
                  description,
                },
                created,
                issue: simplifyJiraIssue(issue),
              },
              null,
              2
            ),
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
