// Rockin SPA Client Logic

// Global state
let currentUser = null;
let currentPath = window.location.pathname;

// Default tags for autocomplete/explore
const COSMIC_TAGS = [
  '#ZeroGravity', '#SpaceMono', '#SyneRock', '#VoidBeats', '#OrbitJam',
  '#NebulaRock', '#CrimsonStardust', '#AntigravitySound', '#Rockin',
  '#ZeroG', '#SpaceRock', '#CosmicBeats', '#Starlight', '#Antigravity',
  '#VoidMusic', '#Orbit', '#NebulaRebel'
];

// Document loaded entry point
document.addEventListener('DOMContentLoaded', async () => {
  initStarfield();
  await checkSession();
  setupGlobalListeners();
  handleRoute();
  
  // Intercept links
  document.body.addEventListener('click', e => {
    const link = e.target.closest('[data-route]');
    if (link) {
      e.preventDefault();
      const route = link.getAttribute('data-route');
      navigateTo(route);
    }
  });

  // Handle browser back/forward buttons
  window.addEventListener('popstate', () => {
    handleRoute();
  });
});

// 1. Starfield Background Particle Animation
function initStarfield() {
  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  let stars = [];
  const maxStars = 100;
  
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  
  window.addEventListener('resize', resize);
  resize();
  
  // Create stars
  for (let i = 0; i < maxStars; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 1.5,
      alpha: Math.random(),
      speed: 0.03 + Math.random() * 0.1,
      color: ['#e24b4a', '#7f77dd', '#378add', '#ffffff', '#ffffff'][Math.floor(Math.random() * 5)]
    });
  }
  
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw near-black background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw stars
    stars.forEach(star => {
      ctx.save();
      ctx.globalAlpha = star.alpha;
      ctx.fillStyle = star.color;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      
      // Gentle floating upwards
      star.y -= star.speed;
      if (star.y < 0) {
        star.y = canvas.height;
        star.x = Math.random() * canvas.width;
      }
      
      // Blink
      star.alpha += (Math.random() - 0.5) * 0.05;
      if (star.alpha < 0.1) star.alpha = 0.1;
      if (star.alpha > 0.9) star.alpha = 0.9;
    });
    
    requestAnimationFrame(animate);
  }
  
  animate();
}

// 2. Auth & Session Management
async function checkSession() {
  showLoader();
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    currentUser = data.user;
    updateHeaderAuthUI();
    updateNavigationUI();
  } catch (err) {
    console.error('Session check failed:', err);
    currentUser = null;
  } finally {
    hideLoader();
  }
}

function updateHeaderAuthUI() {
  const headerActions = document.getElementById('header-auth-actions');
  if (!headerActions) return;

  if (currentUser) {
    headerActions.innerHTML = `
      <div class="user-badge" id="header-user-badge" data-route="/profile/${currentUser.username}">
        <img src="${currentUser.avatar_url || '/assets/default_avatar.png'}" alt="${currentUser.display_name}">
        <span>${currentUser.display_name}</span>
      </div>
      <button class="header-btn" id="logout-btn">
        <i data-lucide="log-out" style="width: 14px; height: 14px; display: inline; vertical-align: middle;"></i>
      </button>
    `;
    
    document.getElementById('logout-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      showLoader();
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
        currentUser = null;
        updateHeaderAuthUI();
        updateNavigationUI();
        showToast('Left orbit. Logout successful.');
        navigateTo('/login');
      } catch (err) {
        showToast('Error leaving orbit.');
      } finally {
        hideLoader();
      }
    });
  } else {
    headerActions.innerHTML = `
      <button class="header-btn" data-route="/login">Login</button>
      <button class="header-btn-primary" data-route="/register">Sign Up</button>
    `;
  }
  lucide.createIcons();
}

function updateNavigationUI() {
  const mainNav = document.getElementById('main-nav');
  if (!mainNav) return;

  if (currentUser) {
    mainNav.classList.remove('hidden');
    // Set active link in nav
    const path = window.location.pathname;
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
      item.classList.remove('active');
      const route = item.getAttribute('data-route');
      if (route && (path === route || (route === '/profile' && path.startsWith('/profile/')))) {
        item.classList.add('active');
      }
    });
  } else {
    mainNav.classList.add('hidden');
  }
}

// 3. Client Side Routing
function navigateTo(url) {
  history.pushState(null, null, url);
  handleRoute();
}

function handleRoute() {
  const path = window.location.pathname;
  updateNavigationUI();

  // Route protection
  const protectedRoutes = ['/', '/explore', '/profile'];
  const isProfileRoute = path.startsWith('/profile');
  const isPostRoute = path.startsWith('/post/');
  
  if (!currentUser && (protectedRoutes.includes(path) || isProfileRoute || isPostRoute) && path !== '/login' && path !== '/register') {
    navigateTo('/login');
    return;
  }

  if (path === '/login') {
    renderAuth('login');
  } else if (path === '/register') {
    renderAuth('register');
  } else if (path === '/explore') {
    renderExplore();
  } else if (path.startsWith('/profile/')) {
    const username = path.split('/profile/')[1];
    renderProfile(username);
  } else if (path === '/profile') {
    if (currentUser) {
      navigateTo(`/profile/${currentUser.username}`);
    } else {
      navigateTo('/login');
    }
  } else if (path.startsWith('/post/')) {
    const id = path.split('/post/')[1];
    renderPostDetail(id);
  } else if (path === '/') {
    renderFeed();
  } else {
    renderFeed(); // Fallback
  }
}

// 4. Toast & Loader Helpers
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerText = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('show'), 50);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 3000);
}

function showLoader() {
  const loader = document.getElementById('global-loader');
  if (loader) loader.classList.remove('hidden');
}

function hideLoader() {
  const loader = document.getElementById('global-loader');
  if (loader) loader.classList.add('hidden');
}

