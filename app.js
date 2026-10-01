(() => {
  const fallback = {
    brandName: 'Anand Adda',
    heroText: 'Fresh everyday styles, handpicked for your street, your plans and your personality.',
    offerTitle: 'Your next favourite fit is waiting.',
    offerText: 'Ask in store about the latest offer and new arrivals.',
    shopTitle: 'The neighbourhood’s style stop.',
    shopDescription: 'Anand Adda is a welcoming local clothing shop where you can discover easy, confident fashion in person.',
    knownFor: 'Fresh local styles',
    perfectFor: 'Youthful everyday fashion',
    hours: '10:00 AM – 9:00 PM',
    address: 'Add full shop address from the owner panel.',
    phone: '',
    whatsapp: '',
    instagram: '@yourshop',
    mapUrl: 'https://maps.google.com'
  };
  const $ = selector => document.querySelector(selector);
  const text = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const safeImageUrl = value => {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value, window.location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  };
  const readLocalFallback = () => {
    try { return JSON.parse(localStorage.getItem('storeData') || '{}'); }
    catch { return {}; }
  };
  const localData = { ...fallback, ...readLocalFallback() };
  const setMessage = (node, message, type = '') => {
    if (!node) return;
    node.textContent = message;
    node.className = `form-message ${type}`.trim();
  };
  const getPublicUrl = (client, bucket, path) => {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return safeImageUrl(path);
    return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  };
  const setLogo = source => {
    ['headerLogo', 'footerLogo'].forEach(id => {
      const node = document.getElementById(id);
      if (!node) return;
      if (!node.dataset.fallback) node.dataset.fallback = node.innerHTML;
      const url = safeImageUrl(source);
      if (!url) { node.innerHTML = node.dataset.fallback; return; }
      const image = new Image();
      image.alt = 'Anand Adda logo';
      image.src = url;
      image.onerror = () => { node.innerHTML = node.dataset.fallback; };
      node.replaceChildren(image);
    });
  };
  const setPhoto = (imageId, fallbackId, source, alt) => {
    const image = document.getElementById(imageId);
    if (!image) return;
    const url = safeImageUrl(source);
    image.hidden = !url;
    const fallbackNode = document.getElementById(fallbackId);
    if (fallbackNode) fallbackNode.hidden = Boolean(url);
    if (url) {
      image.alt = alt;
      image.onerror = () => {
        image.hidden = true;
        if (imageId === 'shopPhotoImage') fallbackNode && (fallbackNode.hidden = false);
        if (imageId === 'offerPhotoImage') fallbackNode && (fallbackNode.hidden = true);
      };
      image.src = url;
    } else image.removeAttribute('src');
  };
  const setContactLinks = data => {
    const phone = data.phone || '';
    const whatsapp = data.whatsapp || '';
    const instagram = data.instagram || '';
    text('phoneText', phone || 'Add phone number');
    text('instagramText', instagram || '@yourshop');
    const whatsappNumber = whatsapp.replace(/\D/g, '');
    $('#phoneLink').href = phone ? `tel:${phone.replace(/\s/g, '')}` : '#contact';
    $('#whatsappLink').href = whatsappNumber ? `https://wa.me/${whatsappNumber}` : '#contact';
    $('#instagramLink').href = instagram && instagram !== '@yourshop' ? `https://instagram.com/${instagram.replace('@', '')}` : '#contact';
    $('#mapLink').href = data.maps_url || data.mapUrl || fallback.mapUrl;
  };
  const applyInitialContent = data => {
    text('brandName', data.brandName);
    text('footerBrand', data.brandName);
    text('heroText', data.heroText);
    text('offerTitle', data.offerTitle);
    text('offerText', data.offerText);
    text('shopTitle', data.shopTitle);
    text('shopDescription', data.shopDescription);
    text('knownFor', data.knownFor);
    text('perfectFor', data.perfectFor);
    text('hours', data.hours);
    text('address', data.address);
    setContactLinks(data);
  };
  const formatDate = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const renderProducts = products => {
    const grid = $('#productGrid');
    if (!grid || !Array.isArray(products)) return;
    if (!products.length) {
      grid.innerHTML = '<p class="empty-state">New products will appear here soon.</p>';
      return;
    }
    grid.innerHTML = products.map((product, index) => {
      const photo = safeImageUrl(product.image_urls?.[0]);
      const price = product.price !== null && product.price !== undefined && product.price !== ''
        ? `₹${Number(product.price).toLocaleString('en-IN')}`
        : product.category || 'Ask in store';
      return `<article class="product-card"><div class="product-image ${['peach', 'lime', 'blue'][index % 3]}">${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(product.name)}" loading="lazy">` : '<span>PHOTO<br>SPACE</span>'}<b>${String(index + 1).padStart(2, '0')}</b></div><div><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(price)}</p></div></article>`;
    }).join('');
  };
  const renderWeeklyUpdates = updates => {
    const grid = $('#weeklyGrid');
    if (!grid) return;
    if (!Array.isArray(updates) || !updates.length) {
      grid.innerHTML = '<p class="empty-state">New weekly updates will appear here.</p>';
      return;
    }
    grid.innerHTML = updates.map(update => {
      const photo = safeImageUrl(update.image_url);
      const caption = update.caption ? `<p>${escapeHtml(update.caption)}</p>` : '';
      const detail = update.description ? `<details><summary>Read more</summary><p>${escapeHtml(update.description)}</p></details>` : '';
      return `<article class="weekly-card">${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(update.title)}" loading="lazy">` : '<div class="weekly-image-placeholder">WEEKLY UPDATE</div>'}<div class="weekly-card-copy"><time datetime="${escapeHtml(update.published_at || update.created_at || '')}">${escapeHtml(formatDate(update.published_at || update.created_at))}</time><h3>${escapeHtml(update.title)}</h3>${caption}${detail}</div></article>`;
    }).join('');
  };
  const renderReviews = reviews => {
    const grid = $('#reviewList');
    if (!grid) return;
    if (!Array.isArray(reviews) || !reviews.length) {
      grid.innerHTML = '<p class="empty-state">Be the first to share your Anand Adda experience.</p>';
      return;
    }
    grid.innerHTML = reviews.map(review => `<blockquote class="review-card"><span class="review-stars" aria-label="${review.rating} out of 5 stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span><p>“${escapeHtml(review.review_text)}”</p><footer>— ${escapeHtml(review.customer_name)}${review.created_at ? ` · ${escapeHtml(formatDate(review.created_at))}` : ''}</footer></blockquote>`).join('');
  };

  applyInitialContent(localData);
  const menu = $('.menu-button');
  const nav = $('.main-nav');
  menu?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
  });
  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => nav.classList.remove('open')));

  const canUseSupabase = window.supabase && window.STORE_SUPABASE_URL && window.STORE_SUPABASE_PUBLISHABLE_KEY;
  if (!canUseSupabase) return;
  const cloud = window.supabase.createClient(window.STORE_SUPABASE_URL, window.STORE_SUPABASE_PUBLISHABLE_KEY);

  const loadPublicContent = async () => {
    const [products, offers, settings, updates, reviews] = await Promise.all([
      cloud.from('products').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      cloud.from('offers').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1),
      cloud.from('store_settings').select('*').eq('id', true).maybeSingle(),
      cloud.from('weekly_updates').select('*').eq('is_active', true).order('published_at', { ascending: false }),
      cloud.from('reviews').select('*').eq('status', 'approved').order('created_at', { ascending: false })
    ]);

    if (products.data) renderProducts(products.data);
    if (updates.data) renderWeeklyUpdates(updates.data);
    if (reviews.data) renderReviews(reviews.data);
    if (offers.data?.[0]) {
      const offer = offers.data[0];
      text('offerTitle', offer.title || fallback.offerTitle);
      text('offerText', offer.details || fallback.offerText);
      setPhoto('offerPhotoImage', 'offerPhoto', offer.image_url || getPublicUrl(cloud, 'offer-images', offer.image_path), 'Current Anand Adda offer');
    }
    if (settings.data) {
      const setting = settings.data;
      const shopName = setting.shop_name || fallback.brandName;
      text('brandName', shopName);
      text('footerBrand', shopName);
      text('heroText', setting.hero_text || fallback.heroText);
      text('shopDescription', setting.about_text || fallback.shopDescription);
      text('address', setting.address || fallback.address);
      text('hours', setting.opening_hours || fallback.hours);
      setContactLinks(setting);
      setLogo(getPublicUrl(cloud, 'site-media', setting.logo_path));
      setPhoto('shopPhotoImage', 'shopPhotoFallback', getPublicUrl(cloud, 'site-media', setting.shop_photo_path), `${shopName} shop`);
    }
  };
  loadPublicContent().catch(() => { /* Fallback content stays visible when offline. */ });

  const dialog = $('#reviewDialog');
  const reviewForm = $('#reviewForm');
  let reviewOpenedAt = 0;
  const closeReviewDialog = () => {
    if (typeof dialog?.close === 'function') dialog.close();
    else dialog?.removeAttribute('open');
  };
  $('#openReviewDialog')?.addEventListener('click', () => {
    reviewOpenedAt = Date.now();
    setMessage($('#reviewMessage'), '');
    if (typeof dialog?.showModal === 'function') dialog.showModal();
    else dialog?.setAttribute('open', '');
  });
  $('#closeReviewDialog')?.addEventListener('click', closeReviewDialog);
  dialog?.addEventListener('click', event => { if (event.target === dialog) closeReviewDialog(); });
  reviewForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const message = $('#reviewMessage');
    const values = Object.fromEntries(new FormData(reviewForm));
    if (values.website) { setMessage(message, 'Thank you. Your review was received.', 'success'); return; }
    if (!reviewForm.checkValidity()) { reviewForm.reportValidity(); return; }
    if (Date.now() - reviewOpenedAt < 2500) { setMessage(message, 'Please take a moment to review your details before sending.', 'error'); return; }
    try {
      const lastReviewAt = Number(localStorage.getItem('anandAddaReviewAt') || 0);
      if (Date.now() - lastReviewAt < 60000) { setMessage(message, 'Please wait a minute before sending another review.', 'error'); return; }
    } catch { /* Local rate limiting is an extra safeguard, not a dependency. */ }
    setMessage(message, 'Sending your review…');
    const { error } = await cloud.rpc('submit_review', {
      p_customer_name: String(values.customer_name || '').trim(),
      p_rating: Number(values.rating),
      p_review_text: String(values.review_text || '').trim()
    });
    if (error) { setMessage(message, error.message || 'Your review could not be sent. Please try again.', 'error'); return; }
    try { localStorage.setItem('anandAddaReviewAt', String(Date.now())); } catch { /* No action needed. */ }
    reviewForm.reset();
    setMessage(message, 'Thank you! Your review has been sent for approval.', 'success');
  });
})();
