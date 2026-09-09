const http = require('http');
const fs = require('fs');
const path = require('path');

const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

http.createServer((request, response) => {
  let requestedPath = decodeURIComponent(request.url.split('?')[0]);
  if (requestedPath === '/') requestedPath = '/index.html';
  const filePath = path.join(__dirname, requestedPath);
  if (!filePath.startsWith(__dirname)) { response.writeHead(403); response.end('Forbidden'); return; }
  fs.readFile(filePath, (error, file) => {
    if (error) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': `${types[path.extname(filePath)] || 'application/octet-stream'}; charset=utf-8` });
    response.end(file);
  });
}).listen(4173, () => console.log('Preview: http://localhost:4173'));
