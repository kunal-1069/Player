require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const NodeID3 = require('node-id3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const JWT_SECRET = process.env.JWT_SECRET || 'apple_music_super_secret_key';
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mydb';

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname)); // Serve frontend files

// Configure Rate Limiter (Globally applied)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: "Too many requests from this IP, please try again later." }
});
app.use(apiLimiter);

// Setup Express Validator Middleware
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array().map(e => e.msg).join(', ') });
    }
    next();
};

// Connect to MongoDB (local or Atlas)
mongoose.connect(MONGODB_URI).then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

const coversDir = path.join(__dirname, 'uploads', 'covers');
if (!fs.existsSync(coversDir)){
    fs.mkdirSync(coversDir, { recursive: true });
}

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync('uploads')){
        fs.mkdirSync('uploads');
    }
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only MP3, WAV, OGG, and M4A are allowed."));
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'admin' }
});
const User = mongoose.model('User', UserSchema);

// Example schema
const SongSchema = new mongoose.Schema({
  title: String,
  artist: String,
  fileName: String,
  fileType: String,
  fileSize: Number,
  coverPath: { type: String, default: null },
  uploadDate: { type: Date, default: Date.now },
  id: { type: Number, default: Date.now } // Ensure compatibility with frontend expecting an id
});
const Song = mongoose.model('Song', SongSchema);

const PlaylistSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  songs: [{
    songId: { type: String },
    title: { type: String },
    artist: { type: String }
  }],
  createdAt: { type: Date, default: Date.now }
});
const Playlist = mongoose.model('Playlist', PlaylistSchema);

const SearchHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  query: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});
const SearchHistory = mongoose.model('SearchHistory', SearchHistorySchema);

const RecentlyPlayedSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  songId: { type: String, required: true },
  title: { type: String },
  artist: { type: String },
  timestamp: { type: Date, default: Date.now }
});
const RecentlyPlayed = mongoose.model('RecentlyPlayed', RecentlyPlayedSchema);

const FavoriteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  songId: { type: String, required: true },
  title: { type: String },
  artist: { type: String },
  addedAt: { type: Date, default: Date.now }
});
const Favorite = mongoose.model('Favorite', FavoriteSchema);

// 5-minute cache to reduce MongoDB read pressure for admin dashboard calls
const CACHE_TTL_MS = 5 * 60 * 1000;
let songsCache = {
  key: null,
  data: null,
  expiresAt: 0
};

const getSongsCacheKey = (page, limit) => `${page}:${limit}`;

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token == null) return res.status(401).json({ error: "Unauthorized access. Please login." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Token expired or invalid. Please login again." });
    req.user = user;
    next();
  });
}

