// Константы
const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');

const fs = require('fs');
const path = require('path');
const app = express();

// Дебаг - выдает версию ffmpeg
app.get('/debug', (req, res) => {
  exec('ffmpeg -version', (error, stdout, stderr) => {
    if (error) {
      return res.status(500).send(`<pre>Error: ${error.message}\n${stderr}</pre>`);
    }
    res.send(`<pre>${stdout}</pre>`);
  });
});

// Middleware для обработки сырых бинарных данных (PCM)
app.use('/pcm2mp3', express.raw({ 
  type: 'application/octet-stream',
  limit: '20mb' // лимит размера PCM
}));

// Создаём временную папку
const audioUpload = '/tmp/audio-uploads';
if (!fs.existsSync(audioUpload)) {
  fs.mkdirSync(audioUpload, { recursive: true });
}

// Поддержка извлечения аудио из видео
const videoUpload = multer({ 
  dest: '/tmp/video-uploads/',
  limits: { fileSize: 50 * 1024 * 1024 } // 50 МБ максимум
});
// Убедимся, что папка существует
const videoDir = '/tmp/video-uploads';
if (!fs.existsSync(videoDir)) {
  fs.mkdirSync(videoDir, { recursive: true });
}

// Реализуем поворот фотографии
const imageRotateUpload = multer({ 
  dest: '/tmp/rotate-image/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10 МБ
});
const rotateImageDir = '/tmp/rotate-image';
if (!fs.existsSync(rotateImageDir)) {
  fs.mkdirSync(rotateImageDir, { recursive: true });
}

// Релизуем поворот видео
const videoRotateUpload = multer({ 
  dest: '/tmp/rotate-video/',
  limits: { fileSize: 50 * 1024 * 1024 } // 50 МБ
});
const rotateVideoDir = '/tmp/rotate-video';
if (!fs.existsSync(rotateVideoDir)) {
  fs.mkdirSync(rotateVideoDir, { recursive: true });
}

// Стоп-кадр из видео
const videoToImageUpload = multer({ 
  dest: '/tmp/video2image/',
  limits: { fileSize: 50 * 1024 * 1024 }
});

const videoToImageDir = '/tmp/video2image';
if (!fs.existsSync(videoToImageDir)) {
  fs.mkdirSync(videoToImageDir, { recursive: true });
}

// Настройка multer: сохраняем как .ogg
const storage = multer.diskStorage({
  destination: audioUpload,
  filename: (req, file, cb) => {
    // Генерируем уникальное имя с расширением .ogg
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `voice-${uniqueSuffix}.ogg`);
  }
});

const upload = multer({ storage: storage });

// Эндпоинты
app.post('/ogg2mp3', upload.single('audio'), async (req, res) => {
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

app.post('/rotate-image', imageRotateUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No image provided');
    }

    const angleImage = req.query.angle; // '90', '-90', '180'
    if (!['90', '-90', '180'].includes(angleImage)) {
      return res.status(400).send('Invalid angle: use 90, -90, or 180');
    }

    const inputPath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const outputPath = `/tmp/rotated-image-${Date.now()}${ext}`;

    let vf;
    if (angleImage === '90') {
      vf = 'transpose=1';
    } else if (angleImage === '-90') {
      vf = 'transpose=2';
    } else if (angleImage === '180') {
      vf = 'hflip,vflip';
    }

    const command = `ffmpeg -i "${inputPath}" -vf "${vf}" -y "${outputPath}"`;

    await new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error('FFmpeg rotate error:', stderr);
          reject(new Error('Rotation failed'));
        } else {
          resolve();
        }
      });
    });

    if (!fs.existsSync(outputPath)) {
      throw new Error('Output image not created');
    }

    const imgBuffer = fs.readFileSync(outputPath);
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
    res.setHeader('Content-Type', mimeType);
    res.send(imgBuffer);

    // Cleanup
    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

  } catch (error) {
    console.error('Rotate error:', error);
    res.status(500).send('Image rotation failed');
  }
});

app.post('/rotate-video', videoRotateUpload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No video provided');
    }

    const angleVideo = req.query.angle; // '90', '-90', '180'
    if (!['90', '-90', '180'].includes(angleVideo)) {
      return res.status(400).send('Invalid angle: use 90, -90, or 180');
    }

    const inputPath = req.file.path;
    const outputPath = `/tmp/rotated-video-${Date.now()}.mp4`;

    let vf;
    if (angleVideo === '90') {
      vf = 'transpose=1';
    } else if (angleVideo === '-90') {
      vf = 'transpose=2';
    } else if (angleVideo === '180') {
      vf = 'hflip,vflip';
    }

    // -c:a copy — не перекодируем аудио
    const command = `ffmpeg -i "${inputPath}" -vf "${vf}" -c:a copy -y "${outputPath}"`;

    await new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error('Video rotate error:', stderr);
          reject(new Error('Video rotation failed'));
        } else {
          resolve();
        }
      });
    });

    if (!fs.existsSync(outputPath)) {
      throw new Error('Rotated video not created');
    }

    const videoBuffer = fs.readFileSync(outputPath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', videoBuffer.length);
    res.send(videoBuffer);

    // Cleanup
    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

  } catch (error) {
    console.error('Rotate-video error:', error);
    res.status(500).send('Video rotation failed');
  }
});

