const fallback = { brandName: 'Anand Adda', heroText: 'Fresh everyday styles, handpicked for your street, your plans and your personality.', offerTitle: 'Your next favourite fit is waiting.', offerText: 'Add your sale, festive offer or new-arrival announcement here.', shopTitle: 'The neighbourhood’s style stop.', shopDescription: 'Anand Adda is a welcoming local clothing shop where you can discover easy, confident fashion in person.', knownFor: 'Fresh local styles', perfectFor: 'Youthful everyday fashion', hours: '10:00 AM – 9:00 PM', address: 'Add full shop address from the owner panel.', phone: '', whatsapp: '', instagram: '@yourshop', mapUrl: 'https://maps.google.com' };
const data = { ...fallback, ...JSON.parse(localStorage.getItem('storeData') || '{}') };
const text = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
text('brandName', data.brandName); text('footerBrand', data.brandName); text('heroText', data.heroText); text('offerTitle', data.offerTitle); text('offerText', data.offerText); text('shopTitle', data.shopTitle); text('shopDescription', data.shopDescription); text('knownFor', data.knownFor); text('perfectFor', data.perfectFor); text('hours', data.hours); text('address', data.address); text('phoneText', data.phone || 'Add phone number'); text('instagramText', data.instagram);
document.getElementById('phoneLink').href = data.phone ? `tel:${data.phone.replace(/\s/g, '')}` : '#contact';
document.getElementById('whatsappLink').href = data.whatsapp ? `https://wa.me/${data.whatsapp.replace(/\D/g, '')}` : '#contact';
document.getElementById('instagramLink').href = data.instagram && data.instagram !== '@yourshop' ? `https://instagram.com/${data.instagram.replace('@','')}` : '#contact';
document.getElementById('mapLink').href = data.mapUrl || fallback.mapUrl;
const menu = document.querySelector('.menu-button'), nav = document.querySelector('.main-nav');
menu.addEventListener('click', () => { const open = nav.classList.toggle('open'); menu.setAttribute('aria-expanded', open); });
nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));

if (window.supabase && window.STORE_SUPABASE_URL) {
  const cloud = window.supabase.createClient(window.STORE_SUPABASE_URL, window.STORE_SUPABASE_PUBLISHABLE_KEY);
  Promise.all([
    cloud.from('products').select('*').eq('is_active', true).order('created_at', { ascending: false }),
    cloud.from('offers').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1),
    cloud.from('store_settings').select('*').eq('id', true).maybeSingle()
  ]).then(([products, offers, settings]) => {
    if (products.data?.length) document.getElementById('productGrid').innerHTML = products.data.map((p, i) => `<article class="product-card"><div class="product-image ${['peach','lime','blue'][i % 3]}">${p.image_urls?.[0] ? `<img src="${p.image_urls[0]}" alt="${p.name}" loading="lazy" style="width:100%;height:100%;object-fit:cover">` : '<span>PHOTO<br>SPACE</span>'}<b>${String(i + 1).padStart(2,'0')}</b></div><div><h3>${p.name}</h3><p>${p.price ? `₹${Number(p.price).toLocaleString('en-IN')}` : p.category || 'Ask in store'}</p></div></article>`).join('');
    if (offers.data?.[0]) { text('offerTitle', offers.data[0].title); text('offerText', offers.data[0].details || ''); }
    if (settings.data) { const s = settings.data; text('brandName', s.shop_name || fallback.brandName); text('footerBrand', s.shop_name || fallback.brandName); text('heroText', s.hero_text || fallback.heroText); text('shopDescription', s.about_text || fallback.shopDescription); text('address', s.address || fallback.address); text('phoneText', s.phone || 'Add phone number'); text('hours', s.opening_hours || fallback.hours); document.getElementById('phoneLink').href = s.phone ? `tel:${s.phone.replace(/\s/g,'')}` : '#contact'; document.getElementById('whatsappLink').href = s.whatsapp ? `https://wa.me/${s.whatsapp.replace(/\D/g,'')}` : '#contact'; document.getElementById('mapLink').href = s.maps_url || 'https://maps.google.com'; }
  });
}
