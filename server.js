const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.post('/convert', upload.single('audio'), async (req, res) => {
  try {
    const inputPath = req.file.path;
    const outputPath = inputPath + '.mp3';

    // Конвертируем OGG в MP3 (моно, 22050 Гц, 64 кбит/с)
    const command = `ffmpeg -i "${inputPath}" -ar 22050 -ac 1 -b:a 64k "${outputPath}"`;
    
    await exec(command);

    const mp3Buffer = fs.readFileSync(outputPath);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(mp3Buffer);

    // Удаляем временные файлы
    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

  } catch (error) {
    console.error('Conversion error:', error);
    res.status(500).send('Failed to convert audio');
  }
});

// Проверка работоспособности
app.get('/', (req, res) => {
  res.send('OGG to MP3 Converter is running!');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});