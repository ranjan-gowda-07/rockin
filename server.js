const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { initDb, query } = require('./db');
const { JWT_SECRET, authenticateToken, optionalAuthenticate } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for local uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public/uploads');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'media-' + uniqueSuffix + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|webm|ogg|mov/i;
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;
    if (allowedTypes.test(ext) || allowedTypes.test(mime)) {
      cb(null, true);
    } else {
      cb(new Error('Only images and videos are allowed!'));
    }
  }
});

// REST API ENDPOINTS

// 1. AUTH - Register
app.post('/api/auth/register', async (req, res) => {
  const { username, password, display_name, bio, avatar_url } = req.body;

  if (!username || !password || !display_name) {
    return res.status(400).json({ error: 'Username, password and display name are required' });
  }

  const cleanUsername = username.trim().toLowerCase();
  if (cleanUsername.length < 3 || cleanUsername.length > 20) {
    return res.status(400).json({ error: 'Username must be between 3 and 20 characters' });
  }

  try {
    // Check if user exists
    const existing = await query('SELECT id FROM users WHERE username = $1', [cleanUsername]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const avatar = avatar_url || '';
    const bioText = bio || '';

    // Insert user
    const result = await query(
      `INSERT INTO users (username, password_hash, display_name, avatar_url, bio)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, display_name, avatar_url, bio, followers_count, following_count`,
      [cleanUsername, passwordHash, display_name, avatar, bioText]
    );

    const user = result.rows[0];

    // Sign JWT
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(201).json({ user });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Database error during registration' });
  }
});

// 2. AUTH - Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const result = await query('SELECT * FROM users WHERE username = $1', [username.trim().toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    // Sign JWT
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Don't send password hash
    delete user.password_hash;

    res.json({ user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Database error during login' });
  }
});