app.post('/video2image', videoToImageUpload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No video provided');
    }

    // Время кадра (по умолчанию — 1 секунда)
    const timestamp = req.query.timestamp || '00:00:01.000'; // формат: HH:MM:SS.mmm
    const format = (req.query.format || 'jpg').toLowerCase(); // jpg или png

    if (!['jpg', 'png'].includes(format)) {
      return res.status(400).send('Format must be jpg or png');
    }

    const inputPath = req.file.path;
    const outputPath = `/tmp/thumbnail-${Date.now()}.${format}`;

    // Команда FFmpeg
    const command = `ffmpeg -i "${inputPath}" -ss ${timestamp} -vframes 1 -y "${outputPath}"`;

    await new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error('Video2Image error:', stderr);
          reject(new Error('Failed to extract frame'));
        } else {
          resolve();
        }
      });
    });

    if (!fs.existsSync(outputPath)) {
      throw new Error('Frame was not extracted');
    }

    const imgBuffer = fs.readFileSync(outputPath);
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    res.setHeader('Content-Type', mimeType);
    res.send(imgBuffer);

    // Cleanup
    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

  } catch (error) {
    console.error('Video2Image handler error:', error);
    res.status(500).send('Frame extraction failed');
  }
});

app.post('/video2mp3', videoUpload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No video file provided');
    }

    const inputPath = req.file.path;
    const outputPath = input_path => input_path.replace(/\.[^/.]+$/, "") + '.mp3';

    const command = `ffmpeg -i "${inputPath}" -vn -ab 128k -ar 22050 -y "${outputPath(inputPath)}"`;

    await new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        console.log('Video2MP3 stdout:', stdout.trim());
        console.error('Video2MP3 stderr:', stderr.trim());
        if (error) {
          reject(new Error(`FFmpeg failed: ${stderr || error.message}`));
        } else {
          resolve();
        }
      });
    });

    const mp3Path = outputPath(inputPath);
    if (!fs.existsSync(mp3Path)) {
      throw new Error('MP3 file was not created');
    }
    if (fs.statSync(mp3Path).size < 128) {
      throw new Error('Audio track is empty or missing');
    }
    const mp3Buffer = fs.readFileSync(mp3Path);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', mp3Buffer.length);
    res.send(mp3Buffer);

    // Cleanup
    fs.unlinkSync(inputPath);
    fs.unlinkSync(mp3Path);

  } catch (error) {
    console.error('Video2MP3 error:', error);
    res.status(500).send(`Extraction failed: ${error.message}`);
  }
});

app.post('/pcm2mp3', async (req, res) => {
  try {
    // req.body — это Buffer с сырыми PCM-данными
    if (!req.body || req.body.length === 0) {
      return res.status(400).send('Empty PCM data');
    }

    // Параметры по умолчанию (подстройте под ваш TTS)
    const sampleRate = parseInt(req.query.sampleRate) || 24000;
    const channels = parseInt(req.query.channels) || 1;
    const format = req.query.format || 's16le'; // signed 16-bit little-endian

    // Проверяем допустимые значения
    if (![8000, 16000, 22050, 24000, 44100, 48000].includes(sampleRate)) {
      return res.status(400).send('Invalid sampleRate');
    }
    if (![1, 2].includes(channels)) {
      return res.status(400).send('Invalid channels (must be 1 or 2)');
    }
    if (!['s16le', 's16be', 'f32le'].includes(format)) {
      return res.status(400).send('Unsupported format (use s16le, s16be, f32le)');
    }

    // Сохраняем PCM во временный файл
    const inputPath = `/tmp/pcm-${Date.now()}.raw`;
    const outputPath = inputPath.replace('.raw', '.mp3');

    fs.writeFileSync(inputPath, req.body);

    // Команда FFmpeg
    const command = `ffmpeg -f ${format} -ar ${sampleRate} -ac ${channels} -i "${inputPath}" -b:a 64k "${outputPath}"`;

    // Выполняем
    await new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        console.log('PCM → MP3 stdout:', stdout.trim());
        console.error('PCM → MP3 stderr:', stderr.trim());
        if (error) {
          reject(new Error(`FFmpeg failed: ${stderr || error.message}`));
        } else {
          resolve();
        }
      });
    });

    if (!fs.existsSync(outputPath)) {
      throw new Error('MP3 file not created');
    }

    const mp3Buffer = fs.readFileSync(outputPath);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', mp3Buffer.length);
    res.send(mp3Buffer);

    // Cleanup
    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

  } catch (error) {
    console.error('PCM conversion error:', error);
    res.status(500).send(`Conversion failed: ${error.message}`);
  }
});

app.get('/', (req, res) => {
  res.send('Leshiy MP3 & Media Converter is ready!');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
