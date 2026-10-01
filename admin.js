(() => {
  const $ = selector => document.querySelector(selector);
  const db = window.supabase?.createClient(window.STORE_SUPABASE_URL, window.STORE_SUPABASE_PUBLISHABLE_KEY);
  const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const maxImageSize = 5 * 1024 * 1024;
  const state = {
    products: [], updates: [], offers: [], reviews: [], settings: { id: true },
    editingProduct: null, editingWeekly: null, editingOffer: null,
    removeLogo: false, removeShopPhoto: false
  };
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const setMessage = (selector, value, isError = false) => {
    const node = $(selector);
    if (!node) return;
    node.textContent = value;
    node.className = `form-message${isError ? ' error' : ''}`;
  };
  const safeImageUrl = value => {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value, window.location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  };
  const publicUrl = (bucket, path) => {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return safeImageUrl(path);
    return db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  };
  const storagePathFromUrl = (bucket, url) => {
    if (!url) return '';
    const marker = `/storage/v1/object/public/${bucket}/`;
    const index = String(url).indexOf(marker);
    if (index === -1) return '';
    try { return decodeURIComponent(String(url).slice(index + marker.length)); }
    catch { return String(url).slice(index + marker.length); }
  };
  const sanitiseFilename = name => String(name || 'image').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
  const formatDate = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  const formatDateInput = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  const statusBadge = (active, labels = ['Active', 'Inactive']) => `<span class="status${active ? '' : ' inactive'}">${active ? labels[0] : labels[1]}</span>`;
  const validateFiles = files => {
    for (const file of files) {
      if (!imageTypes.has(file.type)) return `${file.name}: please use a JPG, PNG or WebP image.`;
      if (file.size > maxImageSize) return `${file.name}: images must be 5 MB or smaller.`;
    }
    return '';
  };
  const uploadFile = async (bucket, folder, file) => {
    const path = `${folder}/${crypto.randomUUID()}-${sanitiseFilename(file.name)}`;
    const { error } = await db.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return { path, url: publicUrl(bucket, path) };
  };
  const removeStorageFiles = async (bucket, paths) => {
    const validPaths = [...new Set(paths.filter(Boolean))];
    if (!validPaths.length) return null;
    const { error } = await db.storage.from(bucket).remove(validPaths);
    return error || null;
  };
  const currentProductImages = product => {
    const urls = Array.isArray(product.image_urls) ? product.image_urls : [];
    const paths = Array.isArray(product.image_paths) ? product.image_paths : [];
    return urls.map((url, index) => ({ url, path: paths[index] || storagePathFromUrl('product-images', url) }));
  };
  const previewCard = (source, options = {}) => {
    const url = safeImageUrl(source);
    if (!url) return '';
    const button = options.button ? `<button type="button" ${options.button} aria-label="Remove image">×</button>` : '';
    return `<div class="preview-card${options.isNew ? ' new' : ''}"><img src="${esc(url)}" alt="">${button}</div>`;
  };
  const previewFiles = files => Array.from(files || []).map(file => previewCard(URL.createObjectURL(file), { isNew: true })).join('');

  const renderProductPreviews = () => {
    const node = $('#productPhotoPreview');
    if (!node) return;
    const editing = state.editingProduct;
    const existing = editing ? editing.images.filter((_, index) => !editing.removed.has(index)).map((image, index) => {
      const originalIndex = editing.images.indexOf(image);
      return previewCard(image.url, { button: `data-remove-product-photo="${originalIndex}"` });
    }).join('') : '';
    const selected = previewFiles($('#productPhotos')?.files);
    node.innerHTML = existing || selected ? `${existing}${selected}` : '<p class="preview-empty">Product photos will appear here before you save.</p>';
    node.querySelectorAll('[data-remove-product-photo]').forEach(button => {
      button.addEventListener('click', () => {
        state.editingProduct?.removed.add(Number(button.dataset.removeProductPhoto));
        renderProductPreviews();
      });
    });
  };
  const renderSinglePhotoPreview = (container, editing, input, removeAttribute) => {
    const node = $(container);
    if (!node) return;
    const file = $(input)?.files?.[0];
    if (file) { node.innerHTML = previewFiles([file]); return; }
    if (editing?.record?.image_url && !editing.removePhoto) {
      node.innerHTML = previewCard(editing.record.image_url, { button: `${removeAttribute}="true"` });
      node.querySelector(`[${removeAttribute}]`)?.addEventListener('click', () => { editing.removePhoto = true; renderSinglePhotoPreview(container, editing, input, removeAttribute); });
      return;
    }
    node.innerHTML = '<p class="preview-empty">No image selected.</p>';
  };
  const renderMediaPreview = (container, path, file, isLogo, pendingRemoval) => {
    const node = $(container);
    if (!node) return;
    const source = file ? URL.createObjectURL(file) : (pendingRemoval ? '' : publicUrl('site-media', path));
    node.classList.toggle('logo-preview', isLogo && Boolean(source));
    node.classList.toggle('empty-media', !source);
    node.innerHTML = source ? `<img src="${esc(source)}" alt="Current ${isLogo ? 'shop logo' : 'shop photo'}">` : `No ${isLogo ? 'logo' : 'shop photo'} uploaded yet.`;
  };

  const renderProducts = () => {
    const list = $('#productList');
    if (!list) return;
    if (!state.products.length) { list.innerHTML = '<p class="empty-list">No products yet.</p>'; return; }
    list.innerHTML = state.products.map(product => {
      const image = safeImageUrl(product.image_urls?.[0]);
      const details = [product.category, product.price !== null && product.price !== undefined ? `₹${Number(product.price).toLocaleString('en-IN')}` : 'No price'].filter(Boolean).join(' · ');
      return `<div class="management-item${image ? '' : ' no-image'}">${image ? `<img class="management-thumb" src="${esc(image)}" alt="">` : ''}<div class="management-copy"><h3>${esc(product.name)}</h3><p>${esc(details)}</p><p class="meta">${statusBadge(product.is_active)} · ${product.image_urls?.length || 0} photo${product.image_urls?.length === 1 ? '' : 's'}</p></div><div class="item-actions"><button type="button" class="secondary" data-edit-product="${product.id}">Edit</button><button type="button" class="delete secondary" data-delete-product="${product.id}">Delete</button></div></div>`;
    }).join('');
    list.querySelectorAll('[data-edit-product]').forEach(button => button.addEventListener('click', () => editProduct(button.dataset.editProduct)));
    list.querySelectorAll('[data-delete-product]').forEach(button => button.addEventListener('click', () => deleteProduct(button.dataset.deleteProduct)));
  };
  const renderWeeklyUpdates = () => {
    const list = $('#weeklyList');
    if (!list) return;
    if (!state.updates.length) { list.innerHTML = '<p class="empty-list">No weekly updates yet.</p>'; return; }
    list.innerHTML = state.updates.map(update => {
      const image = safeImageUrl(update.image_url);
      return `<div class="management-item${image ? '' : ' no-image'}">${image ? `<img class="management-thumb" src="${esc(image)}" alt="">` : ''}<div class="management-copy"><h3>${esc(update.title)}</h3><p>${esc(update.caption || update.description || 'No caption')}</p><p class="meta">${statusBadge(update.is_active)} · ${esc(formatDate(update.published_at))}</p></div><div class="item-actions"><button type="button" class="secondary" data-edit-weekly="${update.id}">Edit</button><button type="button" class="delete secondary" data-delete-weekly="${update.id}">Delete</button></div></div>`;
    }).join('');
    list.querySelectorAll('[data-edit-weekly]').forEach(button => button.addEventListener('click', () => editWeekly(button.dataset.editWeekly)));
    list.querySelectorAll('[data-delete-weekly]').forEach(button => button.addEventListener('click', () => deleteWeekly(button.dataset.deleteWeekly)));
  };
  const renderOffers = () => {
    const list = $('#offerList');
    if (!list) return;
    if (!state.offers.length) { list.innerHTML = '<p class="empty-list">No offers yet.</p>'; return; }
    list.innerHTML = state.offers.map(offer => {
      const image = safeImageUrl(offer.image_url);
      return `<div class="management-item${image ? '' : ' no-image'}">${image ? `<img class="management-thumb" src="${esc(image)}" alt="">` : ''}<div class="management-copy"><h3>${esc(offer.title)}</h3><p>${esc(offer.details || 'No details')}</p><p class="meta">${statusBadge(offer.is_active, ['Current offer', 'Past offer'])} · ${esc(formatDate(offer.created_at))}</p></div><div class="item-actions"><button type="button" class="secondary" data-edit-offer="${offer.id}">Edit</button><button type="button" class="delete secondary" data-delete-offer="${offer.id}">Delete</button></div></div>`;
    }).join('');
    list.querySelectorAll('[data-edit-offer]').forEach(button => button.addEventListener('click', () => editOffer(button.dataset.editOffer)));
    list.querySelectorAll('[data-delete-offer]').forEach(button => button.addEventListener('click', () => deleteOffer(button.dataset.deleteOffer)));
  };
  const renderReviews = () => {
    const list = $('#reviewAdminList');
    if (!list) return;
    if (!state.reviews.length) { list.innerHTML = '<p class="empty-list">No customer reviews have been submitted.</p>'; return; }
    list.innerHTML = state.reviews.map(review => {
      const statusClass = review.status === 'approved' ? '' : review.status === 'pending' ? ' pending' : ' rejected';
      return `<div class="management-item no-image"><div class="management-copy"><h3>${esc(review.customer_name)} · ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</h3><p>${esc(review.review_text)}</p><p class="meta"><span class="status${statusClass}">${esc(review.status)}</span> · ${esc(formatDate(review.created_at))}</p></div><div class="item-actions">${review.status !== 'approved' ? `<button type="button" class="secondary" data-review-status="approved" data-review-id="${review.id}">Approve</button>` : ''}${review.status !== 'rejected' ? `<button type="button" class="secondary" data-review-status="rejected" data-review-id="${review.id}">Hide</button>` : ''}<button type="button" class="delete secondary" data-delete-review="${review.id}">Delete</button></div></div>`;
    }).join('');
    list.querySelectorAll('[data-review-status]').forEach(button => button.addEventListener('click', () => setReviewStatus(button.dataset.reviewId, button.dataset.reviewStatus)));
    list.querySelectorAll('[data-delete-review]').forEach(button => button.addEventListener('click', () => deleteReview(button.dataset.deleteReview)));
  };
  const renderSettings = () => {
    const form = $('#settingsForm');
    if (!form) return;
    Object.entries(state.settings || {}).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value || ''; });
    renderMediaPreview('#currentLogoPreview', state.settings.logo_path, $('#logoFile')?.files?.[0], true, state.removeLogo);
    renderMediaPreview('#currentShopPhotoPreview', state.settings.shop_photo_path, $('#shopPhotoFile')?.files?.[0], false, state.removeShopPhoto);
    $('#removeLogo').hidden = !state.settings.logo_path || state.removeLogo;
    $('#removeShopPhoto').hidden = !state.settings.shop_photo_path || state.removeShopPhoto;
  };
  const renderDashboard = () => {
    $('#activeProductCount').textContent = state.products.filter(product => product.is_active).length;
    $('#weeklyUpdateCount').textContent = state.updates.filter(update => update.is_active).length;
    $('#pendingReviewCount').textContent = state.reviews.filter(review => review.status === 'pending').length;
    $('#currentOfferCount').textContent = state.offers.filter(offer => offer.is_active).length;
  };

  const loadAll = async () => {
    const [products, updates, offers, settings, reviews] = await Promise.all([
      db.from('products').select('*').order('created_at', { ascending: false }),
      db.from('weekly_updates').select('*').order('published_at', { ascending: false }),
      db.from('offers').select('*').order('created_at', { ascending: false }),
      db.from('store_settings').select('*').eq('id', true).maybeSingle(),
      db.from('reviews').select('*').order('created_at', { ascending: false })
    ]);
    const errors = [products, updates, offers, settings, reviews].map(result => result.error).filter(Boolean);
    if (errors.length) { setMessage('#loginMsg', errors[0].message, true); return false; }
    state.products = products.data || [];
    state.updates = updates.data || [];
    state.offers = offers.data || [];
    state.settings = settings.data || { id: true };
    state.reviews = reviews.data || [];
    renderProducts(); renderWeeklyUpdates(); renderOffers(); renderReviews(); renderSettings(); renderDashboard();
    return true;
  };

  const resetProductForm = () => {
    state.editingProduct = null;
    $('#productForm').reset();
    $('#productFormTitle').textContent = 'Add a product';
    $('#productSubmit').textContent = 'Add product';
    $('#cancelProductEdit').hidden = true;
    $('#productForm').elements.is_active.checked = true;
    renderProductPreviews();
  };
  const editProduct = id => {
    const product = state.products.find(item => item.id === id);
    if (!product) return;
    state.editingProduct = { id, images: currentProductImages(product), removed: new Set() };
    const form = $('#productForm');
    form.elements.id.value = product.id;
    form.elements.name.value = product.name || '';
    form.elements.price.value = product.price ?? '';
    form.elements.category.value = product.category || '';
    form.elements.sizes.value = Array.isArray(product.sizes) ? product.sizes.join(', ') : '';
    form.elements.description.value = product.description || '';
    form.elements.is_active.checked = Boolean(product.is_active);
    $('#productPhotos').value = '';
    $('#productFormTitle').textContent = 'Edit product';
    $('#productSubmit').textContent = 'Save product';
    $('#cancelProductEdit').hidden = false;
    renderProductPreviews();
    $('#products').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const saveProduct = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const files = Array.from($('#productPhotos').files || []);
    const validationError = validateFiles(files);
    if (validationError) { setMessage('#productMsg', validationError, true); return; }
    const editing = state.editingProduct;
    const id = editing?.id || crypto.randomUUID();
    const retained = editing ? editing.images.filter((_, index) => !editing.removed.has(index)) : [];
    const uploaded = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        setMessage('#productMsg', `Uploading photo ${index + 1} of ${files.length}…`);
        uploaded.push(await uploadFile('product-images', `products/${id}`, files[index]));
      }
      const images = [...retained, ...uploaded];
      const payload = { id, name: values.name.trim(), price: values.price === '' ? null : Number(values.price), category: values.category.trim() || null, sizes: values.sizes ? values.sizes.split(',').map(size => size.trim()).filter(Boolean) : [], description: values.description.trim() || null, image_urls: images.map(image => image.url), image_paths: images.map(image => image.path || ''), is_active: form.elements.is_active.checked };
      const result = editing ? await db.from('products').update(payload).eq('id', id) : await db.from('products').insert(payload);
      if (result.error) throw result.error;
      const removedPaths = editing ? editing.images.filter((_, index) => editing.removed.has(index)).map(image => image.path) : [];
      const removalError = await removeStorageFiles('product-images', removedPaths);
      setMessage('#productMsg', removalError ? 'Product saved. One removed image could not be cleaned up.' : 'Product saved.');
      resetProductForm();
      await loadAll();
    } catch (error) {
      await removeStorageFiles('product-images', uploaded.map(image => image.path));
      setMessage('#productMsg', error.message || 'Product could not be saved.', true);
    }
  };
  const deleteProduct = async id => {
    const product = state.products.find(item => item.id === id);
    if (!product || !window.confirm(`Delete “${product.name}”? This cannot be undone.`)) return;
    const { error } = await db.from('products').delete().eq('id', id);
    if (error) { setMessage('#productMsg', error.message, true); return; }
    await removeStorageFiles('product-images', currentProductImages(product).map(image => image.path));
    if (state.editingProduct?.id === id) resetProductForm();
    await loadAll();
  };

  const resetWeeklyForm = () => {
    state.editingWeekly = null;
    $('#weeklyForm').reset();
    $('#weeklyFormTitle').textContent = 'Add a weekly update';
    $('#weeklySubmit').textContent = 'Publish update';
    $('#cancelWeeklyEdit').hidden = true;
    $('#weeklyForm').elements.is_active.checked = true;
    renderSinglePhotoPreview('#weeklyPhotoPreview', null, '#weeklyPhoto', 'data-remove-weekly-photo');
  };
  const editWeekly = id => {
    const record = state.updates.find(item => item.id === id);
    if (!record) return;
    state.editingWeekly = { record, removePhoto: false };
    const form = $('#weeklyForm');
    form.elements.id.value = record.id;
    form.elements.title.value = record.title || '';
    form.elements.caption.value = record.caption || '';
    form.elements.description.value = record.description || '';
    form.elements.published_at.value = formatDateInput(record.published_at);
    form.elements.is_active.checked = Boolean(record.is_active);
    $('#weeklyPhoto').value = '';
    $('#weeklyFormTitle').textContent = 'Edit weekly update';
    $('#weeklySubmit').textContent = 'Save update';
    $('#cancelWeeklyEdit').hidden = false;
    renderSinglePhotoPreview('#weeklyPhotoPreview', state.editingWeekly, '#weeklyPhoto', 'data-remove-weekly-photo');
    $('#weekly').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const saveWeekly = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const file = $('#weeklyPhoto').files?.[0];
    const validationError = validateFiles(file ? [file] : []);
    if (validationError) { setMessage('#weeklyMsg', validationError, true); return; }
    const editing = state.editingWeekly;
    const id = editing?.record.id || crypto.randomUUID();
    let uploaded;
    try {
      if (file) { setMessage('#weeklyMsg', 'Uploading photo…'); uploaded = await uploadFile('weekly-update-images', `updates/${id}`, file); }
      const oldPath = editing?.record.image_path || '';
      const payload = { id, title: values.title.trim(), caption: values.caption.trim() || null, description: values.description.trim() || null, image_path: uploaded?.path || (editing?.removePhoto ? null : oldPath || null), image_url: uploaded?.url || (editing?.removePhoto ? null : editing?.record.image_url || null), is_active: form.elements.is_active.checked };
      if (values.published_at) payload.published_at = new Date(values.published_at).toISOString();
      const result = editing ? await db.from('weekly_updates').update(payload).eq('id', id) : await db.from('weekly_updates').insert(payload);
      if (result.error) throw result.error;
      if (oldPath && (uploaded || editing?.removePhoto)) await removeStorageFiles('weekly-update-images', [oldPath]);
      setMessage('#weeklyMsg', 'Weekly update saved.');
      resetWeeklyForm();
      await loadAll();
    } catch (error) {
      if (uploaded) await removeStorageFiles('weekly-update-images', [uploaded.path]);
      setMessage('#weeklyMsg', error.message || 'Weekly update could not be saved.', true);
    }
  };
  const deleteWeekly = async id => {
    const record = state.updates.find(item => item.id === id);
    if (!record || !window.confirm(`Delete “${record.title}”? This cannot be undone.`)) return;
    const { error } = await db.from('weekly_updates').delete().eq('id', id);
    if (error) { setMessage('#weeklyMsg', error.message, true); return; }
    await removeStorageFiles('weekly-update-images', [record.image_path]);
    if (state.editingWeekly?.record.id === id) resetWeeklyForm();
    await loadAll();
  };

  const resetOfferForm = () => {
    state.editingOffer = null;
    $('#offerForm').reset();
    $('#offerFormTitle').textContent = 'Publish a new offer';
    $('#offerSubmit').textContent = 'Publish offer';
    $('#cancelOfferEdit').hidden = true;
    $('#offerForm').elements.is_active.checked = true;
    renderSinglePhotoPreview('#offerPhotoPreview', null, '#offerPhotoInput', 'data-remove-offer-photo');
  };
  const editOffer = id => {
    const record = state.offers.find(item => item.id === id);
    if (!record) return;
    state.editingOffer = { record, removePhoto: false };
    const form = $('#offerForm');
    form.elements.id.value = record.id;
    form.elements.title.value = record.title || '';
    form.elements.details.value = record.details || '';
    form.elements.is_active.checked = Boolean(record.is_active);
    $('#offerPhotoInput').value = '';
    $('#offerFormTitle').textContent = 'Edit offer';
    $('#offerSubmit').textContent = 'Save offer';
    $('#cancelOfferEdit').hidden = false;
    renderSinglePhotoPreview('#offerPhotoPreview', state.editingOffer, '#offerPhotoInput', 'data-remove-offer-photo');
    $('#offers').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const saveOffer = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const file = $('#offerPhotoInput').files?.[0];
    const validationError = validateFiles(file ? [file] : []);
    if (validationError) { setMessage('#offerMsg', validationError, true); return; }
    const editing = state.editingOffer;
    const id = editing?.record.id || crypto.randomUUID();
    let uploaded;
    try {
      if (file) { setMessage('#offerMsg', 'Uploading photo…'); uploaded = await uploadFile('offer-images', `offers/${id}`, file); }
      const oldPath = editing?.record.image_path || '';
      const payload = { id, title: values.title.trim(), details: values.details.trim() || null, image_path: uploaded?.path || (editing?.removePhoto ? null : oldPath || null), image_url: uploaded?.url || (editing?.removePhoto ? null : editing?.record.image_url || null), is_active: form.elements.is_active.checked };
      const result = editing ? await db.from('offers').update(payload).eq('id', id) : await db.from('offers').insert(payload);
      if (result.error) throw result.error;
      if (oldPath && (uploaded || editing?.removePhoto)) await removeStorageFiles('offer-images', [oldPath]);
      setMessage('#offerMsg', form.elements.is_active.checked ? 'Offer saved and set as current.' : 'Offer saved as inactive.');
      resetOfferForm();
      await loadAll();
    } catch (error) {
      if (uploaded) await removeStorageFiles('offer-images', [uploaded.path]);
      setMessage('#offerMsg', error.message || 'Offer could not be saved.', true);
    }
  };
  const deleteOffer = async id => {
    const record = state.offers.find(item => item.id === id);
    if (!record || !window.confirm(`Delete “${record.title}”? This cannot be undone.`)) return;
    const { error } = await db.from('offers').delete().eq('id', id);
    if (error) { setMessage('#offerMsg', error.message, true); return; }
    await removeStorageFiles('offer-images', [record.image_path]);
    if (state.editingOffer?.record.id === id) resetOfferForm();
    await loadAll();
  };

  const saveMedia = async event => {
    event.preventDefault();
    const logo = $('#logoFile').files?.[0];
    const shopPhoto = $('#shopPhotoFile').files?.[0];
    const validationError = validateFiles([logo, shopPhoto].filter(Boolean));
    if (validationError) { setMessage('#mediaMsg', validationError, true); return; }
    let uploadedLogo; let uploadedShopPhoto;
    try {
      if (logo) { setMessage('#mediaMsg', 'Uploading logo…'); uploadedLogo = await uploadFile('site-media', 'logos', logo); }
      if (shopPhoto) { setMessage('#mediaMsg', 'Uploading shop photo…'); uploadedShopPhoto = await uploadFile('site-media', 'shop', shopPhoto); }
      const oldLogo = state.settings.logo_path || '';
      const oldShopPhoto = state.settings.shop_photo_path || '';
      const update = { id: true };
      if (uploadedLogo || state.removeLogo) update.logo_path = uploadedLogo?.path || null;
      if (uploadedShopPhoto || state.removeShopPhoto) update.shop_photo_path = uploadedShopPhoto?.path || null;
      if (Object.keys(update).length === 1) { setMessage('#mediaMsg', 'Choose a photo to upload or remove.', true); return; }
      const { error } = await db.from('store_settings').upsert(update);
      if (error) throw error;
      if (oldLogo && (uploadedLogo || state.removeLogo)) await removeStorageFiles('site-media', [oldLogo]);
      if (oldShopPhoto && (uploadedShopPhoto || state.removeShopPhoto)) await removeStorageFiles('site-media', [oldShopPhoto]);
      state.removeLogo = false; state.removeShopPhoto = false;
      $('#mediaForm').reset();
      setMessage('#mediaMsg', 'Website photos saved.');
      await loadAll();
    } catch (error) {
      await removeStorageFiles('site-media', [uploadedLogo?.path, uploadedShopPhoto?.path]);
      setMessage('#mediaMsg', error.message || 'Website photos could not be saved.', true);
    }
  };
  const saveSettings = async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const { error } = await db.from('store_settings').upsert({ id: true, ...values });
    setMessage('#settingsMsg', error ? error.message : 'Shop details saved.', Boolean(error));
    if (!error) await loadAll();
  };
  const setReviewStatus = async (id, status) => {
    const { error } = await db.from('reviews').update({ status }).eq('id', id);
    if (error) { setMessage('#loginMsg', error.message, true); return; }
    await loadAll();
  };
  const deleteReview = async id => {
    const review = state.reviews.find(item => item.id === id);
    if (!review || !window.confirm(`Delete the review from “${review.customer_name}”? This cannot be undone.`)) return;
    const { error } = await db.from('reviews').delete().eq('id', id);
    if (error) { setMessage('#loginMsg', error.message, true); return; }
    await loadAll();
  };

  const activateTab = target => {
    document.querySelectorAll('.tab').forEach(button => button.classList.toggle('active', button.dataset.target === target));
    document.querySelectorAll('.panel-section').forEach(section => { section.hidden = section.id !== target; });
  };
  const currentOwner = async () => {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return false;
    const { data, error } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle();
    return !error && data?.role === 'owner';
  };
  const showPanel = async () => {
    $('#login').hidden = true;
    $('#panel').hidden = false;
    resetProductForm(); resetWeeklyForm(); resetOfferForm();
    const loaded = await loadAll();
    if (!loaded) setMessage('#loginMsg', 'The Owner Panel needs the Supabase setup migration before it can load.', true);
  };
  const signIn = async event => {
    event.preventDefault();
    setMessage('#loginMsg', 'Signing in…');
    const { error } = await db.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#password').value });
    if (error) { setMessage('#loginMsg', error.message, true); return; }
    if (!await currentOwner()) {
      await db.auth.signOut();
      setMessage('#loginMsg', 'This account is not an Owner Panel account.', true);
      return;
    }
    await showPanel();
  };
  const bindEvents = () => {
    $('#loginForm').addEventListener('submit', signIn);
    $('#signOut').addEventListener('click', async () => { await db.auth.signOut(); window.location.reload(); });
    document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => activateTab(button.dataset.target)));
    $('#productForm').addEventListener('submit', saveProduct);
    $('#productPhotos').addEventListener('change', renderProductPreviews);
    $('#cancelProductEdit').addEventListener('click', resetProductForm);
    $('#weeklyForm').addEventListener('submit', saveWeekly);
    $('#weeklyPhoto').addEventListener('change', () => { if (state.editingWeekly) state.editingWeekly.removePhoto = true; renderSinglePhotoPreview('#weeklyPhotoPreview', state.editingWeekly, '#weeklyPhoto', 'data-remove-weekly-photo'); });
    $('#cancelWeeklyEdit').addEventListener('click', resetWeeklyForm);
    $('#offerForm').addEventListener('submit', saveOffer);
    $('#offerPhotoInput').addEventListener('change', () => { if (state.editingOffer) state.editingOffer.removePhoto = true; renderSinglePhotoPreview('#offerPhotoPreview', state.editingOffer, '#offerPhotoInput', 'data-remove-offer-photo'); });
    $('#cancelOfferEdit').addEventListener('click', resetOfferForm);
    $('#mediaForm').addEventListener('submit', saveMedia);
    $('#logoFile').addEventListener('change', () => { state.removeLogo = false; renderSettings(); });
    $('#shopPhotoFile').addEventListener('change', () => { state.removeShopPhoto = false; renderSettings(); });
    $('#removeLogo').addEventListener('click', () => { state.removeLogo = true; $('#logoFile').value = ''; renderSettings(); });
    $('#removeShopPhoto').addEventListener('click', () => { state.removeShopPhoto = true; $('#shopPhotoFile').value = ''; renderSettings(); });
    $('#settingsForm').addEventListener('submit', saveSettings);
  };

  if (!db) { setMessage('#loginMsg', 'Supabase configuration is missing.', true); return; }
  bindEvents();
  currentOwner().then(isOwner => { if (isOwner) showPanel(); });
})();
