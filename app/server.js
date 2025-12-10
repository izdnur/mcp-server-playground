// MCP Server with stdio transport
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Support both local dev (app/server.js) and Docker (server.js at root)
const BASE = fs.existsSync(path.join(__dirname, '..', 'manifests')) 
  ? path.join(__dirname, '..', 'manifests')
  : path.join(__dirname, 'manifests');

// Helper functions to load resources
function loadPrompts() {
  const dir = path.join(BASE, 'prompts');
  if (!fs.existsSync(dir)) return [];
  
  const prompts = [];
  
  function scanDirectory(currentDir) {
    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stats = fs.statSync(fullPath);
      
      if (stats.isDirectory()) {
        scanDirectory(fullPath);
      } else if (item.endsWith('.json')) {
        const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        prompts.push({ ...content, name: content.id || path.basename(item, '.json') });
      }
    }
  }
  
  scanDirectory(dir);
  return prompts;
}

function loadPromptById(id) {
  // First try direct filename match
  const directFile = path.join(BASE, 'prompts', id + '.json');
  if (fs.existsSync(directFile)) {
    const content = JSON.parse(fs.readFileSync(directFile, 'utf8'));
    return { content, relativePath: id + '.json' };
  }
  
  // Otherwise search by id in all prompt files (recursively)
  const dir = path.join(BASE, 'prompts');
  if (!fs.existsSync(dir)) return null;
  
  function searchDirectory(currentDir, relativeBase = '') {
    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stats = fs.statSync(fullPath);
      
      if (stats.isDirectory()) {
        const result = searchDirectory(fullPath, path.join(relativeBase, item));
        if (result) return result;
      } else if (item.endsWith('.json')) {
        const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        if (content.id === id) {
          return { content, relativePath: path.join(relativeBase, item) };
        }
      }
    }
    return null;
  }
  
  return searchDirectory(dir);
}

function getPromptDirectory(relativePath) {
  // Extract directory from relative path (e.g., "microservices/fetch-ms-details.json" -> "microservices")
  const dir = path.dirname(relativePath);
  return dir === '.' ? '' : dir;
}

function loadResource(name) {
  const file = path.join(BASE, 'resources', name);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
}

function loadResourcesFromDirectory(dirPath) {
  const fullPath = path.join(BASE, 'resources', dirPath);
  if (!fs.existsSync(fullPath)) return [];
  
  const files = fs.readdirSync(fullPath);
  return files
    .filter(f => !fs.statSync(path.join(fullPath, f)).isDirectory())
    .map(f => ({
      name: path.join(dirPath, f),
      content: fs.readFileSync(path.join(fullPath, f), 'utf8')
    }));
}

function getResourceDescription(filename) {
  const descriptions = {
    'company-overall-information.md': 'Company background and history',
    'name-instructions.md': 'Instructions for addressing users by name',
    'system-instruction.md': 'System-level instructions for security and output',
    'engineering-handbook.md': 'Engineering component and severity mapping'
  };
  return descriptions[filename] || '';
}