// 5. Global Listeners Setup
function setupGlobalListeners() {
  const modal = document.getElementById('create-post-modal');
  const trigger = document.getElementById('nav-create-trigger');
  const close = document.getElementById('create-modal-close');
  const fileInput = document.getElementById('post-media-input');
  const textarea = document.getElementById('post-content-input');
  const charCounter = document.getElementById('char-counter');
  const form = document.getElementById('create-post-form');
  const removePreviewBtn = document.getElementById('remove-preview-btn');

  // Trigger Create Modal
  if (trigger && modal) {
    trigger.addEventListener('click', () => {
      modal.classList.remove('hidden');
      textarea.focus();
    });
  }

  // Close Create Modal
  if (close && modal) {
    close.addEventListener('click', () => {
      modal.classList.add('hidden');
      resetCreatePostForm();
    });
  }

  // Textarea Counter & Hashtag Autocomplete
  if (textarea) {
    textarea.addEventListener('input', (e) => {
      const len = textarea.value.length;
      charCounter.innerText = `${len}/500`;
      handleHashtagAutocomplete(e);
    });
  }

  // Media preview
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const previewContainer = document.getElementById('preview-container');
          const imgPreview = document.getElementById('image-preview');
          const videoPreview = document.getElementById('video-preview');

          previewContainer.classList.remove('hidden');
          
          if (file.type.startsWith('image/')) {
            imgPreview.src = e.target.result;
            imgPreview.classList.remove('hidden');
            videoPreview.classList.add('hidden');
          } else if (file.type.startsWith('video/')) {
            videoPreview.src = e.target.result;
            videoPreview.classList.remove('hidden');
            imgPreview.classList.add('hidden');
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Remove preview button
  if (removePreviewBtn) {
    removePreviewBtn.addEventListener('click', () => {
      fileInput.value = '';
      document.getElementById('preview-container').classList.add('hidden');
      document.getElementById('image-preview').src = '';
      document.getElementById('video-preview').src = '';
    });
  }

  // Launch Post Form Submit
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const launchBtn = document.getElementById('launch-post-btn');
      launchBtn.classList.add('launching');
      
      const formData = new FormData();
      formData.append('content', textarea.value);
      if (fileInput.files[0]) {
        formData.append('media', fileInput.files[0]);
      }

      try {
        const res = await fetch('/api/posts', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        
        if (res.ok) {
          showToast('Launch successful! Post entered orbit.');
          setTimeout(() => {
            modal.classList.add('hidden');
            resetCreatePostForm();
            // Refresh feed if on feed page
            if (window.location.pathname === '/') {
              renderFeed();
            } else {
              navigateTo('/');
            }
          }, 800); // Wait for rocket animation to finish
        } else {
          showToast(data.error || 'Failed to launch post');
          launchBtn.classList.remove('launching');
        }
      } catch (err) {
        showToast('Transmissions lost in space. Retry.');
        launchBtn.classList.remove('launching');
      }
    });
  }
}

function resetCreatePostForm() {
  document.getElementById('create-post-form').reset();
  document.getElementById('preview-container').classList.add('hidden');
  document.getElementById('image-preview').src = '';
  document.getElementById('video-preview').src = '';
  document.getElementById('char-counter').innerText = '0/500';
  document.getElementById('launch-post-btn').classList.remove('launching');
  document.getElementById('hashtag-suggestions').classList.add('hidden');
}

// 6. Hashtag Autocomplete System
function handleHashtagAutocomplete(e) {
  const textarea = e.target;
  const value = textarea.value;
  const cursorPosition = textarea.selectionStart;
  
  // Find current word before cursor
  const textBeforeCursor = value.substring(0, cursorPosition);
  const words = textBeforeCursor.split(/\s+/);
  const currentWord = words[words.length - 1];

  const suggestionBox = document.getElementById('hashtag-suggestions');

  if (currentWord && currentWord.startsWith('#')) {
    const query = currentWord.toLowerCase();
    const matches = COSMIC_TAGS.filter(tag => tag.toLowerCase().startsWith(query) && tag.toLowerCase() !== query);
    
    if (matches.length > 0) {
      suggestionBox.innerHTML = matches.map(tag => `<span class="suggestion-tag">${tag}</span>`).join('');
      suggestionBox.classList.remove('hidden');

      // Click event for suggestions
      suggestionBox.querySelectorAll('.suggestion-tag').forEach(el => {
        el.addEventListener('click', () => {
          const selectedTag = el.innerText;
          const textAfterCursor = value.substring(cursorPosition);
          
          // Replace query word with selected tag
          const wordsBefore = words.slice(0, words.length - 1).join(' ');
          const connector = wordsBefore ? ' ' : '';
          textarea.value = wordsBefore + connector + selectedTag + ' ' + textAfterCursor;
          
          suggestionBox.classList.add('hidden');
          textarea.focus();
          
          // Reset cursor
          const newCursorPos = (wordsBefore + connector + selectedTag + ' ').length;
          textarea.setSelectionRange(newCursorPos, newCursorPos);
          document.getElementById('char-counter').innerText = `${textarea.value.length}/500`;
        });
      });
      return;
    }
  }
  suggestionBox.classList.add('hidden');
}

