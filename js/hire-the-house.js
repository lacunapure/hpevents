/* ===== jQuery Marquee (logo band) ===== */
$(function () {
    $('.logo-marquee').marquee({
        duration: 18000,
        gap: 20,
        duplicated: true,
        direction: 'left',
        startVisible: true,
        pauseOnHover: false,
        allowCss3Support: true
    });
});

/* ===== GSAP / ScrollTrigger ===== */
if (window.gsap) {
    gsap.registerPlugin(ScrollTrigger);
}

/* ===== Hero video playback guard ===== */
(function () {
    document.addEventListener('DOMContentLoaded', function () {
        const video = document.querySelector('.video-bg video');
        if (!video) return;

        const ensurePlaying = () => {
            if (video.paused || video.readyState < 2) {
                const playPromise = video.play();
                if (playPromise && typeof playPromise.then === 'function') {
                    playPromise.catch(() => {});
                }
            }
        };

        ['loadeddata', 'canplay', 'playing', 'stalled', 'suspend'].forEach(evt => {
            video.addEventListener(evt, ensurePlaying);
        });

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) ensurePlaying();
        });

        ensurePlaying();
    });
})();

/* ===== Bina sekansı: 104 karelik scroll kontrollü animasyon ===== */
(function () {
    if (!window.gsap || !window.ScrollTrigger) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sequenceImg = document.getElementById('houseSequence');
    const panels = Array.from(document.querySelectorAll('#contentStack .content-panel'));
    const banner = document.getElementById('logoBandTop');
    if (!sequenceImg || !panels.length) return;

    const frameCount = Number(sequenceImg.dataset.frameCount || 104);
    const framePrefix = sequenceImg.dataset.framePrefix || 'ezgif-split/ezgif-frame-';
    const framePad = Number(sequenceImg.dataset.framePad || 3);
    const frameExtension = sequenceImg.dataset.frameExtension || '.jpg';
    const framePath = (index) => `${framePrefix}${String(index + 1).padStart(framePad, '0')}${frameExtension}`;

    let activePanel = -1;
    const animatePanel = (panel) => {
        if (!panel || reduceMotion) return;
        const elements = panel.querySelectorAll('.headline, .pill, .desc, .btn-enquire');
        gsap.killTweensOf(elements);
        gsap.fromTo(elements, { y: 26, opacity: 0 }, {
            y: 0,
            opacity: 1,
            duration: 0.6,
            ease: 'power3.out',
            stagger: 0.08,
            overwrite: 'auto'
        });
    };

    const showPanel = (idx) => {
        if (idx === activePanel) return;
        panels.forEach((panel, i) => panel.classList.toggle('active', i === idx));
        animatePanel(panels[idx]);
        activePanel = idx;
    };

    const cache = new Map();
    const ensureFrame = (idx) => {
        if (idx < 0 || idx >= frameCount) return null;
        if (cache.has(idx)) return cache.get(idx);
        const img = new Image();
        img.decoding = 'async';
        img.src = framePath(idx);
        cache.set(idx, img);
        return img;
    };

    const warmFrames = (idx) => {
        const lookahead = 6;
        for (let offset = 1; offset <= lookahead; offset++) {
            ensureFrame(idx + offset);
            ensureFrame(idx - offset);
        }
    };

    let currentFrame = 0;
    const renderFrame = (idx) => {
        const clamped = Math.max(0, Math.min(frameCount - 1, idx));
        currentFrame = clamped;

        const segmentSize = frameCount / panels.length;
        const panelIdx = Math.min(panels.length - 1, Math.floor(clamped / segmentSize));
        showPanel(panelIdx);

        const img = ensureFrame(clamped);
        if (!img) return;
        if (img.complete) {
            sequenceImg.src = img.src;
        } else {
            const expected = clamped;
            img.onload = () => {
                if (currentFrame === expected) {
                    sequenceImg.src = img.src;
                }
            };
        }
        warmFrames(clamped);
    };

    ensureFrame(0);
    sequenceImg.src = framePath(0);
    showPanel(0);
    warmFrames(0);
    if (reduceMotion) {
        panels[0]?.classList.add('active');
        return;
    }

    let queuedFrame = 0;
    let rafId = 0;

    const travel = () => Math.max(1600, frameCount * 12);
    const sequenceTrigger = ScrollTrigger.create({
        id: 'houseSequence',
        trigger: '#binaSection',
        start: 'top top',
        end: () => '+=' + travel(),
        pin: true,
        scrub: true,
        onUpdate: self => {
            const target = Math.round(self.progress * (frameCount - 1));
            if (target === queuedFrame) return;
            queuedFrame = target;
            if (!rafId) {
                rafId = requestAnimationFrame(() => {
                    rafId = 0;
                    renderFrame(queuedFrame);
                });
            }
        }
    });

    if (banner) {
        const placeholder = document.createElement('div');
        placeholder.className = 'logo-band-placeholder';
        banner.after(placeholder);

        const updatePlaceholder = () => {
            placeholder.style.height = `${banner.offsetHeight}px`;
        };
        updatePlaceholder();

        let pinned = false;
        const pinBanner = () => {
            if (pinned) return;
            pinned = true;
            updatePlaceholder();
            placeholder.style.display = 'block';
            banner.classList.add('logo-band--fixed', 'logo-band--shadow');
            requestAnimationFrame(() => banner.classList.add('is-visible'));
        };

        const unpinBanner = () => {
            if (!pinned) return;
            pinned = false;
            banner.classList.remove('is-visible', 'logo-band--shadow');
            const cleanup = () => {
                banner.classList.remove('logo-band--fixed');
                placeholder.style.display = 'none';
                if (handle) {
                    banner.removeEventListener('transitionend', handle);
                    handle = null;
                }
            };
            const fallback = setTimeout(cleanup, 480);
            let handle = (evt) => {
                if (evt.propertyName === 'transform') {
                    clearTimeout(fallback);
                    cleanup();
                }
            };
            banner.addEventListener('transitionend', handle);
        };

        ScrollTrigger.create({
            trigger: '#binaSection',
            start: 'top top',
            end: () => sequenceTrigger.end,
            onEnter: pinBanner,
            onEnterBack: pinBanner,
            onLeave: () => {
                // Keep banner fixed at top after bina section
                if (!pinned) return;
                banner.classList.add('logo-band--shadow');
                // Don't unpin - stay fixed at top permanently
            },
            onLeaveBack: unpinBanner
        });

        window.addEventListener('resize', updatePlaceholder);
    }

    const idlePreload = () => {
        const loadedCount = cache.size;
        if (loadedCount >= frameCount) return;

        const batchSize = 8;
        for (let i = loadedCount; i < Math.min(frameCount, loadedCount + batchSize); i++) {
            ensureFrame(i);
        }

        if (cache.size < frameCount) {
            if ('requestIdleCallback' in window) {
                requestIdleCallback(idlePreload, { timeout: 300 });
            } else {
                setTimeout(idlePreload, 300);
            }
        }
    };

    if ('requestIdleCallback' in window) {
        requestIdleCallback(idlePreload, { timeout: 300 });
    } else {
        setTimeout(idlePreload, 600);
    }
})();