// Auth API
app.post('/auth/register', [
  body('username').trim().isLength({ min: 3 }).withMessage("Username must be at least 3 characters").escape(),
  body('password').isLength({ min: 6 }).withMessage("Password must be at least 6 characters")
], validate, async (req, res) => {
  try {
    const { username, password } = req.body;

    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: "Username already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    
    // Automatically log them in after register
    const token = jwt.sign({ userId: user._id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, role: user.role, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/auth/login', [
  body('username').trim().notEmpty().withMessage("Username is required").escape(),
  body('password').notEmpty().withMessage("Password is required")
], validate, async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    
    if (!user) return res.status(400).json({ error: "Invalid username or password" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: "Invalid username or password" });

    const token = jwt.sign({ userId: user._id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, role: user.role, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Routes
app.post('/songs', authenticateToken, upload.single('songFile'), async (req, res) => {
  try {
    const { title, artist } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).send("No file uploaded.");
    }

    const duplicate = await Song.findOne({ title: { $regex: new RegExp(`^${title}$`, 'i') }, artist: { $regex: new RegExp(`^${artist}$`, 'i') } });
    if (duplicate) {
       if(fs.existsSync(file.path)) fs.unlinkSync(file.path);
       return res.status(400).json({ error: "A song with this title and artist already exists!" });
    }

    let coverPath = null;
    try {
        const tags = NodeID3.read(file.path);
        if (tags && tags.image && tags.image.imageBuffer) {
            const ext = tags.image.mime === 'image/png' ? 'png' : 'jpg';
            const coverName = Date.now() + '-' + Math.round(Math.random()*1000) + '.' + ext;
            fs.writeFileSync(path.join(coversDir, coverName), tags.image.imageBuffer);
            coverPath = '/uploads/covers/' + coverName;
        }
    } catch (e) {
        console.error("ID3 extraction failed on single upload:", e.message);
    }

    const newSong = new Song({
      title,
      artist,
      fileName: file.filename,
      fileType: file.mimetype,
      fileSize: file.size,
      coverPath,
      id: Date.now()
    });
    
    await newSong.save();
    // Invalidate the /songs cache on write operations
    songsCache = { key: null, data: null, expiresAt: 0 };
    res.json(newSong);
  } catch (err) {
    if(req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

app.post('/songs/batch', authenticateToken, upload.array('songFiles', 100), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).send("No files uploaded.");
    }

    const uploadedSongs = [];
    const errors = [];

    for (const file of files) {
      try {
        const tags = NodeID3.read(file.path);
        let title = tags.title;
        let artist = tags.artist;

        if (!title) title = file.originalname.replace(/\.[^/.]+$/, "");
        if (!artist) artist = "Unknown Artist";

        const duplicate = await Song.findOne({ 
            title: { $regex: new RegExp(`^${title}$`, 'i') }, 
            artist: { $regex: new RegExp(`^${artist}$`, 'i') } 
        });

        if (duplicate) {
           if(fs.existsSync(file.path)) fs.unlinkSync(file.path);
           errors.push(`"${title}" by ${artist} already exists.`);
           continue;
        }

        let coverPath = null;
        if (tags && tags.image && tags.image.imageBuffer) {
            const ext = tags.image.mime === 'image/png' ? 'png' : 'jpg';
            const coverName = Date.now() + '-' + Math.round(Math.random()*1000) + '.' + ext;
            fs.writeFileSync(path.join(coversDir, coverName), tags.image.imageBuffer);
            coverPath = '/uploads/covers/' + coverName;
        }

        const newSong = new Song({
          title,
          artist,
          fileName: file.filename,
          fileType: file.mimetype,
          fileSize: file.size,
          coverPath,
          id: Date.now() + Math.floor(Math.random() * 10000)
        });
        
        await newSong.save();
        uploadedSongs.push(newSong);

      } catch (fileErr) {
        if(fs.existsSync(file.path)) fs.unlinkSync(file.path);
        errors.push(`Failed to process ${file.originalname}: ${fileErr.message}`);
      }
    }

    // Invalidate cache after batch upload
    songsCache = { key: null, data: null, expiresAt: 0 };
    res.json({
        success: true,
        uploaded: uploadedSongs.length,
        errors: errors
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/songs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const cacheKey = getSongsCacheKey(page, limit);

    if (songsCache.data && songsCache.key === cacheKey && Date.now() < songsCache.expiresAt) {
      return res.json(songsCache.data);
    }

    const skip = (page - 1) * limit;
    const songs = await Song.find().sort({ uploadDate: -1 }).skip(skip).limit(limit);
    const total = await Song.countDocuments();

    const formattedSongs = songs.map(song => ({
        id: song.id,
        _id: song._id,
        title: song.title,
        artist: song.artist,
        fileName: song.fileName,
        fileType: song.fileType,
        fileSize: song.fileSize,
        coverPath: song.coverPath,
        uploadDate: song.uploadDate
    }));

    const payload = {
        songs: formattedSongs,
        total,
        page,
        totalPages: Math.ceil(total / limit)
    };

    songsCache = {
      key: cacheKey,
      data: payload,
      expiresAt: Date.now() + CACHE_TTL_MS
    };

    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/stream/:songId', async (req, res) => {
  try {
    const songId = req.params.songId;
    const query = mongoose.Types.ObjectId.isValid(songId) ? { $or: [{ _id: songId }, { id: Number(songId) }] } : { id: Number(songId) };
    
    const song = await Song.findOne(query);
    if (!song) return res.status(404).send("Song not found");
    
    const filePath = path.join(__dirname, 'uploads', song.fileName);
    if (!fs.existsSync(filePath)) return res.status(404).send("File not found on disk");
    
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, {start, end});
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': song.fileType || 'audio/mpeg',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': song.fileType || 'audio/mpeg',
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch(err) {
    res.status(500).send("Streaming error");
  }
});

app.delete('/songs/:id', authenticateToken, async (req, res) => {
  try {
    const songId = req.params.id;
    const query = mongoose.Types.ObjectId.isValid(songId) ? { $or: [{ _id: songId }, { id: Number(songId) }] } : { id: Number(songId) };
    
    const song = await Song.findOne(query);
    if (!song) {
        return res.status(404).json({ error: "Song not found" });
    }
    
    // delete file from disk
    const filePath = path.join(__dirname, 'uploads', song.fileName);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    
    await Song.deleteOne(query);
    songsCache = { key: null, data: null, expiresAt: 0 };
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Playlist Routes ---
app.post('/playlists', authenticateToken, [
  body('name').trim().notEmpty().withMessage("Playlist name is required").escape()
], validate, async (req, res) => {
  try {
    const { name } = req.body;

    const existing = await Playlist.findOne({ userId: req.user.userId, name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existing) return res.status(400).json({ error: "A playlist with this name already exists!" });

    const newPlaylist = new Playlist({
      userId: req.user.userId,
      name,
      songs: []
    });
    
    await newPlaylist.save();
    res.json({ ...newPlaylist._doc, id: newPlaylist._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/playlists', authenticateToken, async (req, res) => {
  try {
    const playlists = await Playlist.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    const formattedPlaylists = playlists.map(p => ({
        ...p._doc,
        id: p._id
    }));
    res.json(formattedPlaylists);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/playlists/:id/songs', authenticateToken, async (req, res) => {
  try {
    const playlistId = req.params.id;
    const { songId, title, artist } = req.body;

    if (!songId) return res.status(400).json({ error: "Song details are required" });

    const playlist = await Playlist.findOne({ _id: playlistId, userId: req.user.userId });
    if (!playlist) return res.status(404).json({ error: "Playlist not found" });

    if (playlist.songs.find(s => s.songId == songId)) {
      return res.status(400).json({ error: "Song already in playlist" });
    }

    playlist.songs.push({ songId, title, artist });
    await playlist.save();
    
    res.json({ success: true, playlist: { ...playlist._doc, id: playlist._id } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/playlists/:id/songs/:songId', authenticateToken, async (req, res) => {
  try {
    const { id, songId } = req.params;

    const playlist = await Playlist.findOne({ _id: id, userId: req.user.userId });
    if (!playlist) return res.status(404).json({ error: "Playlist not found" });

    playlist.songs = playlist.songs.filter(s => s.songId != songId);
    await playlist.save();

    res.json({ success: true, playlist: { ...playlist._doc, id: playlist._id } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/playlists/:id', authenticateToken, async (req, res) => {
  try {
    const playlistId = req.params.id;
    const result = await Playlist.deleteOne({ _id: playlistId, userId: req.user.userId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Playlist not found or you don't have permission to delete it" });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- History & Tracking Routes ---
app.post('/history/search', authenticateToken, async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Query is required" });

    // Upsert to update timestamp if existing
    const history = await SearchHistory.findOneAndUpdate(
       { userId: req.user.userId, query: { $regex: new RegExp(`^${query}$`, 'i') } },
       { query, timestamp: Date.now() },
       { upsert: true, new: true }
    );
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/history/search', authenticateToken, async (req, res) => {
  try {
    const history = await SearchHistory.find({ userId: req.user.userId })
        .sort({ timestamp: -1 })
        .limit(10);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/history/search', authenticateToken, async (req, res) => {
  try {
    await SearchHistory.deleteMany({ userId: req.user.userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/history/play', authenticateToken, async (req, res) => {
  try {
    const { songId, title, artist } = req.body;
    if (!songId) return res.status(400).json({ error: "Song ID is required" });

    const played = await RecentlyPlayed.findOneAndUpdate(
       { userId: req.user.userId, songId },
       { title, artist, timestamp: Date.now() },
       { upsert: true, new: true }
    );
    res.json(played);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/history/play', authenticateToken, async (req, res) => {
  try {
    const history = await RecentlyPlayed.find({ userId: req.user.userId })
        .sort({ timestamp: -1 })
        .limit(10);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Favorites Routes ---
app.post('/favorites', authenticateToken, async (req, res) => {
  try {
    const { songId, title, artist } = req.body;
    if (!songId) return res.status(400).json({ error: "Song ID is required" });

    const existing = await Favorite.findOne({ userId: req.user.userId, songId });
    if (existing) return res.status(400).json({ error: "Song already in favorites" });

    const newFavorite = new Favorite({
      userId: req.user.userId,
      songId,
      title,
      artist
    });
    
    await newFavorite.save();
    res.json(newFavorite);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/favorites', authenticateToken, async (req, res) => {
  try {
    const favorites = await Favorite.find({ userId: req.user.userId }).sort({ addedAt: -1 });
    res.json(favorites);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/favorites/:songId', authenticateToken, async (req, res) => {
  try {
    const { songId } = req.params;
    await Favorite.deleteOne({ userId: req.user.userId, songId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Global Error Handler Middleware
app.use((err, req, res, next) => {
  console.error("Express Error:", err.stack);
  res.status(err.status || 500).json({
    error: err.message || "An unexpected server error occurred."
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));