// 7. RENDER VIEW: AUTH PAGE (Login / Register)
function renderAuth(mode) {
  const container = document.getElementById('app-view');
  
  const title = mode === 'login' ? 'Login' : 'Sign Up';
  const tagline = mode === 'login' ? 'Defy gravity with your beats' : 'Register your coordinate in orbit';
  const actionText = mode === 'login' ? 'Enter Orbit' : 'Launch Orbit';
  
  let registerFields = '';
  if (mode === 'register') {
    registerFields = `
      <div class="form-group">
        <label for="display-name-input">Display Name</label>
        <input type="text" id="display-name-input" placeholder="Cosmic Rebel" required>
      </div>
      <div class="form-group">
        <label for="bio-input">Cosmic Bio</label>
        <textarea id="bio-input" placeholder="Synthesizing gravity in quadrant 4..." maxlength="160"></textarea>
      </div>
      <div class="form-group">
        <label for="avatar-url-input">Avatar Image URL (Optional)</label>
        <input type="url" id="avatar-url-input" placeholder="https://example.com/star.png">
      </div>
    `;
  }

  container.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <h2 class="auth-logo">Rockin 🪨</h2>
        <p class="auth-tagline">${tagline}</p>
        
        <form id="auth-form">
          <div class="form-group">
            <label for="username-input">Username</label>
            <input type="text" id="username-input" placeholder="spacedust" required minlength="3">
          </div>
          <div class="form-group">
            <label for="password-input">Security Code (Password)</label>
            <input type="password" id="password-input" placeholder="••••••••" required minlength="6">
          </div>
          ${registerFields}
          
          <button type="submit" class="auth-submit-btn">${actionText}</button>
        </form>
        
        <div class="auth-switch">
          ${mode === 'login' 
            ? `New to the system? <a href="/register" data-route="/register">Register Coordinate</a>` 
            : `Already in orbit? <a href="/login" data-route="/login">Login Securely</a>`}
        </div>
      </div>
    </div>
  `;

  // Submit Handler
  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    
    const username = document.getElementById('username-input').value;
    const password = document.getElementById('password-input').value;
    
    let payload = { username, password };
    let endpoint = '/api/auth/login';
    
    if (mode === 'register') {
      endpoint = '/api/auth/register';
      payload.display_name = document.getElementById('display-name-input').value;
      payload.bio = document.getElementById('bio-input').value;
      payload.avatar_url = document.getElementById('avatar-url-input').value;
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (res.ok) {
        currentUser = data.user;
        updateHeaderAuthUI();
        updateNavigationUI();
        showToast(mode === 'login' ? 'Secure lock established. Welcome.' : 'Coordinates registered. Welcome to Rockin.');
        navigateTo('/');
      } else {
        showToast(data.error || 'Authentication transmission failed');
      }
    } catch (err) {
      showToast('Connection interrupted. Try again.');
    } finally {
      hideLoader();
    }
  });
}

// 8. RENDER VIEW: HOME FEED
let feedOffset = 0;
let feedLoading = false;
let feedHasMore = true;

async function renderFeed() {
  const container = document.getElementById('app-view');
  
  // Set active link in nav
  updateNavigationUI();
  
  container.innerHTML = `
    <!-- Top Stories Bar -->
    <div class="stories-container" id="stories-bar"></div>
    
    <!-- Feed Posts Container -->
    <div id="feed-posts-list"></div>
    
    <!-- Infinite scroll loading indicator -->
    <div id="feed-scroll-trigger" style="height: 20px; text-align: center; font-size: 11px; color: var(--text-muted); margin-bottom: 20px;"></div>
  `;

  feedOffset = 0;
  feedHasMore = true;
  await fetchFeedChunk();

  // Setup infinite scroll listener
  window.onscroll = () => {
    if (feedLoading || !feedHasMore) return;
    
    const trigger = document.getElementById('feed-scroll-trigger');
    if (!trigger) return;
    
    const rect = trigger.getBoundingClientRect();
    if (rect.top <= window.innerHeight + 100) {
      fetchFeedChunk();
    }
  };
}

async function fetchFeedChunk() {
  if (feedLoading) return;
  feedLoading = true;
  
  const list = document.getElementById('feed-posts-list');
  const trigger = document.getElementById('feed-scroll-trigger');
  
  if (feedOffset === 0) {
    showLoader();
  } else if (trigger) {
    trigger.innerText = 'Syncing orbits...';
  }

  try {
    const res = await fetch(`/api/feed?limit=10&offset=${feedOffset}`);
    const data = await res.json();
    
    if (res.ok) {
      // 1. Stories Bar (only on first load)
      if (feedOffset === 0) {
        const storiesBar = document.getElementById('stories-bar');
        if (storiesBar) {
          if (data.stories && data.stories.length > 0) {
            storiesBar.innerHTML = data.stories.map(u => `
              <div class="story-item" data-route="/profile/${u.username}">
                <div class="story-avatar-ring">
                  <img src="${u.avatar_url || '/assets/default_avatar.png'}" alt="${u.display_name}">
                </div>
                <span class="story-username">${u.display_name}</span>
              </div>
            `).join('');
          } else {
            // Put user's own avatar as story to prompt activity
            storiesBar.innerHTML = `
              <div class="story-item" data-route="/profile/${currentUser.username}">
                <div class="story-avatar-ring">
                  <img src="${currentUser.avatar_url || '/assets/default_avatar.png'}" alt="You">
                </div>
                <span class="story-username">You</span>
              </div>
            `;
          }
        }
      }

      // 2. Feed Posts
      if (data.posts.length === 0 && feedOffset === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <img src="/assets/astronaut.png" alt="Floating Astronaut">
            <h3 class="empty-title">No posts in orbit yet</h3>
            <p class="empty-desc">The cosmic void awaits. Follow others or launch your own post to defy gravity!</p>
          </div>
        `;
        feedHasMore = false;
        if (trigger) trigger.innerText = '';
      } else {
        // Randomize float speed classes on cards
        const floatClasses = ['float-slow', 'float-medium', 'float-fast'];
        
        data.posts.forEach((post, index) => {
          const floatClass = floatClasses[(index + feedOffset) % 3];
          const card = createPostCardHTML(post, floatClass);
          list.appendChild(card);
        });
        
        lucide.createIcons();
        setupPostCardInteractions(list);
        
        if (data.posts.length < 10) {
          feedHasMore = false;
          if (trigger) trigger.innerText = 'Reached the boundary of the solar system.';
        } else {
          feedOffset += 10;
          if (trigger) trigger.innerText = 'Scroll to pull more orbits';
        }
      }
    } else {
      showToast(data.error || 'Failed to fetch feeds');
    }
  } catch (err) {
    showToast('Failed to connect to feed frequency.');
  } finally {
    feedLoading = false;
    hideLoader();
  }
}