// MCP JSON-RPC handler
function handleRequest(request) {
  const { method, params, id } = request;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            prompts: { listChanged: false },
            resources: { subscribe: false, listChanged: false }
          },
          serverInfo: {
            name: 'mcp-poc-server',
            version: '1.0.0'
          }
        }
      };

    case 'prompts/list':
      const prompts = loadPrompts();
      return {
        jsonrpc: '2.0',
        id,
        result: {
          prompts: prompts.map(p => ({
            name: p.name || p.id,
            description: p.description || '',
            arguments: p.args || p.arguments || []
          }))
        }
      };

    case 'prompts/get':
      const promptId = params?.name;
      const promptResult = loadPromptById(promptId);
      if (!promptResult) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: 'Prompt not found' }
        };
      }
      
      const prompt = promptResult.content;
      const promptDir = getPromptDirectory(promptResult.relativePath);
      const messages = [];
      
      // Auto-attach resources from matching directories
      if (promptDir) {
        // Attach docs from /resources/docs/{promptDir}
        const docsPath = path.join('docs', promptDir);
        const docsResources = loadResourcesFromDirectory(docsPath);
        if (docsResources.length > 0) {
          const docsContents = docsResources
            .map(res => `Resource: ${res.name}\n\n${res.content}`)
            .join('\n\n---\n\n');
          
          messages.push({
            role: 'user',
            content: {
              type: 'resource',
              resource: {
                type: 'text',
                text: docsContents
              }
            }
          });
        }
        
        // Attach instructions from /resources/instructions/{promptDir}
        const instructionsPath = path.join('instructions', promptDir);
        const instructionsResources = loadResourcesFromDirectory(instructionsPath);
        if (instructionsResources.length > 0) {
          const instructionsContents = instructionsResources
            .map(res => `Resource: ${res.name}\n\n${res.content}`)
            .join('\n\n---\n\n');
          
          messages.push({
            role: 'user',
            content: {
              type: 'resource',
              resource: {
                type: 'text',
                text: instructionsContents
              }
            }
          });
        }
      }
      
      // Special handling for ask-name prompt: attach company resources
      if (promptId === 'ask-name') {
        const companyResources = loadResourcesFromDirectory('company');
        if (companyResources.length > 0) {
          const companyContents = companyResources
            .map(res => `Resource: ${res.name}\n\n${res.content}`)
            .join('\n\n---\n\n');
          
          messages.push({
            role: 'user',
            content: {
              type: 'resource',
              resource: {
                type: 'text',
                text: companyContents
              }
            }
          });
        }
      }
      
      // If prompt has instructions, include them as context
      if (prompt.instructions) {
        const instructionsContent = loadResource(prompt.instructions);
        if (instructionsContent) {
          messages.push({
            role: 'user',
            content: {
              type: 'resource',
              resource: {
                type: 'text',
                text: `Instructions: ${prompt.instructions}\n\n${instructionsContent}`
              }
            }
          });
        }
      }
      
      // If prompt has embedded resources, include them as context
      if (prompt.resources && Array.isArray(prompt.resources)) {
        const resourceContents = prompt.resources
          .map(resName => {
            const content = loadResource(resName);
            return content ? `Resource: ${resName}\n\n${content}` : null;
          })
          .filter(Boolean)
          .join('\n\n---\n\n');
        
        if (resourceContents) {
          messages.push({
            role: 'user',
            content: {
              type: 'resource',
              resource: {
                type: 'text',
                text: resourceContents
              }
            }
          });
        }
      }
      
      // Add the actual prompt template
      messages.push({
        role: 'user',
        content: {
          type: 'text',
          text: prompt.template || ''
        }
      });
      
      return {
        jsonrpc: '2.0',
        id,
        result: {
          description: prompt.description || '',
          messages: messages
        }
      };

    case 'resources/list':
      const dir = path.join(BASE, 'resources');
      const resources = fs.existsSync(dir)
        ? fs.readdirSync(dir).map(name => ({
            uri: `resource:///${name}`,
            name: name,
            description: getResourceDescription(name),
            mimeType: name.endsWith('.md') ? 'text/markdown' : 'text/plain'
          }))
        : [];
      return {
        jsonrpc: '2.0',
        id,
        result: { resources }
      };

    case 'resources/read':
      const resourceUri = params?.uri;
      const resourceName = resourceUri?.replace('resource:///', '');
      const resourceContent = loadResource(resourceName);
      if (!resourceContent) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: 'Resource not found' }
        };
      }
      return {
        jsonrpc: '2.0',
        id,
        result: {
          contents: [
            {
              uri: resourceUri,
              mimeType: resourceName.endsWith('.md') ? 'text/markdown' : 'text/plain',
              text: resourceContent
            }
          ]
        }
      };

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: 'Method not found' }
      };
  }
}

// Stdio transport
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  try {
    const request = JSON.parse(line);
    const response = handleRequest(request);
    console.log(JSON.stringify(response));
  } catch (err) {
    console.error(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error: ' + err.message }
    }));
  }
});

process.stderr.write('MCP server started on stdio\n');
