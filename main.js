const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const fs = require('fs').promises;
const path = require('path');
const jsyaml = require('js-yaml');
const mm = require('music-metadata');
const sizeOf = require('image-size');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true
    }
  })

  win.loadFile('index.html')

  win.webContents.openDevTools()
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

ipcMain.handle('verify-mapset', async (event) => {
  const openResult = await dialog.showOpenDialog({ title: "Select Mapset", properties: ['openDirectory'] });
  const [directory] = openResult.filePaths;

  if (!directory) {
    return;
  }

  return verifyMaps(directory);
})

async function verifyMaps(directory) {
  const files = await fs.readdir(directory);

  const mapFiles = files.filter(file => file.endsWith('.qua'));

  if (mapFiles.length == 0) {
    throw new Error('No .qua files found in folder.');
  }

  const rawMaps = await Promise.all(mapFiles.map(file => fs.readFile(path.join(directory, file), { encoding: "utf8" })));
  const mapsData = rawMaps.map(map => jsyaml.safeLoad(map));

  const generalErrors = [];

  let audioFiles = new Set();
  let backgroundFiles = new Set();

  let songLength = 0;

  let titles = new Set();
  let artists = new Set();
  let sources = new Set();
  let creators = new Set();
  let tags = new Set();

  const mapsetErrors = await Promise.all(mapsData.map(async map => {
    const mapErrors = [];
    audioFiles.add(map.AudioFile);
    backgroundFiles.add(map.BackgroundFile);
    titles.add(map.Title);
    artists.add(map.Artist);
    sources.add(map.Source);
    creators.add(map.Creator);
    tags.add(map.Tags);

    const audioMetadata = await mm.parseFile(path.join(directory, map.AudioFile), { duration: true, skipCovers: true });

    const audioLength = audioMetadata.format.duration;
    const audioBitrate = audioMetadata.format.bitrate;

    songLength = audioLength;

    const dimensions = await sizeOf(path.join(directory, map.BackgroundFile));

    if (dimensions.width < 1280 || dimensions.height < 720) {
      mapErrors.push({ error: `Background image resolution must be at least 1280x720.` });
    }

    const stats = await fs.stat(path.join(directory, map.BackgroundFile));
    if (stats['size'] > 4000000) {
      mapErrors.push({ error: `Background image size must be less than 4Mb.` });
    }

    if (!map.AudioFile.endsWith('mp3')) {
      mapErrors.push({ error: `Audio file format must be mp3.` });
    }

    if (audioBitrate > 192000) {
      mapErrors.push({ error: `Audio bitrate is higher than 192kbps.` });
    }

    if (map.DifficultyName == '') {
      mapErrors.push({ error: `This difficulty is missing a difficulty name.` });
    }

    let keys = parseInt(map.Mode.slice(4));

    if (!(keys == 4 || keys == 7)) {
      mapErrors.push({ error: `This keycount is not supported.` });
    }

    for (let i = 1; i <= keys; i++) {
      let laneObjects = map.HitObjects.filter(e => e.Lane == i);
      laneObjects = laneObjects.sort((a, b) => (a.StartTime - b.StartTime));

      if (laneObjects.length == 0) {
        mapErrors.push({ error: `Column ${i} has no notes.` });
      }

      for (let j = 0; j < laneObjects.length - 1; j++) {
        if (laneObjects[j].StartTime == laneObjects[j + 1].StartTime) {
          mapErrors.push({
            error: `These objects are overlapping.`,
            time: laneObjects[j].startTime,
            lane: i
          });
        } else if (laneObjects[j].EndTime && laneObjects[j].EndTime >= laneObjects[j + 1].StartTime) {
          mapErrors.push({
            error: `These objects are overlapping.`,
            time: laneObjects[j].startTime,
            lane: i
          });
        } else if (laneObjects[j + 1].StartTime - (laneObjects[j].EndTime ?? laneObjects[j].StartTime) < 10) {
          mapErrors.push({
            error: `These objects are less than 10ms apart.`,
            time: laneObjects[j].startTime,
            lane: i
          });
        }
      }
    }

    let firstObject = Math.min(...map.HitObjects.map(e => e.StartTime));
    let lastObject = Math.max(...map.HitObjects.map(e => e.EndTime ?? e.StartTime));
    let breakTimes = [];
    for (let i = 0; i < map.HitObjects.length - 1; i++) {
      let startTime = (map.HitObjects[i].EndTime ?? map.HitObjects[i].StartTime);
      let endTime = map.HitObjects[i + 1].StartTime;
      let timeDiff = endTime - startTime;
      if (timeDiff > 3000) {
        breakTimes.push({ time: startTime, length: timeDiff });
      }
    }

    if (breakTimes.some(e => e.length > 30000)) {
      mapErrors.push({
        error: `You cannot have more than 30 seconds of consecutive break time.`,
        time: breakTimes,
        lane: i,
      });
    }

    const breakTime = breakTimes.reduce((a, b) => (a + b), 0);
    const playTime = lastObject - firstObject - breakTime;
    if (playTime / audioLength < 0.75) {
      mapErrors.push({
        error: `More than 75% of the length of the song must have notes to play.`
      });
    };

    return { name: map.DifficultyName, errors: mapErrors };
  }));

  let key7count = 0;
  let key4count = 0;
  for (let map of mapsData) {
    if (map.Mode == 'Keys7') {
      key7count++;
    } else if (map.Mode == 'Keys4') {
      key4count++;
    }
  }

  if (key7count == 1 && songLength < 149) {
    generalErrors.push({ error: `Difficulty spread for 7k requires at least 2 difficulties.` });
  }
  if (key4count == 1 && songLength < 149) {
    generalErrors.push({ error: `Difficulty spread for 4k requires at least 2 difficulties.` });
  }

  if (key4count > 0 && key7count > 0) {
    if (mapsData.some(e => !(e.DifficultyName.startsWith('4K') ||
      e.DifficultyName.startsWith('7K')))) {
      generalErrors.push({ error: `Each difficulty must be prefixed with either “4K” or “7K” for sets with multiple game modes.` });

    }
  }

  //general
  if (audioFiles.size > 1) {
    generalErrors.push({ error: `Multiple audio files are not allowed. (${[...audioFiles].join(', ')})` })
  }
  if (titles.size > 1) {
    generalErrors.push({ error: `Conflicting titles in metadata. (${[...titles].join(', ')})` })
  }
  if (artists.size > 1) {
    generalErrors.push({ error: `Conflicting artists in metadata. (${[...artists].join(', ')})` })
  }
  if (sources.size > 1) {
    generalErrors.push({ error: `Conflicting sources in metadata. (${[...sources].join(', ')})` })
  }
  if (creators.size > 1) {
    generalErrors.push({ error: `Conflicting creators in metadata. (${[...creators].join(', ')})` })
  }
  if (tags.size > 1) {
    generalErrors.push({ error: `Conflicting tags in metadata. (${[...tags].join(', ')})` })
  }

  /** @type {string} */
  const [title] = [...titles];
  const [artist] = [...artists];
  const [source] = [...sources];
  const [creator] = [...creators];
  const [tag] = [...tags];

  const nonASCIIRegex = /[^\x00-\x7F]+/g

  if (title.toString().match(nonASCIIRegex)) {
    generalErrors.push({ error: `Title is not romanized.` })
  }
  if (artist.toString().match(nonASCIIRegex)) {
    generalErrors.push({ error: `Artist is not romanized.` })
  }

  if (title != '' && tag.toString().includes(title.toString())) {
    generalErrors.push({ error: `Title is repeated in tags.` })
  }
  if (artist != '' && tag.toString().includes(artist.toString())) {
    generalErrors.push({ error: `Artist is repeated in tags.` })
  }
  if (source != '' && tag.toString().includes(source.toString())) {
    generalErrors.push({ error: `Source is repeated in tags.` })
  }

  return { generalErrors, mapsetErrors };
}