// 9. HELPER: Create Post Card DOM Element
function createPostCardHTML(post, floatClass) {
  const card = document.createElement('div');
  card.className = `post-card ${floatClass}`;
  card.dataset.postId = post.id;

  const isMyPost = currentUser && post.user_id === currentUser.id;
  const isLiked = post.liked_by_me ? 'liked' : '';
  const dateStr = formatTimestamp(post.created_at);
  
  // Format content to turn hashtags into links
  const formattedContent = post.content.replace(/#[a-zA-Z0-9_]+/g, match => {
    return `<a href="/explore?q=${encodeURIComponent(match)}" class="hashtag" data-route="/explore?q=${encodeURIComponent(match)}">${match}</a>`;
  });

  let mediaHtml = '';
  if (post.media_url) {
    const isVideo = post.media_url.match(/\.(mp4|webm|ogg|mov)$/i);
    if (isVideo) {
      mediaHtml = `
        <div class="post-media-container">
          <video src="${post.media_url}" controls preload="metadata"></video>
        </div>
      `;
    } else {
      mediaHtml = `
        <div class="post-media-container">
          <img src="${post.media_url}" alt="Post media" loading="lazy">
        </div>
      `;
    }
  }

  // Delete button if owner
  const deleteBtn = isMyPost ? `
    <button class="action-btn delete-btn" title="Delete Post">
      <i data-lucide="trash-2"></i>
    </button>
  ` : '';

  card.innerHTML = `
    <div class="card-header">
      <div class="user-info" data-route="/profile/${post.username}">
        <div class="avatar-wrapper">
          <img class="avatar-img" src="${post.avatar_url || '/assets/default_avatar.png'}" alt="${post.display_name}">
        </div>
        <div class="user-names">
          <span class="display-name">${post.display_name}</span>
          <span class="username-handle">@${post.username}</span>
        </div>
      </div>
      <span class="post-time">${dateStr}</span>
    </div>
    
    <div class="card-content">
      <p>${formattedContent}</p>
    </div>
    
    ${mediaHtml}
    
    <div class="card-actions">
      <button class="action-btn like-btn ${isLiked}">
        <i data-lucide="heart"></i>
        <span class="likes-count">${post.likes_count}</span>
      </button>
      
      <button class="action-btn comment-btn" data-route="/post/${post.id}">
        <i data-lucide="message-square"></i>
        <span>${post.comments_count}</span>
      </button>
      
      <button class="action-btn share-btn" title="Copy coordinates (Link)">
        <i data-lucide="share-2"></i>
      </button>
      
      ${deleteBtn}
    </div>
    
    <div class="card-comments-preview" id="comments-preview-${post.id}">
      <!-- Preview top 2 comments if comments exist, dynamic check below -->
    </div>
  `;

  // Fetch comment preview immediately for feed cards
  fetchCommentPreview(post.id, card.querySelector(`.card-comments-preview`));

  return card;
}

// 10. COMMENT PREVIEW FETCH
async function fetchCommentPreview(postId, container) {
  try {
    const res = await fetch(`/api/posts/${postId}/comments`);
    if (res.ok) {
      const data = await res.json();
      if (data.comments && data.comments.length > 0) {
        const topComments = data.comments.slice(0, 2);
        let html = topComments.map(c => `
          <div class="comment-preview-item">
            <span class="comment-preview-author" data-route="/profile/${c.username}">@${c.username}:</span>
            <span class="comment-preview-content">${c.content}</span>
          </div>
        `).join('');
        
        if (data.comments.length > 2) {
          html += `<button class="view-all-comments" data-route="/post/${postId}">View all ${data.comments.length} stellar transmissions...</button>`;
        }
        container.innerHTML = html;
      }
    }
  } catch (err) {
    console.error('Comment preview load failed:', err);
  }
}

// 11. HELPER: Post Card Interaction (Likes, Share, Delete)
function setupPostCardInteractions(parent) {
  // Like button handler
  parent.querySelectorAll('.like-btn').forEach(btn => {
    // Prevent duplicate event handlers
    if (btn.dataset.listened) return;
    btn.dataset.listened = 'true';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const card = btn.closest('.post-card');
      const postId = card.dataset.postId;
      const isLiked = btn.classList.contains('liked');
      
      const method = isLiked ? 'DELETE' : 'POST';
      
      try {
        const res = await fetch(`/api/posts/${postId}/like`, { method });
        const data = await res.json();
        
        if (res.ok) {
          btn.querySelector('.likes-count').innerText = data.likes_count;
          if (isLiked) {
            btn.classList.remove('liked');
          } else {
            btn.classList.add('liked');
            createHeartBurst(btn);
          }
        } else {
          showToast(data.error);
        }
      } catch (err) {
        showToast('Telemetry error during like transmission');
      }
    });
  });

  // Share button handler
  parent.querySelectorAll('.share-btn').forEach(btn => {
    if (btn.dataset.listened) return;
    btn.dataset.listened = 'true';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const card = btn.closest('.post-card');
      const postId = card.dataset.postId;
      const url = `${window.location.origin}/post/${postId}`;
      
      navigator.clipboard.writeText(url)
        .then(() => showToast('Coordinates copied! Link entered clipboard.'))
        .catch(() => showToast('Link copy failed.'));
    });
  });

  // Delete button handler
  parent.querySelectorAll('.delete-btn').forEach(btn => {
    if (btn.dataset.listened) return;
    btn.dataset.listened = 'true';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const card = btn.closest('.post-card');
      const postId = card.dataset.postId;
      
      if (!confirm('Are you sure you want to delete this post from space?')) return;
      
      showLoader();
      try {
        const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
        if (res.ok) {
          showToast('Post destroyed. Deorbited successfully.');
          card.style.opacity = '0';
          card.style.transform = 'scale(0.8) translateY(-50px)';
          setTimeout(() => card.remove(), 400);
        } else {
          const data = await res.json();
          showToast(data.error);
        }
      } catch (err) {
        showToast('Deorbit command failed.');
      } finally {
        hideLoader();
      }
    });
  });
}

