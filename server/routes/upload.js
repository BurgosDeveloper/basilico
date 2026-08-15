const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

module.exports = function(io) {
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  router.post('/', (req, res) => {
    try {
      const { imageBase64, filename } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: 'No se envió imagen' });
      }

      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      const ext = filename ? path.extname(filename) : '.jpg';
      const safeFilename = `img_${Date.now()}${ext || '.jpg'}`;
      const filePath = path.join(uploadsDir, safeFilename);

      fs.writeFileSync(filePath, buffer);

      const relativeUrl = `/uploads/${safeFilename}`;
      return res.json({ url: relativeUrl, filename: safeFilename });
    } catch (e) {
      console.error('Error al guardar imagen:', e);
      return res.status(500).json({ error: 'Error al procesar la imagen' });
    }
  });

  return router;
};
