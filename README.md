# Restart the MCP Server container

```code
docker stop mcp-poc-container && docker rm mcp-poc-container && docker build -t mcp-poc . && docker run -d --name mcp-poc-container mcp-poc
```