// 12. CANVAS HEART BURST LIKE ANIMATION
function createHeartBurst(button) {
  // Create a canvas relative to the heart icon
  const canvas = document.createElement('canvas');
  canvas.className = 'like-canvas';
  button.appendChild(canvas);
  
  const ctx = canvas.getContext('2d');
  canvas.width = 116;
  canvas.height = 116;
  
  const particles = [];
  const particleCount = 10;
  
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: 58,
      y: 58,
      vx: (Math.random() - 0.5) * 5,
      vy: (Math.random() - 0.5) * 5 - 2, // slightly upward force
      radius: 3 + Math.random() * 4,
      alpha: 1,
      decay: 0.03 + Math.random() * 0.03,
      color: Math.random() > 0.5 ? '#e24b4a' : '#7f77dd'
    });
  }
  
  function drawParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let active = false;
    
    particles.forEach(p => {
      if (p.alpha > 0) {
        active = true;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        
        ctx.beginPath();
        const x = p.x;
        const y = p.y;
        const r = p.radius;
        
        // Simple canvas heart shape
        ctx.moveTo(x, y + r / 4);
        ctx.quadraticCurveTo(x, y - r / 2, x + r / 2, y - r / 2);
        ctx.quadraticCurveTo(x + r, y - r / 2, x + r, y + r / 4);
        ctx.quadraticCurveTo(x + r, y + r * 0.75, x, y + r * 1.25);
        ctx.quadraticCurveTo(x - r, y + r * 0.75, x - r, y + r / 4);
        ctx.quadraticCurveTo(x - r, y - r / 2, x - r / 2, y - r / 2);
        ctx.quadraticCurveTo(x, y - r / 2, x, y + r / 4);
        
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        
        // Update variables
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;
      }
    });
    
    if (active) {
      requestAnimationFrame(drawParticles);
    } else {
      canvas.remove();
    }
  }
  
  drawParticles();
}

// 13. RENDER VIEW: USER PROFILE
let profilePostView = 'grid'; // grid or list

async function renderProfile(username) {
  const container = document.getElementById('app-view');
  showLoader();
  
  try {
    const res = await fetch(`/api/users/${username}`);
    const data = await res.json();
    
    if (!res.ok) {
      container.innerHTML = `
        <div class="empty-state">
          <i data-lucide="frown" style="width: 54px; height: 54px; color: var(--crimson); margin-bottom: 12px;"></i>
          <h3 class="empty-title">Unknown coordinates</h3>
          <p class="empty-desc">This cosmic entity has not registered its orbit coordinates.</p>
          <button class="header-btn" style="margin-top: 16px;" data-route="/">Back to home</button>
        </div>
      `;
      lucide.createIcons();
      hideLoader();
      return;
    }

    const { user, is_following, stats } = data;
    const isMe = currentUser && user.id === currentUser.id;
    const isFollowingClass = is_following ? 'following' : '';
    const followText = is_following ? 'Following' : 'Follow';
    
    // Follow button/Edit profile HTML
    let actionBtnHtml = '';
    if (isMe) {
      actionBtnHtml = `<button class="edit-profile-btn" id="edit-profile-trigger">Edit Bio</button>`;
    } else {
      actionBtnHtml = `<button class="follow-btn ${isFollowingClass}" id="follow-trigger">${followText}</button>`;
    }

    container.innerHTML = `
      <div class="profile-container">
        <!-- Parallax Hero -->
        <div class="profile-hero" id="profile-hero-banner">
          <div class="parallax-bg" id="profile-banner-bg"></div>
          <div class="profile-avatar-container">
            <div class="profile-avatar-wrapper">
              <img src="${user.avatar_url || '/assets/default_avatar.png'}" alt="${user.display_name}">
              <!-- Orbit Ring surrounding avatar -->
              <div class="profile-orbit-ring ${is_following ? 'following' : ''}" id="profile-avatar-orbit"></div>
            </div>
          </div>
        </div>

        <!-- Follow/Edit Actions -->
        <div class="profile-header-actions">
          ${actionBtnHtml}
        </div>

        <!-- Bio Details -->
        <div class="profile-info">
          <div class="profile-name-handle">
            <h2 class="profile-name">${user.display_name}</h2>
            <div class="profile-handle">@${user.username}</div>
          </div>
          <p class="profile-bio">${user.bio || 'Zero gravity music enthusiast. No bio signal transmitted yet.'}</p>
        </div>

        <!-- Stats Dashboard -->
        <div class="profile-stats-dashboard">
          <div class="stat-card">
            <span class="stat-value">${stats.posts}</span>
            <span class="stat-label">Posts</span>
          </div>
          <div class="stat-card" title="Total rocks (likes) received across all posts">
            <span class="stat-value">${stats.rocks}</span>
            <span class="stat-label">Rocks</span>
          </div>
          <div class="stat-card" title="Total reach calculated from follower count, posts and rocks">
            <span class="stat-value">${stats.orbit}</span>
            <span class="stat-label">Orbit</span>
          </div>
        </div>

        <!-- Layout Toggle Bar -->
        <div class="layout-toggle-bar">
          <button class="toggle-btn ${profilePostView === 'grid' ? 'active' : ''}" id="toggle-grid-btn">
            <i data-lucide="grid"></i>
          </button>
          <button class="toggle-btn ${profilePostView === 'list' ? 'active' : ''}" id="toggle-list-btn">
            <i data-lucide="list"></i>
          </button>
        </div>

        <!-- Posts Area -->
        <div id="profile-posts-container"></div>
      </div>

      <!-- Edit Profile Modal inside page -->
      <div class="modal-overlay hidden" id="edit-profile-modal">
        <div class="modal-card">
          <div class="modal-header">
            <h2>Edit Coordinate Bio</h2>
            <button class="close-btn" id="edit-modal-close"><i data-lucide="x"></i></button>
          </div>
          <form id="edit-profile-form">
            <div class="form-group">
              <label for="edit-display-name">Display Name</label>
              <input type="text" id="edit-display-name" value="${user.display_name}" required>
            </div>
            <div class="form-group">
              <label for="edit-bio">Bio Signal</label>
              <textarea id="edit-bio" maxlength="160" rows="3">${user.bio || ''}</textarea>
            </div>
            <div class="form-group">
              <label for="edit-avatar">Avatar URL</label>
              <input type="url" id="edit-avatar" value="${user.avatar_url || ''}">
            </div>
            <div style="display: flex; justify-content: flex-end;">
              <button type="submit" class="header-btn-primary" style="padding: 10px 20px;">Save changes</button>
            </div>
          </form>
        </div>
      </div>
    `;

    lucide.createIcons();

    // Parallax scroll binding
    const hero = document.getElementById('profile-hero-banner');
    const bg = document.getElementById('profile-banner-bg');
    window.onscroll = () => {
      if (hero && bg) {
        const scrolled = window.pageYOffset;
        bg.style.transform = `translateY(${scrolled * 0.4}px)`;
      }
    };

    // Edit Profile Modal binding
    if (isMe) {
      const editModal = document.getElementById('edit-profile-modal');
      document.getElementById('edit-profile-trigger').addEventListener('click', () => {
        editModal.classList.remove('hidden');
      });
      document.getElementById('edit-modal-close').addEventListener('click', () => {
        editModal.classList.add('hidden');
      });
      document.getElementById('edit-profile-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoader();
        try {
          const res = await fetch('/api/users/me', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              display_name: document.getElementById('edit-display-name').value,
              bio: document.getElementById('edit-bio').value,
              avatar_url: document.getElementById('edit-avatar').value
            })
          });
          const data = await res.json();
          if (res.ok) {
            currentUser = data.user;
            updateHeaderAuthUI();
            showToast('Bio signals updated.');
            editModal.classList.add('hidden');
            renderProfile(username);
          } else {
            showToast(data.error);
          }
        } catch (err) {
          showToast('Failed to update bio details.');
        } finally {
          hideLoader();
        }
      });
    } else {
      // Follow binding
      document.getElementById('follow-trigger').addEventListener('click', async () => {
        const btn = document.getElementById('follow-trigger');
        const isFollowing = btn.classList.contains('following');
        const method = isFollowing ? 'DELETE' : 'POST';
        const orbit = document.getElementById('profile-avatar-orbit');

        try {
          const res = await fetch(`/api/users/${user.id}/follow`, { method });
          if (res.ok) {
            if (isFollowing) {
              btn.classList.remove('following');
              btn.innerText = 'Follow';
              orbit.classList.remove('following');
              showToast(`Left orbit of @${user.username}`);
            } else {
              btn.classList.add('following');
              btn.innerText = 'Following';
              orbit.classList.add('following');
              showToast(`Entered orbit of @${user.username}`);
            }
            // Refresh stats only (simpler than full render)
            setTimeout(() => renderProfile(username), 500);
          } else {
            const data = await res.json();
            showToast(data.error);
          }
        } catch (err) {
          showToast('Telemetry follow transmission failed.');
        }
      });
    }

    // Grid vs List Bindings
    document.getElementById('toggle-grid-btn').addEventListener('click', () => {
      profilePostView = 'grid';
      document.getElementById('toggle-grid-btn').classList.add('active');
      document.getElementById('toggle-list-btn').classList.remove('active');
      renderProfilePosts(user.id);
    });
    
    document.getElementById('toggle-list-btn').addEventListener('click', () => {
      profilePostView = 'list';
      document.getElementById('toggle-list-btn').classList.add('active');
      document.getElementById('toggle-grid-btn').classList.remove('active');
      renderProfilePosts(user.id);
    });

    // Fetch and render the posts
    await renderProfilePosts(user.id);

  } catch (err) {
    console.error('Profile render failed:', err);
    showToast('Failed to retrieve space signals.');
  } finally {
    hideLoader();
  }
}

