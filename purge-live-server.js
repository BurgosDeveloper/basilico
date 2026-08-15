const http = require('http');

const req = http.request(
  {
    hostname: 'localhost',
    port: 3001,
    path: '/api/orders/purge-all',
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  },
  (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
      console.log('📡 Respuesta del servidor en vivo HTTP (Port 3001):');
      console.log(data);
    });
  }
);

req.on('error', (e) => {
  console.error('Error al conectar con el servidor en vivo:', e.message);
});

req.end();
