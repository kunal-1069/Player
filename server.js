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

const JWT_SECRET = process.env.JWT_SECRET || 'apple_music_super_secret_key';
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mydb';

const app = express();
app.use(bodyParser.json());
app.use(express.static(__dirname)); // Serve frontend files

// Connect to MongoDB (local or Atlas)
mongoose.connect(MONGODB_URI).then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

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
const upload = multer({ storage: storage });

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
  uploadDate: { type: Date, default: Date.now },
  id: { type: Number, default: Date.now } // Ensure compatibility with frontend expecting an id
});
const Song = mongoose.model('Song', SongSchema);

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
app.post('/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password are required" });

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

app.post('/auth/login', async (req, res) => {
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

    const newSong = new Song({
      title,
      artist,
      fileName: file.filename,
      fileType: file.mimetype,
      fileSize: file.size,
      id: Date.now()
    });
    
    await newSong.save();
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

        const newSong = new Song({
          title,
          artist,
          fileName: file.filename,
          fileType: file.mimetype,
          fileSize: file.size,
          id: Date.now() + Math.floor(Math.random() * 10000)
        });
        
        await newSong.save();
        uploadedSongs.push(newSong);

      } catch (fileErr) {
        if(fs.existsSync(file.path)) fs.unlinkSync(file.path);
        errors.push(`Failed to process ${file.originalname}: ${fileErr.message}`);
      }
    }

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
    const songs = await Song.find().sort({ uploadDate: -1 });
    // Transform songs to map to what the frontend expects
    const formattedSongs = songs.map(song => ({
        id: song.id,
        _id: song._id,
        title: song.title,
        artist: song.artist,
        fileName: song.fileName,
        fileType: song.fileType,
        fileSize: song.fileSize,
        uploadDate: song.uploadDate
    }));
    res.json(formattedSongs);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));