async function renderProfilePosts(userId) {
  const container = document.getElementById('profile-posts-container');
  if (!container) return;

  container.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 11px;">Syncing log grids...</div>`;

  try {
    const res = await fetch(`/api/users/${currentUser.username}/posts`); // Quick fetch to find user handle
    // Actually, let's fetch directly from our specific endpoint:
    const profileRes = await fetch(`/api/users/me`); // to get current page user's handle
    const username = window.location.pathname.split('/profile/')[1];
    
    const postsRes = await fetch(`/api/users/${username}/posts`);
    const data = await postsRes.json();
    
    if (postsRes.ok) {
      if (data.posts.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="padding: 20px;">
            <p class="empty-title">Log is empty</p>
            <p class="empty-desc">No orbital transmissions logged by this username.</p>
          </div>
        `;
        return;
      }

      if (profilePostView === 'grid') {
        let gridHtml = `<div class="posts-grid">`;
        data.posts.forEach(p => {
          let mediaHtml = '';
          if (p.media_url) {
            const isVideo = p.media_url.match(/\.(mp4|webm|ogg|mov)$/i);
            if (isVideo) {
              mediaHtml = `<video src="${p.media_url}" preload="metadata"></video>`;
            } else {
              mediaHtml = `<img src="${p.media_url}" alt="Post thumbnail">`;
            }
          } else {
            const sliceContent = p.content.substring(0, 40) + (p.content.length > 40 ? '...' : '');
            mediaHtml = `<div class="grid-text-post">${sliceContent}</div>`;
          }

          gridHtml += `
            <div class="grid-post-item" data-route="/post/${p.id}">
              ${mediaHtml}
              <div class="grid-post-overlay">
                <span class="grid-stat"><i data-lucide="heart"></i> ${p.likes_count}</span>
                <span class="grid-stat"><i data-lucide="message-square"></i> ${p.comments_count}</span>
              </div>
            </div>
          `;
        });
        gridHtml += `</div>`;
        container.innerHTML = gridHtml;
        lucide.createIcons();
      } else {
        // List mode (same cards as Feed page)
        container.innerHTML = '';
        const floatClasses = ['float-slow', 'float-medium', 'float-fast'];
        data.posts.forEach((post, index) => {
          const card = createPostCardHTML(post, floatClasses[index % 3]);
          container.appendChild(card);
        });
        lucide.createIcons();
        setupPostCardInteractions(container);
      }
    }
  } catch (err) {
    container.innerHTML = `<div style="text-align: center; color: var(--crimson); font-size: 11px;">Grid sync error.</div>`;
  }
}

// 14. RENDER VIEW: EXPLORE PAGE
let exploreDebounceTimer = null;

async function renderExplore() {
  const container = document.getElementById('app-view');
  
  // Parse query parameter if preset
  const searchParams = new URLSearchParams(window.location.search);
  const searchQ = searchParams.get('q') || '';

  container.innerHTML = `
    <div class="explore-container">
      <!-- Search Bar -->
      <div class="search-wrapper">
        <i data-lucide="search"></i>
        <input type="text" id="explore-search-input" value="${searchQ}" placeholder="Search cosmic entities, hashtags or beats..." autocomplete="off">
      </div>

      <!-- Explore content results -->
      <div id="explore-results-area"></div>
    </div>
  `;

  lucide.createIcons();

  const searchInput = document.getElementById('explore-search-input');
  
  // Load initial content or search directly
  if (searchQ) {
    performExploreSearch(searchQ);
  } else {
    loadStandardExplore();
  }

  // Debounced live results typing
  searchInput.addEventListener('input', () => {
    clearTimeout(exploreDebounceTimer);
    const q = searchInput.value.trim();
    
    exploreDebounceTimer = setTimeout(() => {
      // Update browser URL query without reloading page
      const newUrl = q ? `/explore?q=${encodeURIComponent(q)}` : '/explore';
      history.replaceState(null, null, newUrl);
      
      if (q) {
        performExploreSearch(q);
      } else {
        loadStandardExplore();
      }
    }, 400); // 400ms debounce
  });
}

async function loadStandardExplore() {
  const resultsArea = document.getElementById('explore-results-area');
  if (!resultsArea) return;
  
  resultsArea.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 11px;">Aligning satellites...</div>`;

  try {
    const res = await fetch('/api/explore');
    const data = await res.json();

    if (res.ok) {
      // Neon Hashtags cloud
      const hashtagsHtml = data.hashtags.map(tag => `
        <a href="/explore?q=${encodeURIComponent(tag)}" class="neon-tag" data-route="/explore?q=${encodeURIComponent(tag)}">${tag}</a>
      `).join('');

      // Discover Users Carousel
      let usersHtml = '';
      if (data.users && data.users.length > 0) {
        usersHtml = data.users.map(u => `
          <div class="discover-card" data-route="/profile/${u.username}">
            <img src="${u.avatar_url || '/assets/default_avatar.png'}" alt="${u.display_name}">
            <div class="discover-name">${u.display_name}</div>
            <div class="discover-handle">@${u.username}</div>
            <button class="discover-follow-btn" data-user-id="${u.id}">Follow</button>
          </div>
        `).join('');
      } else {
        usersHtml = `<div style="font-size: 11px; color: var(--text-muted); padding: 20px 0;">No new coordinate entries.</div>`;
      }

      resultsArea.innerHTML = `
        <!-- Hashtag tag cloud -->
        <div class="trending-hashtags-section" style="margin-bottom: 20px;">
          <h3 class="section-title"><i data-lucide="trending-up"></i> Nebula Trending</h3>
          <div class="tag-cloud">
            ${hashtagsHtml}
          </div>
        </div>

        <!-- Discover Users -->
        <div class="discover-users-section">
          <h3 class="section-title"><i data-lucide="globe"></i> Discover Orbiters</h3>
          <div class="discover-carousel">
            ${usersHtml}
          </div>
        </div>
      `;

      lucide.createIcons();

      // Bind follow actions inside carousel
      resultsArea.querySelectorAll('.discover-follow-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const userId = btn.dataset.userId;
          showLoader();
          try {
            const followRes = await fetch(`/api/users/${userId}/follow`, { method: 'POST' });
            if (followRes.ok) {
              showToast('Entered user\'s orbit.');
              // Instantly remove card
              btn.closest('.discover-card').style.opacity = '0';
              setTimeout(() => {
                btn.closest('.discover-card').remove();
                if (resultsArea.querySelectorAll('.discover-card').length === 0) {
                  loadStandardExplore();
                }
              }, 300);
            } else {
              const followData = await followRes.json();
              showToast(followData.error);
            }
          } catch (err) {
            showToast('Follow command lost.');
          } finally {
            hideLoader();
          }
        });
      });

    }
  } catch (err) {
    resultsArea.innerHTML = `<div style="text-align: center; color: var(--crimson); font-size: 11px;">Satellites alignment error.</div>`;
  }
}