/* ===== LINED SLIDER: Swiper + metin senkro ===== */
(function () {
    if (!window.Swiper) return;

    // Animate slider section entrance and snap into place
    if (window.gsap && window.ScrollTrigger) {
        const sliderBg = document.querySelector('.slider-bg');
        const bigTexts = document.querySelectorAll('.big');

        if (sliderBg) {
            // Snap section into place when it reaches viewport
            ScrollTrigger.create({
                trigger: sliderBg,
                start: 'top top',
                end: 'bottom bottom',
                snap: {
                    snapTo: 'labelsDirectional',
                    duration: { min: 0.2, max: 0.6 },
                    ease: 'power1.inOut'
                }
            });
        }

        if (bigTexts.length) {
            // Set initial state
            gsap.set(bigTexts, { opacity: 0, y: 30 });

            // Animate in when section comes into view
            gsap.to(bigTexts, {
                opacity: 1,
                y: 0,
                duration: 0.8,
                stagger: 0.2,
                ease: 'power3.out',
                scrollTrigger: {
                    trigger: sliderBg,
                    start: 'top 85%',
                    once: true
                }
            });
        }
    }

    const slidesData = [
        { w1: "boring", w2: "events", w3: "can&nbsp;&nbsp;do", w4: "one", w5: "BRAND",
            desc: "Not another cocktail bar.The house is lived-in, layered, and full of character. Already rented\n" +
                "by brands like NYX, IKEA and Bumble for launches that need something a little different." },
        { w1: "music", w2: "sounds", w3: "better&nbsp;&nbsp;with", w4: "you", w5: "MUSIC",
            desc: "The house is a cultural hub rooted in music and fashion, hosting intimate events with labels\n" +
                "like OVO and icons like Sean Paul and Mike Skinner. With a reinforced chandelier overhead\n" +
                "and a kitchen island as a stage, it’s a raw, unforgettable space for artists and fans to\n" +
                "connect." },
        { w1: "ready", w2: "to", w3: "raise&nbsp;&nbsp;", w4: "the roof?", w5: "PRIVATE",
            desc: "Prefer a low-key vibe with no randoms allowed? Host your own private party at ours. Curate\n" +
                "your dream guest list, then leave the rest to us. Everything from birthdays to corporate\n" +
                "functions. No clean-up. No complaints. Just a home that’s yours for the night." }
    ];

    const el = {
        w1: document.getElementById('w1'),
        w2: document.getElementById('w2'),
        w3: document.getElementById('w3'),
        w4: document.getElementById('w4'),
        w5: document.getElementById('w5'),
        desc: document.getElementById('desc')
    };

    const renderByIndex = (i) => {
        const s = slidesData[i % slidesData.length];
        if (!s) return;

        // Animate text elements with subtle fade and slide
        const elements = [el.w1, el.w2, el.w3, el.w4, el.w5, el.desc].filter(Boolean);

        if (window.gsap) {
            gsap.fromTo(elements,
                { opacity: 0, y: 10 },
                {
                    opacity: 1,
                    y: 0,
                    duration: 0.5,
                    ease: 'power2.out',
                    stagger: 0.05
                }
            );
        }

        if (el.w1) el.w1.innerHTML = s.w1;
        if (el.w2) el.w2.innerHTML = s.w2;
        if (el.w3) el.w3.innerHTML = s.w3;
        if (el.w4) el.w4.innerHTML = s.w4;
        if (el.desc) el.desc.textContent = s.desc;
        if (el.w5) el.w5.textContent = s.w5;
    };

    const visualSwiper = new Swiper('#visualSwiper', {
        loop: true,
        speed: 650,
        slidesPerView: 1,
        centeredSlides: false,
        spaceBetween: 0,
        allowTouchMove: true,
        effect: 'slide',
        on: {
            slideChangeTransitionStart: function() {
                if (window.gsap) {
                    const activeSlide = this.slides[this.activeIndex];
                    const img = activeSlide?.querySelector('img');
                    if (img) {
                        gsap.fromTo(img,
                            { scale: 0.95, opacity: 0.7 },
                            { scale: 1, opacity: 1, duration: 0.65, ease: 'power2.out' }
                        );
                    }
                }
            }
        }
    });

    renderByIndex(visualSwiper.realIndex || 0);

    visualSwiper.on('realIndexChange', () => renderByIndex(visualSwiper.realIndex));

    document.getElementById('nextBtn')?.addEventListener('click', () => visualSwiper.slideNext());
    document.getElementById('prevBtn')?.addEventListener('click', () => visualSwiper.slidePrev());

    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') visualSwiper.slideNext();
        if (e.key === 'ArrowLeft') visualSwiper.slidePrev();
    });
})();