// 3. AUTH - Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// 4. AUTH - Me (check current session)
app.get('/api/auth/me', optionalAuthenticate, async (req, res) => {
  if (!req.user) {
    return res.json({ user: null });
  }

  try {
    const result = await query(
      'SELECT id, username, display_name, avatar_url, bio, followers_count, following_count, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      res.clearCookie('token');
      return res.json({ user: null });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Fetch me error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 5. GET User Profile
app.get('/api/users/:username', optionalAuthenticate, async (req, res) => {
  const username = req.params.username.trim().toLowerCase();

  try {
    const result = await query(
      'SELECT id, username, display_name, avatar_url, bio, followers_count, following_count, created_at FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    let isFollowing = false;

    if (req.user) {
      const followResult = await query(
        'SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2',
        [req.user.id, user.id]
      );
      isFollowing = followResult.rows.length > 0;
    }

    // Get stats
    const postsResult = await query('SELECT COUNT(*) as count FROM posts WHERE user_id = $1', [user.id]);
    const likesResult = await query(
      'SELECT COALESCE(SUM(likes_count), 0) as count FROM posts WHERE user_id = $1',
      [user.id]
    );

    const postsCount = parseInt(postsResult.rows[0].count || 0);
    const rocksCount = parseInt(likesResult.rows[0].count || 0);
    // Orbit / reach metric (followers + post count)
    const orbitCount = user.followers_count * 2 + postsCount * 3 + rocksCount;

    res.json({
      user,
      is_following: isFollowing,
      stats: {
        posts: postsCount,
        rocks: rocksCount,
        orbit: orbitCount
      }
    });
  } catch (err) {
    console.error('Fetch profile error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 6. PUT User Profile
app.put('/api/users/me', authenticateToken, async (req, res) => {
  const { display_name, bio, avatar_url } = req.body;

  if (!display_name) {
    return res.status(400).json({ error: 'Display name is required' });
  }

  try {
    const result = await query(
      `UPDATE users
       SET display_name = $1, bio = $2, avatar_url = $3
       WHERE id = $4
       RETURNING id, username, display_name, avatar_url, bio, followers_count, following_count, created_at`,
      [display_name, bio || '', avatar_url || '', req.user.id]
    );

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Database error updating profile' });
  }
});

// 7. GET Feed (followed users + self)
app.get('/api/feed', authenticateToken, async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;

  try {
    const feedResult = await query(
      `SELECT p.id, p.content, p.media_url, p.likes_count, p.comments_count, p.created_at, p.user_id,
              u.username, u.display_name, u.avatar_url,
              EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $1) AS liked_by_me
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1)
          OR p.user_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    // Get stories: circular avatars of users you follow
    const storiesResult = await query(
      `SELECT id, username, display_name, avatar_url
       FROM users
       WHERE id IN (SELECT following_id FROM follows WHERE follower_id = $1)
       LIMIT 15`,
      [req.user.id]
    );

    res.json({
      posts: feedResult.rows,
      stories: storiesResult.rows
    });
  } catch (err) {
    console.error('Fetch feed error:', err);
    res.status(500).json({ error: 'Database error fetching feed' });
  }
});

// 8. GET User Posts (for grid on profile)
app.get('/api/users/:username/posts', optionalAuthenticate, async (req, res) => {
  const username = req.params.username.trim().toLowerCase();
  const limit = parseInt(req.query.limit) || 30;
  const offset = parseInt(req.query.offset) || 0;

  try {
    const userRes = await query('SELECT id FROM users WHERE username = $1', [username]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userRes.rows[0].id;
    const currentUserId = req.user ? req.user.id : -1;

    const postsRes = await query(
      `SELECT p.id, p.content, p.media_url, p.likes_count, p.comments_count, p.created_at, p.user_id,
              u.username, u.display_name, u.avatar_url,
              EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $1) AS liked_by_me
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id = $2
       ORDER BY p.created_at DESC
       LIMIT $3 OFFSET $4`,
      [currentUserId, userId, limit, offset]
    );

    res.json({ posts: postsRes.rows });
  } catch (err) {
    console.error('Fetch user posts error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 9. GET Post Detail
app.get('/api/posts/:id', optionalAuthenticate, async (req, res) => {
  const postId = parseInt(req.params.id);
  const currentUserId = req.user ? req.user.id : -1;

  if (isNaN(postId)) {
    return res.status(400).json({ error: 'Invalid post ID' });
  }

  try {
    const postRes = await query(
      `SELECT p.id, p.content, p.media_url, p.likes_count, p.comments_count, p.created_at, p.user_id,
              u.username, u.display_name, u.avatar_url,
              EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $1) AS liked_by_me
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $2`,
      [currentUserId, postId]
    );

    if (postRes.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Fetch related posts (other popular posts or posts by same user)
    const relatedRes = await query(
      `SELECT p.id, p.content, p.media_url, p.likes_count, p.created_at, u.username, u.display_name, u.avatar_url
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.id != $1
       ORDER BY p.likes_count DESC, p.created_at DESC
       LIMIT 5`,
      [postId]
    );

    res.json({
      post: postRes.rows[0],
      related: relatedRes.rows
    });
  } catch (err) {
    console.error('Fetch post detail error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 10. POST Create Post
app.post('/api/posts', authenticateToken, upload.single('media'), async (req, res) => {
  const { content } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Post content cannot be empty' });
  }

  const mediaUrl = req.file ? `/uploads/${req.file.filename}` : '';

  try {
    const insertRes = await query(
      `INSERT INTO posts (user_id, content, media_url)
       VALUES ($1, $2, $3) RETURNING id`,
      [req.user.id, content, mediaUrl]
    );

    const newPostId = insertRes.rows[0].id;

    // Fetch full post info to return
    const postRes = await query(
      `SELECT p.id, p.content, p.media_url, p.likes_count, p.comments_count, p.created_at, p.user_id,
              u.username, u.display_name, u.avatar_url,
              false AS liked_by_me
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [newPostId]
    );

    res.status(201).json({ success: true, post: postRes.rows[0] });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Database error creating post' });
  }
});

// 11. DELETE Post
app.delete('/api/posts/:id', authenticateToken, async (req, res) => {
  const postId = parseInt(req.params.id);

  try {
    const postCheck = await query('SELECT user_id FROM posts WHERE id = $1', [postId]);
    if (postCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (postCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'You are not authorized to delete this post' });
    }

    await query('DELETE FROM posts WHERE id = $1', [postId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 12. POST Like Post
app.post('/api/posts/:id/like', authenticateToken, async (req, res) => {
  const postId = parseInt(req.params.id);

  try {
    const postCheck = await query('SELECT id FROM posts WHERE id = $1', [postId]);
    if (postCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Try insert into likes (duplicate like caught by UNIQUE key)
    try {
      await query('INSERT INTO likes (user_id, post_id) VALUES ($1, $2)', [req.user.id, postId]);
      // Update like count in posts
      await query('UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1', [postId]);
    } catch (likeErr) {
      // If error is unique constraint, they already liked it. Ignore error.
      console.log('User already liked this post or database conflict.');
    }

    const postRes = await query('SELECT likes_count FROM posts WHERE id = $1', [postId]);
    res.json({ success: true, likes_count: postRes.rows[0].likes_count });
  } catch (err) {
    console.error('Like post error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 13. DELETE Unlike Post
app.delete('/api/posts/:id/like', authenticateToken, async (req, res) => {
  const postId = parseInt(req.params.id);

  try {
    const postCheck = await query('SELECT id FROM posts WHERE id = $1', [postId]);
    if (postCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const deleteRes = await query('DELETE FROM likes WHERE user_id = $1 AND post_id = $2', [req.user.id, postId]);

    // Only decrement if we actually deleted a row
    if (deleteRes.rowCount > 0) {
      await query(
        `UPDATE posts
         SET likes_count = CASE WHEN likes_count > 0 THEN likes_count - 1 ELSE 0 END
         WHERE id = $1`,
        [postId]
      );
    }

    const postRes = await query('SELECT likes_count FROM posts WHERE id = $1', [postId]);
    res.json({ success: true, likes_count: postRes.rows[0].likes_count });
  } catch (err) {
    console.error('Unlike post error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 14. GET Comments
app.get('/api/posts/:id/comments', async (req, res) => {
  const postId = parseInt(req.params.id);

  try {
    const commentsRes = await query(
      `SELECT c.id, c.content, c.created_at, c.user_id,
              u.username, u.display_name, u.avatar_url
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [postId]
    );

    res.json({ comments: commentsRes.rows });
  } catch (err) {
    console.error('Fetch comments error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 15. POST Comment
app.post('/api/posts/:id/comments', authenticateToken, async (req, res) => {
  const postId = parseInt(req.params.id);
  const { content } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Comment content cannot be empty' });
  }

  try {
    const postCheck = await query('SELECT id FROM posts WHERE id = $1', [postId]);
    if (postCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const insertRes = await query(
      `INSERT INTO comments (post_id, user_id, content)
       VALUES ($1, $2, $3) RETURNING id`,
      [postId, req.user.id, content]
    );

    const commentId = insertRes.rows[0].id;

    // Increment comments count
    await query('UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1', [postId]);

    // Fetch full comment detail
    const commentRes = await query(
      `SELECT c.id, c.content, c.created_at, c.user_id,
              u.username, u.display_name, u.avatar_url
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.id = $1`,
      [commentId]
    );

    res.status(201).json({ success: true, comment: commentRes.rows[0] });
  } catch (err) {
    console.error('Create comment error:', err);
    res.status(500).json({ error: 'Database error creating comment' });
  }
});

// 16. POST Follow User
app.post('/api/users/:id/follow', authenticateToken, async (req, res) => {
  const followingId = parseInt(req.params.id);

  if (followingId === req.user.id) {
    return res.status(400).json({ error: 'You cannot follow yourself' });
  }

  try {
    const userCheck = await query('SELECT id FROM users WHERE id = $1', [followingId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User to follow not found' });
    }

    try {
      await query('INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)', [req.user.id, followingId]);

      // Increment counts
      await query('UPDATE users SET following_count = following_count + 1 WHERE id = $1', [req.user.id]);
      await query('UPDATE users SET followers_count = followers_count + 1 WHERE id = $1', [followingId]);
    } catch (followErr) {
      console.log('User already following or database conflict.');
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Follow error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 17. DELETE Unfollow User
app.delete('/api/users/:id/follow', authenticateToken, async (req, res) => {
  const followingId = parseInt(req.params.id);

  try {
    const deleteRes = await query(
      'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
      [req.user.id, followingId]
    );

    if (deleteRes.rowCount > 0) {
      // Decrement counts
      await query(
        `UPDATE users
         SET following_count = CASE WHEN following_count > 0 THEN following_count - 1 ELSE 0 END
         WHERE id = $1`,
        [req.user.id]
      );
      await query(
        `UPDATE users
         SET followers_count = CASE WHEN followers_count > 0 THEN followers_count - 1 ELSE 0 END
         WHERE id = $1`,
        [followingId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Unfollow error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 18. GET Explore (trending hashtags, discover users, live search)
app.get('/api/explore', optionalAuthenticate, async (req, res) => {
  const queryParam = req.query.q ? `%${req.query.q.trim().toLowerCase()}%` : null;
  const currentUserId = req.user ? req.user.id : -1;

  try {
    if (queryParam) {
      // Live search results
      const usersRes = await query(
        `SELECT id, username, display_name, avatar_url, bio, followers_count
         FROM users
         WHERE (LOWER(username) LIKE $1 OR LOWER(display_name) LIKE $1) AND id != $2
         LIMIT 10`,
        [queryParam, currentUserId]
      );

      const postsRes = await query(
        `SELECT p.id, p.content, p.media_url, p.likes_count, p.comments_count, p.created_at, p.user_id,
                u.username, u.display_name, u.avatar_url,
                EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $1) AS liked_by_me
         FROM posts p
         JOIN users u ON p.user_id = u.id
         WHERE LOWER(p.content) LIKE $2
         ORDER BY p.likes_count DESC, p.created_at DESC
         LIMIT 20`,
        [currentUserId, queryParam]
      );

      return res.json({
        users: usersRes.rows,
        posts: postsRes.rows
      });
    } else {
      // Standard explore page view
      // 1. Trending hashtags. Let's pull posts and parse hashtags dynamically
      const postsRes = await query('SELECT content FROM posts ORDER BY created_at DESC LIMIT 100');
      const tagMap = {};

      postsRes.rows.forEach(p => {
        const hashtags = p.content.match(/#[a-zA-Z0-9_]+/g);
        if (hashtags) {
          hashtags.forEach(tag => {
            const cleanTag = tag.toLowerCase();
            tagMap[cleanTag] = (tagMap[cleanTag] || 0) + 1;
          });
        }
      });

      // Sort hashtags by count
      let hashtags = Object.keys(tagMap)
        .map(tag => ({ tag, count: tagMap[tag] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15)
        .map(item => item.tag);

      // Default cosmic tags if none in db
      if (hashtags.length === 0) {
        hashtags = [
          '#ZeroGravity',
          '#SpaceMono',
          '#SyneRock',
          '#VoidBeats',
          '#OrbitJam',
          '#NebulaRock',
          '#CrimsonStardust',
          '#AntigravitySound',
          '#Rockin'
        ];
      }

      // 2. Discover users: users the current user does not follow
      let discoverRes;
      if (currentUserId !== -1) {
        discoverRes = await query(
          `SELECT id, username, display_name, avatar_url, bio
           FROM users
           WHERE id != $1 AND id NOT IN (SELECT following_id FROM follows WHERE follower_id = $1)
           ORDER BY followers_count DESC, id DESC
           LIMIT 10`,
          [currentUserId]
        );
      } else {
        discoverRes = await query(
          `SELECT id, username, display_name, avatar_url, bio
           FROM users
           ORDER BY followers_count DESC, id DESC
           LIMIT 10`
        );
      }

      res.json({
        hashtags,
        users: discoverRes.rows
      });
    }
  } catch (err) {
    console.error('Explore error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Serve frontend SPA for all non-API paths (History API support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database then start server
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Rockin server defying gravity on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database. Server cannot start.', err);
  });