async function performExploreSearch(q) {
  const resultsArea = document.getElementById('explore-results-area');
  if (!resultsArea) return;

  resultsArea.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 11px;">Scanning coordinates for "${q}"...</div>`;

  try {
    const res = await fetch(`/api/explore?q=${encodeURIComponent(q)}`);
    const data = await res.json();

    if (res.ok) {
      let usersHtml = '';
      if (data.users && data.users.length > 0) {
        usersHtml = `
          <div class="discover-users-section" style="margin-bottom: 20px;">
            <h3 class="section-title"><i data-lucide="users"></i> Coordinates Found</h3>
            <div class="discover-carousel">
              ${data.users.map(u => `
                <div class="discover-card" data-route="/profile/${u.username}">
                  <img src="${u.avatar_url || '/assets/default_avatar.png'}" alt="${u.display_name}">
                  <div class="discover-name">${u.display_name}</div>
                  <div class="discover-handle">@${u.username}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      let postsHtml = '';
      if (data.posts && data.posts.length > 0) {
        postsHtml = `
          <div class="trending-hashtags-section">
            <h3 class="section-title"><i data-lucide="rss"></i> Post Logs Found</h3>
            <div id="explore-posts-list"></div>
          </div>
        `;
      }

      if (!usersHtml && !postsHtml) {
        resultsArea.innerHTML = `
          <div class="empty-state">
            <i data-lucide="compass" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 12px;"></i>
            <h3 class="empty-title">Deep space void</h3>
            <p class="empty-desc">No coordinate records or post logs match your query.</p>
          </div>
        `;
        lucide.createIcons();
        return;
      }

      resultsArea.innerHTML = `
        ${usersHtml}
        ${postsHtml}
      `;

      // Render search posts list
      if (data.posts && data.posts.length > 0) {
        const postsList = document.getElementById('explore-posts-list');
        const floatClasses = ['float-slow', 'float-medium', 'float-fast'];
        data.posts.forEach((post, index) => {
          const card = createPostCardHTML(post, floatClasses[index % 3]);
          postsList.appendChild(card);
        });
        setupPostCardInteractions(postsList);
      }

      lucide.createIcons();
    }
  } catch (err) {
    resultsArea.innerHTML = `<div style="text-align: center; color: var(--crimson); font-size: 11px;">Search transmission failure.</div>`;
  }
}

// 15. RENDER VIEW: POST DETAIL & FULL COMMENTS THREAD
async function renderPostDetail(postId) {
  const container = document.getElementById('app-view');
  showLoader();

  try {
    const res = await fetch(`/api/posts/${postId}`);
    const data = await res.json();

    if (!res.ok) {
      container.innerHTML = `
        <div class="empty-state">
          <i data-lucide="alert-triangle" style="width: 48px; height: 48px; color: var(--crimson); margin-bottom: 12px;"></i>
          <h3 class="empty-title">Post deorbited</h3>
          <p class="empty-desc">This transmission signal no longer exists or fell into a black hole.</p>
          <button class="header-btn" style="margin-top: 16px;" data-route="/">Return home</button>
        </div>
      `;
      lucide.createIcons();
      hideLoader();
      return;
    }

    const { post, related } = data;
    
    // Build related sidebar
    let relatedHtml = '';
    if (related && related.length > 0) {
      relatedHtml = related.map(p => {
        let mediaSnippet = `<div class="related-post-text-fallback"><i data-lucide="music-4"></i></div>`;
        if (p.media_url) {
          mediaSnippet = `<img class="related-post-media" src="${p.media_url}" alt="Media">`;
        }
        return `
          <div class="related-post-item" data-route="/post/${p.id}">
            ${mediaSnippet}
            <div class="related-post-info">
              <span class="related-post-content">${p.content}</span>
              <span class="related-post-author">by @${p.username}</span>
            </div>
          </div>
        `;
      }).join('');
    } else {
      relatedHtml = `<div style="font-size: 10px; color: var(--text-muted);">No other signals detected.</div>`;
    }

    container.innerHTML = `
      <div class="detail-container">
        <div class="detail-layout">
          <!-- Expanded Post View -->
          <div id="expanded-post-card"></div>

          <!-- Related Posts Sidebar -->
          <div class="detail-sidebar">
            <h3>Related Stellar Beats</h3>
            <div class="related-sidebar-list">
              ${relatedHtml}
            </div>
          </div>

          <!-- Full Comment Thread -->
          <div class="comments-thread-container">
            <h3 class="comments-thread-header">Signals (${post.comments_count})</h3>
            
            <div class="thread-list" id="comments-thread-list">
              <div style="text-align: center; color: var(--text-muted); font-size: 11px;">Syncing comments frequency...</div>
            </div>

            <form class="add-comment-box" id="post-comment-form">
              <div class="add-comment-input-wrapper">
                <input type="text" id="comment-text-input" placeholder="Transmit a message..." maxlength="280" required autocomplete="off">
              </div>
              <button type="submit" class="comment-submit-btn">Transmit</button>
            </form>
          </div>
        </div>
      </div>
    `;

    lucide.createIcons();

    // Render original card inside expanded view (no float animation for detail view to make reading easier)
    const cardWrapper = document.getElementById('expanded-post-card');
    const detailCard = createPostCardHTML(post, ''); // empty float class
    cardWrapper.appendChild(detailCard);
    
    // Hide the inline comment preview since we have the full comment thread
    detailCard.querySelector('.card-comments-preview').classList.add('hidden');
    
    setupPostCardInteractions(cardWrapper);

    // Load full comments list
    await loadPostComments(postId);

    // Comment form binding
    document.getElementById('post-comment-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('comment-text-input');
      const content = input.value.trim();
      
      if (!content) return;
      showLoader();
      try {
        const commentRes = await fetch(`/api/posts/${postId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });
        
        if (commentRes.ok) {
          showToast('Transmission received.');
          input.value = '';
          // Reload comments & update comment count on detail page
          await loadPostComments(postId);
          
          // Update count in visual card actions
          const commentCounter = cardWrapper.querySelector('.comment-btn span');
          if (commentCounter) {
            commentCounter.innerText = parseInt(commentCounter.innerText || 0) + 1;
          }
          // Update header counter
          document.querySelector('.comments-thread-header').innerText = `Signals (${parseInt(commentCounter.innerText)})`;
        } else {
          const commentData = await commentRes.json();
          showToast(commentData.error);
        }
      } catch (err) {
        showToast('Comment transmission failed.');
      } finally {
        hideLoader();
      }
    });

  } catch (err) {
    console.error('Detail page load failed:', err);
    showToast('Failed to synch details.');
  } finally {
    hideLoader();
  }
}

async function loadPostComments(postId) {
  const list = document.getElementById('comments-thread-list');
  if (!list) return;

  try {
    const res = await fetch(`/api/posts/${postId}/comments`);
    const data = await res.json();

    if (res.ok) {
      if (data.comments.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 11px; padding: 20px 0;">No messages yet. Silence in the ether.</div>`;
        return;
      }

      list.innerHTML = data.comments.map(c => `
        <div class="comment-item">
          <img class="comment-avatar" src="${c.avatar_url || '/assets/default_avatar.png'}" alt="${c.display_name}" data-route="/profile/${c.username}">
          <div class="comment-body">
            <div class="comment-header">
              <span class="comment-author-name" data-route="/profile/${c.username}">@${c.username}</span>
              <span class="comment-date">${formatTimestamp(c.created_at)}</span>
            </div>
            <p class="comment-content">${c.content}</p>
          </div>
        </div>
      `).join('');

      // Add routing hooks to comments
      list.querySelectorAll('[data-route]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          navigateTo(el.getAttribute('data-route'));
        });
      });

    }
  } catch (err) {
    list.innerHTML = `<div style="text-align: center; color: var(--crimson); font-size: 11px;">Failed to align comments frequency.</div>`;
  }
}

// 16. UTILITY: Format Timestamp (e.g. 5m ago, 2h ago, May 22)
function formatTimestamp(timestampStr) {
  const date = new Date(timestampStr);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return 'just now';
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