/* ===== STEEL / FORM: keys.png section'a gelince soldan içeri kay ===== */
(function () {
    const section = document.getElementById('steelSection');
    const img = document.querySelector('.keys-img');

    if (!section || !img) return;

    const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                img.classList.add('is-in');
                io.unobserve(section);
            }
        });
    }, { threshold: 0.2, rootMargin: '0px' });

    io.observe(section);
})();





(function () {
  const el = document.getElementById('eventDate');
  if (!el) return;

  // "Bugün"ü yerel zamana göre YYYY-MM-DD üret
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  // Geçmişi kapat
  el.min = todayStr;

  // Kullanıcı geçmiş tarih seçerse native doğrulama mesajı göster
  el.addEventListener('input', function () {
    if (this.value && this.value < todayStr) {
      this.setCustomValidity('Please choose today or a future date.');
    } else {
      this.setCustomValidity('');
    }
  });
})();


/* ===== RATIO SLIDER: Desktop scroll-trigger, Mobile swipe (multi-instance) ===== */
(function(){
    if (!window.gsap || !window.ScrollTrigger) return;

    const mq = window.matchMedia('(max-width: 991px)');
    const sections = Array.from(document.querySelectorAll('.ratio-slider-section'));
    const triggers = new WeakMap(); // section -> ScrollTrigger

    function killTrigger(section){
        const st = triggers.get(section);
        if (st){ st.kill(); triggers.delete(section); }
        const track = section.querySelector('.ratio-track');
        if (track) gsap.set(track, { clearProps: 'transform' });
    }

    function buildFor(section){
        const stage = section.querySelector('.ratio-stage');
        const track = section.querySelector('.ratio-track');
        if (!stage || !track) return;

        // önce temizle
        killTrigger(section);

        if (mq.matches){
            // Mobil/tablet: yalnızca CSS swipe; ScrollTrigger kurma
            return;
        }

        const stageW = stage.clientWidth;
        const trackW = track.scrollWidth;
        const cs = getComputedStyle(track);
        const peek = parseFloat(cs.paddingLeft) || 80;
        const startX = -peek;
        const travel = Math.max(0, trackW - stageW + peek);

        const anim = gsap.fromTo(track, { x: startX }, { x: -travel, ease: 'none' });

        // Text slide animation
        const textSlides = section.querySelectorAll('.text-slide');
        const textCount = textSlides.length;

        const st = ScrollTrigger.create({
            trigger: section,
            start: 'top top',
            end: '+=' + Math.max(travel, 1),
            pin: true,
            scrub: true,
            animation: anim,
            onUpdate: (self) => {
                if (textCount > 0) {
                    const progress = self.progress;
                    const currentIndex = Math.min(Math.floor(progress * textCount), textCount - 1);
                    textSlides.forEach((slide, idx) => {
                        if (idx === currentIndex) {
                            slide.classList.add('active');
                        } else {
                            slide.classList.remove('active');
                        }
                    });
                }
            }
        });

        triggers.set(section, st);
    }

    function rebuildAll(){
        sections.forEach(buildFor);
    }

    window.addEventListener('load', rebuildAll);
    window.addEventListener('resize', () => {
        clearTimeout(window.__ratio_multi_reflow);
        window.__ratio_multi_reflow = setTimeout(rebuildAll, 120);
    });
})();


