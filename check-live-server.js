const http = require('http');

http.get('http://localhost:3001/api/orders', (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    console.log('📡 Órdenes en el servidor en vivo:', data);
  });
}).on('error', (err) => console.log('Error:', err.message));

http.get('http://localhost:3001/api/caja-chica', (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    console.log('📡 Caja Chica en el servidor en vivo:', data);
  });
}).on('error', (err) => console.log('Error:', err.message));
