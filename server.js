const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');

const fs = require('fs');
const path = require('path');
const app = express();

app.get('/debug', (req, res) => {
  exec('ffmpeg -version', (error, stdout, stderr) => {
    if (error) {
      return res.status(500).send(`<pre>Error: ${error.message}\n${stderr}</pre>`);
    }
    res.send(`<pre>${stdout}</pre>`);
  });
});

// Создаём временную папку
const tmpDir = '/tmp/uploads';
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

// Настройка multer: сохраняем как .ogg
const storage = multer.diskStorage({
  destination: tmpDir,
  filename: (req, file, cb) => {
    // Генерируем уникальное имя с расширением .ogg
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `voice-${uniqueSuffix}.ogg`);
  }
});

const upload = multer({ storage: storage });

app.post('/convert', upload.single('audio'), async (req, res) => {
  try {
    const inputPath = req.file.path; // Теперь это .../voice-12345.ogg
    const outputPath = inputPath.replace('.ogg', '.mp3');

    // Конвертируем
    const command = `ffmpeg -y -i "${inputPath}" -ar 22050 -ac 1 -b:a 64k "${outputPath}"`;
    
    // Выполняем и ждём завершения
    await new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        console.log('FFmpeg stdout:', stdout);
        console.error('FFmpeg stderr:', stderr);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    if (!fs.existsSync(outputPath)) {
      throw new Error('MP3 file was not created');
    }

    const mp3Buffer = fs.readFileSync(outputPath);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(mp3Buffer);

    // Cleanup
    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

  } catch (error) {
    console.error('Conversion error:', error);
    res.status(500).send('Failed to convert audio');
  }
});

app.get('/', (req, res) => {
  res.send('OGG → MP3 converter is ready!');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