/* === Enquiry form: per-field show/hide + helpers (no grouped blocks) === */
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    const form = document.getElementById('enquireForm');
    if (!form) return;

    const eventType = form.querySelector('#eventType');
    const fields = Array.from(form.querySelectorAll('.field[data-showfor]'));

    function setRequired(container, on){
      const control = container.querySelector('input, select, textarea');
      if (!control) return;
      if (on && container.dataset.required === 'true') control.setAttribute('required','required');
      else control.removeAttribute('required');
    }

    function clearValues(container){
      container.querySelectorAll('input, textarea, select').forEach(el => {
        if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
        else el.value = '';
      });
    }

    function toggleByType(type){
      fields.forEach(f => {
        const allow = (f.dataset.showfor || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .includes(type);
        f.style.display = allow ? '' : 'none';
        setRequired(f, allow);
        if (!allow) clearValues(f);
      });
    }

    if (eventType){
      eventType.addEventListener('change', e => toggleByType(e.target.value));
      toggleByType(eventType.value || '');
    }

    /* Guests: disallow negatives & exponent */
    const guests = form.querySelector('#guests');
    if (guests){
      guests.min = '0'; guests.step = '1';
      guests.addEventListener('keydown', e => {
        if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault();
      });
      guests.addEventListener('input', () => {
        const n = parseInt(guests.value, 10);
        if (!Number.isFinite(n) || n < 0) guests.value = '';
      });
    }

    /* UK phone mask/validator for .js-uk-phone — try Inputmask first, fallback to custom */
    const phones = Array.from(form.querySelectorAll('.js-uk-phone'));

    function validateUKPhone(input){
      const digits = (input.value || '').replace(/\D/g,'');
      const ok = (digits.startsWith('44') && digits.length >= 11 && digits.length <= 12)
              || (digits.startsWith('0')  && digits.length >= 10 && digits.length <= 11);
      input.setCustomValidity(ok || digits.length === 0 ? '' : 'Please enter a valid UK phone number.');
    }

    (function applyPhoneMask(){
      if (!phones.length) return;

      if (window.Inputmask){
        // Use alternator masks for +44 and 0-leading formats
        phones.forEach(inp => {
          Inputmask({
            mask: ["+44 9999 999999[9]", "0 9999 999999[9]"],
            showMaskOnHover: false,
            showMaskOnFocus: true,
            greedy: false,
            placeholder: ' '
          }).mask(inp);
          inp.addEventListener('blur', ()=>validateUKPhone(inp));
        });
        return;
      }

      // Fallback: lightweight formatter
      function formatUK(val){
        let v = (val || '').replace(/[^\d+]/g, '');
        if (v.startsWith('00')) v = '+' + v.slice(2);
        if (v.startsWith('+44')){
          const d = v.replace(/\D/g,'').slice(2);
          const g1 = d.slice(0,4);
          const g2 = d.slice(4,10);
          return '+44 ' + g1 + (g2 ? ' ' + g2 : '');
        }
        if (v.startsWith('0')){
          const d = v.replace(/\D/g,'');
          const g1 = d.slice(0,5);
          const g2 = d.slice(5,11);
          return g1 + (g2 ? ' ' + g2 : '');
        }
        return v;
      }

      phones.forEach(inp => {
        inp.addEventListener('input', () => {
          const formatted = formatUK(inp.value);
          inp.value = formatted;
        });
        inp.addEventListener('blur', ()=>validateUKPhone(inp));
      });
    })();

    /* Budget: keep numerals only (non-negative), formatting handled visually by £ prefix */
    const budget = form.querySelector('#budget');
    if (budget){
      budget.addEventListener('input', () => {
        budget.value = budget.value.replace(/[^\d]/g,'');
      });
    }

      /* About: 500–800 counter */
      const about = form.querySelector('#about');
      const aboutCount = document.getElementById('aboutCount');
      if (about && aboutCount){
          const min = 1, max = 800;
          const update = () => {
              const len = about.value.length;
              aboutCount.textContent = String(len);
              if (len && (len < min || len > max)) {
                  about.setCustomValidity(`Please use max ${max} characters.`);
              } else {
                  about.setCustomValidity('');
              }
          };
          about.addEventListener('input', update);
          update();
      }


      /* About: 500–800 counter */
      const reason = form.querySelector('#reason');
      const reasonCount = document.getElementById('reasonCount');
      if (reason && reasonCount){
          const min = 1, max = 800;
          const update = () => {
              const len = reason.value.length;
              reasonCount.textContent = String(len);
              if (len && (len < min || len > max)) {
                  reason.setCustomValidity(`Please use max ${max} characters.`);
              } else {
                  reason.setCustomValidity('');
              }
          };
          reason.addEventListener('input', update);
          update();
      }


  });
})();
